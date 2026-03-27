'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Lock,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Info,
  Layers,
  Vault,
} from 'lucide-react';
import type { PoolResult } from '@/types';

interface PoolCreatorV1Props {
  network: 'devnet' | 'mainnet-beta';
  tokenMint: string;
  creatorKey: string;
  onPoolCreated: (result: PoolResult) => void;
}

type Step = 1 | 2 | 3;

export default function PoolCreatorV1({
  network,
  tokenMint: initialTokenMint,
  creatorKey,
  onPoolCreated,
}: PoolCreatorV1Props) {
  const [privateKey, setPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !privateKey) setPrivateKey(creatorKey); }, [creatorKey]);
  const [tokenMint] = useState(initialTokenMint || '');

  // Step tracking
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Step 1: Create V1 Pool
  const [tokenAmount, setTokenAmount] = useState('2000000');
  const [usdcAmount, setUsdcAmount] = useState('200');
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState('');
  const [poolSignature, setPoolSignature] = useState('');

  // Step 2: Lock LP
  const [lockLoading, setLockLoading] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockSignature, setLockSignature] = useState('');

  // Step 3: Create Vault
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultAddress, setVaultAddress] = useState('');
  const [vaultSignature, setVaultSignature] = useState('');

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const calculatedPrice = useMemo(() => {
    const tAmt = parseFloat(tokenAmount);
    const qAmt = parseFloat(usdcAmount);
    if (tAmt > 0 && qAmt > 0) return qAmt / tAmt;
    return 0;
  }, [tokenAmount, usdcAmount]);

  // Step 1: Create V1 Pool
  const handleCreatePool = async () => {
    setPoolError(null);
    if (!privateKey.trim()) { setPoolError('Private key required'); return; }
    if (!tokenMint.trim()) { setPoolError('Token mint required'); return; }
    if (calculatedPrice <= 0) { setPoolError('Enter valid amounts'); return; }

    setPoolLoading(true);
    try {
      const res = await fetch('/api/pool/create-v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          tokenMint: tokenMint.trim(),
          tokenAmount: parseFloat(tokenAmount),
          usdcAmount: parseFloat(usdcAmount),
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create V1 pool');

      setPoolAddress(data.data.poolAddress);
      setPoolSignature(data.data.signature);
      onPoolCreated(data.data);
      setCurrentStep(2);
    } catch (err) {
      setPoolError((err as Error).message);
    } finally {
      setPoolLoading(false);
    }
  };

  // Step 2: Lock LP
  const handleLockLP = async () => {
    setLockError(null);
    if (!poolAddress) { setLockError('Pool address required'); return; }

    setLockLoading(true);
    try {
      const res = await fetch('/api/pool/v1-lock-lp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          poolAddress,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to lock LP');

      setLockSignature(data.data.signature);
      setCurrentStep(3);
    } catch (err) {
      setLockError((err as Error).message);
    } finally {
      setLockLoading(false);
    }
  };

  // Step 3: Create Vault
  const handleCreateVault = async () => {
    setVaultError(null);
    if (!poolAddress) { setVaultError('Pool address required'); return; }

    setVaultLoading(true);
    try {
      const res = await fetch('/api/pool/v1-create-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          poolAddress,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create vault');

      setVaultAddress(data.data.vaultAddress);
      setVaultSignature(data.data.signature);
    } catch (err) {
      setVaultError((err as Error).message);
    } finally {
      setVaultLoading(false);
    }
  };

  const stepDone = (s: Step) => {
    if (s === 1) return !!poolAddress;
    if (s === 2) return !!lockSignature;
    if (s === 3) return !!vaultAddress;
    return false;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Pool V1 + Stake2Earn</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          Create a minimal DAMM v1 pool, lock LP, and enable Stake2Earn vault
        </p>
      </div>

      {/* Mainnet Warning */}
      {network === 'mainnet-beta' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-400">Mainnet Mode Active</p>
            <p className="text-xs text-orange-400/70 mt-0.5">
              Real USDC will be used. This creates a small V1 pool for staking narrative only.
            </p>
          </div>
        </div>
      )}

      {/* Step Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              stepDone(s as Step)
                ? 'bg-green-500/20 border-green-500 text-green-400'
                : currentStep === s
                  ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                  : 'bg-[#18181b] border-[#27272a] text-[#52525b]'
            }`}>
              {stepDone(s as Step) ? <Check className="w-4 h-4" /> : s}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${
              currentStep === s ? 'text-white' : 'text-[#52525b]'
            }`}>
              {s === 1 ? 'Create Pool' : s === 2 ? 'Lock LP' : 'Stake Vault'}
            </span>
            {s < 3 && <div className={`flex-1 h-px ${stepDone(s as Step) ? 'bg-green-500/50' : 'bg-[#27272a]'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Create V1 Pool */}
      <div className={`bg-[#18181b] rounded-xl border ${currentStep === 1 ? 'border-purple-500/30' : stepDone(1) ? 'border-green-500/30' : 'border-[#27272a]'} p-6 transition-all`}>
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-[#a1a1aa]" />
          <h3 className="text-lg font-semibold text-white">Step 1 — Create DAMM V1 Pool</h3>
          {stepDone(1) && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto" />}
        </div>

        <div className="space-y-4">
          {/* Token Mint (read-only from global) */}
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Token Mint</label>
            <input
              type="text"
              value={tokenMint}
              readOnly
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-[#71717a] font-mono text-sm outline-none cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Token Amount</label>
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="e.g. 2000000"
                min={0}
                step="any"
                disabled={stepDone(1)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
              />
              <p className="text-xs text-[#52525b] mt-1">~0.2% of 1B supply</p>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">USDC Amount</label>
              <input
                type="number"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                placeholder="e.g. 200"
                min={0}
                step="any"
                disabled={stepDone(1)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
              />
              <p className="text-xs text-[#52525b] mt-1">Minimal USDC for staking prop</p>
            </div>
          </div>

          {/* Auto Price */}
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-400">Calculated Price</span>
            </div>
            {calculatedPrice > 0 ? (
              <p className="text-sm font-bold text-white">
                1 Token = {calculatedPrice.toFixed(12).replace(/\.?0+$/, '')} USDC
              </p>
            ) : (
              <p className="text-sm text-[#52525b]">Enter amounts to calculate price</p>
            )}
          </div>

          {poolError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{poolError}</p>
            </div>
          )}

          {!stepDone(1) ? (
            <button
              type="button"
              onClick={handleCreatePool}
              disabled={poolLoading || !privateKey || !tokenMint || calculatedPrice <= 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
            >
              {poolLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating V1 Pool...
                </>
              ) : (
                <>
                  <Layers className="w-5 h-5" />
                  Create V1 Pool
                </>
              )}
            </button>
          ) : (
            <div className="bg-[#09090b] rounded-lg p-3 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">Pool Address</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">{poolAddress}</span>
                <button onClick={() => copyToClipboard(poolAddress, 'pool')} className="text-[#71717a] hover:text-white transition-colors shrink-0">
                  {copiedField === 'pool' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <a
                href={`https://solscan.io/account/${poolAddress}${clusterParam}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-400 hover:underline mt-1 inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> View on Solscan
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Lock LP */}
      <div className={`bg-[#18181b] rounded-xl border ${currentStep === 2 ? 'border-purple-500/30' : stepDone(2) ? 'border-green-500/30' : 'border-[#27272a]'} p-6 transition-all ${!stepDone(1) && currentStep !== 2 ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-[#a1a1aa]" />
          <h3 className="text-lg font-semibold text-white">Step 2 — Lock LP Tokens</h3>
          {stepDone(2) && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto" />}
        </div>

        <p className="text-sm text-[#71717a] mb-4">
          Permanently lock all LP tokens in the pool. Required before creating a Stake2Earn vault.
        </p>

        {lockError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{lockError}</p>
          </div>
        )}

        {!stepDone(2) ? (
          <button
            type="button"
            onClick={handleLockLP}
            disabled={lockLoading || !stepDone(1)}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {lockLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Locking LP...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Lock LP Tokens
              </>
            )}
          </button>
        ) : (
          <div className="bg-[#09090b] rounded-lg p-3 border border-[#27272a]">
            <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">Lock Transaction</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-white break-all">{lockSignature}</span>
              <button onClick={() => copyToClipboard(lockSignature, 'lock')} className="text-[#71717a] hover:text-white transition-colors shrink-0">
                {copiedField === 'lock' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Create Stake2Earn Vault */}
      <div className={`bg-[#18181b] rounded-xl border ${currentStep === 3 ? 'border-purple-500/30' : stepDone(3) ? 'border-green-500/30' : 'border-[#27272a]'} p-6 transition-all ${!stepDone(2) && currentStep !== 3 ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Vault className="w-5 h-5 text-[#a1a1aa]" />
          <h3 className="text-lg font-semibold text-white">Step 3 — Create Stake2Earn Vault</h3>
          {stepDone(3) && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto" />}
        </div>

        <p className="text-sm text-[#71717a] mb-4">
          Create an M3M3 Stake2Earn vault for the V1 pool. Users can stake tokens and earn fees.
        </p>

        {vaultError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{vaultError}</p>
          </div>
        )}

        {!stepDone(3) ? (
          <button
            type="button"
            onClick={handleCreateVault}
            disabled={vaultLoading || !stepDone(2)}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {vaultLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Vault...
              </>
            ) : (
              <>
                <Vault className="w-5 h-5" />
                Create Stake2Earn Vault
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-[#09090b] rounded-lg p-3 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">Vault Address</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">{vaultAddress}</span>
                <button onClick={() => copyToClipboard(vaultAddress, 'vault')} className="text-[#71717a] hover:text-white transition-colors shrink-0">
                  {copiedField === 'vault' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">All Done!</p>
                <p className="text-xs text-green-400/70 mt-0.5">
                  V1 Pool created, LP locked, and Stake2Earn vault is live. Users can now stake tokens on Meteora.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
