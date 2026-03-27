import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { getWalletBalances } from '@/lib/wallets';
import type { WalletEntry } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      wallets,
      tokenMint,
      network,
    } = body as {
      wallets: WalletEntry[];
      tokenMint?: string;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!wallets || !Array.isArray(wallets)) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: wallets' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    const updatedWallets = await getWalletBalances(
      connection,
      wallets,
      tokenMint,
      network || 'devnet'
    );

    return NextResponse.json({ success: true, data: updatedWallets });
  } catch (err) {
    console.error('Get balances error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
