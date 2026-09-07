import React, { useState } from 'react';
import { 
  TOKENS, 
  tokenBySymbol, 
  quoteBestRouteMultiHop, 
  buildMultiHopProgram 
} from '@soyaradex/sdk';
import { parseUnits, formatUnits } from 'viem';
import { Compass, ArrowRight, Route, ShieldCheck, Zap, Code, RefreshCw } from 'lucide-react';
import { formatPriceRate, formatTokenAmount } from '@/lib/client';

const TOKEN_LIST = Object.keys(TOKENS);

export const RouteSimulator: React.FC = () => {
  const [tokenInSym, setTokenInSym] = useState('USDC');
  const [tokenOutSym, setTokenOutSym] = useState('USDT');
  const [amountIn, setAmountIn] = useState('10');
  const [loading, setLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [calldata, setCalldata] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async () => {
    if (tokenInSym === tokenOutSym) {
      setError('Source and destination tokens must be different');
      return;
    }

    const tin = tokenBySymbol(tokenInSym);
    const tout = tokenBySymbol(tokenOutSym);
    if (!tin || !tout) return;

    setLoading(true);
    setError(null);
    setQuoteResult(null);
    setCalldata(null);

    try {
      const wgen = tokenBySymbol('WGEN')!;
      const tokenInAddr = tin.isNative ? wgen.address : tin.address;
      const tokenOutAddr = tout.isNative ? wgen.address : tout.address;
      const amountInWei = parseUnits(amountIn || '1', tin.decimals);

      const quote = await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, 'best');

      if (!quote || quote.amountOutRaw <= 0n) {
        setError('No liquid route found for this pair on Bradbury testnet.');
      } else {
        const outFormatted = formatUnits(quote.amountOutRaw, tout.decimals);
        setQuoteResult({
          ...quote,
          outFormatted,
          rate: parseFloat(amountIn) / parseFloat(outFormatted),
        });

        if (quote.hops && quote.hops.length > 0) {
          try {
            const hex = buildMultiHopProgram(
              { address: tokenInAddr, isNative: !!tin.isNative },
              { address: tokenOutAddr, isNative: !!tout.isNative },
              quote.hops,
              wgen.address
            );
            setCalldata(hex);
          } catch (e) {
            console.warn(e);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to simulate route');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-base font-semibold text-white">Aggregated Route & Pricing Simulator</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">Real-time Bradbury RPC</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-slate-400 uppercase font-mono mb-1 block">Sell Token</label>
          <select
            value={tokenInSym}
            onChange={(e) => setTokenInSym(e.target.value)}
            className="w-full bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
          >
            {TOKEN_LIST.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase font-mono mb-1 block">Amount In</label>
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            className="w-full bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
            placeholder="10"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase font-mono mb-1 block">Receive Token</label>
          <select
            value={tokenOutSym}
            onChange={(e) => setTokenOutSym(e.target.value)}
            className="w-full bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
          >
            {TOKEN_LIST.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="w-full h-[38px] rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span>Simulate Route</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {quoteResult && (
        <div className="p-4 rounded-xl bg-surface-200/80 border border-white/5 font-mono text-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Best Path:</span>
              <span className="font-bold text-cyan-300 uppercase px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30">
                {quoteResult.dex} {quoteResult.isMultiHop ? '(2-Hop Multi-Route)' : '(Direct)'}
              </span>
            </div>
            <div className="text-emerald-400 font-bold">
              Output: ≈ {quoteResult.outFormatted} {tokenOutSym}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
            <div className="p-2 rounded bg-surface-100 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Rate</span>
              <span className="font-semibold text-white">
                1 {tokenOutSym} ≈ {formatPriceRate(quoteResult.rate)} {tokenInSym}
              </span>
            </div>
            <div className="p-2 rounded bg-surface-100 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Price Impact</span>
              <span className="font-semibold text-amber-300">
                {quoteResult.priceImpactPct.toFixed(2)}%
              </span>
            </div>
            <div className="p-2 rounded bg-surface-100 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Entrypoint Fee</span>
              <span className="font-semibold text-slate-300">0.05% (5 BPS)</span>
            </div>
            <div className="p-2 rounded bg-surface-100 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Hop Count</span>
              <span className="font-semibold text-cyan-400">{quoteResult.hops?.length || 1} Hop(s)</span>
            </div>
          </div>

          {/* Hop breakdown */}
          {quoteResult.hops && quoteResult.hops.length > 0 && (
            <div className="p-2.5 rounded bg-surface-100 border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase block mb-1.5 font-semibold">
                Execution Hop Chain
              </span>
              <div className="space-y-1">
                {quoteResult.hops.map((hop: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[9px] font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-white font-medium uppercase">{hop.poolType}</span>
                    <span className="text-slate-500">Pool:</span>
                    <span className="text-slate-400 font-mono text-[10px] truncate max-w-[150px]">
                      {hop.pool}
                    </span>
                    {hop.fee && <span className="text-amber-400">({hop.fee / 10000}%)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calldata bytecode preview */}
          {calldata && (
            <div className="p-2.5 rounded bg-surface-100 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <Code className="w-3 h-3 text-cyan-400" /> AGGFlow Bytecode Program
                </span>
                <span className="text-[10px] text-slate-500">
                  {calldata.length / 2 - 1} bytes
                </span>
              </div>
              <div className="p-2 rounded bg-surface-300 font-mono text-[10px] text-slate-400 break-all select-all">
                {calldata}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
