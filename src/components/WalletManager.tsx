'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  Send,
  DollarSign,
  ArrowDownToLine,
  Percent,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Coins,
  X,
  Recycle,
  ExternalLink,
  Shield,
  Zap,
} from 'lucide-react';
import type { WalletEntry, TransactionLog } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import StealthFundModal from './StealthFundModal';

interface WalletManagerProps {
  network: 'devnet' | 'mainnet-beta';
  wallets: WalletEntry[];
  onWalletsChange: (wallets: WalletEntry[]) => void;
  tokenMint: string;
  tokenDecimals: number;
  onAddLog: (log: TransactionLog) => void;
  creatorKey?: string;
}

function truncateKey(key: string): string {
  if (!key || key.length < 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function WalletManager({
  network,
  wallets,
  onWalletsChange,
  tokenMint,
  tokenDecimals,
  onAddLog,
  creatorKey = '',
}: WalletManagerProps) {
  // State management
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generateCount, setGenerateCount] = useState(10);
  const [funderPrivateKey, setFunderPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !funderPrivateKey) setFunderPrivateKey(creatorKey); }, [creatorKey]);
  const [showFunderKey, setShowFunderKey] = useState(false);
  const [tokenMintInput, setTokenMintInput] = useState(tokenMint || '');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [mintRangeMin, setMintRangeMin] = useState('');
  const [mintRangeMax, setMintRangeMax] = useState('');
  const [mintAmounts, setMintAmounts] = useState<Record<string, string>>({});
  const [mintTotalCap, setMintTotalCap] = useState('');
  const [fundAtaAmount, setFundAtaAmount] = useState('0.02');
  const [usdcAmounts, setUsdcAmounts] = useState<Record<string, string>>({});
  const [warmupRunning, setWarmupRunning] = useState(false);
  const [warmupTradesPerWallet, setWarmupTradesPerWallet] = useState('4');
  const [warmupBuyMin, setWarmupBuyMin] = useState('0.001');
  const [warmupBuyMax, setWarmupBuyMax] = useState('0.003');
  const [warmupProgress, setWarmupProgress] = useState('');
  const [usdcRangeMin, setUsdcRangeMin] = useState('');
  const [usdcRangeMax, setUsdcRangeMax] = useState('');
  const [usdcFixedAmount, setUsdcFixedAmount] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showStealthFund, setShowStealthFund] = useState(false);
  const [sendAmounts, setSendAmounts] = useState<Record<string, string>>({});
  const [sendDestMode, setSendDestMode] = useState<'custom' | 'table'>('custom');
  const [sendCustomDest, setSendCustomDest] = useState('');
  const [sendTableDest, setSendTableDest] = useState('');
  const [manualPubKey, setManualPubKey] = useState('');
  const [manualPrivKey, setManualPrivKey] = useState('');
  const [sendSelectedIds, setSendSelectedIds] = useState<Set<string>>(new Set());
  const [sendAssetType, setSendAssetType] = useState<'token' | 'sol' | 'usdc'>('token');
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; results: Array<{ walletId: string; status: 'success' | 'error'; message: string }> } | null>(null);
  const [sellPercentage, setSellPercentage] = useState<number | null>(null);
  const [showSellPicker, setShowSellPicker] = useState(false);
  const [expandedActions, setExpandedActions] = useState(true);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeMintAuth, setRevokeMintAuth] = useState(true);
  const [revokeUpdateAuth, setRevokeUpdateAuth] = useState(false);
  const [creatorWallet, setCreatorWallet] = useState<WalletEntry | null>(null);
  const [showConsolidate, setShowConsolidate] = useState(false);
  const [consolidateAsset, setConsolidateAsset] = useState<'sol' | 'token' | 'usdc'>('sol');
  const [consolidateDest, setConsolidateDest] = useState('');
  const [consolidateDestMode, setConsolidateDestMode] = useState<'custom' | 'table'>('custom');
  const [consolidateTableDest, setConsolidateTableDest] = useState('');
  const [consolidatePct, setConsolidatePct] = useState(100);
  const [consolidateProgress, setConsolidateProgress] = useState<{ current: number; total: number; confirmed: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const creatorWalletRef = useRef(creatorWallet);
  creatorWalletRef.current = creatorWallet;
  const refreshingRef = useRef(false);

  // Derive creator wallet from creatorKey
  useEffect(() => {
    if (!creatorKey || creatorKey.length < 30) {
      setCreatorWallet(null);
      return;
    }
    (async () => {
      try {
        const bs58Mod = (await import('bs58')).default;
        const { Keypair } = await import('@solana/web3.js');
        const kp = Keypair.fromSecretKey(bs58Mod.decode(creatorKey));
        setCreatorWallet(prev => {
          if (prev && prev.publicKey === kp.publicKey.toBase58()) return prev;
          return {
            id: '__creator__',
            publicKey: kp.publicKey.toBase58(),
            privateKey: creatorKey,
            solBalance: 0,
            tokenBalance: 0,
            usdcBalance: 0,
            label: 'Creator',
            createdAt: new Date().toISOString(),
          };
        });
      } catch {
        setCreatorWallet(null);
      }
    })();
  }, [creatorKey]);

  // Auto-refresh balances every 5 seconds
  useEffect(() => {
    if (!creatorWallet) return;
    const doRefresh = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const currentWallets = walletsRef.current;
        const cw = creatorWalletRef.current;
        const walletsToRefresh = [...currentWallets];
        if (cw) walletsToRefresh.unshift(cw);
        if (walletsToRefresh.length === 0) return;
        const res = await fetch('/api/wallets/balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: walletsToRefresh, tokenMint: tokenMintInput || undefined, network }),
        });
        const data = await res.json();
        if (!data.success) return;
        const updated: WalletEntry[] = data.data;
        const creatorUpdated = updated.find(w => w.id === '__creator__');
        if (creatorUpdated && creatorWalletRef.current) {
          setCreatorWallet(prev => prev ? { ...prev, solBalance: creatorUpdated.solBalance, tokenBalance: creatorUpdated.tokenBalance, usdcBalance: creatorUpdated.usdcBalance } : prev);
        }
        onWalletsChange(updated.filter(w => w.id !== '__creator__'));
      } catch {} finally {
        refreshingRef.current = false;
      }
    };
    doRefresh();
    const interval = setInterval(doRefresh, 5000);
    return () => clearInterval(interval);
  }, [creatorWallet?.publicKey]);

  const setLoadingFor = (key: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const createLog = (
    type: TransactionLog['type'],
    status: TransactionLog['status'],
    message: string,
    signature: string = 'N/A'
  ): TransactionLog => ({
    id: uuidv4(),
    type,
    signature,
    status,
    message,
    timestamp: new Date().toISOString(),
  });

  // Select/deselect
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === wallets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(wallets.map((w) => w.id)));
    }
  };

  const selectedWallets = wallets.filter((w) => selectedIds.has(w.id));

  // Generate wallets
  const handleGenerate = async () => {
    if (generateCount < 1) return;
    setError(null);
    setLoadingFor('generate', true);

    try {
      const res = await fetch('/api/wallets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: generateCount }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const newWallets: WalletEntry[] = data.data;
      onWalletsChange([...wallets, ...newWallets]);
      onAddLog(
        createLog(
          'fund',
          'success',
          `Generated ${newWallets.length} new wallets`
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFor('generate', false);
    }
  };

  // Import CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
          setError(
            'No valid wallets found in CSV. Expected format: publicKey,privateKey,label'
          );
          return;
        }

        onWalletsChange([...wallets, ...imported]);
        onAddLog(
          createLog(
            'fund',
            'success',
            `Imported ${imported.length} wallets from CSV`
          )
        );
      } catch (err) {
        setError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Export CSV
  const handleExportCSV = () => {
    const walletsToExport = selectedWallets.length > 0 ? selectedWallets : wallets;
    const header = 'publicKey,privateKey,label,solBalance,tokenBalance,usdcBalance\n';
    const rows = walletsToExport
      .map(
        (w) =>
          `${w.publicKey},${w.privateKey},${w.label || ''},${w.solBalance},${w.tokenBalance},${w.usdcBalance}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets-${network}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export for external service (address,percentage,exchangerId)
  const handleExportExternal = () => {
    const walletsToExport = selectedWallets.length > 0 ? selectedWallets : wallets;
    if (walletsToExport.length === 0) return;
    const pct = (100 / walletsToExport.length).toFixed(2);
    const header = 'address,percentage,exchangerId\n';
    const rows = walletsToExport
      .map((w) => `${w.publicKey},${pct},`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets-external-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Refresh balances (all wallets + creator)
  const handleRefreshBalances = async () => {
    const walletsToRefresh = [...walletsRef.current];
    if (creatorWalletRef.current) walletsToRefresh.unshift(creatorWalletRef.current);
    if (walletsToRefresh.length === 0) return;
    setError(null);
    setLoadingFor('refresh', true);

    try {
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallets: walletsToRefresh,
          tokenMint: tokenMintInput || undefined,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const updated: WalletEntry[] = data.data;
      // Separate creator wallet from the rest
      const creatorUpdated = updated.find((w) => w.id === '__creator__');
      if (creatorUpdated && creatorWallet) {
        setCreatorWallet({ ...creatorWallet, solBalance: creatorUpdated.solBalance, tokenBalance: creatorUpdated.tokenBalance, usdcBalance: creatorUpdated.usdcBalance });
      }
      onWalletsChange(updated.filter((w) => w.id !== '__creator__'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFor('refresh', false);
    }
  };

  // Refresh a single wallet's balances
  const handleRefreshSingle = async (wallet: WalletEntry) => {
    setLoadingFor(`refresh-${wallet.id}`, true);
    try {
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallets: [wallet],
          tokenMint: tokenMintInput || undefined,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const updated: WalletEntry = data.data[0];
      if (wallet.id === '__creator__' && creatorWallet) {
        setCreatorWallet({ ...creatorWallet, solBalance: updated.solBalance, tokenBalance: updated.tokenBalance, usdcBalance: updated.usdcBalance });
      } else {
        onWalletsChange(wallets.map((w) => w.id === wallet.id ? { ...w, solBalance: updated.solBalance, tokenBalance: updated.tokenBalance, usdcBalance: updated.usdcBalance } : w));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFor(`refresh-${wallet.id}`, false);
    }
  };

  // Fund ATA
  const handleFundATA = async () => {
    if (selectedWallets.length === 0 || !funderPrivateKey) {
      setError('Select wallets and provide a funder private key');
      return;
    }
    setError(null);
    setLoadingFor('fundAta', true);

    try {
      const res = await fetch('/api/wallets/fund-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: funderPrivateKey,
          wallets: selectedWallets,
          amountPerWallet: parseFloat(fundAtaAmount) || 0.02,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      onAddLog(
        createLog(
          'fund',
          'success',
          `Funded ATA for ${selectedWallets.length} wallets (${fundAtaAmount} SOL each)`,
          Array.isArray(data.data) ? data.data[0] : 'N/A'
        )
      );

      // Refresh balances after funding
      await handleRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('fund', 'error', `Fund ATA failed: ${msg}`));
    } finally {
      setLoadingFor('fundAta', false);
    }
  };

  // Compute total mint preview
  const mintTotal = selectedWallets.reduce((acc, w) => {
    return acc + (parseFloat(mintAmounts[w.id] || '0') || 0);
  }, 0);

  // Set same amount for all selected wallets
  const handleSetAllMintAmount = () => {
    if (!distributeAmount) return;
    const newAmounts: Record<string, string> = { ...mintAmounts };
    for (const w of selectedWallets) {
      newAmounts[w.id] = distributeAmount;
    }
    setMintAmounts(newAmounts);
  };

  // Randomize mint amounts within a min-max range
  const handleRandomizeRange = () => {
    const min = parseFloat(mintRangeMin);
    const max = parseFloat(mintRangeMax);
    if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min > max) return;
    const newAmounts: Record<string, string> = { ...mintAmounts };
    for (const w of selectedWallets) {
      const rand = min + Math.random() * (max - min);
      // Round to whole number for cleaner amounts
      newAmounts[w.id] = Math.round(rand).toString();
    }
    setMintAmounts(newAmounts);
  };

  // Adjust all selected wallet amounts proportionally to match a total cap
  const handleAdjustToTotal = () => {
    const cap = parseFloat(mintTotalCap);
    if (isNaN(cap) || cap <= 0 || selectedWallets.length === 0) return;

    const currentTotal = selectedWallets.reduce(
      (acc, w) => acc + (parseFloat(mintAmounts[w.id] || '0') || 0),
      0
    );

    if (currentTotal <= 0) {
      // No amounts set yet — distribute evenly
      const perWallet = Math.floor(cap / selectedWallets.length);
      const newAmounts: Record<string, string> = { ...mintAmounts };
      for (const w of selectedWallets) {
        newAmounts[w.id] = perWallet.toString();
      }
      setMintAmounts(newAmounts);
      return;
    }

    // Scale proportionally
    const ratio = cap / currentTotal;
    const newAmounts: Record<string, string> = { ...mintAmounts };
    for (const w of selectedWallets) {
      const current = parseFloat(mintAmounts[w.id] || '0') || 0;
      newAmounts[w.id] = Math.round(current * ratio).toString();
    }
    setMintAmounts(newAmounts);
  };

  // Mint tokens directly to selected wallets (SCMR pattern)
  const handleMintToWallets = async () => {
    if (selectedWallets.length === 0 || !funderPrivateKey || !tokenMintInput) {
      setError('Select wallets, enter token mint, and mint authority key');
      return;
    }

    // Build per-wallet amounts
    const perWalletAmounts: Record<string, number> = {};
    let hasAmount = false;
    for (const w of selectedWallets) {
      const amt = parseFloat(mintAmounts[w.id] || '0');
      if (amt > 0) {
        perWalletAmounts[w.id] = amt;
        hasAmount = true;
      }
    }

    if (!hasAmount) {
      setError('Set a mint amount for at least one wallet');
      return;
    }

    setError(null);
    setLoadingFor('distribute', true);

    try {
      const res = await fetch('/api/wallets/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: funderPrivateKey,
          tokenMint: tokenMintInput,
          wallets: selectedWallets,
          perWalletAmounts,
          mode: 'mint',
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const sigs = data.data?.signatures || [];
      onAddLog(
        createLog(
          'mint',
          'success',
          `Minted ${mintTotal.toLocaleString()} tokens total to ${selectedWallets.length} wallets`,
          sigs[0] || 'N/A'
        )
      );

      await handleRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('mint', 'error', `Mint to wallets failed: ${msg}`));
    } finally {
      setLoadingFor('distribute', false);
    }
  };

  // Warmup: trade random pump.fun tokens
  const handleWarmup = async () => {
    if (selectedWallets.length === 0) {
      setError('Select wallets to warm up');
      return;
    }
    setError(null);
    setWarmupRunning(true);
    setWarmupProgress(`Starting warmup for ${selectedWallets.length} wallets...`);
    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallets: selectedWallets,
          network,
          tradesPerWallet: parseInt(warmupTradesPerWallet) || 4,
          buyAmountMinSol: parseFloat(warmupBuyMin) || 0.001,
          buyAmountMaxSol: parseFloat(warmupBuyMax) || 0.003,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const s = data.data.summary;
      const msg = `Warmup done: ${s.successBuys} buys, ${s.successSells} sells, ${s.failures} failures across ${s.wallets} wallets`;
      setWarmupProgress(msg);
      onAddLog(createLog('warmup', 'success', msg));
      await handleRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setWarmupProgress(`Failed: ${msg}`);
      onAddLog(createLog('warmup', 'error', `Warmup failed: ${msg}`));
    } finally {
      setWarmupRunning(false);
    }
  };

  // USDC distribute helpers
  const usdcTotal = selectedWallets.reduce((acc, w) => acc + (parseFloat(usdcAmounts[w.id] || '0') || 0), 0);

  const handleSetAllUsdcAmount = () => {
    if (!usdcFixedAmount) return;
    const newAmounts: Record<string, string> = { ...usdcAmounts };
    for (const w of selectedWallets) newAmounts[w.id] = usdcFixedAmount;
    setUsdcAmounts(newAmounts);
  };

  const handleRandomizeUsdcRange = () => {
    const min = parseFloat(usdcRangeMin);
    const max = parseFloat(usdcRangeMax);
    if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min > max) return;
    const newAmounts: Record<string, string> = { ...usdcAmounts };
    for (const w of selectedWallets) {
      const rand = min + Math.random() * (max - min);
      newAmounts[w.id] = (Math.round(rand * 100) / 100).toString();
    }
    setUsdcAmounts(newAmounts);
  };

  const handleDistributeUsdc = async () => {
    if (selectedWallets.length === 0 || !funderPrivateKey) {
      setError('Select wallets and enter funder private key');
      return;
    }
    const perWalletAmounts: Record<string, number> = {};
    let hasAmount = false;
    for (const w of selectedWallets) {
      const amt = parseFloat(usdcAmounts[w.id] || '0');
      if (amt > 0) { perWalletAmounts[w.id] = amt; hasAmount = true; }
    }
    if (!hasAmount) { setError('Set a USDC amount for at least one wallet'); return; }

    setError(null);
    setLoadingFor('distributeUsdc', true);
    try {
      const USDC_MINT = network === 'mainnet-beta'
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

      // Only send wallets that have a USDC amount > 0
      const walletsToSend = selectedWallets.filter(w => (perWalletAmounts[w.id] || 0) > 0);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5min timeout

      const res = await fetch('/api/wallets/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          privateKey: funderPrivateKey,
          tokenMint: USDC_MINT,
          wallets: walletsToSend,
          perWalletAmounts,
          mode: 'transfer',
          network,
        }),
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const errCount = data.data?.errors?.length || 0;
      const successCount = data.data?.count || 0;
      const msg = errCount > 0
        ? `USDC: ${successCount} sent, ${errCount} failed`
        : `Distributed ${usdcTotal.toFixed(2)} USDC to ${successCount} wallets`;
      onAddLog(createLog('transfer', errCount > 0 ? 'warning' : 'success', msg, data.data?.signatures?.[0] || 'N/A'));
      await handleRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('transfer', 'error', `USDC distribute failed: ${msg}`));
    } finally {
      setLoadingFor('distributeUsdc', false);
    }
  };

  // Revoke authorities
  const handleRevokeAuthorities = async () => {
    if (!funderPrivateKey || !tokenMintInput) {
      setError('Enter token mint and authority private key');
      return;
    }
    if (!revokeMintAuth && !revokeUpdateAuth) {
      setError('Select at least one authority to revoke');
      return;
    }
    setError(null);
    setLoadingFor('revoke', true);

    try {
      const res = await fetch('/api/revoke-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: funderPrivateKey,
          tokenMint: tokenMintInput,
          revokeMint: revokeMintAuth,
          revokeUpdate: revokeUpdateAuth,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const revokedList = [
        revokeMintAuth && 'Mint',
        revokeUpdateAuth && 'Update',
      ].filter(Boolean).join(' + ');

      onAddLog(
        createLog(
          'mint',
          'success',
          `Revoked ${revokedList} authority on token`,
          data.data?.signature || 'N/A'
        )
      );

      setShowRevokeModal(false);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('mint', 'error', `Revoke failed: ${msg}`));
    } finally {
      setLoadingFor('revoke', false);
    }
  };

  // Sell tokens from selected wallets
  const handleSell = async (pct: number) => {
    if (selectedWallets.length === 0 || !tokenMintInput) {
      setError('Select wallets and provide a token mint address');
      return;
    }
    setError(null);
    setShowSellPicker(false);
    setLoadingFor('sell', true);

    try {
      const res = await fetch('/api/wallets/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: '', // Will be filled in SellStrategy module
          tokenMint: tokenMintInput,
          wallets: selectedWallets,
          percentage: pct,
          slippage: 100, // 1%
          decimals: tokenDecimals,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      onAddLog(
        createLog(
          'sell',
          'success',
          `Sold ${pct}% tokens from ${selectedWallets.length} wallets`
        )
      );

      await handleRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('sell', 'error', `Sell failed: ${msg}`));
    } finally {
      setLoadingFor('sell', false);
    }
  };

  // Combine creator wallet + regular wallets for the send modal
  const allSendWallets: WalletEntry[] = [
    ...(creatorWallet ? [creatorWallet] : []),
    ...wallets,
  ];

  // Helper: get the balance for a wallet based on current sendAssetType
  const getBalanceForAsset = (w: WalletEntry) => {
    if (sendAssetType === 'sol') return w.solBalance;
    if (sendAssetType === 'usdc') return w.usdcBalance || 0;
    return w.tokenBalance;
  };

  const assetLabel = sendAssetType === 'sol' ? 'SOL' : sendAssetType === 'usdc' ? 'USDC' : 'tokens';

  // Set 100% for all selected wallets
  const handleSetAll100 = () => {
    const newAmounts: Record<string, string> = { ...sendAmounts };
    const minUseful: Record<string, number> = { sol: 0.00001, usdc: 0.001, token: 0.001 };
    const min = minUseful[sendAssetType] ?? 0.001;
    for (const id of sendSelectedIds) {
      const w = allSendWallets.find((wl) => wl.id === id);
      if (w) {
        const bal = getBalanceForAsset(w);
        newAmounts[id] = bal >= min ? String(bal) : '0';
      }
    }
    setSendAmounts(newAmounts);
  };

  // Send tokens from multiple wallets to one destination
  const handleSendTokens = async () => {
    if (sendSelectedIds.size === 0) {
      setError('Select at least one source wallet');
      return;
    }
    if (sendAssetType === 'token' && !tokenMintInput) {
      setError('Provide a token mint address for token transfers');
      return;
    }

    // Resolve destination
    let toPublicKey = '';
    if (sendDestMode === 'custom') {
      if (!sendCustomDest.trim()) {
        setError('Enter a destination address');
        return;
      }
      toPublicKey = sendCustomDest.trim();
    } else {
      if (!sendTableDest) {
        setError('Select a destination wallet from the table');
        return;
      }
      const destWallet = allSendWallets.find((w) => w.id === sendTableDest);
      if (!destWallet) {
        setError('Destination wallet not found');
        return;
      }
      toPublicKey = destWallet.publicKey;
    }

    // Filter selected wallets to only those with a meaningful amount
    // For SOL: skip wallets with < 0.00001 SOL (10,000 lamports — not enough to cover fees)
    const MIN_SEND_AMOUNT: Record<string, number> = { sol: 0.00001, usdc: 0.001, token: 0.001 };
    const minAmt = MIN_SEND_AMOUNT[sendAssetType] ?? 0.001;
    const walletsToSend = allSendWallets
      .filter((w) => sendSelectedIds.has(w.id))
      .filter((w) => {
        const amt = parseFloat(sendAmounts[w.id] || '0');
        return amt >= minAmt;
      });

    if (walletsToSend.length === 0) {
      setError('No wallets have a positive amount to send');
      return;
    }

    setError(null);
    setLoadingFor('send', true);
    setSendProgress({ current: 0, total: walletsToSend.length, results: [] });

    const results: Array<{ walletId: string; status: 'success' | 'error'; message: string }> = [];

    // Build batch items for parallel send
    const batchItems = walletsToSend.map(w => ({
      walletId: w.id,
      fromPrivateKey: w.privateKey,
      toPublicKey,
      amount: parseFloat(sendAmounts[w.id] || '0'),
      tokenMint: tokenMintInput || undefined,
      decimals: tokenDecimals,
      assetType: sendAssetType,
    }));

    setSendProgress({ current: 0, total: walletsToSend.length, results: [] });

    try {
      const res = await fetch('/api/wallets/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchItems, network }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Batch send failed');
        setLoadingFor('send', false);
        return;
      }

      for (const r of data.data.results) {
        const w = walletsToSend.find(w => w.id === r.walletId);
        const amount = parseFloat(sendAmounts[r.walletId] || '0');
        if (r.status === 'confirmed') {
          results.push({ walletId: r.walletId, status: 'success', message: `Sent ${amount} ${assetLabel}` });
          onAddLog(
            createLog(
              'transfer',
              'success',
              `Sent ${amount} ${assetLabel} from ${truncateKey(w?.publicKey || '')} to ${truncateKey(toPublicKey)}`,
              r.signature || ''
            )
          );
        } else {
          const msg = r.error || r.status;
          results.push({ walletId: r.walletId, status: 'error', message: msg });
          onAddLog(createLog('transfer', 'error', `Send from ${truncateKey(w?.publicKey || '')} failed: ${msg}`));
        }
      }

      const summary = data.data.summary;
      console.log(`Batch send: ${summary.confirmed} confirmed, ${summary.failed} failed, ${summary.timeout} timeout`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      for (const w of walletsToSend) {
        results.push({ walletId: w.id, status: 'error', message: msg });
      }
    }

    setSendProgress({ current: walletsToSend.length, total: walletsToSend.length, results });
    setLoadingFor('send', false);
    await handleRefreshBalances();
  };

  // Recover rent from ATAs of selected wallets (close token accounts)
  const handleRecoverRent = async () => {
    if (selectedIds.size === 0) {
      setError('Select at least one wallet to recover rent from');
      return;
    }
    if (!tokenMintInput) {
      setError('Provide a token mint address');
      return;
    }

    const walletsToClose = wallets.filter((w) => selectedIds.has(w.id));
    setError(null);
    setLoadingFor('recoverRent', true);
    setSendProgress({ current: 0, total: walletsToClose.length, results: [] });

    const results: Array<{ walletId: string; status: 'success' | 'error'; message: string }> = [];
    const BATCH_SIZE = 10;
    let totalRecovered = 0;

    for (let batchStart = 0; batchStart < walletsToClose.length; batchStart += BATCH_SIZE) {
      const batch = walletsToClose.slice(batchStart, batchStart + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (w) => {
          const res = await fetch('/api/wallets/close-ata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletPrivateKey: w.privateKey,
              tokenMint: tokenMintInput,
              network,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          return { wallet: w, recoveredLamports: data.data.recoveredLamports, signature: data.data.signature };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const w = batch[j];
        const result = batchResults[j];

        if (result.status === 'fulfilled') {
          const solRecovered = result.value.recoveredLamports / 1e9;
          totalRecovered += solRecovered;
          results.push({ walletId: w.id, status: 'success', message: `Recovered ${solRecovered.toFixed(4)} SOL` });
          onAddLog(
            createLog(
              'transfer',
              'success',
              `Recovered ${solRecovered.toFixed(4)} SOL rent from ${truncateKey(w.publicKey)}`,
              result.value.signature
            )
          );
        } else {
          const msg = result.reason?.message || 'Unknown error';
          results.push({ walletId: w.id, status: 'error', message: msg });
          onAddLog(createLog('transfer', 'error', `Recover rent from ${truncateKey(w.publicKey)} failed: ${msg}`));
        }
      }

      setSendProgress({ current: Math.min(batchStart + BATCH_SIZE, walletsToClose.length), total: walletsToClose.length, results: [...results] });
    }

    setSendProgress({ current: walletsToClose.length, total: walletsToClose.length, results });
    setLoadingFor('recoverRent', false);
    if (totalRecovered > 0) {
      onAddLog(createLog('transfer', 'success', `Total rent recovered: ${totalRecovered.toFixed(4)} SOL from ${results.filter(r => r.status === 'success').length} wallets`));
    }
    await handleRefreshBalances();
  };

  // Recover rent from USDC ATAs of selected wallets
  const handleRecoverRentUsdc = async () => {
    if (selectedIds.size === 0) {
      setError('Select at least one wallet to recover USDC rent from');
      return;
    }

    const USDC_MINT = network === 'devnet'
      ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const STANDARD_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

    const walletsToClose = wallets.filter((w) => selectedIds.has(w.id));
    setError(null);
    setLoadingFor('recoverRentUsdc', true);
    setSendProgress({ current: 0, total: walletsToClose.length, results: [] });

    const results: Array<{ walletId: string; status: 'success' | 'error'; message: string }> = [];
    const BATCH_SIZE = 10;
    let totalRecovered = 0;

    for (let batchStart = 0; batchStart < walletsToClose.length; batchStart += BATCH_SIZE) {
      const batch = walletsToClose.slice(batchStart, batchStart + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (w) => {
          const res = await fetch('/api/wallets/close-ata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletPrivateKey: w.privateKey,
              tokenMint: USDC_MINT,
              tokenProgramId: STANDARD_TOKEN_PROGRAM,
              network,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          return { wallet: w, recoveredLamports: data.data.recoveredLamports, signature: data.data.signature };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const w = batch[j];
        const result = batchResults[j];

        if (result.status === 'fulfilled') {
          const solRecovered = result.value.recoveredLamports / 1e9;
          totalRecovered += solRecovered;
          results.push({ walletId: w.id, status: 'success', message: `Recovered ${solRecovered.toFixed(4)} SOL` });
          onAddLog(
            createLog(
              'transfer',
              'success',
              `Recovered ${solRecovered.toFixed(4)} SOL USDC rent from ${truncateKey(w.publicKey)}`,
              result.value.signature
            )
          );
        } else {
          const msg = result.reason?.message || 'Unknown error';
          results.push({ walletId: w.id, status: 'error', message: msg });
          onAddLog(createLog('transfer', 'error', `Recover USDC rent from ${truncateKey(w.publicKey)} failed: ${msg}`));
        }
      }

      setSendProgress({ current: Math.min(batchStart + BATCH_SIZE, walletsToClose.length), total: walletsToClose.length, results: [...results] });
    }

    setSendProgress({ current: walletsToClose.length, total: walletsToClose.length, results });
    setLoadingFor('recoverRentUsdc', false);
    if (totalRecovered > 0) {
      onAddLog(createLog('transfer', 'success', `Total USDC rent recovered: ${totalRecovered.toFixed(4)} SOL from ${results.filter(r => r.status === 'success').length} wallets`));
    }
    await handleRefreshBalances();
  };

  // Consolidate: send from all wallets (except creator) to one destination
  const handleConsolidate = async () => {
    // Resolve destination
    let destAddress = '';
    if (consolidateDestMode === 'custom') {
      if (!consolidateDest.trim()) { setError('Enter a destination address'); return; }
      destAddress = consolidateDest.trim();
    } else {
      if (!consolidateTableDest) { setError('Select a destination wallet'); return; }
      const destW = allSendWallets.find((w) => w.id === consolidateTableDest);
      if (!destW) { setError('Destination wallet not found'); return; }
      destAddress = destW.publicKey;
    }

    if (consolidateAsset === 'token' && !tokenMintInput) {
      setError('Token mint is required for token consolidation');
      return;
    }

    const sourceWallets = wallets.filter((w) => w.publicKey !== destAddress);
    if (sourceWallets.length === 0) {
      setError('No wallets to consolidate');
      return;
    }

    const pct = consolidatePct / 100;
    const MIN_SEND: Record<string, number> = { sol: 0.00001, usdc: 0.001, token: 0.001 };
    const minAmt = MIN_SEND[consolidateAsset] ?? 0.001;

    const batchItems = sourceWallets
      .map((w) => {
        const balance = consolidateAsset === 'sol' ? w.solBalance : consolidateAsset === 'token' ? w.tokenBalance : w.usdcBalance;
        const amount = balance * pct;
        return {
          walletId: w.id,
          fromPrivateKey: w.privateKey,
          toPublicKey: destAddress,
          amount,
          tokenMint: tokenMintInput || undefined,
          decimals: tokenDecimals,
          assetType: consolidateAsset,
        };
      })
      .filter((item) => item.amount >= minAmt);

    if (batchItems.length === 0) {
      setError('No wallets have enough balance to consolidate');
      return;
    }

    setError(null);
    setLoadingFor('consolidate', true);
    setConsolidateProgress({ current: 0, total: batchItems.length, confirmed: 0, failed: 0 });

    try {
      const res = await fetch('/api/wallets/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchItems, network }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Consolidate failed');
        setLoadingFor('consolidate', false);
        setConsolidateProgress(null);
        return;
      }

      const summary = data.data.summary;
      const assetLabel = consolidateAsset === 'sol' ? 'SOL' : consolidateAsset === 'token' ? 'Tokens' : 'USDC';
      setConsolidateProgress({ current: summary.total, total: summary.total, confirmed: summary.confirmed, failed: summary.failed + summary.timeout });
      onAddLog(createLog('transfer', summary.confirmed > 0 ? 'success' : 'error',
        `Consolidated ${assetLabel} from ${summary.confirmed}/${summary.total} wallets to ${truncateKey(destAddress)}`
      ));
    } catch (err) {
      setError((err as Error).message);
      setConsolidateProgress(null);
    }

    setLoadingFor('consolidate', false);
    await handleRefreshBalances();
  };

  // Toggle send source selection
  const toggleSendSelect = (id: string) => {
    setSendSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSendSelectAll = () => {
    if (sendSelectedIds.size === allSendWallets.length) {
      setSendSelectedIds(new Set());
    } else {
      setSendSelectedIds(new Set(allSendWallets.map((w) => w.id)));
    }
  };

  // Add manual wallet
  const handleAddManualWallet = () => {
    if (!manualPubKey.trim() || !manualPrivKey.trim()) {
      setError('Both public key and private key are required to add a wallet');
      return;
    }
    const newWallet: WalletEntry = {
      id: uuidv4(),
      publicKey: manualPubKey.trim(),
      privateKey: manualPrivKey.trim(),
      solBalance: 0,
      tokenBalance: 0,
      usdcBalance: 0,
      label: `Manual-${wallets.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    onWalletsChange([...wallets, newWallet]);
    setManualPubKey('');
    setManualPrivKey('');
  };

  // Compute send totals (only wallets with positive amounts)
  const sendTotalAmount = Array.from(sendSelectedIds).reduce((acc, id) => {
    return acc + (parseFloat(sendAmounts[id] || '0') || 0);
  }, 0);
  const sendWalletCount = Array.from(sendSelectedIds).filter((id) => {
    return (parseFloat(sendAmounts[id] || '0') || 0) > 0;
  }).length;

  // Delete selected wallets
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    onWalletsChange(wallets.filter((w) => !selectedIds.has(w.id)));
    setSelectedIds(new Set());
  };

  // All wallets for the main table display (creator at top)
  const allDisplayWallets: WalletEntry[] = [
    ...(creatorWallet ? [creatorWallet] : []),
    ...wallets,
  ];

  const totalSol = allDisplayWallets.reduce((acc, w) => acc + w.solBalance, 0);
  const totalTokens = allDisplayWallets.reduce((acc, w) => acc + w.tokenBalance, 0);
  const totalUsdc = allDisplayWallets.reduce((acc, w) => acc + (w.usdcBalance || 0), 0);

  const sellPresets = [2.5, 5, 10, 25, 50, 100];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Wallet Manager</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Generate wallets, mint tokens directly, and manage sell operations
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#a1a1aa]">
            {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
          </span>
          {selectedIds.size > 0 && (
            <span className="text-purple-400">
              ({selectedIds.size} selected)
            </span>
          )}
        </div>
      </div>

      {/* Token Mint & Funder Key */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Configuration</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Token Mint Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenMintInput}
                onChange={(e) => setTokenMintInput(e.target.value)}
                placeholder="Token mint address to track balances..."
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <button
                onClick={handleRefreshBalances}
                disabled={loading.refresh || wallets.length === 0}
                className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2.5 transition-colors"
                title="Refresh balances"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading.refresh ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Mint Authority / Funder Private Key
            </label>
            <div className="relative">
              <input
                type={showFunderKey ? 'text' : 'password'}
                value={funderPrivateKey}
                onChange={(e) => setFunderPrivateKey(e.target.value)}
                placeholder="Private key for funding and distributing..."
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowFunderKey(!showFunderKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition-colors"
              >
                {showFunderKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Generate / Import / Export */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Wallet Operations
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Generate */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Count
              </label>
              <input
                type="number"
                value={generateCount}
                onChange={(e) =>
                  setGenerateCount(
                    Math.max(1, parseInt(e.target.value) || 1)
                  )
                }
                min={1}
                className="w-24 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading.generate}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
            >
              {loading.generate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Generate
            </button>
          </div>

          <div className="h-8 w-px bg-[#27272a]" />

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />

          {/* Export */}
          <button
            onClick={handleExportCSV}
            disabled={wallets.length === 0}
            className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleExportExternal}
            disabled={wallets.length === 0}
            className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Export External
          </button>

          <div className="h-8 w-px bg-[#27272a]" />

          {/* Stealth Fund */}
          <button
            onClick={() => setShowStealthFund(true)}
            disabled={wallets.length === 0}
            className="bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 border border-purple-500/30 rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <Shield className="w-4 h-4" />
            Stealth Fund
          </button>

          <div className="h-8 w-px bg-[#27272a]" />

          {/* Send Tokens */}
          <button
            onClick={() => setShowSendModal(true)}
            disabled={wallets.length < 1 && !creatorWallet}
            className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <Send className="w-4 h-4" />
            Send Assets
          </button>

          {/* Delete Selected */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Action Bar for Selected Wallets */}
      {selectedIds.size > 0 && (
        <div className="bg-[#18181b] rounded-xl border border-purple-500/30 p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-purple-400" />
              Actions for {selectedIds.size} Selected Wallet
              {selectedIds.size !== 1 ? 's' : ''}
            </h3>
            <button
              onClick={() => setExpandedActions(!expandedActions)}
              className="text-[#71717a] hover:text-white transition-colors"
            >
              {expandedActions ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          </div>

          {expandedActions && (
            <div className="space-y-4">
              {/* Per-wallet mint amounts */}
              <div>
                <label className="text-sm text-[#a1a1aa] font-medium mb-2 block">
                  Mint Amount per Wallet
                </label>
                {/* Fixed amount row */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    value={distributeAmount}
                    onChange={(e) => setDistributeAmount(e.target.value)}
                    placeholder="Fixed amount..."
                    min={0}
                    step="any"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all text-right"
                  />
                  <button
                    onClick={handleSetAllMintAmount}
                    disabled={!distributeAmount}
                    className="text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors whitespace-nowrap"
                  >
                    Apply to All
                  </button>
                </div>
                {/* Range (tranche) row */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    value={mintRangeMin}
                    onChange={(e) => setMintRangeMin(e.target.value)}
                    placeholder="Min..."
                    min={0}
                    step="any"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all text-right"
                  />
                  <span className="text-xs text-[#52525b]">to</span>
                  <input
                    type="number"
                    value={mintRangeMax}
                    onChange={(e) => setMintRangeMax(e.target.value)}
                    placeholder="Max..."
                    min={0}
                    step="any"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all text-right"
                  />
                  <button
                    onClick={handleRandomizeRange}
                    disabled={!mintRangeMin || !mintRangeMax || parseFloat(mintRangeMin) > parseFloat(mintRangeMax)}
                    className="text-xs bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors whitespace-nowrap"
                  >
                    Randomize
                  </button>
                </div>
                <div className="bg-[#09090b] border border-[#27272a] rounded-lg overflow-hidden">
                  <div className="max-h-[200px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#09090b] z-10">
                        <tr className="border-b border-[#27272a]">
                          <th className="px-3 py-2 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">Wallet</th>
                          <th className="px-3 py-2 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">Current</th>
                          <th className="px-3 py-2 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider min-w-[160px]">Mint Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWallets.map((w, idx) => (
                          <tr key={w.id} className="border-b border-[#27272a] hover:bg-[#1c1c1f]">
                            <td className="px-3 py-2">
                              <span className="text-sm text-white">{w.label || `Wallet-${idx + 1}`}</span>
                              <span className="text-xs text-[#52525b] ml-2 font-mono">{w.publicKey.slice(0, 6)}...</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-sm font-mono text-[#71717a]">{w.tokenBalance.toLocaleString()}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 justify-end">
                                <input
                                  type="number"
                                  value={mintAmounts[w.id] || ''}
                                  onChange={(e) => setMintAmounts((prev) => ({ ...prev, [w.id]: e.target.value }))}
                                  placeholder="0"
                                  min={0}
                                  step="any"
                                  className="w-28 bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all text-right"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Total Cap + Preview */}
                <div className="flex items-center justify-between mt-2 px-1 gap-3">
                  <p className="text-xs text-[#52525b]">
                    Tokens are minted directly to each wallet (not transferred)
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={mintTotalCap}
                      onChange={(e) => setMintTotalCap(e.target.value)}
                      placeholder="Total cap..."
                      min={0}
                      step="any"
                      className="w-32 bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1 text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-right"
                    />
                    <button
                      onClick={handleAdjustToTotal}
                      disabled={!mintTotalCap || parseFloat(mintTotalCap) <= 0}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-2.5 py-1 font-medium transition-colors whitespace-nowrap"
                    >
                      Adjust
                    </button>
                    <div className="text-sm font-medium whitespace-nowrap">
                      <span className="text-[#71717a]">Total: </span>
                      <span className={mintTotal > 0 ? 'text-purple-400' : 'text-[#52525b]'}>
                        {mintTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Warmup: Trade Random Tokens ── */}
              <div>
                <label className="text-sm text-[#a1a1aa] font-medium mb-2 block">
                  Warmup — Trade Random Pump.fun Tokens
                </label>
                <p className="text-xs text-[#52525b] mb-3">
                  Each wallet buys & sells random pump.fun tokens to build trade history. Different tokens per wallet.
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-[#71717a] block mb-1">Trades per wallet</label>
                    <input
                      type="number"
                      value={warmupTradesPerWallet}
                      onChange={(e) => setWarmupTradesPerWallet(e.target.value)}
                      min={1} max={10}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all text-right"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-[#71717a] block mb-1">Min SOL</label>
                    <input
                      type="number"
                      value={warmupBuyMin}
                      onChange={(e) => setWarmupBuyMin(e.target.value)}
                      min={0.0001} step="0.001"
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all text-right"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-[#71717a] block mb-1">Max SOL</label>
                    <input
                      type="number"
                      value={warmupBuyMax}
                      onChange={(e) => setWarmupBuyMax(e.target.value)}
                      min={0.0001} step="0.001"
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all text-right"
                    />
                  </div>
                  <div className="flex-1 pt-4">
                    <button
                      onClick={handleWarmup}
                      disabled={warmupRunning || selectedWallets.length === 0}
                      className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-4 py-1.5 font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {warmupRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {warmupRunning ? 'Warming up...' : 'Start Warmup'}
                    </button>
                  </div>
                </div>
                {warmupProgress && (
                  <p className={`text-xs px-1 ${warmupProgress.includes('Failed') ? 'text-red-400' : 'text-amber-400'}`}>
                    {warmupProgress}
                  </p>
                )}
                <p className="text-xs text-[#52525b] px-1 mt-1">
                  Cost: ~{(((parseFloat(warmupBuyMin || '0.001') + parseFloat(warmupBuyMax || '0.003')) / 2) * parseInt(warmupTradesPerWallet || '4') * selectedWallets.length * 0.01).toFixed(4)} SOL gas + buy amounts recovered on sell
                </p>
              </div>

              {/* ── Distribute USDC ── */}
              <div>
                <label className="text-sm text-[#a1a1aa] font-medium mb-2 block">
                  Distribute USDC
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    value={usdcFixedAmount}
                    onChange={(e) => setUsdcFixedAmount(e.target.value)}
                    placeholder="Fixed amount..."
                    min={0} step="0.01"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-right"
                  />
                  <button
                    onClick={handleSetAllUsdcAmount}
                    disabled={!usdcFixedAmount}
                    className="text-xs bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors whitespace-nowrap"
                  >
                    Apply to All
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    value={usdcRangeMin}
                    onChange={(e) => setUsdcRangeMin(e.target.value)}
                    placeholder="Min USDC..."
                    min={0} step="0.01"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-right"
                  />
                  <span className="text-xs text-[#52525b]">to</span>
                  <input
                    type="number"
                    value={usdcRangeMax}
                    onChange={(e) => setUsdcRangeMax(e.target.value)}
                    placeholder="Max USDC..."
                    min={0} step="0.01"
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-right"
                  />
                  <button
                    onClick={handleRandomizeUsdcRange}
                    disabled={!usdcRangeMin || !usdcRangeMax || parseFloat(usdcRangeMin) > parseFloat(usdcRangeMax)}
                    className="text-xs bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors whitespace-nowrap"
                  >
                    Randomize
                  </button>
                </div>
                <div className="bg-[#09090b] border border-[#27272a] rounded-lg overflow-hidden">
                  <div className="max-h-[200px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#09090b] z-10">
                        <tr className="border-b border-[#27272a]">
                          <th className="px-3 py-2 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">Wallet</th>
                          <th className="px-3 py-2 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">USDC Balance</th>
                          <th className="px-3 py-2 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider min-w-[160px]">Send USDC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWallets.map((w, idx) => (
                          <tr key={w.id} className="border-b border-[#27272a] hover:bg-[#1c1c1f]">
                            <td className="px-3 py-2">
                              <span className="text-sm text-white">{w.label || `Wallet-${idx + 1}`}</span>
                              <span className="text-xs text-[#52525b] ml-2 font-mono">{w.publicKey.slice(0, 6)}...</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-sm font-mono text-[#71717a]">{(w.usdcBalance || 0).toFixed(2)}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 justify-end">
                                <input
                                  type="number"
                                  value={usdcAmounts[w.id] || ''}
                                  onChange={(e) => setUsdcAmounts((prev) => ({ ...prev, [w.id]: e.target.value }))}
                                  placeholder="0.00"
                                  min={0} step="0.01"
                                  className="w-28 bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-right"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-xs text-[#52525b]">Transferred from funder wallet</p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      <span className="text-[#71717a]">Total: </span>
                      <span className={usdcTotal > 0 ? 'text-cyan-400' : 'text-[#52525b]'}>
                        {usdcTotal.toFixed(2)} USDC
                      </span>
                    </span>
                    <button
                      onClick={handleDistributeUsdc}
                      disabled={loading.distributeUsdc || !funderPrivateKey || usdcTotal <= 0}
                      className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 font-medium transition-colors flex items-center gap-2 text-sm"
                    >
                      {loading.distributeUsdc ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                      Send USDC
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Fund ATA */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={fundAtaAmount}
                    onChange={(e) => setFundAtaAmount(e.target.value)}
                    min={0.001}
                    step="0.01"
                    className="w-20 bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2.5 text-white text-sm font-mono focus:ring-2 focus:ring-green-500/50 focus:border-green-500 outline-none transition-all text-center"
                  />
                  <button
                    onClick={handleFundATA}
                    disabled={loading.fundAta || !funderPrivateKey}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                  >
                    {loading.fundAta ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <DollarSign className="w-4 h-4" />
                    )}
                    Fund ATA
                  </button>
                </div>

                {/* Mint to Wallets */}
                <button
                  onClick={handleMintToWallets}
                  disabled={
                    loading.distribute ||
                    !funderPrivateKey ||
                    !tokenMintInput ||
                    mintTotal <= 0
                  }
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  {loading.distribute ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Coins className="w-4 h-4" />
                  )}
                  Mint {mintTotal > 0 ? `${mintTotal.toLocaleString()} tokens` : 'to Wallets'}
                </button>

                {/* Revoke Authorities */}
                <button
                  onClick={() => setShowRevokeModal(true)}
                  disabled={loading.revoke || !funderPrivateKey || !tokenMintInput}
                  className="bg-red-600/80 hover:bg-red-500 disabled:bg-red-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  {loading.revoke ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  Revoke Authorities
                </button>

                {/* Sell Tokens */}
                <div className="relative">
                  <button
                    onClick={() => setShowSellPicker(!showSellPicker)}
                    disabled={loading.sell || !tokenMintInput}
                    className="bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                  >
                    {loading.sell ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Percent className="w-4 h-4" />
                    )}
                    Sell Tokens
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {showSellPicker && (
                    <div className="absolute top-full mt-2 left-0 bg-[#18181b] border border-[#27272a] rounded-lg p-3 shadow-xl z-20 min-w-48">
                      <p className="text-xs text-[#71717a] mb-2 font-medium">
                        Select percentage to sell
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {sellPresets.map((pct) => (
                          <button
                            key={pct}
                            onClick={() => handleSell(pct)}
                            className="bg-[#27272a] hover:bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Recover Rent (Token) */}
                <button
                  onClick={handleRecoverRent}
                  disabled={loading.recoverRent || !tokenMintInput || selectedIds.size === 0}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  {loading.recoverRent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Recycle className="w-4 h-4" />
                  )}
                  Recover Token Rent ({selectedIds.size})
                </button>

                {/* Recover Rent (USDC) */}
                <button
                  onClick={handleRecoverRentUsdc}
                  disabled={loading.recoverRentUsdc || selectedIds.size === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  {loading.recoverRentUsdc ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Recycle className="w-4 h-4" />
                  )}
                  Recover USDC Rent ({selectedIds.size})
                </button>

                {/* Consolidate */}
                <button
                  onClick={() => setShowConsolidate(!showConsolidate)}
                  className={`${showConsolidate ? 'bg-amber-500' : 'bg-amber-600 hover:bg-amber-500'} text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm`}
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  Consolidate
                  {showConsolidate ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Consolidate Panel */}
              {showConsolidate && (
                <div className="bg-[#09090b] border border-amber-500/30 rounded-xl p-4 space-y-3 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownToLine className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-400">Consolidate All Wallets</span>
                    <span className="text-xs text-[#52525b]">({wallets.length} wallets → 1 destination)</span>
                  </div>

                  {/* Asset type */}
                  <div>
                    <label className="block text-[10px] text-[#71717a] uppercase tracking-wider font-medium mb-1.5">Asset</label>
                    <div className="flex gap-2">
                      {(['sol', 'token', 'usdc'] as const).map((asset) => (
                        <button
                          key={asset}
                          onClick={() => setConsolidateAsset(asset)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            consolidateAsset === asset
                              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                              : 'bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-white'
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
                            : 'bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-white'
                        }`}
                      >
                        Custom Address
                      </button>
                      <button
                        onClick={() => setConsolidateDestMode('table')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          consolidateDestMode === 'table'
                            ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                            : 'bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-white'
                        }`}
                      >
                        Pick from Table
                      </button>
                    </div>
                    {consolidateDestMode === 'custom' ? (
                      <>
                        <input
                          type="text"
                          value={consolidateDest}
                          onChange={(e) => setConsolidateDest(e.target.value)}
                          placeholder="Public key..."
                          className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500 outline-none placeholder:text-[#3f3f46]"
                        />
                        {creatorWallet && (
                          <button
                            onClick={() => setConsolidateDest(creatorWallet.publicKey)}
                            className="text-[10px] text-amber-500/70 hover:text-amber-400 mt-1 transition-colors"
                          >
                            Use Creator: {truncateKey(creatorWallet.publicKey)}
                          </button>
                        )}
                      </>
                    ) : (
                      <select
                        value={consolidateTableDest}
                        onChange={(e) => setConsolidateTableDest(e.target.value)}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500 outline-none"
                      >
                        <option value="">Select destination wallet...</option>
                        {allSendWallets.map((w, i) => (
                          <option key={w.id} value={w.id}>
                            {w.id === '__creator__' ? 'Creator' : w.label || `Wallet-${i}`} ({truncateKey(w.publicKey)})
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
                                : 'bg-[#18181b] text-[#52525b] border border-[#27272a] hover:text-white'
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
                    <div className="bg-[#18181b] rounded-lg p-3 border border-[#27272a]">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#a1a1aa]">
                          {consolidateProgress.current}/{consolidateProgress.total}
                        </span>
                        <span>
                          <span className="text-green-400">{consolidateProgress.confirmed} ok</span>
                          {consolidateProgress.failed > 0 && (
                            <span className="text-red-400 ml-2">{consolidateProgress.failed} failed</span>
                          )}
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

                  {/* Go button */}
                  <button
                    onClick={handleConsolidate}
                    disabled={loading.consolidate || (consolidateDestMode === 'custom' ? !consolidateDest.trim() : !consolidateTableDest) || wallets.length === 0}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {loading.consolidate ? (
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
          )}
        </div>
      )}

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

      {/* Balance Summary */}
      {allDisplayWallets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-[#71717a]">Total SOL</p>
              <p className="text-lg font-bold text-white">
                {totalSol.toFixed(4)} SOL
              </p>
            </div>
          </div>
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-[#71717a]">Total USDC</p>
              <p className="text-lg font-bold text-white">
                {totalUsdc.toFixed(2)} USDC
              </p>
            </div>
          </div>
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Coins className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-[#71717a]">Total Tokens</p>
              <p className="text-lg font-bold text-white">
                {totalTokens.toLocaleString()} Tokens
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wallets Table */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] overflow-hidden">
        {allDisplayWallets.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Wallet className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#52525b] mb-1">
              No Wallets Yet
            </h3>
            <p className="text-sm text-[#3f3f46]">
              Generate wallets or import from a CSV file to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#27272a]">
                  <th className="px-4 py-3 text-left">
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === wallets.length && wallets.length > 0}
                          onChange={toggleSelectAll}
                          className="sr-only peer"
                        />
                        <div className="w-4 h-4 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all flex items-center justify-center">
                          {selectedIds.size === wallets.length &&
                            wallets.length > 0 && (
                              <Check className="w-2.5 h-2.5 text-white" />
                            )}
                        </div>
                      </div>
                    </label>
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    Label
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    Public Key
                  </th>
                  <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    SOL
                  </th>
                  <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    USDC
                  </th>
                  <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-4 py-3 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allDisplayWallets.map((wallet, idx) => {
                  const isCreator = wallet.id === '__creator__';
                  return (
                  <tr
                    key={wallet.id}
                    className={`border-b border-[#27272a] hover:bg-[#1c1c1f] transition-colors ${
                      selectedIds.has(wallet.id) ? 'bg-purple-500/5' : ''
                    } ${isCreator ? 'bg-yellow-500/[0.03]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {!isCreator && (
                        <label className="flex items-center cursor-pointer">
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
                        </label>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm ${isCreator ? 'text-yellow-400 font-semibold' : 'text-white'}`}>
                          {isCreator ? 'Creator' : wallet.label || `Wallet-${idx}`}
                        </span>
                        {isCreator && (
                          <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded font-medium">
                            AUTH
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-[#a1a1aa]">
                          {truncateKey(wallet.publicKey)}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              wallet.publicKey,
                              `pk-${wallet.id}`
                            )
                          }
                          className="text-[#52525b] hover:text-white transition-colors"
                        >
                          {copiedField === `pk-${wallet.id}` ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-white">
                        {wallet.solBalance.toFixed(4)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-blue-400">
                        {(wallet.usdcBalance || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-white">
                        {wallet.tokenBalance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRefreshSingle(wallet)}
                          disabled={loading[`refresh-${wallet.id}`]}
                          className="text-[#52525b] hover:text-green-400 transition-colors p-1.5 rounded hover:bg-green-500/10 disabled:opacity-50"
                          title="Refresh balances"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loading[`refresh-${wallet.id}`] ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              wallet.privateKey,
                              `sk-${wallet.id}`
                            )
                          }
                          className="text-[#52525b] hover:text-white transition-colors p-1.5 rounded hover:bg-[#27272a]"
                          title="Copy private key"
                        >
                          {copiedField === `sk-${wallet.id}` ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {!isCreator && (
                          <button
                            onClick={() => {
                              onWalletsChange(
                                wallets.filter((w) => w.id !== wallet.id)
                              );
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(wallet.id);
                                return next;
                              });
                            }}
                            className="text-[#52525b] hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-500/10"
                            title="Delete wallet"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stealth Fund Modal */}
      {showStealthFund && (
        <StealthFundModal
          wallets={selectedWallets.length > 0 ? selectedWallets : wallets}
          creatorKey={funderPrivateKey}
          network={network}
          onClose={() => setShowStealthFund(false)}
        />
      )}

      {/* Send Tokens Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 w-full max-w-6xl animate-fade-in my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-purple-400" />
                Send Assets
              </h3>
              <button
                onClick={() => {
                  setShowSendModal(false);
                  setSendProgress(null);
                }}
                className="text-[#71717a] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Asset Type Selector */}
            <div className="flex gap-2 mb-4">
              {([
                { key: 'sol' as const, label: 'SOL', color: 'green' },
                { key: 'usdc' as const, label: 'USDC', color: 'blue' },
                { key: 'token' as const, label: 'Token', color: 'purple' },
              ]).map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => {
                    setSendAssetType(key);
                    setSendAmounts({});
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    sendAssetType === key
                      ? `bg-${color}-600 text-white`
                      : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover:text-white'
                  }`}
                  style={sendAssetType === key ? {
                    backgroundColor: color === 'green' ? '#16a34a' : color === 'blue' ? '#2563eb' : '#9333ea',
                  } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Progress display */}
            {sendProgress && (
              <div className="mb-4 bg-[#09090b] border border-[#27272a] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#a1a1aa]">
                    Progress: {sendProgress.current} / {sendProgress.total}
                  </span>
                  <span className="text-[#a1a1aa]">
                    {sendProgress.results.filter((r) => r.status === 'success').length} success,{' '}
                    {sendProgress.results.filter((r) => r.status === 'error').length} failed
                  </span>
                </div>
                <div className="w-full bg-[#27272a] rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                  />
                </div>
                {sendProgress.results.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 mt-2">
                    {sendProgress.results.map((r, i) => {
                      const w = allSendWallets.find((wl) => wl.id === r.walletId);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {r.status === 'success' ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                          )}
                          <span className="text-[#a1a1aa] font-mono">
                            {w ? truncateKey(w.publicKey) : 'Unknown'}
                          </span>
                          <span className={r.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                            {r.message}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Source Wallets Table */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider">
                  Source Wallets
                </h4>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSetAll100}
                    disabled={sendSelectedIds.size === 0}
                    className="text-xs bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                  >
                    100% All Selected
                  </button>
                  <button
                    onClick={toggleSendSelectAll}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
                  >
                    {sendSelectedIds.size === allSendWallets.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#09090b] z-10">
                      <tr className="border-b border-[#27272a]">
                        <th className="px-3 py-2.5 text-left w-10">
                          <label className="flex items-center cursor-pointer">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={sendSelectedIds.size === allSendWallets.length && allSendWallets.length > 0}
                                onChange={toggleSendSelectAll}
                                className="sr-only peer"
                              />
                              <div className="w-4 h-4 rounded border-2 border-[#3f3f46] bg-[#18181b] peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all flex items-center justify-center">
                                {sendSelectedIds.size === allSendWallets.length && allSendWallets.length > 0 && (
                                  <Check className="w-2.5 h-2.5 text-white" />
                                )}
                              </div>
                            </div>
                          </label>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                          Label
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs text-[#71717a] font-medium uppercase tracking-wider">
                          Public Key
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                          SOL
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                          USDC
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider">
                          Tokens
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs text-[#71717a] font-medium uppercase tracking-wider min-w-[200px]">
                          Amount to Send
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSendWallets.map((wallet, idx) => {
                        const isCreator = wallet.id === '__creator__';
                        return (
                        <tr
                          key={wallet.id}
                          className={`border-b border-[#27272a] hover:bg-[#1c1c1f] transition-colors ${
                            sendSelectedIds.has(wallet.id) ? 'bg-purple-500/5' : ''
                          } ${isCreator ? 'border-l-2 border-l-yellow-500/50' : ''}`}
                        >
                          <td className="px-3 py-2.5">
                            <label className="flex items-center cursor-pointer">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={sendSelectedIds.has(wallet.id)}
                                  onChange={() => toggleSendSelect(wallet.id)}
                                  className="sr-only peer"
                                />
                                <div className="w-4 h-4 rounded border-2 border-[#3f3f46] bg-[#18181b] peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all flex items-center justify-center">
                                  {sendSelectedIds.has(wallet.id) && (
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  )}
                                </div>
                              </div>
                            </label>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm ${isCreator ? 'text-yellow-400 font-semibold' : 'text-white'}`}>
                                {isCreator ? 'Creator' : wallet.label || `Wallet-${idx}`}
                              </span>
                              {isCreator && (
                                <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded font-medium">
                                  AUTH
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-mono text-[#a1a1aa]">
                                {truncateKey(wallet.publicKey)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(wallet.publicKey, `send-pk-${wallet.id}`)}
                                className="text-[#52525b] hover:text-white transition-colors"
                              >
                                {copiedField === `send-pk-${wallet.id}` ? (
                                  <Check className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-sm font-mono text-white">
                              {wallet.solBalance.toFixed(4)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-sm font-mono text-blue-400">
                              {(wallet.usdcBalance || 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-sm font-mono text-white">
                              {wallet.tokenBalance.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 justify-end">
                              <input
                                type="number"
                                value={sendAmounts[wallet.id] || ''}
                                onChange={(e) =>
                                  setSendAmounts((prev) => ({ ...prev, [wallet.id]: e.target.value }))
                                }
                                placeholder="0"
                                min={0}
                                step="any"
                                className="w-32 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all text-right"
                              />
                              <button
                                onClick={() =>
                                  setSendAmounts((prev) => ({
                                    ...prev,
                                    [wallet.id]: String(getBalanceForAsset(wallet)),
                                  }))
                                }
                                className="bg-[#27272a] hover:bg-purple-600 text-[#a1a1aa] hover:text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors shrink-0"
                                title={`Fill with full ${assetLabel} balance`}
                              >
                                100%
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Manual Wallet Add */}
            <div className="mb-6 bg-[#09090b] border border-[#27272a] rounded-lg p-4">
              <h4 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
                Add Wallet Manually
              </h4>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-[#52525b] font-medium mb-1">
                    Public Key
                  </label>
                  <input
                    type="text"
                    value={manualPubKey}
                    onChange={(e) => setManualPubKey(e.target.value)}
                    placeholder="Solana public key..."
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-[#52525b] font-medium mb-1">
                    Private Key
                  </label>
                  <input
                    type="password"
                    value={manualPrivKey}
                    onChange={(e) => setManualPrivKey(e.target.value)}
                    placeholder="Solana private key..."
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handleAddManualWallet}
                  disabled={!manualPubKey.trim() || !manualPrivKey.trim()}
                  className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            {/* Destination Section */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
                Destination
              </h4>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setSendDestMode('custom')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    sendDestMode === 'custom'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover:text-white'
                  }`}
                >
                  Custom Address
                </button>
                <button
                  onClick={() => setSendDestMode('table')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    sendDestMode === 'table'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover:text-white'
                  }`}
                >
                  Pick from Table
                </button>
              </div>

              {sendDestMode === 'custom' ? (
                <input
                  type="text"
                  value={sendCustomDest}
                  onChange={(e) => setSendCustomDest(e.target.value)}
                  placeholder="Enter Solana public key address..."
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                />
              ) : (
                <select
                  value={sendTableDest}
                  onChange={(e) => setSendTableDest(e.target.value)}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                >
                  <option value="">Select destination wallet...</option>
                  {allSendWallets
                    .filter((w) => !sendSelectedIds.has(w.id))
                    .map((w, i) => (
                      <option key={w.id} value={w.id}>
                        {w.id === '__creator__' ? 'Creator (AUTH)' : w.label || `Wallet-${i + 1}`} ({truncateKey(w.publicKey)}) -{' '}
                        {getBalanceForAsset(w).toLocaleString()} {assetLabel}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendTokens}
              disabled={
                loading.send ||
                sendSelectedIds.size === 0 ||
                (sendDestMode === 'custom' ? !sendCustomDest.trim() : !sendTableDest) ||
                (sendAssetType === 'token' && !tokenMintInput)
              }
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 text-base"
            >
              {loading.send ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending... ({sendProgress ? `${sendProgress.current}/${sendProgress.total}` : '...'})
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send {sendTotalAmount.toLocaleString()} {assetLabel} from {sendWalletCount} wallet{sendWalletCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Revoke Authorities Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] rounded-xl border border-red-500/30 p-6 w-full max-w-lg animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Revoke Authorities
              </h3>
              <button
                onClick={() => setShowRevokeModal(false)}
                className="text-[#71717a] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-400">
                This action is irreversible. Only revoke after all tokens have been minted to wallets and the pool has been created.
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={revokeMintAuth}
                    onChange={(e) => setRevokeMintAuth(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-red-600 peer-checked:border-red-600 transition-all flex items-center justify-center">
                    {revokeMintAuth && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-white">Revoke Mint Authority</span>
                  <p className="text-xs text-[#71717a] mt-0.5">
                    No more tokens can ever be minted. Supply becomes fixed.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={revokeUpdateAuth}
                    onChange={(e) => setRevokeUpdateAuth(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-red-600 peer-checked:border-red-600 transition-all flex items-center justify-center">
                    {revokeUpdateAuth && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-white">Revoke Update Authority</span>
                  <p className="text-xs text-[#71717a] mt-0.5">
                    Token metadata (name, symbol, image) can no longer be changed.
                  </p>
                </div>
              </label>

              <button
                onClick={handleRevokeAuthorities}
                disabled={loading.revoke || (!revokeMintAuth && !revokeUpdateAuth)}
                className="w-full bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading.revoke ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Revoke Selected Authorities
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
