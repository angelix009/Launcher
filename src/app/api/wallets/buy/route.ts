import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { getPoolInfo, isRaydiumPool, isDlmmPool, getQuoteMint } from '@/lib/pool-utils';
import type { WalletEntry } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
    const poolInfo = await getPoolInfo(connection, poolAddress);

    let result;
    if (isRaydiumPool(poolInfo.type)) {
      const { buyViaRaydium } = await import('@/lib/sell');
      const quoteMint = getQuoteMint(poolInfo, tokenMint);
      result = await buyViaRaydium(connection, poolAddress, poolInfo.type, tokenMint, quoteMint, wallet, quoteAmount, slippage ?? 100, decimals ?? 6);
    } else if (isDlmmPool(poolInfo.type)) {
      const { buyViaDlmm } = await import('@/lib/sell');
      const quoteMint = getQuoteMint(poolInfo, tokenMint);
      result = await buyViaDlmm(connection, poolAddress, tokenMint, quoteMint, wallet, quoteAmount, slippage ?? 100, decimals ?? 6);
    } else {
      const { buyTokensForWallet } = await import('@/lib/sell');
      result = await buyTokensForWallet(connection, poolAddress, tokenMint, wallet, quoteAmount, slippage ?? 100, decimals ?? 6);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Buy tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
