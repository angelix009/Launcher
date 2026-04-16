import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import type { WalletEntry, BuyResult } from '@/types';

const SPL_TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** Detect if a token mint uses SPL standard or Token-2022 */
async function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  return info?.owner.equals(SPL_TOKEN_PROGRAM) ? SPL_TOKEN_PROGRAM : TOKEN_2022_PROGRAM_ID;
}

export interface SellResult {
  walletId: string;
  walletPublicKey: string;
  signature?: string;
  error?: string;
  amountSold: number;
  quoteReceived?: number;
  quoteSymbol?: string;
}

export interface QuoteResult {
  walletId: string;
  walletPublicKey: string;
  tokenBalance: number;
  sellAmount: number;
  estimatedQuote: number;
  quoteSymbol: string;
  maxSellable: number | null; // null means full amount is ok
  error?: string;
}

export async function sellTokensFromWallets(
  connection: Connection,
  poolAddress: string,
  tokenMint: string,
  wallets: WalletEntry[],
  percentage: number,
  slippageBps: number,
  decimals: number
): Promise<SellResult[]> {
  const results: SellResult[] = [];
  const pool = new PublicKey(poolAddress);
  const mint = new PublicKey(tokenMint);

  // Auto-detect token program (SPL vs Token-2022)
  const STANDARD_TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const mintAccountInfo = await connection.getAccountInfo(mint);
  const tokenProgram = mintAccountInfo?.owner.equals(STANDARD_TOKEN) ? STANDARD_TOKEN : TOKEN_2022_PROGRAM_ID;

  // Create CpAmm instance for DAMM v2
  const cpAmm = new CpAmm(connection as any);

  // Detect quote token (tokenB) decimals and symbol
  const USDC_MINTS = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // mainnet
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet
  ];
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  let quoteBDecimals = 9; // default SOL
  let quoteSymbol = 'SOL';

  try {
    const initialPoolState = await cpAmm.fetchPoolState(pool);
    const tokenBMintStr = initialPoolState.tokenBMint.toBase58();
    if (USDC_MINTS.includes(tokenBMintStr)) {
      quoteBDecimals = 6;
      quoteSymbol = 'USDC';
    } else if (tokenBMintStr === WSOL_MINT) {
      quoteBDecimals = 9;
      quoteSymbol = 'SOL';
    }
  } catch {
    // fallback defaults
  }

  // Fetch pool state and time info once for all wallets
  const poolState = await cpAmm.fetchPoolState(pool);
  const currentSlot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(currentSlot);
  const currentTime = blockTime || Math.floor(Date.now() / 1000);
  const slippage = slippageBps / 10000;

  // Build all swap txs in parallel
  const CONCURRENCY = 10;
  for (let batch = 0; batch < wallets.length; batch += CONCURRENCY) {
    const walletBatch = wallets.slice(batch, batch + CONCURRENCY);
    const batchPromises = walletBatch.map(async (wallet) => {
      try {
        const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
        const ata = getAssociatedTokenAddressSync(
          mint, keypair.publicKey, false, tokenProgram
        );

        let balance: bigint;
        try {
          const account = await getAccount(connection, ata, 'confirmed', tokenProgram);
          balance = account.amount;
        } catch {
          results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, error: 'No token account found', amountSold: 0 });
          return;
        }

        if (balance === BigInt(0)) {
          results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, error: 'Zero balance', amountSold: 0 });
          return;
        }

        let sellAmount = (balance * BigInt(Math.floor(percentage * 100))) / BigInt(10000);
        if (sellAmount === BigInt(0)) {
          results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, error: 'Amount too small', amountSold: 0 });
          return;
        }

        let swapAmount = new BN(sellAmount.toString());

        // Re-fetch pool state for each swap to get accurate reserves
        const freshPoolState = await cpAmm.fetchPoolState(pool);

        let quote;
        try {
          quote = cpAmm.getQuote({
            inAmount: swapAmount, inputTokenMint: mint, slippage,
            poolState: freshPoolState, currentTime, currentSlot,
            tokenADecimal: decimals, tokenBDecimal: quoteBDecimals,
          });
        } catch (quoteErr) {
          const errMsg = (quoteErr as Error).message;
          if (errMsg.includes('Price range is violated') || errMsg.includes('Amount out must be greater')) {
            const maxResult = findMaxSellable(
              cpAmm, freshPoolState, mint, swapAmount,
              slippage, currentTime, currentSlot, decimals, quoteBDecimals
            );
            if (maxResult) {
              swapAmount = maxResult.maxAmount;
              quote = maxResult.quote;
              sellAmount = BigInt(swapAmount.toString());
            } else {
              throw new Error('Pool has no liquidity for this swap');
            }
          } else {
            throw quoteErr;
          }
        }

        const swapTx = await cpAmm.swap({
          payer: keypair.publicKey, pool,
          inputTokenMint: freshPoolState.tokenAMint,
          outputTokenMint: freshPoolState.tokenBMint,
          amountIn: swapAmount,
          minimumAmountOut: quote.minSwapOutAmount,
          tokenAMint: freshPoolState.tokenAMint,
          tokenBMint: freshPoolState.tokenBMint,
          tokenAVault: freshPoolState.tokenAVault,
          tokenBVault: freshPoolState.tokenBVault,
          tokenAProgram: freshPoolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          tokenBProgram: (freshPoolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          referralTokenAccount: null,
        });

        (swapTx as any).add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
        );

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        (swapTx as any).recentBlockhash = blockhash;
        (swapTx as any).feePayer = keypair.publicKey;
        (swapTx as any).sign(keypair);

        const rawTx = (swapTx as any).serialize();
        const sig = await connection.sendRawTransaction(rawTx, {
          skipPreflight: true,
          maxRetries: 5,
        });

        // Don't wait for confirm here — just record the sig
        results.push({
          walletId: wallet.id, walletPublicKey: wallet.publicKey,
          signature: sig,
          amountSold: Number(sellAmount) / 10 ** decimals,
          quoteReceived: Number(quote.minSwapOutAmount.toString()) / 10 ** quoteBDecimals,
          quoteSymbol,
        });
      } catch (err) {
        results.push({
          walletId: wallet.id, walletPublicKey: wallet.publicKey,
          error: (err as Error).message, amountSold: 0,
        });
      }
    });

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * Binary search to find the max sellable amount before "Price range is violated"
 */
function findMaxSellable(
  cpAmm: InstanceType<typeof CpAmm>,
  poolState: any,
  inputTokenMint: PublicKey,
  requestedAmount: BN,
  slippage: number,
  currentTime: number,
  currentSlot: number,
  tokenADecimal: number,
  tokenBDecimal: number
): { maxAmount: BN; quote: any } | null {
  let low = new BN(0);
  let high = requestedAmount;
  let bestAmount = new BN(0);
  let bestQuote: any = null;

  // Binary search with ~20 iterations (enough precision for u64)
  for (let i = 0; i < 30; i++) {
    const mid = low.add(high).div(new BN(2));
    if (mid.eq(low)) break;

    try {
      const quote = cpAmm.getQuote({
        inAmount: mid,
        inputTokenMint,
        slippage,
        poolState,
        currentTime,
        currentSlot,
        tokenADecimal,
        tokenBDecimal,
      });
      // This amount works
      if (quote.swapOutAmount.gt(new BN(0))) {
        bestAmount = mid;
        bestQuote = quote;
        low = mid;
      } else {
        high = mid;
      }
    } catch {
      // This amount is too large
      high = mid;
    }
  }

  if (bestAmount.gt(new BN(0)) && bestQuote) {
    return { maxAmount: bestAmount, quote: bestQuote };
  }
  return null;
}

/**
 * Get quotes for wallets without executing (preview only)
 */
export async function getQuoteForWallets(
  connection: Connection,
  poolAddress: string,
  tokenMint: string,
  wallets: WalletEntry[],
  percentage: number,
  slippageBps: number,
  decimals: number
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];
  const pool = new PublicKey(poolAddress);
  const mint = new PublicKey(tokenMint);
  const tokenProgram = await detectTokenProgram(connection, mint);
  const cpAmm = new CpAmm(connection as any);

  const USDC_MINTS = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // mainnet
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet
  ];
  let quoteBDecimals = 9;
  let quoteSymbol = 'SOL';

  const poolState = await cpAmm.fetchPoolState(pool);
  const tokenBMintStr = poolState.tokenBMint.toBase58();
  if (USDC_MINTS.includes(tokenBMintStr)) {
    quoteBDecimals = 6;
    quoteSymbol = 'USDC';
  }

  const currentSlot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(currentSlot);
  const currentTime = blockTime || Math.floor(Date.now() / 1000);
  const slippage = slippageBps / 10000;

  for (const wallet of wallets) {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const ata = getAssociatedTokenAddressSync(
        mint, keypair.publicKey, false, tokenProgram
      );

      let balance: bigint;
      try {
        const account = await getAccount(connection, ata, 'confirmed', tokenProgram);
        balance = account.amount;
      } catch {
        results.push({
          walletId: wallet.id,
          walletPublicKey: wallet.publicKey,
          tokenBalance: 0,
          sellAmount: 0,
          estimatedQuote: 0,
          quoteSymbol,
          maxSellable: null,
          error: 'No token account',
        });
        continue;
      }

      if (balance === BigInt(0)) {
        results.push({
          walletId: wallet.id,
          walletPublicKey: wallet.publicKey,
          tokenBalance: 0,
          sellAmount: 0,
          estimatedQuote: 0,
          quoteSymbol,
          maxSellable: null,
          error: 'Zero balance',
        });
        continue;
      }

      const tokenBalance = Number(balance) / 10 ** decimals;
      const sellAmount = (balance * BigInt(Math.floor(percentage * 100))) / BigInt(10000);
      const swapAmount = new BN(sellAmount.toString());

      try {
        const quote = cpAmm.getQuote({
          inAmount: swapAmount,
          inputTokenMint: mint,
          slippage,
          poolState,
          currentTime,
          currentSlot,
          tokenADecimal: decimals,
          tokenBDecimal: quoteBDecimals,
        });

        results.push({
          walletId: wallet.id,
          walletPublicKey: wallet.publicKey,
          tokenBalance,
          sellAmount: Number(sellAmount) / 10 ** decimals,
          estimatedQuote: Number(quote.swapOutAmount.toString()) / 10 ** quoteBDecimals,
          quoteSymbol,
          maxSellable: null, // full amount OK
        });
      } catch (quoteErr) {
        const errMsg = (quoteErr as Error).message;
        if (errMsg.includes('Price range is violated') || errMsg.includes('Amount out must be greater')) {
          // Find max sellable amount
          const maxResult = findMaxSellable(
            cpAmm, poolState, mint, swapAmount,
            slippage, currentTime, currentSlot, decimals, quoteBDecimals
          );

          if (maxResult) {
            const maxHuman = Number(maxResult.maxAmount.toString()) / 10 ** decimals;
            results.push({
              walletId: wallet.id,
              walletPublicKey: wallet.publicKey,
              tokenBalance,
              sellAmount: Number(sellAmount) / 10 ** decimals,
              estimatedQuote: Number(maxResult.quote.swapOutAmount.toString()) / 10 ** quoteBDecimals,
              quoteSymbol,
              maxSellable: maxHuman,
              error: `Max sellable: ${maxHuman.toLocaleString()} tokens (pool liquidity limit)`,
            });
          } else {
            results.push({
              walletId: wallet.id,
              walletPublicKey: wallet.publicKey,
              tokenBalance,
              sellAmount: Number(sellAmount) / 10 ** decimals,
              estimatedQuote: 0,
              quoteSymbol,
              maxSellable: 0,
              error: 'Pool has no available liquidity for this token',
            });
          }
        } else {
          results.push({
            walletId: wallet.id,
            walletPublicKey: wallet.publicKey,
            tokenBalance,
            sellAmount: Number(sellAmount) / 10 ** decimals,
            estimatedQuote: 0,
            quoteSymbol,
            maxSellable: null,
            error: errMsg,
          });
        }
      }
    } catch (err) {
      results.push({
        walletId: wallet.id,
        walletPublicKey: wallet.publicKey,
        tokenBalance: 0,
        sellAmount: 0,
        estimatedQuote: 0,
        quoteSymbol,
        maxSellable: null,
        error: (err as Error).message,
      });
    }
  }

  return results;
}

export async function sendTokensBetweenWallets(
  connection: Connection,
  fromPrivateKey: string,
  toPublicKey: string,
  tokenMint: string,
  amount: number,
  decimals: number
): Promise<string> {
  const { createTransferCheckedInstruction } = await import('@solana/spl-token');
  const { Transaction } = await import('@solana/web3.js');

  const from = Keypair.fromSecretKey(bs58.decode(fromPrivateKey));
  const to = new PublicKey(toPublicKey);
  const mint = new PublicKey(tokenMint);
  const tkProg = await detectTokenProgram(connection, mint);

  const fromATA = getAssociatedTokenAddressSync(mint, from.publicKey, false, tkProg);
  const toATA = getAssociatedTokenAddressSync(mint, to, false, tkProg);

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
  );

  // Create recipient ATA if needed (idempotent: no-op if already exists)
  const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, toATA, to, mint, tkProg)
  );

  const rawAmount = BigInt(Math.floor(amount * 10 ** decimals));
  tx.add(
    createTransferCheckedInstruction(fromATA, mint, toATA, from.publicKey, rawAmount, decimals, [], tkProg)
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;

  return await sendAndConfirmTransaction(connection, tx, [from]);
}

export async function sendSolBetweenWallets(
  connection: Connection,
  fromPrivateKey: string,
  toPublicKey: string,
  amount: number
): Promise<string> {
  const from = Keypair.fromSecretKey(bs58.decode(fromPrivateKey));
  const to = new PublicKey(toPublicKey);

  let lamportsToSend = Math.floor(amount * LAMPORTS_PER_SOL);

  // Build tx to estimate fee
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
  );
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: lamportsToSend,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;

  // Check if we need to cap the amount to leave room for the fee
  const balance = await connection.getBalance(from.publicKey);
  const fee = await tx.getEstimatedFee(connection) || 10_000;
  const maxSendable = balance - fee;

  if (lamportsToSend > maxSendable) {
    lamportsToSend = maxSendable;
    if (lamportsToSend <= 0) {
      throw new Error(`Insufficient SOL balance for transaction fee. Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL, fee: ~${(fee / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    }
    // Rebuild with capped amount
    tx.instructions = [];
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
    );
    tx.add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports: lamportsToSend,
      })
    );
  }

  return await sendAndConfirmTransaction(connection, tx, [from]);
}

/**
 * Buy tokens for a single wallet (reverse swap: SOL/USDC → tokens)
 */
export async function buyTokensForWallet(
  connection: Connection,
  poolAddress: string,
  tokenMint: string,
  wallet: WalletEntry,
  quoteAmount: number, // human-readable SOL or USDC amount to spend
  slippageBps: number,
  decimals: number
): Promise<BuyResult> {
  const pool = new PublicKey(poolAddress);
  const mint = new PublicKey(tokenMint);
  const cpAmm = new CpAmm(connection as any);

  const USDC_MINTS = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  ];

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const poolState = await cpAmm.fetchPoolState(pool);

    const tokenBMintStr = poolState.tokenBMint.toBase58();
    let quoteBDecimals = 9;
    let quoteSymbol = 'SOL';
    if (USDC_MINTS.includes(tokenBMintStr)) {
      quoteBDecimals = 6;
      quoteSymbol = 'USDC';
    }

    const rawQuoteAmount = new BN(
      Math.floor(quoteAmount * 10 ** quoteBDecimals).toString()
    );

    const currentSlot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(currentSlot);
    const currentTime = blockTime || Math.floor(Date.now() / 1000);
    const slippage = slippageBps / 10000;

    // Reverse direction: input = tokenB (SOL/USDC), output = tokenA (token)
    const quote = cpAmm.getQuote({
      inAmount: rawQuoteAmount,
      inputTokenMint: poolState.tokenBMint,
      slippage,
      poolState,
      currentTime,
      currentSlot,
      tokenADecimal: decimals,
      tokenBDecimal: quoteBDecimals,
    });

    const swapTx = await cpAmm.swap({
      payer: keypair.publicKey,
      pool,
      inputTokenMint: poolState.tokenBMint,
      outputTokenMint: poolState.tokenAMint,
      amountIn: rawQuoteAmount,
      minimumAmountOut: quote.minSwapOutAmount,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: poolState.tokenAFlag
        ? TOKEN_2022_PROGRAM_ID
        : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      tokenBProgram: (poolState as any).tokenBFlag
        ? TOKEN_2022_PROGRAM_ID
        : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      referralTokenAccount: null,
    });

    (swapTx as any).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    (swapTx as any).recentBlockhash = blockhash;
    (swapTx as any).feePayer = keypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, swapTx as any, [keypair]);

    // Parse confirmed transaction to get real token delta from preTokenBalances/postTokenBalances
    let tokensReceived: number = 0;
    const walletPubStr = keypair.publicKey.toBase58();
    const tokenMintStr = mint.toBase58();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
        const parsedTx = await connection.getParsedTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (parsedTx?.meta) {
          const pre = parsedTx.meta.preTokenBalances || [];
          const post = parsedTx.meta.postTokenBalances || [];
          // Find our wallet's token A balance change
          for (const postBal of post) {
            if (postBal.owner === walletPubStr && postBal.mint === tokenMintStr) {
              const postAmount = Number(postBal.uiTokenAmount.uiAmount || 0);
              // Find matching pre balance
              const preBal = pre.find(
                p => p.accountIndex === postBal.accountIndex
              );
              const preAmount = preBal ? Number(preBal.uiTokenAmount.uiAmount || 0) : 0;
              tokensReceived = postAmount - preAmount;
              break;
            }
          }
          if (tokensReceived > 0) break;
        }
      } catch { /* retry */ }
    }
    // Fallback to quote estimate
    if (tokensReceived <= 0) {
      tokensReceived = Number(quote.swapOutAmount.toString()) / 10 ** decimals;
      console.warn(`Buy: could not parse tx delta, fallback to quote: ${tokensReceived}`);
    }

    return {
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
      signature: sig,
      quoteSpent: quoteAmount,
      tokensReceived,
      quoteSymbol,
    };
  } catch (err) {
    return {
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
      error: (err as Error).message,
      quoteSpent: quoteAmount,
      tokensReceived: 0,
      quoteSymbol: 'SOL',
    };
  }
}

/**
 * Sell an exact token amount from a single wallet on DAMM v2.
 * Used by auto-sell to sell a precise number of tokens rather than a percentage.
 */
export async function sellExactTokenAmount(
  connection: Connection,
  poolAddress: string,
  tokenMint: string,
  wallet: WalletEntry,
  tokenAmount: number,      // human-readable token amount to sell
  slippageBps: number,
  decimals: number
): Promise<SellResult> {
  const pool = new PublicKey(poolAddress);
  const mint = new PublicKey(tokenMint);
  const tokenProgram = await detectTokenProgram(connection, mint);
  const cpAmm = new CpAmm(connection as any);

  const USDC_MINTS = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  ];
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  let quoteBDecimals = 9;
  let quoteSymbol = 'SOL';

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const ata = getAssociatedTokenAddressSync(
      mint, keypair.publicKey, false, tokenProgram
    );

    // Get balance and cap if needed
    let balance: bigint;
    try {
      const account = await getAccount(connection, ata, 'confirmed', tokenProgram);
      balance = account.amount;
    } catch {
      return {
        walletId: wallet.id,
        walletPublicKey: wallet.publicKey,
        error: 'No token account found',
        amountSold: 0,
      };
    }

    if (balance === BigInt(0)) {
      return {
        walletId: wallet.id,
        walletPublicKey: wallet.publicKey,
        error: 'Zero balance',
        amountSold: 0,
      };
    }

    // Convert human-readable tokenAmount to raw
    let rawSellAmount = BigInt(Math.floor(tokenAmount * 10 ** decimals));
    // Cap at available balance
    if (rawSellAmount > balance) {
      rawSellAmount = balance;
    }
    if (rawSellAmount === BigInt(0)) {
      return {
        walletId: wallet.id,
        walletPublicKey: wallet.publicKey,
        error: 'Amount too small',
        amountSold: 0,
      };
    }

    let swapAmount = new BN(rawSellAmount.toString());
    const slippage = slippageBps / 10000;

    const poolState = await cpAmm.fetchPoolState(pool);
    const tokenBMintStr = poolState.tokenBMint.toBase58();
    if (USDC_MINTS.includes(tokenBMintStr)) {
      quoteBDecimals = 6;
      quoteSymbol = 'USDC';
    } else if (tokenBMintStr === WSOL_MINT) {
      quoteBDecimals = 9;
      quoteSymbol = 'SOL';
    }

    const currentSlot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(currentSlot);
    const currentTime = blockTime || Math.floor(Date.now() / 1000);

    let quote;
    try {
      quote = cpAmm.getQuote({
        inAmount: swapAmount,
        inputTokenMint: mint,
        slippage,
        poolState,
        currentTime,
        currentSlot,
        tokenADecimal: decimals,
        tokenBDecimal: quoteBDecimals,
      });
    } catch (quoteErr) {
      const errMsg = (quoteErr as Error).message;
      if (errMsg.includes('Price range is violated') || errMsg.includes('Amount out must be greater')) {
        const maxResult = findMaxSellable(
          cpAmm, poolState, mint, swapAmount,
          slippage, currentTime, currentSlot, decimals, quoteBDecimals
        );
        if (maxResult) {
          swapAmount = maxResult.maxAmount;
          quote = maxResult.quote;
          rawSellAmount = BigInt(swapAmount.toString());
        } else {
          throw new Error('Pool has no liquidity for this swap');
        }
      } else {
        throw quoteErr;
      }
    }

    const swapTx = await cpAmm.swap({
      payer: keypair.publicKey,
      pool,
      inputTokenMint: poolState.tokenAMint,
      outputTokenMint: poolState.tokenBMint,
      amountIn: swapAmount,
      minimumAmountOut: quote.minSwapOutAmount,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: poolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      tokenBProgram: (poolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      referralTokenAccount: null,
    });

    (swapTx as any).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    (swapTx as any).recentBlockhash = blockhash;
    (swapTx as any).feePayer = keypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, swapTx as any, [keypair]);

    return {
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
      signature: sig,
      amountSold: Number(rawSellAmount) / 10 ** decimals,
      quoteReceived: Number(quote.minSwapOutAmount.toString()) / 10 ** quoteBDecimals,
      quoteSymbol,
    };
  } catch (err) {
    return {
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
      error: (err as Error).message,
      amountSold: 0,
    };
  }
}

/**
 * Close a token ATA for a wallet and recover the rent SOL.
 * Returns the recovered lamports and signature.
 */
export async function closeTokenAccount(
  connection: Connection,
  walletPrivateKey: string,
  tokenMint: string,
  tokenProgramId?: string
): Promise<{ signature: string; recoveredLamports: number }> {
  const {
    getAssociatedTokenAddressSync: getATA,
    createCloseAccountInstruction,
    TOKEN_2022_PROGRAM_ID: T22,
  } = await import('@solana/spl-token');

  const kp = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));
  const mint = new PublicKey(tokenMint);

  // Auto-detect token program if not provided
  const tokenProgram = tokenProgramId
    ? new PublicKey(tokenProgramId)
    : await detectTokenProgram(connection, mint);

  const ata = getATA(mint, kp.publicKey, false, tokenProgram);

  // Check current rent to know how much we'll recover
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    throw new Error('Token account does not exist');
  }
  const recoveredLamports = accountInfo.lamports;

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  tx.add(
    createCloseAccountInstruction(
      ata,            // account to close
      kp.publicKey,   // destination for rent
      kp.publicKey,   // authority
      [],
      tokenProgram
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;

  const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
  return { signature: sig, recoveredLamports };
}

export async function sendUsdcBetweenWallets(
  connection: Connection,
  fromPrivateKey: string,
  toPublicKey: string,
  amount: number,
  network: string = 'mainnet-beta'
): Promise<string> {
  const {
    createTransferCheckedInstruction,
    createAssociatedTokenAccountIdempotentInstruction,
  } = await import('@solana/spl-token');

  const USDC_MINT = new PublicKey(
    network === 'devnet'
      ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  );
  const USDC_DECIMALS = 6;
  const STANDARD_TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const from = Keypair.fromSecretKey(bs58.decode(fromPrivateKey));
  const to = new PublicKey(toPublicKey);

  const fromATA = getAssociatedTokenAddressSync(
    USDC_MINT,
    from.publicKey,
    false,
    STANDARD_TOKEN_PROGRAM
  );
  const toATA = getAssociatedTokenAddressSync(
    USDC_MINT,
    to,
    false,
    STANDARD_TOKEN_PROGRAM
  );

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
  );

  // Create recipient ATA if needed (idempotent)
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      from.publicKey,
      toATA,
      to,
      USDC_MINT,
      STANDARD_TOKEN_PROGRAM
    )
  );

  const rawAmount = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));
  tx.add(
    createTransferCheckedInstruction(
      fromATA,
      USDC_MINT,
      toATA,
      from.publicKey,
      rawAmount,
      USDC_DECIMALS,
      [],
      STANDARD_TOKEN_PROGRAM
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;

  return await sendAndConfirmTransaction(connection, tx, [from]);
}

// ============================================================
// Batch send: fire all transactions in parallel, confirm batch
// ============================================================

export interface BatchSendItem {
  walletId: string;
  fromPrivateKey: string;
  toPublicKey: string;
  amount: number;
  tokenMint?: string;
  decimals?: number;
  assetType: 'sol' | 'usdc' | 'token';
}

export interface BatchSendResult {
  walletId: string;
  signature: string | null;
  status: 'confirmed' | 'failed' | 'timeout';
  error?: string;
}

export async function batchSendFromWallets(
  connection: Connection,
  items: BatchSendItem[],
  network: string = 'mainnet-beta'
): Promise<BatchSendResult[]> {
  if (items.length === 0) return [];

  const { createTransferCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction } =
    await import('@solana/spl-token');

  const STANDARD_TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const USDC_MINT_PK = new PublicKey(
    network === 'devnet'
      ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  );
  const USDC_DECIMALS = 6;

  // 1. Fetch one blockhash for all txs
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  // 2. For SOL sends, batch-fetch all balances to cap amounts
  const solItems = items.filter(it => it.assetType === 'sol');
  const nonSolItems = items.filter(it => it.assetType !== 'sol');
  const solKeypairs = solItems.map(it => Keypair.fromSecretKey(bs58.decode(it.fromPrivateKey)));
  let solBalances: number[] = [];
  if (solKeypairs.length > 0) {
    const balanceResults = await connection.getMultipleAccountsInfo(
      solKeypairs.map(kp => kp.publicKey), 'confirmed'
    );
    solBalances = balanceResults.map(a => a?.lamports ?? 0);
  }

  // 3. Build transactions
  const signedTxBuffers: (Buffer | null)[] = [];
  const txErrors: (string | null)[] = [];
  // Map from original item index → which grouped tx it belongs to
  const itemToGroupTx = new Map<number, number>();

  // 3a. Build individual SOL transfer txs (1 signer each = simple fee math)
  const SOL_MICRO_LAMPORTS = 1_000;
  const SOL_CU_LIMIT = 450; // SOL transfer uses ~300 CU
  const SOL_FEE = 5_000 + Math.ceil(SOL_CU_LIMIT * SOL_MICRO_LAMPORTS / 1_000_000); // 5001
  const rentExempt = 890_880;

  for (let s = 0; s < solItems.length; s++) {
    const item = solItems[s];
    const origIdx = items.indexOf(item);
    const balance = solBalances[s];

    if (balance < SOL_FEE + 1) {
      itemToGroupTx.set(origIdx, -1);
      continue;
    }

    try {
      const sender = Keypair.fromSecretKey(bs58.decode(item.fromPrivateKey));
      const recipient = new PublicKey(item.toPublicKey);
      let lamports = Math.floor(item.amount * LAMPORTS_PER_SOL);

      // If requested amount would leave balance between 0 and rent-exempt, drain to 0
      const maxKeepAlive = balance - SOL_FEE - rentExempt;
      if (lamports > maxKeepAlive) {
        lamports = balance - SOL_FEE; // drain to exactly 0 after fee
      }

      if (lamports <= 0) {
        itemToGroupTx.set(origIdx, -1);
        continue;
      }

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: SOL_CU_LIMIT }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SOL_MICRO_LAMPORTS }));
      tx.add(SystemProgram.transfer({ fromPubkey: sender.publicKey, toPubkey: recipient, lamports }));
      tx.recentBlockhash = blockhash;
      tx.feePayer = sender.publicKey;
      tx.sign(sender);

      itemToGroupTx.set(origIdx, signedTxBuffers.length);
      signedTxBuffers.push(tx.serialize({ requireAllSignatures: true }) as Buffer);
      txErrors.push(null);
    } catch (err) {
      itemToGroupTx.set(origIdx, signedTxBuffers.length);
      signedTxBuffers.push(null);
      txErrors.push((err as Error).message);
    }
  }

  // 3b. Build individual txs for non-SOL items (USDC, Token)
  // Auto-detect token program for the first token item
  const tokenItems = nonSolItems.filter(i => i.assetType === 'token' && i.tokenMint);
  let detectedTokenProgram = TOKEN_2022_PROGRAM_ID;
  if (tokenItems.length > 0) {
    try {
      const mintPk = new PublicKey(tokenItems[0].tokenMint!);
      const mintInfo = await connection.getAccountInfo(mintPk);
      if (mintInfo?.owner.equals(STANDARD_TOKEN_PROGRAM)) {
        detectedTokenProgram = STANDARD_TOKEN_PROGRAM;
      }
    } catch {}
  }

  for (const item of nonSolItems) {
    const origIdx = items.indexOf(item);
    try {
      const sender = Keypair.fromSecretKey(bs58.decode(item.fromPrivateKey));
      const recipient = new PublicKey(item.toPublicKey);
      const tx = new Transaction();

      if (item.assetType === 'usdc') {
        // USDC transfer + ATA creation: ~50k CU needed
        // Priority fee = 100,000 * 1,000 / 1,000,000 = 100 lamports
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
        const fromATA = getAssociatedTokenAddressSync(USDC_MINT_PK, sender.publicKey, false, STANDARD_TOKEN_PROGRAM);
        const toATA = getAssociatedTokenAddressSync(USDC_MINT_PK, recipient, false, STANDARD_TOKEN_PROGRAM);
        tx.add(createAssociatedTokenAccountIdempotentInstruction(sender.publicKey, toATA, recipient, USDC_MINT_PK, STANDARD_TOKEN_PROGRAM));
        const rawAmount = BigInt(Math.floor(item.amount * 10 ** USDC_DECIMALS));
        tx.add(createTransferCheckedInstruction(fromATA, USDC_MINT_PK, toATA, sender.publicKey, rawAmount, USDC_DECIMALS, [], STANDARD_TOKEN_PROGRAM));
      } else {
        // Token 2022 transfer + ATA creation: ~80k CU needed
        // Priority fee = 150,000 * 1,000 / 1,000,000 = 150 lamports
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
        const mint = new PublicKey(item.tokenMint!);
        const decimals = item.decimals ?? 6;
        const fromATA = getAssociatedTokenAddressSync(mint, sender.publicKey, false, detectedTokenProgram);
        const toATA = getAssociatedTokenAddressSync(mint, recipient, false, detectedTokenProgram);
        tx.add(createAssociatedTokenAccountIdempotentInstruction(sender.publicKey, toATA, recipient, mint, detectedTokenProgram));
        const rawAmount = BigInt(Math.floor(item.amount * 10 ** decimals));
        tx.add(createTransferCheckedInstruction(fromATA, mint, toATA, sender.publicKey, rawAmount, decimals, [], detectedTokenProgram));
      }

      tx.recentBlockhash = blockhash;
      tx.feePayer = sender.publicKey;
      tx.sign(sender);
      itemToGroupTx.set(origIdx, signedTxBuffers.length);
      signedTxBuffers.push(tx.serialize({ requireAllSignatures: true }) as Buffer);
      txErrors.push(null);
    } catch (err) {
      itemToGroupTx.set(origIdx, signedTxBuffers.length);
      signedTxBuffers.push(null);
      txErrors.push((err as Error).message);
    }
  }

  // 4. Fire all sendRawTransaction in batches with retry
  const validCount = signedTxBuffers.filter(b => b !== null).length;
  const txSignatures: (string | null)[] = new Array(signedTxBuffers.length).fill(null);

  // Send in concurrent batches (premium RPC = high throughput)
  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = 100;

  const sendOne = async (rawTx: Buffer, idx: number, retries = 3) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        txSignatures[idx] = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed',
        });
        return;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('429') || msg.includes('rate') || msg.includes('Too Many')) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        } else {
          txErrors[idx] = msg;
          return;
        }
      }
    }
    txErrors[idx] = 'Rate limited after retries';
  };

  // Collect valid tx indices
  const validIndices = signedTxBuffers.map((b, i) => b !== null ? i : -1).filter(i => i >= 0);

  for (let b = 0; b < validIndices.length; b += BATCH_SIZE) {
    const batch = validIndices.slice(b, b + BATCH_SIZE);
    await Promise.all(batch.map(idx => sendOne(signedTxBuffers[idx]!, idx)));
    if (b + BATCH_SIZE < validIndices.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // 5. Batch-confirm with getSignatureStatuses polling + rebroadcast
  const pendingSigs = txSignatures.filter((s): s is string => s !== null);
  const sigToRawTx = new Map<string, Buffer>();
  for (let i = 0; i < txSignatures.length; i++) {
    if (txSignatures[i] && signedTxBuffers[i]) {
      sigToRawTx.set(txSignatures[i]!, signedTxBuffers[i]!);
    }
  }

  const confirmed = new Set<string>();
  const failed = new Set<string>();
  const POLL_INTERVAL = pendingSigs.length <= 5 ? 1500 : 2000;
  const MAX_POLL_TIME = pendingSigs.length <= 5 ? 30_000 : 60_000;
  const REBROADCAST_AFTER = 8_000;
  const pollStart = Date.now();
  let rebroadcasted = false;

  while (
    confirmed.size + failed.size < pendingSigs.length &&
    Date.now() - pollStart < MAX_POLL_TIME
  ) {
    const toCheck = pendingSigs.filter(s => !confirmed.has(s) && !failed.has(s));
    if (toCheck.length === 0) break;

    // Rebroadcast unconfirmed txs once after 10s
    if (!rebroadcasted && Date.now() - pollStart > REBROADCAST_AFTER && toCheck.length > 0) {
      rebroadcasted = true;
      for (const sig of toCheck) {
        const rawTx = sigToRawTx.get(sig);
        if (rawTx) {
          try {
            await connection.sendRawTransaction(rawTx, {
              skipPreflight: true,
              maxRetries: 3,
              preflightCommitment: 'confirmed',
            });
          } catch { /* already sent, ignore */ }
        }
      }
    }

    for (let c = 0; c < toCheck.length; c += 256) {
      const chunk = toCheck.slice(c, c + 256);
      try {
        const statuses = await connection.getSignatureStatuses(chunk);
        for (let j = 0; j < chunk.length; j++) {
          const status = statuses.value[j];
          if (!status) continue;
          if (status.err) {
            failed.add(chunk[j]);
          } else if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed.add(chunk[j]);
          }
        }
      } catch { /* retry next poll */ }
    }

    if (confirmed.size + failed.size < pendingSigs.length) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }

  // 6. Build results — map each original item to its grouped tx result
  return items.map((item, i) => {
    const groupVal = itemToGroupTx.get(i);
    if (groupVal === -1) {
      return { walletId: item.walletId, signature: null, status: 'failed' as const, error: 'Insufficient SOL balance' };
    }

    const actualTxIdx = itemToGroupTx.get(i);
    if (actualTxIdx === undefined) {
      return { walletId: item.walletId, signature: null, status: 'failed' as const, error: 'Transaction not mapped' };
    }

    const sig = txSignatures[actualTxIdx] ?? null;
    const err = txErrors[actualTxIdx] ?? null;

    if (err && !sig) {
      return { walletId: item.walletId, signature: null, status: 'failed' as const, error: err };
    }
    if (!sig) {
      return { walletId: item.walletId, signature: null, status: 'failed' as const, error: 'Transaction not sent' };
    }
    if (confirmed.has(sig)) {
      return { walletId: item.walletId, signature: sig, status: 'confirmed' as const };
    }
    if (failed.has(sig)) {
      return { walletId: item.walletId, signature: sig, status: 'failed' as const, error: 'Transaction failed on-chain' };
    }
    return { walletId: item.walletId, signature: sig, status: 'timeout' as const, error: 'Confirmation timeout' };
  });
}
