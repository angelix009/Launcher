import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { sellExactTokenAmount, buyTokensForWallet, sellViaRaydium, buyViaRaydium, sellViaDlmm, buyViaDlmm } from '@/lib/sell';
import { getPoolInfo, isRaydiumPool, isDlmmPool, getQuoteMint } from '@/lib/pool-utils';
import type { PoolInfo } from '@/lib/pool-utils';
import type { WalletEntry } from '@/types';
import { PublicKey } from '@solana/web3.js';

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
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    if (res.ok) {
      const data = await res.json();
      return parseFloat(data.data?.[WSOL_MINT]?.price || '0');
    }
  } catch {}
  return 150;
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
    } = body;

    if (!poolAddress || !tokenMint) {
      return NextResponse.json({ success: false, error: 'Missing poolAddress or tokenMint' }, { status: 400 });
    }

    const connection = getConnection(network || 'mainnet-beta');
    const ownWalletSet = new Set<string>(ownWallets || []);
    const ownSigSet = new Set<string>(body.ownSignatures || []);
    const events: ChartManagerEvent[] = [];

    // Build pool contexts
    const pool1Info = await getPoolInfo(connection, poolAddress);
    const pool1 = buildPoolContext(poolAddress, pool1Info, tokenMint);

    let pool2: PoolContext | null = null;
    if (poolAddress2?.trim()) {
      const pool2Info = await getPoolInfo(connection, poolAddress2.trim());
      pool2 = buildPoolContext(poolAddress2.trim(), pool2Info, tokenMint);
    }

    // Fetch SOL price if any pool uses SOL as quote
    let solPrice = 0;
    if (pool1.quoteIsSOL || pool2?.quoteIsSOL) {
      solPrice = await fetchSolPrice();
      console.log('[CM] SOL price:', solPrice);
    }

    // Step 1: Get new signatures from pool 1
    const sigParams1: any = { limit: 50 };
    if (lastSignature) sigParams1.until = lastSignature;

    const signatures1 = await connection.getSignaturesForAddress(new PublicKey(poolAddress), sigParams1);
    let newLastSig = signatures1.length > 0 ? signatures1[0].signature : (lastSignature || null);

    // Get new signatures from pool 2
    let newLastSig2 = lastSignature2 || null;
    let signatures2: any[] = [];
    if (pool2) {
      const sigParams2: any = { limit: 50 };
      if (lastSignature2) sigParams2.until = lastSignature2;
      signatures2 = await connection.getSignaturesForAddress(new PublicKey(poolAddress2.trim()), sigParams2);
      if (signatures2.length > 0) newLastSig2 = signatures2[0].signature;
    }

    const totalSigs = signatures1.length + signatures2.length;

    if (totalSigs === 0) {
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: lastSignature || null, lastSignature2: newLastSig2 },
      });
    }

    // First poll baseline
    if (!lastSignature && signatures1.length > 0) {
      console.log('[CM] First poll — baseline pool1:', newLastSig?.slice(0, 12));
      if (!lastSignature2 && signatures2.length > 0) {
        console.log('[CM] First poll — baseline pool2:', newLastSig2?.slice(0, 12));
      }
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: newLastSig, lastSignature2: newLastSig2 },
      });
    }

    // Step 2: Merge and deduplicate signatures, tag with pool
    const sigPoolMap = new Map<string, PoolContext>();
    for (const s of signatures1) {
      if (lastSignature) sigPoolMap.set(s.signature, pool1);
    }
    if (pool2 && lastSignature2) {
      for (const s of signatures2) {
        if (!sigPoolMap.has(s.signature)) sigPoolMap.set(s.signature, pool2);
      }
    }

    const allSigList = [...sigPoolMap.keys()];
    console.log('[CM] Processing', allSigList.length, 'signatures (pool1:', signatures1.length, 'pool2:', signatures2.length, ')');

    // Step 3: Fetch parsed transactions from Helius
    const parsedTxs = await fetchParsedTransactions(allSigList);
    console.log('[CM] Helius returned', parsedTxs.length, 'parsed txs');

    // Step 4: Detect external trades via vault flow cross-validation
    const trades: DetectedTrade[] = [];

    for (const tx of parsedTxs) {
      if (!tx) continue;
      if (tx.transactionError) continue;
      if (ownSigSet.has(tx.signature)) continue;

      const feePayer = tx.feePayer || '';
      if (ownWalletSet.has(feePayer)) continue;

      const transfers = tx.tokenTransfers || [];
      const pool = sigPoolMap.get(tx.signature) || pool1;

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

        const eligible = sellWallets.filter((w: WalletEntry) => w.tokenBalance >= trade.tokenAmount);
        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: `No wallets with enough tokens (need ≥${Math.ceil(trade.tokenAmount).toLocaleString()} tokens)`,
          });
          continue;
        }

        const wallet = eligible[Math.floor(Math.random() * eligible.length)];
        const sellAmount = Math.min(trade.tokenAmount, wallet.tokenBalance);

        try {
          const result = await executeSell(connection, trade.pool, tokenMint, wallet, sellAmount, slippageBps || 100, tokenDecimals || 6);

          if (result.signature) {
            wallet.tokenBalance -= result.amountSold;
            events.push({
              id: `sell-${eventId}`, timestamp: new Date().toISOString(), type: 'counter-sell',
              tokenAmount: result.amountSold, dollarAmount: result.quoteReceived || 0,
              signature: trade.signature, counterSignature: result.signature,
              wallet: wallet.publicKey.slice(0, 8),
              message: `${poolLabel} Counter-sold ${result.amountSold.toLocaleString()} tokens via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
            });
          } else {
            events.push({
              id: `err-${eventId}`, timestamp: new Date().toISOString(), type: 'error',
              tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
              message: `${poolLabel} Counter-sell failed: ${result.error}`,
            });
          }
        } catch (err) {
          events.push({
            id: `err-${eventId}`, timestamp: new Date().toISOString(), type: 'error',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: `${poolLabel} Counter-sell error: ${(err as Error).message}`,
          });
        }
      }

      // Counter-buy on external sell (pool1 only)
      if (trade.type === 'external-sell' && trade.pool !== pool2 && (mode === 'buy-on-sell' || mode === 'both')) {
        const buyWallets = (body.buyWallets || []) as WalletEntry[];
        const eligible = trade.pool.quoteIsSOL
          ? buyWallets.filter((w: WalletEntry) => (w.solBalance || 0) > 0.01).sort((a: WalletEntry, b: WalletEntry) => (b.solBalance || 0) - (a.solBalance || 0))
          : buyWallets.filter((w: WalletEntry) => (w.usdcBalance || 0) > 0.001).sort((a: WalletEntry, b: WalletEntry) => b.usdcBalance - a.usdcBalance);

        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`, timestamp: new Date().toISOString(), type: 'skip',
            tokenAmount: trade.tokenAmount, dollarAmount: trade.dollarAmount, signature: trade.signature,
            message: 'No wallets with quote available for counter-buy',
          });
          continue;
        }

        let remaining = trade.quoteAmount;
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
            const result = await executeBuy(connection, trade.pool, tokenMint, wallet, spendAmount, slippageBps || 100, tokenDecimals || 6);

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

    // Bonus micro-buy after each successful counter-trade (on both pools)
    const allBuyWallets = (body.buyWallets || []) as WalletEntry[];
    const counterEvents = events.filter(e => (e.type === 'counter-sell' || e.type === 'counter-buy') && e.counterSignature);

    for (const ce of counterEvents) {
      const microDollar = 1 + Math.random() * 2; // $1-$3
      const isPool2Event = ce.message?.startsWith('[SOL]');
      const microPool = (isPool2Event && pool2) ? pool2 : pool1;
      const microIsSOL = microPool.quoteIsSOL;
      const microAmount = microIsSOL ? microDollar / solPrice : microDollar;

      const eligible = allBuyWallets
        .filter((w: WalletEntry) => {
          if (w.publicKey.slice(0, 8) === ce.wallet) return false;
          return microIsSOL
            ? (w.solBalance || 0) >= microAmount
            : (w.usdcBalance || 0) >= microAmount;
        })
        .sort(() => Math.random() - 0.5);

      if (eligible.length === 0) continue;

      const microWallet = eligible[0];
      const microId = `micro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const poolLabel = microPool === pool2 ? '[SOL]' : '[USDC]';

      try {
        const result = await executeBuy(connection, microPool, tokenMint, microWallet, microAmount, slippageBps || 100, tokenDecimals || 6);

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
