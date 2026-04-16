'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Droplets,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Info,
  Clock,
  Layers,
  Settings2,
} from 'lucide-react';
import type { PoolResult } from '@/types';

interface PoolCreatorProps {
  network: 'devnet' | 'mainnet-beta';
  tokenMint: string;
  onPoolCreated: (result: PoolResult) => void;
  creatorKey?: string;
}

export default function PoolCreator({
  network,
  tokenMint: initialTokenMint,
  onPoolCreated,
  creatorKey = '',
}: PoolCreatorProps) {
  const [privateKey, setPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !privateKey) setPrivateKey(creatorKey); }, [creatorKey]);

  // Fetch SOL price on mount
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      .then(r => r.json())
      .then(data => {
        if (data?.solana?.usd) setSolPriceUsd(data.solana.usd);
      })
      .catch(() => {});
  }, []);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [tokenMint, setTokenMint] = useState(initialTokenMint || '');
  const [quoteMint, setQuoteMint] = useState<'SOL' | 'USDC'>('USDC');

  // DAMM v2 parameters (defaults match reference tokens)
  const [maxBaseFeeBps, setMaxBaseFeeBps] = useState(400);
  const [minBaseFeeBps, setMinBaseFeeBps] = useState(400);
  const [feeSchedulerMode, setFeeSchedulerMode] = useState(0);
  const [numberOfPeriod, setNumberOfPeriod] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [useDynamicFee, setUseDynamicFee] = useState(true);
  const [collectFeeMode, setCollectFeeMode] = useState(1);
  const [hasAlphaVault, setHasAlphaVault] = useState(false);
  const [configAddress, setConfigAddress] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [manualInitPrice, setManualInitPrice] = useState('');
  const [targetMcapUsd, setTargetMcapUsd] = useState('');
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);

  // Alpha Vault distribution calculator
  const [poolPct, setPoolPct] = useState('0.013');       // % of supply remaining in pool after fill
  const [totalVaultDeposit, setTotalVaultDeposit] = useState('1'); // SOL/USDC to deposit into vault

  const [initialTokenAmount, setInitialTokenAmount] = useState('15000000');
  const [initialQuoteAmount, setInitialQuoteAmount] = useState('0.5');
  const [activationType, setActivationType] = useState<'timestamp' | 'slot'>(
    'timestamp'
  );
  const [activationDelay, setActivationDelay] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PoolResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const maxFeePercent = (maxBaseFeeBps / 10000) * 100;
  const minFeePercent = (minBaseFeeBps / 10000) * 100;

  // Auto-calculate price from amounts, or use manual price for single-sided pools
  const isSingleSided = !parseFloat(initialQuoteAmount);

  // Alpha Vault: auto-calc initPrice when hasAlphaVault + single-sided
  // Accounts for pool swap fees (maxBaseFeeBps) reducing effective deposit
  const vaultCalc = useMemo(() => {
    const supply = parseFloat(initialTokenAmount) || 0;
    const pct = parseFloat(poolPct) || 0;
    const deposit = parseFloat(totalVaultDeposit) || 0;
    const sol = solPriceUsd || 130;
    const feeRate = maxBaseFeeBps / 10000; // e.g. 400 bps = 0.04
    if (supply <= 0 || pct <= 0 || pct >= 100 || deposit <= 0) return null;

    // Effective deposit after fees
    const effectiveDeposit = deposit * (1 - feeRate);

    const initPrice = effectiveDeposit * (pct / 100) / (supply * (1 - pct / 100));
    const virtualB = supply * initPrice;
    const tokensRemaining = supply * virtualB / (virtualB + effectiveDeposit);
    const pctBought = (1 - tokensRemaining / supply) * 100;
    const mcAfterFillQuote = Math.pow(virtualB + effectiveDeposit, 2) / virtualB;
    const mcAfterFillUsd = quoteMint === 'SOL' ? mcAfterFillQuote * sol : mcAfterFillQuote;

    return { initPrice, pctBought, tokensRemaining, mcAfterFillUsd, mcAfterFillQuote, feeRate };
  }, [initialTokenAmount, poolPct, totalVaultDeposit, solPriceUsd, quoteMint, maxBaseFeeBps]);

  // Sync initPrice from vault calculator
  useEffect(() => {
    if (hasAlphaVault && isSingleSided && vaultCalc) {
      const priceStr = vaultCalc.initPrice.toFixed(18).replace(/0+$/, '').replace(/\.$/, '');
      setManualInitPrice(priceStr);
      setTargetMcapUsd(Math.round(vaultCalc.mcAfterFillUsd).toString());
    }
  }, [hasAlphaVault, isSingleSided, vaultCalc]);
  const calculatedPrice = useMemo(() => {
    const tokenAmt = parseFloat(initialTokenAmount);
    const quoteAmt = parseFloat(initialQuoteAmount);
    if (tokenAmt > 0 && quoteAmt > 0) {
      return quoteAmt / tokenAmt;
    }
    // Single-sided pool: use manual init price
    if (isSingleSided && manualInitPrice) {
      return parseFloat(manualInitPrice) || 0;
    }
    return 0;
  }, [initialTokenAmount, initialQuoteAmount, isSingleSided, manualInitPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }
    if (!tokenMint.trim()) {
      setError('Token mint address is required');
      return;
    }
    if (calculatedPrice <= 0) {
      setError(isSingleSided ? 'Enter an init price for single-sided pool' : 'Enter token amount and quote amount to calculate price');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/pool/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          tokenMint: tokenMint.trim(),
          quoteMint,
          initPrice: calculatedPrice,
          maxPrice: maxPrice ? parseFloat(maxPrice) : null,
          maxBaseFeeBps,
          minBaseFeeBps,
          feeSchedulerMode,
          numberOfPeriod,
          totalDuration,
          useDynamicFee,
          collectFeeMode,
          initialTokenAmount: parseFloat(initialTokenAmount) || 0,
          initialQuoteAmount: parseFloat(initialQuoteAmount) || 0,
          activationType,
          activationDelay,
          hasAlphaVault,
          network,
          ...(configAddress.trim() ? { configAddress: configAddress.trim() } : {}),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        const debugStr = data.debug ? ` [debug: ${JSON.stringify(data.debug)}]` : '';
        throw new Error((data.error || 'Failed to create pool') + debugStr);
      }

      setResult(data.data);
      onPoolCreated(data.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Create Pool</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          Create a Meteora DAMM v2 (Dynamic AMM) pool for your token
        </p>
      </div>

      {/* Mainnet Warning */}
      {network === 'mainnet-beta' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-400">
              Mainnet Mode Active
            </p>
            <p className="text-xs text-orange-400/70 mt-0.5">
              Real SOL will be used for pool creation. Double-check all
              parameters carefully.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Private Key */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Creator Wallet
          </h3>
          <div>
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Private Key (Base58)
            </label>
            <div className="relative">
              <input
                type={showPrivateKey ? 'text' : 'password'}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter your wallet private key..."
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition-colors"
              >
                {showPrivateKey ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#52525b] mt-1.5">
              This wallet must hold the tokens and SOL to fund the pool.
            </p>
          </div>
        </div>

        {/* Token Pair */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Token Pair</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Token Mint Address
              </label>
              <input
                type="text"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                placeholder="Your token's mint address..."
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Quote Token
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQuoteMint('SOL')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    quoteMint === 'SOL'
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  SOL
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteMint('USDC')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    quoteMint === 'USDC'
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  USDC
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Initial Liquidity + Auto Price */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-[#a1a1aa]" />
            <h3 className="text-lg font-semibold text-white">
              Initial Liquidity
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Token Amount
              </label>
              <input
                type="number"
                value={initialTokenAmount}
                onChange={(e) => setInitialTokenAmount(e.target.value)}
                placeholder="e.g. 50000000"
                min={0}
                step="any"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                Tokens to seed the pool with
              </p>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                {quoteMint} Amount
              </label>
              <input
                type="number"
                value={initialQuoteAmount}
                onChange={(e) => setInitialQuoteAmount(e.target.value)}
                placeholder="e.g. 0.5"
                min={0}
                step="any"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                {quoteMint} to pair with tokens (sets the price)
              </p>
            </div>
          </div>

          {/* Price Configuration */}
          {isSingleSided ? (
            <div className="mt-4 space-y-3">
              {hasAlphaVault ? (
                /* ── Alpha Vault Distribution Calculator ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-purple-400">Alpha Vault Distribution Calculator</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                        % Supply restant dans la pool
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={poolPct}
                          onChange={(e) => setPoolPct(e.target.value)}
                          placeholder="0.013"
                          className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 pr-8 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] text-sm">%</span>
                      </div>
                      <p className="text-xs text-[#52525b] mt-1">
                        Plus c&apos;est bas, plus le vault achète (ex: 0.013% → 99.987% distribué)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                        Dépôt total dans le vault ({quoteMint})
                      </label>
                      <input
                        type="text"
                        value={totalVaultDeposit}
                        onChange={(e) => setTotalVaultDeposit(e.target.value)}
                        placeholder="1"
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                      />
                      <p className="text-xs text-[#52525b] mt-1">
                        Montant total que les wallets vont déposer
                      </p>
                    </div>
                  </div>

                  {/* Results */}
                  {vaultCalc && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#a1a1aa]">Init Price (auto)</span>
                        <span className="text-sm font-mono text-white">
                          {vaultCalc.initPrice < 0.000001
                            ? vaultCalc.initPrice.toExponential(4)
                            : vaultCalc.initPrice.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
                          } {quoteMint}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#a1a1aa]">Tokens achetés par le vault</span>
                        <span className="text-sm font-bold text-green-400">
                          {vaultCalc.pctBought.toFixed(4)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#a1a1aa]">Tokens restants dans la pool</span>
                        <span className="text-sm text-[#71717a]">
                          {vaultCalc.tokensRemaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          {' '}({(100 - vaultCalc.pctBought).toFixed(4)}%)
                        </span>
                      </div>
                      <div className="border-t border-purple-500/20 pt-2 mt-2 flex items-center justify-between">
                        <span className="text-xs text-[#a1a1aa]">Market Cap après fill</span>
                        <span className="text-sm font-bold text-purple-300">
                          ${vaultCalc.mcAfterFillUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <p className="text-xs text-[#52525b]">
                        Fee: {(vaultCalc.feeRate * 100).toFixed(1)}% ({maxBaseFeeBps} bps) — déduit du dépôt
                        {quoteMint === 'SOL' && solPriceUsd && (
                          <span> — SOL: ${solPriceUsd.toLocaleString()}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Read-only init price */}
                  <div>
                    <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                      Init Price ({quoteMint} per Token) — auto-calculé
                    </label>
                    <input
                      type="text"
                      value={manualInitPrice}
                      readOnly
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-[#71717a] text-sm cursor-not-allowed font-mono"
                    />
                    <p className="text-xs text-[#52525b] mt-1">
                      Calculé depuis le % pool et le dépôt vault
                    </p>
                  </div>
                </div>
              ) : (
                /* ── Standard single-sided price config (no vault) ── */
                <>
                  <div>
                    <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                      Target Market Cap (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b] text-sm">$</span>
                      <input
                        type="text"
                        value={targetMcapUsd}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTargetMcapUsd(val);
                          const mcap = parseFloat(val);
                          const totalSupply = parseFloat(initialTokenAmount);
                          if (mcap > 0 && totalSupply > 0) {
                            const priceUsd = mcap / totalSupply;
                            if (quoteMint === 'SOL' && solPriceUsd) {
                              setManualInitPrice((priceUsd / solPriceUsd).toFixed(15).replace(/0+$/, '').replace(/\.$/, ''));
                            } else {
                              setManualInitPrice(priceUsd.toFixed(15).replace(/0+$/, '').replace(/\.$/, ''));
                            }
                          }
                        }}
                        placeholder="e.g. 1000000"
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-lg pl-7 pr-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                      />
                    </div>
                    <p className="text-xs text-[#52525b] mt-1">
                      {solPriceUsd
                        ? `SOL price: $${solPriceUsd.toLocaleString()} — auto-converts to ${quoteMint} price`
                        : 'Fetching SOL price...'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                      Init Price ({quoteMint} per Token)
                    </label>
                    <input
                      type="text"
                      value={manualInitPrice}
                      onChange={(e) => {
                        setManualInitPrice(e.target.value);
                        const price = parseFloat(e.target.value);
                        const totalSupply = parseFloat(initialTokenAmount);
                        if (price > 0 && totalSupply > 0) {
                          const mcapInQuote = price * totalSupply;
                          if (quoteMint === 'SOL' && solPriceUsd) {
                            setTargetMcapUsd(Math.round(mcapInQuote * solPriceUsd).toString());
                          } else {
                            setTargetMcapUsd(Math.round(mcapInQuote).toString());
                          }
                        }
                      }}
                      placeholder="e.g. 0.000001"
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                    />
                    <p className="text-xs text-[#52525b] mt-1">
                      Single-sided pool (0 {quoteMint}). Or set directly.
                    </p>
                  </div>

                  {calculatedPrice > 0 && (
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                      <p className="text-sm font-bold text-white">
                        1 Token = {calculatedPrice.toFixed(12).replace(/\.?0+$/, '')} {quoteMint}
                      </p>
                      {parseFloat(initialTokenAmount) > 0 && (
                        <p className="text-xs text-[#71717a] mt-1">
                          MCap ≈ {(parseFloat(initialTokenAmount) * calculatedPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })} {quoteMint}
                          {quoteMint === 'SOL' && solPriceUsd && (
                            <span> (≈ ${(parseFloat(initialTokenAmount) * calculatedPrice * solPriceUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD)</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="mt-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-cyan-400">
                  Auto-calculated Price
                </span>
              </div>
              {calculatedPrice > 0 ? (
                <>
                  <p className="text-lg font-bold text-white">
                    1 Token = {calculatedPrice.toFixed(12).replace(/\.?0+$/, '')} {quoteMint}
                  </p>
                  <p className="text-xs text-[#71717a] mt-1">
                    Price = {initialQuoteAmount} {quoteMint} / {parseFloat(initialTokenAmount).toLocaleString()} tokens
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#52525b]">
                  Enter both amounts to auto-calculate the initial price
                </p>
              )}
            </div>
          )}

          {/* Max Price (optional) */}
          <div className="mt-4">
            <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
              Max Price ({quoteMint} per Token) - Optional
            </label>
            <input
              type="text"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Leave empty for unlimited"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
            <p className="text-xs text-[#52525b] mt-1">
              Maximum price cap. Leave empty for no upper bound.
            </p>
          </div>
        </div>

        {/* Fee Configuration */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-[#a1a1aa]" />
            <h3 className="text-lg font-semibold text-white">
              Fee Configuration
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Max Base Fee (BPS)
              </label>
              <input
                type="number"
                value={maxBaseFeeBps}
                onChange={(e) =>
                  setMaxBaseFeeBps(Math.max(1, parseInt(e.target.value) || 1))
                }
                min={1}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                {maxBaseFeeBps} bps = {maxFeePercent.toFixed(2)}%
              </p>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Min Base Fee (BPS)
              </label>
              <input
                type="number"
                value={minBaseFeeBps}
                onChange={(e) =>
                  setMinBaseFeeBps(Math.max(1, parseInt(e.target.value) || 1))
                }
                min={1}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                {minBaseFeeBps} bps = {minFeePercent.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Dynamic Fee
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUseDynamicFee(true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    useDynamicFee
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  onClick={() => setUseDynamicFee(false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    !useDynamicFee
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Disabled
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Collect Fee Mode
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCollectFeeMode(1)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    collectFeeMode === 1
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  SOL Only
                </button>
                <button
                  type="button"
                  onClick={() => setCollectFeeMode(0)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    collectFeeMode === 0
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Both Tokens
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Fee Scheduler
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFeeSchedulerMode(0)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    feeSchedulerMode === 0
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Linear
                </button>
                <button
                  type="button"
                  onClick={() => setFeeSchedulerMode(1)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    feeSchedulerMode === 1
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Exponential
                </button>
              </div>
            </div>
          {/* Alpha Vault Toggle */}
            <div className="mt-4 flex items-center gap-3 p-3 bg-[#09090b] rounded-lg border border-[#27272a]">
              <button
                type="button"
                onClick={() => setHasAlphaVault(!hasAlphaVault)}
                className={`relative w-10 h-5 rounded-full transition-colors ${hasAlphaVault ? 'bg-purple-600' : 'bg-[#27272a]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hasAlphaVault ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <div>
                <span className="text-sm text-white font-medium">Enable Alpha Vault</span>
                <p className="text-xs text-[#52525b]">Required to create an Alpha Vault on this pool for fair token distribution</p>
              </div>
            </div>

            {/* Config Address (for creating second pool with same mints) */}
            <div className="mt-4">
              <label className="text-sm text-[#a1a1aa] mb-1 block">Config Address (optional)</label>
              <input
                type="text"
                value={configAddress}
                onChange={(e) => setConfigAddress(e.target.value)}
                placeholder="Meteora config PDA (for 2nd pool with same mints)"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm"
              />
              <p className="text-xs text-[#52525b] mt-1">Use if custom pool already exists for this mint pair. GNWR used: EQbqYxecZuJsVt6g5QbKTWpNWa3QyWQE5NWz5AZBAiNv</p>
            </div>
          </div>
        </div>

        {/* Activation Settings */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#a1a1aa]" />
            <h3 className="text-lg font-semibold text-white">
              Activation Settings
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Activation Type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActivationType('timestamp')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    activationType === 'timestamp'
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Timestamp
                </button>
                <button
                  type="button"
                  onClick={() => setActivationType('slot')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    activationType === 'slot'
                      ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                      : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                  }`}
                >
                  Slot
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Activation Delay{' '}
                {activationType === 'timestamp' ? '(seconds)' : '(slots)'}
              </label>
              <input
                type="number"
                value={activationDelay}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setActivationDelay(val);
                }}
                min={0}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                {hasAlphaVault && activationType === 'timestamp' && activationDelay < 5400
                  ? <span className="text-orange-400">Alpha Vault requires minimum 5400s (1h30) — will be auto-set</span>
                  : activationDelay === 0
                    ? 'Pool will be active immediately'
                    : activationType === 'timestamp'
                      ? `Pool activates ${Math.floor(activationDelay / 60)}min ${activationDelay % 60}s after creation`
                      : `Pool activates after ${activationDelay} slots`}
              </p>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">
                Pool Creation Failed
              </p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !privateKey || !tokenMint || calculatedPrice <= 0}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating DAMM v2 Pool...
            </>
          ) : (
            <>
              <Droplets className="w-5 h-5" />
              Create DAMM v2 Pool
            </>
          )}
        </button>
      </form>

      {/* Result Display */}
      {result && (
        <div className="bg-[#18181b] rounded-xl border border-green-500/30 p-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Pool Created Successfully
              </h3>
              <p className="text-xs text-[#71717a]">
                Your Meteora DAMM v2 pool is live on {network}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">
                Pool Address
              </label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">
                  {result.poolAddress}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(result.poolAddress, 'poolAddress')
                  }
                  className="text-[#71717a] hover:text-white transition-colors shrink-0"
                >
                  {copiedField === 'poolAddress' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">
                Transaction Signature
              </label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">
                  {result.signature}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(result.signature, 'poolSignature')
                  }
                  className="text-[#71717a] hover:text-white transition-colors shrink-0"
                >
                  {copiedField === 'poolSignature' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              View on Solscan
            </a>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-[#71717a]">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              Copy the pool address to use in the Sell Strategy module for
              executing trades.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
