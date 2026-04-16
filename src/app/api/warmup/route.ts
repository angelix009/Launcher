import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js';
import { createCloseAccountInstruction, getAssociatedTokenAddressSync, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RPC_URLS: Record<string, string> = {
  'mainnet-beta': `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  devnet: 'https://api.devnet.solana.com',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Fetch random tradeable Solana tokens via multiple sources
async function fetchRandomTokens(count: number): Promise<string[]> {
  const tokens: string[] = [];
  const seen = new Set<string>();

  // Source 1: DexScreener trending/boosted on Solana
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1', {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      for (const t of (data || [])) {
        if (t.chainId !== 'solana') continue;
        if (!t.tokenAddress || seen.has(t.tokenAddress)) continue;
        seen.add(t.tokenAddress);
        tokens.push(t.tokenAddress);
      }
    }
  } catch (e) { console.warn('DexScreener boosts failed:', e); }

  // Source 2: DexScreener latest pairs on Solana (Raydium, pump.fun, etc.)
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana', {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      for (const pair of (data.pairs || [])) {
        const mint = pair.baseToken?.address;
        if (!mint || seen.has(mint)) continue;
        if ((pair.liquidity?.usd || 0) < 500) continue;
        seen.add(mint);
        tokens.push(mint);
      }
    }
  } catch (e) { console.warn('DexScreener pairs failed:', e); }

  // Source 3: Jupiter strict token list (verified tokens with liquidity)
  try {
    const res = await fetch('https://tokens.jup.ag/tokens?tags=community');
    if (res.ok) {
      const data = await res.json();
      // Pick random community tokens
      const shuffled = data.sort(() => Math.random() - 0.5);
      for (const t of shuffled) {
        if (!t.address || seen.has(t.address)) continue;
        if (t.address === SOL_MINT) continue;
        seen.add(t.address);
        tokens.push(t.address);
        if (tokens.length >= count * 4) break;
      }
    }
  } catch (e) { console.warn('Jupiter tokens failed:', e); }

  console.log(`[warmup] Found ${tokens.length} candidate tokens`);

  // Shuffle and return requested count
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  return tokens.slice(0, count);
}

// Execute a swap via Jupiter
async function jupiterSwap(
  connection: Connection,
  keypair: Keypair,
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number = 1500 // 15% slippage for pump.fun tokens
): Promise<string> {
  // 1. Get quote (lite API — free, no API key)
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    const err = await quoteRes.text();
    throw new Error(`Jupiter quote failed: ${err}`);
  }
  const quote = await quoteRes.json();

  // 2. Get swap transaction (lite API)
  const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      priorityLevelWithMaxLamports: {
        maxLamports: 500000,
        priorityLevel: "medium"
      },
    }),
  });

  if (!swapRes.ok) {
    const err = await swapRes.text();
    throw new Error(`Jupiter swap failed: ${err}`);
  }
  const swapData = await swapRes.json();

  // 3. Sign and send
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  // 4. Confirm
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      wallets,
      network = 'mainnet-beta',
      tradesPerWallet = 4,
      buyAmountMinSol = 0.001,
      buyAmountMaxSol = 0.003,
      delayBetweenTradesMs = 3000,
      delayBetweenWalletsMs = 1000,
    } = body;

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ success: false, error: 'No wallets provided' }, { status: 400 });
    }

    const rpcUrl = RPC_URLS[network];
    if (!rpcUrl) {
      return NextResponse.json({ success: false, error: 'Invalid network' }, { status: 400 });
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // Fetch enough unique tokens for all wallets (each trades different tokens)
    const totalTokensNeeded = wallets.length * tradesPerWallet;
    console.log(`[warmup] Fetching ${totalTokensNeeded} random tokens...`);
    const allTokens = await fetchRandomTokens(totalTokensNeeded);

    if (allTokens.length < tradesPerWallet) {
      return NextResponse.json({
        success: false,
        error: `Only found ${allTokens.length} tradeable tokens, need at least ${tradesPerWallet}`,
      }, { status: 400 });
    }

    // Assign different tokens to each wallet
    const results: {
      wallet: string;
      trades: { token: string; buyTx?: string; sellTx?: string; rentRecovered?: boolean; error?: string }[];
    }[] = [];

    // Shuffle tokens and deal them out
    let tokenIndex = 0;

    for (let wi = 0; wi < wallets.length; wi++) {
      const w = wallets[wi];
      const keypair = Keypair.fromSecretKey(bs58.decode(w.privateKey));
      const walletTokens: string[] = [];

      // Pick unique tokens for this wallet
      for (let t = 0; t < tradesPerWallet && tokenIndex < allTokens.length; t++) {
        walletTokens.push(allTokens[tokenIndex++]);
      }
      // If we run out of unique tokens, wrap around with shuffled list
      if (walletTokens.length < tradesPerWallet) {
        const shuffled = [...allTokens].sort(() => Math.random() - 0.5);
        while (walletTokens.length < tradesPerWallet) {
          walletTokens.push(shuffled[walletTokens.length % shuffled.length]);
        }
      }

      const walletResult: typeof results[0] = {
        wallet: w.publicKey,
        trades: [],
      };

      for (const tokenMint of walletTokens) {
        const trade: { token: string; amount?: number; buyTx?: string; sellTx?: string; rentRecovered?: boolean; error?: string } = { token: tokenMint };

        try {
          // Random buy amount between min and max
          const buyAmountSol = buyAmountMinSol + Math.random() * (buyAmountMaxSol - buyAmountMinSol);
          const buyAmountLamports = Math.round(buyAmountSol * 1e9);
          trade.amount = Math.round(buyAmountSol * 10000) / 10000;

          // BUY: SOL → token
          console.log(`[warmup] ${w.publicKey.slice(0, 8)}... BUY ${trade.amount} SOL → ${tokenMint.slice(0, 8)}...`);
          trade.buyTx = await jupiterSwap(
            connection, keypair, SOL_MINT, tokenMint, buyAmountLamports
          );

          // Random wait 2-5s before selling
          const sellDelay = 2000 + Math.random() * 3000;
          await new Promise(r => setTimeout(r, sellDelay));

          // SELL: get token balance, sell ALL back to SOL
          const mintPubkey = new PublicKey(tokenMint);
          let tokenBalance: bigint;
          let ataAddress: PublicKey;
          let tokenProgramId: PublicKey;

          try {
            ataAddress = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey, false, TOKEN_PROGRAM_ID);
            const acc = await getAccount(connection, ataAddress, 'confirmed', TOKEN_PROGRAM_ID);
            tokenBalance = acc.amount;
            tokenProgramId = TOKEN_PROGRAM_ID;
          } catch {
            ataAddress = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
            const acc = await getAccount(connection, ataAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
            tokenBalance = acc.amount;
            tokenProgramId = TOKEN_2022_PROGRAM_ID;
          }

          if (tokenBalance > BigInt(0)) {
            console.log(`[warmup] ${w.publicKey.slice(0, 8)}... SELL ${tokenBalance} ${tokenMint.slice(0, 8)}... → SOL`);
            trade.sellTx = await jupiterSwap(
              connection, keypair, tokenMint, SOL_MINT, Number(tokenBalance)
            );

            // Wait a bit for sell to finalize
            await new Promise(r => setTimeout(r, 1500));

            // Close ATA to recover rent (~0.002 SOL)
            try {
              const closeIx = createCloseAccountInstruction(
                ataAddress,
                keypair.publicKey,
                keypair.publicKey,
                [],
                tokenProgramId
              );
              const closeTx = new Transaction().add(closeIx);
              closeTx.feePayer = keypair.publicKey;
              closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
              const closeSig = await connection.sendTransaction(closeTx, [keypair], { skipPreflight: true });
              await connection.confirmTransaction(closeSig, 'confirmed');
              trade.rentRecovered = true;
              console.log(`[warmup] ${w.publicKey.slice(0, 8)}... closed ATA for ${tokenMint.slice(0, 8)}, rent recovered`);
            } catch (closeErr) {
              console.warn(`[warmup] Failed to close ATA: ${(closeErr as Error).message?.slice(0, 60)}`);
            }
          }
        } catch (err) {
          trade.error = (err as Error).message?.slice(0, 120);
          console.error(`[warmup] Trade error: ${trade.error}`);
        }

        walletResult.trades.push(trade);

        // Delay between trades
        await new Promise(r => setTimeout(r, delayBetweenTradesMs + Math.random() * 2000));
      }

      results.push(walletResult);

      // Delay between wallets
      await new Promise(r => setTimeout(r, delayBetweenWalletsMs + Math.random() * 2000));
    }

    const totalTrades = results.reduce((s, r) => s + r.trades.length, 0);
    const successBuys = results.reduce((s, r) => s + r.trades.filter(t => t.buyTx).length, 0);
    const successSells = results.reduce((s, r) => s + r.trades.filter(t => t.sellTx).length, 0);
    const rentRecovered = results.reduce((s, r) => s + r.trades.filter(t => t.rentRecovered).length, 0);
    const failures = results.reduce((s, r) => s + r.trades.filter(t => t.error).length, 0);

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          wallets: wallets.length,
          totalTrades,
          successBuys,
          successSells,
          rentRecovered,
          failures,
        },
      },
    });
  } catch (err) {
    console.error('Warmup error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
