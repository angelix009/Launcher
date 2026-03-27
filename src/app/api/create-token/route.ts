import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { createToken2022 } from '@/lib/token';
import type { TokenConfig } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      privateKey,
      name,
      symbol,
      decimals,
      totalSupply,
      poolAmount,
      description,
      imageUrl,
      revokeFreeze,
      network,
      vanityPrefix,
      vanitySuffix,
    } = body;

    if (!privateKey || !name || !symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, name, symbol' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const payer = keypairFromPrivateKey(privateKey);

    const config: TokenConfig = {
      name,
      symbol,
      decimals: decimals ?? 6,
      totalSupply: totalSupply ?? 1_000_000_000,
      poolAmount: poolAmount ?? 50_000_000,
      description: description || '',
      imageUrl: imageUrl || '',
      revokeFreeze: revokeFreeze ?? true,
      network: network || 'devnet',
      vanityPrefix: vanityPrefix || '',
      vanitySuffix: vanitySuffix || '',
    };

    const result = await createToken2022(connection, payer, config);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Create token error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
