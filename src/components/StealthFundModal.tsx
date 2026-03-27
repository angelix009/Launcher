'use client';

import { useState, useRef } from 'react';
import {
  X,
  Shield,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { WalletEntry } from '@/types';

interface StealthFundModalProps {
  wallets: WalletEntry[];
  creatorKey: string;
  network: 'devnet' | 'mainnet-beta';
  onClose: () => void;
}

interface HopEvent {
  type: string;
  level?: number;
  hopsDone?: number;
  totalHops?: number;
  from?: string;
  to?: string;
  amount?: number;
  asset?: string;
  signature?: string;
  destination?: boolean;
  seconds?: number;
  error?: string;
  message?: string;
  intermediateKeys?: { publicKey: string; privateKey: string; level: number }[];
  totalIntermediates?: number;
  estimatedMinutes?: number;
}

export default function StealthFundModal({
  wallets,
  creatorKey,
  network,
  onClose,
}: StealthFundModalProps) {
  const [asset, setAsset] = useState<'SOL' | 'USDC'>('USDC');
  const [amountPerWallet, setAmountPerWallet] = useState('');
  const [hops, setHops] = useState(4);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(120);
  const [amountNoise, setAmountNoise] = useState(5); // percentage
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<HopEvent[]>([]);
  const [currentHop, setCurrentHop] = useState(0);
  const [totalHops, setTotalHops] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intermediateKeys, setIntermediateKeys] = useState<HopEvent['intermediateKeys']>([]);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const startFunding = async () => {
    setRunning(true);
    setEvents([]);
    setCurrentHop(0);
    setDone(false);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/wallets/stealth-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: creatorKey,
          destinations: wallets.map(w => w.publicKey),
          amountPerWallet: parseFloat(amountPerWallet),
          asset,
          hops,
          delayMin,
          delayMax,
          amountNoise: amountNoise / 100,
          network,
        }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: HopEvent = JSON.parse(line);
            setEvents(prev => [...prev, event]);

            if (event.type === 'plan') {
              setTotalHops(event.totalHops || 0);
              if (event.intermediateKeys) setIntermediateKeys(event.intermediateKeys);
            } else if (event.type === 'hop') {
              setCurrentHop(event.hopsDone || 0);
            } else if (event.type === 'done' || event.type === 'error') {
              // Also capture keys from done/error events (backup)
              if (event.intermediateKeys?.length) setIntermediateKeys(event.intermediateKeys);
            }

            if (event.type === 'delay' && event.seconds) {
              // Start countdown
              setCountdown(event.seconds);
              if (countdownRef.current) clearInterval(countdownRef.current);
              let remaining = event.seconds;
              countdownRef.current = setInterval(() => {
                remaining--;
                setCountdown(remaining);
                if (remaining <= 0 && countdownRef.current) {
                  clearInterval(countdownRef.current);
                  countdownRef.current = null;
                }
              }, 1000);
            } else if (event.type === 'done') {
              setDone(true);
              setRunning(false);
            } else if (event.type === 'error') {
              setError(event.message || 'Unknown error');
              setRunning(false);
            }

            // Auto-scroll log
            if (logRef.current) {
              logRef.current.scrollTop = logRef.current.scrollHeight;
            }
          } catch { /* skip invalid JSON */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
      setRunning(false);
    }
  };

  const abort = () => {
    abortRef.current?.abort();
    if (countdownRef.current) clearInterval(countdownRef.current);
    setRunning(false);
    setError('Cancelled by user. Intermediate wallets may still hold funds.');
  };

  const progressPct = totalHops > 0 ? (currentHop / totalHops) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#27272a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Stealth Fund</h2>
              <p className="text-xs text-[#71717a]">Multi-hop funding — anti Bubblemaps/InsightX</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#71717a] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {!running && !done && (
            <>
              {/* Config */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">Asset</label>
                    <div className="flex gap-2">
                      {(['SOL', 'USDC'] as const).map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAsset(a)}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                            asset === a
                              ? 'bg-purple-600/20 text-purple-400 border-purple-500/50'
                              : 'bg-[#09090b] text-[#a1a1aa] border-[#27272a] hover:border-[#3f3f46]'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                      Amount per wallet ({asset})
                    </label>
                    <input
                      type="number"
                      value={amountPerWallet}
                      onChange={e => setAmountPerWallet(e.target.value)}
                      placeholder={asset === 'SOL' ? '0.5' : '100'}
                      min={0}
                      step="any"
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1aa] font-medium mb-1.5">
                    Hops (intermediary wallets) — {hops}
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={7}
                    value={hops}
                    onChange={e => setHops(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-[#52525b] mt-1">
                    <span>3 (Bubblemaps)</span>
                    <span>4-5 (recommended)</span>
                    <span>7 (InsightX proof)</span>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#a1a1aa]">Wallets to fund</span>
                    <span className="text-white font-medium">{wallets.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#a1a1aa]">Total {asset}</span>
                    <span className="text-white font-medium">
                      ~{(parseFloat(amountPerWallet || '0') * wallets.length).toFixed(2)} {asset}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#a1a1aa]">Pattern</span>
                    <span className="text-purple-400 font-medium">Mesh (split + merge)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#a1a1aa]">Estimated time</span>
                    <span className="text-[#71717a]">
                      ~{Math.round((wallets.length * hops * (delayMin + delayMax) / 2) / 60)} min
                    </span>
                  </div>
                  {asset === 'USDC' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#a1a1aa]">SOL needed (gas)</span>
                      <span className="text-orange-400 font-medium">
                        ~{(wallets.length * 0.003 * hops + wallets.length * 0.003).toFixed(2)} SOL
                      </span>
                    </div>
                  )}
                </div>

                {/* Advanced */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-sm text-[#71717a] hover:text-white transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Advanced Settings
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-3 gap-4 bg-[#09090b] rounded-lg p-4 border border-[#27272a]">
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Min delay (s)</label>
                      <input
                        type="number"
                        value={delayMin}
                        onChange={e => setDelayMin(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Max delay (s)</label>
                      <input
                        type="number"
                        value={delayMax}
                        onChange={e => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Amount noise (%)</label>
                      <input
                        type="number"
                        value={amountNoise}
                        onChange={e => setAmountNoise(Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Running / Progress */}
          {(running || done || error) && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#a1a1aa]">
                    {done ? 'Complete' : running ? 'Funding in progress...' : 'Stopped'}
                  </span>
                  <span className="text-white font-mono">{currentHop}/{totalHops}</span>
                </div>
                <div className="w-full bg-[#27272a] rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      done ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Countdown */}
              {running && countdown > 0 && (
                <div className="text-center py-2">
                  <span className="text-sm text-[#71717a]">Next hop in </span>
                  <span className="text-lg font-mono text-purple-400">{countdown}s</span>
                </div>
              )}

              {/* Log */}
              <div
                ref={logRef}
                className="bg-[#09090b] border border-[#27272a] rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-xs space-y-1"
              >
                {events.map((ev, i) => (
                  <div key={i} className={
                    ev.type === 'hop' ? 'text-green-400' :
                    ev.type === 'hop_error' ? 'text-red-400' :
                    ev.type === 'delay' ? 'text-[#52525b]' :
                    ev.type === 'plan' ? 'text-purple-400' :
                    ev.type === 'done' ? 'text-green-300 font-bold' :
                    ev.type === 'error' ? 'text-red-400 font-bold' :
                    'text-[#71717a]'
                  }>
                    {ev.type === 'plan' && (
                      <>Mesh built: {ev.totalIntermediates} intermediates, {ev.totalHops} edges, {(ev as any).mergePoints || 0} merge points, ~{ev.estimatedMinutes}min{(ev as any).totalSolNeeded ? ` | SOL needed: ~${(ev as any).totalSolNeeded}` : ''}{(ev as any).totalUsdcNeeded ? ` | USDC: ~${(ev as any).totalUsdcNeeded}` : ''}</>
                    )}
                    {ev.type === 'hop' && (
                      <>{ev.from}... → {ev.to}...{ev.destination ? ' (dest)' : ''} | {ev.amount?.toFixed(4)} {ev.asset} | {ev.signature?.slice(0, 20)}...</>
                    )}
                    {ev.type === 'hop_error' && (
                      <>FAIL {ev.from}... → {ev.to}... | {ev.error}</>
                    )}
                    {ev.type === 'delay' && (
                      <>waiting {ev.seconds}s...</>
                    )}
{ev.type === 'done' && (
                      <>Done! {ev.hopsDone}/{ev.totalHops} hops completed</>
                    )}
                    {ev.type === 'error' && (
                      <>ERROR: {ev.message}</>
                    )}
                  </div>
                ))}
              </div>

              {/* Done message */}
              {done && (() => {
                const failCount = events.filter(e => e.type === 'hop_error').length;
                const successCount = events.filter(e => e.type === 'hop').length;
                return (
                  <div className={`${failCount > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/10 border-green-500/30'} border rounded-lg p-4 flex items-start gap-3`}>
                    {failCount > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${failCount > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                        Stealth funding {failCount > 0 ? 'completed with errors' : 'complete'}
                      </p>
                      <p className={`text-xs mt-0.5 ${failCount > 0 ? 'text-orange-400/70' : 'text-green-400/70'}`}>
                        {successCount} hops OK{failCount > 0 ? `, ${failCount} failed` : ''} — {wallets.length} wallets, {hops} hops
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Error message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                </div>
              )}

              {/* Recovery keys download - always show when keys available and process ended */}
              {(done || error) && intermediateKeys && intermediateKeys.length > 0 && (
                <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[#a1a1aa]">
                      <p className="font-medium text-[#e4e4e7]">{intermediateKeys.length} intermediate wallets</p>
                      <p className="mt-0.5">Download keys for fund recovery if needed</p>
                    </div>
                    <button
                      onClick={() => {
                        const csv = 'publicKey,privateKey,level\n' +
                          intermediateKeys.map(k => `${k.publicKey},${k.privateKey},${k.level}`).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `stealth-intermediate-keys-${Date.now()}.csv`;
                        a.click();
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-[#27272a] hover:bg-[#3f3f46] text-white rounded-lg transition-colors shrink-0"
                    >
                      Download keys
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#27272a]">
          {!running && !done ? (
            <button
              onClick={startFunding}
              disabled={!amountPerWallet || parseFloat(amountPerWallet) <= 0 || wallets.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Start Stealth Funding ({wallets.length} wallets, {hops} hops)
            </button>
          ) : running ? (
            <button
              onClick={abort}
              className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-medium py-3 rounded-xl transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full bg-[#27272a] hover:bg-[#3f3f46] text-white font-medium py-3 rounded-xl transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
