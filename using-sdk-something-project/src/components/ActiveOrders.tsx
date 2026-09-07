import React, { useState } from 'react';
import { IntentOrder } from '@/types/order';
import { formatPriceRate } from '@/lib/client';
import { 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle, 
  Trash2, 
  Play, 
  Code, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Layers
} from 'lucide-react';

interface ActiveOrdersProps {
  orders: IntentOrder[];
  onCancelOrder: (id: string) => void;
  onManualTrigger: (id: string) => void;
  onRefreshOrder: (id: string) => void;
}

export const ActiveOrders: React.FC<ActiveOrdersProps> = ({
  orders,
  onCancelOrder,
  onManualTrigger,
  onRefreshOrder,
}) => {
  const [expandedCalldata, setExpandedCalldata] = useState<string | null>(null);

  const getStatusBadge = (status: IntentOrder['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            MONITORING
          </span>
        );
      case 'EVALUATING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-blue-950/80 text-blue-400 border border-blue-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            CHECKING POOLS
          </span>
        );
      case 'TRIGGERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-950/80 text-amber-300 border border-amber-500/30">
            <Sparkles className="w-3 h-3 animate-bounce" />
            TRIGGER CONDITION MET
          </span>
        );
      case 'VALIDATING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-purple-950/80 text-purple-300 border border-purple-500/30">
            <ShieldCheck className="w-3 h-3 animate-pulse" />
            GENVM AI CONSENSUS
          </span>
        );
      case 'EXECUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            SETTLED & EXECUTED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-rose-950/80 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-slate-800 text-slate-400">
            CANCELLED
          </span>
        );
    }
  };

  const getOrderTypeColor = (type: IntentOrder['type']) => {
    switch (type) {
      case 'LIMIT_BUY':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'LIMIT_SELL':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'STOP_LOSS':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'TAKE_PROFIT':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 mb-6 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-base font-semibold text-white">Active Keeper Orders & Triggers</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {orders.length} order{orders.length !== 1 ? 's' : ''} in registry
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-surface-200/50">
          <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">No intent orders active</p>
          <p className="text-xs text-slate-500 mt-1">
            Type a natural language condition above to arm the keeper daemon.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {orders.map((order) => {
            const isMet =
              order.currentRate !== undefined &&
              order.condition &&
              ((order.condition.operator === 'LTE' && order.currentRate <= order.condition.targetRate) ||
                (order.condition.operator === 'GTE' && order.currentRate >= order.condition.targetRate));

            const pctDistance =
              order.currentRate !== undefined && order.condition
                ? ((order.currentRate - order.condition.targetRate) / order.condition.targetRate) * 100
                : null;

            return (
              <div
                key={order.id}
                className={`p-4 rounded-xl border transition-all ${
                  order.status === 'TRIGGERED' || order.status === 'VALIDATING'
                    ? 'bg-surface-100/90 border-amber-500/40 shadow-lg shadow-amber-500/5'
                    : order.status === 'EXECUTED'
                    ? 'bg-surface-100/60 border-emerald-500/30'
                    : 'bg-surface-100/80 border-white/5 hover:border-white/15'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border font-mono ${getOrderTypeColor(
                        order.type
                      )}`}
                    >
                      {order.type.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-bold text-white flex items-center gap-1.5 font-mono">
                      <span>{order.amountIn} {order.tokenIn}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-cyan-300">{order.tokenOut}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(order.status)}

                    {order.status !== 'EXECUTED' && (
                      <button
                        onClick={() => onManualTrigger(order.id)}
                        title="Simulate Trigger and Validate"
                        className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs transition-colors"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      onClick={() => onCancelOrder(order.id)}
                      title="Cancel / Remove Order"
                      className="p-1.5 rounded-lg bg-surface-50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/5 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Prompt quote */}
                <p className="text-xs text-slate-400 italic mb-3 bg-surface-200/60 px-3 py-1.5 rounded-lg border border-white/5">
                  &ldquo;{order.userPrompt}&rdquo;
                </p>

                {/* Condition and Live Metric Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono mb-3">
                  {/* Condition target */}
                  <div className="p-2.5 rounded-lg bg-surface-200/90 border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Target Condition</span>
                    <span className="font-semibold text-amber-300">
                      1 {order.tokenOut} {order.condition.operator === 'GTE' ? '≥' : '≤'}{' '}
                      {formatPriceRate(order.condition.targetRate)} {order.tokenIn}
                    </span>
                  </div>

                  {/* Live execution rate */}
                  <div className="p-2.5 rounded-lg bg-surface-200/90 border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Live Execution Rate</span>
                    <span className={`font-semibold ${isMet ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {order.currentRate !== undefined ? (
                        <>
                          {formatPriceRate(order.currentRate)} {order.tokenIn}
                          {pctDistance !== null && (
                            <span className="text-[10px] ml-1.5 font-normal opacity-80">
                              ({pctDistance > 0 ? '+' : ''}
                              {pctDistance.toFixed(2)}%)
                            </span>
                          )}
                        </>
                      ) : (
                        'Querying...'
                      )}
                    </span>
                  </div>

                  {/* Best Route */}
                  <div className="p-2.5 rounded-lg bg-surface-200/90 border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Aggregated Route</span>
                    <span className="font-semibold text-cyan-300 flex items-center gap-1 truncate">
                      {order.bestRoute ? (
                        <>
                          <span className="uppercase text-[11px] bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-500/30">
                            {order.bestRoute.dex}
                          </span>
                          <span className="text-[11px] text-slate-300 truncate">
                            ≈ {order.bestRoute.amountOutFormatted} {order.tokenOut}
                          </span>
                        </>
                      ) : (
                        'Finding path...'
                      )}
                    </span>
                  </div>
                </div>

                {/* Validation Banner if in progress or completed */}
                {order.validationStatus && (
                  <div className="mt-2 text-xs font-mono p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/20 text-purple-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      <span>
                        Consensus Verdict:{' '}
                        <strong className="text-white">
                          {order.validationStatus.approved ? 'APPROVED' : 'REJECTED'}
                        </strong>{' '}
                        ({order.validationStatus.phase})
                      </span>
                    </div>
                    {order.validationStatus.txHash && (
                      <span className="text-[10px] text-purple-400 truncate max-w-[140px]">
                        Tx: {order.validationStatus.txHash.slice(0, 10)}...
                      </span>
                    )}
                  </div>
                )}

                {/* Settlement Banner if executed */}
                {order.executionReceipt && (
                  <div className="mt-2 text-xs font-mono p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Settled via AGGFlow: <strong className="text-white">+{order.executionReceipt.amountOut} {order.tokenOut}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tx: {order.executionReceipt.txHash.slice(0, 10)}...
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
