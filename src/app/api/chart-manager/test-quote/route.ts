import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { poolAddress, tokenMint, amount, decimals, direction, network } = await request.json();
    const connection = getConnection(network || 'mainnet-beta');

    const { CpAmm } = await import('@meteora-ag/cp-amm-sdk');
    const cpAmm = new CpAmm(connection as any);
    const pool = new PublicKey(poolAddress);
    const mint = new PublicKey(tokenMint);

    const poolState = await cpAmm.fetchPoolState(pool);

    const tokenAMint = poolState.tokenAMint.toBase58();
    const tokenBMint = poolState.tokenBMint.toBase58();

    const USDC_MINTS = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'];
    const tokenBDecimals = USDC_MINTS.includes(tokenBMint) ? 6 : 9;

    const currentSlot = await connection.getSlot();
    let currentTime = Math.floor(Date.now() / 1000);
    try {
      const bt = await connection.getBlockTime(currentSlot - 2);
      if (bt) currentTime = bt;
    } catch {}

    const tokenADec = decimals || 6;
    const isSell = direction !== 'buy';

    const inputTokenMint = isSell ? poolState.tokenAMint : poolState.tokenBMint;
    const inputDecimals = isSell ? tokenADec : tokenBDecimals;
    const rawAmount = new BN(Math.floor((amount || 1000) * 10 ** inputDecimals).toString());

    const results: any[] = [];

    // Test multiple amounts
    const testAmounts = [rawAmount];
    const fractions = [0.5, 0.25, 0.1, 0.01, 0.001];
    for (const f of fractions) {
      const frac = new BN(Math.floor((amount || 1000) * f * 10 ** inputDecimals).toString());
      if (frac.gt(new BN(0))) testAmounts.push(frac);
    }

    // Also test tiny amounts
    testAmounts.push(new BN(Math.floor(10 * 10 ** inputDecimals).toString())); // 10 tokens
    testAmounts.push(new BN(Math.floor(1 * 10 ** inputDecimals).toString())); // 1 token

    for (const testAmt of testAmounts) {
      const humanAmt = Number(testAmt.toString()) / 10 ** inputDecimals;
      try {
        const quote = cpAmm.getQuote({
          inAmount: testAmt,
          inputTokenMint,
          slippage: 0.5,
          poolState,
          currentTime,
          currentSlot,
          tokenADecimal: tokenADec,
          tokenBDecimal: tokenBDecimals,
        });
        results.push({
          amount: humanAmt,
          rawAmount: testAmt.toString(),
          swapOut: Number(quote.swapOutAmount.toString()) / 10 ** (isSell ? tokenBDecimals : tokenADec),
          minOut: Number(quote.minSwapOutAmount.toString()) / 10 ** (isSell ? tokenBDecimals : tokenADec),
          status: 'ok',
        });
      } catch (e) {
        results.push({
          amount: humanAmt,
          rawAmount: testAmt.toString(),
          error: (e as Error).message,
          status: 'failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      pool: {
        tokenAMint: tokenAMint.slice(0, 12),
        tokenBMint: tokenBMint.slice(0, 12),
        tokenADec,
        tokenBDecimals,
        currentSlot,
        currentTime,
      },
      direction: isSell ? 'sell (A→B)' : 'buy (B→A)',
      results,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
