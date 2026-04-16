'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import TokenCreator from '@/components/TokenCreator';
import WalletManager from '@/components/WalletManager';
import PoolCreator from '@/components/PoolCreator';
import PoolCreatorV1 from '@/components/PoolCreatorV1';
import PoolManager from '@/components/PoolManager';
import SellStrategy from '@/components/SellStrategy';
import RevokeAuthorities from '@/components/RevokeAuthorities';
import MarketMaking from '@/components/MarketMaking';
import AlphaVaultLauncher from '@/components/AlphaVaultLauncher';
import EditMetadata from '@/components/EditMetadata';
import StealthFund from '@/components/StealthFund';
import type { AppModule, WalletEntry, TransactionLog, TokenResult, PoolResult } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { ChevronDown, Coins, Droplets, Loader2, RefreshCw } from 'lucide-react';
import { ToastProvider } from '@/components/Toast';

const LS_KEY_PRIVATE = 'lf_creator_key';
const LS_KEY_MINT = 'lf_token_mint';
const LS_KEY_POOL = 'lf_pool_address';
const LS_KEY_NETWORK = 'lf_network';

export default function Home() {
  const [activeModule, setActiveModule] = useState<AppModule>('dashboard');
  const [network, setNetwork] = useState<'devnet' | 'mainnet-beta'>('mainnet-beta');
  const [hydrated, setHydrated] = useState(false);

  // Global state
  const [creatorKey, setCreatorKey] = useState('');
  const [tokenMint, setTokenMint] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [poolAddress, setPoolAddress] = useState('');
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  // Discovery state
  const [discoveredTokens, setDiscoveredTokens] = useState<Array<{
    mint: string;
    balance: number;
    decimals: number;
    isToken2022: boolean;
    name: string;
    symbol: string;
    image: string;
  }>>([]);
  const [discoveredPools, setDiscoveredPools] = useState<Array<{
    poolAddress: string;
    tokenBSymbol: string;
    tokenAVaultBalance: number;
    tokenBVaultBalance: number;
  }>>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingPools, setLoadingPools] = useState(false);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [poolDropdownOpen, setPoolDropdownOpen] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);
  const poolDropdownRef = useRef<HTMLDivElement>(null);

  // Server-side encrypt/decrypt helpers
  const serverEncrypt = async (plaintext: string): Promise<string> => {
    const res = await fetch('/api/crypto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'encrypt', data: plaintext }),
    });
    const data = await res.json();
    return data.success ? data.data : '';
  };

  const serverDecrypt = async (ciphertext: string): Promise<string> => {
    const res = await fetch('/api/crypto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decrypt', data: ciphertext }),
    });
    const data = await res.json();
    return data.success ? data.data : '';
  };

  // Restore from localStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const encKey = localStorage.getItem(LS_KEY_PRIVATE);
        if (encKey) {
          const key = await serverDecrypt(encKey);
          if (key) setCreatorKey(key);
        }
        const savedMint = localStorage.getItem(LS_KEY_MINT);
        if (savedMint) setTokenMint(savedMint);
        const savedPool = localStorage.getItem(LS_KEY_POOL);
        if (savedPool) setPoolAddress(savedPool);
        const savedNetwork = localStorage.getItem(LS_KEY_NETWORK);
        if (savedNetwork === 'devnet' || savedNetwork === 'mainnet-beta') setNetwork(savedNetwork);
      } catch { /* localStorage not available */ }
      setHydrated(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist creatorKey (encrypted via server)
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      if (creatorKey) {
        const encrypted = await serverEncrypt(creatorKey);
        localStorage.setItem(LS_KEY_PRIVATE, encrypted);
      } else {
        localStorage.removeItem(LS_KEY_PRIVATE);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorKey, hydrated]);

  // Persist tokenMint, poolAddress, network
  useEffect(() => {
    if (!hydrated) return;
    if (tokenMint) localStorage.setItem(LS_KEY_MINT, tokenMint);
    else localStorage.removeItem(LS_KEY_MINT);
  }, [tokenMint, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (poolAddress) localStorage.setItem(LS_KEY_POOL, poolAddress);
    else localStorage.removeItem(LS_KEY_POOL);
  }, [poolAddress, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_KEY_NETWORK, network);
  }, [network, hydrated]);

  // Derive public key from private key (client-side)
  const getPublicKeyFromPrivate = useCallback(async (privKey: string): Promise<string | null> => {
    try {
      const bs58 = (await import('bs58')).default;
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58.decode(privKey));
      return kp.publicKey.toBase58();
    } catch {
      return null;
    }
  }, []);

  // Discover tokens in wallet
  const handleDiscoverTokens = useCallback(async () => {
    if (!creatorKey) return;
    setLoadingTokens(true);
    try {
      const pubKey = await getPublicKeyFromPrivate(creatorKey);
      if (!pubKey) throw new Error('Invalid private key');

      const res = await fetch('/api/wallet-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubKey, network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDiscoveredTokens(data.data);
    } catch {
      setDiscoveredTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }, [creatorKey, network, getPublicKeyFromPrivate]);

  // Discover pools for token mint
  const handleDiscoverPools = useCallback(async () => {
    if (!tokenMint) return;
    setLoadingPools(true);
    try {
      const res = await fetch('/api/pool/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenMint, network }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDiscoveredPools(data.data);
    } catch {
      setDiscoveredPools([]);
    } finally {
      setLoadingPools(false);
    }
  }, [tokenMint, network]);

  // Auto-discover tokens when creatorKey changes
  useEffect(() => {
    if (hydrated && creatorKey && creatorKey.length > 30) {
      handleDiscoverTokens();
    }
  }, [creatorKey, hydrated, handleDiscoverTokens]);

  // Auto-discover pools when tokenMint changes
  useEffect(() => {
    if (hydrated && tokenMint && tokenMint.length > 30) {
      handleDiscoverPools();
    }
  }, [tokenMint, hydrated, handleDiscoverPools]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setTokenDropdownOpen(false);
      }
      if (poolDropdownRef.current && !poolDropdownRef.current.contains(e.target as Node)) {
        setPoolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addLog = useCallback((log: Omit<TransactionLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      ...log,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    }, ...prev].slice(0, 100));
  }, []);

  const handleTokenCreated = useCallback((result: TokenResult) => {
    setTokenMint(result.mintAddress);
    addLog({
      type: 'mint',
      signature: result.signature,
      status: 'success',
      message: `Token created: ${result.mintAddress.slice(0, 8)}...`,
    });
  }, [addLog]);

  const handlePoolCreated = useCallback((result: PoolResult) => {
    setPoolAddress(result.poolAddress);
    addLog({
      type: 'pool',
      signature: result.signature,
      status: 'success',
      message: `Pool created: ${result.poolAddress.slice(0, 8)}...`,
    });
  }, [addLog]);

  // Quick claim fees from any page
  const handleQuickClaimFees = useCallback(async (): Promise<string | null> => {
    if (!poolAddress || !creatorKey) return 'No pool or key set';
    try {
      // 1. Get public key
      const bs58 = (await import('bs58')).default;
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(bs58.decode(creatorKey));

      // 2. Fetch positions
      const posRes = await fetch('/api/pool/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress,
          userPublicKey: kp.publicKey.toBase58(),
          network,
        }),
      });
      const posData = await posRes.json();
      if (!posData.success) return posData.error;
      const positions = posData.data;
      if (!positions || positions.length === 0) return 'No positions found';

      // 3. Claim fees from all positions
      let claimed = 0;
      for (const pos of positions) {
        if (pos.feeAPending === '0' && pos.feeBPending === '0') continue;
        const claimRes = await fetch('/api/pool/claim-fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privateKey: creatorKey,
            poolAddress,
            positionAddress: pos.positionAddress,
            positionNftAccount: pos.positionNftAccount,
            network,
          }),
        });
        const claimData = await claimRes.json();
        if (claimData.success) {
          claimed++;
          addLog({
            type: 'pool',
            signature: claimData.data.signature,
            status: 'success',
            message: `Claimed fees from position ${pos.positionAddress.slice(0, 8)}...`,
          });
        }
      }
      return claimed > 0 ? `Claimed from ${claimed} position${claimed > 1 ? 's' : ''}` : 'No fees to claim';
    } catch (err) {
      return (err as Error).message;
    }
  }, [poolAddress, creatorKey, network, addLog]);

  const totalSolBalance = wallets.reduce((sum, w) => sum + w.solBalance, 0);
  const totalTokenBalance = wallets.reduce((sum, w) => sum + w.tokenBalance, 0);

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <Dashboard
            network={network}
            tokenMint={tokenMint}
            tokenDecimals={tokenDecimals}
            walletCount={wallets.length}
            totalTokenBalance={totalTokenBalance}
            totalSolBalance={totalSolBalance}
            poolAddress={poolAddress}
            logs={logs}
            onNavigate={setActiveModule}
          />
        );
      case 'token':
        return (
          <TokenCreator
            network={network}
            onTokenCreated={handleTokenCreated}
            creatorKey={creatorKey}
          />
        );
      case 'edit-metadata':
        return (
          <EditMetadata
            privateKey={creatorKey}
            tokenMint={tokenMint}
            network={network}
            onAddLog={addLog}
          />
        );
      case 'stealth-fund':
        return (
          <StealthFund
            wallets={wallets}
            network={network}
            onAddLog={addLog}
            onRefreshBalances={async () => {
              // Trigger wallet balance refresh
              const res = await fetch('/api/wallets/balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallets, network, tokenMint }),
              });
              const data = await res.json();
              if (data.success && data.data) {
                setWallets(prev => prev.map(w => {
                  const updated = data.data.find((u: { id: string }) => u.id === w.id);
                  return updated ? { ...w, ...updated } : w;
                }));
              }
            }}
          />
        );
      case 'wallets':
        return (
          <WalletManager
            network={network}
            wallets={wallets}
            onWalletsChange={setWallets}
            tokenMint={tokenMint}
            tokenDecimals={tokenDecimals}
            onAddLog={addLog}
            creatorKey={creatorKey}
          />
        );
      case 'pool':
        return (
          <PoolCreator
            network={network}
            tokenMint={tokenMint}
            onPoolCreated={handlePoolCreated}
            creatorKey={creatorKey}
          />
        );
      case 'pool-v1':
        return (
          <PoolCreatorV1
            network={network}
            tokenMint={tokenMint}
            creatorKey={creatorKey}
            onPoolCreated={handlePoolCreated}
          />
        );
      case 'pool-manage':
        return (
          <PoolManager
            network={network}
            poolAddress={poolAddress}
            onAddLog={addLog}
            creatorKey={creatorKey}
          />
        );
      case 'sell':
        return (
          <SellStrategy
            network={network}
            wallets={wallets}
            tokenMint={tokenMint}
            tokenDecimals={tokenDecimals}
            poolAddress={poolAddress}
            onAddLog={addLog}
            onWalletsChange={setWallets}
            creatorKey={creatorKey}
          />
        );
      case 'revoke':
        return (
          <RevokeAuthorities
            network={network}
            tokenMint={tokenMint}
            creatorKey={creatorKey}
          />
        );
      case 'market-making':
        return (
          <MarketMaking
            network={network}
            wallets={wallets}
            tokenMint={tokenMint}
            tokenDecimals={tokenDecimals}
            poolAddress={poolAddress}
            onAddLog={addLog}
            onWalletsChange={setWallets}
            creatorKey={creatorKey}
          />
        );
      case 'alpha-vault':
        return (
          <AlphaVaultLauncher
            network={network}
            wallets={wallets}
            tokenMint={tokenMint}
            tokenDecimals={tokenDecimals}
            poolAddress={poolAddress}
            creatorKey={creatorKey}
            onAddLog={addLog}
            onWalletsChange={setWallets}
          />
        );
    }
  };

  const truncKey = (k: string) => k.length > 10 ? `${k.slice(0, 6)}...${k.slice(-4)}` : k;

  return (
    <ToastProvider>
    <div className="flex min-h-screen">
      <Sidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        network={network}
        onNetworkChange={setNetwork}
        onClaimFees={handleQuickClaimFees}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl mx-auto space-y-6">
          {/* Global Config Bar */}
          <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Private Key */}
              <div>
                <label className="block text-xs text-[#71717a] font-medium mb-1.5 uppercase tracking-wider">
                  Creator / Authority Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={creatorKey}
                    onChange={(e) => setCreatorKey(e.target.value)}
                    placeholder="Stored encrypted locally..."
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-8"
                  />
                  {creatorKey && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-2 h-2 rounded-full bg-green-500" title="Key stored (encrypted)" />
                    </div>
                  )}
                </div>
              </div>

              {/* Token Mint with custom dropdown */}
              <div ref={tokenDropdownRef}>
                <label className="block text-xs text-[#71717a] font-medium mb-1.5 uppercase tracking-wider">
                  Token Mint
                </label>
                <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder={loadingTokens ? 'Discovering tokens...' : 'Select or paste mint address...'}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-9"
                  />
                  {loadingTokens ? (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    </div>
                  ) : discoveredTokens.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#27272a] transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 text-[#71717a] transition-transform ${tokenDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : null}

                  {/* Token Dropdown */}
                  {tokenDropdownOpen && discoveredTokens.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0f0f12] border border-[#27272a] rounded-xl shadow-2xl shadow-black/50 overflow-hidden max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-[#27272a]">
                        <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">
                          {discoveredTokens.length} token{discoveredTokens.length !== 1 ? 's' : ''} in wallet
                        </span>
                      </div>
                      {discoveredTokens.map((t) => {
                        const isSelected = tokenMint === t.mint;
                        return (
                          <button
                            key={t.mint}
                            type="button"
                            onClick={() => {
                              setTokenMint(t.mint);
                              setTokenDecimals(t.decimals);
                              setTokenDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a1a2e] transition-colors text-left ${isSelected ? 'bg-purple-500/10 border-l-2 border-purple-500' : 'border-l-2 border-transparent'}`}
                          >
                            {/* Token Image */}
                            <div className="w-8 h-8 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {t.image ? (
                                <img
                                  src={t.image}
                                  alt={t.symbol}
                                  className="w-full h-full rounded-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                                />
                              ) : null}
                              <Coins className={`w-4 h-4 text-[#52525b] ${t.image ? 'hidden' : ''}`} />
                            </div>

                            {/* Token Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white truncate">
                                  {t.symbol || t.name || `${t.mint.slice(0, 6)}...`}
                                </span>
                                {t.name && t.name !== t.symbol && (
                                  <span className="text-xs text-[#71717a] truncate max-w-[100px]">
                                    {t.name}
                                  </span>
                                )}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${t.isToken2022 ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                  {t.isToken2022 ? 'T22' : 'SPL'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#52525b] font-mono truncate">
                                {t.mint.slice(0, 16)}...{t.mint.slice(-6)}
                              </div>
                            </div>

                            {/* Balance */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-medium text-white">
                                {t.balance >= 1_000_000
                                  ? `${(t.balance / 1_000_000).toFixed(1)}M`
                                  : t.balance >= 1_000
                                    ? `${(t.balance / 1_000).toFixed(1)}K`
                                    : t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </div>
                              <div className="text-[10px] text-[#52525b]">balance</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDiscoverTokens}
                  disabled={loadingTokens || !creatorKey}
                  className="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2 hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  title="Refresh tokens"
                >
                  <RefreshCw className={`w-4 h-4 text-[#71717a] ${loadingTokens ? 'animate-spin' : ''}`} />
                </button>
                </div>
                {discoveredTokens.length > 0 && !tokenDropdownOpen && (
                  <p className="text-[10px] text-purple-400 mt-1 cursor-pointer" onClick={() => setTokenDropdownOpen(true)}>
                    {discoveredTokens.length} token{discoveredTokens.length !== 1 ? 's' : ''} found — click to browse
                  </p>
                )}
              </div>

              {/* Pool Address with custom dropdown */}
              <div ref={poolDropdownRef}>
                <label className="block text-xs text-[#71717a] font-medium mb-1.5 uppercase tracking-wider">
                  Pool Address
                </label>
                <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={poolAddress}
                    onChange={(e) => setPoolAddress(e.target.value)}
                    placeholder={loadingPools ? 'Finding pools...' : 'Select or paste pool address...'}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-9"
                  />
                  {loadingPools ? (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    </div>
                  ) : discoveredPools.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPoolDropdownOpen(!poolDropdownOpen)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#27272a] transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 text-[#71717a] transition-transform ${poolDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : null}

                  {/* Pool Dropdown */}
                  {poolDropdownOpen && discoveredPools.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0f0f12] border border-[#27272a] rounded-xl shadow-2xl shadow-black/50 overflow-hidden max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-[#27272a]">
                        <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">
                          {discoveredPools.length} pool{discoveredPools.length !== 1 ? 's' : ''} found
                        </span>
                      </div>
                      {discoveredPools.map((p) => {
                        const isSelected = poolAddress === p.poolAddress;
                        return (
                          <button
                            key={p.poolAddress}
                            type="button"
                            onClick={() => {
                              setPoolAddress(p.poolAddress);
                              setPoolDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a1a2e] transition-colors text-left ${isSelected ? 'bg-purple-500/10 border-l-2 border-purple-500' : 'border-l-2 border-transparent'}`}
                          >
                            {/* Pool Icon */}
                            <div className="w-8 h-8 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0">
                              <Droplets className="w-4 h-4 text-blue-400" />
                            </div>

                            {/* Pool Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white">
                                  Token / {p.tokenBSymbol}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-300">
                                  DAMM v2
                                </span>
                              </div>
                              <div className="text-[11px] text-[#52525b] font-mono truncate">
                                {p.poolAddress.slice(0, 12)}...{p.poolAddress.slice(-6)}
                              </div>
                            </div>

                            {/* Vault Balance */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-medium text-white">
                                {p.tokenBVaultBalance >= 1000
                                  ? `${(p.tokenBVaultBalance / 1000).toFixed(1)}K`
                                  : p.tokenBVaultBalance.toFixed(2)} {p.tokenBSymbol}
                              </div>
                              <div className="text-[10px] text-[#52525b]">liquidity</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDiscoverPools}
                  disabled={loadingPools || !tokenMint}
                  className="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2 hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  title="Refresh pools"
                >
                  <RefreshCw className={`w-4 h-4 text-[#71717a] ${loadingPools ? 'animate-spin' : ''}`} />
                </button>
                </div>
                {discoveredPools.length > 0 && !poolDropdownOpen && (
                  <p className="text-[10px] text-purple-400 mt-1 cursor-pointer" onClick={() => setPoolDropdownOpen(true)}>
                    {discoveredPools.length} pool{discoveredPools.length !== 1 ? 's' : ''} found — click to browse
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Module Content */}
          {renderModule()}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
