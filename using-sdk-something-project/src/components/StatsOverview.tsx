import React from 'react';
import { Target, Layers, ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { IntentOrder } from '@/types/order';

interface StatsOverviewProps {
  orders: IntentOrder[];
  isKeeperRunning: boolean;
  pulseCount: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  orders,
  isKeeperRunning,
  pulseCount,
}) => {
  const pendingCount = orders.filter(o => o.status === 'PENDING' || o.status === 'EVALUATING').length;
  const executedCount = orders.filter(o => o.status === 'EXECUTED').length;
  const validatingCount = orders.filter(o => o.status === 'VALIDATING' || o.status === 'TRIGGERED').length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
      {/* Stat 1: Pending Triggers */}
      <div className="glass-panel p-4 rounded-xl border border-white/5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">Monitored Intents</span>
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Target className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white font-mono">{pendingCount}</span>
          <span className="text-xs text-slate-400">active orders</span>
        </div>
        <div className="mt-2 text-[11px] text-cyan-400/90 flex items-center gap-1 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          Live pool price polling
        </div>
      </div>

      {/* Stat 2: Keeper Pulse Engine */}
      <div className="glass-panel p-4 rounded-xl border border-white/5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">Keeper Engine Pulse</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-emerald-400 font-mono">#{pulseCount}</span>
          <span className="text-xs text-slate-400">cycles run</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 font-mono">
          {isKeeperRunning ? 'Polling every 4s' : 'Engine Idle'}
        </div>
      </div>

      {/* Stat 3: Consensus In-Flight */}
      <div className="glass-panel p-4 rounded-xl border border-white/5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">Consensus Gated</span>
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-purple-300 font-mono">{validatingCount}</span>
          <span className="text-xs text-slate-400">in-flight round(s)</span>
        </div>
        <div className="mt-2 text-[11px] text-purple-400/90 font-mono">
          GenVM AI VRF Verification
        </div>
      </div>

      {/* Stat 4: Executed Settled */}
      <div className="glass-panel p-4 rounded-xl border border-white/5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">Settled Executions</span>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-amber-300 font-mono">{executedCount}</span>
          <span className="text-xs text-slate-400">completed</span>
        </div>
        <div className="mt-2 text-[11px] text-amber-400/90 font-mono">
          AGGFlow EVM Router
        </div>
      </div>
    </div>
  );
};
