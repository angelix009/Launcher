import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { getPoolInfo, isRaydiumPool, getQuoteMint } from '@/lib/pool-utils';
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
        { success: false, error: 'Missing required fields: poolAddress, tokenMint, wallets, percentage' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const poolInfo = await getPoolInfo(connection, poolAddress);

    if (isRaydiumPool(poolInfo.type)) {
      const { sellViaRaydium } = await import('@/lib/sell');
      const results = [];
      const quoteMint = getQuoteMint(poolInfo, tokenMint);
      for (const wallet of wallets) {
        const tokenAmount = wallet.tokenBalance * (percentage / 100);
        if (tokenAmount <= 0) continue;
        const result = await sellViaRaydium(connection, poolAddress, poolInfo.type, tokenMint, quoteMint, wallet, tokenAmount, slippage ?? 100, decimals ?? 6);
        results.push(result);
      }
      return NextResponse.json({ success: true, data: results });
    } else {
      const { sellTokensFromWallets } = await import('@/lib/sell');
      const results = await sellTokensFromWallets(connection, poolAddress, tokenMint, wallets, percentage, slippage ?? 100, decimals ?? 6);
      return NextResponse.json({ success: true, data: results });
    }
  } catch (err) {
    console.error('Sell tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
