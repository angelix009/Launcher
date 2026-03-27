import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // allow up to 2 min for large batches

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      items,
      network,
    } = body as {
      items: Array<{
        walletId: string;
        fromPrivateKey: string;
        toPublicKey: string;
        amount: number;
        tokenMint?: string;
        decimals?: number;
        assetType: 'sol' | 'usdc' | 'token';
      }>;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or empty items array' },
        { status: 400 }
      );
    }

    if (items.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Max 200 items per batch' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    const { batchSendFromWallets } = await import('@/lib/sell');
    const results = await batchSendFromWallets(connection, items, network || 'mainnet-beta');

    const confirmedCount = results.filter(r => r.status === 'confirmed').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const timeoutCount = results.filter(r => r.status === 'timeout').length;

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: { total: items.length, confirmed: confirmedCount, failed: failedCount, timeout: timeoutCount },
      },
    });
  } catch (err) {
    console.error('Batch send error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
