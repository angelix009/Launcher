import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { privateKey, poolAddress, network } = body;

    if (!privateKey || !poolAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, poolAddress' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const creator = keypairFromPrivateKey(privateKey);
    const poolPk = new PublicKey(poolAddress);

    // Dynamic import
    const { default: AmmImpl } = await import('@meteora-ag/dynamic-amm-sdk');

    // Load the pool
    const pool = await AmmImpl.create(connection as any, poolPk);

    // Get user's LP balance
    const lpMint = pool.poolState.lpMint;
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    const lpAta = await getAssociatedTokenAddress(lpMint, creator.publicKey);

    const lpAccountInfo = await connection.getTokenAccountBalance(lpAta);
    const lpBalance = new BN(lpAccountInfo.value.amount);

    if (lpBalance.isZero()) {
      return NextResponse.json(
        { success: false, error: 'No LP tokens found to lock' },
        { status: 400 }
      );
    }

    console.log('Locking LP amount:', lpBalance.toString());

    // Lock all LP tokens
    const lockTx = await pool.lockLiquidity(
      creator.publicKey,
      lpBalance,
    );

    lockTx.feePayer = creator.publicKey;
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    lockTx.recentBlockhash = latestBlockhash.blockhash;
    lockTx.sign(creator);

    const signature = await connection.sendRawTransaction(lockTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(
      { signature, ...latestBlockhash },
      'confirmed'
    );

    console.log('LP locked:', signature);

    return NextResponse.json({
      success: true,
      data: {
        signature,
        lpLocked: lpBalance.toString(),
      },
    });
  } catch (error) {
    console.error('LP lock error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
