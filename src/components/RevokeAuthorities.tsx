'use client';

import { useState, useEffect } from 'react';
import {
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';

interface RevokeAuthoritiesProps {
  network: 'devnet' | 'mainnet-beta';
  tokenMint: string;
  creatorKey?: string;
}

export default function RevokeAuthorities({
  network,
  tokenMint,
  creatorKey = '',
}: RevokeAuthoritiesProps) {
  const [privateKey, setPrivateKey] = useState(creatorKey);
  useEffect(() => { if (creatorKey && !privateKey) setPrivateKey(creatorKey); }, [creatorKey]);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [mintAddress, setMintAddress] = useState(tokenMint || '');
  useEffect(() => { if (tokenMint) setMintAddress(tokenMint); }, [tokenMint]);

  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeUpdate, setRevokeUpdate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ signature: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  const handleRevoke = async () => {
    if (!privateKey.trim() || !mintAddress.trim()) {
      setError('Private key and token mint address are required');
      return;
    }
    if (!revokeMint && !revokeUpdate) {
      setError('Select at least one authority to revoke');
      return;
    }
    if (!confirmed) {
      setError('You must confirm that you understand this action is irreversible');
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/revoke-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          tokenMint: mintAddress.trim(),
          revokeMint,
          revokeUpdate,
          network,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      setResult(data.data);
      setConfirmed(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const revokedList = [revokeMint && 'Mint', revokeUpdate && 'Update'].filter(Boolean).join(' + ');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Revoke Authorities</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">
          Permanently revoke mint and/or update authorities on your token
        </p>
      </div>

      {/* Warning Banner */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-400">Irreversible Action</p>
          <p className="text-xs text-red-400/70 mt-1">
            Revoking authorities is permanent and cannot be undone. Only proceed after all tokens
            have been minted to wallets and the pool has been created. This builds trust by proving
            no more tokens can ever be minted.
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Configuration</h3>

        <div>
          <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
            Authority Private Key (Base58)
          </label>
          <div className="relative">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Private key of the current authority..."
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

        <div>
          <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
            Token Mint Address
          </label>
          <input
            type="text"
            value={mintAddress}
            onChange={(e) => setMintAddress(e.target.value)}
            placeholder="Token mint address..."
            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Authority Selection */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Select Authorities to Revoke</h3>

        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-red-500/30 transition-colors">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={revokeMint}
              onChange={(e) => setRevokeMint(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#18181b] peer-checked:bg-red-600 peer-checked:border-red-600 transition-all flex items-center justify-center">
              {revokeMint && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-white">Revoke Mint Authority</span>
            </div>
            <p className="text-xs text-[#71717a] mt-1">
              No more tokens can ever be minted. The total supply becomes permanently fixed.
              This is the most important authority to revoke for community trust.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-red-500/30 transition-colors">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={revokeUpdate}
              onChange={(e) => setRevokeUpdate(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#18181b] peer-checked:bg-red-600 peer-checked:border-red-600 transition-all flex items-center justify-center">
              {revokeUpdate && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-medium text-white">Revoke Update Authority</span>
            </div>
            <p className="text-xs text-[#71717a] mt-1">
              Token metadata (name, symbol, image) can no longer be changed by anyone.
            </p>
          </div>
        </label>
      </div>

      {/* Confirmation */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-5 h-5 rounded border-2 border-[#3f3f46] bg-[#09090b] peer-checked:bg-orange-600 peer-checked:border-orange-600 transition-all flex items-center justify-center">
              {confirmed && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
          <span className="text-sm text-[#a1a1aa]">
            I understand that revoking {revokedList || '...'} authority is <strong className="text-white">permanent and irreversible</strong>.
            I have already finished minting tokens and creating the pool.
          </span>
        </label>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleRevoke}
          disabled={loading || !confirmed || !privateKey || !mintAddress || (!revokeMint && !revokeUpdate)}
          className="w-full bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Revoking {revokedList}...
            </>
          ) : (
            <>
              <ShieldOff className="w-5 h-5" />
              Revoke {revokedList || 'Selected'} Authority
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-[#18181b] rounded-xl border border-green-500/30 p-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Authorities Revoked</h3>
              <p className="text-xs text-[#71717a]">
                {revokedList} authority has been permanently revoked
              </p>
            </div>
          </div>

          <div className="bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
            <label className="text-xs text-[#71717a] font-medium uppercase tracking-wider">
              Transaction Signature
            </label>
            <p className="text-sm font-mono text-white break-all mt-1">
              {result.signature}
            </p>
          </div>

          <a
            href={`https://explorer.solana.com/tx/${result.signature}${clusterParam}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            View on Solana Explorer
          </a>

          <div className="mt-4 flex items-start gap-2 text-xs text-[#71717a]">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              Your token supply is now permanently fixed. No one can ever mint additional tokens.
            </p>
          </div>
        </div>
      )}

      {/* Workflow Reminder */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <h3 className="text-lg font-semibold text-white mb-3">When to Revoke</h3>
        <div className="space-y-2">
          {[
            { step: '1', label: 'Create Token', done: true },
            { step: '2', label: 'Generate & Fund Side Wallets', done: true },
            { step: '3', label: 'Mint Tokens to All Wallets', done: true },
            { step: '4', label: 'Create Meteora Pool', done: true },
            { step: '5', label: 'Revoke Authorities', active: true },
            { step: '6', label: 'Start Sell Strategy' },
          ].map(({ step, label, done, active }) => (
            <div
              key={step}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                active ? 'bg-red-500/10 border border-red-500/30' : done ? 'bg-green-500/5' : 'bg-[#09090b]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  active ? 'bg-red-600 text-white' : done ? 'bg-green-600/20 text-green-400' : 'bg-[#27272a] text-[#71717a]'
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : step}
              </div>
              <span
                className={`text-sm font-medium ${
                  active ? 'text-red-400' : done ? 'text-green-400/70' : 'text-[#52525b]'
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
