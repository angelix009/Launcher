import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { poolAddress, userPublicKey, network } = await request.json();

    if (!poolAddress || !userPublicKey) {
      return NextResponse.json(
        { success: false, error: 'Missing poolAddress or userPublicKey' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const { getUserPositions } = await import('@/lib/pool-manage');
    const positions = await getUserPositions(connection, poolAddress, userPublicKey);

    return NextResponse.json({ success: true, data: positions });
  } catch (err) {
    console.error('Pool positions error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
