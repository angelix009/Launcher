import { NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Directory to persist intermediate keypairs for recovery
const RECOVERY_DIR = path.join(process.cwd(), '.stealth-recovery');
const ARCHIVE_DIR = path.join(process.cwd(), '.stealth-recovery', 'archive');

const RPC_URLS: Record<string, string> = {
  'devnet': 'https://api.devnet.solana.com',
  'mainnet-beta': process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
};

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Wait until account balance is confirmed non-zero (RPC propagation delay)
async function waitForBalance(connection: Connection, pubkey: PublicKey, expectedMin: number, maxRetries = 10): Promise<number> {
  for (let i = 0; i < maxRetries; i++) {
    const balance = await connection.getBalance(pubkey);
    if (balance >= expectedMin) return balance;
    console.log(`  [waitForBalance] ${pubkey.toBase58().slice(0, 8)}... balance=${balance}, waiting... (${i + 1}/${maxRetries})`);
    await sleep(1500);
  }
  throw new Error(`Account ${pubkey.toBase58().slice(0, 8)}... balance never reached ${expectedMin} after ${maxRetries} retries`);
}

// Save intermediate keypairs to disk BEFORE sending any SOL
function saveRecoveryData(sessionId: string, pathIndex: number, finalWallet: string, intermediates: Keypair[]) {
  if (!existsSync(RECOVERY_DIR)) mkdirSync(RECOVERY_DIR, { recursive: true });
  const data = {
    sessionId,
    pathIndex,
    finalWallet,
    timestamp: new Date().toISOString(),
    intermediates: intermediates.map((kp, i) => ({
      label: ['A', 'B', 'C', 'D'][i],
      publicKey: kp.publicKey.toBase58(),
      privateKey: bs58.encode(kp.secretKey),
    })),
  };
  const filePath = path.join(RECOVERY_DIR, `${sessionId}_path${pathIndex}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// Archive recovery file after successful completion (never delete)
function clearRecoveryData(sessionId: string, pathIndex: number) {
  const filePath = path.join(RECOVERY_DIR, `${sessionId}_path${pathIndex}.json`);
  try {
    if (existsSync(filePath)) {
      if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
      const archivePath = path.join(ARCHIVE_DIR, `${sessionId}_path${pathIndex}_done.json`);
      require('fs').renameSync(filePath, archivePath);
    }
  } catch { /* ignore */ }
}

async function swapSolToUsdc(
  connection: Connection,
  wallet: Keypair,
  amountLamports: number,
  usdcMint: string,
  slippageBps: number,
): Promise<{ signature: string; usdcReceived: string }> {
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${usdcMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${await quoteRes.text()}`);
  const quote = await quoteRes.json();

  const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${await swapRes.text()}`);
  const swapData = await swapRes.json();

  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, 'confirmed');

  return { signature: sig, usdcReceived: quote.outAmount };
}

// Minimum SOL needed per path: fees for 5 hops + ATA rent + buffer
const MIN_SOL_PER_PATH = 0.01; // absolute minimum (fees + rent)
const ATA_RENT = 2039280; // lamports
const TX_FEE = 5000; // lamports per tx

interface HopResult {
  hop: number;
  from: string;
  to: string;
  amount: number;
  signature: string;
  method: string;
}

interface PathResult {
  finalWallet: string;
  amount: number;
  hops: HopResult[];
  intermediateKeys?: { label: string; publicKey: string; privateKey: string }[];
  recoveryFile?: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      funderPrivateKey,
      wallets,
      amounts,
      network = 'mainnet-beta',
      delayMinMs = 3000,
      delayMaxMs = 6000,
      swapToUsdc = false,
      solToKeep = 0.05,
      slippageBps = 100,
      recover = false, // recovery mode: try to recover SOL from intermediate wallets
      recoverySessionId, // session to recover from
    } = body;

    const rpcUrl = RPC_URLS[network];
    if (!rpcUrl) {
      return NextResponse.json({ success: false, error: 'Invalid network' }, { status: 400 });
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // ════════════════════════════════════════════════
    // RECOVERY MODE: recover SOL from failed paths
    // ════════════════════════════════════════════════
    if (recover) {
      return await handleRecovery(connection, body);
    }

    if (!funderPrivateKey || !wallets || wallets.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing funder key or wallets' }, { status: 400 });
    }

    let funder: Keypair;
    try {
      funder = Keypair.fromSecretKey(bs58.decode(funderPrivateKey));
    } catch {
      try {
        funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(funderPrivateKey)));
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid funder private key' }, { status: 400 });
      }
    }

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const results: PathResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const targetAmount = amounts?.[w.publicKey] || amounts?.[w.id] || 0;
      if (targetAmount <= 0) continue;

      // ── Pre-flight check: minimum amount ──
      if (targetAmount < MIN_SOL_PER_PATH) {
        results.push({
          finalWallet: w.publicKey,
          amount: targetAmount,
          hops: [],
          error: `Amount ${targetAmount} SOL too low. Minimum is ${MIN_SOL_PER_PATH} SOL to cover 5 hops + ATA rent.`,
        });
        failCount++;
        continue;
      }

      const pathResult: PathResult = {
        finalWallet: w.publicKey,
        amount: targetAmount,
        hops: [],
      };

      try {
        // Generate 4 intermediate keypairs (A, B, C, D)
        const intermediateA = Keypair.generate();
        const intermediateB = Keypair.generate();
        const intermediateC = Keypair.generate();
        const intermediateD = Keypair.generate();
        const intermediates = [intermediateA, intermediateB, intermediateC, intermediateD];

        // ★ SAVE KEYS TO DISK BEFORE SENDING ANY SOL ★
        const recoveryFile = saveRecoveryData(sessionId, i, w.publicKey, intermediates);
        pathResult.recoveryFile = recoveryFile;
        pathResult.intermediateKeys = intermediates.map((kp, idx) => ({
          label: ['A', 'B', 'C', 'D'][idx],
          publicKey: kp.publicKey.toBase58(),
          privateKey: bs58.encode(kp.secretKey),
        }));

        console.log(`[stealth ${i + 1}/${wallets.length}] Keys saved to ${recoveryFile}`);

        // fees: 4 hops × 5000 fee each + hop5 (1 tx: 5000 fee, ATA rent refunded via closeAccount)
        const totalFeeLamports = (5 * TX_FEE) + 10000; // 5 tx fees + buffer (ATA rent is refunded)
        const hop1Amount = targetAmount + totalFeeLamports / LAMPORTS_PER_SOL;
        const hop1Lamports = Math.round(hop1Amount * LAMPORTS_PER_SOL);

        // ═══ HOP 1: transfer (funder → A) ═══
        console.log(`[stealth ${i + 1}/${wallets.length}] Hop 1: funder → ${intermediateA.publicKey.toBase58().slice(0, 8)}... (${hop1Amount.toFixed(4)} SOL)`);

        const tx1 = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: funder.publicKey,
            toPubkey: intermediateA.publicKey,
            lamports: hop1Lamports,
          })
        );
        tx1.feePayer = funder.publicKey;
        tx1.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sig1 = await connection.sendTransaction(tx1, [funder], { skipPreflight: false });
        await connection.confirmTransaction(sig1, 'confirmed');

        pathResult.hops.push({
          hop: 1, from: funder.publicKey.toBase58(), to: intermediateA.publicKey.toBase58(),
          amount: hop1Amount, signature: sig1, method: 'createAccount',
        });

        await sleep(randomBetween(delayMinMs, delayMaxMs));

        // Use waitForBalance + real balance for each hop to handle RPC propagation
        // and ensure exact amounts (accounts must end at 0 to avoid rent issues)

        // ═══ HOP 2: transfer (A → B) ═══
        const balanceA = await waitForBalance(connection, intermediateA.publicKey, hop1Lamports);
        const hop2Lamports = balanceA - TX_FEE;
        console.log(`[stealth ${i + 1}/${wallets.length}] Hop 2: ${intermediateA.publicKey.toBase58().slice(0, 8)}... → ${intermediateB.publicKey.toBase58().slice(0, 8)}... (${(hop2Lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

        const tx2 = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: intermediateA.publicKey, toPubkey: intermediateB.publicKey, lamports: hop2Lamports })
        );
        tx2.feePayer = intermediateA.publicKey;
        tx2.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sig2 = await connection.sendTransaction(tx2, [intermediateA], { skipPreflight: false });
        await connection.confirmTransaction(sig2, 'confirmed');

        pathResult.hops.push({
          hop: 2, from: intermediateA.publicKey.toBase58(), to: intermediateB.publicKey.toBase58(),
          amount: hop2Lamports / LAMPORTS_PER_SOL, signature: sig2, method: 'transfer',
        });

        await sleep(randomBetween(delayMinMs, delayMaxMs));

        // ═══ HOP 3: transfer (B → C) ═══
        const balanceB = await waitForBalance(connection, intermediateB.publicKey, hop2Lamports);
        const hop3Lamports = balanceB - TX_FEE;
        console.log(`[stealth ${i + 1}/${wallets.length}] Hop 3: ${intermediateB.publicKey.toBase58().slice(0, 8)}... → ${intermediateC.publicKey.toBase58().slice(0, 8)}... (${(hop3Lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

        const tx3 = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: intermediateB.publicKey, toPubkey: intermediateC.publicKey, lamports: hop3Lamports })
        );
        tx3.feePayer = intermediateB.publicKey;
        tx3.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sig3 = await connection.sendTransaction(tx3, [intermediateB], { skipPreflight: false });
        await connection.confirmTransaction(sig3, 'confirmed');

        pathResult.hops.push({
          hop: 3, from: intermediateB.publicKey.toBase58(), to: intermediateC.publicKey.toBase58(),
          amount: hop3Lamports / LAMPORTS_PER_SOL, signature: sig3, method: 'transfer',
        });

        await sleep(randomBetween(delayMinMs, delayMaxMs));

        // ═══ HOP 4: transfer (C → D) ═══
        const balanceC = await waitForBalance(connection, intermediateC.publicKey, hop3Lamports);
        const hop4Lamports = balanceC - TX_FEE;
        console.log(`[stealth ${i + 1}/${wallets.length}] Hop 4: ${intermediateC.publicKey.toBase58().slice(0, 8)}... → ${intermediateD.publicKey.toBase58().slice(0, 8)}... (${(hop4Lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

        const tx4 = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: intermediateC.publicKey, toPubkey: intermediateD.publicKey, lamports: hop4Lamports })
        );
        tx4.feePayer = intermediateC.publicKey;
        tx4.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sig4 = await connection.sendTransaction(tx4, [intermediateC], { skipPreflight: false });
        await connection.confirmTransaction(sig4, 'confirmed');

        pathResult.hops.push({
          hop: 4, from: intermediateC.publicKey.toBase58(), to: intermediateD.publicKey.toBase58(),
          amount: hop4Lamports / LAMPORTS_PER_SOL, signature: sig4, method: 'transfer',
        });

        await sleep(randomBetween(delayMinMs, delayMaxMs));

        // ═══ HOP 5: WSOL wrap + closeAccount in ONE tx (D → final wallet) ═══
        const actualBalanceD = await waitForBalance(connection, intermediateD.publicKey, hop4Lamports);
        const finalWalletPubkey = new PublicKey(w.publicKey);
        const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, intermediateD.publicKey, false, TOKEN_PROGRAM_ID);

        // Use actual balance for max precision
        const wrapAmount = actualBalanceD - ATA_RENT - TX_FEE;

        if (wrapAmount <= 0) {
          throw new Error(`Insufficient balance on D: ${actualBalanceD / LAMPORTS_PER_SOL} SOL, need at least ${(ATA_RENT + TX_FEE) / LAMPORTS_PER_SOL} SOL`);
        }

        console.log(`[stealth ${i + 1}/${wallets.length}] Hop 5: ${intermediateD.publicKey.toBase58().slice(0, 8)}... → WSOL → closeAccount → ${w.publicKey.slice(0, 8)}...`);

        // All in one tx: createATA + transfer + syncNative + closeAccount(→ finalWallet)
        // D pays fee, creates ATA (rent), wraps SOL, then closeAccount sends everything to final wallet
        // D ends at 0 lamports → no rent issue
        const tx5 = new Transaction().add(
          createAssociatedTokenAccountInstruction(intermediateD.publicKey, wsolAta, intermediateD.publicKey, NATIVE_MINT, TOKEN_PROGRAM_ID),
          SystemProgram.transfer({ fromPubkey: intermediateD.publicKey, toPubkey: wsolAta, lamports: wrapAmount }),
          createSyncNativeInstruction(wsolAta, TOKEN_PROGRAM_ID),
          createCloseAccountInstruction(wsolAta, finalWalletPubkey, intermediateD.publicKey, [], TOKEN_PROGRAM_ID),
        );
        tx5.feePayer = intermediateD.publicKey;
        tx5.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sig5 = await connection.sendTransaction(tx5, [intermediateD], { skipPreflight: false });
        await connection.confirmTransaction(sig5, 'confirmed');

        pathResult.hops.push({
          hop: 5, from: intermediateD.publicKey.toBase58(), to: w.publicKey,
          amount: (wrapAmount + ATA_RENT) / LAMPORTS_PER_SOL, signature: sig5, method: 'wsol_closeAccount',
        });

        // ═══ HOP 6 (optional): Swap SOL → USDC ═══
        if (swapToUsdc) {
          await sleep(randomBetween(delayMinMs, delayMaxMs));

          let finalWalletKeypair: Keypair;
          try {
            finalWalletKeypair = Keypair.fromSecretKey(bs58.decode(w.privateKey));
          } catch {
            finalWalletKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(w.privateKey)));
          }

          const finalBalance = await connection.getBalance(finalWalletPubkey);
          const keepLamports = Math.round(solToKeep * LAMPORTS_PER_SOL);
          const swapLamports = finalBalance - keepLamports;

          if (swapLamports > 0) {
            const usdcMint = network === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT;
            console.log(`[stealth ${i + 1}/${wallets.length}] Hop 6: Swap ${(swapLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL → USDC (keeping ${solToKeep} SOL)`);

            const swapResult = await swapSolToUsdc(connection, finalWalletKeypair, swapLamports, usdcMint, slippageBps);

            pathResult.hops.push({
              hop: 6, from: w.publicKey, to: w.publicKey,
              amount: swapLamports / LAMPORTS_PER_SOL, signature: swapResult.signature, method: 'swap_sol_to_usdc',
            });
            console.log(`[stealth ${i + 1}/${wallets.length}] ✓ Swapped to USDC, received ${(parseInt(swapResult.usdcReceived) / 1_000_000).toFixed(2)} USDC`);
          }
        }

        console.log(`[stealth ${i + 1}/${wallets.length}] ✓ Complete: ${w.publicKey.slice(0, 8)}... received ~${targetAmount.toFixed(4)} SOL`);
        successCount++;

        // ★ Success: remove recovery file ★
        clearRecoveryData(sessionId, i);

      } catch (err) {
        pathResult.error = (err as Error).message?.slice(0, 300);
        console.error(`[stealth ${i + 1}/${wallets.length}] ✗ Failed for ${w.publicKey.slice(0, 8)}...: ${pathResult.error}`);
        console.error(`[stealth ${i + 1}/${wallets.length}] ⚠ Recovery keys saved in ${RECOVERY_DIR}`);
        failCount++;
      }

      results.push(pathResult);

      if (i < wallets.length - 1) {
        const pathDelay = randomBetween(delayMinMs * 1.5, delayMaxMs * 2);
        await sleep(pathDelay);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        results,
        summary: {
          total: wallets.length,
          success: successCount,
          failed: failCount,
          totalSolDistributed: results.filter(r => !r.error).reduce((s, r) => s + r.amount, 0),
        },
      },
    });
  } catch (err) {
    console.error('[stealth-fund] Fatal error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════
// RECOVERY: drain all intermediate wallets back to target
// ════════════════════════════════════════════════════════
async function handleRecovery(connection: Connection, body: { recoveryTarget: string; recoverySessionId?: string }) {
  const { recoveryTarget } = body;
  if (!recoveryTarget) {
    return NextResponse.json({ success: false, error: 'Missing recoveryTarget (wallet to send SOL back to)' }, { status: 400 });
  }

  const targetPubkey = new PublicKey(recoveryTarget);

  if (!existsSync(RECOVERY_DIR)) {
    return NextResponse.json({ success: false, error: 'No recovery data found' }, { status: 404 });
  }

  const files = require('fs').readdirSync(RECOVERY_DIR).filter((f: string) => f.endsWith('.json'));
  if (files.length === 0) {
    return NextResponse.json({ success: false, error: 'No recovery files found' }, { status: 404 });
  }

  const recovered: { file: string; wallet: string; amount: number; signature?: string; error?: string }[] = [];
  let totalRecovered = 0;

  for (const file of files) {
    const filePath = path.join(RECOVERY_DIR, file);
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));

      // Try to drain each intermediate wallet, retry getBalance if it returns 0
      let allDrained = true;
      for (const intermediate of data.intermediates) {
        const kp = Keypair.fromSecretKey(bs58.decode(intermediate.privateKey));

        // Retry getBalance up to 3 times with delay (RPC can return 0 due to caching)
        let balance = 0;
        for (let retry = 0; retry < 3; retry++) {
          balance = await connection.getBalance(kp.publicKey);
          if (balance > 0) break;
          if (retry < 2) await sleep(2000);
        }

        if (balance > TX_FEE + 1000) {
          const sendAmount = balance - TX_FEE;
          const tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: targetPubkey, lamports: sendAmount })
          );
          tx.feePayer = kp.publicKey;
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

          try {
            const sig = await connection.sendTransaction(tx, [kp], { skipPreflight: false });
            await connection.confirmTransaction(sig, 'confirmed');
            const solAmount = sendAmount / LAMPORTS_PER_SOL;
            totalRecovered += solAmount;
            recovered.push({ file, wallet: intermediate.publicKey, amount: solAmount, signature: sig });
            console.log(`[recovery] ✓ Recovered ${solAmount.toFixed(6)} SOL from ${intermediate.label} (${intermediate.publicKey.slice(0, 8)}...)`);
          } catch (err) {
            allDrained = false;
            recovered.push({ file, wallet: intermediate.publicKey, amount: 0, error: (err as Error).message?.slice(0, 100) });
          }
        } else if (balance > 0) {
          // Has some dust but not enough to send (below fee threshold)
          allDrained = true; // dust is negligible
        }
      }

      // Archive recovery file (never delete — always keep keys)
      try {
        if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
        const archiveName = file.replace('.json', `_recovered_${Date.now()}.json`);
        require('fs').renameSync(filePath, path.join(ARCHIVE_DIR, archiveName));
        console.log(`[recovery] Archived ${file} → archive/${archiveName}`);
      } catch { /* ignore */ }

    } catch (err) {
      recovered.push({ file, wallet: 'unknown', amount: 0, error: `Failed to parse: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      recovered,
      totalRecoveredSol: totalRecovered,
      filesProcessed: files.length,
    },
  });
}
