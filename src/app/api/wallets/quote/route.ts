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
      wallets,
      percentage,
      slippage,
      decimals,
      network,
    } = body as {
      poolAddress: string;
      tokenMint: string;
      wallets: WalletEntry[];
      percentage: number;
      slippage: number;
      decimals: number;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!poolAddress || !tokenMint || !wallets || percentage == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    const { getQuoteForWallets } = await import('@/lib/sell');
    const results = await getQuoteForWallets(
      connection,
      poolAddress,
      tokenMint,
      wallets,
      percentage,
      slippage ?? 100,
      decimals ?? 6
    );

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('Quote error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
