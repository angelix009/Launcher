'use client';

import { useState, useRef } from 'react';
import { Loader2, Upload, Save, RefreshCw, ExternalLink } from 'lucide-react';
import type { TransactionLog } from '@/types';

interface EditMetadataProps {
  privateKey: string;
  tokenMint: string;
  network: 'devnet' | 'mainnet-beta';
  onAddLog: (log: Omit<TransactionLog, 'id' | 'timestamp'>) => void;
}

export default function EditMetadata({ privateKey, tokenMint, network, onAddLog }: EditMetadataProps) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [customUri, setCustomUri] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [currentMetadata, setCurrentMetadata] = useState<{
    name?: string; symbol?: string; uri?: string; description?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createLog = (action: string, status: 'success' | 'error' | 'pending', message: string, txSig?: string): Omit<TransactionLog, 'id' | 'timestamp'> => ({
    type: 'transfer',
    signature: txSig || '',
    status,
    message,
  });

  const handleFetchMetadata = async () => {
    if (!tokenMint) { setError('No token mint selected'); return; }
    setLoading(true);
    setError(null);
    try {
      const rpcUrl = network === 'mainnet-beta'
        ? (process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com')
        : 'https://api.devnet.solana.com';

      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [tokenMint, { encoding: 'jsonParsed' }],
        }),
      });
      const data = await res.json();
      const parsed = data?.result?.value?.data?.parsed;
      if (parsed?.info?.extensions) {
        const metaExt = parsed.info.extensions.find(
          (e: { extension: string }) => e.extension === 'tokenMetadata'
        );
        if (metaExt?.state) {
          const meta = metaExt.state;
          setCurrentMetadata({
            name: meta.name,
            symbol: meta.symbol,
            uri: meta.uri,
            description: meta.additionalMetadata?.find(
              (m: [string, string]) => m[0] === 'description'
            )?.[1],
          });
          setName(meta.name || '');
          setSymbol(meta.symbol || '');
          setCustomUri(meta.uri || '');
          setDescription(
            meta.additionalMetadata?.find(
              (m: [string, string]) => m[0] === 'description'
            )?.[1] || ''
          );
          // Try to get image from URI
          if (meta.uri) {
            try {
              const uriRes = await fetch(meta.uri);
              const uriData = await uriRes.json();
              if (uriData.image) setImageUrl(uriData.image);
            } catch {}
          }
          onAddLog(createLog('metadata', 'success', `Loaded metadata for ${meta.name} (${meta.symbol})`));
        } else {
          setError('No metadata extension found on this token');
        }
      } else {
        setError('Could not parse token metadata. Is this a Token 2022 token?');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setImageUrl(data.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!privateKey) { setError('Enter your private key in the global config bar'); return; }
    if (!tokenMint) { setError('Select a token mint'); return; }

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      // If image changed, upload new JSON metadata and update URI
      let uriToUpdate = customUri;
      if (imageUrl && imageUrl !== '') {
        // Upload JSON metadata to catbox
        const metadataJson = JSON.stringify({
          name: name || currentMetadata?.name || '',
          symbol: symbol || currentMetadata?.symbol || '',
          description: description || '',
          image: imageUrl,
        });
        const blob = new Blob([metadataJson], { type: 'application/json' });
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, 'metadata.json');
        const catRes = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: formData,
        });
        const catUrl = await catRes.text();
        if (catUrl.startsWith('https://')) {
          uriToUpdate = catUrl.trim();
        }
      }

      const fields: Record<string, string> = {};
      if (name && name !== currentMetadata?.name) fields.name = name;
      if (symbol && symbol !== currentMetadata?.symbol) fields.symbol = symbol;
      if (uriToUpdate && uriToUpdate !== currentMetadata?.uri) fields.uri = uriToUpdate;
      if (description !== (currentMetadata?.description || '')) fields.description = description;

      if (Object.keys(fields).length === 0) {
        setError('No changes to save');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/update-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey,
          tokenMint,
          network,
          fields,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setResult(data.data.signature);
      setCurrentMetadata(prev => ({ ...prev, ...fields }));
      onAddLog(createLog('metadata', 'success', `Updated ${data.data.fieldsUpdated} metadata field(s)`, data.data.signature));
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      onAddLog(createLog('metadata', 'error', `Metadata update failed: ${msg}`));
    } finally {
      setSaving(false);
    }
  };

  const explorerUrl = result
    ? `https://solscan.io/tx/${result}${network === 'devnet' ? '?cluster=devnet' : ''}`
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Token Metadata</h3>
          <button
            onClick={handleFetchMetadata}
            disabled={loading || !tokenMint}
            className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Load Current
          </button>
        </div>

        {!tokenMint && (
          <p className="text-sm text-amber-400 mb-4">Select a token mint in the global config bar above.</p>
        )}

        {currentMetadata && (
          <div className="text-xs text-[#52525b] mb-4 p-3 bg-[#09090b] rounded-lg border border-[#1e1e21]">
            Current: <span className="text-[#a1a1aa]">{currentMetadata.name}</span> ({currentMetadata.symbol})
            {currentMetadata.uri && (
              <span className="ml-2">| URI: <span className="text-[#a1a1aa] break-all">{currentMetadata.uri.slice(0, 60)}...</span></span>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#71717a] block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                placeholder="Token Name"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-[#71717a] block mb-1">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                maxLength={10}
                placeholder="TKN"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#71717a] block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your token..."
              rows={3}
              maxLength={200}
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm resize-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
            <p className="text-[10px] text-[#52525b] text-right mt-0.5">{description.length}/200</p>
          </div>

          <div>
            <label className="text-xs text-[#71717a] block mb-1">Token Image</label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
              />
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-1.5"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload
              </button>
            </div>
            {imageUrl && (
              <div className="mt-2">
                <img src={imageUrl} alt="Token" className="w-16 h-16 rounded-lg object-cover border border-[#27272a]" />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-[#71717a] block mb-1">Metadata URI (auto-generated from image, or custom)</label>
            <input
              type="url"
              value={customUri}
              onChange={(e) => setCustomUri(e.target.value)}
              placeholder="https://files.catbox.moe/xxx.json"
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm font-mono text-xs focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
            <p className="text-[10px] text-[#52525b] mt-0.5">Leave empty to auto-generate from image. JSON must contain {'{name, symbol, description, image}'}.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center justify-between">
            <span>Metadata updated!</span>
            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-300 hover:text-green-200 underline">
                View tx <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !privateKey || !tokenMint}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Updating...' : 'Update Metadata'}
          </button>
          <p className="text-[10px] text-[#52525b] text-center mt-2">
            Requires update authority. Will update on-chain metadata + off-chain JSON URI.
          </p>
        </div>
      </div>
    </div>
  );
}
