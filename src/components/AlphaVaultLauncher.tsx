'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Wallet,
  Send,
  Zap,
  Gift,
  Info,
  RefreshCw,
} from 'lucide-react';
import type { WalletEntry, TransactionLog } from '@/types';
import { useToast } from '@/components/Toast';

interface AlphaVaultLauncherProps {
  network: 'devnet' | 'mainnet-beta';
  wallets: WalletEntry[];
  tokenMint: string;
  tokenDecimals: number;
  poolAddress: string;
  creatorKey?: string;
  onAddLog: (log: TransactionLog) => void;
  onWalletsChange?: (wallets: WalletEntry[]) => void;
}

type Step = 'config' | 'create' | 'escrows' | 'deposit' | 'fill' | 'claim';

interface VaultInfo {
  vaultAddress: string;
  activationPoint: number;
  startVesting: number;
  endVesting: number;
  maxBuyingCap: number;
  quoteSymbol: string;
}

interface DepositResult {
  walletId: string;
  wallet: string;
  label: string;
  amount: number;
  status: 'pending' | 'success' | 'error';
  signature?: string;
  error?: string;
}

interface ClaimResult {
  walletId: string;
  wallet: string;
  label: string;
  status: 'pending' | 'success' | 'error';
  claimed?: string;
  signature?: string;
  error?: string;
}

const STEPS: { id: Step; label: string; icon: typeof Rocket }[] = [
  { id: 'config', label: 'Configure', icon: Rocket },
  { id: 'create', label: 'Create Vault', icon: Zap },
  { id: 'escrows', label: 'Whitelist', icon: Wallet },
  { id: 'deposit', label: 'Fund & Deposit', icon: Send },
  { id: 'fill', label: 'Fill Vault', icon: RefreshCw },
  { id: 'claim', label: 'Claim Tokens', icon: Gift },
];

function truncateKey(key: string): string {
  if (!key || key.length < 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function AlphaVaultLauncher({
  network,
  wallets,
  tokenMint: initialTokenMint,
  tokenDecimals,
  poolAddress: initialPoolAddress,
  creatorKey = '',
  onAddLog,
  onWalletsChange,
}: AlphaVaultLauncherProps) {
  const { addToast } = useToast();
  const [step, setStep] = useState<Step>('config');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [resumeVaultAddress, setResumeVaultAddress] = useState('');
  const [resuming, setResuming] = useState(false);

  // Config state
  const [poolAddress, setPoolAddress] = useState(initialPoolAddress || '');
  const [maxBuyingCap, setMaxBuyingCap] = useState(25000);
  const [lockDuration, setLockDuration] = useState(10);
  const [vestingDuration, setVestingDuration] = useState(10);
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());
  const [depositPerWallet, setDepositPerWallet] = useState(0);
  const [quoteSymbol, setQuoteSymbol] = useState<'SOL' | 'USDC'>('SOL');
  const [loadingPool, setLoadingPool] = useState(false);


  // Auto-detect quote token from pool
  useEffect(() => {
    if (!poolAddress || poolAddress.length < 32) return;
    let cancelled = false;
    setLoadingPool(true);
    fetch('/api/pool/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolAddress, network }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.data?.tokenBMint) {
          const isSOL = data.data.tokenBMint === 'So11111111111111111111111111111111111111112';
          setQuoteSymbol(isSOL ? 'SOL' : 'USDC');
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPool(false); });
    return () => { cancelled = true; };
  }, [poolAddress, network]);

  // Vault state
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [vaultState, setVaultState] = useState<string>('UNKNOWN');
  const [creating, setCreating] = useState(false);

  // Escrow state
  const [creatingEscrows, setCreatingEscrows] = useState(false);
  const [escrowsCreated, setEscrowsCreated] = useState(0);
  const [escrowsFailed, setEscrowsFailed] = useState(0);

  // Deposit state
  const [fundingWallets, setFundingWallets] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositResults, setDepositResults] = useState<DepositResult[]>([]);
  const [depositProgress, setDepositProgress] = useState({ current: 0, total: 0 });

  const [refreshingBalances, setRefreshingBalances] = useState(false);

  // Fill state
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<{ signature: string; boughtToken: string; swappedAmount: string } | null>(null);

  // Claim state
  const [claiming, setClaiming] = useState(false);
  const [claimResults, setClaimResults] = useState<ClaimResult[]>([]);
  const [claimProgress, setClaimProgress] = useState({ current: 0, total: 0 });

  const [error, setError] = useState<string | null>(null);
  const [customDepositAmounts, setCustomDepositAmounts] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState<{ depositClose: number; purchaseEnd: number }>({ depositClose: 0, purchaseEnd: 0 });

  // ── Persist vault info to localStorage ──
  const STORAGE_KEY = `alpha-vault-${network}`;

  useEffect(() => {
    if (vaultInfo) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ vaultInfo, step, escrowsCreated, poolAddress }));
    }
  }, [vaultInfo, step, escrowsCreated]);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.vaultInfo?.vaultAddress) {
          setResumeVaultAddress(data.vaultInfo.vaultAddress);
        }
      }
    } catch {}
  }, []);

  // Resume an existing vault
  const handleResumeVault = async (addr?: string) => {
    const vaultAddr = addr || resumeVaultAddress;
    if (!vaultAddr || vaultAddr.length < 32) {
      setError('Enter a valid vault address');
      return;
    }
    setResuming(true);
    setError(null);
    try {
      const res = await fetch('/api/alpha-vault/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultAddress: vaultAddr, network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const d = data.data;
      const isSOL = d.quoteMint === 'So11111111111111111111111111111111111111112';
      const qs = isSOL ? 'SOL' : 'USDC';
      const decimals = isSOL ? 9 : 6;

      setVaultInfo({
        vaultAddress: vaultAddr,
        activationPoint: d.lastBuyingPoint,
        startVesting: d.startVesting,
        endVesting: d.endVesting,
        maxBuyingCap: parseInt(d.maxBuyingCap) / 10 ** decimals,
        quoteSymbol: qs,
      });
      setPoolAddress(d.pool);
      setQuoteSymbol(qs);
      const normalizedState = normalizeState(d.state);
      setVaultState(normalizedState);

      // Jump to appropriate step based on vault state
      const totalDep = parseInt(d.totalDeposit);
      const bought = parseInt(d.boughtToken);
      if (bought > 0) {
        setStep('claim');
      } else if (normalizedState === 'PURCHASING') {
        setStep('fill');
      } else if (totalDep > 0) {
        setStep('fill');
      } else {
        setStep('escrows');
      }

      addToast(`Vault resumed: ${truncateKey(vaultAddr)}`, 'success');
    } catch (err) {
      setError((err as Error).message);
      addToast('Failed to load vault', 'error');
    } finally {
      setResuming(false);
    }
  };

  // Auto-select all wallets
  useEffect(() => {
    if (wallets.length > 0 && selectedWalletIds.size === 0) {
      setSelectedWalletIds(new Set(wallets.map(w => w.id)));
    }
  }, [wallets.length]);


  // Auto-calculate deposit per wallet
  useEffect(() => {
    if (selectedWalletIds.size > 0 && maxBuyingCap > 0) {
      setDepositPerWallet(Math.floor((maxBuyingCap / selectedWalletIds.size) * 100) / 100);
    }
  }, [selectedWalletIds.size, maxBuyingCap]);

  useEffect(() => {
    if (initialPoolAddress) setPoolAddress(initialPoolAddress);
  }, [initialPoolAddress]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';
  const selectedWallets = wallets.filter(w => selectedWalletIds.has(w.id));

  // Normalize vault state: API may return number or string
  const VAULT_STATE_MAP: Record<string, string> = {
    '0': 'PREPARING',
    '1': 'DEPOSITING',
    '2': 'PURCHASING',
    '3': 'LOCKING',
    '4': 'VESTING',
    '5': 'VESTING_COMPLETE',
  };
  const normalizeState = (s: string | number): string => {
    const key = String(s);
    return VAULT_STATE_MAP[key] || key;
  };

  // ── Step 2: Create Vault ──
  const handleCreateVault = async () => {
    if (!creatorKey || !poolAddress) {
      setError('Creator key and pool address are required');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/alpha-vault/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: creatorKey,
          poolAddress,
          maxBuyingCap,
          lockDuration,
          vestingDuration,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setVaultInfo(data.data);
      addToast(`Vault created: ${truncateKey(data.data.vaultAddress)}`, 'success');
      setStep('escrows');
    } catch (err) {
      setError((err as Error).message);
      addToast('Failed to create vault', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ── Step 2b: Create escrows (whitelist wallets) ──
  const handleCreateEscrows = async () => {
    if (!vaultInfo || !creatorKey || selectedWallets.length === 0) return;
    setCreatingEscrows(true);
    setError(null);
    setEscrowsCreated(0);
    setEscrowsFailed(0);
    try {
      const quoteDecimals = vaultInfo.quoteSymbol === 'USDC' ? 6 : 9;
      const res = await fetch('/api/alpha-vault/create-escrows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: creatorKey,
          vaultAddress: vaultInfo.vaultAddress,
          walletPublicKeys: selectedWallets.map(w => w.publicKey),
          maxCapPerWallet: depositPerWallet,
          quoteDecimals,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success && !data.data) throw new Error(data.error);
      const already = data.data.alreadyExist || 0;
      setEscrowsCreated(data.data.totalCreated + already);
      setEscrowsFailed(data.data.totalFailed);
      if (already > 0 && data.data.totalCreated === 0 && data.data.totalFailed === 0) {
        addToast(`All ${already} escrows already exist`, 'success');
      } else {
        addToast(`Escrows: ${data.data.totalCreated} created, ${already} already exist, ${data.data.totalFailed} failed`, 'success');
      }
      if (data.data.totalCreated > 0 || already > 0) setStep('deposit');
    } catch (err) {
      setError((err as Error).message);
      addToast('Failed to create escrows', 'error');
    } finally {
      setCreatingEscrows(false);
    }
  };

  // ── Step 3: Deposit all wallet balance into vault (no funding) ──
  const handleFundAndDeposit = async () => {
    if (!vaultInfo || selectedWallets.length === 0) return;
    setDepositing(true);
    setError(null);

    const isSOL = vaultInfo.quoteSymbol === 'SOL';
    const quoteDecimals = isSOL ? 9 : 6;

    // Use custom amounts set by user in the table
    const results: DepositResult[] = selectedWallets.map(w => ({
      walletId: w.id,
      wallet: w.publicKey,
      label: w.label || truncateKey(w.publicKey),
      amount: customDepositAmounts[w.id] || 0,
      status: 'pending' as const,
    }));
    setDepositResults(results);
    setDepositProgress({ current: 0, total: selectedWallets.length });

    // Each wallet deposits its full balance into vault
    for (let i = 0; i < selectedWallets.length; i++) {
      const w = selectedWallets[i];
      const depositAmt = customDepositAmounts[w.id] || 0;
      setDepositProgress({ current: i + 1, total: selectedWallets.length });

      if (depositAmt <= 0) {
        setDepositResults(prev => prev.map(r =>
          r.walletId === w.id ? { ...r, status: 'error', error: 'No balance' } : r
        ));
        continue;
      }

      try {
        // Random delay 1-5s to look organic
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 4000));

        const res = await fetch('/api/alpha-vault/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vaultAddress: vaultInfo.vaultAddress,
            walletPrivateKey: w.privateKey,
            amount: depositAmt,
            quoteDecimals,
            network,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setDepositResults(prev => prev.map(r =>
          r.walletId === w.id ? { ...r, status: 'success', signature: data.data.signature } : r
        ));
      } catch (err) {
        setDepositResults(prev => prev.map(r =>
          r.walletId === w.id ? { ...r, status: 'error', error: (err as Error).message } : r
        ));
      }
    }

    addToast(`Deposited: ${selectedWallets.length} wallets processed`, 'success');
    setDepositing(false);
    setStep('fill');
  };

  // ── Retry single wallet deposit ──
  const handleRetrySingleDeposit = async (w: typeof selectedWallets[0]) => {
    if (!vaultInfo) return;
    const isSOL = vaultInfo.quoteSymbol === 'SOL';
    const quoteDecimals = isSOL ? 9 : 6;
    const depositAmt = customDepositAmounts[w.id] || 0;

    if (depositAmt <= 0) {
      addToast(`No deposit amount set for ${w.label || truncateKey(w.publicKey)}`, 'error');
      return;
    }

    // Mark as pending
    setDepositResults(prev => {
      const existing = prev.find(r => r.walletId === w.id);
      if (existing) {
        return prev.map(r => r.walletId === w.id ? { ...r, status: 'pending' as const, error: undefined } : r);
      }
      return [...prev, { walletId: w.id, wallet: w.publicKey, label: w.label || truncateKey(w.publicKey), amount: depositAmt, status: 'pending' as const }];
    });

    try {
      const res = await fetch('/api/alpha-vault/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultAddress: vaultInfo.vaultAddress,
          walletPrivateKey: w.privateKey,
          amount: depositAmt,
          quoteDecimals,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDepositResults(prev => prev.map(r =>
        r.walletId === w.id ? { ...r, status: 'success', signature: data.data.signature } : r
      ));
      addToast(`Deposit OK for ${w.label || truncateKey(w.publicKey)}`, 'success');
    } catch (err) {
      setDepositResults(prev => prev.map(r =>
        r.walletId === w.id ? { ...r, status: 'error', error: (err as Error).message } : r
      ));
      addToast(`Deposit failed: ${(err as Error).message}`, 'error');
    }
  };

  // ── Refresh all wallet balances ──
  const handleRefreshAllBalances = async () => {
    if (!onWalletsChange) return;
    setRefreshingBalances(true);
    try {
      const res = await fetch('/api/wallets/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: selectedWallets, tokenMint: initialTokenMint || undefined, network }),
      });
      const data = await res.json();
      if (data.success) {
        const updated: WalletEntry[] = data.data;
        const updatedMap = new Map(updated.map(w => [w.id, w]));
        const newWallets = wallets.map(w => {
          const u = updatedMap.get(w.id);
          return u ? { ...w, solBalance: u.solBalance, tokenBalance: u.tokenBalance, usdcBalance: u.usdcBalance } : w;
        });
        onWalletsChange(newWallets);
        // Update deposit amounts to match new balances
        const isSOL = vaultInfo?.quoteSymbol === 'SOL';
        const amounts: Record<string, number> = {};
        for (const w of newWallets.filter(w2 => selectedWallets.some(sw => sw.id === w2.id))) {
          const bal = isSOL ? w.solBalance : (w.usdcBalance || 0);
          amounts[w.id] = isSOL ? Math.floor(Math.max(0, bal - 0.02) * 10000) / 10000 : Math.floor(bal * 10000) / 10000;
        }
        setCustomDepositAmounts(amounts);
        addToast(`Balances refreshed for ${selectedWallets.length} wallets`, 'success');
      }
    } catch (err) {
      addToast(`Refresh failed: ${(err as Error).message}`, 'error');
    }
    setRefreshingBalances(false);
  };

  // ── Step 4: Fill vault (crank) ──
  const handleFillVault = async () => {
    if (!vaultInfo || !creatorKey) return;
    setFilling(true);
    setError(null);
    try {
      const res = await fetch('/api/alpha-vault/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultAddress: vaultInfo.vaultAddress,
          privateKey: creatorKey,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFillResult(data.data);
      addToast('Vault filled — tokens purchased from pool', 'success');
      setStep('claim');
    } catch (err) {
      setError((err as Error).message);
      addToast('Fill failed', 'error');
    } finally {
      setFilling(false);
    }
  };

  // ── Step 5: Claim tokens for all wallets ──
  const handleClaimAll = async () => {
    if (!vaultInfo || selectedWallets.length === 0) return;
    setClaiming(true);
    setError(null);

    const results: ClaimResult[] = selectedWallets.map(w => ({
      walletId: w.id,
      wallet: w.publicKey,
      label: w.label || truncateKey(w.publicKey),
      status: 'pending' as const,
    }));
    setClaimResults(results);
    setClaimProgress({ current: 0, total: selectedWallets.length });

    for (let i = 0; i < selectedWallets.length; i++) {
      const w = selectedWallets[i];
      setClaimProgress({ current: i + 1, total: selectedWallets.length });

      try {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));

        const res = await fetch('/api/alpha-vault/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vaultAddress: vaultInfo.vaultAddress,
            walletPrivateKey: w.privateKey,
            network,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setClaimResults(prev => prev.map(r =>
          r.walletId === w.id
            ? { ...r, status: 'success', signature: data.data.signature, claimed: data.data.claimedNow }
            : r
        ));
      } catch (err) {
        setClaimResults(prev => prev.map(r =>
          r.walletId === w.id ? { ...r, status: 'error', error: (err as Error).message } : r
        ));
      }
    }

    addToast('Claim complete', 'success');
    setClaiming(false);
  };

  // ── Vault status info ──
  const [statusInfo, setStatusInfo] = useState<{
    currentPoint: number;
    firstJoinPoint: number;
    lastJoinPoint: number;
    lastBuyingPoint: number;
    startVesting: number;
    endVesting: number;
  } | null>(null);

  // ── Check vault status ──
  const handleCheckStatus = async (silent = false) => {
    if (!vaultInfo) return;
    try {
      const res = await fetch('/api/alpha-vault/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultAddress: vaultInfo.vaultAddress, network }),
      });
      const data = await res.json();
      if (data.success) {
        setVaultState(normalizeState(data.data.state));
        setStatusInfoWithTime({
          currentPoint: data.data.currentPoint,
          firstJoinPoint: data.data.firstJoinPoint,
          lastJoinPoint: data.data.lastJoinPoint,
          lastBuyingPoint: data.data.lastBuyingPoint,
          startVesting: data.data.startVesting,
          endVesting: data.data.endVesting,
        });
        if (!silent) addToast(`Vault state: ${data.data.state}`, 'info');
      }
    } catch {}
  };

  // Auto-refresh status every 15s on fill/claim steps
  useEffect(() => {
    if (!vaultInfo || (step !== 'fill' && step !== 'claim' && step !== 'deposit')) return;
    handleCheckStatus(true);
    const interval = setInterval(() => handleCheckStatus(true), 15_000);
    return () => clearInterval(interval);
  }, [vaultInfo?.vaultAddress, step]);

  // Live countdown timer (ticks every second)
  useEffect(() => {
    if (!statusInfo) return;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      // Approximate: statusInfo.currentPoint was fetched at some point, drift with wall clock
      const drift = now - (statusInfo as any)._fetchedAt;
      const approxCurrent = statusInfo.currentPoint + (drift || 0);
      setCountdown({
        depositClose: Math.max(0, statusInfo.lastJoinPoint - approxCurrent),
        purchaseEnd: Math.max(0, statusInfo.lastBuyingPoint - approxCurrent),
      });
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [statusInfo]);

  // Tag statusInfo with fetch time for countdown drift calc
  const origSetStatusInfo = setStatusInfo;
  const setStatusInfoWithTime = (info: typeof statusInfo) => {
    if (info) (info as any)._fetchedAt = Math.floor(Date.now() / 1000);
    origSetStatusInfo(info);
  };

  // Init custom deposit amounts when wallets or step changes
  useEffect(() => {
    if (step !== 'deposit' || selectedWallets.length === 0) return;
    const isSOL = vaultInfo?.quoteSymbol === 'SOL';
    const amounts: Record<string, number> = {};
    for (const w of selectedWallets) {
      if (customDepositAmounts[w.id] !== undefined) {
        amounts[w.id] = customDepositAmounts[w.id];
      } else {
        const bal = isSOL ? w.solBalance : (w.usdcBalance || 0);
        amounts[w.id] = isSOL ? Math.floor(Math.max(0, bal - 0.02) * 10000) / 10000 : Math.floor(bal * 10000) / 10000;
      }
    }
    setCustomDepositAmounts(amounts);
  }, [step, selectedWallets.length, vaultInfo?.quoteSymbol]);

  const stepIndex = STEPS.findIndex(s => s.id === step);

  // Format countdown helper
  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return 'now';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const totalDeposit = Object.values(customDepositAmounts).reduce((sum, v) => sum + (v || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Alpha Vault Launch</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          Distribute tokens via Meteora Alpha Vault — anti-bundle, fair distribution
        </p>
      </div>

      {/* Mainnet Warning */}
      {network === 'mainnet-beta' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-400">Mainnet Mode</p>
            <p className="text-xs text-orange-400/70 mt-0.5">Real funds will be used. Double-check parameters.</p>
          </div>
        </div>
      )}

      {/* Step Progress */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isDone = i < stepIndex;
            // Allow clicking any step once a vault exists (or any past step)
            const canNavigate = !isActive && (isDone || !!vaultInfo);
            return (
              <div key={s.id} className="flex items-center flex-1">
                <button
                  onClick={() => canNavigate && setStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full
                    ${isActive ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' :
                      isDone ? 'bg-emerald-600/10 text-emerald-400 cursor-pointer hover:bg-emerald-600/20' :
                      canNavigate ? 'text-[#a1a1aa] cursor-pointer hover:bg-[#27272a]/50' :
                      'text-[#52525b]'}`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-[#3f3f46] shrink-0 mx-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-400/60 hover:text-red-400 mt-1">Dismiss</button>
          </div>
        </div>
      )}

      {/* ═══════════ STEP 1: CONFIG ═══════════ */}
      {step === 'config' && (
        <div className="space-y-4">
          {/* Resume existing vault */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#a1a1aa]">Resume Existing Vault</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={resumeVaultAddress}
                onChange={e => setResumeVaultAddress(e.target.value)}
                placeholder="Vault address to resume..."
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
              />
              <button
                onClick={() => handleResumeVault()}
                disabled={resuming || !resumeVaultAddress}
                className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Resume
              </button>
            </div>
          </div>

          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-5">
            <h3 className="text-lg font-semibold text-white">Vault Configuration</h3>

            {/* Pool Address */}
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Pool Address</label>
              <input
                type="text"
                value={poolAddress}
                onChange={e => setPoolAddress(e.target.value)}
                placeholder="DAMM v2 pool address (must have hasAlphaVault=true)"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
              />
              <p className="text-xs text-[#52525b] mt-1">The pool must have been created with hasAlphaVault enabled</p>
            </div>

            {/* Max Buying Cap */}
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Max Buying Cap ({quoteSymbol})</label>
              <input
                type="number"
                value={maxBuyingCap}
                onChange={e => setMaxBuyingCap(Number(e.target.value))}
                min={1}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
              />
              <p className="text-xs text-[#52525b] mt-1">Total amount the vault can spend to buy tokens from the pool</p>
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Lock Duration (s)</label>
                <input
                  type="number"
                  value={lockDuration}
                  onChange={e => setLockDuration(Number(e.target.value))}
                  min={0}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
                />
                <p className="text-xs text-[#52525b] mt-1">After pool activates, before vesting</p>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Vesting Duration (s)</label>
                <input
                  type="number"
                  value={vestingDuration}
                  onChange={e => setVestingDuration(Number(e.target.value))}
                  min={1}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
                />
                <p className="text-xs text-[#52525b] mt-1">10s = near-instant claim</p>
              </div>
            </div>

            {/* Wallet Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-[#a1a1aa] font-medium">
                  Wallets ({selectedWalletIds.size}/{wallets.length} selected)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedWalletIds(new Set(wallets.map(w => w.id)))}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >All</button>
                  <button
                    onClick={() => setSelectedWalletIds(new Set())}
                    className="text-xs text-[#71717a] hover:text-white"
                  >None</button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto bg-[#09090b] border border-[#27272a] rounded-lg p-2 space-y-1">
                {wallets.map(w => (
                  <label key={w.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#18181b] rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedWalletIds.has(w.id)}
                      onChange={e => {
                        const next = new Set(selectedWalletIds);
                        e.target.checked ? next.add(w.id) : next.delete(w.id);
                        setSelectedWalletIds(next);
                      }}
                      className="accent-purple-500"
                    />
                    <span className="text-xs text-white font-mono">{truncateKey(w.publicKey)}</span>
                    <span className="text-xs text-[#52525b]">{w.label}</span>
                    <span className="text-xs text-[#71717a] ml-auto">{(quoteSymbol === 'SOL' ? w.solBalance : w.usdcBalance)?.toFixed(4)} {quoteSymbol}</span>
                  </label>
                ))}
                {wallets.length === 0 && (
                  <p className="text-xs text-[#52525b] text-center py-2">No wallets. Generate wallets first.</p>
                )}
              </div>
            </div>

            {/* Summary */}
            {selectedWalletIds.size > 0 && (
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Wallets</span>
                  <span className="text-white font-medium">{selectedWalletIds.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Deposit per wallet</span>
                  <span className="text-white font-medium">{depositPerWallet.toFixed(4)} {quoteSymbol}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Total vault cap</span>
                  <span className="text-purple-400 font-medium">{maxBuyingCap.toLocaleString()} {quoteSymbol}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setStep('create')}
            disabled={!poolAddress || selectedWalletIds.size === 0}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Next: Create Vault <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════════ STEP 2: CREATE VAULT ═══════════ */}
      {step === 'create' && (
        <div className="space-y-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Create Alpha Vault</h3>
            <p className="text-sm text-[#a1a1aa]">
              This creates a Pro-rata Permissionless vault on the DAMM v2 pool.
              Anyone can deposit, tokens distributed proportionally.
            </p>

            <div className="bg-[#09090b] rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#71717a]">Pool</span>
                <span className="text-white font-mono">{truncateKey(poolAddress)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Max Buying Cap</span>
                <span className="text-white">{maxBuyingCap.toLocaleString()} {quoteSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Lock</span>
                <span className="text-white">{lockDuration}s after activation</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Vesting</span>
                <span className="text-white">{vestingDuration}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Wallets</span>
                <span className="text-white">{selectedWalletIds.size}</span>
              </div>
            </div>

            {vaultInfo && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Vault Created
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#a1a1aa]">Address:</span>
                  <span className="text-white font-mono">{truncateKey(vaultInfo.vaultAddress)}</span>
                  <button onClick={() => copyToClipboard(vaultInfo.vaultAddress, 'vault')}>
                    {copiedField === 'vault' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#71717a]" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {!vaultInfo ? (
            <button
              onClick={handleCreateVault}
              disabled={creating}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Vault...</> : <>Create Vault <Zap className="w-4 h-4" /></>}
            </button>
          ) : (
            <button
              onClick={() => setStep('escrows')}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Next: Whitelist Wallets <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══════════ STEP 2b: CREATE ESCROWS ═══════════ */}
      {step === 'escrows' && (
        <div className="space-y-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Whitelist Wallets</h3>
            <p className="text-sm text-[#a1a1aa]">
              Creates escrow accounts for each selected wallet. Only whitelisted wallets can deposit into the vault.
              Escrows are created in batches of 10.
            </p>

            <div className="bg-[#09090b] rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#71717a]">Wallets to whitelist</span>
                <span className="text-white">{selectedWalletIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Max deposit per wallet</span>
                <span className="text-white">{depositPerWallet.toFixed(4)} {vaultInfo?.quoteSymbol || quoteSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Batches</span>
                <span className="text-white">{Math.ceil(selectedWalletIds.size / 10)}</span>
              </div>
            </div>

            {(escrowsCreated > 0 || escrowsFailed > 0) && (
              <div className={`${escrowsFailed === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-yellow-500/10 border-yellow-500/30'} border rounded-lg p-4 space-y-1`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {escrowsFailed === 0
                    ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">All escrows created</span></>
                    : <><AlertTriangle className="w-4 h-4 text-yellow-400" /><span className="text-yellow-400">{escrowsCreated} created, {escrowsFailed} failed</span></>}
                </div>
              </div>
            )}
          </div>

          {escrowsCreated === 0 ? (
            <button
              onClick={handleCreateEscrows}
              disabled={creatingEscrows}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {creatingEscrows
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Escrows...</>
                : <>Whitelist {selectedWalletIds.size} Wallets <Wallet className="w-4 h-4" /></>}
            </button>
          ) : (
            <button
              onClick={() => setStep('deposit')}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Next: Fund & Deposit <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══════════ STEP 3: DEPOSIT ═══════════ */}
      {step === 'deposit' && (
        <div className="space-y-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Deposit into Vault</h3>
                <p className="text-sm text-[#a1a1aa] mt-0.5">
                  {vaultInfo?.quoteSymbol === 'SOL'
                    ? 'Each wallet deposits SOL (keeps 0.02 for fees). Edit amounts below.'
                    : 'Each wallet deposits USDC. Edit amounts below.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshAllBalances}
                  disabled={refreshingBalances}
                  className="flex items-center gap-1.5 text-xs text-[#a1a1aa] hover:text-white bg-[#27272a] hover:bg-[#3f3f46] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh all balances"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingBalances ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                {countdown.depositClose > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-[#71717a]">Deposit closes in</p>
                    <p className="text-sm font-mono text-yellow-400">{formatCountdown(countdown.depositClose)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Wallet table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#71717a] text-xs border-b border-[#27272a]">
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2 pr-2">Wallet</th>
                    <th className="text-left py-2 pr-2">Label</th>
                    <th className="text-right py-2 pr-2">Balance</th>
                    <th className="text-right py-2 pr-2">Deposit</th>
                    <th className="text-center py-2 w-8">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWallets.map((w, i) => {
                    const isSOL = vaultInfo?.quoteSymbol === 'SOL';
                    const bal = isSOL ? w.solBalance : (w.usdcBalance || 0);
                    const depositAmt = customDepositAmounts[w.id] || 0;
                    const result = depositResults.find(r => r.walletId === w.id);
                    return (
                      <tr key={w.id} className="border-b border-[#27272a]/50 hover:bg-[#09090b]">
                        <td className="py-2 pr-2 text-[#52525b]">{i + 1}</td>
                        <td className="py-2 pr-2 font-mono text-white text-xs">{truncateKey(w.publicKey)}</td>
                        <td className="py-2 pr-2 text-[#71717a] text-xs">{w.label || '-'}</td>
                        <td className="py-2 pr-2 text-right text-[#a1a1aa]">{bal.toFixed(4)}</td>
                        <td className="py-2 pr-2 text-right">
                          {!depositing ? (
                            <input
                              type="number"
                              value={depositAmt}
                              onChange={e => setCustomDepositAmounts(prev => ({ ...prev, [w.id]: Number(e.target.value) }))}
                              min={0}
                              max={isSOL ? Math.max(0, bal - 0.02) : bal}
                              step={0.01}
                              className="w-24 bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-white text-xs text-right focus:ring-1 focus:ring-purple-500/50 outline-none"
                            />
                          ) : (
                            <span className="text-white text-xs">{depositAmt.toFixed(4)}</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {result?.status === 'pending' && <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />}
                            {result?.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {result?.status === 'error' && (
                              <span title={result.error}><XCircle className="w-3.5 h-3.5 text-red-400" /></span>
                            )}
                            {(!result || result.status === 'error') && !depositing && (
                              <button
                                onClick={() => handleRetrySingleDeposit(w)}
                                className="text-purple-400 hover:text-purple-300 p-0.5 rounded hover:bg-purple-500/10"
                                title={result?.status === 'error' ? 'Retry deposit' : 'Deposit this wallet'}
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!result && depositing && <span className="text-[#3f3f46]">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary row */}
            <div className="flex items-center justify-between bg-purple-500/5 border border-purple-500/20 rounded-lg px-4 py-3">
              <div className="flex gap-4 text-sm">
                <span className="text-[#a1a1aa]">Wallets: <span className="text-white font-medium">{selectedWallets.length}</span></span>
                <span className="text-[#a1a1aa]">Total: <span className="text-purple-400 font-medium">{totalDeposit.toFixed(4)} {vaultInfo?.quoteSymbol || quoteSymbol}</span></span>
              </div>
              <button
                onClick={() => {
                  const isSOL = vaultInfo?.quoteSymbol === 'SOL';
                  const amounts: Record<string, number> = {};
                  for (const w of selectedWallets) {
                    const bal = isSOL ? w.solBalance : (w.usdcBalance || 0);
                    amounts[w.id] = isSOL ? Math.floor(Math.max(0, bal - 0.02) * 10000) / 10000 : Math.floor(bal * 10000) / 10000;
                  }
                  setCustomDepositAmounts(amounts);
                }}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                Reset to max
              </button>
            </div>

            {/* Progress bar */}
            {depositing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Depositing {depositProgress.current}/{depositProgress.total}...
                </div>
                <div className="w-full bg-[#27272a] rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${(depositProgress.current / depositProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleFundAndDeposit}
            disabled={depositing || !vaultInfo || totalDeposit <= 0}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {depositing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Depositing...</>
              : <>Deposit {totalDeposit.toFixed(4)} {vaultInfo?.quoteSymbol || quoteSymbol} <Send className="w-4 h-4" /></>}
          </button>

          {depositResults.length > 0 && !depositing && (
            <button
              onClick={() => setStep('fill')}
              className="w-full bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Next: Fill Vault <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══════════ STEP 4: FILL VAULT ═══════════ */}
      {step === 'fill' && (
        <div className="space-y-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Fill Vault (Crank)</h3>
                <p className="text-sm text-[#a1a1aa] mt-0.5">
                  Executes the swap — the vault uses deposited {vaultInfo?.quoteSymbol || quoteSymbol} to buy tokens from the pool.
                </p>
              </div>
              <button onClick={() => handleCheckStatus()} className="text-[#71717a] hover:text-white p-2 rounded-lg hover:bg-[#27272a] transition-colors" title="Refresh status">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Timeline / Status panel */}
            <div className="bg-[#09090b] rounded-lg p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#71717a]">Vault State</span>
                <span className={`font-semibold px-2.5 py-0.5 rounded-full text-xs ${
                  vaultState === 'PURCHASING' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                  vaultState === 'DEPOSITING' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' :
                  vaultState === 'LOCKING' || vaultState === 'VESTING' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                  'bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46]'
                }`}>
                  {vaultState}
                </span>
              </div>
              {vaultInfo && (
                <div className="flex justify-between">
                  <span className="text-[#71717a]">Vault</span>
                  <span className="text-white font-mono text-xs">{truncateKey(vaultInfo.vaultAddress)}</span>
                </div>
              )}

              {/* Live countdown timers */}
              {vaultState === 'DEPOSITING' && countdown.depositClose > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[#71717a]">Deposit closes in</span>
                  <span className="font-mono text-yellow-400 font-semibold tabular-nums">{formatCountdown(countdown.depositClose)}</span>
                </div>
              )}
              {(vaultState === 'DEPOSITING' || vaultState === 'PURCHASING') && countdown.purchaseEnd > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[#71717a]">{vaultState === 'PURCHASING' ? 'Purchase window closes in' : 'Purchase starts in'}</span>
                  <span className={`font-mono font-semibold tabular-nums ${vaultState === 'PURCHASING' ? 'text-emerald-400' : 'text-[#a1a1aa]'}`}>
                    {vaultState === 'PURCHASING' ? formatCountdown(countdown.purchaseEnd) : formatCountdown(countdown.depositClose)}
                  </span>
                </div>
              )}

              {/* Progress bar for deposit close countdown */}
              {statusInfo && vaultState === 'DEPOSITING' && countdown.depositClose > 0 && (
                <div className="pt-1">
                  <div className="w-full bg-[#27272a] rounded-full h-1.5">
                    <div
                      className="bg-yellow-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.max(0, 100 - (countdown.depositClose / Math.max(1, statusInfo.lastJoinPoint - statusInfo.firstJoinPoint)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#52525b] mt-1">Deposit window progress</p>
                </div>
              )}

              {/* Progress bar for purchase window */}
              {statusInfo && vaultState === 'PURCHASING' && countdown.purchaseEnd > 0 && (
                <div className="pt-1">
                  <div className="w-full bg-[#27272a] rounded-full h-1.5">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.max(0, 100 - (countdown.purchaseEnd / Math.max(1, statusInfo.lastBuyingPoint - statusInfo.lastJoinPoint)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#52525b] mt-1">Purchase window progress</p>
                </div>
              )}
            </div>

            {/* State-specific messages */}
            {statusInfo && vaultState !== 'PURCHASING' && !fillResult && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-yellow-400/80 space-y-1">
                    <p>Fill can only execute during <span className="font-semibold text-yellow-400">PURCHASING</span> state.</p>
                    {vaultState === 'DEPOSITING' && countdown.depositClose > 0 && (
                      <p>Waiting for deposit window to close... PURCHASING starts after.</p>
                    )}
                    {vaultState === 'PREPARING' && statusInfo.firstJoinPoint > statusInfo.currentPoint && (
                      <p>Depositing starts in <span className="font-semibold text-yellow-400">{formatCountdown(countdown.depositClose)}</span>.</p>
                    )}
                    {(vaultState === 'LOCKING' || vaultState === 'VESTING') && (
                      <p>Purchase window has ended. Proceed to <span className="font-semibold text-yellow-400">Claim</span>.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {vaultState === 'PURCHASING' && !fillResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-2">
                <Zap className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-400 space-y-0.5">
                  <p className="font-medium">Vault is in PURCHASING state — ready to fill!</p>
                  {countdown.purchaseEnd > 0 && (
                    <p className="text-emerald-400/70">Window closes in {formatCountdown(countdown.purchaseEnd)}</p>
                  )}
                </div>
              </div>
            )}

            {fillResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Vault Filled
                </div>
                <div className="text-xs text-[#a1a1aa]">
                  Tokens bought: <span className="text-white">{(Number(fillResult.boughtToken) / 10 ** tokenDecimals).toLocaleString(undefined, { maximumFractionDigits: tokenDecimals })}</span>
                </div>
                <div className="text-xs text-[#a1a1aa]">
                  {vaultInfo?.quoteSymbol || quoteSymbol} spent: <span className="text-white">{(Number(fillResult.swappedAmount) / 10 ** (vaultInfo?.quoteSymbol === 'SOL' ? 9 : 6)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleFillVault}
            disabled={filling}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {filling ? <><Loader2 className="w-4 h-4 animate-spin" /> Filling...</> : <>Fill Vault <Zap className="w-4 h-4" /></>}
          </button>

          {fillResult && (
            <button
              onClick={() => setStep('claim')}
              className="w-full bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Next: Claim Tokens <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══════════ STEP 5: CLAIM ═══════════ */}
      {step === 'claim' && (
        <div className="space-y-4">
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Claim Tokens</h3>
            <p className="text-sm text-[#a1a1aa]">
              Each wallet claims their proportional share of tokens from the vault.
              Available after the vesting period starts.
            </p>

            {/* Progress */}
            {claiming && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Claiming {claimProgress.current}/{claimProgress.total}...
                </div>
                <div className="w-full bg-[#27272a] rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${(claimProgress.current / claimProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Results */}
            {claimResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto bg-[#09090b] rounded-lg p-2 space-y-1">
                {claimResults.map(r => (
                  <div key={r.walletId} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    {r.status === 'pending' && <Loader2 className="w-3 h-3 text-[#52525b] animate-spin" />}
                    {r.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    {r.status === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
                    <span className="text-white font-mono">{truncateKey(r.wallet)}</span>
                    <span className="text-[#52525b]">{r.label}</span>
                    {r.claimed && <span className="ml-auto text-emerald-400">{r.claimed} tokens</span>}
                    {r.error && <span className="ml-auto text-red-400 text-[10px] max-w-40 truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}

            {claimResults.length > 0 && !claiming && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Distribution Complete
                </div>
                <p className="text-xs text-[#a1a1aa] mt-1">
                  {claimResults.filter(r => r.status === 'success').length}/{claimResults.length} wallets claimed successfully
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleClaimAll}
            disabled={claiming}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {claiming ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</> : <>Claim All Tokens <Gift className="w-4 h-4" /></>}
          </button>
        </div>
      )}

      {/* Vault Info Footer */}
      {vaultInfo && (
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[#52525b]">Vault:</span>
              <span className="text-white font-mono">{truncateKey(vaultInfo.vaultAddress)}</span>
              <button onClick={() => copyToClipboard(vaultInfo.vaultAddress, 'vault-footer')}>
                {copiedField === 'vault-footer' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#52525b] hover:text-white" />}
              </button>
              <a
                href={`https://solscan.io/account/${vaultInfo.vaultAddress}${clusterParam}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#52525b] hover:text-white"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-3">
              {countdown.purchaseEnd > 0 && (
                <span className="text-yellow-400 font-mono tabular-nums">{formatCountdown(countdown.purchaseEnd)}</span>
              )}
              <button onClick={() => handleCheckStatus()} className="text-[#52525b] hover:text-white flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {normalizeState(vaultState)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
