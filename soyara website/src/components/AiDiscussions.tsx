'use client';

import React, { useState } from 'react';
import { 
  MessageSquare, 
  Bot, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw, 
  Sparkles,
  ExternalLink,
  Users,
  Vote
} from 'lucide-react';

interface DiscussionMessage {
  id: string;
  sender: string;
  role: string;
  timestamp: string;
  content: string;
  confidence: number;
  status: 'agree' | 'verify' | 'committed';
}

export default function AiDiscussions() {
  const [selectedTopic, setSelectedTopic] = useState<'sentiment' | 'arbitrage' | 'liquidity'>('sentiment');

  const topics = {
    sentiment: {
      title: 'Intent #4829: "Swap 2,500 USDC to GEN if Twitter/X sentiment is >80% & no security exploits reported"',
      messages: [
        {
          id: '1',
          sender: 'Validator Node Alpha (0x8F3...4a2)',
          role: 'Web & Sentiment Oracle',
          timestamp: '14:22:01.042 UTC',
          content: 'Retrieved 1,420 social impressions and 4 web feeds in past 60m. Sentiment index is calculated at 88.4% positive. Keyword search for "exploit", "hack", "drain" returned 0 relevant incidents.',
          confidence: 94.2,
          status: 'agree' as const
        },
        {
          id: '2',
          sender: 'Validator Node Beta (0x3C1...9b7)',
          role: 'Risk & Volatility Arbiter',
          timestamp: '14:22:01.118 UTC',
          content: 'Cross-checked order book on GenLayer pool. Simulated price impact for 2,500 USDC is 0.08%. Slippage tolerance (0.5%) will not be breached. I second Node Alpha’s evaluation.',
          confidence: 96.8,
          status: 'agree' as const
        },
        {
          id: '3',
          sender: 'Validator Node Gamma (0xE94...821)',
          role: 'Consensus Lead & MEV Sentinel',
          timestamp: '14:22:01.195 UTC',
          content: 'No sandwich bot activity detected in pending mempool. Quorum conditions satisfied (3/3 agreement). Committing intent order state to GenLayer block #1,849,203.',
          confidence: 99.1,
          status: 'committed' as const
        }
      ]
    },
    arbitrage: {
      title: 'Intent #4830: "Arbitrage rebalance between Solana SVM pool and Sui Move liquidity when spread > 1.2%"',
      messages: [
        {
          id: '1',
          sender: 'Validator Node Alpha (0x8F3...4a2)',
          role: 'Solana RPC Inquirer',
          timestamp: '14:23:10.012 UTC',
          content: 'Observed SOL/USDC price on trade.soyara.xyz at $148.20. Depth supports 50 SOL without significant slippage.',
          confidence: 97.4,
          status: 'agree' as const
        },
        {
          id: '2',
          sender: 'Validator Node Beta (0x3C1...9b7)',
          role: 'Sui Move Inquirer',
          timestamp: '14:23:10.084 UTC',
          content: 'Observed Sui synthetic route at equivalent $150.32. Spread calculated at 1.43% (> 1.2% trigger condition). Validating atomic bridging route.',
          confidence: 95.0,
          status: 'agree' as const
        },
        {
          id: '3',
          sender: 'Validator Node Gamma (0xE94...821)',
          role: 'Execution Quorum',
          timestamp: '14:23:10.160 UTC',
          content: 'Gas cost on both chains estimated at $0.0034. Net profit strictly positive. Deliberation concluded: Intent executed across cross-chain relayer.',
          confidence: 99.8,
          status: 'committed' as const
        }
      ]
    },
    liquidity: {
      title: 'Intent #4831: "Execute DCA purchase of GEN only during low-congestion validator cycles"',
      messages: [
        {
          id: '1',
          sender: 'Validator Node Alpha (0x8F3...4a2)',
          role: 'Network Load Monitor',
          timestamp: '14:24:45.020 UTC',
          content: 'Current GenLayer validator TPS utilization is 24%. Memory consumption across validator cluster is nominal.',
          confidence: 98.2,
          status: 'agree' as const
        },
        {
          id: '2',
          sender: 'Validator Node Beta (0x3C1...9b7)',
          role: 'Order Book Depth Analyzer',
          timestamp: '14:24:45.092 UTC',
          content: 'Pool depth has replenished with $340k fresh liquidity. Spread is currently compressed to 0.02%. Condition for optimal DCA reached.',
          confidence: 96.5,
          status: 'agree' as const
        },
        {
          id: '3',
          sender: 'Validator Node Gamma (0xE94...821)',
          role: 'Consensus Signer',
          timestamp: '14:24:45.180 UTC',
          content: 'Signatures generated. DCA slice 4/10 committed without slippage.',
          confidence: 100.0,
          status: 'committed' as const
        }
      ]
    }
  };

  const currentTopic = topics[selectedTopic];

  return (
    <section id="ai-discussions" className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>GENLAYER AI DISCUSSIONS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            Validators That <span className="text-[#0047FF]">Debate & Agree</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            Unlike legacy chains where miners blindly include transactions for gas, GenLayer AI validators read, deliberate, cross-examine web data, and reach quorum before trade execution.
          </p>
        </div>

        {/* Interactive Discussion Chamber */}
        <div className="max-w-5xl mx-auto rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] shadow-2xl overflow-hidden blue-glow-sm">
          
          {/* Chamber Header */}
          <div className="p-4 sm:p-6 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0047FF] text-white flex items-center justify-center shadow-md">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-black dark:text-white font-mono">
                  Validator Deliberation Chamber
                </h3>
                <span className="text-xs text-black/50 dark:text-white/50 font-sans">
                  Active BFT-LLM Quorum: 3 Validators Online
                </span>
              </div>
            </div>

            {/* Scenario Selector */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTopic('sentiment')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  selectedTopic === 'sentiment'
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-black/70 dark:text-white/70 border border-black/10 dark:border-white/10 hover:border-[#0047FF]'
                }`}
              >
                Sentiment Intent
              </button>
              <button
                onClick={() => setSelectedTopic('arbitrage')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  selectedTopic === 'arbitrage'
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-black/70 dark:text-white/70 border border-black/10 dark:border-white/10 hover:border-[#0047FF]'
                }`}
              >
                Cross-Chain Arbitrage
              </button>
              <button
                onClick={() => setSelectedTopic('liquidity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  selectedTopic === 'liquidity'
                    ? 'bg-[#0047FF] text-white font-bold'
                    : 'text-black/70 dark:text-white/70 border border-black/10 dark:border-white/10 hover:border-[#0047FF]'
                }`}
              >
                Optimal DCA
              </button>
            </div>
          </div>

          {/* Current Debate Title */}
          <div className="px-6 py-3 bg-[#0047FF]/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between text-xs font-mono">
            <span className="text-[#0047FF] font-semibold truncate pr-4">
              {currentTopic.title}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#0047FF] text-white text-[10px] uppercase font-bold flex-shrink-0">
              In Quorum
            </span>
          </div>

          {/* Message Thread */}
          <div className="p-6 space-y-6">
            {currentTopic.messages.map((msg, index) => (
              <div
                key={msg.id}
                className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] hover:border-[#0047FF]/40 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center flex-shrink-0 text-[#0047FF] border border-black/10 dark:border-white/15">
                  <Bot className="w-5 h-5" />
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-black dark:text-white font-mono">
                        {msg.sender}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/20">
                        {msg.role}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-black/40 dark:text-white/40">
                      {msg.timestamp}
                    </span>
                  </div>

                  <p className="text-sm text-black/80 dark:text-white/80 leading-relaxed font-sans">
                    {msg.content}
                  </p>

                  <div className="flex items-center justify-between pt-2 text-xs font-mono border-t border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
                      <span>AI Model Confidence:</span>
                      <span className="text-[#0047FF] font-bold">{msg.confidence}%</span>
                    </div>
                    <span className="text-[11px] text-black dark:text-white flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0047FF]" />
                      Cryptographically Signed
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Chamber Summary & Consensus Proof */}
          <div className="p-4 sm:p-6 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Vote className="w-5 h-5 text-[#0047FF]" />
              <div className="text-xs font-mono">
                <div className="text-black dark:text-white font-bold">Consensus Reached: 100% Affirmative (3/3 Nodes)</div>
                <div className="text-black/50 dark:text-white/50">Subjective validation passed. Zero reverts recorded.</div>
              </div>
            </div>

            <a
              href="https://app.soyara.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white text-xs font-bold font-mono uppercase tracking-wider transition-all shadow-md active:scale-95"
            >
              <span>Explore Live On app.soyara.xyz</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

        </div>

      </div>
    </section>
  );
}
