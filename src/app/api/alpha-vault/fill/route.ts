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
    const { vaultAddress, privateKey, network } = body;

    if (!vaultAddress || !privateKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: vaultAddress, privateKey' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const payer = keypairFromPrivateKey(privateKey);
    const vaultPk = new PublicKey(vaultAddress);
    const cluster = network === 'devnet' ? 'devnet' : 'mainnet-beta';

    const AlphaVaultMod = await import('@meteora-ag/alpha-vault');
    const AlphaVault = AlphaVaultMod.default;

    const alphaVault = await AlphaVault.create(connection as any, vaultPk, { cluster });

    console.log('Filling vault (crank):', vaultAddress);
    console.log('  Vault mode:', alphaVault.vault.vaultMode);
    console.log('  Total deposited:', alphaVault.vault.totalDeposit.toString());
    console.log('  Already swapped:', alphaVault.vault.swappedAmount.toString());

    const fillTx = await alphaVault.fillVault(payer.publicKey);

    if (!fillTx) {
      return NextResponse.json({
        success: false,
        error: 'fillVault returned null — vault may not be in PURCHASING state or pool has no liquidity',
      });
    }

    // Add priority fee
    (fillTx as any).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      fillTx as any,
      [payer],
      { commitment: 'confirmed' }
    );

    // Re-fetch vault state
    const updatedVault = await AlphaVault.create(connection as any, vaultPk, { cluster });

    console.log('Vault filled:', sig);
    console.log('  Bought tokens:', updatedVault.vault.boughtToken.toString());
    console.log('  Swapped amount:', updatedVault.vault.swappedAmount.toString());

    return NextResponse.json({
      success: true,
      data: {
        signature: sig,
        boughtToken: updatedVault.vault.boughtToken.toString(),
        swappedAmount: updatedVault.vault.swappedAmount.toString(),
        totalDeposit: updatedVault.vault.totalDeposit.toString(),
      },
    });
  } catch (err) {
    console.error('Alpha Vault fill error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
