'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What is Soyara and how does it work?',
      a: 'Soyara is the first AI-native decentralized swapping exchange (DEX) built on GenLayer. It leverages GenLayer Intelligent Contracts to enable natural language intent trading, live web data verification, validator AI discussions, and unified cross-chain liquidity across GenLayer, Solana, and Sui.'
    },
    {
      q: 'What does "Contracts Can Think" mean?',
      a: 'Traditional smart contracts (like Solidity on Ethereum) are rigid, deterministic state machines that cannot read web pages, understand human language, or make nuanced decisions. GenLayer Intelligent Contracts run connected LLMs directly in validator consensus, enabling contracts to "think"—browse internet APIs, parse subjective prompts, evaluate real-time sentiment, and execute complex intent-based trades.'
    },
    {
      q: 'What are AI Discussions in GenLayer?',
      a: 'In GenLayer, validator nodes do not just verify hashes—they run AI agents that deliberate over subjective transaction parameters. For example, if a swap order says "Buy only if market sentiment is bullish and no exploits occurred", validator agents fetch live web feeds, discuss their findings, and reach BFT-LLM quorum before committing state to the blockchain.'
    },
    {
      q: 'Which link should I use for GenLayer swaps vs Solana & Sui?',
      a: 'Use app.soyara.xyz for the main GenLayer AI DEX with Intelligent Contracts, intent routing, and AI discussions. Use trade.soyara.xyz for high-speed, sub-second swaps on Solana SVM and Sui Move networks.'
    },
    {
      q: 'How does Soyara eliminate MEV and sandwich attacks?',
      a: 'Predatory MEV bots exploit predictable deterministic order routing. In Soyara, trades are executed through intelligent contracts where validators simulate and verify the slippage, liquidity bounds, and intent constraints before committing the transaction, effectively neutralizing sandwich attacks and toxic order flow.'
    },
    {
      q: 'Which wallets are supported across the ecosystem?',
      a: 'Soyara supports GenLayer Web3 keystore and EVM-compatible wallets on app.soyara.xyz, as well as Phantom and Solflare for Solana, and Suiet and Sui Wallet for Sui on trade.soyara.xyz.'
    }
  ];

  return (
    <section className="py-20 md:py-32 border-b border-black/10 dark:border-white/10 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0047FF]/30 bg-[#0047FF]/5 dark:bg-[#0047FF]/10 text-[#0047FF] text-xs font-mono mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>KNOWLEDGE BASE & FAQ</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight font-sans">
            Frequently Asked <span className="text-[#0047FF]">Questions</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70">
            Learn more about GenLayer Intelligent Contracts, AI Discussions, and Multi-Chain Swaps.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-2xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-bold text-base sm:text-lg text-black dark:text-white font-sans">
                    {faq.q}
                  </span>
                  <div className={`p-1.5 rounded-full border border-black/10 dark:border-white/15 transition-transform duration-200 ${isOpen ? 'rotate-180 bg-[#0047FF] text-white border-[#0047FF]' : 'text-black dark:text-white'}`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 text-sm text-black/70 dark:text-white/70 font-sans leading-relaxed border-t border-black/5 dark:border-white/5 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
