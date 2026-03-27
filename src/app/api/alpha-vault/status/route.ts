import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';

export const dynamic = 'force-dynamic';

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vaultAddress, network } = body;

    if (!vaultAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing vaultAddress' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const vaultPk = new PublicKey(vaultAddress);
    const cluster = network === 'devnet' ? 'devnet' : 'mainnet-beta';

    const AlphaVaultMod = await import('@meteora-ag/alpha-vault');
    const AlphaVault = AlphaVaultMod.default;

    const alphaVault = await AlphaVault.create(connection as any, vaultPk, { cluster });
    const v = alphaVault.vault;

    // Use SDK's built-in state detection (uses on-chain clock + proper timing math)
    const state = alphaVault.vaultState;
    const vaultPoint = alphaVault.vaultPoint;
    const currentPoint = v.activationType === 0
      ? alphaVault.clock.slot.toNumber()
      : alphaVault.clock.unixTimestamp.toNumber();

    return NextResponse.json({
      success: true,
      data: {
        vaultAddress,
        state,
        currentPoint,
        firstJoinPoint: vaultPoint.firstJoinPoint,
        lastJoinPoint: vaultPoint.lastJoinPoint,
        lastBuyingPoint: vaultPoint.lastBuyingPoint,
        totalDeposit: v.totalDeposit.toString(),
        maxBuyingCap: (v as any).maxBuyingCap?.toString() || '0',
        boughtToken: v.boughtToken.toString(),
        swappedAmount: v.swappedAmount.toString(),
        depositingPoint: Number(v.depositingPoint.toString()),
        startVesting: vaultPoint.startVestingPoint,
        endVesting: vaultPoint.endVestingPoint,
        baseMint: v.baseMint.toBase58(),
        quoteMint: v.quoteMint.toBase58(),
        pool: v.pool.toBase58(),
        vaultMode: v.vaultMode,
      },
    });
  } catch (err) {
    console.error('Alpha Vault status error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
