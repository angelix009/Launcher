import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { fundWalletsForATA } from '@/lib/wallets';
import type { WalletEntry } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      privateKey,
      wallets,
      amountPerWallet,
      network,
    } = body as {
      privateKey: string;
      wallets: WalletEntry[];
      amountPerWallet?: number;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!privateKey || !wallets || !Array.isArray(wallets)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, wallets' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const funder = keypairFromPrivateKey(privateKey);

    const signatures = await fundWalletsForATA(
      connection,
      funder,
      wallets,
      amountPerWallet
    );

    return NextResponse.json({ success: true, data: signatures });
  } catch (err) {
    console.error('Fund ATA error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
