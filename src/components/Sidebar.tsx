'use client';

import { useState } from 'react';
import { Flame, Coins, Wallet, Droplets, TrendingDown, LayoutDashboard, Settings2, ShieldOff, Activity, Lock, DollarSign, Loader2, Rocket, FileEdit, EyeOff } from 'lucide-react';
import type { AppModule } from '@/types';

interface SidebarProps {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  network: 'devnet' | 'mainnet-beta';
  onNetworkChange: (network: 'devnet' | 'mainnet-beta') => void;
  onClaimFees?: () => Promise<string | null>;
}

const modules: { id: AppModule; label: string; icon: typeof Flame }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'token', label: 'Create Token', icon: Coins },
  { id: 'edit-metadata', label: 'Edit Metadata', icon: FileEdit },
  { id: 'wallets', label: 'Wallets', icon: Wallet },
  { id: 'stealth-fund', label: 'Stealth Fund', icon: EyeOff },
  { id: 'pool', label: 'Create Pool', icon: Droplets },
  { id: 'pool-v1', label: 'Pool V1 + Stake', icon: Lock },
  { id: 'pool-manage', label: 'Manage Pool', icon: Settings2 },
  { id: 'sell', label: 'Sell Strategy', icon: TrendingDown },
  { id: 'revoke', label: 'Revoke Auth', icon: ShieldOff },
  { id: 'market-making', label: 'Market Making', icon: Activity },
  { id: 'alpha-vault', label: 'Alpha Vault', icon: Rocket },
];

export default function Sidebar({
  activeModule,
  onModuleChange,
  network,
  onNetworkChange,
  onClaimFees,
}: SidebarProps) {
  const [claimingFees, setClaimingFees] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);

  const handleQuickClaim = async () => {
    if (!onClaimFees || claimingFees) return;
    setClaimingFees(true);
    setClaimResult(null);
    try {
      const result = await onClaimFees();
      setClaimResult(result || 'No fees to claim');
    } catch (err) {
      setClaimResult('Failed');
    } finally {
      setClaimingFees(false);
      setTimeout(() => setClaimResult(null), 3000);
    }
  };
  return (
    <aside className="w-64 min-h-screen bg-[#111113] border-r border-[#27272a] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-[#27272a]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">LauncherFuego</h1>
            <p className="text-xs text-[#71717a]">Token Launch Suite</p>
          </div>
        </div>
      </div>

      {/* Network Selector */}
      <div className="px-4 py-4 border-b border-[#27272a]">
        <label className="text-xs text-[#71717a] uppercase tracking-wider font-medium mb-2 block">
          Network
        </label>
        <div className="flex rounded-lg overflow-hidden border border-[#27272a]">
          <button
            onClick={() => onNetworkChange('devnet')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              network === 'devnet'
                ? 'bg-purple-500/20 text-purple-400 border-r border-[#27272a]'
                : 'bg-[#18181b] text-[#71717a] border-r border-[#27272a] hover:text-white'
            }`}
          >
            Devnet
          </button>
          <button
            onClick={() => onNetworkChange('mainnet-beta')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              network === 'mainnet-beta'
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-[#18181b] text-[#71717a] hover:text-white'
            }`}
          >
            Mainnet
          </button>
        </div>
        <div className={`mt-2 flex items-center gap-1.5 ${
          network === 'devnet' ? 'text-purple-400' : 'text-orange-400'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            network === 'devnet' ? 'bg-purple-400' : 'bg-orange-400'
          } animate-pulse`} />
          <span className="text-[10px] font-medium uppercase tracking-wider">
            {network === 'devnet' ? 'Test Network' : 'Live Network'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {modules.map(({ id, label, icon: Icon }) => (
          <div key={id} className="flex items-center gap-1">
            <button
              onClick={() => onModuleChange(id)}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeModule === id
                  ? 'bg-purple-500/15 text-purple-400 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.2)]'
                  : 'text-[#a1a1aa] hover:bg-[#1c1c1f] hover:text-white'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </button>
            {id === 'pool-manage' && onClaimFees && (
              <button
                onClick={handleQuickClaim}
                disabled={claimingFees}
                title={claimResult || 'Quick Claim Fees'}
                className={`p-2.5 rounded-lg transition-all shrink-0 ${
                  claimResult
                    ? 'bg-green-500/15 text-green-400'
                    : claimingFees
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'text-[#71717a] hover:bg-green-500/15 hover:text-green-400'
                }`}
              >
                {claimingFees ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#27272a]">
        <p className="text-[10px] text-[#52525b] text-center">
          Built for Solana Token Launches
        </p>
      </div>
    </aside>
  );
}
