import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
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
      privateKey,
      vaultAddress,
      walletPublicKeys,  // string[] of public keys to whitelist
      maxCapPerWallet,   // max USDC/SOL each wallet can deposit (human-readable)
      quoteDecimals,     // 6 for USDC, 9 for SOL
      network,
    } = body;

    if (!privateKey || !vaultAddress || !walletPublicKeys?.length) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, vaultAddress, walletPublicKeys' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const creator = keypairFromPrivateKey(privateKey);
    const vaultPk = new PublicKey(vaultAddress);
    const cluster = network === 'devnet' ? 'devnet' : 'mainnet-beta';

    const AlphaVaultMod = await import('@meteora-ag/alpha-vault');
    const AlphaVault = AlphaVaultMod.default;

    const alphaVault = await AlphaVault.create(connection as any, vaultPk, { cluster });

    const decimals = quoteDecimals ?? 6;
    const rawMaxCap = new BN(
      Math.floor((maxCapPerWallet || 1000) * 10 ** decimals).toString()
    );

    console.log(`Creating escrows for ${walletPublicKeys.length} wallets...`);
    console.log(`  Max cap per wallet: ${maxCapPerWallet} (${decimals === 6 ? 'USDC' : 'SOL'})`);

    // Filter out wallets that already have an escrow
    const walletsToCreate: string[] = [];
    let alreadyExist = 0;
    for (const pubkey of walletPublicKeys) {
      try {
        const escrow = await alphaVault.getEscrow(new PublicKey(pubkey));
        if (escrow) {
          alreadyExist++;
          console.log(`  ${pubkey.slice(0, 8)}... already has escrow, skipping`);
        } else {
          walletsToCreate.push(pubkey);
        }
      } catch {
        walletsToCreate.push(pubkey);
      }
    }

    if (walletsToCreate.length === 0) {
      console.log(`All ${walletPublicKeys.length} wallets already have escrows`);
      return NextResponse.json({
        success: true,
        data: {
          totalCreated: 0,
          totalFailed: 0,
          alreadyExist,
          totalWallets: walletPublicKeys.length,
          signatures: [],
        },
      });
    }

    const batchSize = 10;
    let totalCreated = 0;
    let totalFailed = 0;
    const signatures: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < walletsToCreate.length; i += batchSize) {
      const batch = walletsToCreate.slice(i, i + batchSize);

      try {
        const walletDepositCaps = batch.map((pubkey: string) => ({
          address: new PublicKey(pubkey),
          maxAmount: rawMaxCap,
        }));

        const instructions = await alphaVault.createMultipleStakeEscrowByAuthorityInstructions(
          walletDepositCaps,
          creator.publicKey
        );

        const tx = new Transaction().add(...instructions);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = creator.publicKey;

        const sig = await sendAndConfirmTransaction(
          connection,
          tx,
          [creator],
          { commitment: 'confirmed' }
        );

        signatures.push(sig);
        totalCreated += batch.length;
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} escrows created - ${sig}`);
      } catch (err) {
        totalFailed += batch.length;
        const errMsg = extractError(err);
        errors.push(errMsg);
        console.error(`  Batch ${Math.floor(i / batchSize) + 1} failed:`, errMsg);
      }
    }

    console.log(`Escrows done: ${totalCreated} created, ${totalFailed} failed`);

    return NextResponse.json({
      success: totalFailed === 0,
      data: {
        totalCreated,
        totalFailed,
        totalWallets: walletPublicKeys.length,
        signatures,
      },
      error: errors.length > 0 ? errors[0] : undefined,
    });
  } catch (err) {
    console.error('Create escrows error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
