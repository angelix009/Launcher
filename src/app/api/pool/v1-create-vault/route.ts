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

    // Dynamic imports
    const { default: StakeForFee, deriveFeeVault } = await import('@meteora-ag/m3m3');
    const { default: AmmImpl } = await import('@meteora-ag/dynamic-amm-sdk');

    // Load pool to get mints
    const pool = await AmmImpl.create(connection as any, poolPk);
    const stakeMint = pool.poolState.tokenAMint;
    const quoteMint = pool.poolState.tokenBMint;

    // Create the fee vault (Stake2Earn)
    const vaultTx = await StakeForFee.createFeeVaultWithParams(
      connection as any,
      poolPk,
      creator.publicKey,
      stakeMint,
      quoteMint,
      {
        topListLength: 100, // min 50, max 1000 per Meteora docs
        secondsToFullUnlock: new BN(86400), // 1 day (24h) to fully unlock
        unstakeLockDuration: new BN(25200), // 7h cooldown per Meteora docs
        startFeeDistributeTimestamp: null, // start immediately
        padding: new Array(64).fill(0),
      },
    );

    vaultTx.feePayer = creator.publicKey;
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    vaultTx.recentBlockhash = latestBlockhash.blockhash;
    vaultTx.sign(creator);

    const signature = await connection.sendRawTransaction(vaultTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(
      { signature, ...latestBlockhash },
      'confirmed'
    );

    console.log('Stake2Earn vault created:', signature);

    // Derive vault address
    let vaultAddr = '';
    try {
      const STAKE_FOR_FEE_PROGRAM = new PublicKey('FEESngU3neckdwib9X3KWqdL7Mjmqk9XNp3uh5JbP4KP');
      const feeVaultPda = deriveFeeVault(poolPk, STAKE_FOR_FEE_PROGRAM);
      vaultAddr = feeVaultPda.toBase58();
    } catch {
      vaultAddr = 'Check transaction for vault address';
    }

    return NextResponse.json({
      success: true,
      data: {
        vaultAddress: vaultAddr,
        signature,
      },
    });
  } catch (error) {
    console.error('Vault creation error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
