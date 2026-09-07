import React, { useState } from 'react';
import { X, BookOpen, Layers, ShieldCheck, Cpu, Code2, Terminal, CheckCircle2, Copy } from 'lucide-react';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS, TOKENS, RPC_URL, EXPLORER_URL } from '@/lib/client';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'keeper' | 'sdk' | 'contracts'>('architecture');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] glass-panel-glow rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-surface-100/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Soyara Intent Keeper Documentation</h2>
              <p className="text-xs text-slate-400">Architecture, SDK Integration & Consensus Gating Reference</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-surface-50 hover:bg-surface-200 text-slate-400 hover:text-white border border-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 py-2.5 bg-surface-200/90 border-b border-white/5 flex items-center gap-2 shrink-0 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'architecture'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Architecture & Pipeline
          </button>
          <button
            onClick={() => setActiveTab('keeper')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'keeper'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Keeper & Consensus Loop
          </button>
          <button
            onClick={() => setActiveTab('sdk')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'sdk'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3. SDK & Viem Code Examples
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'contracts'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            4. Network & Deployed Addresses
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-300 leading-relaxed font-sans select-text">
          {/* TAB 1: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Intent-Based Execution on GenLayer
                </h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Traditional decentralized limit orders rely on off-chain order books or vulnerable smart contracts that execute blind swaps with fixed slippage. 
                  Soyara introduces an **AI-native Intent & Keeper Architecture** on GenLayer Bradbury where every conditional order goes through three safety layers:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-2">1</div>
                  <h4 className="font-bold text-white mb-1">Intent Parsing</h4>
                  <p className="text-slate-400 text-[11px] leading-normal font-sans">
                    Natural language prompts are mapped into structured parameters with strict ambiguity detection. Missing tokens or vague direction yield explicit clarification questions instead of dangerous default trades.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center mb-2">2</div>
                  <h4 className="font-bold text-white mb-1">AI Consensus Gate</h4>
                  <p className="text-slate-400 text-[11px] leading-normal font-sans">
                    Before execution, proposals are submitted to GenLayer Intelligent Contracts. VRF-elected validator nodes independently re-simulate and reach consensus on price impact, slippage, and routing safety.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">3</div>
                  <h4 className="font-bold text-white mb-1">AGGFlow Settlement</h4>
                  <p className="text-slate-400 text-[11px] leading-normal font-sans">
                    Once validated, the EVM <code className="text-cyan-300">AgentExecutor</code> and <code className="text-cyan-300">AGGFlowRouter</code> execute optimal direct or multi-hop paths across V2 and V3 liquidity pools in a single transaction.
                  </p>
                </div>
              </div>

              {/* Mermaid-like Diagram */}
              <div className="p-4 rounded-xl bg-surface-300/80 border border-white/5 font-mono text-[11px] text-slate-300">
                <div className="text-slate-500 mb-2 uppercase font-semibold text-[10px]">End-to-End Execution Flow</div>
                <pre className="text-cyan-300 whitespace-pre overflow-x-auto leading-relaxed">
{`[User / Agent Intent] ("Buy 50 USDT of WBTC when price <= 2500")
         │
         ▼
[Natural Language Parser & Guard] ──> Extracts { tokenIn, tokenOut, targetRate, slippage }
         │
         ▼
[Autonomous Keeper Loop (Viem)] ───> Continuously queries quoteBestRouteMultiHop()
         │
   (Condition Met?)
         │ Yes
         ▼
[GenLayer AI Validator (IC)] ──────> VRF Consensus Round validates slippage & execution invariants
         │
   (Consensus Approved?)
         │ Yes
         ▼
[EVM AgentExecutor & AGGFlow] ─────> Consumes one-time approval hash & settles trade on-chain`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: KEEPER & CONSENSUS LOOP */}
          {activeTab === 'keeper' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                How the Keeper & Consensus Engine Works
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <h4 className="font-semibold text-cyan-300 mb-1">1. Execution-Accurate Quoting</h4>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    Quotes are not visual estimates: <code className="text-cyan-300">minAmountOut</code> is enforced on-chain. 
                    V3 is quoted through the live Quoter contract (<code className="text-slate-300">quoteExactInputSingle</code>), walking ticks and calculating price impact.
                    AGGFlow entrypoint fees (5 BPS) are factored into the input token before price calculation.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <h4 className="font-semibold text-purple-300 mb-1">2. Multi-Hop Route Optimization</h4>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    When direct pools are illiquid or non-existent (e.g. WBTC/USDT), the keeper automatically quotes 2-hop paths (e.g. <code className="text-white">WBTC → WGEN → USDT</code>). 
                    The output of the first hop serves as exact input for the second, compounding impact and fees accurately.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5">
                  <h4 className="font-semibold text-emerald-300 mb-1">3. One-Time Consumption & Replay Defense</h4>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    The EVM <code className="text-emerald-300">AgentExecutor</code> binds a one-time cryptographic hash over the exact trade parameters approved by GenLayer consensus.
                    Once executed, the hash is consumed in contract storage, making replay attacks impossible.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SDK & VIEM CODE EXAMPLES */}
          {activeTab === 'sdk' && (
            <div className="space-y-4 font-mono text-xs">
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-sans">
                <Code2 className="w-4 h-4 text-cyan-400" />
                Code Snippets: SDK & Viem
              </h3>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-surface-300 border border-white/5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>1. Understand and Price Intent in 1 Call</span>
                    <button
                      onClick={() => handleCopy(`import { understand } from '@soyaradex/sdk';\n\nconst { intent, quote } = await understand('swap 50 USDC to USDT');\nif (!intent.confident) {\n  console.log('Needs info:', intent.needs.join(', '));\n}\nconsole.log('Output:', quote.amountOutRaw, 'Via:', quote.dex);`, 'code1')}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      {copiedKey === 'code1' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-cyan-300 whitespace-pre overflow-x-auto text-[11px]">
{`import { understand } from '@soyaradex/sdk';

// 1. Natural language understanding + execution-accurate quote
const { intent, quote } = await understand('swap 50 USDC to USDT');

if (!intent.confident) {
  // Never guess: ask user for missing parameters
  console.log('Needs:', intent.needs.join(', '));
}

console.log('Action:', intent.action, intent.tokenIn, '→', intent.tokenOut);
console.log('Amount Out:', quote.amountOutRaw, 'Route:', quote.dex);`}
                  </pre>
                </div>

                <div className="p-3 rounded-xl bg-surface-300 border border-white/5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>2. Build Multi-Hop Bytecode Program</span>
                    <button
                      onClick={() => handleCopy(`import { quoteBestRouteMultiHop, buildMultiHopProgram, tokenBySymbol } from '@soyaradex/sdk';\n\nconst q = await quoteBestRouteMultiHop(wbtcAddr, usdtAddr, amountInWei, 'best');\nconst calldata = buildMultiHopProgram(fromToken, toToken, q.hops, wgenAddr);`, 'code2')}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      {copiedKey === 'code2' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-cyan-300 whitespace-pre overflow-x-auto text-[11px]">
{`import { quoteBestRouteMultiHop, buildMultiHopProgram, tokenBySymbol } from '@soyaradex/sdk';

// Multi-hop route (e.g. WBTC -> WGEN -> USDT)
const q = await quoteBestRouteMultiHop(wbtcAddr, usdtAddr, amountInWei, 'best');

// Generate compact bytecode for AGGFlowRouter
const calldata = buildMultiHopProgram(
  { address: wbtcAddr, isNative: false },
  { address: usdtAddr, isNative: false },
  q.hops,
  tokenBySymbol('WGEN').address
);`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CONTRACTS */}
          {activeTab === 'contracts' && (
            <div className="space-y-4 font-mono text-xs">
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-sans">
                <Terminal className="w-4 h-4 text-cyan-400" />
                GenLayer Bradbury Testnet Deployment Registry
              </h3>

              <div className="p-3.5 rounded-xl bg-surface-100 border border-white/5 space-y-2">
                <div className="text-slate-400 text-[11px]">Network Config</div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
                  <div>Chain ID: <strong className="text-white">4221</strong></div>
                  <div>Native Token: <strong className="text-white">GEN (18 decimals)</strong></div>
                  <div className="col-span-2 truncate">RPC: <span className="text-cyan-300">{RPC_URL}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-slate-400 text-[11px] font-semibold uppercase">Intelligent & Core Contracts</div>
                {Object.entries({
                  'AgentValidator (GenLayer IC)': INTELLIGENT_CONTRACTS.agentValidator,
                  'LiquidityValidator (GenLayer IC)': INTELLIGENT_CONTRACTS.liquidityValidator,
                  'AgentExecutor (EVM Gate)': CONTRACT_ADDRESSES[4221].agentExecutor,
                  'AGGFlowEntrypoint': CONTRACT_ADDRESSES[4221].aggregatorEntrypoint,
                  'AGGFlowRouter': CONTRACT_ADDRESSES[4221].aggregatorRouter,
                  'V2 Factory': CONTRACT_ADDRESSES[4221].factory,
                  'V3 Factory': CONTRACT_ADDRESSES[4221].v3Factory,
                  'V3 Quoter': CONTRACT_ADDRESSES[4221].v3Quoter,
                }).map(([name, addr]) => (
                  <div key={name} className="flex items-center justify-between p-2 rounded-lg bg-surface-200 border border-white/5">
                    <span className="text-slate-300">{name}</span>
                    <span className="text-cyan-400 font-mono text-[10px] select-all">{addr}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-slate-400 text-[11px] font-semibold uppercase">Whitelisted Testnet Tokens (All 18 Decimals)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(TOKENS).map(([sym, t]) => (
                    <div key={sym} className="p-2 rounded-lg bg-surface-200 border border-white/5 flex items-center justify-between">
                      <span className="font-bold text-white">{sym}</span>
                      <span className="text-slate-400 font-mono text-[10px] truncate max-w-[150px]">{t.address}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
