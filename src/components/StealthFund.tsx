'use client';

import { useState } from 'react';
import { Loader2, EyeOff, Zap, CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { WalletEntry, TransactionLog } from '@/types';

interface StealthFundProps {
  wallets: WalletEntry[];
  network: 'devnet' | 'mainnet-beta';
  onAddLog: (log: Omit<TransactionLog, 'id' | 'timestamp'>) => void;
  onRefreshBalances: () => Promise<void>;
}

export default function StealthFund({ wallets, network, onAddLog, onRefreshBalances }: StealthFundProps) {
  const [funderKey, setFunderKey] = useState('');
  const [amountMin, setAmountMin] = useState('6');
  const [amountMax, setAmountMax] = useState('10');
  const [delayMin, setDelayMin] = useState('2');
  const [delayMax, setDelayMax] = useState('5');
  const [swapToUsdc, setSwapToUsdc] = useState(true);
  const [solToKeep, setSolToKeep] = useState('0.05');
  const [slippageBps, setSlippageBps] = useState('100');
  const [recovering, setRecovering] = useState(false);
  const [recoveryTarget, setRecoveryTarget] = useState('');
  const [singleTarget, setSingleTarget] = useState('');
  const [singleAmount, setSingleAmount] = useState('15');
  const [singleRunning, setSingleRunning] = useState(false);
  const [singleResult, setSingleResult] = useState<{ success: boolean; hops?: { hop: number; method: string; signature: string }[]; error?: string } | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<{ totalRecoveredSol: number; recovered: { wallet: string; amount: number; signature?: string; error?: string }[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    totalSol: number;
    paths?: { finalWallet: string; amount: number; error?: string; hops: { hop: number; method: string; signature: string }[] }[];
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selectedWallets.size === wallets.length) {
      setSelectedWallets(new Set());
    } else {
      setSelectedWallets(new Set(wallets.map(w => w.id)));
    }
  };

  const toggleWallet = (id: string) => {
    const next = new Set(selectedWallets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedWallets(next);
  };

  const createLog = (action: string, status: 'success' | 'error' | 'pending', message: string, txSig?: string): Omit<TransactionLog, 'id' | 'timestamp'> => ({
    type: 'fund',
    signature: txSig || '',
    status,
    message,
  });

  const selectedList = wallets.filter(w => selectedWallets.has(w.id));
  const totalSolNeeded = selectedList.length * ((parseFloat(amountMin) + parseFloat(amountMax)) / 2 + 0.007);

  const handleStealthFund = async () => {
    if (!funderKey || selectedList.length === 0) {
      setError('Enter funder private key and select wallets');
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(`Starting stealth fund for ${selectedList.length} wallets (5 hops each)...`);

    try {
      const min = parseFloat(amountMin) || 6;
      const max = parseFloat(amountMax) || 10;

      // Generate random amounts per wallet
      const amounts: Record<string, number> = {};
      for (const w of selectedList) {
        amounts[w.publicKey] = Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000); // 60min

      const res = await fetch('/api/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          funderPrivateKey: funderKey,
          wallets: selectedList.map(w => ({ id: w.id, publicKey: w.publicKey, privateKey: w.privateKey })),
          amounts,
          network,
          delayMinMs: (parseFloat(delayMin) || 2) * 1000,
          delayMaxMs: (parseFloat(delayMax) || 5) * 1000,
          swapToUsdc,
          solToKeep: parseFloat(solToKeep) || 0.05,
          slippageBps: parseInt(slippageBps) || 100,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const summary = data.data.summary;
      setResult({
        success: summary.success,
        failed: summary.failed,
        totalSol: summary.totalSolDistributed,
        paths: data.data.results,
      });
      setProgress(`Done: ${summary.success} wallets funded, ${summary.failed} failed`);
      onAddLog(createLog('stealth-fund', 'success',
        `Stealth funded ${summary.success}/${summary.total} wallets with ${summary.totalSolDistributed.toFixed(2)} SOL (5 hops each)`));
      await onRefreshBalances();

    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setProgress(`Failed: ${msg}`);
      onAddLog(createLog('stealth-fund', 'error', `Stealth fund failed: ${msg}`));
    } finally {
      setRunning(false);
    }
  };

  const handleSwapOnly = async () => {
    // Swap SOL → USDC for wallets that have SOL but no USDC
    const walletsWithSol = wallets.filter(w => selectedWallets.has(w.id) && w.solBalance > (parseFloat(solToKeep) || 0.05) + 0.01);
    if (walletsWithSol.length === 0) {
      setError('No selected wallets with enough SOL to swap');
      return;
    }

    setRunning(true);
    setError(null);
    setProgress(`Swapping SOL → USDC for ${walletsWithSol.length} wallets...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000);

      const res = await fetch('/api/stealth-fund/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          wallets: walletsWithSol.map(w => ({ publicKey: w.publicKey, privateKey: w.privateKey })),
          network,
          solToKeep: parseFloat(solToKeep) || 0.05,
          slippageBps: parseInt(slippageBps) || 100,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setProgress(`Swap done: ${data.data.success}/${walletsWithSol.length} swapped`);
      onAddLog(createLog('stealth-swap', 'success',
        `Swapped SOL→USDC for ${data.data.success} wallets, total ${data.data.totalUsdc.toFixed(2)} USDC`));
      await onRefreshBalances();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setProgress(`Swap failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!funderKey || !result?.paths) return;

    // Get wallets that failed
    const failedWalletKeys = result.paths.filter(p => p.error).map(p => p.finalWallet);
    const failedWallets = wallets.filter(w => failedWalletKeys.includes(w.publicKey));

    if (failedWallets.length === 0) {
      setError('No failed wallets to retry');
      return;
    }

    setRunning(true);
    setError(null);
    setProgress(`Recovery + Retry: ${failedWallets.length} failed wallets...`);

    try {
      // Step 1: recover SOL from intermediate wallets of failed paths
      const recoverRes = await fetch('/api/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recover: true, recoveryTarget: funderKey ? undefined : undefined, network }),
      });
      // Recovery goes to funder, we just need to clear the files

      // Step 2: retry the failed wallets
      const min = parseFloat(amountMin) || 6;
      const max = parseFloat(amountMax) || 10;
      const amounts: Record<string, number> = {};
      for (const w of failedWallets) {
        amounts[w.publicKey] = Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

      const res = await fetch('/api/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          funderPrivateKey: funderKey,
          wallets: failedWallets.map(w => ({ id: w.id, publicKey: w.publicKey, privateKey: w.privateKey })),
          amounts,
          network,
          delayMinMs: (parseFloat(delayMin) || 2) * 1000,
          delayMaxMs: (parseFloat(delayMax) || 5) * 1000,
          swapToUsdc,
          solToKeep: parseFloat(solToKeep) || 0.05,
          slippageBps: parseInt(slippageBps) || 100,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const summary = data.data.summary;

      // Merge results: keep successful from before, add new retry results
      const previousSuccess = result.paths.filter(p => !p.error);
      const retryPaths = data.data.results;
      setResult({
        success: previousSuccess.length + summary.success,
        failed: summary.failed,
        totalSol: result.totalSol + summary.totalSolDistributed,
        paths: [...previousSuccess, ...retryPaths],
      });
      setProgress(`Retry done: ${summary.success} more funded, ${summary.failed} still failed`);
      onAddLog(createLog('stealth-fund', 'success',
        `Retry: ${summary.success}/${failedWallets.length} wallets funded`));
      await onRefreshBalances();

    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setProgress(`Retry failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const handleSingleFund = async () => {
    if (!funderKey || !singleTarget) {
      setError('Enter funder key and target wallet address');
      return;
    }
    setSingleRunning(true);
    setError(null);
    setSingleResult(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000);

      const res = await fetch('/api/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          funderPrivateKey: funderKey,
          wallets: [{ id: 'single', publicKey: singleTarget, privateKey: '' }],
          amounts: { [singleTarget]: parseFloat(singleAmount) || 15 },
          network,
          delayMinMs: (parseFloat(delayMin) || 2) * 1000,
          delayMaxMs: (parseFloat(delayMax) || 5) * 1000,
          swapToUsdc: false,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const path = data.data.results[0];
      if (path.error) throw new Error(path.error);

      setSingleResult({ success: true, hops: path.hops });
      onAddLog(createLog('stealth-fund-single', 'success',
        `Stealth funded ${singleTarget.slice(0, 8)}... with ${singleAmount} SOL (5 hops)`));
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setSingleResult({ success: false, error: msg });
    } finally {
      setSingleRunning(false);
    }
  };

  const handleRecovery = async () => {
    if (!recoveryTarget) {
      setError('Enter wallet address to recover SOL to');
      return;
    }
    setRecovering(true);
    setError(null);
    setRecoveryResult(null);
    try {
      const res = await fetch('/api/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recover: true, recoveryTarget, network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRecoveryResult(data.data);
      if (data.data.totalRecoveredSol > 0) {
        onAddLog(createLog('stealth-recovery', 'success', `Recovered ${data.data.totalRecoveredSol.toFixed(6)} SOL from intermediate wallets`));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <EyeOff className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Stealth Fund</h3>
            <p className="text-xs text-[#71717a]">Multi-hop SOL distribution with WSOL obfuscation (5 hops)</p>
          </div>
        </div>

        <div className="bg-[#09090b] rounded-lg border border-[#1e1e21] p-4 mb-4">
          <p className="text-xs text-[#71717a] leading-relaxed">
            Each wallet receives SOL through 5 hops: <span className="text-violet-400">createAccount</span> →
            <span className="text-blue-400"> transfer</span> → <span className="text-blue-400">transfer</span> →
            <span className="text-blue-400"> transfer</span> → <span className="text-amber-400">WSOL wrap + closeAccount</span>.
            The final hop uses WSOL unwrap so the SOL arrives via closeAccount, not a direct transfer.
            Optionally swaps SOL → USDC via Jupiter, keeping a small amount of SOL for future tx fees.
          </p>
        </div>

        {/* Funder Key (external wallet, NOT the creator) */}
        <div className="mb-4">
          <label className="text-xs text-[#71717a] block mb-1">Funder Private Key (external wallet, not the creator)</label>
          <input
            type="password"
            value={funderKey}
            onChange={(e) => setFunderKey(e.target.value)}
            placeholder="Base58 or JSON array — separate wallet from creator"
            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all"
          />
        </div>

        {/* Config */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs text-[#71717a] block mb-1">Min SOL</label>
            <input
              type="number"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              min={0.1} step="0.5"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
            />
          </div>
          <div>
            <label className="text-xs text-[#71717a] block mb-1">Max SOL</label>
            <input
              type="number"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              min={0.1} step="0.5"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
            />
          </div>
          <div>
            <label className="text-xs text-[#71717a] block mb-1">Delay min (s)</label>
            <input
              type="number"
              value={delayMin}
              onChange={(e) => setDelayMin(e.target.value)}
              min={0.5} step="0.5"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
            />
          </div>
          <div>
            <label className="text-xs text-[#71717a] block mb-1">Delay max (s)</label>
            <input
              type="number"
              value={delayMax}
              onChange={(e) => setDelayMax(e.target.value)}
              min={1} step="0.5"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
            />
          </div>
        </div>

        {/* Swap to USDC */}
        <div className="mb-4 p-3 bg-[#09090b] rounded-lg border border-[#1e1e21]">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={swapToUsdc}
              onChange={(e) => setSwapToUsdc(e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-sm text-white">Swap SOL → USDC après réception</span>
            <span className="text-[10px] text-[#52525b] ml-auto">via Jupiter</span>
          </label>
          {swapToUsdc && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#71717a] block mb-1">SOL à garder (frais)</label>
                <input
                  type="number"
                  value={solToKeep}
                  onChange={(e) => setSolToKeep(e.target.value)}
                  min={0.01} step="0.01"
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717a] block mb-1">Slippage (%)</label>
                <input
                  type="number"
                  value={(parseInt(slippageBps) / 100).toString()}
                  onChange={(e) => setSlippageBps((parseFloat(e.target.value) * 100).toString())}
                  min={0.1} step="0.1"
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all text-right"
                />
              </div>
            </div>
          )}
        </div>

        {/* Wallet Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-[#71717a]">
              Select wallets ({selectedWallets.size}/{wallets.length})
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // Select wallets with 0 USDC balance (not yet funded)
                  const unfunded = wallets.filter(w => w.usdcBalance === 0);
                  setSelectedWallets(new Set(unfunded.map(w => w.id)));
                }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Select unfunded ({wallets.filter(w => w.usdcBalance === 0).length})
              </button>
              <button
                onClick={toggleAll}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {selectedWallets.size === wallets.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
          <div className="bg-[#09090b] border border-[#27272a] rounded-lg max-h-48 overflow-y-auto">
            {wallets.length === 0 ? (
              <p className="text-xs text-[#52525b] p-3 text-center">No wallets. Generate wallets first.</p>
            ) : (
              wallets.map((w, idx) => (
                <label
                  key={w.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[#18181b] cursor-pointer border-b border-[#1e1e21] last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedWallets.has(w.id)}
                    onChange={() => toggleWallet(w.id)}
                    className="accent-violet-500"
                  />
                  <span className="text-xs text-[#a1a1aa] font-mono">
                    Wallet {idx + 1}
                  </span>
                  <span className="text-xs text-[#52525b] font-mono">
                    {w.publicKey.slice(0, 8)}...{w.publicKey.slice(-4)}
                  </span>
                  <span className="text-xs text-[#71717a] ml-auto">
                    {w.solBalance.toFixed(3)} SOL
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Estimate */}
        <div className="bg-[#09090b] rounded-lg border border-[#1e1e21] p-3 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-[#71717a]">Wallets selected</span>
            <span className="text-white">{selectedList.length}</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-[#71717a]">Avg SOL per wallet</span>
            <span className="text-white">{((parseFloat(amountMin) + parseFloat(amountMax)) / 2).toFixed(2)} SOL</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-[#71717a]">Total SOL needed (+ fees)</span>
            <span className="text-violet-400 font-medium">{totalSolNeeded.toFixed(2)} SOL</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-[#71717a]">Hops per wallet</span>
            <span className="text-white">{swapToUsdc ? '6 (3 transfers + WSOL trick + swap USDC)' : '5 (3 transfers + WSOL trick)'}</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-[#71717a]">Est. time</span>
            <span className="text-white">~{Math.round(selectedList.length * ((parseFloat(delayMin) + parseFloat(delayMax)) / 2 * 5 + 10) / 60)} min</span>
          </div>
        </div>

        {/* Launch Button */}
        <div className="flex gap-3">
          <button
            onClick={handleStealthFund}
            disabled={running || selectedList.length === 0 || !funderKey}
            className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-all flex items-center justify-center gap-2"
          >
            {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {running ? 'Stealth funding...' : `Stealth Fund ${selectedList.length} Wallets`}
          </button>
          <button
            onClick={handleSwapOnly}
            disabled={running || selectedList.length === 0}
            className="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-sm"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>$</span>}
            Swap USDC
          </button>
        </div>

        {/* Progress */}
        {progress && (
          <p className={`text-xs mt-3 px-1 ${progress.includes('Failed') ? 'text-red-400' : progress.includes('Done') ? 'text-green-400' : 'text-violet-400'}`}>
            {progress}
          </p>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4">
            <div className="flex items-center gap-4 p-3 bg-[#09090b] rounded-lg border border-[#1e1e21]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">{result.success} funded</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">{result.failed} failed</span>
                  <button
                    onClick={handleRetryFailed}
                    disabled={running}
                    className="ml-2 px-2 py-0.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors disabled:opacity-40"
                  >
                    {running ? 'Retrying...' : 'Retry failed'}
                  </button>
                </div>
              )}
              <span className="text-xs text-[#71717a] ml-auto">{result.totalSol.toFixed(2)} SOL distributed</span>
            </div>

            {result.paths && result.paths.length > 0 && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-xs text-[#71717a] hover:text-white mt-2 transition-colors"
              >
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showDetails ? 'Hide' : 'Show'} hop details
              </button>
            )}

            {showDetails && result.paths && (
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {result.paths.map((path, idx) => (
                  <div key={idx} className={`p-2 rounded-lg border text-xs ${path.error ? 'border-red-500/30 bg-red-500/5' : 'border-[#1e1e21] bg-[#09090b]'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#a1a1aa] font-mono">→ {path.finalWallet.slice(0, 12)}...</span>
                      <span className={path.error ? 'text-red-400' : 'text-green-400'}>
                        {path.error ? 'Failed' : `${path.amount.toFixed(3)} SOL`}
                      </span>
                    </div>
                    {path.error && <p className="text-red-400 text-[10px]">{path.error}</p>}
                    {!path.error && path.hops.map((hop, hIdx) => (
                      <div key={hIdx} className="flex items-center gap-2 text-[10px] text-[#52525b]">
                        <span className={`px-1 rounded ${
                          hop.method === 'createAccount' ? 'bg-violet-500/20 text-violet-400' :
                          hop.method === 'transfer' ? 'bg-blue-500/20 text-blue-400' :
                          hop.method === 'swap_sol_to_usdc' ? 'bg-green-500/20 text-green-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          Hop {hop.hop}
                        </span>
                        <span>{hop.method}</span>
                        <a
                          href={`https://solscan.io/tx/${hop.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-400 hover:underline ml-auto"
                        >
                          {hop.signature.slice(0, 8)}...
                        </a>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fund Single Wallet (dev wallet) */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Fund Single Wallet</h3>
            <p className="text-xs text-[#71717a]">Stealth fund a single wallet (e.g. dev wallet) via 5 hops</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="col-span-2">
            <label className="text-xs text-[#71717a] block mb-1">Target wallet (public key)</label>
            <input
              type="text"
              value={singleTarget}
              onChange={(e) => setSingleTarget(e.target.value)}
              placeholder="Public key to receive SOL"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-[#71717a] block mb-1">Amount (SOL)</label>
            <input
              type="number"
              value={singleAmount}
              onChange={(e) => setSingleAmount(e.target.value)}
              min={0.01} step="0.5"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-right"
            />
          </div>
        </div>

        <button
          onClick={handleSingleFund}
          disabled={singleRunning || !funderKey || !singleTarget}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-all flex items-center justify-center gap-2"
        >
          {singleRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          {singleRunning ? 'Funding...' : 'Stealth Fund Single Wallet'}
        </button>

        {singleResult && (
          <div className={`mt-3 p-3 rounded-lg border text-sm ${singleResult.success ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
            {singleResult.success ? (
              <>
                <p className="font-medium mb-1">Funded successfully via 5 hops</p>
                {singleResult.hops?.map((hop, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-[#52525b]">
                    <span className={`px-1 rounded ${
                      hop.method === 'transfer' ? 'bg-blue-500/20 text-blue-400' :
                      hop.method === 'swap_sol_to_usdc' ? 'bg-green-500/20 text-green-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>Hop {hop.hop}</span>
                    <span>{hop.method}</span>
                    <a href={`https://solscan.io/tx/${hop.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                      target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-auto">
                      {hop.signature.slice(0, 8)}...
                    </a>
                  </div>
                ))}
              </>
            ) : (
              <p>{singleResult.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Recovery Section */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Recovery</h3>
            <p className="text-xs text-[#71717a]">Recover SOL from failed stealth fund paths</p>
          </div>
        </div>

        <p className="text-xs text-[#71717a] mb-3">
          If a stealth fund failed mid-way, intermediate wallets may still hold SOL.
          This will drain all saved intermediate wallets and send SOL back to the target address.
        </p>

        <div className="mb-3">
          <label className="text-xs text-[#71717a] block mb-1">Recovery target (wallet to receive SOL)</label>
          <input
            type="text"
            value={recoveryTarget}
            onChange={(e) => setRecoveryTarget(e.target.value)}
            placeholder="Public key to send recovered SOL to"
            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
          />
        </div>

        <button
          onClick={handleRecovery}
          disabled={recovering || !recoveryTarget}
          className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-all flex items-center justify-center gap-2"
        >
          {recovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
          {recovering ? 'Recovering...' : 'Recover SOL from failed paths'}
        </button>

        {recoveryResult && (
          <div className="mt-3 p-3 bg-[#09090b] rounded-lg border border-[#1e1e21]">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#71717a]">Total recovered</span>
              <span className={recoveryResult.totalRecoveredSol > 0 ? 'text-green-400 font-medium' : 'text-[#71717a]'}>
                {recoveryResult.totalRecoveredSol.toFixed(6)} SOL
              </span>
            </div>
            {recoveryResult.recovered.filter(r => r.amount > 0).map((r, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-[#52525b]">
                <span className="font-mono">{r.wallet.slice(0, 12)}...</span>
                <span className="text-green-400">{r.amount.toFixed(6)} SOL</span>
              </div>
            ))}
            {recoveryResult.totalRecoveredSol === 0 && (
              <p className="text-xs text-[#52525b]">No SOL found on intermediate wallets (or no recovery files exist).</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
