import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getMint,
} from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINTS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // mainnet
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet
];

interface PoolSummary {
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenBSymbol: string;
  tokenAVaultBalance: number;
  tokenBVaultBalance: number;
}

export async function POST(request: Request) {
  try {
    const { tokenMint, network } = await request.json();

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Missing tokenMint' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');

    // Dynamic import to avoid ESM build issues
    const { CpAmm } = await import('@meteora-ag/cp-amm-sdk');
    const cpAmm = new CpAmm(connection as any);

    const mint = new PublicKey(tokenMint);
    const poolStates = await cpAmm.fetchPoolStatesByTokenAMint(mint);

    const pools: PoolSummary[] = [];

    for (const { publicKey, account: poolState } of poolStates) {
      const tokenBMintStr = poolState.tokenBMint.toBase58();
      let tokenBSymbol = 'Unknown';
      if (tokenBMintStr === WSOL_MINT) tokenBSymbol = 'SOL';
      else if (USDC_MINTS.includes(tokenBMintStr)) tokenBSymbol = 'USDC';

      // Get vault balances
      let tokenAVaultBalance = 0;
      let tokenBVaultBalance = 0;

      const tokenAProgram = poolState.tokenAFlag
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      // Get tokenA decimals
      let tokenADecimals = 6;
      let tokenBDecimals = tokenBSymbol === 'SOL' ? 9 : 6;
      try {
        const mintA = await getMint(connection, poolState.tokenAMint, 'confirmed', tokenAProgram);
        tokenADecimals = mintA.decimals;
      } catch { /* fallback */ }

      try {
        const vaultA = await getAccount(connection, poolState.tokenAVault, 'confirmed', tokenAProgram);
        tokenAVaultBalance = Number(vaultA.amount) / 10 ** tokenADecimals;
      } catch { /* empty */ }

      try {
        const tokenBProgram = (poolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        const vaultB = await getAccount(connection, poolState.tokenBVault, 'confirmed', tokenBProgram);
        tokenBVaultBalance = Number(vaultB.amount) / 10 ** tokenBDecimals;
      } catch { /* empty */ }

      pools.push({
        poolAddress: publicKey.toBase58(),
        tokenAMint: poolState.tokenAMint.toBase58(),
        tokenBMint: tokenBMintStr,
        tokenBSymbol,
        tokenAVaultBalance,
        tokenBVaultBalance,
      });
    }

    return NextResponse.json({ success: true, data: pools });
  } catch (err) {
    console.error('Pool find error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
