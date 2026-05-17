import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { sellExactTokenAmount, buyTokensForWallet, sellViaRaydium, buyViaRaydium, sellViaDlmm, buyViaDlmm } from '@/lib/sell';
import { getPoolInfo, isRaydiumPool, isDlmmPool, getQuoteMint } from '@/lib/pool-utils';
import type { PoolInfo } from '@/lib/pool-utils';
import type { WalletEntry } from '@/types';
import { PublicKey, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

const QUOTE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'So11111111111111111111111111111111111111112',      // Wrapped SOL
]);

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

interface PoolContext {
  poolAddress: string;
  poolInfo: PoolInfo;
  quoteMint: string;
  tokenVault: string;
  quoteVault: string;
  quoteIsSOL: boolean;
}

interface DetectedTrade {
  signature: string;
  type: 'external-buy' | 'external-sell';
  tokenAmount: number;
  quoteAmount: number;
  dollarAmount: number;
  trader: string;
  timestamp: number;
  pool: PoolContext;
}

interface ChartManagerEvent {
  id: string;
  timestamp: string;
  type: 'external-buy' | 'external-sell' | 'counter-sell' | 'counter-buy' | 'error' | 'skip';
  tokenAmount: number;
  dollarAmount: number;
  signature: string;
  counterSignature?: string;
  wallet?: string;
  message: string;
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json();
      const price = data?.solana?.usd;
      if (price && price > 0) return price;
    }
  } catch {}
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${WSOL_MINT}`);
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.data?.[WSOL_MINT]?.price || '0');
      if (price > 0) return price;
    }
  } catch {}
  return 84;
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function jupiterSwapSolToUsdc(wallet: WalletEntry, solAmount: number): Promise<{ signature: string; usdcReceived: number }> {
  const amountLamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  if (amountLamports < 10000) throw new Error('SOL amount too small to swap');

  const quoteRes = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${amountLamports}&slippageBps=300`);
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${await quoteRes.text()}`);
  const quote = await quoteRes.json();

  let kp: Keypair;
  try { kp = Keypair.fromSecretKey(bs58.decode(wallet.privateKey)); }
  catch { kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(wallet.privateKey))); }

  const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, prioritizationFeeLamports: 'auto' }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${await swapRes.text()}`);
  const swapData = await swapRes.json();

  const { Connection } = await import('@solana/web3.js');
  const conn = new Connection(RPC_URL, 'confirmed');
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([kp]);

  let sig: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
      await conn.confirmTransaction(sig, 'confirmed');
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!sig) throw new Error('Failed to send swap transaction');

  const usdcReceived = parseInt(quote.outAmount) / 1_000_000;
  console.log(`[CM] Auto-swap: ${solAmount.toFixed(4)} SOL → ${usdcReceived.toFixed(2)} USDC (${sig})`);
  return { signature: sig, usdcReceived };
}

function buildPoolContext(poolAddress: string, poolInfo: PoolInfo, tokenMint: string): PoolContext {
  const quoteMint = getQuoteMint(poolInfo, tokenMint);
  const tokenVault = poolInfo.tokenAMint === tokenMint ? poolInfo.tokenAVault : poolInfo.tokenBVault;
  const quoteVault = poolInfo.tokenAMint === tokenMint ? poolInfo.tokenBVault : poolInfo.tokenAVault;
  return { poolAddress, poolInfo, quoteMint, tokenVault, quoteVault, quoteIsSOL: quoteMint === WSOL_MINT };
}

async function executeSell(
  connection: any, pool: PoolContext, tokenMint: string,
  wallet: WalletEntry, amount: number, slippageBps: number, tokenDecimals: number,
) {
  if (isRaydiumPool(pool.poolInfo.type)) {
    return sellViaRaydium(connection, pool.poolAddress, pool.poolInfo.type, tokenMint, pool.quoteMint, wallet, amount, slippageBps, tokenDecimals);
  } else if (isDlmmPool(pool.poolInfo.type)) {
    return sellViaDlmm(connection, pool.poolAddress, tokenMint, pool.quoteMint, wallet, amount, slippageBps, tokenDecimals);
  }
  return sellExactTokenAmount(connection, pool.poolAddress, tokenMint, wallet, amount, slippageBps, tokenDecimals);
}

async function executeBuy(
  connection: any, pool: PoolContext, tokenMint: string,
  wallet: WalletEntry, quoteAmount: number, slippageBps: number, tokenDecimals: number,
) {
  if (isRaydiumPool(pool.poolInfo.type)) {
    return buyViaRaydium(connection, pool.poolAddress, pool.poolInfo.type, tokenMint, pool.quoteMint, wallet, quoteAmount, slippageBps, tokenDecimals);
  } else if (isDlmmPool(pool.poolInfo.type)) {
    return buyViaDlmm(connection, pool.poolAddress, tokenMint, pool.quoteMint, wallet, quoteAmount, slippageBps, tokenDecimals);
  }
  return buyTokensForWallet(connection, pool.poolAddress, tokenMint, wallet, quoteAmount, slippageBps, tokenDecimals);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      poolAddress,
      poolAddress2,
      tokenMint,
      ownWallets,
      lastSignature,
      lastSignature2,
      minDollar,
      mode,
      sellWallets,
      slippageBps,
      tokenDecimals,
      network,
      accumulatedBuyDollars,
      accumulatedBuyTokens,
      accumThreshold,
    } = body;

    if (!poolAddress || !tokenMint) {
      return NextResponse.json({ success: false, error: 'Missing poolAddress or tokenMint' }, { status: 400 });
    }

    const connection = getConnection(network || 'mainnet-beta');
    const ownWalletSet = new Set<string>(ownWallets || []);
    const ownSigSet = new Set<string>(body.ownSignatures || []);
    const processedTradesSet = new Set<string>(body.processedTrades || []);
    const events: ChartManagerEvent[] = [];

    // Parallel batch: pool info + signatures + SOL price — all at once
    const hasPool2 = !!poolAddress2?.trim();
    const sigParams1: any = { limit: 50 };
    if (lastSignature) sigParams1.until = lastSignature;

    const parallelPromises: Promise<any>[] = [
      getPoolInfo(connection, poolAddress),
      connection.getSignaturesForAddress(new PublicKey(poolAddress), sigParams1),
      lastSignature ? connection.getSignaturesForAddress(new PublicKey(poolAddress), { limit: 50 }) : Promise.resolve([]),
      fetchSolPrice(),
    ];

    if (hasPool2) {
      const sigParams2: any = { limit: 50 };
      if (lastSignature2) sigParams2.until = lastSignature2;
      parallelPromises.push(
        getPoolInfo(connection, poolAddress2.trim()),
        connection.getSignaturesForAddress(new PublicKey(poolAddress2.trim()), sigParams2),
        lastSignature2 ? connection.getSignaturesForAddress(new PublicKey(poolAddress2.trim()), { limit: 50 }) : Promise.resolve([]),
      );
    }

    const parallelResults = await Promise.all(parallelPromises);

    const pool1Info = parallelResults[0];
    const pool1 = buildPoolContext(poolAddress, pool1Info, tokenMint);
    const signatures1 = parallelResults[1];
    const rawSafety1 = parallelResults[2];
    const solPrice = parallelResults[3] as number;

    let newLastSig = signatures1.length > 0 ? signatures1[0].signature : (lastSignature || null);
    let safetyNet1: any[] = [];
    if (lastSignature && rawSafety1.length > 0) {
      const cutoff = rawSafety1.findIndex((s: any) => s.signature === lastSignature);
      safetyNet1 = cutoff >= 0 ? rawSafety1.slice(0, cutoff) : [];
      if (safetyNet1.length > 0) newLastSig = safetyNet1[0].signature;
    }

    let pool2: PoolContext | null = null;
    let newLastSig2 = lastSignature2 || null;
    let signatures2: any[] = [];
    let safetyNet2: any[] = [];
    if (hasPool2) {
      const pool2Info = parallelResults[4];
      pool2 = buildPoolContext(poolAddress2.trim(), pool2Info, tokenMint);
      signatures2 = parallelResults[5];
      const rawSafety2 = parallelResults[6];
      if (signatures2.length > 0) newLastSig2 = signatures2[0].signature;
      if (lastSignature2 && rawSafety2.length > 0) {
        const cutoff2 = rawSafety2.findIndex((s: any) => s.signature === lastSignature2);
        safetyNet2 = cutoff2 >= 0 ? rawSafety2.slice(0, cutoff2) : [];
        if (safetyNet2.length > 0) newLastSig2 = safetyNet2[0].signature;
      }
    }

    const totalSigs = signatures1.length + signatures2.length + safetyNet1.length + safetyNet2.length;

    const accumDollars = accumulatedBuyDollars || 0;
    const accumTokens = accumulatedBuyTokens || 0;
    const accumThresh = accumThreshold || 25;
    const needsAccumSell = accumDollars >= accumThresh && accumTokens > 0 && (mode === 'sell-on-buy' || mode === 'both');

    if (totalSigs === 0 && !needsAccumSell) {
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: lastSignature || null, lastSignature2: newLastSig2 },
      });
    }

    // First poll baseline
    if (!lastSignature && (signatures1.length > 0 || safetyNet1.length > 0)) {
      console.log('[CM] First poll — baseline pool1:', newLastSig?.slice(0, 12));
      if (!lastSignature2 && (signatures2.length > 0 || safetyNet2.length > 0)) {
        console.log('[CM] First poll — baseline pool2:', newLastSig2?.slice(0, 12));
      }
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: newLastSig, lastSignature2: newLastSig2 },
      });
    }

    // Step 2: Merge and deduplicate signatures, tag with pool(s) — one sig can touch both pools (routed trades)
    const sigPoolMap = new Map<string, PoolContext[]>();
    const addSigPool = (sig: string, pool: PoolContext) => {
      const existing = sigPoolMap.get(sig);
      if (existing) { if (!existing.includes(pool)) existing.push(pool); }
      else sigPoolMap.set(sig, [pool]);
    };
    for (const s of signatures1) {
      if (lastSignature && !processedTradesSet.has(s.signature)) {
        addSigPool(s.signature, pool1);
      }
    }
    for (const s of safetyNet1) {
      if (!processedTradesSet.has(s.signature)) {
        addSigPool(s.signature, pool1);
      }
    }
    if (pool2 && lastSignature2) {
      for (const s of signatures2) {
        if (!processedTradesSet.has(s.signature)) {
          addSigPool(s.signature, pool2);
        }
      }
      for (const s of safetyNet2) {
        if (!processedTradesSet.has(s.signature)) {
          addSigPool(s.signature, pool2);
        }
      }
    }

    const allSigList = [...sigPoolMap.keys()];
    console.log('[CM] Processing', allSigList.length, 'signatures (new:', signatures1.length + signatures2.length, 'safety:', safetyNet1.length + safetyNet2.length, ')');

    // Step 3: Fetch parsed transactions from Helius
    const parsedTxs = await fetchParsedTransactions(allSigList);
    console.log('[CM] Helius returned', parsedTxs.length, 'parsed txs');

    // Step 4: Detect external trades via vault flow cross-validation — analyze each pool independently
    const trades: DetectedTrade[] = [];

    for (const tx of parsedTxs) {
      if (!tx) continue;
      if (tx.transactionError) continue;
      if (ownSigSet.has(tx.signature)) continue;
      if (processedTradesSet.has(tx.signature)) continue;

      const feePayer = tx.feePayer || '';
      if (ownWalletSet.has(feePayer)) continue;

      const transfers = tx.tokenTransfers || [];
      const pools = sigPoolMap.get(tx.signature) || [pool1];

      for (const pool of pools) {
        let tokenFromVault = 0;
        let tokenToVault = 0;
        let quoteFromVault = 0;
        let quoteToVault = 0;

        for (const t of transfers) {
          const mint = t.mint || '';
          const amount = t.tokenAmount || 0;
          if (amount <= 0) continue;

          const fromAcct = t.fromTokenAccount || t.fromUserAccount || '';
          const toAcct = t.toTokenAccount || t.toUserAccount || '';

          if (mint === tokenMint) {
            if (fromAcct === pool.tokenVault) tokenFromVault += amount;
            if (toAcct === pool.tokenVault) tokenToVault += amount;
          }

          if (QUOTE_MINTS.has(mint)) {
            if (fromAcct === pool.quoteVault) quoteFromVault += amount;
            if (toAcct === pool.quoteVault) quoteToVault += amount;
          }
        }

        const netTokenOut = tokenFromVault - tokenToVault;
        const netQuoteOut = quoteFromVault - quoteToVault;

        if (netTokenOut > 0 && netQuoteOut < 0) {
          const quoteAmount = Math.abs(netQuoteOut);
          const dollarAmount = pool.quoteIsSOL ? quoteAmount * solPrice : quoteAmount;
          if (dollarAmount >= (minDollar || 0)) {
            trades.push({
              signature: tx.signature, type: 'external-buy',
              tokenAmount: netTokenOut, quoteAmount, dollarAmount,
              trader: feePayer, timestamp: tx.timestamp || 0, pool,
            });
          } else if (dollarAmount > 0) {
            const poolLabel = pool === pool2 ? '[SOL]' : '[USDC]';
            events.push({
              id: `sub-${tx.signature.slice(0, 12)}-${pool === pool2 ? 'p2' : 'p1'}`, timestamp: new Date().toISOString(),
              type: 'sub-threshold' as any, tokenAmount: netTokenOut, dollarAmount,
              signature: tx.signature,
              message: `${poolLabel} Small buy $${dollarAmount.toFixed(2)} by ${feePayer.slice(0, 8)}...`,
            });
          }
        } else if (netTokenOut < 0 && netQuoteOut > 0) {
          const tokenAmount = Math.abs(netTokenOut);
          const dollarAmount = pool.quoteIsSOL ? netQuoteOut * solPrice : netQuoteOut;
          if (dollarAmount >= (minDollar || 0)) {
            trades.push({
              signature: tx.signature, type: 'external-sell',
              tokenAmount, quoteAmount: netQuoteOut, dollarAmount,
              trader: feePayer, timestamp: tx.timestamp || 0, pool,
            });
          }
        }
      }
    }

    console.log('[CM] Detected', trades.length, 'trades above threshold');

    // Step 5: Execute counter-trades

    for (const trade of trades) {
      const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const poolLabel = trade.pool === pool2 ? '[SOL]' : '[USDC]';

      events.push({
        id: `det-${eventId}`,
        timestamp: new Date().toISOString(),
        type: trade.type,
        tokenAmount: trade.tokenAmount,
        dollarAmount: trade.dollarAmount,
        signature: trade.signature,
        message: `${poolLabel} ${trade.type === 'external-buy' ? 'Buy' : 'Sell'} detected: ${trade.tokenAmount.toLocaleString()} tokens ($${trade.dollarAmount.toFixed(2)}) by ${trade.trader.slice(0, 8)}...`,
      });

      // Counter-sell on external buy
      if (trade.type === 'external-buy' && (mode === 'sell-on-buy' || mode === 'both')) {
        if (!sellWallets || sellWallets.length === 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: 'No wallets with tokens available for counter-sell',
          });
          continue;
        }

        const minSellable = 1 / 10 ** (tokenDecimals || 6);
        const eligible = sellWallets
          .filter((w: WalletEntry) => w.tokenBalance > minSellable && (w.solBalance || 0) >= 0.03)
          .sort((a: WalletEntry, b: WalletEntry) => b.tokenBalance - a.tokenBalance);

        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: 'No wallets with tokens + SOL for fees available for counter-sell',
          });
          continue;
        }

        let remaining = trade.tokenAmount;

        for (const wallet of eligible) {
          if (remaining <= minSellable) break;

          const sellAmount = Math.min(remaining, wallet.tokenBalance);
          if (sellAmount <= minSellable) continue;

          try {
            const result = await executeSell(connection, trade.pool, tokenMint, wallet, sellAmount, 10000, tokenDecimals || 6);

            if (result.signature) {
              remaining -= result.amountSold;
              wallet.tokenBalance -= result.amountSold;
              events.push({
                id: `sell-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'counter-sell',
                tokenAmount: result.amountSold, dollarAmount: result.quoteReceived || 0,
                signature: trade.signature, counterSignature: result.signature,
                wallet: wallet.publicKey.slice(0, 8),
                message: `${poolLabel} Counter-sold ${result.amountSold.toLocaleString()} tokens via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
              });

              const solReceived = result.quoteReceived || 0;
              if (trade.pool.quoteIsSOL && solReceived > 0) {
                try {
                  console.log(`[CM] Waiting for sell tx confirmation before swap: ${result.signature}`);
                  await connection.confirmTransaction(result.signature, 'confirmed');
                  console.log(`[CM] Sell confirmed, swapping ${solReceived.toFixed(4)} SOL → USDC`);
                  const swapResult = await jupiterSwapSolToUsdc(wallet, solReceived);
                  if (swapResult.signature) {
                    events.push({
                      id: `swap-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'counter-sell',
                      tokenAmount: 0, dollarAmount: swapResult.usdcReceived,
                      signature: result.signature, counterSignature: swapResult.signature,
                      wallet: wallet.publicKey.slice(0, 8),
                      message: `[SOL→USDC] Auto-swapped ${solReceived.toFixed(4)} SOL → ${swapResult.usdcReceived.toFixed(2)} USDC via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
                    });
                  }
                } catch (swapErr) {
                  const swapErrMsg = (swapErr as Error).message;
                  console.error('[CM] Auto-swap SOL→USDC failed:', swapErrMsg);
                  events.push({
                    id: `swap-err-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'error',
                    tokenAmount: 0, dollarAmount: solReceived,
                    signature: result.signature,
                    message: `[SOL→USDC] Auto-swap failed: ${swapErrMsg.slice(0, 100)}`,
                  });
                }
              }
            } else {
              events.push({
                id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'error',
                tokenAmount: sellAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
                message: `${poolLabel} Counter-sell failed on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${result.error}`,
              });
            }
          } catch (err) {
            events.push({
              id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'error',
              tokenAmount: sellAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
              message: `${poolLabel} Counter-sell error on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${(err as Error).message}`,
            });
          }
        }

        if (remaining > 0.01) {
          events.push({
            id: `warn-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: remaining, dollarAmount: 0, signature: trade.signature,
            message: `${poolLabel} Insufficient tokens across all wallets — ${remaining.toLocaleString()} tokens not covered`,
          });
        }
      }

      // Counter-buy on external sell (both pools)
      if (trade.type === 'external-sell' && (mode === 'buy-on-sell' || mode === 'both')) {
        const buyWallets = (body.buyWallets || []) as WalletEntry[];
        const eligible = trade.pool.quoteIsSOL
          ? buyWallets.filter((w: WalletEntry) => (w.solBalance || 0) > 0.03).sort((a: WalletEntry, b: WalletEntry) => (b.solBalance || 0) - (a.solBalance || 0))
          : buyWallets.filter((w: WalletEntry) => (w.usdcBalance || 0) > 0.001 && (w.solBalance || 0) >= 0.03).sort((a: WalletEntry, b: WalletEntry) => b.usdcBalance - a.usdcBalance);

        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: 'No wallets with quote available for counter-buy',
          });
          continue;
        }

        let remaining = trade.quoteAmount * 1.005;
        if (remaining <= 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: 0, signature: trade.signature,
            message: 'Could not determine quote amount for counter-buy',
          });
          continue;
        }

        for (const wallet of eligible) {
          if (remaining <= 0.001) break;

          const available = trade.pool.quoteIsSOL ? wallet.solBalance || 0 : wallet.usdcBalance || 0;
          const spendAmount = Math.min(remaining, available);
          if (spendAmount < 0.001) continue;

          try {
            const result = await executeBuy(connection, trade.pool, tokenMint, wallet, spendAmount, 10000, tokenDecimals || 6);

            if (result.signature) {
              remaining -= result.quoteSpent;
              if (trade.pool.quoteIsSOL) {
                wallet.solBalance = Math.max(0, (wallet.solBalance || 0) - result.quoteSpent);
              } else {
                wallet.usdcBalance = Math.max(0, (wallet.usdcBalance || 0) - result.quoteSpent);
              }
              events.push({
                id: `buy-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'counter-buy',
                tokenAmount: result.tokensReceived, dollarAmount: result.quoteSpent,
                signature: trade.signature, counterSignature: result.signature,
                wallet: wallet.publicKey.slice(0, 8),
                message: `${poolLabel} Counter-bought ${result.tokensReceived.toLocaleString()} tokens for ${result.quoteSpent.toFixed(4)} ${result.quoteSymbol} via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
              });
            } else {
              events.push({
                id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'error',
                tokenAmount: trade.tokenAmount, dollarAmount: spendAmount, signature: trade.signature,
                message: `${poolLabel} Counter-buy failed on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${result.error}`,
              });
            }
          } catch (err) {
            events.push({
              id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`, timestamp: new Date().toISOString(), type: 'error',
              tokenAmount: trade.tokenAmount, dollarAmount: spendAmount, signature: trade.signature,
              message: `${poolLabel} Counter-buy error on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${(err as Error).message}`,
            });
          }
        }

        if (remaining > 0.01) {
          events.push({
            id: `warn-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: 0, dollarAmount: remaining, signature: trade.signature,
            message: `${poolLabel} Insufficient quote across all wallets — ${remaining.toFixed(4)} not covered`,
          });
        }
      }
    }

    // Accumulated buy counter-sell
    if (needsAccumSell && sellWallets && sellWallets.length > 0) {
      const minSellable = 1 / 10 ** (tokenDecimals || 6);
      const accumEligible = sellWallets
        .filter((w: WalletEntry) => w.tokenBalance > minSellable && (w.solBalance || 0) >= 0.03)
        .sort((a: WalletEntry, b: WalletEntry) => b.tokenBalance - a.tokenBalance);

      if (accumEligible.length > 0) {
        let remaining = accumTokens * 0.75;
        let accumSold = false;

        for (const wallet of accumEligible) {
          if (remaining <= minSellable) break;
          const sellAmount = Math.min(remaining, wallet.tokenBalance);
          if (sellAmount <= minSellable) continue;

          try {
            const result = await executeSell(connection, pool1, tokenMint, wallet, sellAmount, 10000, tokenDecimals || 6);
            if (result.signature) {
              remaining -= result.amountSold;
              wallet.tokenBalance -= result.amountSold;
              accumSold = true;
              events.push({
                id: `accum-sell-${Date.now()}-${wallet.publicKey.slice(0, 6)}`,
                timestamp: new Date().toISOString(), type: 'counter-sell',
                tokenAmount: result.amountSold, dollarAmount: result.quoteReceived || 0,
                signature: 'accumulated', counterSignature: result.signature,
                wallet: wallet.publicKey.slice(0, 8),
                message: `[ACCUM] Counter-sold ${result.amountSold.toLocaleString()} tokens ($${accumDollars.toFixed(2)} accumulated) via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
              });
            }
          } catch {}
        }

        if (accumSold) {
          events.push({
            id: `accum-reset-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'accum-reset' as any, tokenAmount: 0, dollarAmount: accumDollars,
            signature: 'accumulated',
            message: `[ACCUM] Reset accumulator ($${accumDollars.toFixed(2)})`,
          });
        }
      }
    }

    // Bonus micro-buy after each successful counter-trade (on both pools)
    const allBuyWallets = (body.buyWallets || []) as WalletEntry[];
    const counterEvents = events.filter(e =>
      (e.type === 'counter-sell' || e.type === 'counter-buy')
      && e.counterSignature
      && !e.message?.startsWith('[SOL→USDC]')
    );

    for (const ce of counterEvents) {
      const microDollar = 1 + Math.random() * 2; // $1-$3
      const isPool2Event = ce.message?.includes('[SOL]');
      const microPool = (isPool2Event && pool2) ? pool2 : pool1;
      const microIsSOL = microPool.quoteIsSOL;
      const microAmount = microIsSOL ? microDollar / solPrice : microDollar;

      const eligible = allBuyWallets
        .filter((w: WalletEntry) => {
          if (w.publicKey.slice(0, 8) === ce.wallet) return false;
          if ((w.solBalance || 0) < 0.03) return false;
          return microIsSOL
            ? (w.solBalance || 0) >= microAmount + 0.03
            : (w.usdcBalance || 0) >= microAmount;
        })
        .sort(() => Math.random() - 0.5);

      if (eligible.length === 0) continue;

      const microWallet = eligible[0];
      const microId = `micro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const poolLabel = microPool === pool2 ? '[SOL]' : '[USDC]';

      try {
        const result = await executeBuy(connection, microPool, tokenMint, microWallet, microAmount, 10000, tokenDecimals || 6);

        if (result.signature) {
          if (microIsSOL) {
            microWallet.solBalance = Math.max(0, (microWallet.solBalance || 0) - result.quoteSpent);
          } else {
            microWallet.usdcBalance = Math.max(0, (microWallet.usdcBalance || 0) - result.quoteSpent);
          }
          const displayAmount = microIsSOL ? `${result.quoteSpent.toFixed(4)} SOL (~$${(result.quoteSpent * solPrice).toFixed(2)})` : `$${result.quoteSpent.toFixed(2)}`;
          events.push({
            id: microId, timestamp: new Date().toISOString(), type: 'counter-buy',
            tokenAmount: result.tokensReceived, dollarAmount: microIsSOL ? result.quoteSpent * solPrice : result.quoteSpent,
            signature: ce.counterSignature!, counterSignature: result.signature,
            wallet: microWallet.publicKey.slice(0, 8),
            message: `${poolLabel} Micro-buy ${displayAmount} via ${microWallet.label || microWallet.publicKey.slice(0, 8)}`,
          });
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: {
        events,
        lastSignature: newLastSig,
        lastSignature2: newLastSig2,
        tradesDetected: trades.length,
      },
    });
  } catch (err) {
    console.error('[CM] Poll error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

async function fetchParsedTransactions(signatures: string[]): Promise<any[]> {
  if (signatures.length === 0) return [];

  const url = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;

  const batches: string[][] = [];
  for (let i = 0; i < signatures.length; i += 100) {
    batches.push(signatures.slice(i, i + 100));
  }

  const results: any[] = [];
  for (const batch of batches) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: batch }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push(...data);
      } else {
        console.error('[CM] Helius error:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('[CM] Helius fetch error:', err);
    }
  }

  return results;
}
