import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import BN from 'bn.js';

export const dynamic = 'force-dynamic';

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      vaultAddress,
      walletPrivateKey,
      amount,         // human-readable amount (e.g. 500 USDC)
      quoteDecimals,  // 6 for USDC, 9 for SOL
      network,
    } = body;

    if (!vaultAddress || !walletPrivateKey || amount == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: vaultAddress, walletPrivateKey, amount' },
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

    const rawAmount = new BN(
      Math.floor(amount * 10 ** (quoteDecimals || 6)).toString()
    );

    const depositTx = await alphaVault.deposit(rawAmount, keypair.publicKey, []);

    // Add priority fee
    (depositTx as any).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      depositTx as any,
      [keypair],
      { commitment: 'confirmed' }
    );

    // Get escrow info
    const escrow = await alphaVault.getEscrow(keypair.publicKey);
    const depositedRaw = escrow ? escrow.totalDeposit.toString() : '0';
    const deposited = Number(depositedRaw) / 10 ** (quoteDecimals || 6);

    console.log(`Deposit: ${amount} → vault ${vaultAddress} from ${keypair.publicKey.toBase58()} sig: ${sig}`);

    return NextResponse.json({
      success: true,
      data: {
        signature: sig,
        deposited: amount,
        totalDeposited: deposited,
        wallet: keypair.publicKey.toBase58(),
      },
    });
  } catch (err) {
    console.error('Alpha Vault deposit error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
