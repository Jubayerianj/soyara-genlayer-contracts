import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, CheckCircle2, AlertCircle, HelpCircle, CornerDownLeft } from 'lucide-react';
import { parseConditionalIntent, createOrderFromIntent } from '@/lib/intentParser';
import { IntentOrder } from '@/types/order';

interface IntentInputProps {
  onAddOrder: (order: IntentOrder) => void;
}

const EXAMPLE_INTENTS = [
  'Buy 50 USDT of WBTC when 1 WBTC <= 2500 USDT',
  'Swap 20 USDC to USDT when rate >= 1.002',
  'Take profit: sell 10 FSWP for USDC at 15.0',
  'Stop loss: swap 1 WBTC to USDT when price <= 2200',
  'Swap 5 WGEN to USDC when price >= 1.20',
];

export const IntentInput: React.FC<IntentInputProps> = ({ onAddOrder }) => {
  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState(() => parseConditionalIntent(''));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setParsed(parseConditionalIntent(inputText));
  }, [inputText]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!parsed.isReady || !inputText.trim()) return;

    setIsSubmitting(true);
    const newOrder = createOrderFromIntent(parsed, inputText.trim());
    if (newOrder) {
      onAddOrder(newOrder);
      setInputText('');
    }
    setIsSubmitting(false);
  };

  const handleExampleClick = (example: string) => {
    setInputText(example);
  };

  return (
    <div className="glass-panel-glow rounded-2xl p-5 mb-6 border border-cyan-500/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-base font-semibold text-white">Create Intent-Based Conditional Order</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Powered by <span className="text-cyan-400 font-medium">@soyaradex/sdk</span>
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Describe your trading intent and trigger condition in natural language. The parser will extract assets, target trigger rates, and route constraints without ambiguous defaults.
      </p>

      {/* Main Input Form */}
      <form onSubmit={handleSubmit} className="relative mb-3">
        <div className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="e.g. Buy 50 USDT of WBTC when price <= 2500 USDT, or Stop loss: sell 1 WBTC when price <= 2200..."
            className="w-full bg-surface-200/90 text-white placeholder-slate-500 text-sm rounded-xl px-4 py-3.5 pr-28 border border-white/10 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all font-sans"
          />
          <button
            type="submit"
            disabled={!parsed.isReady || isSubmitting}
            className={`absolute right-2 top-2 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              parsed.isReady
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-md shadow-cyan-500/20'
                : 'bg-surface-50 text-slate-500 cursor-not-allowed border border-white/5'
            }`}
          >
            <span>Arm Keeper</span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Examples pills */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-[11px] text-slate-500 font-medium mr-1">Quick presets:</span>
        {EXAMPLE_INTENTS.map((ex, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleExampleClick(ex)}
            className="text-[11px] px-2.5 py-1 rounded-md bg-surface-100 hover:bg-surface-50 text-slate-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Live Intent Diagnostic / Parser Card */}
      {inputText.trim().length > 0 && (
        <div className="p-3.5 rounded-xl bg-surface-100/90 border border-white/5 text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
              Real-time Intent Diagnostics
            </span>
            <span
              className={`flex items-center gap-1 text-[11px] font-medium ${
                parsed.isReady ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {parsed.isReady ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Keeper
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" /> Under-specified
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 text-slate-300">
            <div className="p-2 rounded bg-surface-200 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Type</span>
              <span className="font-bold text-cyan-400">{parsed.orderType}</span>
            </div>
            <div className="p-2 rounded bg-surface-200 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Pair</span>
              <span className="font-bold text-white">
                {parsed.intent.tokenIn || '???'} → {parsed.intent.tokenOut || '???'}
              </span>
            </div>
            <div className="p-2 rounded bg-surface-200 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Amount In</span>
              <span className="font-bold text-white">
                {parsed.intent.amountIn ? `${parsed.intent.amountIn} ${parsed.intent.tokenIn}` : '???'}
              </span>
            </div>
            <div className="p-2 rounded bg-surface-200 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Trigger Condition</span>
              <span className="font-bold text-amber-400">
                {parsed.condition
                  ? `${parsed.condition.operator === 'GTE' ? '≥' : '≤'} ${parsed.condition.targetRate}`
                  : 'Pending'}
              </span>
            </div>
          </div>

          {parsed.needs.length > 0 && (
            <div className="mt-2 text-amber-400/90 text-[11px] flex items-start gap-1.5 bg-amber-950/20 p-2 rounded border border-amber-500/20">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Needs clarification: </span>
                {parsed.needs.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
