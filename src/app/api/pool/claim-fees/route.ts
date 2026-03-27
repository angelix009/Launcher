import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const {
      privateKey,
      poolAddress,
      positionAddress,
      positionNftAccount,
      network,
    } = await request.json();

    if (!privateKey || !poolAddress || !positionAddress || !positionNftAccount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const { claimPositionFees } = await import('@/lib/pool-manage');
    const result = await claimPositionFees(
      connection,
      privateKey,
      poolAddress,
      positionAddress,
      positionNftAccount
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Pool claim fees error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
