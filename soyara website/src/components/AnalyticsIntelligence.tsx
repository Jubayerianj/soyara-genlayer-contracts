'use client';

import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  Layers,
  ArrowUpRight,
  Sparkles,
  PieChart
} from 'lucide-react';

export default function AnalyticsIntelligence() {
  const [activeMetricTime, setActiveMetricTime] = useState<'24h' | '7d' | '30d'>('24h');

  return (
    <section id="analytics" className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>ANALYTICS INTELLIGENCE</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            AI-Driven Market <span className="text-[#0047FF]">Intelligence</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            Soyara monitors on-chain order flow, web sentiment, cross-chain arbitrage, and validator consensus health in real time.
          </p>

          {/* Timefilter */}
          <div className="mt-6 inline-flex p-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
            {(['24h', '7d', '30d'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setActiveMetricTime(period)}
                className={`px-4 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  activeMetricTime === period
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white'
                }`}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 KPI Intelligence Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          
          {/* Card 1: AI Sentiment Confidence */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] shadow-sm hover:border-[#0047FF] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 mb-4">
              <span>GLOBAL SENTIMENT INDEX</span>
              <Activity className="w-4 h-4 text-[#0047FF]" />
            </div>
            <div className="text-4xl font-extrabold text-black dark:text-white font-mono">
              91.4<span className="text-lg text-[#0047FF]">/100</span>
            </div>
            <div className="text-xs font-mono text-[#0047FF] mt-2 flex items-center gap-1">
              <span>▲ +6.8% Bullish Consensus</span>
            </div>
            {/* Blue Progress Bar */}
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 mt-4 overflow-hidden">
              <div className="h-full bg-[#0047FF] rounded-full w-[91.4%]" />
            </div>
            <p className="text-xs text-black/60 dark:text-white/60 mt-4 font-sans">
              Computed from 18,400+ on-chain queries and verified web sentiment across GenLayer LLM nodes.
            </p>
          </div>

          {/* Card 2: MEV Shield Rate */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] shadow-sm hover:border-[#0047FF] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 mb-4">
              <span>MEV & SANDWICH DEFENSE</span>
              <ShieldCheck className="w-4 h-4 text-[#0047FF]" />
            </div>
            <div className="text-4xl font-extrabold text-black dark:text-white font-mono">
              100<span className="text-lg text-[#0047FF]">%</span>
            </div>
            <div className="text-xs font-mono text-[#0047FF] mt-2 flex items-center gap-1">
              <span>Zero Reverts &bull; AI Protected</span>
            </div>
            {/* Blue Progress Bar */}
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 mt-4 overflow-hidden">
              <div className="h-full bg-[#0047FF] rounded-full w-[100%]" />
            </div>
            <p className="text-xs text-black/60 dark:text-white/60 mt-4 font-sans">
              Intelligent contracts shield trades by ensuring validator quorum verifies execution before committing state.
            </p>
          </div>

          {/* Card 3: Multi-Chain Volume Routed */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] shadow-sm hover:border-[#0047FF] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 mb-4">
              <span>UNIFIED ECOSYSTEM VOLUME</span>
              <Zap className="w-4 h-4 text-[#0047FF]" />
            </div>
            <div className="text-4xl font-extrabold text-black dark:text-white font-mono">
              $148.4<span className="text-lg text-[#0047FF]">M</span>
            </div>
            <div className="text-xs font-mono text-[#0047FF] mt-2 flex items-center gap-1">
              <span>Across GenLayer, Solana & Sui</span>
            </div>
            {/* Blue Progress Bar */}
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 mt-4 overflow-hidden">
              <div className="h-full bg-[#0047FF] rounded-full w-[78%]" />
            </div>
            <p className="text-xs text-black/60 dark:text-white/60 mt-4 font-sans">
              Seamless cross-chain liquidity routed between app.soyara.xyz and trade.soyara.xyz.
            </p>
          </div>

        </div>

        {/* Detailed Analytics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Chart Box 1: Multi-Chain Volume Distribution */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white font-mono">
                  Volume by Ecosystem Hub
                </h3>
                <span className="text-xs text-black/50 dark:text-white/50 font-sans">
                  Distribution of settled swap volume
                </span>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/20">
                Live Data
              </span>
            </div>

            {/* Visual Bars (strictly black, white, blue) */}
            <div className="space-y-4 font-mono text-xs">
              <div>
                <div className="flex justify-between text-black dark:text-white mb-1.5">
                  <span className="font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0047FF]" />
                    GenLayer Intelligent DEX (app.soyara.xyz)
                  </span>
                  <span>54% ($80.1M)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-[#0047FF] rounded-full w-[54%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-black dark:text-white mb-1.5">
                  <span className="font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                    Solana SVM Fast DEX (trade.soyara.xyz)
                  </span>
                  <span>28% ($41.5M)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-[#2563EB] rounded-full w-[28%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-black dark:text-white mb-1.5">
                  <span className="font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]" />
                    Sui Move Parallel DEX (trade.soyara.xyz)
                  </span>
                  <span>18% ($26.8M)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-[#60A5FA] rounded-full w-[18%]" />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs font-mono text-black/60 dark:text-white/60">
              <span>Arbitrage Rebalancing: Synchronized</span>
              <span className="text-[#0047FF] font-semibold">99.98% Accuracy</span>
            </div>
          </div>

          {/* Chart Box 2: Validator Consensus Latency vs Block Complexity */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white font-mono">
                  Intelligent Consensus Latency
                </h3>
                <span className="text-xs text-black/50 dark:text-white/50 font-sans">
                  Time to reach subjective quorum across LLM nodes
                </span>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-black/5 dark:bg-white/10 text-black dark:text-white">
                Avg 42ms
              </span>
            </div>

            {/* Simulated Latency Histogram (all pure blue & white/black) */}
            <div className="grid grid-cols-7 gap-2 h-36 items-end pt-4 pb-2 border-b border-black/10 dark:border-white/10">
              {[45, 65, 85, 38, 92, 50, 78].map((height, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <div 
                    style={{ height: `${height}%` }}
                    className="w-full rounded-t-lg bg-[#0047FF] hover:opacity-80 transition-all cursor-pointer"
                    title={`Cycle ${i + 1}: ${height}ms latency`}
                  />
                  <span className="text-[10px] font-mono text-black/40 dark:text-white/40">
                    C-{i + 1}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-black/70 dark:text-white/70">
                <span className="w-2 h-2 rounded-full bg-[#0047FF]" />
                <span>Non-deterministic resolution speed: Sub-second</span>
              </div>
              <a
                href="https://app.soyara.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0047FF] font-bold hover:underline flex items-center gap-1"
              >
                <span>Explore GenLayer Explorer</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
