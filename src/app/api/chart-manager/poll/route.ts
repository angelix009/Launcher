import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { sellExactTokenAmount, buyTokensForWallet, sellViaRaydium, buyViaRaydium } from '@/lib/sell';
import { getPoolInfo, isRaydiumPool, getQuoteMint } from '@/lib/pool-utils';
import type { WalletEntry } from '@/types';
import { PublicKey } from '@solana/web3.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

const QUOTE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'So11111111111111111111111111111111111111112',      // Wrapped SOL
]);

interface DetectedTrade {
  signature: string;
  type: 'external-buy' | 'external-sell';
  tokenAmount: number;
  dollarAmount: number;
  trader: string;
  timestamp: number;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      poolAddress,
      tokenMint,
      ownWallets,
      lastSignature,
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

    const poolInfo = await getPoolInfo(connection, poolAddress);
    const tokenAVault = poolInfo.tokenAVault;
    const tokenBVault = poolInfo.tokenBVault;
    const useJupiter = isRaydiumPool(poolInfo.type);
    const quoteMint = getQuoteMint(poolInfo, tokenMint);

    // Step 1: Get new signatures since lastSignature
    const sigParams: any = { limit: 50 };
    if (lastSignature) {
      sigParams.until = lastSignature;
    }

    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(poolAddress),
      sigParams,
    );

    if (signatures.length === 0) {
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: lastSignature || null },
      });
    }

    const newLastSig = signatures[0].signature;

    if (!lastSignature) {
      console.log('[CM] First poll — baseline set:', newLastSig.slice(0, 12));
      return NextResponse.json({
        success: true,
        data: { events: [], lastSignature: newLastSig },
      });
    }

    console.log('[CM] Processing', signatures.length, 'new signatures');

    // Step 2: Fetch parsed transactions from Helius
    const sigList = signatures.map(s => s.signature);
    const parsedTxs = await fetchParsedTransactions(sigList);

    console.log('[CM] Helius returned', parsedTxs.length, 'parsed txs');

    // Step 3: Detect external trades via vault flow cross-validation
    const trades: DetectedTrade[] = [];

    for (const tx of parsedTxs) {
      if (!tx) continue;

      if (tx.transactionError) continue;

      if (ownSigSet.has(tx.signature)) continue;

      const feePayer = tx.feePayer || '';

      if (ownWalletSet.has(feePayer)) continue;

      const transfers = tx.tokenTransfers || [];
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
          if (fromAcct === tokenAVault) tokenFromVault += amount;
          if (toAcct === tokenAVault) tokenToVault += amount;
        }

        if (QUOTE_MINTS.has(mint)) {
          if (fromAcct === tokenBVault) quoteFromVault += amount;
          if (toAcct === tokenBVault) quoteToVault += amount;
        }
      }

      // Net flows: positive = outflow from vault, negative = inflow to vault
      const netTokenOut = tokenFromVault - tokenToVault;
      const netQuoteOut = quoteFromVault - quoteToVault;

      // Cross-flow validation: swap = token and quote flow opposite directions
      // BUY  → tokens leave vault (netTokenOut > 0), quote enters vault (netQuoteOut < 0)
      // SELL → tokens enter vault (netTokenOut < 0), quote leaves vault (netQuoteOut > 0)
      // LP add/remove → both flow same direction → excluded

      if (netTokenOut > 0 && netQuoteOut < 0) {
        const dollarAmount = Math.abs(netQuoteOut);
        if (dollarAmount >= (minDollar || 0)) {
          trades.push({
            signature: tx.signature,
            type: 'external-buy',
            tokenAmount: netTokenOut,
            dollarAmount,
            trader: feePayer,
            timestamp: tx.timestamp || 0,
          });
        }
      } else if (netTokenOut < 0 && netQuoteOut > 0) {
        const tokenAmount = Math.abs(netTokenOut);
        if (netQuoteOut >= (minDollar || 0)) {
          trades.push({
            signature: tx.signature,
            type: 'external-sell',
            tokenAmount,
            dollarAmount: netQuoteOut,
            trader: feePayer,
            timestamp: tx.timestamp || 0,
          });
        }
      }
    }

    console.log('[CM] Detected', trades.length, 'trades above threshold');

    // Step 4: Execute counter-trades

    for (const trade of trades) {
      const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      events.push({
        id: `det-${eventId}`,
        timestamp: new Date().toISOString(),
        type: trade.type,
        tokenAmount: trade.tokenAmount,
        dollarAmount: trade.dollarAmount,
        signature: trade.signature,
        message: `${trade.type === 'external-buy' ? 'Buy' : 'Sell'} detected: ${trade.tokenAmount.toLocaleString()} tokens ($${trade.dollarAmount.toFixed(2)}) by ${trade.trader.slice(0, 8)}...`,
      });

      // Counter-sell on external buy
      if (trade.type === 'external-buy' && (mode === 'sell-on-buy' || mode === 'both')) {
        if (!sellWallets || sellWallets.length === 0) {
          events.push({
            id: `skip-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'skip',
            tokenAmount: trade.tokenAmount,
            dollarAmount: trade.dollarAmount,
            signature: trade.signature,
            message: 'No wallets with tokens available for counter-sell',
          });
          continue;
        }

        const eligible = sellWallets
          .filter((w: WalletEntry) => w.tokenBalance >= trade.tokenAmount);
        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'skip',
            tokenAmount: trade.tokenAmount,
            dollarAmount: trade.dollarAmount,
            signature: trade.signature,
            message: `No wallets with enough tokens (need ≥${Math.ceil(trade.tokenAmount).toLocaleString()} tokens)`,
          });
          continue;
        }

        const wallet = eligible[Math.floor(Math.random() * eligible.length)];
        const sellAmount = Math.min(trade.tokenAmount, wallet.tokenBalance);

        try {
          const result = useJupiter
            ? await sellViaRaydium(connection, poolAddress, poolInfo.type, tokenMint, quoteMint, wallet, sellAmount, slippageBps || 100, tokenDecimals || 6)
            : await sellExactTokenAmount(connection, poolAddress, tokenMint, wallet, sellAmount, slippageBps || 100, tokenDecimals || 6);

          if (result.signature) {
            wallet.tokenBalance -= result.amountSold;
            events.push({
              id: `sell-${eventId}`,
              timestamp: new Date().toISOString(),
              type: 'counter-sell',
              tokenAmount: result.amountSold,
              dollarAmount: result.quoteReceived || 0,
              signature: trade.signature,
              counterSignature: result.signature,
              wallet: wallet.publicKey.slice(0, 8),
              message: `Counter-sold ${result.amountSold.toLocaleString()} tokens via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
            });
          } else {
            events.push({
              id: `err-${eventId}`,
              timestamp: new Date().toISOString(),
              type: 'error',
              tokenAmount: trade.tokenAmount,
              dollarAmount: trade.dollarAmount,
              signature: trade.signature,
              message: `Counter-sell failed: ${result.error}`,
            });
          }
        } catch (err) {
          events.push({
            id: `err-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'error',
            tokenAmount: trade.tokenAmount,
            dollarAmount: trade.dollarAmount,
            signature: trade.signature,
            message: `Counter-sell error: ${(err as Error).message}`,
          });
        }
      }

      // Counter-buy on external sell
      if (trade.type === 'external-sell' && (mode === 'buy-on-sell' || mode === 'both')) {
        const buyWallets = (body.buyWallets || []) as WalletEntry[];
        const eligible = buyWallets.filter((w: WalletEntry) => (w.usdcBalance || 0) > 0.001).sort((a: WalletEntry, b: WalletEntry) => b.usdcBalance - a.usdcBalance);

        if (eligible.length === 0) {
          events.push({
            id: `skip-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'skip',
            tokenAmount: trade.tokenAmount,
            dollarAmount: trade.dollarAmount,
            signature: trade.signature,
            message: 'No wallets with USDC available for counter-buy',
          });
          continue;
        }

        let remaining = trade.dollarAmount;
        if (remaining <= 0) {
          events.push({
            id: `skip-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'skip',
            tokenAmount: trade.tokenAmount,
            dollarAmount: 0,
            signature: trade.signature,
            message: 'Could not determine dollar amount for counter-buy',
          });
          continue;
        }

        for (const wallet of eligible) {
          if (remaining <= 0.001) break;

          const spendAmount = Math.min(remaining, wallet.usdcBalance || 0);
          if (spendAmount < 0.001) continue;

          try {
            const result = useJupiter
              ? await buyViaRaydium(connection, poolAddress, poolInfo.type, tokenMint, quoteMint, wallet, spendAmount, slippageBps || 100, tokenDecimals || 6)
              : await buyTokensForWallet(connection, poolAddress, tokenMint, wallet, spendAmount, slippageBps || 100, tokenDecimals || 6);

            if (result.signature) {
              remaining -= result.quoteSpent;
              wallet.usdcBalance = Math.max(0, (wallet.usdcBalance || 0) - result.quoteSpent);
              events.push({
                id: `buy-${eventId}-${wallet.publicKey.slice(0, 6)}`,
                timestamp: new Date().toISOString(),
                type: 'counter-buy',
                tokenAmount: result.tokensReceived,
                dollarAmount: result.quoteSpent,
                signature: trade.signature,
                counterSignature: result.signature,
                wallet: wallet.publicKey.slice(0, 8),
                message: `Counter-bought ${result.tokensReceived.toLocaleString()} tokens for ${result.quoteSpent.toFixed(2)} ${result.quoteSymbol} via ${wallet.label || wallet.publicKey.slice(0, 8)}`,
              });
            } else {
              events.push({
                id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`,
                timestamp: new Date().toISOString(),
                type: 'error',
                tokenAmount: trade.tokenAmount,
                dollarAmount: spendAmount,
                signature: trade.signature,
                message: `Counter-buy failed on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${result.error}`,
              });
            }
          } catch (err) {
            events.push({
              id: `err-${eventId}-${wallet.publicKey.slice(0, 6)}`,
              timestamp: new Date().toISOString(),
              type: 'error',
              tokenAmount: trade.tokenAmount,
              dollarAmount: spendAmount,
              signature: trade.signature,
              message: `Counter-buy error on ${wallet.label || wallet.publicKey.slice(0, 8)}: ${(err as Error).message}`,
            });
          }
        }

        if (remaining > 0.01) {
          events.push({
            id: `warn-${eventId}`,
            timestamp: new Date().toISOString(),
            type: 'skip',
            tokenAmount: 0,
            dollarAmount: remaining,
            signature: trade.signature,
            message: `Insufficient USDC across all wallets — $${remaining.toFixed(2)} not covered`,
          });
        }
      }
    }

    // Bonus micro-buy after each successful counter-trade
    const allBuyWallets = (body.buyWallets || []) as WalletEntry[];
    const counterEvents = events.filter(e => (e.type === 'counter-sell' || e.type === 'counter-buy') && e.counterSignature);

    for (const ce of counterEvents) {
      const microAmount = 1 + Math.random() * 2; // $1-$3
      const eligible = allBuyWallets
        .filter((w: WalletEntry) => (w.usdcBalance || 0) >= microAmount && w.publicKey.slice(0, 8) !== ce.wallet)
        .sort(() => Math.random() - 0.5);

      if (eligible.length === 0) continue;

      const microWallet = eligible[0];
      const microId = `micro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      try {
        const result = useJupiter
          ? await buyViaRaydium(connection, poolAddress, poolInfo.type, tokenMint, quoteMint, microWallet, microAmount, slippageBps || 100, tokenDecimals || 6)
          : await buyTokensForWallet(connection, poolAddress, tokenMint, microWallet, microAmount, slippageBps || 100, tokenDecimals || 6);

        if (result.signature) {
          microWallet.usdcBalance = Math.max(0, (microWallet.usdcBalance || 0) - result.quoteSpent);
          events.push({
            id: microId,
            timestamp: new Date().toISOString(),
            type: 'counter-buy',
            tokenAmount: result.tokensReceived,
            dollarAmount: result.quoteSpent,
            signature: ce.counterSignature!,
            counterSignature: result.signature,
            wallet: microWallet.publicKey.slice(0, 8),
            message: `Micro-buy $${result.quoteSpent.toFixed(2)} via ${microWallet.label || microWallet.publicKey.slice(0, 8)}`,
          });
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: {
        events,
        lastSignature: newLastSig,
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
