import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      walletPrivateKey,
      tokenMint,
      tokenProgramId,
      network,
    } = body as {
      walletPrivateKey: string;
      tokenMint: string;
      tokenProgramId?: string;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!walletPrivateKey || !tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: walletPrivateKey, tokenMint' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    const { closeTokenAccount } = await import('@/lib/sell');
    const result = await closeTokenAccount(
      connection,
      walletPrivateKey,
      tokenMint,
      tokenProgramId
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Close ATA error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
