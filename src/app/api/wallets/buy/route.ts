import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import type { WalletEntry } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      poolAddress,
      tokenMint,
      wallet,
      quoteAmount,
      slippage,
      decimals,
      network,
    } = body as {
      poolAddress: string;
      tokenMint: string;
      wallet: WalletEntry;
      quoteAmount: number;
      slippage: number;
      decimals: number;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!poolAddress || !tokenMint || !wallet || quoteAmount == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: poolAddress, tokenMint, wallet, quoteAmount' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    const { buyTokensForWallet } = await import('@/lib/sell');
    const result = await buyTokensForWallet(
      connection,
      poolAddress,
      tokenMint,
      wallet,
      quoteAmount,
      slippage ?? 100,
      decimals ?? 6
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Buy tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
