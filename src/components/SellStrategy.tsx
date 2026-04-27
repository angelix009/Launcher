'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  TrendingDown,
  TrendingUp,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Percent,
  Settings,
  Play,
  Clock,
  Check,
  Copy,
  ExternalLink,
  Wallet,
  Info,
  X,
  Zap,
  Crosshair,
  RefreshCw,
  ArrowUpDown,
  Upload,
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Activity,
  Square,
  Send,
} from 'lucide-react';
import type { WalletEntry, TransactionLog } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/Toast';

interface SellStrategyProps {
  network: 'devnet' | 'mainnet-beta';
  wallets: WalletEntry[];
  tokenMint: string;
  tokenDecimals: number;
  poolAddress: string;
  onAddLog: (log: TransactionLog) => void;
  onWalletsChange?: (wallets: WalletEntry[]) => void;
  creatorKey?: string;
}

type SortField = 'default' | 'sol' | 'token' | 'usdc';

interface SellResult {
  walletPublicKey: string;
  walletLabel: string;
  amountSold: number;
  quoteReceived: number | null;
  quoteSymbol: string | null;
  signature: string | null;
  error: string | null;
  status: 'success' | 'error';
}

interface QuotePreview {
  walletId: string;
  walletPublicKey: string;
  sellAmount: number;
  estimatedQuote: number;
  quoteSymbol: string;
  maxSellable: number | null;
  error?: string;
}

function truncateKey(key: string): string {
  if (!key || key.length < 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function SellStrategy({
  network,
  wallets,
  tokenMint: initialTokenMint,
  tokenDecimals,
  poolAddress: initialPoolAddress,
  onAddLog,
  onWalletsChange,
  creatorKey = '',
}: SellStrategyProps) {
  const { addToast } = useToast();

  const [poolAddressInput, setPoolAddressInput] = useState(
    initialPoolAddress || ''
  );
  const [tokenMintInput, setTokenMintInput] = useState(
    initialTokenMint || ''
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [percentage, setPercentage] = useState<number>(10);
  const [customPercentage, setCustomPercentage] = useState('');
  const [slippage, setSlippage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SellResult[]>([]);
  const [quotePreview, setQuotePreview] = useState<QuotePreview[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Quick Trade state
  const [quickTradeMode, setQuickTradeMode] = useState(true);
  const [quickTradeSlippage, setQuickTradeSlippage] = useState(30);
  const [customQuickSellPct, setCustomQuickSellPct] = useState<Record<string, string>>({});
  const [customQuickSellAmt, setCustomQuickSellAmt] = useState<Record<string, string>>({});
  const [customBuyAmount, setCustomBuyAmount] = useState<Record<string, string>>({});
  const [walletActionLoading, setWalletActionLoading] = useState<Map<string, string>>(new Map());
  const [pricePerToken, setPricePerToken] = useState<number>(0);
  const [priceQuoteSymbol, setPriceQuoteSymbol] = useState<string>('SOL');
  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  // Consolidate state
  const [showConsolidate, setShowConsolidate] = useState(false);
  const [consolidateAsset, setConsolidateAsset] = useState<'sol' | 'token' | 'usdc'>('sol');
  const [consolidateDest, setConsolidateDest] = useState('');
  const [consolidateDestMode, setConsolidateDestMode] = useState<'custom' | 'table'>('custom');
  const [consolidateTableDest, setConsolidateTableDest] = useState('');
  const [consolidatePct, setConsolidatePct] = useState(100);
  const [consolidateLoading, setConsolidateLoading] = useState(false);
  const [consolidateProgress, setConsolidateProgress] = useState<{ current: number; total: number; confirmed: number; failed: number } | null>(null);

  // Market Making state
  const [showMM, setShowMM] = useState(false);
  const [mmSlippage, setMmSlippage] = useState(100);
  const [mmSelectedIds, setMmSelectedIds] = useState<Set<string>>(new Set());
  const [mmMinTrade, setMmMinTrade] = useState(5);
  const [mmMaxTrade, setMmMaxTrade] = useState(50);
  const [mmDelayMin, setMmDelayMin] = useState(10);
  const [mmDelayMax, setMmDelayMax] = useState(60);
  const [mmBias, setMmBias] = useState(0);
  const [mmMaxCycles, setMmMaxCycles] = useState(0);
  const [mmMaxTokensPerTx, setMmMaxTokensPerTx] = useState(100000);
  const [mmRunning, setMmRunning] = useState(false);
  const [mmLog, setMmLog] = useState<Array<{ time: string; message: string; type: 'buy' | 'sell' | 'info' | 'error' }>>([]);
  const [mmCycles, setMmCycles] = useState(0);
  const [mmVolume, setMmVolume] = useState(0);
  const [mmNetTokens, setMmNetTokens] = useState(0);
  const [mmShowWallets, setMmShowWallets] = useState(false);
  const [mmFilterMinSol, setMmFilterMinSol] = useState(0);
  const [mmFilterMaxSol, setMmFilterMaxSol] = useState(0);
  const [mmFilterMinUsdc, setMmFilterMinUsdc] = useState(0);
  const [mmFilterMaxUsdc, setMmFilterMaxUsdc] = useState(0);
  const mmStopRef = useRef(false);
  const mmRunningRef = useRef(false);

  // Fund wallets state
  const [fundAsset, setFundAsset] = useState<'sol' | 'usdc'>('usdc');
  const [fundAmount, setFundAmount] = useState(1);
  const [fundLoading, setFundLoading] = useState(false);
  const [creatorSolBal, setCreatorSolBal] = useState(0);
  const [creatorUsdcBal, setCreatorUsdcBal] = useState(0);
  const [fundTargetIds, setFundTargetIds] = useState<Set<string>>(new Set());
  const [fundShowWallets, setFundShowWallets] = useState(false);
  const [autoFundOn, setAutoFundOn] = useState(false);
  const [autoFundSolThreshold, setAutoFundSolThreshold] = useState(0.05);
  const [autoFundSolAmount, setAutoFundSolAmount] = useState(0.1);
  const [autoFundUsdcThreshold, setAutoFundUsdcThreshold] = useState(1);
  const [autoFundUsdcAmount, setAutoFundUsdcAmount] = useState(5);
  const autoFundingRef = useRef(false);

  // Auto-Sell state
  const [autoSellEnabled, setAutoSellEnabled] = useState(false);
  const [autoSellRatio, setAutoSellRatio] = useState(50);
  const [autoSellSlippage, setAutoSellSlippage] = useState(30);
  const [autoSellPollMs, setAutoSellPollMs] = useState(2500);
  const [autoSellLog, setAutoSellLog] = useState<Array<{
    id: string;
    type: 'buy-detected' | 'sell-executed' | 'sell-error' | 'skipped';
    buyAmount: number;
    quoteSymbol: string;
    tokensSold?: number;
    walletLabel?: string;
    walletPublicKey?: string;
    signature?: string;
    error?: string;
    timestamp: string;
  }>>([]);

  // Auto-Sell refs
  const autoSellActiveRef = useRef(false);
  const autoSellWalletIndexRef = useRef(0);
  const lastVaultBalanceRef = useRef<string | null>(null);
  const autoSellQueueRef = useRef<bigint[]>([]);
  const autoSellProcessingRef = useRef(false);
  const autoSellIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSellQuoteDecimalsRef = useRef(9);
  const autoSellQuoteSymbolRef = useRef('SOL');

  // Chart Manager state
  const [cmEnabled, setCmEnabled] = useState(false);
  const [cmSellOnBuy, setCmSellOnBuy] = useState(true);
  const [cmBuyOnSell, setCmBuyOnSell] = useState(false);
  const [cmMinDollar, setCmMinDollar] = useState(40);
  const [cmSlippage, setCmSlippage] = useState(5000); // bps
  const [cmPollMs, setCmPollMs] = useState(3000);
  const [cmLog, setCmLog] = useState<Array<{
    id: string;
    type: 'external-buy' | 'external-sell' | 'counter-sell' | 'counter-buy' | 'error' | 'skip';
    tokenAmount: number;
    dollarAmount: number;
    signature: string;
    counterSignature?: string;
    wallet?: string;
    message: string;
    timestamp: string;
  }>>([]);
  const cmActiveRef = useRef(false);
  const cmLastSigRef = useRef<string | null>(null);
  const cmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cmProcessingRef = useRef(false);
  const cmOwnSignaturesRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const balanceFallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onWalletsChange) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.trim().split('\n');
        const imported: WalletEntry[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          if (cols.length >= 2) {
            imported.push({
              id: uuidv4(),
              publicKey: cols[0].trim(),
              privateKey: cols[1].trim(),
              solBalance: 0,
              tokenBalance: 0,
              usdcBalance: 0,
              label: cols[2]?.trim() || `Imported-${i}`,
              createdAt: new Date().toISOString(),
            });
          }
        }
        if (imported.length === 0) {
          addToast('No valid wallets found. Expected: publicKey,privateKey,label', 'error');
          return;
        }
        onWalletsChange([...wallets, ...imported]);
        addToast(`Imported ${imported.length} wallets from CSV`, 'success');
      } catch {
        addToast('Failed to parse CSV file', 'error');
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  // Consolidate handler
  const handleConsolidate = async () => {
    let destAddress = '';
    if (consolidateDestMode === 'custom') {
      if (!consolidateDest.trim()) { addToast('Enter a destination address', 'error'); return; }
      destAddress = consolidateDest.trim();
    } else {
      if (!consolidateTableDest) { addToast('Select a destination wallet', 'error'); return; }
      const destW = wallets.find((w) => w.id === consolidateTableDest);
      if (!destW) { addToast('Destination wallet not found', 'error'); return; }
      destAddress = destW.publicKey;
    }
    if (consolidateAsset === 'token' && !tokenMintInput) { addToast('Token mint required', 'error'); return; }

    const sourceWallets = wallets.filter((w) => w.publicKey !== destAddress);
    if (sourceWallets.length === 0) { addToast('No wallets to consolidate', 'error'); return; }

    const pct = consolidatePct / 100;
    const MIN_SEND: Record<string, number> = { sol: 0.00001, usdc: 0.001, token: 0.001 };
    const minAmt = MIN_SEND[consolidateAsset] ?? 0.001;

    const batchItems = sourceWallets
      .map((w) => {
        const balance = consolidateAsset === 'sol' ? w.solBalance : consolidateAsset === 'token' ? w.tokenBalance : w.usdcBalance;
        return {
          walletId: w.id,
          fromPrivateKey: w.privateKey,
          toPublicKey: destAddress,
          amount: balance * pct,
          tokenMint: tokenMintInput || undefined,
          decimals: tokenDecimals,
          assetType: consolidateAsset,
        };
      })
      .filter((item) => item.amount >= minAmt);

    if (batchItems.length === 0) { addToast('No wallets have enough balance', 'error'); return; }

    setConsolidateLoading(true);
    setConsolidateProgress({ current: 0, total: batchItems.length, confirmed: 0, failed: 0 });

    try {
      const res = await fetch('/api/wallets/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchItems, network }),
      });
      const data = await res.json();
      if (!data.success) { addToast(data.error || 'Consolidate failed', 'error'); setConsolidateLoading(false); setConsolidateProgress(null); return; }

      const summary = data.data.summary;
      const label = consolidateAsset === 'sol' ? 'SOL' : consolidateAsset === 'token' ? 'Tokens' : 'USDC';
      setConsolidateProgress({ current: summary.total, total: summary.total, confirmed: summary.confirmed, failed: summary.failed + summary.timeout });
      addToast(`Consolidated ${label} from ${summary.confirmed}/${summary.total} wallets`, summary.confirmed > 0 ? 'success' : 'error');
    } catch (err) {
      addToast((err as Error).message, 'error');
      setConsolidateProgress(null);
    }

    setConsolidateLoading(false);
    await handleRefreshBalances();
  };

  // ===== Market Making Logic =====
  const mmFilteredWallets = useMemo(() => wallets.filter(w => {
    if (mmFilterMinSol > 0 && w.solBalance < mmFilterMinSol) return false;
    if (mmFilterMaxSol > 0 && w.solBalance > mmFilterMaxSol) return false;
    if (mmFilterMinUsdc > 0 && (w.usdcBalance || 0) < mmFilterMinUsdc) return false;
    if (mmFilterMaxUsdc > 0 && (w.usdcBalance || 0) > mmFilterMaxUsdc) return false;
    return true;
  }), [wallets, mmFilterMinSol, mmFilterMaxSol, mmFilterMinUsdc, mmFilterMaxUsdc]);

  const mmAddLog = useCallback((message: string, type: 'buy' | 'sell' | 'info' | 'error') => {
    setMmLog(prev => [{ time: new Date().toLocaleTimeString(), message, type }, ...prev].slice(0, 50));
  }, []);

  const mmSleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const mmRand = (min: number, max: number) => Math.random() * (max - min) + min;
  const mmPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const mmPickN = <T,>(arr: T[], n: number): T[] => [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
  const mmTrunc = (k: string) => k.length > 10 ? `${k.slice(0, 4)}...${k.slice(-4)}` : k;

  const mmDoBuy = async (wallet: WalletEntry, quoteAmount: number): Promise<number> => {
    const label = wallet.label || mmTrunc(wallet.publicKey);
    mmAddLog(`[${label}] Buying $${quoteAmount.toFixed(4)}...`, 'info');
    try {
      const res = await fetch('/api/wallets/buy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAddress: poolAddressInput, tokenMint: tokenMintInput, wallet, quoteAmount, slippage: mmSlippage, decimals: tokenDecimals, network }),
      });
      const data = await res.json();
      if (!data.success) { mmAddLog(`[${label}] Buy failed: ${data.error}`, 'error'); return 0; }
      let tokens = data.data?.tokensReceived || 0;
      const sig = data.data?.signature || '';
      if (tokens > mmMaxTokensPerTx) { tokens = mmMaxTokensPerTx; }
      mmAddLog(`[${label}] Bought ${tokens.toLocaleString()} tokens (${sig.slice(0, 8)}...)`, 'buy');
      setMmVolume(prev => prev + quoteAmount);
      return tokens;
    } catch (err) { mmAddLog(`[${label}] Buy error: ${(err as Error).message}`, 'error'); return 0; }
  };

  const mmDoSell = async (wallet: WalletEntry, tokenAmount: number): Promise<number> => {
    const label = wallet.label || mmTrunc(wallet.publicKey);
    if (tokenAmount > mmMaxTokensPerTx) tokenAmount = mmMaxTokensPerTx;
    mmAddLog(`[${label}] Selling ${tokenAmount.toLocaleString()} tokens...`, 'info');
    try {
      const res = await fetch('/api/wallets/sell-exact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAddress: poolAddressInput, tokenMint: tokenMintInput, wallet, tokenAmount, slippage: mmSlippage, decimals: tokenDecimals, network }),
      });
      const data = await res.json();
      if (!data.success) { mmAddLog(`[${label}] Sell failed: ${data.error}`, 'error'); return 0; }
      const sig = data.data?.signature || '';
      const quoteReceived = data.data?.quoteReceived || 0;
      mmAddLog(`[${label}] Sold ${tokenAmount.toLocaleString()} tokens (${sig.slice(0, 8)}...)`, 'sell');
      setMmVolume(prev => prev + quoteReceived);
      return tokenAmount;
    } catch (err) { mmAddLog(`[${label}] Sell error: ${(err as Error).message}`, 'error'); return 0; }
  };

  const mmPatternClassic = async (ws: WalletEntry[]) => {
    const w = mmPick(ws); const amt = Number(mmRand(mmMinTrade, mmMaxTrade).toFixed(4));
    const tokens = await mmDoBuy(w, amt);
    if (tokens <= 0 || mmStopRef.current) return;
    await mmSleep(mmRand(1000, 5000));
    if (mmStopRef.current) return;
    const sell = Number((tokens * (1 - mmBias / 100)).toFixed(tokenDecimals));
    if (sell > 0) { const sold = await mmDoSell(w, sell); setMmNetTokens(p => p + (tokens - sold)); }
    else setMmNetTokens(p => p + tokens);
  };

  const mmPatternSplit = async (ws: WalletEntry[]) => {
    const total = Number(mmRand(mmMinTrade, mmMaxTrade).toFixed(4));
    const n = Math.min(ws.length, Math.floor(mmRand(2, 5)));
    const buyers = mmPickN(ws, n);
    const weights = buyers.map(() => Math.random()); const wSum = weights.reduce((a, b) => a + b, 0);
    const amounts = weights.map(w => Number(((w / wSum) * total).toFixed(4)));
    mmAddLog(`Split buy: $${total.toFixed(2)} across ${n} wallets`, 'info');
    let totalTokens = 0; const byWallet: { w: WalletEntry; t: number }[] = [];
    for (let i = 0; i < buyers.length; i++) {
      if (mmStopRef.current) break;
      const t = await mmDoBuy(buyers[i], amounts[i]); totalTokens += t;
      if (t > 0) byWallet.push({ w: buyers[i], t });
      if (i < buyers.length - 1) await mmSleep(mmRand(500, 2000));
    }
    if (mmStopRef.current || totalTokens <= 0) return;
    await mmSleep(mmRand(2000, 6000));
    if (mmStopRef.current) return;
    const sell = Number((totalTokens * (1 - mmBias / 100)).toFixed(tokenDecimals));
    if (sell > 0 && byWallet.length > 0) {
      const s = mmPick(byWallet); const actual = Math.min(sell, s.t);
      const sold = await mmDoSell(s.w, Number(actual.toFixed(tokenDecimals)));
      setMmNetTokens(p => p + (totalTokens - sold));
    } else setMmNetTokens(p => p + totalTokens);
  };

  const mmPatternCross = async (ws: WalletEntry[]) => {
    const buyer = mmPick(ws); const amt = Number(mmRand(mmMinTrade, mmMaxTrade).toFixed(4));
    const tokens = await mmDoBuy(buyer, amt);
    if (tokens <= 0 || mmStopRef.current) return;
    await mmSleep(mmRand(2000, 8000));
    if (mmStopRef.current) return;
    const candidates = ws.filter(w => w.id !== buyer.id && w.tokenBalance > 0);
    const sell = Number((tokens * (1 - mmBias / 100)).toFixed(tokenDecimals));
    if (sell > 0 && candidates.length > 0) {
      const seller = mmPick(candidates); const actual = Math.min(sell, seller.tokenBalance);
      if (actual > 0) { const sold = await mmDoSell(seller, Number(actual.toFixed(tokenDecimals))); setMmNetTokens(p => p + (tokens - sold)); }
      else setMmNetTokens(p => p + tokens);
    } else if (sell > 0) { const sold = await mmDoSell(buyer, sell); setMmNetTokens(p => p + (tokens - sold)); }
    else setMmNetTokens(p => p + tokens);
  };

  const mmPatternStaggered = async (ws: WalletEntry[]) => {
    const w = mmPick(ws); const amt = Number(mmRand(mmMinTrade, mmMaxTrade).toFixed(4));
    const tokens = await mmDoBuy(w, amt);
    if (tokens <= 0 || mmStopRef.current) return;
    const totalSell = Number((tokens * (1 - mmBias / 100)).toFixed(tokenDecimals));
    if (totalSell <= 0) { setMmNetTokens(p => p + tokens); return; }
    const numC = Math.floor(mmRand(2, 4));
    const cw = Array.from({ length: numC }, () => Math.random()); const cs = cw.reduce((a, b) => a + b, 0);
    const chunks = cw.map(v => Number(((v / cs) * totalSell).toFixed(tokenDecimals)));
    mmAddLog(`Staggered sell: ${numC} chunks`, 'info');
    let totalSold = 0;
    for (const chunk of chunks) {
      if (mmStopRef.current) break;
      await mmSleep(mmRand(2000, 8000));
      if (mmStopRef.current) break;
      if (chunk > 0) totalSold += await mmDoSell(w, chunk);
    }
    setMmNetTokens(p => p + (tokens - totalSold));
  };

  const mmRunCycle = useCallback(async () => {
    const selected = wallets.filter(w => mmSelectedIds.has(w.id));
    if (selected.length === 0) { mmAddLog('No wallets selected', 'error'); return false; }
    const multi = selected.length >= 2; const hasTokens = selected.some(w => w.tokenBalance > 0);
    const patterns: { fn: (w: WalletEntry[]) => Promise<void>; weight: number }[] = [
      { fn: mmPatternClassic, weight: 35 },
      { fn: mmPatternSplit, weight: multi ? 25 : 0 },
      { fn: mmPatternCross, weight: multi && hasTokens ? 20 : 0 },
      { fn: mmPatternStaggered, weight: 20 },
    ];
    const tw = patterns.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * tw; let chosen = patterns[0].fn;
    for (const p of patterns) { r -= p.weight; if (r <= 0) { chosen = p.fn; break; } }
    await chosen(selected);
    setMmCycles(p => p + 1);
    return true;
  }, [wallets, mmSelectedIds, mmMinTrade, mmMaxTrade, poolAddressInput, tokenMintInput, mmSlippage, tokenDecimals, network, mmBias, mmAddLog, mmMaxTokensPerTx]);

  const mmStartLoop = useCallback(async () => {
    if (mmRunningRef.current) return;
    mmStopRef.current = false; mmRunningRef.current = true; setMmRunning(true);
    mmAddLog('Market making started', 'info');
    let cycle = 0;
    while (!mmStopRef.current) {
      if (mmMaxCycles > 0 && cycle >= mmMaxCycles) { mmAddLog(`Completed ${mmMaxCycles} cycles`, 'info'); break; }
      const ok = await mmRunCycle();
      if (!ok || mmStopRef.current) break;
      cycle++;
      const delay = Math.floor(mmRand(mmDelayMin * 1000, mmDelayMax * 1000));
      mmAddLog(`Waiting ${(delay / 1000).toFixed(0)}s...`, 'info');
      await mmSleep(delay);
    }
    mmRunningRef.current = false; setMmRunning(false);
    mmAddLog('Market making stopped', 'info');
  }, [mmMaxCycles, mmDelayMin, mmDelayMax, mmRunCycle, mmAddLog]);

  const mmStart = () => {
    if (!poolAddressInput || !tokenMintInput) { addToast('Pool address and token mint required', 'error'); return; }
    if (mmSelectedIds.size === 0) { addToast('Select at least one wallet', 'error'); return; }
    setMmCycles(0); setMmVolume(0); setMmNetTokens(0);
    mmStartLoop();
  };

  const mmStop = () => { mmStopRef.current = true; mmAddLog('Stopping after current cycle...', 'info'); };

  const mmLogColor = (type: string) => {
    if (type === 'buy') return 'text-green-400';
    if (type === 'sell') return 'text-orange-400';
    if (type === 'error') return 'text-red-400';
    return 'text-[#71717a]';
  };

  const presetPercentages = [2.5, 5, 10, 25, 50, 100];

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === walletsWithTokens.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(walletsWithTokens.map((w) => w.id)));
    }
  };

  // Filter wallets that have token balance > 0
  const walletsWithTokens = useMemo(
    () => wallets.filter((w) => w.tokenBalance > 0),
    [wallets]
  );

  // Sort & refresh state
  const [sortField, setSortField] = useState<SortField>('default');
  const [sortDesc, setSortDesc] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const refreshingRef = useRef(false);

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      if (sortDesc) setSortDesc(false);
      else { setSortField('default'); setSortDesc(true); }
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const handleRefreshBalances = async () => {
    if (refreshingRef.current || walletsRef.current.length === 0) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallets: walletsRef.current,
          tokenMint: tokenMintInput || undefined,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (onWalletsChange) onWalletsChange(data.data);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  // Refresh creator balance
  const refreshCreatorBal = useCallback(async () => {
    if (!creatorKey || creatorKey.length < 30) return;
    try {
      const bs58 = (await import('bs58')).default;
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58.decode(creatorKey));
      const cw: WalletEntry = {
        id: '__cr__', publicKey: kp.publicKey.toBase58(), privateKey: creatorKey,
        solBalance: 0, tokenBalance: 0, usdcBalance: 0, label: 'Creator', createdAt: '',
      };
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: [cw], tokenMint: tokenMintInput, network }),
      });
      const data = await res.json();
      if (data.success && data.data?.[0]) {
        setCreatorSolBal(data.data[0].solBalance || 0);
        setCreatorUsdcBal(data.data[0].usdcBalance || 0);
      }
    } catch {}
  }, [creatorKey, tokenMintInput, network]);

  // Unified WebSocket: wallet balance updates + pool monitoring (Chart Manager)
  useEffect(() => {
    const pubkeys = wallets.map(w => w.publicKey);
    if (pubkeys.length === 0) return;

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || '';
    const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    if (!wsUrl) {
      // No WS URL — pure polling fallback
      const iv = setInterval(() => { handleRefreshBalances(); }, 5000);
      balanceFallbackRef.current = iv;
      return () => clearInterval(iv);
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    // Initial fetch
    handleRefreshBalances();
    refreshCreatorBal();

    const startFallback = () => {
      if (!balanceFallbackRef.current && alive) {
        balanceFallbackRef.current = setInterval(() => { handleRefreshBalances(); }, 5000);
      }
    };

    const stopFallback = () => {
      if (balanceFallbackRef.current) { clearInterval(balanceFallbackRef.current); balanceFallbackRef.current = null; }
    };

    const connect = () => {
      if (!alive) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          wsConnectedRef.current = true;
          stopFallback();
          // Sub 1: wallet transactions (balance refresh trigger)
          ws.send(JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'transactionSubscribe',
            params: [{ accountInclude: pubkeys }, { commitment: 'confirmed', transactionDetails: 'none' }],
          }));
          // Sub 2: pool logs (Chart Manager trigger) — only if pool is set
          if (poolAddressInput?.trim()) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'logsSubscribe',
              params: [{ mentions: [poolAddressInput.trim()] }, { commitment: 'confirmed' }],
            }));
          }
          console.log('[WS] Connected — subscribed to', pubkeys.length, 'wallets' + (poolAddressInput ? ' + pool' : ''));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.method === 'transactionNotification') {
              handleRefreshBalances();
              refreshCreatorBal();
            } else if (msg.method === 'logsNotification' && msg.params?.result?.value) {
              if (!msg.params.result.value.err) {
                // Pool activity — Chart Manager will pick it up via its own polling trigger
                if (cmActiveRef.current) {
                  const cmEvent = new CustomEvent('cm-pool-activity');
                  window.dispatchEvent(cmEvent);
                }
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          wsConnectedRef.current = false;
          wsRef.current = null;
          if (alive) {
            console.log('[WS] Closed — fallback polling');
            startFallback();
            reconnectTimer = setTimeout(connect, 5000);
          }
        };

        ws.onerror = () => ws.close();
      } catch {
        startFallback();
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();
    // Start fallback until WS connects
    startFallback();

    return () => {
      alive = false;
      stopFallback();
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [wallets.length > 0, tokenMintInput, network, poolAddressInput]);

  useEffect(() => {
    if (!creatorKey) return;
    refreshCreatorBal();
    const iv = setInterval(refreshCreatorBal, 30000);
    return () => clearInterval(iv);
  }, [creatorKey, refreshCreatorBal]);

  // Sync fund target with MM selection by default
  useEffect(() => {
    setFundTargetIds(new Set(mmSelectedIds));
  }, [mmSelectedIds]);

  // Fund selected wallets from creator
  const handleFundWallets = async () => {
    const targetIds = fundTargetIds;
    if (!creatorKey || targetIds.size === 0 || fundLoading) return;
    setFundLoading(true);
    try {
      const selected = wallets.filter(w => targetIds.has(w.id));
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
      addToast(`Funded ${confirmed}/${selected.length} wallets with ${fundAmount} ${fundAsset.toUpperCase()}${failed > 0 ? ` (${failed} failed)` : ''}`, confirmed > 0 ? 'success' : 'error');
      refreshCreatorBal();
      handleRefreshBalances();
    } catch (err) {
      addToast(`Fund failed: ${(err as Error).message}`, 'error');
    } finally {
      setFundLoading(false);
    }
  };

  // Auto-fund: top up wallets below threshold (SOL + USDC independently)
  const runAutoFund = useCallback(async () => {
    if (!creatorKey || autoFundingRef.current) return;
    const targetIds = fundTargetIds;
    if (targetIds.size === 0) return;
    autoFundingRef.current = true;
    try {
      const selected = wallets.filter(w => targetIds.has(w.id));
      const allItems: Array<{ walletId: string; fromPrivateKey: string; toPublicKey: string; amount: number; assetType: 'sol' | 'usdc'; tokenMint?: string; decimals?: number }> = [];

      // SOL funding
      if (autoFundSolAmount > 0 && autoFundSolThreshold > 0) {
        const needsSol = selected.filter(w => w.solBalance < autoFundSolThreshold);
        for (const w of needsSol) {
          allItems.push({ walletId: w.id, fromPrivateKey: creatorKey, toPublicKey: w.publicKey, amount: autoFundSolAmount, assetType: 'sol' });
        }
      }
      // USDC funding
      if (autoFundUsdcAmount > 0 && autoFundUsdcThreshold > 0) {
        const usdcMint = network === 'devnet' ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const needsUsdc = selected.filter(w => w.usdcBalance < autoFundUsdcThreshold);
        for (const w of needsUsdc) {
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
        addToast(`Auto-fund: ${confirmed}/${allItems.length} topped up`, confirmed > 0 ? 'success' : 'error');
        refreshCreatorBal();
        handleRefreshBalances();
      }
    } catch {} finally {
      autoFundingRef.current = false;
    }
  }, [creatorKey, wallets, fundTargetIds, autoFundSolThreshold, autoFundSolAmount, autoFundUsdcThreshold, autoFundUsdcAmount, network, addToast, refreshCreatorBal]);

  useEffect(() => {
    if (!autoFundOn) return;
    const iv = setInterval(runAutoFund, 15000);
    runAutoFund();
    return () => clearInterval(iv);
  }, [autoFundOn, runAutoFund]);

  // For quick trade, show all wallets sorted
  const allWallets = useMemo(() => {
    const sorted = [...wallets];
    if (sortField !== 'default') {
      sorted.sort((a, b) => {
        const valA = sortField === 'sol' ? a.solBalance : sortField === 'token' ? a.tokenBalance : a.usdcBalance;
        const valB = sortField === 'sol' ? b.solBalance : sortField === 'token' ? b.tokenBalance : b.usdcBalance;
        return sortDesc ? valB - valA : valA - valB;
      });
    }
    return sorted;
  }, [wallets, sortField, sortDesc]);

  const selectedWallets = wallets.filter((w) => selectedIds.has(w.id));

  const totalTokensToSell = useMemo(() => {
    return selectedWallets.reduce(
      (acc, w) => acc + w.tokenBalance * (percentage / 100),
      0
    );
  }, [selectedWallets, percentage]);

  // Totals for results summary
  const totalSold = useMemo(
    () => results.reduce((acc, r) => acc + (r.amountSold || 0), 0),
    [results]
  );

  const totalQuoteReceived = useMemo(
    () =>
      results.reduce((acc, r) => acc + (r.quoteReceived || 0), 0),
    [results]
  );

  const quoteSymbol = useMemo(
    () => results.find((r) => r.quoteSymbol)?.quoteSymbol || 'SOL',
    [results]
  );

  const handlePresetClick = (pct: number) => {
    setPercentage(pct);
    setCustomPercentage('');
  };

  const handleCustomPercentage = (value: string) => {
    setCustomPercentage(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      setPercentage(parsed);
    }
  };

  const fetchQuote = useCallback(async (
    walletsList: WalletEntry[],
    pct: number,
    slip: number,
    poolAddr: string,
    mintAddr: string
  ) => {
    if (walletsList.length === 0 || !poolAddr.trim() || !mintAddr.trim()) {
      setQuotePreview([]);
      return;
    }
    setQuoteLoading(true);
    try {
      const res = await fetch('/api/wallets/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddr.trim(),
          tokenMint: mintAddr.trim(),
          wallets: walletsList,
          percentage: pct,
          slippage: slip * 100,
          decimals: tokenDecimals,
          network,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setQuotePreview(data.data);
      }
    } catch { /* silent */ }
    setQuoteLoading(false);
  }, [tokenDecimals, network]);

  // Auto-fetch quote with debounce when params change (batch mode only)
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (quickTradeMode) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (selectedWallets.length === 0 || !poolAddressInput || !tokenMintInput) {
      setQuotePreview([]);
      return;
    }
    quoteTimer.current = setTimeout(() => {
      fetchQuote(selectedWallets, percentage, slippage, poolAddressInput, tokenMintInput);
    }, 600);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [quickTradeMode, selectedWallets, percentage, slippage, poolAddressInput, tokenMintInput, fetchQuote]);

  // Price cache: fetch quote for first wallet at reference amount every 15s
  const fetchPriceCache = useCallback(async () => {
    if (!quickTradeMode || !poolAddressInput || !tokenMintInput) return;
    const refWallet = walletsWithTokens[0];
    if (!refWallet || refWallet.tokenBalance <= 0) return;

    // Use 1% of first wallet's balance as reference
    const refPct = 1;
    try {
      const res = await fetch('/api/wallets/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddressInput.trim(),
          tokenMint: tokenMintInput.trim(),
          wallets: [refWallet],
          percentage: refPct,
          slippage: quickTradeSlippage * 100,
          decimals: tokenDecimals,
          network,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.[0]) {
        const q = data.data[0];
        if (q.sellAmount > 0 && q.estimatedQuote > 0) {
          setPricePerToken(q.estimatedQuote / q.sellAmount);
          setPriceQuoteSymbol(q.quoteSymbol || 'SOL');
        }
      }
    } catch { /* silent */ }
  }, [quickTradeMode, poolAddressInput, tokenMintInput, walletsWithTokens, quickTradeSlippage, tokenDecimals, network]);

  useEffect(() => {
    if (!quickTradeMode) return;
    fetchPriceCache();
    const interval = setInterval(fetchPriceCache, 15000);
    return () => clearInterval(interval);
  }, [quickTradeMode, fetchPriceCache]);

  // ===== AUTO-SELL LOGIC =====
  const processAutoSellQueue = useCallback(async () => {
    if (autoSellProcessingRef.current) return;
    if (autoSellQueueRef.current.length === 0) return;
    if (pricePerToken <= 0) return; // no price info yet, skip

    autoSellProcessingRef.current = true;

    try {
      // Sum all queued deltas
      let totalDelta = BigInt(0);
      while (autoSellQueueRef.current.length > 0) {
        totalDelta += autoSellQueueRef.current.shift()!;
      }

      const quoteDecimals = autoSellQuoteDecimalsRef.current;
      const qSymbol = autoSellQuoteSymbolRef.current;
      const buyAmount = Number(totalDelta) / 10 ** quoteDecimals;
      const sellQuoteTarget = buyAmount * (autoSellRatio / 100);
      const tokensToSell = sellQuoteTarget / pricePerToken;

      if (tokensToSell <= 0) {
        autoSellProcessingRef.current = false;
        return;
      }

      // Log buy detection
      const detectId = uuidv4();
      setAutoSellLog((prev) => [{
        id: detectId,
        type: 'buy-detected' as const,
        buyAmount,
        quoteSymbol: qSymbol,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 50));

      // Pick next wallet via round-robin
      const eligible = walletsWithTokens.filter((w) => w.tokenBalance > 0);
      if (eligible.length === 0) {
        setAutoSellLog((prev) => [{
          id: uuidv4(),
          type: 'skipped' as const,
          buyAmount,
          quoteSymbol: qSymbol,
          error: 'All wallets empty',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 50));
        autoSellProcessingRef.current = false;
        return;
      }

      const walletIdx = autoSellWalletIndexRef.current % eligible.length;
      const wallet = eligible[walletIdx];
      autoSellWalletIndexRef.current = walletIdx + 1;

      // Cap at wallet's token balance
      const actualTokensToSell = Math.min(tokensToSell, wallet.tokenBalance);
      const label = wallet.label || truncateKey(wallet.publicKey);

      try {
        const res = await fetch('/api/wallets/sell-exact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: poolAddressInput.trim(),
            tokenMint: tokenMintInput.trim(),
            wallet,
            tokenAmount: actualTokensToSell,
            slippage: autoSellSlippage * 100,
            decimals: tokenDecimals,
            network,
          }),
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error);
        const r = data.data;
        if (r?.error) throw new Error(r.error);

        setAutoSellLog((prev) => [{
          id: uuidv4(),
          type: 'sell-executed' as const,
          buyAmount,
          quoteSymbol: qSymbol,
          tokensSold: r?.amountSold || actualTokensToSell,
          walletLabel: label,
          walletPublicKey: wallet.publicKey,
          signature: r?.signature,
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 50));

        addToast(
          `Auto-sell: ${(r?.amountSold || actualTokensToSell).toLocaleString()} tokens via ${label}`,
          'success'
        );

        onAddLog({
          id: uuidv4(),
          type: 'sell',
          signature: r?.signature || 'N/A',
          status: 'success',
          message: `Auto-sell ${(r?.amountSold || actualTokensToSell).toLocaleString()} tokens (${autoSellRatio}% of ${buyAmount.toFixed(4)} ${qSymbol} buy) via ${label}`,
          timestamp: new Date().toISOString(),
        });

        fetchPriceCache();
      } catch (err) {
        const errMsg = (err as Error).message;
        setAutoSellLog((prev) => [{
          id: uuidv4(),
          type: 'sell-error' as const,
          buyAmount,
          quoteSymbol: qSymbol,
          walletLabel: label,
          walletPublicKey: wallet.publicKey,
          error: errMsg,
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 50));

        addToast(`Auto-sell failed: ${errMsg.slice(0, 60)}`, 'error');
      }
    } finally {
      autoSellProcessingRef.current = false;
      // Recurse if more items queued while we were processing
      if (autoSellQueueRef.current.length > 0 && autoSellActiveRef.current) {
        processAutoSellQueue();
      }
    }
  }, [autoSellRatio, autoSellSlippage, pricePerToken, walletsWithTokens, poolAddressInput, tokenMintInput, tokenDecimals, network, addToast, onAddLog, fetchPriceCache]);

  // Auto-sell polling effect
  useEffect(() => {
    if (!autoSellEnabled || !quickTradeMode) {
      // Clean up
      autoSellActiveRef.current = false;
      if (autoSellIntervalRef.current) {
        clearInterval(autoSellIntervalRef.current);
        autoSellIntervalRef.current = null;
      }
      lastVaultBalanceRef.current = null;
      autoSellQueueRef.current = [];
      return;
    }

    if (!poolAddressInput || !tokenMintInput) return;

    autoSellActiveRef.current = true;

    // Fetch baseline
    const fetchBaseline = async () => {
      try {
        const res = await fetch('/api/pool/vault-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: poolAddressInput.trim(),
            network,
          }),
        });
        const data = await res.json();
        if (data.success) {
          lastVaultBalanceRef.current = data.data.rawBalance;
          autoSellQuoteDecimalsRef.current = data.data.quoteDecimals;
          autoSellQuoteSymbolRef.current = data.data.quoteSymbol;
        }
      } catch { /* skip */ }
    };

    const pollVault = async () => {
      if (!autoSellActiveRef.current) return;
      try {
        const res = await fetch('/api/pool/vault-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: poolAddressInput.trim(),
            network,
          }),
        });
        const data = await res.json();
        if (!data.success) return;

        const currentBalance = data.data.rawBalance as string;
        autoSellQuoteDecimalsRef.current = data.data.quoteDecimals;
        autoSellQuoteSymbolRef.current = data.data.quoteSymbol;

        if (lastVaultBalanceRef.current !== null) {
          const prev = BigInt(lastVaultBalanceRef.current);
          const curr = BigInt(currentBalance);
          const delta = curr - prev;

          if (delta > BigInt(0)) {
            // Positive delta = buy detected
            autoSellQueueRef.current.push(delta);
            processAutoSellQueue();
          }
        }

        lastVaultBalanceRef.current = currentBalance;
      } catch { /* skip this cycle */ }
    };

    fetchBaseline().then(() => {
      autoSellIntervalRef.current = setInterval(pollVault, autoSellPollMs);
    });

    return () => {
      autoSellActiveRef.current = false;
      if (autoSellIntervalRef.current) {
        clearInterval(autoSellIntervalRef.current);
        autoSellIntervalRef.current = null;
      }
    };
  }, [autoSellEnabled, quickTradeMode, poolAddressInput, tokenMintInput, network, autoSellPollMs, processAutoSellQueue]);

  // Chart Manager — triggered by unified WebSocket + fallback polling
  useEffect(() => {
    if (!cmEnabled) {
      cmActiveRef.current = false;
      if (cmIntervalRef.current) { clearInterval(cmIntervalRef.current); cmIntervalRef.current = null; }
      cmLastSigRef.current = null;
      return;
    }

    if (!poolAddressInput || !tokenMintInput) return;

    cmActiveRef.current = true;
    const cmMode = cmSellOnBuy && cmBuyOnSell ? 'both' : cmSellOnBuy ? 'sell-on-buy' : 'buy-on-sell';

    const pollChartManager = async () => {
      if (!cmActiveRef.current || cmProcessingRef.current) return;
      cmProcessingRef.current = true;

      try {
        const currentWallets = walletsRef.current;
        const ownPubkeys = currentWallets.map(w => w.publicKey);
        if (creatorKey) ownPubkeys.push(creatorKey);

        const sellWalletsData = currentWallets
          .filter(w => w.tokenBalance > 0)
          .map(w => ({
            id: w.id, publicKey: w.publicKey, privateKey: w.privateKey,
            solBalance: w.solBalance, tokenBalance: w.tokenBalance,
            usdcBalance: w.usdcBalance, label: w.label, createdAt: w.createdAt,
          }));

        const buyWalletsData = currentWallets
          .filter(w => w.usdcBalance >= cmMinDollar)
          .sort((a, b) => b.usdcBalance - a.usdcBalance)
          .map(w => ({
            id: w.id, publicKey: w.publicKey, privateKey: w.privateKey,
            solBalance: w.solBalance, tokenBalance: w.tokenBalance,
            usdcBalance: w.usdcBalance, label: w.label, createdAt: w.createdAt,
          }));

        const res = await fetch('/api/chart-manager/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: poolAddressInput.trim(),
            tokenMint: tokenMintInput.trim(),
            ownWallets: ownPubkeys,
            ownSignatures: [...cmOwnSignaturesRef.current],
            lastSignature: cmLastSigRef.current,
            minDollar: cmMinDollar,
            mode: cmMode,
            sellWallets: sellWalletsData,
            buyWallets: buyWalletsData,
            slippageBps: cmSlippage,
            tokenDecimals,
            network,
          }),
        });

        const data = await res.json();
        if (data.success && data.data) {
          if (data.data.lastSignature) {
            cmLastSigRef.current = data.data.lastSignature;
          }
          if (data.data.events && data.data.events.length > 0) {
            setCmLog(prev => [...data.data.events, ...prev].slice(0, 200));
            for (const evt of data.data.events) {
              if (evt.counterSignature) cmOwnSignaturesRef.current.add(evt.counterSignature);
              if (evt.type === 'counter-sell') addToast(`Chart Manager: sold ${evt.tokenAmount.toLocaleString()} tokens`, 'success');
              else if (evt.type === 'counter-buy') addToast(`Chart Manager: bought ${evt.tokenAmount.toLocaleString()} tokens`, 'success');
              else if (evt.type === 'error') addToast(`Chart Manager: ${evt.message}`, 'error');
            }
          }
        }
      } catch {
        // Skip failed poll
      } finally {
        cmProcessingRef.current = false;
      }
    };

    // Listen for pool activity from unified WebSocket
    const onPoolActivity = () => pollChartManager();
    window.addEventListener('cm-pool-activity', onPoolActivity);

    // Initial poll to set baseline
    pollChartManager();

    // Fallback polling if WebSocket not connected
    if (!wsConnectedRef.current) {
      cmIntervalRef.current = setInterval(pollChartManager, cmPollMs);
    }

    return () => {
      cmActiveRef.current = false;
      window.removeEventListener('cm-pool-activity', onPoolActivity);
      if (cmIntervalRef.current) { clearInterval(cmIntervalRef.current); cmIntervalRef.current = null; }
    };
  }, [cmEnabled, cmSellOnBuy, cmBuyOnSell, cmMinDollar, cmSlippage, cmPollMs, poolAddressInput, tokenMintInput, network, tokenDecimals, addToast, creatorKey]);

  // Quick sell for a single wallet
  const handleQuickSell = useCallback(async (wallet: WalletEntry, pct: number) => {
    if (!poolAddressInput || !tokenMintInput) {
      addToast('Pool address and token mint are required', 'error');
      return;
    }
    const actionKey = `sell-${pct}`;
    setWalletActionLoading((prev) => new Map(prev).set(wallet.id, actionKey));

    try {
      const res = await fetch('/api/wallets/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddressInput.trim(),
          tokenMint: tokenMintInput.trim(),
          wallets: [wallet],
          percentage: pct,
          slippage: quickTradeSlippage * 100,
          decimals: tokenDecimals,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const r = data.data?.[0];
      if (r?.error) throw new Error(r.error);

      const label = wallet.label || truncateKey(wallet.publicKey);
      const quoteStr = r?.quoteReceived != null
        ? `${r.quoteReceived.toFixed(4)} ${r.quoteSymbol || 'SOL'}`
        : '';
      addToast(`${label}: Sold ${pct}% (${r?.amountSold?.toLocaleString() || '?'} tokens)${quoteStr ? ` for ${quoteStr}` : ''}`, 'success');

      onAddLog({
        id: uuidv4(),
        type: 'sell',
        signature: r?.signature || 'N/A',
        status: 'success',
        message: `Quick sell ${pct}% from ${label}`,
        timestamp: new Date().toISOString(),
      });

      // Trigger balance refresh by re-fetching price cache
      fetchPriceCache();
    } catch (err) {
      const msg = (err as Error).message;
      addToast(`Sell failed: ${msg.slice(0, 80)}`, 'error');
    } finally {
      setWalletActionLoading((prev) => {
        const next = new Map(prev);
        next.delete(wallet.id);
        return next;
      });
    }
  }, [poolAddressInput, tokenMintInput, quickTradeSlippage, tokenDecimals, network, addToast, onAddLog, fetchPriceCache]);

  // Quick buy for a single wallet
  const handleQuickBuy = useCallback(async (wallet: WalletEntry, quoteAmount: number) => {
    if (!poolAddressInput || !tokenMintInput) {
      addToast('Pool address and token mint are required', 'error');
      return;
    }
    const actionKey = `buy-${quoteAmount}`;
    setWalletActionLoading((prev) => new Map(prev).set(wallet.id, actionKey));

    try {
      const res = await fetch('/api/wallets/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddressInput.trim(),
          tokenMint: tokenMintInput.trim(),
          wallet,
          quoteAmount,
          slippage: quickTradeSlippage * 100,
          decimals: tokenDecimals,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const r = data.data;
      if (r?.error) throw new Error(r.error);

      const label = wallet.label || truncateKey(wallet.publicKey);
      addToast(
        `${label}: Bought ${r?.tokensReceived?.toLocaleString() || '?'} tokens for ${quoteAmount} ${r?.quoteSymbol || 'SOL'}`,
        'success'
      );

      onAddLog({
        id: uuidv4(),
        type: 'buy',
        signature: r?.signature || 'N/A',
        status: 'success',
        message: `Quick buy ${quoteAmount} ${r?.quoteSymbol || 'SOL'} worth from ${label}`,
        timestamp: new Date().toISOString(),
      });

      fetchPriceCache();
    } catch (err) {
      const msg = (err as Error).message;
      addToast(`Buy failed: ${msg.slice(0, 80)}`, 'error');
    } finally {
      setWalletActionLoading((prev) => {
        const next = new Map(prev);
        next.delete(wallet.id);
        return next;
      });
    }
  }, [poolAddressInput, tokenMintInput, quickTradeSlippage, tokenDecimals, network, addToast, onAddLog, fetchPriceCache]);

  const handleExecuteSell = async () => {
    if (selectedWallets.length === 0) {
      setError('Select at least one wallet to sell from');
      return;
    }
    if (!poolAddressInput.trim()) {
      setError('Pool address is required');
      return;
    }
    if (!tokenMintInput.trim()) {
      setError('Token mint address is required');
      return;
    }
    if (percentage <= 0 || percentage > 100) {
      setError('Percentage must be between 0 and 100');
      return;
    }

    setError(null);
    setResults([]);
    setLoading(true);

    try {
      const res = await fetch('/api/wallets/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddressInput.trim(),
          tokenMint: tokenMintInput.trim(),
          wallets: selectedWallets,
          percentage,
          slippage: slippage * 100,
          decimals: tokenDecimals,
          network,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Sell execution failed');
      }

      const sellResults: SellResult[] = Array.isArray(data.data)
        ? data.data.map((r: any, idx: number) => {
            const wallet = selectedWallets[idx];
            return {
              walletPublicKey: r.walletPublicKey || wallet?.publicKey || 'Unknown',
              walletLabel: wallet?.label || `Wallet-${idx + 1}`,
              amountSold: r.amountSold || 0,
              quoteReceived: r.quoteReceived || null,
              quoteSymbol: r.quoteSymbol || null,
              signature: r.signature || null,
              error: r.error || null,
              status: r.error ? 'error' : 'success',
            } as SellResult;
          })
        : [
            {
              walletPublicKey: 'Batch',
              walletLabel: 'All Selected',
              amountSold: totalTokensToSell,
              quoteReceived: null,
              quoteSymbol: null,
              signature: typeof data.data === 'string' ? data.data : null,
              error: null,
              status: 'success' as const,
            },
          ];

      setResults(sellResults);

      const successCount = sellResults.filter(
        (r) => r.status === 'success'
      ).length;
      const errorCount = sellResults.filter(
        (r) => r.status === 'error'
      ).length;

      onAddLog({
        id: uuidv4(),
        type: 'sell',
        signature: sellResults.find((r) => r.signature)?.signature || 'N/A',
        status: errorCount === 0 ? 'success' : 'error',
        message: `Sold ${percentage}% tokens from ${selectedWallets.length} wallets (${successCount} success, ${errorCount} errors)`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog({
        id: uuidv4(),
        type: 'sell',
        signature: 'N/A',
        status: 'error',
        message: `Sell failed: ${msg}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const isSolPaired = priceQuoteSymbol === 'SOL';
  const quickSellPresets = [0.15, 0.2, 0.3, 0.5, 1, 2.5, 5, 10];
  const quickBuyPresets = isSolPaired ? [0.5, 1, 2] : [50, 100, 200, 400, 500, 600];

  const isWalletBusy = (walletId: string) => walletActionLoading.has(walletId);
  const getWalletAction = (walletId: string) => walletActionLoading.get(walletId) || '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Sell Strategy</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Configure and execute token sells across multiple wallets via Meteora
            DAMM v2
          </p>
        </div>
        <button
          onClick={() => setQuickTradeMode(!quickTradeMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
            quickTradeMode
              ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20'
              : 'bg-[#18181b] text-[#a1a1aa] border-[#27272a] hover:border-purple-500/50 hover:text-purple-400'
          }`}
        >
          <Zap className={`w-4 h-4 ${quickTradeMode ? 'text-yellow-300' : ''}`} />
          Quick Trade
        </button>
      </div>

      {/* Configuration */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#a1a1aa]" />
          Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Pool Address
            </label>
            <input
              type="text"
              value={poolAddressInput}
              onChange={(e) => setPoolAddressInput(e.target.value)}
              placeholder="Meteora DAMM v2 pool address..."
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Token Mint Address
            </label>
            <input
              type="text"
              value={tokenMintInput}
              onChange={(e) => setTokenMintInput(e.target.value)}
              placeholder="Token mint address..."
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* ===== QUICK TRADE MODE ===== */}
      {quickTradeMode ? (
        <>
          {/* Global Slippage for Quick Trade */}
          <div className="bg-[#18181b] rounded-xl border border-purple-500/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-300" />
                <span className="text-sm font-semibold text-purple-300">Quick Trade Mode</span>
                {pricePerToken > 0 && (
                  <span className="text-xs text-[#71717a] ml-3">
                    Price: ~{pricePerToken < 0.0001
                      ? pricePerToken.toExponential(2)
                      : pricePerToken.toFixed(6)} {priceQuoteSymbol}/token
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#a1a1aa]">Slippage</label>
                <div className="relative">
                  <input
                    type="number"
                    value={quickTradeSlippage}
                    onChange={(e) =>
                      setQuickTradeSlippage(
                        Math.max(0.01, Math.min(50, parseFloat(e.target.value) || 0.01))
                      )
                    }
                    min={0.01}
                    max={50}
                    step={0.1}
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===== AUTO-SELL SECTION ===== */}
          <div className={`bg-[#18181b] rounded-xl border ${autoSellEnabled ? 'border-red-500/50 shadow-lg shadow-red-500/10' : 'border-[#27272a]'} p-5 space-y-4 transition-all`}>
            {/* Header with toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crosshair className={`w-5 h-5 ${autoSellEnabled ? 'text-red-400' : 'text-[#52525b]'}`} />
                <div>
                  <h3 className={`text-base font-semibold ${autoSellEnabled ? 'text-red-400' : 'text-white'}`}>
                    Auto-Sell on Buy
                  </h3>
                  <p className="text-xs text-[#52525b]">
                    Automatically counter-sell when external buys are detected
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAutoSellEnabled(!autoSellEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  autoSellEnabled ? 'bg-red-600' : 'bg-[#27272a]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    autoSellEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Sell Ratio
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={autoSellRatio}
                    onChange={(e) => setAutoSellRatio(Math.max(1, Math.min(200, parseFloat(e.target.value) || 50)))}
                    min={1}
                    max={200}
                    step={5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-red-500/50 focus:border-red-500 outline-none pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Slippage
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={autoSellSlippage}
                    onChange={(e) => setAutoSellSlippage(Math.max(0.1, Math.min(50, parseFloat(e.target.value) || 2)))}
                    min={0.1}
                    max={50}
                    step={0.5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-red-500/50 focus:border-red-500 outline-none pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Poll Interval
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={autoSellPollMs / 1000}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setAutoSellPollMs(Math.max(1000, Math.min(30000, val * 1000)));
                      }
                    }}
                    min={1}
                    max={30}
                    step={0.5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-red-500/50 focus:border-red-500 outline-none pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">s</span>
                </div>
              </div>
            </div>

            {/* Status indicator */}
            {autoSellEnabled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <span className="text-xs text-red-400 font-medium">
                  Monitoring vault... ({autoSellRatio}% counter-sell, {walletsWithTokens.length} wallets in rotation)
                </span>
              </div>
            )}

            {/* Activity log */}
            {autoSellLog.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">
                    Activity Log
                  </span>
                  <button
                    onClick={() => setAutoSellLog([])}
                    className="text-[10px] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                  {autoSellLog.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                        entry.type === 'buy-detected'
                          ? 'bg-blue-500/10 border border-blue-500/20'
                          : entry.type === 'sell-executed'
                          ? 'bg-green-500/10 border border-green-500/20'
                          : entry.type === 'sell-error'
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-yellow-500/10 border border-yellow-500/20'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {entry.type === 'buy-detected' && <TrendingUp className="w-3 h-3 text-blue-400" />}
                        {entry.type === 'sell-executed' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                        {entry.type === 'sell-error' && <XCircle className="w-3 h-3 text-red-400" />}
                        {entry.type === 'skipped' && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        {entry.type === 'buy-detected' && (
                          <span className="text-blue-300">
                            Buy detected: {entry.buyAmount < 0.0001 ? entry.buyAmount.toExponential(2) : entry.buyAmount.toFixed(4)} {entry.quoteSymbol}
                          </span>
                        )}
                        {entry.type === 'sell-executed' && (
                          <div>
                            <span className="text-green-300">
                              Sold {entry.tokensSold?.toLocaleString()} tokens via {entry.walletLabel}
                            </span>
                            {entry.signature && (
                              <a
                                href={`https://explorer.solana.com/tx/${entry.signature}${clusterParam}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1.5 text-[#52525b] hover:text-purple-400 transition-colors inline-flex items-center gap-0.5"
                              >
                                <span className="font-mono">{entry.signature.slice(0, 8)}...</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        )}
                        {entry.type === 'sell-error' && (
                          <span className="text-red-300">
                            Failed ({entry.walletLabel}): {entry.error?.slice(0, 60)}
                          </span>
                        )}
                        {entry.type === 'skipped' && (
                          <span className="text-yellow-300">
                            Skipped: {entry.error}
                          </span>
                        )}
                      </div>
                      <span className="text-[#3f3f46] shrink-0 text-[10px]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ===== CHART MANAGER SECTION ===== */}
          <div className={`bg-[#18181b] rounded-xl border ${cmEnabled ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10' : 'border-[#27272a]'} p-5 space-y-4 transition-all`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className={`w-5 h-5 ${cmEnabled ? 'text-cyan-400' : 'text-[#52525b]'}`} />
                <div>
                  <h3 className={`text-base font-semibold ${cmEnabled ? 'text-cyan-400' : 'text-white'}`}>
                    Chart Manager
                  </h3>
                  <p className="text-xs text-[#52525b]">
                    Auto counter-trade external buys/sells to stabilize price
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cmEnabled && (
                  <button
                    onClick={() => { setCmEnabled(false); addToast('Chart Manager stopped', 'info'); }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 animate-pulse"
                  >
                    <Square className="w-3 h-3" />
                    STOP
                  </button>
                )}
                <button
                  onClick={() => {
                    const next = !cmEnabled;
                    setCmEnabled(next);
                    if (next) addToast('Chart Manager started', 'success');
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    cmEnabled ? 'bg-cyan-600' : 'bg-[#27272a]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      cmEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Mode toggles */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCmSellOnBuy(!cmSellOnBuy)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  cmSellOnBuy
                    ? 'bg-red-500/15 border-red-500/40 text-red-400'
                    : 'bg-[#09090b] border-[#27272a] text-[#52525b]'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Sell on Buy
              </button>
              <button
                onClick={() => setCmBuyOnSell(!cmBuyOnSell)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  cmBuyOnSell
                    ? 'bg-green-500/15 border-green-500/40 text-green-400'
                    : 'bg-[#09090b] border-[#27272a] text-[#52525b]'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Buy on Sell
              </button>
            </div>

            {/* Settings */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Min $ Threshold
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={cmMinDollar}
                    onChange={(e) => setCmMinDollar(Math.max(0, parseFloat(e.target.value) || 0))}
                    min={0}
                    step={0.5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">$</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Slippage
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={cmSlippage / 100}
                    onChange={(e) => setCmSlippage(Math.max(10, Math.min(5000, Math.round((parseFloat(e.target.value) || 1) * 100))))}
                    min={0.1}
                    max={50}
                    step={0.5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">
                  Poll Interval
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={cmPollMs / 1000}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) setCmPollMs(Math.max(2000, Math.min(30000, val * 1000)));
                    }}
                    min={2}
                    max={30}
                    step={0.5}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] text-xs">s</span>
                </div>
              </div>
            </div>

            {/* Buy wallets info (auto-detected, sorted by USDC) */}
            {cmBuyOnSell && (() => {
              const buyWallets = wallets.filter(w => w.usdcBalance >= cmMinDollar).sort((a, b) => b.usdcBalance - a.usdcBalance);
              const totalUsdc = buyWallets.reduce((s, w) => s + w.usdcBalance, 0);
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg">
                  <Wallet className="w-3.5 h-3.5 text-[#52525b]" />
                  <span className="text-xs text-[#71717a]">Buy wallets:</span>
                  {buyWallets.length > 0 ? (
                    <span className="text-xs text-green-400">
                      {buyWallets.length} wallets (${totalUsdc.toFixed(2)} USDC total)
                    </span>
                  ) : (
                    <span className="text-xs text-red-400">No wallets with USDC found</span>
                  )}
                </div>
              );
            })()}

            {/* Status indicator */}
            {cmEnabled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <span className="text-xs text-cyan-400 font-medium">
                  Monitoring transactions... (
                  {cmSellOnBuy && 'sell-on-buy'}
                  {cmSellOnBuy && cmBuyOnSell && ' + '}
                  {cmBuyOnSell && 'buy-on-sell'}
                  {`, min $${cmMinDollar}, ${wallets.filter(w => w.tokenBalance > 0).length} sell wallets`}
                  )
                </span>
              </div>
            )}

            {/* Activity log */}
            {cmLog.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">
                    Activity Log ({cmLog.length})
                  </span>
                  <button
                    onClick={() => setCmLog([])}
                    className="text-[10px] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                  {cmLog.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                        entry.type === 'external-buy'
                          ? 'bg-blue-500/10 border border-blue-500/20'
                          : entry.type === 'external-sell'
                          ? 'bg-orange-500/10 border border-orange-500/20'
                          : entry.type === 'counter-sell'
                          ? 'bg-green-500/10 border border-green-500/20'
                          : entry.type === 'counter-buy'
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : entry.type === 'error'
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-yellow-500/10 border border-yellow-500/20'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {entry.type === 'external-buy' && <TrendingUp className="w-3 h-3 text-blue-400" />}
                        {entry.type === 'external-sell' && <TrendingDown className="w-3 h-3 text-orange-400" />}
                        {entry.type === 'counter-sell' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                        {entry.type === 'counter-buy' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {entry.type === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
                        {entry.type === 'skip' && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={
                          entry.type === 'external-buy' ? 'text-blue-300' :
                          entry.type === 'external-sell' ? 'text-orange-300' :
                          entry.type === 'counter-sell' ? 'text-green-300' :
                          entry.type === 'counter-buy' ? 'text-emerald-300' :
                          entry.type === 'error' ? 'text-red-300' :
                          'text-yellow-300'
                        }>
                          {entry.message}
                        </span>
                        {entry.counterSignature && (
                          <a
                            href={`https://solscan.io/tx/${entry.counterSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1.5 text-[#52525b] hover:text-purple-400 transition-colors inline-flex items-center gap-0.5"
                          >
                            <span className="font-mono">{entry.counterSignature.slice(0, 8)}...</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-[#3f3f46] shrink-0 text-[10px]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sort & Refresh Toolbar */}
          {allWallets.length > 0 && (
            <div className="flex items-center justify-between bg-[#18181b] rounded-xl border border-[#27272a] px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#52525b] mr-1" />
                {(['sol', 'token', 'usdc'] as SortField[]).map((field) => {
                  const active = sortField === field;
                  const label = field === 'sol' ? 'SOL' : field === 'token' ? 'Token' : 'USDC';
                  return (
                    <button
                      key={field}
                      onClick={() => handleSortToggle(field)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        active
                          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                          : 'bg-[#09090b] text-[#71717a] border border-[#27272a] hover:text-white hover:border-[#3f3f46]'
                      }`}
                    >
                      {label} {active && (sortDesc ? '↓' : '↑')}
                    </button>
                  );
                })}
                {sortField !== 'default' && (
                  <button
                    onClick={() => { setSortField('default'); setSortDesc(true); }}
                    className="px-1.5 py-1 text-[#52525b] hover:text-white transition-colors"
                    title="Reset sort"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleRefreshBalances}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          )}

          {/* Consolidate */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] overflow-hidden">
            <button
              onClick={() => setShowConsolidate(!showConsolidate)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1f1f23] transition-colors"
            >
              <div className="flex items-center gap-2">
                <ArrowDownToLine className={`w-4 h-4 ${showConsolidate ? 'text-amber-400' : 'text-[#52525b]'}`} />
                <span className={`text-sm font-semibold ${showConsolidate ? 'text-amber-400' : 'text-white'}`}>
                  Consolidate
                </span>
                <span className="text-xs text-[#52525b]">
                  All wallets → 1 destination
                </span>
              </div>
              {showConsolidate ? <ChevronUp className="w-4 h-4 text-[#52525b]" /> : <ChevronDown className="w-4 h-4 text-[#52525b]" />}
            </button>

            {showConsolidate && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#27272a] pt-3">
                {/* Asset type */}
                <div>
                  <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1.5">Asset</label>
                  <div className="flex gap-1.5">
                    {(['sol', 'token', 'usdc'] as const).map((asset) => (
                      <button
                        key={asset}
                        onClick={() => setConsolidateAsset(asset)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          consolidateAsset === asset
                            ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                            : 'bg-[#09090b] text-[#71717a] border border-[#27272a] hover:text-white'
                        }`}
                      >
                        {asset === 'sol' ? 'SOL' : asset === 'token' ? 'Token' : 'USDC'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Destination */}
                <div>
                  <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1.5">Destination</label>
                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={() => setConsolidateDestMode('custom')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        consolidateDestMode === 'custom'
                          ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                          : 'bg-[#09090b] text-[#71717a] border border-[#27272a] hover:text-white'
                      }`}
                    >
                      Custom Address
                    </button>
                    <button
                      onClick={() => setConsolidateDestMode('table')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        consolidateDestMode === 'table'
                          ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                          : 'bg-[#09090b] text-[#71717a] border border-[#27272a] hover:text-white'
                      }`}
                    >
                      Pick from Table
                    </button>
                  </div>
                  {consolidateDestMode === 'custom' ? (
                    <input
                      type="text"
                      value={consolidateDest}
                      onChange={(e) => setConsolidateDest(e.target.value)}
                      placeholder="Public key..."
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500 outline-none placeholder:text-[#3f3f46]"
                    />
                  ) : (
                    <select
                      value={consolidateTableDest}
                      onChange={(e) => setConsolidateTableDest(e.target.value)}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500 outline-none"
                    >
                      <option value="">Select destination wallet...</option>
                      {wallets.map((w, i) => (
                        <option key={w.id} value={w.id}>
                          {w.label || `Wallet-${i + 1}`} ({truncateKey(w.publicKey)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Percentage */}
                <div>
                  <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1.5">
                    Percentage: <span className="text-amber-400">{consolidatePct}%</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={consolidatePct}
                      onChange={(e) => setConsolidatePct(parseInt(e.target.value))}
                      className="flex-1 accent-amber-500 h-1.5"
                    />
                    <div className="flex gap-1">
                      {[25, 50, 100].map((p) => (
                        <button
                          key={p}
                          onClick={() => setConsolidatePct(p)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                            consolidatePct === p
                              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                              : 'bg-[#09090b] text-[#52525b] border border-[#27272a] hover:text-white'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Progress */}
                {consolidateProgress && (
                  <div className="bg-[#09090b] rounded-lg p-3 border border-[#27272a]">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[#a1a1aa]">{consolidateProgress.current}/{consolidateProgress.total}</span>
                      <span>
                        <span className="text-green-400">{consolidateProgress.confirmed} ok</span>
                        {consolidateProgress.failed > 0 && <span className="text-red-400 ml-2">{consolidateProgress.failed} failed</span>}
                      </span>
                    </div>
                    <div className="w-full bg-[#27272a] rounded-full h-1.5">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${consolidateProgress.total > 0 ? (consolidateProgress.current / consolidateProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Go */}
                <button
                  onClick={handleConsolidate}
                  disabled={consolidateLoading || (consolidateDestMode === 'custom' ? !consolidateDest.trim() : !consolidateTableDest) || wallets.length === 0}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {consolidateLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Consolidating...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4" />
                      Consolidate {consolidateAsset === 'sol' ? 'SOL' : consolidateAsset === 'token' ? 'Tokens' : 'USDC'} ({consolidatePct}%)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ===== Market Making ===== */}
          <div className={`bg-[#18181b] rounded-xl border ${mmRunning ? 'border-green-500/40 shadow-lg shadow-green-500/5' : 'border-[#27272a]'} overflow-hidden`}>
            <button
              onClick={() => setShowMM(!showMM)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1f1f23] transition-colors"
            >
              <div className="flex items-center gap-2">
                {mmRunning ? (
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                ) : (
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                )}
                <span className={`text-sm font-semibold ${mmRunning ? 'text-green-400' : showMM ? 'text-purple-400' : 'text-white'}`}>
                  Market Making
                </span>
                {mmRunning && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <span className="text-[10px] text-green-400 font-medium">{mmCycles} cycles — ${mmVolume.toFixed(2)} vol</span>
                  </span>
                )}
              </div>
              {showMM ? <ChevronUp className="w-4 h-4 text-[#52525b]" /> : <ChevronDown className="w-4 h-4 text-[#52525b]" />}
            </button>

            {/* Compact stats + log visible when collapsed */}
            {!showMM && (mmRunning || mmCycles > 0 || mmLog.length > 0) && (
              <div className="px-4 pb-3 space-y-2 border-t border-[#27272a] pt-2">
                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-[#71717a]">Cycles: <span className="text-white font-semibold">{mmCycles}</span></span>
                  <span className="text-[#71717a]">Volume: <span className="text-white font-semibold">${mmVolume.toFixed(2)}</span></span>
                  <span className="text-[#71717a]">Net: <span className={`font-semibold ${mmNetTokens > 0 ? 'text-green-400' : mmNetTokens < 0 ? 'text-red-400' : 'text-white'}`}>
                    {mmNetTokens > 0 ? '+' : ''}{mmNetTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span></span>
                  <span className="text-[#71717a]">Wallets: <span className="text-white font-semibold">{mmSelectedIds.size}</span></span>
                </div>
                {/* Last 5 log entries */}
                {mmLog.length > 0 && (
                  <div className="space-y-0.5 font-mono text-[10px] bg-[#09090b] rounded-lg p-2 border border-[#27272a] max-h-24 overflow-y-auto">
                    {mmLog.slice(0, 5).map((entry, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-[#3f3f46] flex-shrink-0">{entry.time}</span>
                        <span className={mmLogColor(entry.type)}>{entry.message}</span>
                      </div>
                    ))}
                    {mmLog.length > 5 && (
                      <button onClick={() => setShowMM(true)} className="text-[10px] text-purple-400 hover:text-purple-300 mt-0.5">
                        +{mmLog.length - 5} more...
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {showMM && (
              <div className="px-4 pb-4 border-t border-[#27272a] pt-3">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* LEFT — Config */}
                  <div className="space-y-3">
                    {/* Config row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Slippage (bps)</label>
                        <input type="number" value={mmSlippage} onChange={e => setMmSlippage(Number(e.target.value))} disabled={mmRunning}
                          min={1} max={5000} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Max Tok/TX</label>
                        <input type="number" value={mmMaxTokensPerTx} onChange={e => setMmMaxTokensPerTx(Number(e.target.value))} disabled={mmRunning}
                          min={1} className="w-full bg-[#09090b] border border-red-500/30 rounded-lg px-3 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Cycles (0=∞)</label>
                        <input type="number" value={mmMaxCycles} onChange={e => setMmMaxCycles(Number(e.target.value))} disabled={mmRunning}
                          min={0} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                    </div>

                    {/* Trade settings */}
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Min ($)</label>
                        <input type="number" value={mmMinTrade} onChange={e => setMmMinTrade(Number(e.target.value))} disabled={mmRunning}
                          min={0.01} step={0.01} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Max ($)</label>
                        <input type="number" value={mmMaxTrade} onChange={e => setMmMaxTrade(Number(e.target.value))} disabled={mmRunning}
                          min={0.01} step={0.01} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Del Min (s)</label>
                        <input type="number" value={mmDelayMin} onChange={e => setMmDelayMin(Number(e.target.value))} disabled={mmRunning}
                          min={1} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1">Del Max (s)</label>
                        <input type="number" value={mmDelayMax} onChange={e => setMmDelayMax(Number(e.target.value))} disabled={mmRunning}
                          min={1} className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none disabled:opacity-50" />
                      </div>
                    </div>

                    {/* Bias slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">
                          Bias: <span className={mmBias > 0 ? 'text-green-400' : mmBias < 0 ? 'text-red-400' : 'text-white'}>{mmBias > 0 ? '+' : ''}{mmBias}%</span>
                        </label>
                        <span className="text-[10px] text-[#52525b]">
                          {mmBias > 0 ? 'Accumulate' : mmBias < 0 ? 'Distribute' : 'Neutral'}
                        </span>
                      </div>
                      <input type="range" min={-50} max={50} step={1} value={mmBias} onChange={e => setMmBias(Number(e.target.value))} disabled={mmRunning}
                        className="w-full accent-purple-500" />
                      <div className="flex justify-between text-[10px] text-[#52525b]">
                        <span>-50%</span><span>0%</span><span>+50%</span>
                      </div>
                    </div>

                    {/* Wallet selector */}
                    <div className="bg-[#09090b] rounded-lg border border-[#27272a] overflow-hidden">
                      <button onClick={() => setMmShowWallets(!mmShowWallets)} className="w-full flex items-center justify-between px-3 py-2">
                        <span className="text-xs font-medium text-[#a1a1aa]">
                          Wallets ({mmSelectedIds.size}/{mmFilteredWallets.length}{mmFilteredWallets.length < wallets.length ? ` of ${wallets.length}` : ''})
                        </span>
                        {mmShowWallets ? <ChevronUp className="w-3.5 h-3.5 text-[#52525b]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#52525b]" />}
                      </button>
                      {mmShowWallets && (
                        <div className="px-3 pb-3 space-y-1.5">
                          {/* Balance Filters */}
                          <div className="grid grid-cols-2 gap-2 p-2 bg-[#18181b] rounded-lg border border-[#27272a]">
                            <div>
                              <label className="block text-[10px] text-[#52525b] font-medium mb-0.5">Min SOL</label>
                              <input type="number" value={mmFilterMinSol || ''} onChange={e => setMmFilterMinSol(Number(e.target.value))}
                                placeholder="0" min={0} step={0.01} disabled={mmRunning}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-white text-xs outline-none disabled:opacity-50" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#52525b] font-medium mb-0.5">Max SOL</label>
                              <input type="number" value={mmFilterMaxSol || ''} onChange={e => setMmFilterMaxSol(Number(e.target.value))}
                                placeholder="No limit" min={0} step={0.01} disabled={mmRunning}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-white text-xs outline-none disabled:opacity-50" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-blue-400 font-medium mb-0.5">Min USDC</label>
                              <input type="number" value={mmFilterMinUsdc || ''} onChange={e => setMmFilterMinUsdc(Number(e.target.value))}
                                placeholder="0" min={0} step={0.01} disabled={mmRunning}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-white text-xs outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-blue-400 font-medium mb-0.5">Max USDC</label>
                              <input type="number" value={mmFilterMaxUsdc || ''} onChange={e => setMmFilterMaxUsdc(Number(e.target.value))}
                                placeholder="No limit" min={0} step={0.01} disabled={mmRunning}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-white text-xs outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setMmSelectedIds(new Set(mmFilteredWallets.map(w => w.id)))} disabled={mmRunning}
                              className="text-[10px] text-purple-400 hover:text-purple-300 disabled:opacity-50">Select All ({mmFilteredWallets.length})</button>
                            <span className="text-[#27272a]">|</span>
                            <button onClick={() => setMmSelectedIds(new Set())} disabled={mmRunning}
                              className="text-[10px] text-purple-400 hover:text-purple-300 disabled:opacity-50">Deselect All</button>
                            {mmFilteredWallets.length < wallets.length && (
                              <span className="text-[10px] text-orange-400 ml-auto">{wallets.length - mmFilteredWallets.length} filtered out</span>
                            )}
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {mmFilteredWallets.length === 0 ? (
                              <p className="text-xs text-[#52525b] px-2 py-2">{wallets.length === 0 ? 'No wallets found.' : 'No wallets match filters.'}</p>
                            ) : (
                              mmFilteredWallets.map((w, i) => (
                                <label key={w.id} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${mmSelectedIds.has(w.id) ? 'bg-purple-500/10' : 'hover:bg-[#18181b]'}`}>
                                  <input type="checkbox" checked={mmSelectedIds.has(w.id)} onChange={() => {
                                    setMmSelectedIds(prev => { const n = new Set(prev); if (n.has(w.id)) n.delete(w.id); else n.add(w.id); return n; });
                                  }} disabled={mmRunning} className="accent-purple-500" />
                                  <span className="text-white font-mono truncate">{w.label || `Wallet-${i + 1}`}</span>
                                  <span className="text-[#52525b] ml-auto flex-shrink-0">{w.solBalance.toFixed(3)} SOL</span>
                                  {(w.usdcBalance || 0) > 0 && <span className="text-blue-400 flex-shrink-0">{w.usdcBalance.toFixed(2)} USDC</span>}
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Start/Stop */}
                    {mmRunning ? (
                      <button onClick={mmStop}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/30 transition-colors text-sm">
                        <Square className="w-4 h-4" /> Stop Market Making
                      </button>
                    ) : (
                      <button onClick={mmStart} disabled={!poolAddressInput || !tokenMintInput || mmSelectedIds.size === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm">
                        <Play className="w-4 h-4" /> Start Market Making
                      </button>
                    )}
                  </div>

                  {/* RIGHT — Stats + Log */}
                  <div className="flex flex-col gap-3">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#09090b] rounded-lg p-2.5 text-center border border-[#27272a]">
                        <div className="text-lg font-bold text-white">{mmCycles}</div>
                        <div className="text-[10px] text-[#52525b]">Cycles</div>
                      </div>
                      <div className="bg-[#09090b] rounded-lg p-2.5 text-center border border-[#27272a]">
                        <div className="text-lg font-bold text-white">${mmVolume.toFixed(2)}</div>
                        <div className="text-[10px] text-[#52525b]">Volume</div>
                      </div>
                      <div className="bg-[#09090b] rounded-lg p-2.5 text-center border border-[#27272a]">
                        <div className={`text-lg font-bold ${mmNetTokens > 0 ? 'text-green-400' : mmNetTokens < 0 ? 'text-red-400' : 'text-white'}`}>
                          {mmNetTokens > 0 ? '+' : ''}{mmNetTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-[#52525b]">Net Tokens</div>
                      </div>
                    </div>

                    {/* Activity Log — fixed height, scrollable */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">Activity Log</span>
                        <div className="flex items-center gap-2">
                          {mmRunning && <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />}
                          {mmLog.length > 0 && (
                            <button onClick={() => setMmLog([])} className="text-[10px] text-[#52525b] hover:text-white transition-colors">Clear</button>
                          )}
                        </div>
                      </div>
                      <div className="h-72 overflow-y-auto space-y-0.5 font-mono text-[11px] bg-[#09090b] rounded-lg p-2 border border-[#27272a]">
                        {mmLog.length === 0 ? (
                          <p className="text-[#3f3f46] text-center py-16">No activity yet. Start market making to see logs.</p>
                        ) : (
                          mmLog.map((entry, i) => (
                            <div key={i} className="flex gap-2 py-0.5">
                              <span className="text-[#52525b] flex-shrink-0">{entry.time}</span>
                              <span className={mmLogColor(entry.type)}>{entry.message}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fund Wallets — below Market Making */}
          {creatorKey && (
            <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-purple-400" />
                  Fund Wallets
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#71717a]">Creator:</span>
                  <span className="text-white font-mono">{creatorSolBal.toFixed(4)} SOL</span>
                  <span className="text-green-400 font-mono">{creatorUsdcBal.toFixed(2)} USDC</span>
                </div>
              </div>

              {/* Wallet selection */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-[#71717a]">Target: <span className="text-white font-medium">{fundTargetIds.size}</span> wallet{fundTargetIds.size !== 1 ? 's' : ''}</span>
                  <button onClick={() => setFundTargetIds(new Set(mmSelectedIds))} className="text-[10px] text-purple-400 hover:text-purple-300">Use MM selection</button>
                  <button onClick={() => setFundTargetIds(new Set(wallets.map(w => w.id)))} className="text-[10px] text-purple-400 hover:text-purple-300">All wallets</button>
                  <button onClick={() => setFundTargetIds(new Set())} className="text-[10px] text-[#52525b] hover:text-white">Clear</button>
                  <button onClick={() => setFundShowWallets(!fundShowWallets)} className="text-[10px] text-[#52525b] hover:text-white ml-auto">
                    {fundShowWallets ? 'Hide' : 'Pick'} wallets
                  </button>
                </div>
                {fundShowWallets && (
                  <div className="max-h-40 overflow-y-auto bg-[#09090b] rounded-lg border border-[#27272a] p-2 space-y-0.5">
                    {wallets.map((w, i) => (
                      <label key={w.id} className="flex items-center gap-2 py-0.5 px-1 hover:bg-[#18181b] rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fundTargetIds.has(w.id)}
                          onChange={() => {
                            setFundTargetIds(prev => {
                              const next = new Set(prev);
                              if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
                              return next;
                            });
                          }}
                          className="rounded border-[#27272a] bg-[#09090b] text-purple-500"
                        />
                        <span className="text-xs text-[#a1a1aa] flex-1">{w.label || `Wallet ${i + 1}`}</span>
                        <span className="text-[10px] text-[#52525b] font-mono">{w.solBalance.toFixed(3)} SOL</span>
                        <span className="text-[10px] text-green-400/60 font-mono">{w.usdcBalance.toFixed(2)} USDC</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-[#71717a] font-medium mb-1">Asset</label>
                  <select
                    value={fundAsset}
                    onChange={e => setFundAsset(e.target.value as 'sol' | 'usdc')}
                    className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm outline-none"
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
                    min={0} step={0.1}
                    className="w-24 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm outline-none"
                  />
                </div>
                <button
                  onClick={handleFundWallets}
                  disabled={fundLoading || fundTargetIds.size === 0}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {fundLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Fund {fundTargetIds.size} wallet{fundTargetIds.size !== 1 ? 's' : ''}
                </button>
                <span className="text-xs text-[#52525b] pb-2">
                  Total: {(fundAmount * fundTargetIds.size).toFixed(2)} {fundAsset.toUpperCase()}
                </span>
              </div>

              {/* Auto-Fund */}
              <div className="border-t border-[#27272a] pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setAutoFundOn(!autoFundOn)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${autoFundOn ? 'bg-purple-600' : 'bg-[#27272a]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoFundOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm text-white font-medium">Auto-Fund</span>
                  {autoFundOn && <span className="text-xs text-purple-400 animate-pulse">Active — every 15s</span>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#a1a1aa] font-medium w-10">SOL</span>
                    <span className="text-xs text-[#71717a]">if below</span>
                    <input type="number" value={autoFundSolThreshold} onChange={e => setAutoFundSolThreshold(Number(e.target.value))} min={0} step={0.01}
                      className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none" />
                    <span className="text-xs text-[#71717a]">send</span>
                    <input type="number" value={autoFundSolAmount} onChange={e => setAutoFundSolAmount(Number(e.target.value))} min={0} step={0.01}
                      className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none" />
                    <span className="text-xs text-[#52525b]">per wallet</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#a1a1aa] font-medium w-10">USDC</span>
                    <span className="text-xs text-[#71717a]">if below</span>
                    <input type="number" value={autoFundUsdcThreshold} onChange={e => setAutoFundUsdcThreshold(Number(e.target.value))} min={0} step={0.1}
                      className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none" />
                    <span className="text-xs text-[#71717a]">send</span>
                    <input type="number" value={autoFundUsdcAmount} onChange={e => setAutoFundUsdcAmount(Number(e.target.value))} min={0} step={0.1}
                      className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2 py-1.5 text-white text-sm outline-none" />
                    <span className="text-xs text-[#52525b]">per wallet</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Per-Wallet Quick Trade Cards */}
          {allWallets.length === 0 ? (
            <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-10 text-center space-y-4">
              <Wallet className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
              <p className="text-sm text-[#52525b]">
                No wallets available. Generate wallets or import from CSV.
              </p>
              <button
                onClick={() => csvInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {allWallets.map((wallet, idx) => {
                const busy = isWalletBusy(wallet.id);
                const activeAction = getWalletAction(wallet.id);
                const label = wallet.label || `Wallet-${idx + 1}`;
                const hasTokens = wallet.tokenBalance > 0;

                return (
                  <div
                    key={wallet.id}
                    className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 space-y-3"
                  >
                    {/* Wallet Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{label}</span>
                        <span className="text-xs font-mono text-[#71717a]">
                          {truncateKey(wallet.publicKey)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="font-mono text-white">
                            {wallet.tokenBalance.toLocaleString()}
                          </span>
                          <span className="text-[#52525b] ml-1">tokens</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-[#a1a1aa]">
                            {(wallet.solBalance ?? 0).toFixed(4)}
                          </span>
                          <span className="text-[#52525b] ml-1">SOL</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-blue-400">
                            {(wallet.usdcBalance ?? 0).toFixed(2)}
                          </span>
                          <span className="text-[#52525b] ml-1">USDC</span>
                        </div>
                      </div>
                    </div>

                    {/* Sell Row */}
                    {hasTokens && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                          <span className="text-xs text-orange-400 font-medium uppercase tracking-wider">Sell</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          {quickSellPresets.map((pct) => {
                            const isActive = busy && activeAction === `sell-${pct}`;
                            return (
                              <div key={pct} className="flex flex-col items-center gap-0.5">
                                <button
                                  onClick={() => handleQuickSell(wallet, pct)}
                                  disabled={busy}
                                  className={`w-[56px] py-1.5 rounded-md text-xs font-semibold transition-all border text-center ${
                                    isActive
                                      ? 'bg-orange-500 text-white border-orange-500'
                                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-orange-500/50 hover:text-orange-400 disabled:opacity-40 disabled:cursor-not-allowed'
                                  }`}
                                >
                                  {isActive ? (
                                    <Loader2 className="w-3 h-3 animate-spin inline" />
                                  ) : pricePerToken > 0 ? (
                                    (() => {
                                      const est = wallet.tokenBalance * (pct / 100) * pricePerToken;
                                      if (isSolPaired) return est < 0.01 ? `${est.toFixed(4)} SOL` : `${est.toFixed(3)} SOL`;
                                      return est < 0.01 ? `$${est.toFixed(4)}` : `$${est.toFixed(2)}`;
                                    })()
                                  ) : (
                                    `${pct}%`
                                  )}
                                </button>
                                <span className="text-[10px] text-[#52525b] font-mono">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Custom sell % */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={customQuickSellPct[wallet.id] || ''}
                              onChange={(e) =>
                                setCustomQuickSellPct((prev) => ({
                                  ...prev,
                                  [wallet.id]: e.target.value,
                                }))
                              }
                              placeholder="%"
                              min={0.1}
                              max={100}
                              step={0.1}
                              disabled={busy}
                              className="w-16 bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500 outline-none disabled:opacity-40"
                            />
                            <button
                              onClick={() => {
                                const val = parseFloat(customQuickSellPct[wallet.id] || '');
                                if (!isNaN(val) && val > 0 && val <= 100) {
                                  handleQuickSell(wallet, val);
                                }
                              }}
                              disabled={busy || !customQuickSellPct[wallet.id]}
                              className="px-2 py-1.5 rounded-md text-xs font-semibold bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy && activeAction.startsWith('sell-') && !quickSellPresets.some((p) => activeAction === `sell-${p}`) ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (() => {
                                const val = parseFloat(customQuickSellPct[wallet.id] || '');
                                if (!isNaN(val) && val > 0 && pricePerToken > 0) {
                                  const est = wallet.tokenBalance * (val / 100) * pricePerToken;
                                  if (isSolPaired) return est < 0.01 ? `${est.toFixed(4)} SOL` : `${est.toFixed(3)} SOL`;
                                  return est < 0.01 ? `$${est.toFixed(4)}` : `$${est.toFixed(2)}`;
                                }
                                return 'Go';
                              })()}
                            </button>
                          </div>
                          {/* Custom sell by $ amount */}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[#52525b]">$</span>
                            <input
                              type="number"
                              value={customQuickSellAmt[wallet.id] || ''}
                              onChange={(e) =>
                                setCustomQuickSellAmt((prev) => ({
                                  ...prev,
                                  [wallet.id]: e.target.value,
                                }))
                              }
                              placeholder="amount"
                              min={0.01}
                              step={0.01}
                              disabled={busy || pricePerToken <= 0}
                              className="w-20 bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500 outline-none disabled:opacity-40"
                            />
                            <button
                              onClick={() => {
                                const amt = parseFloat(customQuickSellAmt[wallet.id] || '');
                                if (!isNaN(amt) && amt > 0 && pricePerToken > 0) {
                                  const totalValue = wallet.tokenBalance * pricePerToken;
                                  const pctToSell = Math.min(100, (amt / totalValue) * 100);
                                  handleQuickSell(wallet, pctToSell);
                                }
                              }}
                              disabled={busy || !customQuickSellAmt[wallet.id] || pricePerToken <= 0}
                              className="px-2 py-1.5 rounded-md text-xs font-semibold bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy && activeAction.startsWith('sell-') ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Sell'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Buy Row */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs text-green-400 font-medium uppercase tracking-wider">Buy</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {quickBuyPresets.map((amount) => {
                          const isActive = busy && activeAction === `buy-${amount}`;
                          return (
                            <button
                              key={amount}
                              onClick={() => handleQuickBuy(wallet, amount)}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                                isActive
                                  ? 'bg-green-500 text-white border-green-500'
                                  : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-green-500/50 hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed'
                              }`}
                            >
                              {isActive ? (
                                <Loader2 className="w-3 h-3 animate-spin inline" />
                              ) : isSolPaired ? (
                                `${amount} SOL`
                              ) : (
                                `$${amount}`
                              )}
                            </button>
                          );
                        })}
                        {/* Custom buy amount */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={customBuyAmount[wallet.id] || ''}
                            onChange={(e) =>
                              setCustomBuyAmount((prev) => ({
                                ...prev,
                                [wallet.id]: e.target.value,
                              }))
                            }
                            placeholder={isSolPaired ? 'SOL' : '$'}
                            min={0.001}
                            step={0.1}
                            disabled={busy}
                            className="w-20 bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-green-500/50 focus:border-green-500 outline-none disabled:opacity-40"
                          />
                          <button
                            onClick={() => {
                              const val = parseFloat(customBuyAmount[wallet.id] || '');
                              if (!isNaN(val) && val > 0) {
                                handleQuickBuy(wallet, val);
                              }
                            }}
                            disabled={busy || !customBuyAmount[wallet.id]}
                            className="px-2 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {busy && activeAction.startsWith('buy-') && !quickBuyPresets.some((p) => activeAction === `buy-${p}`) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Go'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </>
      ) : (
        <>
          {/* ===== BATCH MODE (Original) ===== */}
          {/* Wallet Selector */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#a1a1aa]" />
                Select Wallets
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#71717a]">
                  {selectedIds.size} of {walletsWithTokens.length} selected
                </span>
                {walletsWithTokens.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
                  >
                    {selectedIds.size === walletsWithTokens.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                )}
              </div>
            </div>

            {wallets.length === 0 ? (
              <div className="text-center py-10">
                <Wallet className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
                <p className="text-sm text-[#52525b]">
                  No wallets available. Generate wallets in the Wallet Manager
                  first.
                </p>
              </div>
            ) : walletsWithTokens.length === 0 ? (
              <div className="text-center py-10">
                <TrendingDown className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
                <p className="text-sm text-[#52525b]">
                  No wallets have token balances. Distribute tokens first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {walletsWithTokens.map((wallet, idx) => (
                  <label
                    key={wallet.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                      selectedIds.has(wallet.id)
                        ? 'bg-purple-500/5 border-purple-500/30'
                        : 'bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(wallet.id)}
                        onChange={() => toggleSelect(wallet.id)}
                        className="sr-only peer"
                      />
                      <div className="w-4 h-4 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all flex items-center justify-center">
                        {selectedIds.has(wallet.id) && (
                          <Check className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {wallet.label || `Wallet-${idx + 1}`}
                        </span>
                        <span className="text-xs font-mono text-[#71717a]">
                          {truncateKey(wallet.publicKey)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-4">
                      <div>
                        <p className="text-sm font-mono text-white">
                          {wallet.tokenBalance.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-[#52525b]">tokens</p>
                      </div>
                      <div>
                        <p className="text-sm font-mono text-[#a1a1aa]">
                          {(wallet.solBalance ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}
                        </p>
                        <p className="text-[10px] text-[#52525b]">SOL</p>
                      </div>
                      <div>
                        <p className="text-sm font-mono text-blue-400">
                          {(wallet.usdcBalance ?? 0).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-[#52525b]">USDC</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sell Percentage */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Percent className="w-5 h-5 text-[#a1a1aa]" />
              Sell Percentage
            </h3>

            {/* Preset Buttons */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {presetPercentages.map((pct) => (
                <button
                  key={pct}
                  onClick={() => handlePresetClick(pct)}
                  className={`py-3 rounded-lg text-sm font-semibold transition-all border ${
                    percentage === pct && customPercentage === ''
                      ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-orange-500/50 hover:text-orange-400'
                  }`}
                >
                  <span>{pct}%</span>
                  {pricePerToken > 0 && selectedWallets.length > 0 && (
                    <span className="block text-[10px] font-normal text-[#71717a] mt-0.5">
                      ~{(selectedWallets.reduce((s, w) => s + w.tokenBalance, 0) * (pct / 100) * pricePerToken).toFixed(
                        priceQuoteSymbol === 'USDC' ? 2 : 4
                      )} {priceQuoteSymbol}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                  Custom Percentage
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={customPercentage}
                    onChange={(e) => handleCustomPercentage(e.target.value)}
                    placeholder="Enter custom %..."
                    min={0.1}
                    max={100}
                    step={0.1}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#52525b] text-sm">
                    %
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                  Slippage Tolerance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) =>
                      setSlippage(
                        Math.max(
                          0.01,
                          Math.min(50, parseFloat(e.target.value) || 0.01)
                        )
                      )
                    }
                    min={0.01}
                    max={50}
                    step={0.1}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#52525b] text-sm">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Summary + Quote Preview */}
            {selectedWallets.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-orange-400">
                        Sell Summary
                      </span>
                    </div>
                    {quoteLoading && (
                      <div className="flex items-center gap-1.5 text-xs text-orange-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Fetching quote...
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-white">
                    Selling{' '}
                    <span className="font-bold text-orange-400">{percentage}%</span>{' '}
                    from{' '}
                    <span className="font-bold">{selectedWallets.length}</span>{' '}
                    wallet{selectedWallets.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-[#71717a] mt-1">
                    Estimated total:{' '}
                    <span className="text-white font-mono">
                      {totalTokensToSell.toLocaleString()}
                    </span>{' '}
                    tokens with {slippage}% slippage tolerance
                  </p>

                  {/* Quote Results */}
                  {quotePreview.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-orange-500/20 space-y-2">
                      <p className="text-xs text-[#71717a] uppercase tracking-wider font-medium">
                        Estimated Output
                      </p>
                      {quotePreview.map((q) => (
                        <div key={q.walletId} className="flex items-center justify-between text-sm">
                          <span className="text-[#a1a1aa] font-mono text-xs">
                            {q.walletPublicKey.slice(0, 6)}...{q.walletPublicKey.slice(-4)}
                          </span>
                          <div className="text-right">
                            {q.error && q.maxSellable !== null && q.maxSellable > 0 ? (
                              <div>
                                <span className="text-yellow-400 font-mono">
                                  ~{q.estimatedQuote.toFixed(6)} {q.quoteSymbol}
                                </span>
                                <p className="text-[10px] text-yellow-400/70">
                                  max: {q.maxSellable.toLocaleString()} tokens (pool limit)
                                </p>
                              </div>
                            ) : q.error ? (
                              <span className="text-red-400 text-xs">{q.error}</span>
                            ) : (
                              <span className="text-green-400 font-mono">
                                ~{q.estimatedQuote.toFixed(6)} {q.quoteSymbol}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {(() => {
                        const totalQuote = quotePreview.reduce((s, q) => s + q.estimatedQuote, 0);
                        const sym = quotePreview[0]?.quoteSymbol || 'SOL';
                        const hasLimits = quotePreview.some(q => q.maxSellable !== null && q.maxSellable > 0);
                        return totalQuote > 0 ? (
                          <div className="pt-2 border-t border-orange-500/20 flex items-center justify-between">
                            <span className="text-xs font-medium text-[#a1a1aa]">Total estimated</span>
                            <span className={`font-mono font-bold ${hasLimits ? 'text-yellow-400' : 'text-green-400'}`}>
                              ~{totalQuote.toFixed(6)} {sym}
                            </span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400/50 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Execute Button */}
          <button
            onClick={handleExecuteSell}
            disabled={
              loading ||
              selectedWallets.length === 0 ||
              !poolAddressInput ||
              !tokenMintInput
            }
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Executing Sells...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Execute Sell ({percentage}% from {selectedWallets.length} wallet
                {selectedWallets.length !== 1 ? 's' : ''})
              </>
            )}
          </button>

          {/* Results Table */}
          {results.length > 0 && (
            <div className="bg-[#18181b] rounded-xl border border-[#27272a] overflow-hidden animate-fade-in">
              <div className="px-6 py-4 border-b border-[#27272a]">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-orange-400" />
                  Sell Results
                </h3>
                <p className="text-xs text-[#71717a] mt-1">
                  {results.filter((r) => r.status === 'success').length} successful,{' '}
                  {results.filter((r) => r.status === 'error').length} failed
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#27272a]">
                      <th className="px-4 py-3 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                        Wallet
                      </th>
                      <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                        Amount Sold
                      </th>
                      <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                        Quote Received
                      </th>
                      <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                        Signature / Error
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-[#27272a] hover:bg-[#1c1c1f] transition-colors"
                      >
                        <td className="px-4 py-3">
                          {result.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-sm text-white">
                              {result.walletLabel}
                            </span>
                            <span className="text-xs font-mono text-[#71717a] ml-2">
                              {truncateKey(result.walletPublicKey)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-mono text-white">
                            {result.amountSold.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {result.quoteReceived != null ? (
                            <span className="text-sm font-mono text-green-400">
                              {result.quoteReceived.toLocaleString(undefined, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 6,
                              })}{' '}
                              <span className="text-[#71717a] text-xs">
                                {result.quoteSymbol || 'SOL'}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-[#52525b]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {result.signature ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-xs font-mono text-[#a1a1aa]">
                                {truncateKey(result.signature)}
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    result.signature!,
                                    `sig-${idx}`
                                  )
                                }
                                className="text-[#52525b] hover:text-white transition-colors"
                              >
                                {copiedField === `sig-${idx}` ? (
                                  <Check className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <a
                                href={`https://explorer.solana.com/tx/${result.signature}${clusterParam}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#52525b] hover:text-purple-400 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          ) : result.error ? (
                            <span className="text-xs text-red-400 max-w-48 truncate inline-block">
                              {result.error}
                            </span>
                          ) : (
                            <span className="text-xs text-[#52525b]">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Summary */}
              <div className="px-6 py-4 border-t border-[#27272a] bg-[#09090b]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#a1a1aa]">
                    Totals
                  </span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-[#71717a] uppercase tracking-wider">
                        Tokens Sold
                      </p>
                      <p className="text-sm font-mono text-white font-semibold">
                        {totalSold.toLocaleString()}
                      </p>
                    </div>
                    {totalQuoteReceived > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-[#71717a] uppercase tracking-wider">
                          Quote Received
                        </p>
                        <p className="text-sm font-mono text-green-400 font-semibold">
                          {totalQuoteReceived.toLocaleString(undefined, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 6,
                          })}{' '}
                          <span className="text-[#71717a] text-xs">
                            {quoteSymbol}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Schedule Section (Future Feature) */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] border-dashed p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-[#27272a] flex items-center justify-center">
            <Clock className="w-5 h-5 text-[#52525b]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#52525b]">
              Scheduled Sells
            </h3>
            <p className="text-xs text-[#3f3f46]">Coming soon</p>
          </div>
        </div>
        <p className="text-sm text-[#3f3f46]">
          Schedule recurring sell operations with customizable intervals,
          time-based triggers, and conditional execution based on price targets.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {['Time-based Triggers', 'Price Conditions', 'Recurring Sells'].map(
            (feature) => (
              <div
                key={feature}
                className="bg-[#09090b] rounded-lg p-3 border border-[#27272a]"
              >
                <p className="text-xs text-[#52525b] font-medium">{feature}</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
