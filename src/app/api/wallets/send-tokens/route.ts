import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      fromPrivateKey,
      toPublicKey,
      tokenMint,
      amount,
      decimals,
      network,
      assetType,
    } = body as {
      fromPrivateKey: string;
      toPublicKey: string;
      tokenMint?: string;
      amount: number;
      decimals?: number;
      network: 'devnet' | 'mainnet-beta';
      assetType?: 'token' | 'sol' | 'usdc';
    };

    if (!fromPrivateKey || !toPublicKey || amount == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fromPrivateKey, toPublicKey, amount' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const type = assetType || 'token';

    let signature: string;

    if (type === 'sol') {
      const { sendSolBetweenWallets } = await import('@/lib/sell');
      signature = await sendSolBetweenWallets(
        connection,
        fromPrivateKey,
        toPublicKey,
        amount
      );
    } else if (type === 'usdc') {
      const { sendUsdcBetweenWallets } = await import('@/lib/sell');
      signature = await sendUsdcBetweenWallets(
        connection,
        fromPrivateKey,
        toPublicKey,
        amount,
        network || 'mainnet-beta'
      );
    } else {
      if (!tokenMint) {
        return NextResponse.json(
          { success: false, error: 'tokenMint is required for token transfers' },
          { status: 400 }
        );
      }
      const { sendTokensBetweenWallets } = await import('@/lib/sell');
      signature = await sendTokensBetweenWallets(
        connection,
        fromPrivateKey,
        toPublicKey,
        tokenMint,
        amount,
        decimals ?? 6
      );
    }

    return NextResponse.json({ success: true, data: { signature } });
  } catch (err) {
    console.error('Send tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
