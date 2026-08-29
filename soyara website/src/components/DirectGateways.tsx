'use client';

import React from 'react';
import { 
  Cpu, 
  Layers, 
  ArrowUpRight, 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

export default function DirectGateways() {
  return (
    <section className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SOYARA ECOSYSTEM GATEWAYS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            Choose Your <span className="text-[#0047FF]">Trading Terminal</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            Access the main GenLayer Intelligent DEX or the high-speed Solana & Sui swap engine.
          </p>
        </div>

        {/* Dual Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* Card 1: app.soyara.xyz */}
          <div className="relative rounded-3xl border-2 border-[#0047FF] bg-white dark:bg-[#07090e] p-8 sm:p-10 shadow-2xl flex flex-col justify-between blue-glow">
            <div className="absolute top-6 right-6">
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-[#0047FF] text-white">
                PRIMARY DEX
              </span>
            </div>

            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#0047FF]/10 text-[#0047FF] flex items-center justify-center mb-6">
                <Cpu className="w-6 h-6" />
              </div>

              <span className="text-xs font-mono text-[#0047FF] uppercase tracking-widest font-bold block mb-1">
                GenLayer Network
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono">
                app.soyara.xyz
              </h3>
              <p className="text-sm text-black/70 dark:text-white/70 mt-3 font-sans leading-relaxed">
                The flagship AI swapping terminal on GenLayer. Deploy and execute Intelligent Contracts that think, read live web APIs, and deliberate with validator LLM consensus.
              </p>

              <div className="mt-6 space-y-3 font-mono text-xs text-black/80 dark:text-white/80">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Natural language & prompt-based intent swaps</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Intelligent contracts with web and sentiment oracles</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Validator AI discussions for subjective dispute resolution</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>100% MEV-shielded execution</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 mb-4">
                <span>Network: GenLayer Testnet / Mainnet</span>
                <span className="text-[#0047FF] font-semibold">● 99.98% Uptime</span>
              </div>
              <a
                href="https://app.soyara.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-[#0047FF] hover:bg-[#0037cc] text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-[#0047FF]/25 active:scale-98"
              >
                <span>Launch GenLayer DEX (app.soyara.xyz)</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Card 2: trade.soyara.xyz */}
          <div className="relative rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] p-8 sm:p-10 shadow-xl flex flex-col justify-between hover:border-[#0047FF] transition-all">
            <div className="absolute top-6 right-6">
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-black/10 dark:bg-white/10 text-black dark:text-white">
                HIGH VELOCITY
              </span>
            </div>

            <div>
              <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/10 text-black dark:text-white flex items-center justify-center mb-6">
                <Layers className="w-6 h-6" />
              </div>

              <span className="text-xs font-mono text-black/50 dark:text-white/50 uppercase tracking-widest font-bold block mb-1">
                Solana SVM & Sui Move
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono">
                trade.soyara.xyz
              </h3>
              <p className="text-sm text-black/70 dark:text-white/70 mt-3 font-sans leading-relaxed">
                The sub-second multi-chain trading terminal for Solana and Sui networks. Instant swaps, low latency, deep liquidity routing, and atomic cross-chain rebalancing.
              </p>

              <div className="mt-6 space-y-3 font-mono text-xs text-black/80 dark:text-white/80">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Sub-second finality on Solana SVM and Sui Move</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Deep liquidity aggregations (Raydium, Orca, Cetus)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Seamless bridge routes into GenLayer intelligent pool</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                  <span>Micro-transaction fees (&lt;$0.001)</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 mb-4">
                <span>Networks: Solana SVM & Sui Move</span>
                <span className="text-[#0047FF] font-semibold">● 99.99% Uptime</span>
              </div>
              <a
                href="https://trade.soyara.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-black dark:bg-white hover:bg-[#0047FF] dark:hover:bg-[#0047FF] text-white dark:text-black dark:hover:text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-98"
              >
                <span>Launch Solana & Sui DEX (trade.soyara.xyz)</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
