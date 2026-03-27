'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Activity, Play, Square, ChevronDown, ChevronUp, Loader2, Send, Wallet } from 'lucide-react';
import type { WalletEntry, TransactionLog } from '@/types';

interface MarketMakingProps {
  network: 'devnet' | 'mainnet-beta';
  wallets: WalletEntry[];
  tokenMint: string;
  tokenDecimals: number;
  poolAddress: string;
  onAddLog: (log: Omit<TransactionLog, 'id' | 'timestamp'>) => void;
  onWalletsChange?: (wallets: WalletEntry[]) => void;
  creatorKey?: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'buy' | 'sell' | 'info' | 'error';
}

export default function MarketMaking({
  network,
  wallets,
  tokenMint,
  tokenDecimals,
  poolAddress,
  onAddLog,
  onWalletsChange,
  creatorKey = '',
}: MarketMakingProps) {
  // Config
  const [pool, setPool] = useState(poolAddress);
  const [mint, setMint] = useState(tokenMint);
  const [slippage, setSlippage] = useState(100);
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());

  // Trade settings
  const [minTrade, setMinTrade] = useState(5);
  const [maxTrade, setMaxTrade] = useState(50);
  const [delayMin, setDelayMin] = useState(10);
  const [delayMax, setDelayMax] = useState(60);
  const [bias, setBias] = useState(0);
  const [maxCycles, setMaxCycles] = useState(0);
  const [maxTokensPerTx, setMaxTokensPerTx] = useState(100000);

  // Runtime state
  const [running, setRunning] = useState(false);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [netTokenChange, setNetTokenChange] = useState(0);
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [filterMinUsdc, setFilterMinUsdc] = useState(0);
  const [filterMaxUsdc, setFilterMaxUsdc] = useState(0);
  const [filterMinSol, setFilterMinSol] = useState(0);
  const [filterMaxSol, setFilterMaxSol] = useState(0);

  // Funding state
  const [fundAsset, setFundAsset] = useState<'sol' | 'usdc'>('usdc');
  const [fundAmount, setFundAmount] = useState(1);
  const [funding, setFunding] = useState(false);
  const [creatorSolBalance, setCreatorSolBalance] = useState(0);
  const [creatorUsdcBalance, setCreatorUsdcBalance] = useState(0);
  // Auto-fund
  const [autoFundEnabled, setAutoFundEnabled] = useState(false);
  const [autoFundSolThreshold, setAutoFundSolThreshold] = useState(0.05);
  const [autoFundSolAmount, setAutoFundSolAmount] = useState(0.1);
  const [autoFundUsdcThreshold, setAutoFundUsdcThreshold] = useState(1);
  const [autoFundUsdcAmount, setAutoFundUsdcAmount] = useState(5);
  const autoFundingRef = useRef(false);

  const stopRef = useRef(false);
  const runningRef = useRef(false);

  // Keep pool/mint synced with props
  useState(() => { setPool(poolAddress); });
  useState(() => { setMint(tokenMint); });

  const addActivityLog = useCallback((message: string, type: LogEntry['type']) => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setActivityLog(prev => [entry, ...prev].slice(0, 50));
  }, []);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Refresh wallet balances and update parent state
  const refreshWalletBalances = useCallback(async () => {
    try {
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets, tokenMint: mint, network }),
      });
      const data = await res.json();
      if (data.success && data.data && onWalletsChange) {
        onWalletsChange(data.data);
        return data.data as WalletEntry[];
      }
    } catch { /* ignore refresh errors */ }
    return wallets;
  }, [wallets, mint, network, onWalletsChange]);

  // Refresh creator wallet balance
  const refreshCreatorBalance = useCallback(async () => {
    if (!creatorKey || creatorKey.length < 30) return;
    try {
      const bs58 = (await import('bs58')).default;
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58.decode(creatorKey));
      const creatorWallet: WalletEntry = {
        id: '__creator__', publicKey: kp.publicKey.toBase58(), privateKey: creatorKey,
        solBalance: 0, tokenBalance: 0, usdcBalance: 0, label: 'Creator', createdAt: '',
      };
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: [creatorWallet], tokenMint: mint, network }),
      });
      const data = await res.json();
      if (data.success && data.data?.[0]) {
        setCreatorSolBalance(data.data[0].solBalance || 0);
        setCreatorUsdcBalance(data.data[0].usdcBalance || 0);
      }
    } catch {}
  }, [creatorKey, mint, network]);

  // Refresh creator balance every 10s
  useEffect(() => {
    if (!creatorKey) return;
    refreshCreatorBalance();
    const interval = setInterval(refreshCreatorBalance, 10000);
    return () => clearInterval(interval);
  }, [creatorKey, refreshCreatorBalance]);

  // Fund selected wallets
  const handleFundWallets = async () => {
    if (!creatorKey || selectedWalletIds.size === 0 || funding) return;
    setFunding(true);
    try {
      const bs58 = (await import('bs58')).default;
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58.decode(creatorKey));

      const selected = wallets.filter(w => selectedWalletIds.has(w.id));
      const items = selected.map(w => ({
        walletId: w.id,
        fromPrivateKey: creatorKey,
        toPublicKey: w.publicKey,
        amount: fundAmount,
        assetType: fundAsset as 'sol' | 'usdc',
        ...(fundAsset === 'usdc' ? {
          tokenMint: network === 'devnet'
            ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
            : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
        } : {}),
      }));

      const res = await fetch('/api/wallets/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const { confirmed, failed } = data.data.summary;
      addActivityLog(`Funded ${confirmed}/${selected.length} wallets with ${fundAmount} ${fundAsset.toUpperCase()} each${failed > 0 ? ` (${failed} failed)` : ''}`, 'info');
      refreshCreatorBalance();
      refreshWalletBalances();
    } catch (err) {
      addActivityLog(`Fund failed: ${(err as Error).message}`, 'error');
    } finally {
      setFunding(false);
    }
  };

  // Auto-fund: check selected wallets and fund SOL + USDC independently
  const runAutoFund = useCallback(async () => {
    if (!creatorKey || autoFundingRef.current || selectedWalletIds.size === 0) return;
    autoFundingRef.current = true;
    try {
      const selected = wallets.filter(w => selectedWalletIds.has(w.id));
      const allItems: Array<{ walletId: string; fromPrivateKey: string; toPublicKey: string; amount: number; assetType: 'sol' | 'usdc'; tokenMint?: string; decimals?: number }> = [];

      if (autoFundSolAmount > 0 && autoFundSolThreshold > 0) {
        for (const w of selected.filter(w => w.solBalance < autoFundSolThreshold)) {
          allItems.push({ walletId: w.id, fromPrivateKey: creatorKey, toPublicKey: w.publicKey, amount: autoFundSolAmount, assetType: 'sol' });
        }
      }
      if (autoFundUsdcAmount > 0 && autoFundUsdcThreshold > 0) {
        const usdcMint = network === 'devnet' ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        for (const w of selected.filter(w => w.usdcBalance < autoFundUsdcThreshold)) {
          allItems.push({ walletId: w.id, fromPrivateKey: creatorKey, toPublicKey: w.publicKey, amount: autoFundUsdcAmount, assetType: 'usdc', tokenMint: usdcMint, decimals: 6 });
        }
      }

      if (allItems.length === 0) { autoFundingRef.current = false; return; }
      const res = await fetch('/api/wallets/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: allItems, network }),
      });
      const data = await res.json();
      if (data.success) {
        const { confirmed, failed } = data.data.summary;
        addActivityLog(`Auto-fund: ${confirmed}/${allItems.length} topped up${failed > 0 ? ` (${failed} failed)` : ''}`, 'info');
        refreshCreatorBalance();
        refreshWalletBalances();
      }
    } catch (err) {
      addActivityLog(`Auto-fund error: ${(err as Error).message}`, 'error');
    } finally {
      autoFundingRef.current = false;
    }
  }, [creatorKey, wallets, selectedWalletIds, autoFundSolThreshold, autoFundSolAmount, autoFundUsdcThreshold, autoFundUsdcAmount, network, addActivityLog, refreshCreatorBalance, refreshWalletBalances]);

  // Auto-fund interval
  useEffect(() => {
    if (!autoFundEnabled) return;
    const interval = setInterval(runAutoFund, 15000);
    runAutoFund(); // run immediately
    return () => clearInterval(interval);
  }, [autoFundEnabled, runAutoFund]);

  const randomBetween = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  const truncKey = (k: string) =>
    k.length > 10 ? `${k.slice(0, 4)}...${k.slice(-4)}` : k;

  // Filtered wallets based on balance filters
  const filteredWallets = wallets.filter(w => {
    if (filterMinUsdc > 0 && w.usdcBalance < filterMinUsdc) return false;
    if (filterMaxUsdc > 0 && w.usdcBalance > filterMaxUsdc) return false;
    if (filterMinSol > 0 && w.solBalance < filterMinSol) return false;
    if (filterMaxSol > 0 && w.solBalance > filterMaxSol) return false;
    return true;
  });

  const toggleWallet = (id: string) => {
    setSelectedWalletIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWallets = () => {
    setSelectedWalletIds(new Set(filteredWallets.map(w => w.id)));
  };

  const deselectAllWallets = () => {
    setSelectedWalletIds(new Set());
  };

  // --- Helpers for organic cycle logic ---

  const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const pickRandomN = <T,>(arr: T[], n: number): T[] => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
  };

  const doBuy = async (wallet: WalletEntry, quoteAmount: number): Promise<number> => {
    const label = wallet.label || truncKey(wallet.publicKey);
    addActivityLog(`[${label}] Buying $${quoteAmount.toFixed(4)}...`, 'info');
    try {
      const res = await fetch('/api/wallets/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: pool, tokenMint: mint, wallet, quoteAmount,
          slippage, decimals: tokenDecimals, network,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        addActivityLog(`[${label}] Buy failed: ${data.error}`, 'error');
        onAddLog({ type: 'buy', signature: '', status: 'error', message: `MM buy failed: ${data.error}` });
        return 0;
      }
      const tokens = data.data?.tokensReceived || 0;
      const sig = data.data?.signature || '';
      addActivityLog(`[${label}] Bought ${tokens.toLocaleString()} tokens (${sig.slice(0, 8)}...)`, 'buy');
      onAddLog({ type: 'buy', signature: sig, status: 'success', message: `MM buy: ${tokens.toLocaleString()} tokens for $${quoteAmount.toFixed(4)}` });
      setTotalVolume(prev => prev + quoteAmount);
      return tokens;
    } catch (err) {
      addActivityLog(`[${label}] Buy error: ${(err as Error).message}`, 'error');
      return 0;
    }
  };

  const doSell = async (wallet: WalletEntry, tokenAmount: number): Promise<number> => {
    const label = wallet.label || truncKey(wallet.publicKey);
    addActivityLog(`[${label}] Selling ${tokenAmount.toLocaleString()} tokens...`, 'info');
    try {
      const res = await fetch('/api/wallets/sell-exact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: pool, tokenMint: mint, wallet, tokenAmount,
          slippage, decimals: tokenDecimals, network,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        addActivityLog(`[${label}] Sell failed: ${data.error}`, 'error');
        onAddLog({ type: 'sell', signature: '', status: 'error', message: `MM sell failed: ${data.error}` });
        return 0;
      }
      const sig = data.data?.signature || '';
      const quoteReceived = data.data?.quoteReceived || 0;
      addActivityLog(`[${label}] Sold ${tokenAmount.toLocaleString()} tokens (${sig.slice(0, 8)}...)`, 'sell');
      onAddLog({ type: 'sell', signature: sig, status: 'success', message: `MM sell: ${tokenAmount.toLocaleString()} tokens` });
      setTotalVolume(prev => prev + quoteReceived);
      return tokenAmount;
    } catch (err) {
      addActivityLog(`[${label}] Sell error: ${(err as Error).message}`, 'error');
      return 0;
    }
  };

  // --- Cycle patterns ---

  // Pattern A: Classic — 1 wallet buys, same wallet sells (with bias)
  const patternClassic = async (selectedWallets: WalletEntry[]) => {
    const wallet = pickRandom(selectedWallets);
    const amount = Number(randomBetween(minTrade, maxTrade).toFixed(4));

    const tokens = await doBuy(wallet, amount);
    if (tokens <= 0 || stopRef.current) return tokens;

    await sleep(randomBetween(1000, 5000));
    if (stopRef.current) return tokens;

    const sellAmount = tokens * (1 - bias / 100);
    const sold = await doSell(wallet, sellAmount);
    setNetTokenChange(prev => prev + (tokens - sold));
    return tokens;
  };

  // Pattern B: Split buy — buy small amounts on 2-4 wallets, then sell total from all buyers
  const patternSplitBuy = async (selectedWallets: WalletEntry[]) => {
    const totalAmount = Number(randomBetween(minTrade, maxTrade).toFixed(4));
    const numBuyers = Math.min(selectedWallets.length, Math.floor(randomBetween(2, 5)));
    const buyers = pickRandomN(selectedWallets, numBuyers);

    const weights = buyers.map(() => Math.random());
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const amounts = weights.map(w => Number(((w / weightSum) * totalAmount).toFixed(4)));

    addActivityLog(`Split buy: $${totalAmount.toFixed(2)} across ${numBuyers} wallets`, 'info');

    let totalTokens = 0;
    const tokensByWallet: { wallet: WalletEntry; tokens: number }[] = [];

    for (let i = 0; i < buyers.length; i++) {
      if (stopRef.current) break;
      const tokens = await doBuy(buyers[i], amounts[i]);
      totalTokens += tokens;
      if (tokens > 0) tokensByWallet.push({ wallet: buyers[i], tokens });
      if (i < buyers.length - 1) await sleep(randomBetween(500, 2000));
    }

    if (stopRef.current || totalTokens <= 0) return totalTokens;

    await sleep(randomBetween(2000, 6000));
    if (stopRef.current) return totalTokens;

    // Sell proportional amount from EACH buyer (not just one)
    const sellRatio = 1 - bias / 100;
    let totalSold = 0;
    for (const { wallet: w, tokens: t } of tokensByWallet) {
      if (stopRef.current) break;
      const sellAmount = t * sellRatio;
      totalSold += await doSell(w, sellAmount);
    }
    setNetTokenChange(prev => prev + (totalTokens - totalSold));
    return totalTokens;
  };

  // Pattern C: Cross-wallet — buy on wallet A, sell from wallet B (uses fresh balance)
  const patternCrossWallet = async (selectedWallets: WalletEntry[]) => {
    const buyer = pickRandom(selectedWallets);
    const amount = Number(randomBetween(minTrade, maxTrade).toFixed(4));

    const tokens = await doBuy(buyer, amount);
    if (tokens <= 0 || stopRef.current) return tokens;

    await sleep(randomBetween(2000, 8000));
    if (stopRef.current) return tokens;

    const sellAmount = tokens * (1 - bias / 100);
    if (sellAmount <= 0) {
      setNetTokenChange(prev => prev + tokens);
      return tokens;
    }

    // Try a different wallet first, fallback to buyer
    const otherWallets = selectedWallets.filter(w => w.id !== buyer.id && w.tokenBalance > 0);
    let seller = buyer;
    if (otherWallets.length > 0) {
      const candidate = pickRandom(otherWallets);
      if (candidate.tokenBalance >= sellAmount * 0.5) {
        seller = candidate;
        addActivityLog(`Cross-wallet: bought on ${truncKey(buyer.publicKey)}, selling from ${truncKey(seller.publicKey)}`, 'info');
      }
    }

    const sold = await doSell(seller, sellAmount);
    setNetTokenChange(prev => prev + (tokens - sold));
    return tokens;
  };

  // Pattern D: Staggered multi-sell — buy once, sell in 2-3 small chunks with delays
  const patternStaggeredSell = async (selectedWallets: WalletEntry[]) => {
    const wallet = pickRandom(selectedWallets);
    const amount = Number(randomBetween(minTrade, maxTrade).toFixed(4));

    const tokens = await doBuy(wallet, amount);
    if (tokens <= 0 || stopRef.current) return tokens;

    const totalSellTarget = tokens * (1 - bias / 100);
    if (totalSellTarget <= 0) {
      setNetTokenChange(prev => prev + tokens);
      return tokens;
    }

    const numChunks = Math.floor(randomBetween(2, 4));
    const chunkWeights = Array.from({ length: numChunks }, () => Math.random());
    const chunkSum = chunkWeights.reduce((a, b) => a + b, 0);
    const chunks = chunkWeights.map(w => w / chunkSum * totalSellTarget);

    addActivityLog(`Staggered sell: ${numChunks} chunks over time`, 'info');

    let totalSold = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (stopRef.current) break;
      await sleep(randomBetween(2000, 8000));
      if (stopRef.current) break;
      if (chunks[i] > 0) {
        totalSold += await doSell(wallet, chunks[i]);
      }
    }
    setNetTokenChange(prev => prev + (tokens - totalSold));
    return tokens;
  };

  const runCycle = useCallback(async () => {
    // Refresh balances before each cycle to get accurate data
    const freshWallets = await refreshWalletBalances();
    const selected = freshWallets.filter((w: WalletEntry) => selectedWalletIds.has(w.id));

    // Filter to wallets that can actually afford the minimum trade
    const minRequired = minTrade;
    const selectedWallets = selected.filter((w: WalletEntry) => w.usdcBalance >= minRequired || w.solBalance >= 0.01);

    if (selectedWallets.length === 0) {
      addActivityLog(`No wallets with enough balance (need >=$${minRequired} USDC or SOL). Waiting...`, 'error');
      return true; // keep running, just skip this cycle
    }

    addActivityLog(`${selectedWallets.length} wallets eligible this cycle`, 'info');

    const hasMultipleWallets = selectedWallets.length >= 2;
    const hasWalletsWithTokens = selectedWallets.some((w: WalletEntry) => w.tokenBalance > 0);

    const patterns: { fn: (w: WalletEntry[]) => Promise<number>; weight: number }[] = [
      { fn: patternClassic, weight: 35 },
      { fn: patternSplitBuy, weight: hasMultipleWallets ? 25 : 0 },
      { fn: patternCrossWallet, weight: hasMultipleWallets && hasWalletsWithTokens ? 20 : 0 },
      { fn: patternStaggeredSell, weight: 20 },
    ];

    const totalWeight = patterns.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let chosen = patterns[0].fn;
    for (const p of patterns) {
      rand -= p.weight;
      if (rand <= 0) { chosen = p.fn; break; }
    }

    await chosen(selectedWallets);
    setCyclesCompleted(prev => prev + 1);
    return true;
  }, [wallets, selectedWalletIds, minTrade, maxTrade, pool, mint, slippage, tokenDecimals, network, bias, addActivityLog, onAddLog, refreshWalletBalances]);

  const startLoop = useCallback(async () => {
    if (runningRef.current) return;
    stopRef.current = false;
    runningRef.current = true;
    setRunning(true);

    addActivityLog('Market making started', 'info');

    let cycle = 0;
    while (!stopRef.current) {
      if (maxCycles > 0 && cycle >= maxCycles) {
        addActivityLog(`Completed ${maxCycles} cycles, stopping`, 'info');
        break;
      }

      const shouldContinue = await runCycle();
      if (!shouldContinue || stopRef.current) break;

      cycle++;

      // Wait configured delay
      const delay = Math.floor(randomBetween(delayMin * 1000, delayMax * 1000));
      addActivityLog(`Waiting ${(delay / 1000).toFixed(0)}s until next cycle...`, 'info');
      await sleep(delay);
    }

    runningRef.current = false;
    setRunning(false);
    addActivityLog('Market making stopped', 'info');
  }, [maxCycles, delayMin, delayMax, runCycle, addActivityLog]);

  const handleStop = () => {
    stopRef.current = true;
    addActivityLog('Stopping after current cycle...', 'info');
  };

  const handleStart = () => {
    if (!pool || !mint) {
      addActivityLog('Pool address and token mint are required', 'error');
      return;
    }
    if (selectedWalletIds.size === 0) {
      addActivityLog('Select at least one wallet', 'error');
      return;
    }
    setCyclesCompleted(0);
    setTotalVolume(0);
    setNetTokenChange(0);
    startLoop();
  };

  const logColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'buy': return 'text-green-400';
      case 'sell': return 'text-orange-400';
      case 'error': return 'text-red-400';
      default: return 'text-[#71717a]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Market Making</h2>
            <p className="text-sm text-[#71717a]">Automated buy/sell cycles to generate volume</p>
          </div>
        </div>
        {running && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-green-400 font-medium">Running</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Config */}
        <div className="space-y-4">
          {/* Pool & Token */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Configuration</h3>
            <div>
              <label className="block text-xs text-[#71717a] font-medium mb-1">Pool Address</label>
              <input
                type="text"
                value={pool}
                onChange={e => setPool(e.target.value)}
                disabled={running}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[#71717a] font-medium mb-1">Token Mint</label>
              <input
                type="text"
                value={mint}
                onChange={e => setMint(e.target.value)}
                disabled={running}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[#71717a] font-medium mb-1">Slippage (bps)</label>
              <input
                type="number"
                value={slippage}
                onChange={e => setSlippage(Number(e.target.value))}
                disabled={running}
                min={1}
                max={5000}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Wallet Selector */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowWalletSelector(!showWalletSelector)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                Wallets ({selectedWalletIds.size}/{filteredWallets.length}{filteredWallets.length < wallets.length ? ` of ${wallets.length}` : ''})
              </h3>
              {showWalletSelector ? (
                <ChevronUp className="w-4 h-4 text-[#71717a]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#71717a]" />
              )}
            </button>

            {showWalletSelector && (
              <>
                {/* Balance Filters */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-[#09090b] rounded-lg border border-[#27272a]">
                  <div>
                    <label className="block text-[10px] text-[#52525b] font-medium mb-0.5">Min SOL</label>
                    <input
                      type="number"
                      value={filterMinSol || ''}
                      onChange={e => setFilterMinSol(Number(e.target.value))}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={running}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-purple-500/50 outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#52525b] font-medium mb-0.5">Max SOL</label>
                    <input
                      type="number"
                      value={filterMaxSol || ''}
                      onChange={e => setFilterMaxSol(Number(e.target.value))}
                      placeholder="No limit"
                      min={0}
                      step={0.01}
                      disabled={running}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-purple-500/50 outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-blue-400 font-medium mb-0.5">Min USDC</label>
                    <input
                      type="number"
                      value={filterMinUsdc || ''}
                      onChange={e => setFilterMinUsdc(Number(e.target.value))}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={running}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-blue-500/50 outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-blue-400 font-medium mb-0.5">Max USDC</label>
                    <input
                      type="number"
                      value={filterMaxUsdc || ''}
                      onChange={e => setFilterMaxUsdc(Number(e.target.value))}
                      placeholder="No limit"
                      min={0}
                      step={0.01}
                      disabled={running}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-blue-500/50 outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllWallets}
                    disabled={running}
                    className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
                  >
                    Select All ({filteredWallets.length})
                  </button>
                  <span className="text-[#27272a]">|</span>
                  <button
                    type="button"
                    onClick={deselectAllWallets}
                    disabled={running}
                    className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
                  >
                    Deselect All
                  </button>
                  {filteredWallets.length < wallets.length && (
                    <span className="text-[10px] text-orange-400 ml-auto">
                      {wallets.length - filteredWallets.length} filtered out
                    </span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredWallets.length === 0 ? (
                    <p className="text-xs text-[#52525b]">
                      {wallets.length === 0 ? 'No wallets found. Generate wallets first.' : 'No wallets match the filters.'}
                    </p>
                  ) : (
                    filteredWallets.map(w => (
                      <label
                        key={w.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          selectedWalletIds.has(w.id)
                            ? 'bg-purple-500/10 border border-purple-500/20'
                            : 'hover:bg-[#1c1c1f] border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWalletIds.has(w.id)}
                          onChange={() => toggleWallet(w.id)}
                          disabled={running}
                          className="accent-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white font-mono">
                            {w.label || truncKey(w.publicKey)}
                          </span>
                          <div className="flex gap-3 text-[10px] text-[#52525b]">
                            <span>{w.solBalance.toFixed(4)} SOL</span>
                            {w.usdcBalance > 0 && (
                              <span className="text-blue-400">{w.usdcBalance.toFixed(2)} USDC</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Trade Settings */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Trade Settings</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1">Min Trade ($)</label>
                <input
                  type="number"
                  value={minTrade}
                  onChange={e => setMinTrade(Number(e.target.value))}
                  disabled={running}
                  min={0.01}
                  step={0.01}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1">Max Trade ($)</label>
                <input
                  type="number"
                  value={maxTrade}
                  onChange={e => setMaxTrade(Number(e.target.value))}
                  disabled={running}
                  min={0.01}
                  step={0.01}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1">Delay Min (s)</label>
                <input
                  type="number"
                  value={delayMin}
                  onChange={e => setDelayMin(Number(e.target.value))}
                  disabled={running}
                  min={1}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1">Delay Max (s)</label>
                <input
                  type="number"
                  value={delayMax}
                  onChange={e => setDelayMax(Number(e.target.value))}
                  disabled={running}
                  min={1}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Bias slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[#71717a] font-medium">
                  Bias: <span className={bias > 0 ? 'text-green-400' : bias < 0 ? 'text-red-400' : 'text-white'}>{bias > 0 ? '+' : ''}{bias}%</span>
                </label>
                <span className="text-[10px] text-[#52525b]">
                  {bias > 0 ? 'Accumulate tokens' : bias < 0 ? 'Distribute tokens' : 'Neutral volume'}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={bias}
                onChange={e => setBias(Number(e.target.value))}
                disabled={running}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-[#52525b]">
                <span>-50% (dump)</span>
                <span>0% (neutral)</span>
                <span>+50% (accumulate)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1">Max Cycles (0 = infinite)</label>
                <input
                  type="number"
                  value={maxCycles}
                  onChange={e => setMaxCycles(Number(e.target.value))}
                  disabled={running}
                  min={0}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-red-400 font-medium mb-1">Max Tokens / TX</label>
                <input
                  type="number"
                  value={maxTokensPerTx}
                  onChange={e => setMaxTokensPerTx(Number(e.target.value))}
                  disabled={running}
                  min={1}
                  className="w-full bg-[#09090b] border border-red-500/30 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Start / Stop */}
          <div>
            {running ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop Market Making
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={!pool || !mint || selectedWalletIds.size === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Start Market Making
              </button>
            )}
          </div>
        </div>

        {/* Right: Stats + Log */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Stats</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{cyclesCompleted}</div>
                <div className="text-xs text-[#71717a]">Cycles</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">${totalVolume.toFixed(2)}</div>
                <div className="text-xs text-[#71717a]">Volume</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${netTokenChange > 0 ? 'text-green-400' : netTokenChange < 0 ? 'text-red-400' : 'text-white'}`}>
                  {netTokenChange > 0 ? '+' : ''}{netTokenChange.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-[#71717a]">Net Tokens</div>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Activity Log</h3>
              {running && <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />}
            </div>
            <div className="h-[420px] overflow-y-auto space-y-1 font-mono text-xs">
              {activityLog.length === 0 ? (
                <p className="text-[#52525b] text-center py-8">No activity yet. Start market making to see logs.</p>
              ) : (
                activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className="text-[#52525b] flex-shrink-0">{entry.time}</span>
                    <span className={logColor(entry.type)}>{entry.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fund Wallets Section */}
      {creatorKey && (
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4 text-purple-400" />
              Fund Selected Wallets
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#71717a]">Creator:</span>
              <span className="text-white font-mono">{creatorSolBalance.toFixed(4)} SOL</span>
              <span className="text-green-400 font-mono">{creatorUsdcBalance.toFixed(2)} USDC</span>
            </div>
          </div>

          {/* Manual Fund */}
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs text-[#71717a] font-medium mb-1">Asset</label>
              <select
                value={fundAsset}
                onChange={e => setFundAsset(e.target.value as 'sol' | 'usdc')}
                className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
              >
                <option value="usdc">USDC</option>
                <option value="sol">SOL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#71717a] font-medium mb-1">Amount / wallet</label>
              <input
                type="number"
                value={fundAmount}
                onChange={e => setFundAmount(Number(e.target.value))}
                min={0}
                step={0.1}
                className="w-24 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
              />
            </div>
            <button
              onClick={handleFundWallets}
              disabled={funding || selectedWalletIds.size === 0}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            >
              {funding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Fund {selectedWalletIds.size} wallet{selectedWalletIds.size !== 1 ? 's' : ''}
            </button>
            <span className="text-xs text-[#52525b] pb-2">
              Total: {(fundAmount * selectedWalletIds.size).toFixed(2)} {fundAsset.toUpperCase()}
            </span>
          </div>

          {/* Auto-Fund */}
          <div className="border-t border-[#27272a] pt-4">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => setAutoFundEnabled(!autoFundEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${autoFundEnabled ? 'bg-purple-600' : 'bg-[#27272a]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoFundEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-white font-medium">Auto-Fund</span>
              {autoFundEnabled && (
                <span className="text-xs text-purple-400 animate-pulse">Active — checking every 15s</span>
              )}
            </div>
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#a1a1aa] font-medium w-10">SOL</span>
                  <span className="text-xs text-[#71717a]">if below</span>
                  <input type="number" value={autoFundSolThreshold} onChange={e => setAutoFundSolThreshold(Number(e.target.value))} min={0} step={0.01}
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none" />
                  <span className="text-xs text-[#71717a]">send</span>
                  <input type="number" value={autoFundSolAmount} onChange={e => setAutoFundSolAmount(Number(e.target.value))} min={0} step={0.01}
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none" />
                  <span className="text-xs text-[#52525b]">per wallet</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#a1a1aa] font-medium w-10">USDC</span>
                  <span className="text-xs text-[#71717a]">if below</span>
                  <input type="number" value={autoFundUsdcThreshold} onChange={e => setAutoFundUsdcThreshold(Number(e.target.value))} min={0} step={0.1}
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none" />
                  <span className="text-xs text-[#71717a]">send</span>
                  <input type="number" value={autoFundUsdcAmount} onChange={e => setAutoFundUsdcAmount(Number(e.target.value))} min={0} step={0.1}
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none" />
                  <span className="text-xs text-[#52525b]">per wallet</span>
                </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
