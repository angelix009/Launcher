import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import type { PoolConfig } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();

    const {
      privateKey,
      tokenMint,
      quoteMint,
      initPrice,
      maxPrice,
      maxBaseFeeBps,
      minBaseFeeBps,
      feeSchedulerMode,
      numberOfPeriod,
      totalDuration,
      useDynamicFee,
      collectFeeMode,
      initialTokenAmount,
      initialQuoteAmount,
      activationType,
      activationDelay,
      hasAlphaVault,
      network,
    } = body;

    if (!privateKey || !tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, tokenMint' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const creator = keypairFromPrivateKey(privateKey);

    const config: PoolConfig = {
      tokenMint,
      quoteMint: quoteMint || 'SOL',
      initPrice: initPrice ?? 0.00001,
      maxPrice: maxPrice ?? null,
      maxBaseFeeBps: maxBaseFeeBps ?? 400,
      minBaseFeeBps: minBaseFeeBps ?? 400,
      feeSchedulerMode: feeSchedulerMode ?? 0,
      numberOfPeriod: numberOfPeriod ?? 0,
      totalDuration: totalDuration ?? 0,
      useDynamicFee: useDynamicFee ?? true,
      collectFeeMode: collectFeeMode ?? 1,
      initialTokenAmount: initialTokenAmount ?? 0,
      initialQuoteAmount: initialQuoteAmount ?? 0,
      activationType: activationType || 'timestamp',
      activationDelay: activationDelay ?? 0,
      hasAlphaVault: hasAlphaVault ?? false,
      network: network || 'devnet',
      configAddress: body.configAddress || undefined,
    };

    console.log('[Pool API] Config:', JSON.stringify({
      hasAlphaVault: config.hasAlphaVault,
      activationType: config.activationType,
      activationDelay: config.activationDelay,
      initPrice: config.initPrice,
      initialTokenAmount: config.initialTokenAmount,
      initialQuoteAmount: config.initialQuoteAmount,
    }));

    // Dynamic import to avoid ESM directory import issue at build time
    const { createDammV2Pool } = await import('@/lib/pool');
    const result = await createDammV2Pool(connection, creator, config);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Create pool error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message, debug: { hasAlphaVault: body?.hasAlphaVault, activationDelay: body?.activationDelay, activationType: body?.activationType } },
      { status: 500 }
    );
  }
}
