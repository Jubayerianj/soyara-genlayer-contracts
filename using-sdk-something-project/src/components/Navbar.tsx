import React from 'react';
import { ShieldCheck, BookOpen, Activity, Cpu, ExternalLink } from 'lucide-react';
import { EXPLORER_URL } from '@/lib/client';

interface NavbarProps {
  onOpenDocs: () => void;
  isKeeperRunning: boolean;
  onToggleKeeper: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDocs,
  isKeeperRunning,
  onToggleKeeper,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 lg:px-8 py-3.5 flex items-center justify-between">
      {/* Brand & Network */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 font-bold text-black text-lg">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">Soyara Keeper</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 font-mono font-medium uppercase">
                AI Intent Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              GenLayer Bradbury Testnet (Chain 4221) • Consensus-Gated Limit Orders
            </p>
          </div>
        </div>
      </div>

      {/* Center / Stats Badges */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 border border-white/5 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-accent-green" />
          <span>GenVM AI Consensus Gate</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 border border-white/5 text-xs text-slate-300">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>V2 + V3 Multi-Hop Aggregation</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Keeper Auto-Pilot Toggle */}
        <button
          onClick={onToggleKeeper}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isKeeperRunning
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
              : 'bg-surface-50 text-slate-400 border border-white/10 hover:text-white'
          }`}
        >
          <Activity className={`w-3.5 h-3.5 ${isKeeperRunning ? 'animate-pulse text-emerald-400' : ''}`} />
          <span>Keeper Engine: {isKeeperRunning ? 'Active' : 'Paused'}</span>
        </button>

        {/* Docs Button */}
        <button
          onClick={onOpenDocs}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-medium transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Docs & Architecture</span>
        </button>

        {/* Explorer Link */}
        <a
          href={EXPLORER_URL}
          target="_blank"
          rel="noreferrer"
          className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-surface-100 text-slate-400 hover:text-white border border-white/5 text-xs transition-colors"
        >
          <span>Explorer</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </header>
  );
};
