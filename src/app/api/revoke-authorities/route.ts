import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { revokeAuthorities } from '@/lib/token';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      privateKey,
      tokenMint,
      revokeMint,
      revokeUpdate,
      network,
    } = body as {
      privateKey: string;
      tokenMint: string;
      revokeMint: boolean;
      revokeUpdate: boolean;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!privateKey || !tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, tokenMint' },
        { status: 400 }
      );
    }

    if (!revokeMint && !revokeUpdate) {
      return NextResponse.json(
        { success: false, error: 'At least one authority must be selected for revocation' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const authority = keypairFromPrivateKey(privateKey);
    const mint = new PublicKey(tokenMint);

    // Auto-detect if token is SPL standard or Token-2022
    const accountInfo = await connection.getAccountInfo(mint);
    const isSPL = accountInfo?.owner.equals(TOKEN_PROGRAM_ID) ?? false;

    const signature = await revokeAuthorities(
      connection,
      authority,
      mint,
      revokeMint ?? true,
      revokeUpdate ?? false,
      isSPL
    );

    return NextResponse.json({
      success: true,
      data: { signature },
    });
  } catch (err) {
    console.error('Revoke authorities error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
