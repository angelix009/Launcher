import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { poolAddress, network } = await request.json();

    if (!poolAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing poolAddress' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const { getPoolInfo } = await import('@/lib/pool-manage');
    const info = await getPoolInfo(connection, poolAddress);

    return NextResponse.json({ success: true, data: info });
  } catch (err) {
    console.error('Pool info error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
