'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Coins,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  ShieldOff,
  Info,
  Upload,
} from 'lucide-react';
import type { TokenResult } from '@/types';

interface TokenCreatorProps {
  network: 'devnet' | 'mainnet-beta';
  onTokenCreated: (result: TokenResult) => void;
  creatorKey?: string;
}

export default function TokenCreator({
  network,
  onTokenCreated,
  creatorKey = '',
}: TokenCreatorProps) {
  const [privateKey, setPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !privateKey) setPrivateKey(creatorKey); }, [creatorKey]);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState(6);
  const [totalSupply, setTotalSupply] = useState(1_000_000_000);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [poolAmount, setPoolAmount] = useState(50_000_000);
  const [revokeFreeze, setRevokeFreeze] = useState(true);
  const [vanityPrefix, setVanityPrefix] = useState('');
  const [vanitySuffix, setVanitySuffix] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TokenResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      setImageUrl(data.data.url);
    } catch (err) {
      setError(`Image upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }
    if (!name.trim()) {
      setError('Token name is required');
      return;
    }
    if (!symbol.trim()) {
      setError('Token symbol is required');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/create-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          name: name.trim(),
          symbol: symbol.trim(),
          decimals,
          totalSupply,
          poolAmount,
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          revokeFreeze,
          network,
          vanityPrefix: vanityPrefix.trim(),
          vanitySuffix: vanitySuffix.trim(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create token');
      }

      setResult(data.data);
      onTokenCreated(data.data);
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
        <h2 className="text-2xl font-bold text-white">Create Token</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          Launch a Solana Token 2022 (Token Extensions) token with metadata
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
              Real SOL will be spent. Double-check all parameters before
              submitting.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Private Key */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Authority Wallet
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
              This wallet will pay for the token creation and become the initial
              authority.
            </p>
          </div>
        </div>

        {/* Token Details */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Token Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Token Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Token"
                maxLength={32}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. MTK"
                maxLength={10}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Decimals
              </label>
              <input
                type="number"
                value={decimals}
                onChange={(e) =>
                  setDecimals(
                    Math.max(0, Math.min(18, parseInt(e.target.value) || 0))
                  )
                }
                min={0}
                max={18}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Total Supply (target)
              </label>
              <input
                type="number"
                value={totalSupply}
                onChange={(e) =>
                  setTotalSupply(Math.max(1, parseInt(e.target.value) || 1))
                }
                min={1}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <p className="text-xs text-[#52525b] mt-1">
                Target: {totalSupply.toLocaleString()} tokens
              </p>
            </div>
          </div>

          {/* Pool Amount */}
          <div className="mt-4 p-4 bg-[#09090b] rounded-lg border border-cyan-500/20">
            <label className="block text-sm text-cyan-400 font-medium mb-1.5">
              Pool Liquidity Amount
            </label>
            <input
              type="number"
              value={poolAmount}
              onChange={(e) =>
                setPoolAmount(Math.max(0, parseInt(e.target.value) || 0))
              }
              min={0}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all"
            />
            <p className="text-xs text-[#71717a] mt-1.5">
              {poolAmount.toLocaleString()} tokens will be minted to your wallet for pool creation.
              The remaining {(totalSupply - poolAmount).toLocaleString()} tokens will be minted directly to side wallets via the Wallet Manager.
            </p>
          </div>

          {/* Vanity Address */}
          <div className="mt-4 p-4 bg-[#09090b] rounded-lg border border-[#27272a]">
            <label className="block text-sm text-[#a1a1aa] font-medium mb-2">
              Vanity Mint Address <span className="text-[#52525b]">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#71717a] mb-1">Prefix</label>
                <input
                  type="text"
                  value={vanityPrefix}
                  onChange={e => setVanityPrefix(e.target.value)}
                  placeholder="e.g. FUE"
                  maxLength={4}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#71717a] mb-1">Suffix</label>
                <input
                  type="text"
                  value={vanitySuffix}
                  onChange={e => setVanitySuffix(e.target.value)}
                  placeholder="e.g. pump"
                  maxLength={4}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-[#52525b] mt-1.5">
              Base58 chars only. 1-2 chars = instant, 3 chars = seconds, 4 chars = may take minutes. Leave empty for random.
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Metadata</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of your token..."
                rows={3}
                maxLength={200}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all resize-none"
              />
              <p className="text-xs text-[#52525b] mt-1 text-right">
                {description.length}/200
              </p>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                Token Image
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/token-image.png"
                  className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors shrink-0"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
              {imageUrl && (
                <div className="mt-2">
                  <img
                    src={imageUrl}
                    alt="Token preview"
                    className="w-16 h-16 rounded-lg object-cover border border-[#27272a] bg-[#09090b]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.display = 'block';
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-[#52525b] mt-1.5">
                Enter a URL or upload from your computer (PNG, JPG, WebP, SVG). Uploaded images are hosted on catbox.moe.
              </p>
            </div>
          </div>
        </div>

        {/* Authority Options */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Authority Options
          </h3>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={revokeFreeze}
                  onChange={(e) => setRevokeFreeze(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all flex items-center justify-center">
                  {revokeFreeze && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-[#a1a1aa]" />
                  <span className="text-sm font-medium text-white">
                    Revoke Freeze Authority
                  </span>
                </div>
                <p className="text-xs text-[#71717a] mt-0.5">
                  Permanently removes the ability to freeze token accounts.
                  Recommended for community trust.
                </p>
              </div>
            </label>

            {/* Mint Authority Info */}
            <div className="flex items-start gap-3 p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
              <ShieldCheck className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium text-cyan-400">
                  Mint Authority Kept Active
                </span>
                <p className="text-xs text-[#71717a] mt-0.5">
                  Mint authority stays active so you can mint tokens directly to side wallets.
                  Revoke it from the Wallet Manager after all minting is complete.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Guide */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <h3 className="text-lg font-semibold text-white mb-3">
            Launch Workflow
          </h3>
          <div className="space-y-2">
            {[
              { step: '1', label: 'Create Token', desc: `Mint ${poolAmount.toLocaleString()} tokens to your wallet for pool`, active: true },
              { step: '2', label: 'Generate Wallets', desc: 'Create side wallets & fund ATAs' },
              { step: '3', label: 'Mint to Wallets', desc: 'Mint tokens directly to each side wallet' },
              { step: '4', label: 'Create Pool', desc: 'Create Meteora DAMM v2 pool with pool tokens' },
              { step: '5', label: 'Revoke Authorities', desc: 'Revoke mint authority to lock supply' },
              { step: '6', label: 'Sell Strategy', desc: 'Side wallets sell gradually on the pool' },
            ].map(({ step, label, desc, active }) => (
              <div key={step} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${active ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-[#09090b]'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-purple-600 text-white' : 'bg-[#27272a] text-[#71717a]'}`}>
                  {step}
                </div>
                <div>
                  <span className={`text-sm font-medium ${active ? 'text-purple-400' : 'text-[#a1a1aa]'}`}>{label}</span>
                  <span className="text-xs text-[#52525b] ml-2">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">
                Token Creation Failed
              </p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !privateKey || !name || !symbol}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Token...
            </>
          ) : (
            <>
              <Coins className="w-5 h-5" />
              Create Token 2022
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
                Token Created Successfully
              </h3>
              <p className="text-xs text-[#71717a]">
                Your Token 2022 token has been minted on {network}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Mint Address */}
            <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">
                Mint Address
              </label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">
                  {result.mintAddress}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(result.mintAddress, 'mintAddress')
                  }
                  className="text-[#71717a] hover:text-white transition-colors shrink-0"
                >
                  {copiedField === 'mintAddress' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Token Account */}
            <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
              <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">
                Token Account
              </label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-white break-all">
                  {result.tokenAccount}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(result.tokenAccount, 'tokenAccount')
                  }
                  className="text-[#71717a] hover:text-white transition-colors shrink-0"
                >
                  {copiedField === 'tokenAccount' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Signature */}
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
                    copyToClipboard(result.signature, 'signature')
                  }
                  className="text-[#71717a] hover:text-white transition-colors shrink-0"
                >
                  {copiedField === 'signature' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Explorer Link */}
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              View on Solana Explorer
            </a>
          </div>

          {/* Info Note */}
          <div className="mt-4 flex items-start gap-2 text-xs text-[#71717a]">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              Copy the mint address above and use it in the Wallet Manager and
              Pool Creator modules.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
