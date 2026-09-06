'use client';

import React, { useState } from 'react';
import { 
  Cpu, 
  Layers, 
  ArrowDown, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  Loader2, 
  ExternalLink, 
  Bot, 
  ShieldCheck, 
  ArrowRight,
  RefreshCw,
  Zap,
  Info
} from 'lucide-react';

export default function InteractiveSwapTerminal() {
  const [activeTab, setActiveTab] = useState<'genlayer' | 'multichain'>('genlayer');
  
  // GenLayer AI prompt state
  const [prompt, setPrompt] = useState('Swap 500 USDC to GEN only if web sentiment score > 85% and 1h volatility < 3.5%');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [validatorStep, setValidatorStep] = useState(0);

  // Solana/Sui swap state
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('SUI');
  const [fromAmount, setFromAmount] = useState('10');

  const presetPrompts = [
    'Swap 500 USDC to GEN only if web sentiment score > 85% and 1h volatility < 3.5%',
    'Execute DCA into GEN every time GenLayer validator consensus confirms bullish trend',
    'Bridge 15 SOL to Sui via Soyara router with AI-shielded zero-MEV slippage'
  ];

  const handleSimulateAiSwap = () => {
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setValidatorStep(1);

    setTimeout(() => {
      setValidatorStep(2);
    }, 900);

    setTimeout(() => {
      setValidatorStep(3);
    }, 1800);

    setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysisComplete(true);
    }, 2600);
  };

  return (
    <section id="ai-swap-terminal" className="py-16 md:py-24 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <Bot className="w-3.5 h-3.5" />
            <span>INTERACTIVE AI SWAPPING SIMULATOR</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            Experience How <span className="text-[#0047FF]">Contracts Think</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/60 dark:text-white/60">
            Switch between GenLayer Intelligent Intent Swapping and Solana/Sui Velocity Trading.
          </p>
        </div>

        {/* Terminal Container */}
        <div className="max-w-4xl mx-auto rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] shadow-2xl overflow-hidden blue-glow-sm">
          
          {/* Terminal Tab Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-2 sm:p-3 gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  setActiveTab('genlayer');
                  setAnalysisComplete(false);
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wide transition-all ${
                  activeTab === 'genlayer'
                    ? 'bg-[#0047FF] text-white shadow-md'
                    : 'text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>GenLayer AI Swap (app.soyara.xyz)</span>
              </button>

              <button
                onClick={() => setActiveTab('multichain')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wide transition-all ${
                  activeTab === 'multichain'
                    ? 'bg-[#0047FF] text-white shadow-md'
                    : 'text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Solana & Sui DEX (trade.soyara.xyz)</span>
              </button>
            </div>

            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-black/50 dark:text-white/50 px-2">
              <span className="w-2 h-2 rounded-full bg-[#0047FF] animate-pulse" />
              <span>Simulated Execution Mode</span>
            </div>
          </div>

          {/* Tab 1: GenLayer AI Intelligent Swap */}
          {activeTab === 'genlayer' && (
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-black/70 dark:text-white/70 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#0047FF]" />
                    <span>Intelligent Natural Language Prompt (Intent Order)</span>
                  </label>
                  <span className="text-[11px] font-mono text-[#0047FF]">GenLayer Python Contract</span>
                </div>
                
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    className="w-full p-4 rounded-2xl bg-black/[0.02] dark:bg-black border border-black/15 dark:border-white/15 focus:border-[#0047FF] focus:outline-none text-black dark:text-white font-sans text-sm sm:text-base resize-none shadow-inner"
                    placeholder="Enter subjective criteria, sentiment trigger, or complex limit order..."
                  />
                  <button
                    onClick={handleSimulateAiSwap}
                    disabled={isAnalyzing}
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white text-xs font-bold font-mono tracking-wider transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>THINKING...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>SIMULATE INTENT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Preset Prompts */}
              <div>
                <span className="text-xs font-mono text-black/50 dark:text-white/50 block mb-2">
                  Try example intelligent intents:
                </span>
                <div className="flex flex-wrap gap-2">
                  {presetPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPrompt(p)}
                      className="text-left text-xs font-sans p-2 rounded-lg border border-black/10 dark:border-white/10 hover:border-[#0047FF] text-black/80 dark:text-white/80 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-[#0047FF]/5 transition-all"
                    >
                      &ldquo;{p.slice(0, 52)}...&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time Thinking Trace (Validator AI Consensus) */}
              {(isAnalyzing || analysisComplete) && (
                <div className="p-5 rounded-2xl border border-[#0047FF]/30 bg-[#0047FF]/5 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[#0047FF]/20 pb-2">
                    <span className="font-bold text-[#0047FF] flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      <span>GENLAYER VALIDATOR AI REASONING STREAM</span>
                    </span>
                    <span className="text-[11px] text-black/60 dark:text-white/60">
                      BFT-LLM Consensus
                    </span>
                  </div>

                  {/* Step 1: Alpha */}
                  <div className={`flex items-start gap-3 transition-opacity ${validatorStep >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                    <div className="w-5 h-5 rounded-full bg-[#0047FF] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <div className="font-bold text-black dark:text-white">Validator-Alpha (Subjective Logic Inquirer)</div>
                      <div className="text-black/70 dark:text-white/70 mt-0.5">
                        Parsing subjective condition: Evaluated web data & sentiment feed. Current confidence: 89.2% (Passed threshold &gt;85%).
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Beta */}
                  <div className={`flex items-start gap-3 transition-opacity ${validatorStep >= 2 ? 'opacity-100' : 'opacity-30'}`}>
                    <div className="w-5 h-5 rounded-full bg-[#0047FF] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <div className="font-bold text-black dark:text-white">Validator-Beta (MEV & Volatility Guardian)</div>
                      <div className="text-black/70 dark:text-white/70 mt-0.5">
                        Historical 1h volatility: 2.14% (Within bound &lt;3.5%). Zero MEV arbitrage vectors detected in Soyara mempool.
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Gamma */}
                  <div className={`flex items-start gap-3 transition-opacity ${validatorStep >= 3 ? 'opacity-100' : 'opacity-30'}`}>
                    <div className="w-5 h-5 rounded-full bg-[#0047FF] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <div className="font-bold text-black dark:text-white">Validator-Gamma (Intelligent Settlement Quorum)</div>
                      <div className="text-black/70 dark:text-white/70 mt-0.5">
                        Quorum reached: 3/3 validators agreed. Non-deterministic trade state committed to GenLayer Intelligent Contract.
                      </div>
                    </div>
                  </div>

                  {/* Completion Card */}
                  {analysisComplete && (
                    <div className="mt-4 pt-3 border-t border-[#0047FF]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-black dark:text-white">
                        <CheckCircle2 className="w-4 h-4 text-[#0047FF]" />
                        <span className="font-bold">Trade Verified & Ready For Execution</span>
                      </div>
                      <a
                        href="https://app.soyara.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md"
                      >
                        <span>Launch app.soyara.xyz</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
                  <span className="text-[11px] font-mono text-[#0047FF] block">01 / Subjective Oracles</span>
                  <p className="text-xs text-black/70 dark:text-white/70 mt-1 font-sans">
                    Read news, tweets, social sentiment, and live APIs on-chain via GenLayer.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
                  <span className="text-[11px] font-mono text-[#0047FF] block">02 / AI Discussions</span>
                  <p className="text-xs text-black/70 dark:text-white/70 mt-1 font-sans">
                    Validators deliberate in natural language before cryptographically signing.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
                  <span className="text-[11px] font-mono text-[#0047FF] block">03 / Intent Execution</span>
                  <p className="text-xs text-black/70 dark:text-white/70 mt-1 font-sans">
                    Specify what you want in plain English; the intelligent contract plans the routing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Solana & Sui High-Speed Swap */}
          {activeTab === 'multichain' && (
            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-4">
                <div>
                  <h3 className="text-base font-bold text-black dark:text-white font-mono">
                    High-Velocity Multi-Chain Swap
                  </h3>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    Direct execution via trade.soyara.xyz on Solana SVM and Sui Move.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/30">
                  Sub-second TPS
                </span>
              </div>

              {/* Swap Box Simulation */}
              <div className="space-y-3">
                {/* Pay Token */}
                <div className="p-4 rounded-2xl border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-black/50">
                  <div className="flex justify-between text-xs text-black/50 dark:text-white/50 mb-2 font-mono">
                    <span>YOU PAY</span>
                    <span>BALANCE: 45.2 {fromToken}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <input
                      type="number"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      className="text-2xl font-bold bg-transparent text-black dark:text-white outline-none w-1/2 font-mono"
                    />
                    <select
                      value={fromToken}
                      onChange={(e) => setFromToken(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-black/20 dark:border-white/20 bg-white dark:bg-[#0d1117] text-black dark:text-white text-sm font-bold font-mono outline-none"
                    >
                      <option value="SOL">SOL (Solana)</option>
                      <option value="SUI">SUI (Sui Network)</option>
                      <option value="USDC">USDC</option>
                      <option value="GEN">GEN (GenLayer)</option>
                    </select>
                  </div>
                </div>

                {/* Switch Arrow */}
                <div className="flex justify-center -my-1">
                  <button
                    onClick={() => {
                      const temp = fromToken;
                      setFromToken(toToken);
                      setToToken(temp);
                    }}
                    className="p-2 rounded-full border border-black/20 dark:border-white/20 bg-white dark:bg-[#07090e] hover:border-[#0047FF] text-[#0047FF] shadow-sm transition-all"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Receive Token */}
                <div className="p-4 rounded-2xl border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-black/50">
                  <div className="flex justify-between text-xs text-black/50 dark:text-white/50 mb-2 font-mono">
                    <span>YOU RECEIVE (ESTIMATED)</span>
                    <span>RATE: 1 {fromToken} ≈ {fromToken === 'SOL' ? '14.28' : '0.07'} {toToken}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-2xl font-bold text-black dark:text-white font-mono">
                      {(parseFloat(fromAmount || '0') * (fromToken === 'SOL' ? 14.28 : 0.07)).toFixed(3)}
                    </div>
                    <select
                      value={toToken}
                      onChange={(e) => setToToken(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-black/20 dark:border-white/20 bg-white dark:bg-[#0d1117] text-black dark:text-white text-sm font-bold font-mono outline-none"
                    >
                      <option value="SUI">SUI (Sui Network)</option>
                      <option value="SOL">SOL (Solana)</option>
                      <option value="USDC">USDC</option>
                      <option value="GEN">GEN (GenLayer)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Routing Breakdown */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.02] space-y-2 text-xs font-mono">
                <div className="flex justify-between text-black/70 dark:text-white/70">
                  <span>Routing Protocol</span>
                  <span className="text-[#0047FF] font-bold">Soyara Omni-Bridge & SVM/Move Pool</span>
                </div>
                <div className="flex justify-between text-black/70 dark:text-white/70">
                  <span>Estimated Finality</span>
                  <span className="text-black dark:text-white font-bold">&lt; 400ms</span>
                </div>
                <div className="flex justify-between text-black/70 dark:text-white/70">
                  <span>Slippage Protection</span>
                  <span className="text-black dark:text-white font-bold">AI Auto-Guard (0.1%)</span>
                </div>
              </div>

              {/* Action Button to trade.soyara.xyz */}
              <div>
                <a
                  href="https://trade.soyara.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-[#0047FF] hover:bg-[#0037cc] text-white text-sm font-bold uppercase tracking-wider transition-all shadow-lg shadow-[#0047FF]/20 active:scale-98"
                >
                  <span>Trade On trade.soyara.xyz</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {/* Terminal Status Footer */}
          <div className="p-4 bg-black/[0.03] dark:bg-white/[0.03] border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-black/60 dark:text-white/60 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0047FF]" />
              <span>DEX Endpoints: app.soyara.xyz (GenLayer) &bull; trade.soyara.xyz (Solana & Sui)</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Status: Operational</span>
              <span>Latency: 12ms</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
