'use client';

import React, { useState } from 'react';
import { 
  Layers, 
  Cpu, 
  ArrowUpRight, 
  ExternalLink, 
  Zap, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  GitBranch
} from 'lucide-react';

export default function MultiChainEcosystem() {
  const [selectedChain, setSelectedChain] = useState<'genlayer' | 'solana' | 'sui'>('genlayer');

  const chains = {
    genlayer: {
      name: 'GenLayer Network',
      badge: 'Main Intelligence Layer',
      dexUrl: 'https://app.soyara.xyz',
      urlLabel: 'app.soyara.xyz',
      role: 'The Reasoning Brain & Intelligent Intent Engine',
      contractLang: 'Python Intelligent Contracts',
      consensus: 'BFT-LLM Consensus with Validator AI Discussions',
      features: [
        'Contracts can think: execute natural language intent instructions',
        'Native web internet browsing and subjective sentiment feeds',
        'Validator AI discussions before committing transaction states',
        'Total immunization against sandwich attacks and predatory MEV'
      ],
      speed: 'Sub-second AI Quorum',
      cost: 'Near-Zero Gas via GenLayer'
    },
    solana: {
      name: 'Solana SVM',
      badge: 'High-Velocity Trading',
      dexUrl: 'https://trade.soyara.xyz',
      urlLabel: 'trade.soyara.xyz',
      role: 'Sub-Second Liquidity & Order Book Execution',
      contractLang: 'Rust / SVM',
      consensus: 'Proof of History (PoH) + Tower BFT',
      features: [
        'Sub-second finality for rapid limit orders and high-frequency swaps',
        'Deep institutional liquidity across Raydium & Orca pool routers',
        'Atomic bridge pathways directly into Soyara GenLayer contracts',
        'Ultra-low network transaction fees (<$0.0005)'
      ],
      speed: '400ms Finality',
      cost: '<$0.001 per swap'
    },
    sui: {
      name: 'Sui Network',
      badge: 'Parallel Move Execution',
      dexUrl: 'https://trade.soyara.xyz',
      urlLabel: 'trade.soyara.xyz',
      role: 'Object-Centric Parallel Liquidity Pools',
      contractLang: 'Sui Move',
      consensus: 'Mysticeti / Narwhal & Bullshark DAG',
      features: [
        'Object-centric architecture enabling zero-contention parallel swaps',
        'Formal verification through Sui Move type-safety',
        'Deep liquidity routing through Cetus and Turbos adapters',
        'Predictable low gas fees with horizontal scaling'
      ],
      speed: '390ms Finality',
      cost: '<$0.002 per swap'
    }
  };

  const current = chains[selectedChain];

  return (
    <section id="multichain" className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <Layers className="w-3.5 h-3.5" />
            <span>CROSS-ECOSYSTEM ARCHITECTURE</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            GenLayer Intelligence Meets <br />
            <span className="text-[#0047FF]">Solana & Sui Velocity</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            Soyara unifies the intelligent reasoning of GenLayer with the extreme throughput of Solana SVM and Sui Move.
          </p>
        </div>

        {/* Chain Selector Tabs */}
        <div className="max-w-2xl mx-auto flex p-1.5 rounded-2xl border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] mb-12">
          <button
            onClick={() => setSelectedChain('genlayer')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all flex items-center justify-center gap-2 ${
              selectedChain === 'genlayer'
                ? 'bg-[#0047FF] text-white shadow-md'
                : 'text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>GenLayer (Main)</span>
          </button>
          
          <button
            onClick={() => setSelectedChain('solana')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all flex items-center justify-center gap-2 ${
              selectedChain === 'solana'
                ? 'bg-[#0047FF] text-white shadow-md'
                : 'text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Solana SVM</span>
          </button>

          <button
            onClick={() => setSelectedChain('sui')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all flex items-center justify-center gap-2 ${
              selectedChain === 'sui'
                ? 'bg-[#0047FF] text-white shadow-md'
                : 'text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Sui Move</span>
          </button>
        </div>

        {/* Selected Chain Details Card */}
        <div className="max-w-4xl mx-auto rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] p-6 sm:p-10 shadow-2xl blue-glow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-6 mb-8">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white font-mono">
                  {current.name}
                </h3>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/30">
                  {current.badge}
                </span>
              </div>
              <p className="text-sm text-black/60 dark:text-white/60 mt-1 font-sans">
                {current.role}
              </p>
            </div>

            <a
              href={current.dexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95"
            >
              <span>Launch {current.urlLabel}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>

          {/* Key Specs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
              <span className="text-xs font-mono text-black/50 dark:text-white/50 block">Contract Runtime</span>
              <span className="text-sm font-bold font-mono text-black dark:text-white mt-1 block">
                {current.contractLang}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
              <span className="text-xs font-mono text-black/50 dark:text-white/50 block">Consensus Mechanism</span>
              <span className="text-sm font-bold font-mono text-black dark:text-white mt-1 block">
                {current.consensus}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
              <span className="text-xs font-mono text-black/50 dark:text-white/50 block">Execution Speed</span>
              <span className="text-sm font-bold font-mono text-[#0047FF] mt-1 block">
                {current.speed}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
              <span className="text-xs font-mono text-black/50 dark:text-white/50 block">Average Fee</span>
              <span className="text-sm font-bold font-mono text-black dark:text-white mt-1 block">
                {current.cost}
              </span>
            </div>
          </div>

          {/* Features List */}
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50 mb-3">
              Capabilities on Soyara
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {current.features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] text-xs font-sans text-black/80 dark:text-white/80"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0047FF] flex-shrink-0 mt-1.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Endpoints banner */}
          <div className="mt-8 pt-6 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-black/60 dark:text-white/60 gap-3">
            <span>Primary Gateway: <strong className="text-black dark:text-white">{current.urlLabel}</strong></span>
            <div className="flex items-center gap-3">
              <a href="https://app.soyara.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
                app.soyara.xyz (GenLayer)
              </a>
              <span>&bull;</span>
              <a href="https://trade.soyara.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
                trade.soyara.xyz (Solana & Sui)
              </a>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
