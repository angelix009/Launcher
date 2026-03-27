'use client';

import { useState, useEffect } from 'react';
import {
  Settings2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  X,
  Droplets,
  DollarSign,
  Lock,
  Unlock,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ExternalLink,
} from 'lucide-react';
import type { TransactionLog } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface PoolManagerProps {
  network: 'devnet' | 'mainnet-beta';
  poolAddress: string;
  onAddLog: (log: TransactionLog) => void;
  creatorKey?: string;
}

interface PoolInfo {
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAVault: string;
  tokenBVault: string;
  tokenAVaultBalance: number;
  tokenBVaultBalance: number;
  tokenADecimals: number;
  tokenBDecimals: number;
  tokenASymbol: string;
  tokenBSymbol: string;
  sqrtPrice: string;
  collectFeeMode: number;
  activationType: number;
  tokenAFlag: number;
}

interface PositionInfo {
  positionAddress: string;
  positionNftAccount: string;
  liquidity: string;
  lockedLiquidity: string;
  feeAPending: string;
  feeBPending: string;
  rewardPendings: string[];
}

function truncateKey(key: string): string {
  if (!key || key.length < 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function PoolManager({
  network,
  poolAddress: initialPoolAddress,
  onAddLog,
  creatorKey = '',
}: PoolManagerProps) {
  const [poolAddressInput, setPoolAddressInput] = useState(initialPoolAddress || '');
  const [privateKey, setPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !privateKey) setPrivateKey(creatorKey); }, [creatorKey]);
  useEffect(() => { if (initialPoolAddress && !poolAddressInput) setPoolAddressInput(initialPoolAddress); }, [initialPoolAddress]);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'positions' | 'withdraw' | 'fees' | 'lock'>('fees');
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

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

  const cluster = network === 'devnet' ? '?cluster=devnet' : '';

  // Fetch pool info
  const handleFetchPoolInfo = async () => {
    if (!poolAddressInput.trim()) {
      setError('Enter a pool address');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoadingFor('info', true);

    try {
      const res = await fetch('/api/pool/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAddress: poolAddressInput.trim(), network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPoolInfo(data.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFor('info', false);
    }
  };

  // Fetch user positions
  const handleFetchPositions = async () => {
    if (!poolAddressInput.trim() || !privateKey.trim()) {
      setError('Enter pool address and your private key');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoadingFor('positions', true);

    try {
      // Derive public key from private key
      const bs58Module = await import('bs58');
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58Module.default.decode(privateKey.trim()));

      const res = await fetch('/api/pool/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: poolAddressInput.trim(),
          userPublicKey: kp.publicKey.toBase58(),
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPositions(data.data);
      if (data.data.length === 0) {
        setSuccess('No positions found for this wallet in this pool');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFor('positions', false);
    }
  };

  // Withdraw all liquidity from a position
  const handleWithdraw = async (pos: PositionInfo) => {
    if (!privateKey.trim()) {
      setError('Enter your private key');
      return;
    }
    setError(null);
    setSuccess(null);
    setConfirmWithdraw(null);
    setLoadingFor(`withdraw-${pos.positionAddress}`, true);

    try {
      const res = await fetch('/api/pool/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          poolAddress: poolAddressInput.trim(),
          positionAddress: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const result = data.data;
      setSuccess(
        `Withdrawn: ~${result.tokenAAmount.toLocaleString()} tokens + ~${result.tokenBAmount.toFixed(4)} ${poolInfo?.tokenBSymbol || 'SOL'}`
      );
      onAddLog(
        createLog(
          'pool',
          'success',
          `Withdrew liquidity from position ${truncateKey(pos.positionAddress)}`,
          result.signature
        )
      );

      // Refresh positions
      await handleFetchPositions();
      await handleFetchPoolInfo();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('pool', 'error', `Withdraw failed: ${msg}`));
    } finally {
      setLoadingFor(`withdraw-${pos.positionAddress}`, false);
    }
  };

  // Claim fees from a position
  const handleClaimFees = async (pos: PositionInfo) => {
    if (!privateKey.trim()) {
      setError('Enter your private key');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoadingFor(`fees-${pos.positionAddress}`, true);

    try {
      const res = await fetch('/api/pool/claim-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          poolAddress: poolAddressInput.trim(),
          positionAddress: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setSuccess('Fees claimed successfully!');
      onAddLog(
        createLog(
          'pool',
          'success',
          `Claimed fees from position ${truncateKey(pos.positionAddress)}`,
          data.data.signature
        )
      );

      // Refresh
      await handleFetchPositions();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('pool', 'error', `Claim fees failed: ${msg}`));
    } finally {
      setLoadingFor(`fees-${pos.positionAddress}`, false);
    }
  };

  // Permanently lock a position
  const handleLock = async (pos: PositionInfo) => {
    if (!privateKey.trim()) {
      setError('Enter your private key');
      return;
    }
    setError(null);
    setSuccess(null);
    setConfirmLock(null);
    setLoadingFor(`lock-${pos.positionAddress}`, true);

    try {
      const res = await fetch('/api/pool/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          poolAddress: poolAddressInput.trim(),
          positionAddress: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          network,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setSuccess('Position permanently locked!');
      onAddLog(
        createLog(
          'pool',
          'success',
          `Permanently locked position ${truncateKey(pos.positionAddress)}`,
          data.data.signature
        )
      );

      await handleFetchPositions();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('pool', 'error', `Lock failed: ${msg}`));
    } finally {
      setLoadingFor(`lock-${pos.positionAddress}`, false);
    }
  };

  // Auto-load pool info + positions on mount when pool address and key are available
  useEffect(() => {
    if (autoLoaded) return;
    if (!poolAddressInput.trim() || !privateKey.trim()) return;
    setAutoLoaded(true);
    (async () => {
      // 1. Fetch pool info
      setLoadingFor('info', true);
      try {
        const res = await fetch('/api/pool/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolAddress: poolAddressInput.trim(), network }),
        });
        const data = await res.json();
        if (data.success) setPoolInfo(data.data);
      } catch {}
      setLoadingFor('info', false);

      // 2. Fetch positions
      setLoadingFor('positions', true);
      try {
        const bs58Module = await import('bs58');
        const { Keypair } = await import('@solana/web3.js');
        const kp = Keypair.fromSecretKey(bs58Module.default.decode(privateKey.trim()));
        const res = await fetch('/api/pool/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: poolAddressInput.trim(),
            userPublicKey: kp.publicKey.toBase58(),
            network,
          }),
        });
        const data = await res.json();
        if (data.success) setPositions(data.data);
      } catch {}
      setLoadingFor('positions', false);
    })();
  }, [poolAddressInput, privateKey, network, autoLoaded]);

  const tabs = [
    { id: 'info' as const, label: 'Pool Info', icon: Droplets },
    { id: 'positions' as const, label: 'Positions', icon: Eye },
    { id: 'fees' as const, label: 'Claim Fees', icon: DollarSign },
    { id: 'withdraw' as const, label: 'Withdraw', icon: ArrowDownToLine },
    { id: 'lock' as const, label: 'Lock', icon: Lock },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Pool Manager</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          View pool info, manage positions, claim fees, withdraw liquidity, and lock positions
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Configuration</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Pool Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={poolAddressInput}
                onChange={(e) => setPoolAddressInput(e.target.value)}
                placeholder="Meteora DAMM v2 pool address..."
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <button
                onClick={handleFetchPoolInfo}
                disabled={loading.info || !poolAddressInput.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                {loading.info ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Load
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Owner Private Key
            </label>
            <div className="relative">
              <input
                type={showPrivateKey ? 'text' : 'password'}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Private key for position operations..."
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition-colors"
              >
                {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-400">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-400/50 hover:text-green-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#18181b] rounded-xl border border-[#27272a] p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-purple-600 text-white'
                : 'text-[#a1a1aa] hover:bg-[#27272a] hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        {/* Pool Info Tab */}
        {activeTab === 'info' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Pool Information</h3>
            {!poolInfo ? (
              <div className="text-center py-12">
                <Droplets className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
                <p className="text-[#52525b] text-sm">
                  Enter a pool address and click Load to view pool details
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pool Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
                    <p className="text-xs text-[#71717a] mb-1">Token A ({poolInfo.tokenASymbol})</p>
                    <p className="text-lg font-bold text-white">
                      {poolInfo.tokenAVaultBalance.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
                    <p className="text-xs text-[#71717a] mb-1">Token B ({poolInfo.tokenBSymbol})</p>
                    <p className="text-lg font-bold text-white">
                      {poolInfo.tokenBVaultBalance.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
                    <p className="text-xs text-[#71717a] mb-1">Fee Mode</p>
                    <p className="text-lg font-bold text-white">
                      {poolInfo.collectFeeMode === 1 ? `${poolInfo.tokenBSymbol} Only` : 'Both'}
                    </p>
                  </div>
                  <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
                    <p className="text-xs text-[#71717a] mb-1">Activation</p>
                    <p className="text-lg font-bold text-white">
                      {poolInfo.activationType === 1 ? 'Timestamp' : 'Slot'}
                    </p>
                  </div>
                </div>

                {/* Addresses */}
                <div className="space-y-2">
                  {[
                    { label: 'Pool', value: poolInfo.poolAddress },
                    { label: 'Token A Mint', value: poolInfo.tokenAMint },
                    { label: 'Token B Mint', value: poolInfo.tokenBMint },
                    { label: 'Token A Vault', value: poolInfo.tokenAVault },
                    { label: 'Token B Vault', value: poolInfo.tokenBVault },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between bg-[#09090b] rounded-lg px-4 py-2.5 border border-[#27272a]">
                      <span className="text-xs text-[#71717a] font-medium">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-[#a1a1aa]">{truncateKey(value)}</span>
                        <button
                          onClick={() => copyToClipboard(value, label)}
                          className="text-[#52525b] hover:text-white transition-colors"
                        >
                          {copiedField === label ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={`https://solscan.io/account/${value}${cluster}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#52525b] hover:text-purple-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-[#52525b] mt-2">
                  Token A Program: {poolInfo.tokenAFlag ? 'Token 2022' : 'Token Program'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Positions Tab */}
        {activeTab === 'positions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Your Positions</h3>
              <button
                onClick={handleFetchPositions}
                disabled={loading.positions || !poolAddressInput.trim() || !privateKey.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
              >
                {loading.positions ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Fetch Positions
              </button>
            </div>

            {positions.length === 0 ? (
              <div className="text-center py-12">
                <Eye className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
                <p className="text-[#52525b] text-sm">
                  No positions loaded. Enter your private key and click Fetch Positions.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => (
                  <PositionCard
                    key={pos.positionAddress}
                    position={pos}
                    poolInfo={poolInfo}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                    cluster={cluster}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Claim Fees Tab */}
        {activeTab === 'fees' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Claim Position Fees</h3>
            <p className="text-sm text-[#71717a] mb-4">
              Claim accumulated trading fees from your positions.
            </p>

            {positions.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
                <p className="text-[#52525b] text-sm mb-3">
                  Load your positions first from the Positions tab.
                </p>
                <button
                  onClick={() => { setActiveTab('positions'); handleFetchPositions(); }}
                  disabled={!privateKey.trim() || !poolAddressInput.trim()}
                  className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Fetch Positions
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => {
                  const hasFees = pos.feeAPending !== '0' || pos.feeBPending !== '0';
                  const feeAFormatted = poolInfo
                    ? (Number(pos.feeAPending) / 10 ** poolInfo.tokenADecimals).toLocaleString(undefined, { maximumFractionDigits: 6 })
                    : pos.feeAPending;
                  const feeBFormatted = poolInfo
                    ? (Number(pos.feeBPending) / 10 ** poolInfo.tokenBDecimals).toLocaleString(undefined, { maximumFractionDigits: 6 })
                    : pos.feeBPending;
                  return (
                    <div key={pos.positionAddress} className="bg-[#09090b] rounded-lg border border-[#27272a] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-mono text-[#a1a1aa]">
                            Position: {truncateKey(pos.positionAddress)}
                          </p>
                          <div className="flex gap-4 mt-1">
                            <span className="text-xs text-[#71717a]">
                              Fee A: <span className="text-purple-400">{feeAFormatted}</span>
                            </span>
                            <span className="text-xs text-[#71717a]">
                              Fee B ({poolInfo?.tokenBSymbol || '?'}): <span className="text-green-400">{feeBFormatted}</span>
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleClaimFees(pos)}
                          disabled={loading[`fees-${pos.positionAddress}`] || !hasFees}
                          className="bg-green-600 hover:bg-green-500 disabled:bg-green-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {loading[`fees-${pos.positionAddress}`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <DollarSign className="w-4 h-4" />
                          )}
                          Claim Fees
                        </button>
                      </div>
                      {!hasFees && (
                        <p className="text-xs text-[#52525b]">No pending fees to claim.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Withdraw Tab */}
        {activeTab === 'withdraw' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Withdraw Liquidity</h3>
            <p className="text-sm text-[#71717a] mb-4">
              Remove all liquidity from a position and close it. This returns your tokens.
            </p>

            {positions.length === 0 ? (
              <div className="text-center py-12">
                <ArrowDownToLine className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
                <p className="text-[#52525b] text-sm mb-3">
                  Load your positions first from the Positions tab.
                </p>
                <button
                  onClick={() => { setActiveTab('positions'); handleFetchPositions(); }}
                  disabled={!privateKey.trim() || !poolAddressInput.trim()}
                  className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Fetch Positions
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => {
                  const hasLiquidity = pos.liquidity !== '0';
                  const isLocked = pos.lockedLiquidity !== '0';
                  return (
                    <div key={pos.positionAddress} className="bg-[#09090b] rounded-lg border border-[#27272a] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-mono text-[#a1a1aa]">
                            Position: {truncateKey(pos.positionAddress)}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-[#71717a]">
                              Unlocked: <span className="text-white">{pos.liquidity}</span>
                            </span>
                            {isLocked && (
                              <span className="text-xs text-green-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Locked: {pos.lockedLiquidity}
                              </span>
                            )}
                          </div>
                        </div>

                        {isLocked && !hasLiquidity ? (
                          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                            <ShieldCheck className="w-4 h-4 text-green-400" />
                            <span className="text-xs font-medium text-green-400">Fully Locked</span>
                          </div>
                        ) : confirmWithdraw === pos.positionAddress ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400 font-medium">Confirm?</span>
                            <button
                              onClick={() => handleWithdraw(pos)}
                              disabled={loading[`withdraw-${pos.positionAddress}`]}
                              className="bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1"
                            >
                              {loading[`withdraw-${pos.positionAddress}`] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Yes, Withdraw All'
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmWithdraw(null)}
                              className="bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmWithdraw(pos.positionAddress)}
                            disabled={!hasLiquidity}
                            className="bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                            Withdraw All
                          </button>
                        )}
                      </div>
                      {!hasLiquidity && !isLocked && (
                        <p className="text-xs text-[#52525b]">No liquidity in this position.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Lock Tab */}
        {activeTab === 'lock' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Lock Position</h3>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Permanent lock is irreversible. Your liquidity will be locked forever and can never
                be withdrawn. You will still be able to claim trading fees.
              </p>
            </div>

            {positions.length === 0 ? (
              <div className="text-center py-12">
                <Lock className="w-12 h-12 text-[#3f3f46] mx-auto mb-4" />
                <p className="text-[#52525b] text-sm mb-3">
                  Load your positions first from the Positions tab.
                </p>
                <button
                  onClick={() => { setActiveTab('positions'); handleFetchPositions(); }}
                  disabled={!privateKey.trim() || !poolAddressInput.trim()}
                  className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Fetch Positions
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => {
                  const hasLiquidity = pos.liquidity !== '0';
                  const isLocked = pos.lockedLiquidity !== '0';
                  const isFullyLocked = isLocked && !hasLiquidity;
                  return (
                    <div key={pos.positionAddress} className={`bg-[#09090b] rounded-lg border p-4 ${isFullyLocked ? 'border-green-500/30' : 'border-[#27272a]'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-mono text-[#a1a1aa]">
                            Position: {truncateKey(pos.positionAddress)}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-[#71717a]">
                              Unlocked: <span className="text-white">{pos.liquidity}</span>
                            </span>
                            {isLocked && (
                              <span className="text-xs text-green-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Locked: {pos.lockedLiquidity}
                              </span>
                            )}
                          </div>
                        </div>

                        {isFullyLocked ? (
                          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                            <ShieldCheck className="w-4 h-4 text-green-400" />
                            <span className="text-xs font-medium text-green-400">Fully Locked</span>
                          </div>
                        ) : confirmLock === pos.positionAddress ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400 font-medium">This is permanent!</span>
                            <button
                              onClick={() => handleLock(pos)}
                              disabled={loading[`lock-${pos.positionAddress}`]}
                              className="bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1"
                            >
                              {loading[`lock-${pos.positionAddress}`] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Yes, Lock Forever'
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmLock(null)}
                              className="bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmLock(pos.positionAddress)}
                            disabled={!hasLiquidity}
                            className="bg-red-600/80 hover:bg-red-500 disabled:bg-red-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            Permanent Lock
                          </button>
                        )}
                      </div>
                      {isFullyLocked && (
                        <p className="text-xs text-green-400/60">This position is permanently locked. You can still claim trading fees.</p>
                      )}
                      {!hasLiquidity && !isLocked && (
                        <p className="text-xs text-[#52525b]">No liquidity to lock.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component: Position Card
function PositionCard({
  position: pos,
  poolInfo,
  copiedField,
  onCopy,
  cluster,
}: {
  position: PositionInfo;
  poolInfo: PoolInfo | null;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  cluster: string;
}) {
  return (
    <div className="bg-[#09090b] rounded-lg border border-[#27272a] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#71717a] font-medium">Position</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-[#a1a1aa]">{truncateKey(pos.positionAddress)}</span>
          <button
            onClick={() => onCopy(pos.positionAddress, `pos-${pos.positionAddress}`)}
            className="text-[#52525b] hover:text-white transition-colors"
          >
            {copiedField === `pos-${pos.positionAddress}` ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <a
            href={`https://solscan.io/account/${pos.positionAddress}${cluster}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#52525b] hover:text-purple-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Lock Status Badge */}
      {pos.lockedLiquidity !== '0' && (
        <div className="flex items-center gap-2 mb-3 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
          <ShieldCheck className="w-4 h-4 text-green-400" />
          <span className="text-xs font-medium text-green-400">
            Permanently Locked
          </span>
          <span className="text-xs text-green-400/60 font-mono ml-auto">
            {pos.lockedLiquidity}
          </span>
        </div>
      )}
      {pos.lockedLiquidity === '0' && pos.liquidity !== '0' && (
        <div className="flex items-center gap-2 mb-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5">
          <Unlock className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-medium text-orange-400">
            Unlocked — Not Locked
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-[#71717a]">Unlocked</p>
          <p className="text-sm font-mono text-white">{pos.liquidity}</p>
        </div>
        <div>
          <p className="text-xs text-[#71717a]">Locked</p>
          <p className={`text-sm font-mono ${pos.lockedLiquidity !== '0' ? 'text-green-400' : 'text-[#52525b]'}`}>
            {pos.lockedLiquidity}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#71717a]">Pending Fee A</p>
          <p className="text-sm font-mono text-purple-400">
            {poolInfo
              ? (Number(pos.feeAPending) / 10 ** poolInfo.tokenADecimals).toLocaleString(undefined, { maximumFractionDigits: 6 })
              : pos.feeAPending}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#71717a]">Pending Fee B ({poolInfo?.tokenBSymbol || '?'})</p>
          <p className="text-sm font-mono text-green-400">
            {poolInfo
              ? (Number(pos.feeBPending) / 10 ** poolInfo.tokenBDecimals).toLocaleString(undefined, { maximumFractionDigits: 6 })
              : pos.feeBPending}
          </p>
        </div>
      </div>
    </div>
  );
}
