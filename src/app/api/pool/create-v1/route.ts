import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { USDC_MINT, USDC_DEVNET_MINT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { privateKey, tokenMint, tokenAmount, usdcAmount, network } = body;

    if (!privateKey || !tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, tokenMint' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const creator = keypairFromPrivateKey(privateKey);
    const tokenMintPk = new PublicKey(tokenMint);
    const usdcMint = network === 'mainnet-beta' ? USDC_MINT : USDC_DEVNET_MINT;

    // Dynamic import to avoid ESM build errors
    const { default: AmmImpl } = await import('@meteora-ag/dynamic-amm-sdk');

    const TARGET_FEE_BPS = 400; // 4% trade fee to match V2 pool

    // Token amounts in raw units (6 decimals for both token and USDC)
    const tokenAmountBN = new BN(Math.floor((tokenAmount || 2_000_000) * 1e6));
    const usdcAmountBN = new BN(Math.floor((usdcAmount || 200) * 1e6));

    // Try config-based creation first (supports lock+stake options)
    let transactions: any[] | null = null;

    const configs = await AmmImpl.getFeeConfigurations(connection as any);
    if (configs && configs.length > 0) {
      // Find config with 400 bps (4%) trade fee
      const config400 = configs.find((c: any) => c.tradeFeeBps.toNumber() === TARGET_FEE_BPS);
      const selectedConfig = config400 || configs[0];
      console.log('Using pool config:', selectedConfig.publicKey.toBase58(), 'fee:', selectedConfig.tradeFeeBps.toString(), 'bps');

      transactions = await AmmImpl.createPermissionlessConstantProductPoolWithConfig2(
        connection as any,
        creator.publicKey,
        tokenMintPk,
        usdcMint,
        tokenAmountBN,
        usdcAmountBN,
        selectedConfig.publicKey,
      );
    }

    // Fallback: use createPermissionlessPool with explicit tradeFeeBps
    if (!transactions || transactions.length === 0) {
      console.log('Fallback: createPermissionlessPool with', TARGET_FEE_BPS, 'bps');
      const tx = await AmmImpl.createPermissionlessPool(
        connection as any,
        creator.publicKey,
        tokenMintPk,
        usdcMint,
        tokenAmountBN,
        usdcAmountBN,
        false, // not stable
        new BN(TARGET_FEE_BPS),
      );
      transactions = [tx];
    }

    // Sign and send all transactions
    let lastSignature = '';
    for (const tx of transactions) {
      tx.feePayer = creator.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.sign(creator);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(
        { signature: sig, ...latestBlockhash },
        'confirmed'
      );
      lastSignature = sig;
      console.log('V1 pool tx confirmed:', sig);
    }

    // Find pool address from transaction accounts
    const DAMM_V1_PROGRAM = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB';
    let poolAddr = '';

    // Parse the first transaction to find the pool account owned by DAMM v1
    const txInfo = await connection.getTransaction(lastSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txInfo?.transaction?.message) {
      const keys = txInfo.transaction.message.getAccountKeys();
      for (let i = 0; i < Math.min(keys.length, 15); i++) {
        const key = keys.get(i);
        if (key) {
          try {
            const info = await connection.getAccountInfo(key);
            if (info && info.owner.toBase58() === DAMM_V1_PROGRAM) {
              poolAddr = key.toBase58();
              break;
            }
          } catch { /* skip */ }
        }
      }
    }

    const explorerBase = network === 'devnet'
      ? 'https://solscan.io/tx/'
      : 'https://solscan.io/tx/';
    const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: poolAddr,
        signature: lastSignature,
        explorerUrl: `${explorerBase}${lastSignature}${clusterParam}`,
      },
    });
  } catch (error) {
    console.error('V1 pool creation error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
