import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';

export const dynamic = 'force-dynamic';

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vaultAddress, walletPrivateKey, network } = body;

    if (!vaultAddress || !walletPrivateKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: vaultAddress, walletPrivateKey' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const keypair = keypairFromPrivateKey(walletPrivateKey);
    const vaultPk = new PublicKey(vaultAddress);
    const cluster = network === 'devnet' ? 'devnet' : 'mainnet-beta';

    const AlphaVaultMod = await import('@meteora-ag/alpha-vault');
    const AlphaVault = AlphaVaultMod.default;

    const alphaVault = await AlphaVault.create(connection as any, vaultPk, { cluster });

    const escrow = await alphaVault.getEscrow(keypair.publicKey);
    if (!escrow) {
      return NextResponse.json(
        { success: false, error: 'No escrow found for this wallet' },
        { status: 404 }
      );
    }

    const claimInfo = alphaVault.getClaimInfo(escrow);
    if (claimInfo.totalClaimable.lten(0)) {
      return NextResponse.json(
        { success: false, error: 'No tokens available to claim yet' },
        { status: 400 }
      );
    }

    const claimTx = await alphaVault.claimToken(keypair.publicKey);

    (claimTx as any).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      claimTx as any,
      [keypair],
      { commitment: 'confirmed' }
    );

    console.log(`Claimed for ${keypair.publicKey.toBase58()}: ${claimInfo.totalClaimable.toString()} tokens, sig: ${sig}`);

    return NextResponse.json({
      success: true,
      data: {
        signature: sig,
        wallet: keypair.publicKey.toBase58(),
        totalAllocated: claimInfo.totalAllocated.toString(),
        totalClaimed: claimInfo.totalClaimed.toString(),
        claimedNow: claimInfo.totalClaimable.toString(),
      },
    });
  } catch (err) {
    console.error('Alpha Vault claim error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
