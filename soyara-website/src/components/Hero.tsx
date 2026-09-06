'use client';

import React from 'react';
import Image from 'next/image';
import { 
  Sparkles, 
  ArrowUpRight, 
  Cpu, 
  Layers, 
  Terminal, 
  ShieldCheck, 
  Zap, 
  Activity,
  Bot
} from 'lucide-react';
import { XIcon, TelegramIcon } from './SocialIcons';

interface HeroProps {
  onExploreDemo: () => void;
}

export default function Hero({ onExploreDemo }: HeroProps) {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-black/10 dark:border-white/10">
      {/* Background glow and subtle grid */}
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-radial-glow pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono font-medium mb-8 tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#0047FF] animate-pulse" />
            <span>GENLAYER AI DEX • SOLANA & SUI MULTI-CHAIN HUB</span>
          </div>

          {/* Logo element accent */}
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full border-2 border-black/10 dark:border-white/20 p-1 bg-white dark:bg-black blue-glow-sm shadow-xl flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Soyara Logo"
                width={56}
                height={56}
                className="w-full h-full object-contain rounded-full"
                priority
              />
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-black dark:text-white leading-[1.08] font-sans">
            Contracts Can Think. <br />
            <span className="text-[#0047FF]">The AI Swapping DEX</span> <br className="hidden sm:inline" />
            on GenLayer.
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-black/70 dark:text-white/70 max-w-2xl font-normal leading-relaxed">
            Soyara brings non-deterministic intelligence to decentralized finance.
            Powered by GenLayer <span className="text-black dark:text-white font-semibold underline decoration-[#0047FF] underline-offset-4">Intelligent Contracts</span> with natural language trading, multi-validator AI discussions, and unified cross-chain liquidity across GenLayer, Solana, and Sui.
          </p>

          {/* Dual Action Gateways (app.soyara.xyz & trade.soyara.xyz) */}
          <div className="mt-10 w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Main GenLayer DEX Gateway */}
            <a
              href="https://app.soyara.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col p-5 rounded-2xl bg-black dark:bg-white text-white dark:text-black hover:bg-[#0047FF] dark:hover:bg-[#0047FF] dark:hover:text-white transition-all duration-200 text-left blue-glow-sm border border-black dark:border-white/20 hover:border-[#0047FF]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-[#0047FF] group-hover:text-white transition-colors" />
                  <span className="text-xs font-mono uppercase font-bold tracking-wider">
                    Main DEX
                  </span>
                </div>
                <div className="p-1 rounded-full bg-white/10 dark:bg-black/10 group-hover:bg-white/20 transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-lg font-bold font-mono tracking-tight">app.soyara.xyz</div>
              <p className="text-xs opacity-75 mt-1">
                GenLayer Intelligent Contracts • AI Discussions • Intent Swaps
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono opacity-90 group-hover:opacity-100">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0047FF] group-hover:bg-white animate-ping" />
                <span>Active Network • GenLayer Main DEX</span>
              </div>
            </a>

            {/* Solana & Sui DEX Gateway */}
            <a
              href="https://trade.soyara.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col p-5 rounded-2xl bg-white dark:bg-[#07090e] text-black dark:text-white hover:border-[#0047FF] transition-all duration-200 text-left border border-black/15 dark:border-white/15 hover:bg-[#0047FF]/5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#0047FF]" />
                  <span className="text-xs font-mono uppercase font-bold tracking-wider">
                    High-Speed DEX
                  </span>
                </div>
                <div className="p-1 rounded-full bg-black/5 dark:bg-white/10 group-hover:bg-[#0047FF] group-hover:text-white transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-lg font-bold font-mono tracking-tight">trade.soyara.xyz</div>
              <p className="text-xs text-black/60 dark:text-white/60 mt-1">
                Solana SVM & Sui Move Swaps • Deep Liquid Routing
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-black/70 dark:text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0047FF]" />
                <span>Sub-Second Velocity • Multi-Chain</span>
              </div>
            </a>
          </div>

          {/* Community Socials: X and Telegram */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://x.com/soyaraxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-black/15 dark:border-white/15 hover:border-[#0047FF] bg-black/[0.02] dark:bg-white/[0.03] hover:bg-[#0047FF]/10 text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] text-xs font-mono transition-all"
            >
              <XIcon className="w-3.5 h-3.5 text-[#0047FF]" />
              <span>x.com/soyaraxyz</span>
            </a>

            <a
              href="https://t.me/soyaradotxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-black/15 dark:border-white/15 hover:border-[#0047FF] bg-black/[0.02] dark:bg-white/[0.03] hover:bg-[#0047FF]/10 text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] text-xs font-mono transition-all"
            >
              <TelegramIcon className="w-3.5 h-3.5 text-[#0047FF]" />
              <span>t.me/soyaradotxyz</span>
            </a>
          </div>

          {/* Quick Simulation Anchor Button */}
          <div className="mt-4">
            <button
              onClick={onExploreDemo}
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-black/60 dark:text-white/60 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors py-2 px-4 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Terminal className="w-3.5 h-3.5 text-[#0047FF]" />
              <span>Test Interactive AI Swapping Simulator Below ↓</span>
            </button>
          </div>

          {/* Live Metrics Ribbon */}
          <div className="mt-14 w-full grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 pt-10 border-t border-black/10 dark:border-white/10">
            <div className="flex flex-col items-center sm:items-start p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
              <span className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50">
                Intelligent Contracts
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono mt-1">
                Thinking <span className="text-[#0047FF]">24/7</span>
              </span>
              <span className="text-[11px] text-black/60 dark:text-white/60 mt-1 font-sans">
                LLM-powered consensus
              </span>
            </div>

            <div className="flex flex-col items-center sm:items-start p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
              <span className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50">
                AI Consensus Latency
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono mt-1">
                0.04<span className="text-[#0047FF]">s</span>
              </span>
              <span className="text-[11px] text-black/60 dark:text-white/60 mt-1 font-sans">
                Validator debate & quorum
              </span>
            </div>

            <div className="flex flex-col items-center sm:items-start p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
              <span className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50">
                Networks Unified
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono mt-1">
                3 <span className="text-[#0047FF]">Chains</span>
              </span>
              <span className="text-[11px] text-black/60 dark:text-white/60 mt-1 font-sans">
                GenLayer • Solana • Sui
              </span>
            </div>

            <div className="flex flex-col items-center sm:items-start p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
              <span className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50">
                MEV Protection
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#0047FF] font-mono mt-1">
                100%
              </span>
              <span className="text-[11px] text-black/60 dark:text-white/60 mt-1 font-sans">
                AI-shielded execution
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
