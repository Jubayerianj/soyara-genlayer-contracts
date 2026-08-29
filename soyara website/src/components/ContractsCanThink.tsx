'use client';

import React, { useState } from 'react';
import { 
  Brain, 
  Cpu, 
  Code2, 
  Check, 
  Globe, 
  ShieldAlert, 
  Sparkles,
  ArrowRight,
  ChevronRight
} from 'lucide-react';

export default function ContractsCanThink() {
  const [activeCodeTab, setActiveCodeTab] = useState<'genlayer' | 'legacy'>('genlayer');

  const genlayerCode = `# Soyara GenLayer Intelligent Contract (Python)
import genlayer as gl

class SoyaraIntelligentSwap:
    def __init__(self):
        self.min_sentiment_threshold = 85
        self.max_volatility = 0.035

    @gl.public.write
    def execute_intelligent_intent(self, user_intent: str, amount_usdc: int) -> bool:
        # 1. Contract reads live web & social sentiment natively
        news_data = gl.get_web_page("https://api.crypto-sentiment.live/gen")
        
        # 2. LLM evaluates subjective condition on-chain
        analysis = gl.llm_call(
            prompt=f"Assess if market conditions match user intent: '{user_intent}'. "
                   f"Market Data: {news_data}. Respond with JSON {\\'valid\\': bool, \\'reason\\': str}."
        )
        
        if not analysis.valid:
            gl.rollback(f"Contract decided: Conditions not met -> {analysis.reason}")
            
        # 3. Non-deterministic execution verified by validator quorum
        self._settle_trade(amount_usdc, target_asset="GEN")
        return True`;

  const legacyCode = `// Legacy Solidity Smart Contract (Rigid & Blind)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LegacyDEX {
    // ❌ Cannot read internet or web pages
    // ❌ Cannot parse natural language or intents
    // ❌ Vulnerable to sandwich attacks and MEV frontrunning
    // ❌ Rigid numbers only; zero reasoning capability

    function swapTokens(uint256 amountIn, uint256 minAmountOut) external {
        require(amountIn > 0, "Invalid amount");
        // Rigid mathematical formula with no context awareness
        uint256 amountOut = getAmountOut(amountIn);
        require(amountOut >= minAmountOut, "Slippage error");
        _transfer(msg.sender, amountOut);
    }
}`;

  return (
    <section id="intelligent-contracts" className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Title */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <Brain className="w-3.5 h-3.5" />
            <span>INTELLIGENT CONTRACTS ON GENLAYER</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            Contracts That <span className="text-[#0047FF]">Actually Think</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            For the last decade, smart contracts have been blind deterministic state calculators.
            GenLayer introduces Intelligent Contracts—contracts capable of reasoning, browsing the live web, and resolving subjective intent.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {/* Column 1: Legacy */}
          <div className="p-6 sm:p-8 rounded-3xl border border-black/15 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50">
                  Legacy Architecture
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded border border-black/20 dark:border-white/20 text-black/70 dark:text-white/70">
                  Solidity / EVM
                </span>
              </div>
              <h3 className="text-2xl font-bold text-black dark:text-white font-sans">
                Deterministic Smart Contracts
              </h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                Rigid, deaf, and blind execution. Any real-world logic requires centralized off-chain oracles.
              </p>

              <div className="mt-6 space-y-3 font-mono text-xs text-black/80 dark:text-white/80">
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40" />
                  <span>Only understands exact numbers and binary conditions</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40" />
                  <span>Cannot access web APIs or live internet without third parties</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40" />
                  <span>Predictable execution targets for predatory MEV bots</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40" />
                  <span>Requires complex multi-step transactions for simple intents</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10 text-xs font-mono text-black/40 dark:text-white/40">
              Status: Outdated Paradigm
            </div>
          </div>

          {/* Column 2: Soyara GenLayer */}
          <div className="p-6 sm:p-8 rounded-3xl border-2 border-[#0047FF] bg-white dark:bg-[#07090e] flex flex-col justify-between blue-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-[#0047FF] text-white">
                GENLAYER PARADIGM
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-5 h-5 text-[#0047FF]" />
                <span className="text-xs font-mono uppercase tracking-wider text-[#0047FF] font-bold">
                  Next-Gen Intelligence
                </span>
              </div>
              <h3 className="text-2xl font-bold text-black dark:text-white font-sans">
                Soyara Intelligent Contracts
              </h3>
              <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                Living on-chain software powered by LLMs in consensus. Capable of reasoning, internet access, and subjective verification.
              </p>

              <div className="mt-6 space-y-3 font-mono text-xs text-black dark:text-white">
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[#0047FF]/30 bg-[#0047FF]/5">
                  <Check className="w-4 h-4 text-[#0047FF] flex-shrink-0" />
                  <span><strong>Natural Language Understanding:</strong> Understands complex intent prompts</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[#0047FF]/30 bg-[#0047FF]/5">
                  <Check className="w-4 h-4 text-[#0047FF] flex-shrink-0" />
                  <span><strong>Native Web Access:</strong> Reads real-time APIs, news, and social sentiment</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[#0047FF]/30 bg-[#0047FF]/5">
                  <Check className="w-4 h-4 text-[#0047FF] flex-shrink-0" />
                  <span><strong>AI Discussions:</strong> Validators deliberate & vote on subjective disputes</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[#0047FF]/30 bg-[#0047FF]/5">
                  <Check className="w-4 h-4 text-[#0047FF] flex-shrink-0" />
                  <span><strong>MEV Immunization:</strong> AI validates intent execution before committing state</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#0047FF]/20 flex items-center justify-between text-xs font-mono text-[#0047FF]">
              <span>Powered by GenLayer Network</span>
              <span className="flex items-center gap-1 font-bold">
                Live on app.soyara.xyz <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Code Viewer */}
        <div className="rounded-3xl border border-black/15 dark:border-white/15 bg-black dark:bg-[#050608] text-white overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-white/10 bg-white/[0.02] gap-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#0047FF]" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Intelligent Contract Architecture
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveCodeTab('genlayer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  activeCodeTab === 'genlayer'
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                GenLayer Python (Soyara)
              </button>
              <button
                onClick={() => setActiveCodeTab('legacy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  activeCodeTab === 'legacy'
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Solidity (Legacy)
              </button>
            </div>
          </div>

          {/* Code Content */}
          <div className="p-4 sm:p-6 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed text-white/90">
            <pre className="selection:bg-[#0047FF] selection:text-white">
              <code>{activeCodeTab === 'genlayer' ? genlayerCode : legacyCode}</code>
            </pre>
          </div>

          {/* Code Bar Footer */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-white/60 gap-2">
            <span>
              {activeCodeTab === 'genlayer' 
                ? 'GenLayer contracts execute in pythonic runtime with validator LLM consensus' 
                : 'Solidity contracts cannot parse natural language or subjective web criteria'}
            </span>
            <a
              href="https://app.soyara.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0047FF] hover:underline flex items-center gap-1 font-bold"
            >
              <span>Deploy on app.soyara.xyz</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
