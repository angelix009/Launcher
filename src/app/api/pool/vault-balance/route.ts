import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';

export const dynamic = 'force-dynamic';

// Module-level cache: pool address → { vaultAddress, quoteDecimals, quoteSymbol }
const vaultCache = new Map<string, {
  vaultAddress: PublicKey;
  quoteDecimals: number;
  quoteSymbol: string;
}>();

const USDC_MINTS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
];

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
    const cacheKey = `${poolAddress}-${network || 'devnet'}`;

    let cached = vaultCache.get(cacheKey);
    if (!cached) {
      // Fetch pool state once to get vault address
      const { CpAmm } = await import('@meteora-ag/cp-amm-sdk');
      const cpAmm = new CpAmm(connection as any);
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress));

      const tokenBMintStr = poolState.tokenBMint.toBase58();
      let quoteDecimals = 9;
      let quoteSymbol = 'SOL';
      if (USDC_MINTS.includes(tokenBMintStr)) {
        quoteDecimals = 6;
        quoteSymbol = 'USDC';
      }

      cached = {
        vaultAddress: poolState.tokenBVault,
        quoteDecimals,
        quoteSymbol,
      };
      vaultCache.set(cacheKey, cached);
    }

    // Single account fetch — fast
    const accountInfo = await connection.getAccountInfo(cached.vaultAddress);
    if (!accountInfo) {
      return NextResponse.json(
        { success: false, error: 'Vault account not found' },
        { status: 404 }
      );
    }

    // Parse SPL token account data to get the amount (offset 64, 8 bytes LE u64)
    // Works for both standard SPL and Token 2022 accounts
    const data = accountInfo.data;
    let rawBalance: string;
    if (data.length >= 72) {
      // Amount is at offset 64 (8 bytes, little-endian u64)
      const lo = data.readBigUInt64LE(64);
      rawBalance = lo.toString();
    } else {
      rawBalance = '0';
    }

    return NextResponse.json({
      success: true,
      data: {
        rawBalance,
        quoteDecimals: cached.quoteDecimals,
        quoteSymbol: cached.quoteSymbol,
      },
    });
  } catch (err) {
    console.error('Vault balance error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
