'use client';

import { useState } from 'react';
import {
  Activity,
  Coins,
  Wallet,
  Droplets,
  TrendingDown,
  Globe,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Zap,
} from 'lucide-react';
import type { TransactionLog, AppModule } from '@/types';

interface DashboardProps {
  network: 'devnet' | 'mainnet-beta';
  tokenMint: string | null;
  tokenDecimals: number;
  walletCount: number;
  totalTokenBalance: number;
  totalSolBalance: number;
  poolAddress: string | null;
  logs: TransactionLog[];
  onNavigate: (module: AppModule) => void;
}

function truncateKey(key: string): string {
  if (!key || key.length < 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(4);
}

const statusIcon = {
  success: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  error: <XCircle className="w-4 h-4 text-red-400" />,
  pending: <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />,
};

const typeColors: Record<string, string> = {
  mint: 'bg-purple-500/20 text-purple-400',
  transfer: 'bg-blue-500/20 text-blue-400',
  sell: 'bg-orange-500/20 text-orange-400',
  pool: 'bg-cyan-500/20 text-cyan-400',
  fund: 'bg-green-500/20 text-green-400',
};

export default function Dashboard({
  network,
  tokenMint,
  tokenDecimals,
  walletCount,
  totalTokenBalance,
  totalSolBalance,
  poolAddress,
  logs,
  onNavigate,
}: DashboardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const explorerBaseUrl =
    network === 'devnet'
      ? 'https://explorer.solana.com/address/'
      : 'https://explorer.solana.com/address/';
  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';

  const quickActions: {
    label: string;
    module: AppModule;
    icon: typeof Coins;
    description: string;
    color: string;
  }[] = [
    {
      label: 'Create Token',
      module: 'token',
      icon: Coins,
      description: 'Launch a Token 2022 token',
      color: 'from-purple-500/20 to-purple-600/5',
    },
    {
      label: 'Manage Wallets',
      module: 'wallets',
      icon: Wallet,
      description: 'Generate and fund wallets',
      color: 'from-blue-500/20 to-blue-600/5',
    },
    {
      label: 'Create Pool',
      module: 'pool',
      icon: Droplets,
      description: 'Create Meteora DAMM v2 pool',
      color: 'from-cyan-500/20 to-cyan-600/5',
    },
    {
      label: 'Sell Strategy',
      module: 'sell',
      icon: TrendingDown,
      description: 'Configure sell percentages',
      color: 'from-orange-500/20 to-orange-600/5',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Overview of your token launch configuration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              network === 'devnet'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${
                network === 'devnet' ? 'bg-purple-400' : 'bg-orange-400'
              }`}
            />
            <Globe className="w-3 h-3" />
            {network === 'devnet' ? 'Devnet' : 'Mainnet'}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Token Status */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">Token</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Coins className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          {tokenMint ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-white">
                  {truncateKey(tokenMint)}
                </span>
                <button
                  onClick={() => copyToClipboard(tokenMint, 'token')}
                  className="text-[#71717a] hover:text-white transition-colors"
                >
                  {copiedField === 'token' ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={`${explorerBaseUrl}${tokenMint}${clusterParam}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#71717a] hover:text-purple-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-[#71717a] mt-1">
                Decimals: {tokenDecimals}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#52525b]">No token configured</p>
          )}
        </div>

        {/* Wallet Count */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">Wallets</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{walletCount}</p>
          <p className="text-xs text-[#71717a] mt-1">Active wallets</p>
        </div>

        {/* Total SOL Balance */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">Total SOL</span>
            <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-green-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatNumber(totalSolBalance)}
          </p>
          <p className="text-xs text-[#71717a] mt-1">SOL across all wallets</p>
        </div>

        {/* Total Token Balance */}
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">Total Tokens</span>
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatNumber(totalTokenBalance)}
          </p>
          <p className="text-xs text-[#71717a] mt-1">
            Tokens across all wallets
          </p>
        </div>
      </div>

      {/* Pool Info */}
      {poolAddress && (
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Droplets className="w-4 h-4 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Meteora DAMM v2 Pool
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-[#a1a1aa]">
              {truncateKey(poolAddress)}
            </span>
            <button
              onClick={() => copyToClipboard(poolAddress, 'pool')}
              className="text-[#71717a] hover:text-white transition-colors"
            >
              {copiedField === 'pool' ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <a
              href={`${explorerBaseUrl}${poolAddress}${clusterParam}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#71717a] hover:text-cyan-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map(({ label, module, icon: Icon, description, color }) => (
            <button
              key={module}
              onClick={() => onNavigate(module)}
              className={`bg-gradient-to-br ${color} bg-[#18181b] rounded-xl border border-[#27272a] p-5 text-left hover:border-[#3f3f46] transition-all group`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-[#27272a] flex items-center justify-center group-hover:bg-[#3f3f46] transition-colors">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowRight className="w-4 h-4 text-[#52525b] group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <h4 className="text-sm font-semibold text-white">{label}</h4>
              <p className="text-xs text-[#71717a] mt-1">{description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Recent Transactions
            </h3>
          </div>
          {logs.length > 0 && (
            <span className="text-xs text-[#71717a]">
              {logs.length} transaction{logs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
            <p className="text-sm text-[#52525b]">No transactions yet</p>
            <p className="text-xs text-[#3f3f46] mt-1">
              Transactions will appear here as you create tokens, distribute,
              and sell
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs
              .slice()
              .reverse()
              .slice(0, 50)
              .map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] transition-colors"
                >
                  {statusIcon[log.status]}
                  <span
                    className={`text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded ${
                      typeColors[log.type] || 'bg-[#27272a] text-[#a1a1aa]'
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="text-sm text-white flex-1 truncate">
                    {log.message}
                  </span>
                  {log.signature && log.signature !== 'N/A' && (
                    <a
                      href={`https://explorer.solana.com/tx/${log.signature}${clusterParam}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-[#71717a] hover:text-purple-400 transition-colors flex items-center gap-1"
                    >
                      {truncateKey(log.signature)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <span className="text-[10px] text-[#52525b] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
