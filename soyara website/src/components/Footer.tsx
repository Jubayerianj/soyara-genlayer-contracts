'use client';

import React from 'react';
import Image from 'next/image';
import { 
  ArrowUpRight, 
  Cpu, 
  Layers, 
  ExternalLink,
  Shield,
  Activity
} from 'lucide-react';
import { XIcon, TelegramIcon } from './SocialIcons';

export default function Footer() {
  return (
    <footer className="bg-white dark:bg-black border-t border-black/10 dark:border-white/10 py-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-black/10 dark:border-white/10">
          
          {/* Col 1 & 2: Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-black/10 dark:border-white/20 p-0.5 bg-white dark:bg-black shadow-sm">
                <Image
                  src="/logo.png"
                  alt="Soyara Logo"
                  width={40}
                  height={40}
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-wider text-black dark:text-white font-mono uppercase">
                  SOYARA
                </span>
                <span className="text-xs text-black/50 dark:text-white/50 font-mono">
                  AI Swapping DEX on GenLayer
                </span>
              </div>
            </div>

            <p className="text-sm text-black/70 dark:text-white/70 max-w-sm font-sans leading-relaxed">
              Contracts can think. Non-deterministic execution, validator AI discussions, and unified cross-chain liquidity across GenLayer, Solana, and Sui.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <span className="w-2 h-2 rounded-full bg-[#0047FF] animate-pulse" />
              <span className="text-xs font-mono text-black/70 dark:text-white/70">
                All Systems Operational &bull; GenLayer Testnet / Mainnet
              </span>
            </div>
          </div>

          {/* Col 3: Ecosystem Gateways */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50 font-bold">
              Trading Gateways
            </h4>
            <ul className="space-y-2 text-sm font-sans">
              <li>
                <a
                  href="https://app.soyara.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] flex items-center gap-1.5 transition-colors font-medium"
                >
                  <span>app.soyara.xyz (GenLayer)</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#0047FF]" />
                </a>
              </li>
              <li>
                <a
                  href="https://trade.soyara.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] flex items-center gap-1.5 transition-colors font-medium"
                >
                  <span>trade.soyara.xyz (Solana & Sui)</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#0047FF]" />
                </a>
              </li>
              <li>
                <a
                  href="#ai-swap-terminal"
                  className="text-black/60 dark:text-white/60 hover:text-[#0047FF] transition-colors"
                >
                  Interactive Simulator
                </a>
              </li>
              <li>
                <a
                  href="#analytics"
                  className="text-black/60 dark:text-white/60 hover:text-[#0047FF] transition-colors"
                >
                  Analytics Intelligence
                </a>
              </li>
              <li>
                <a
                  href="/links"
                  className="text-[#0047FF] hover:underline transition-colors font-mono font-bold text-xs flex items-center gap-1 mt-1"
                >
                  <span>All Official Links (/links) &rarr;</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Technology */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50 font-bold">
              Technology
            </h4>
            <ul className="space-y-2 text-sm font-sans text-black/60 dark:text-white/60">
              <li>
                <a href="#intelligent-contracts" className="hover:text-[#0047FF] transition-colors">
                  Intelligent Contracts
                </a>
              </li>
              <li>
                <a href="#ai-discussions" className="hover:text-[#0047FF] transition-colors">
                  AI Discussions & Consensus
                </a>
              </li>
              <li>
                <a href="#multichain" className="hover:text-[#0047FF] transition-colors">
                  Solana SVM Liquidity
                </a>
              </li>
              <li>
                <a href="#multichain" className="hover:text-[#0047FF] transition-colors">
                  Sui Move Parallel Swaps
                </a>
              </li>
            </ul>
          </div>

          {/* Col 5: Ecosystem & Community */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-black/50 dark:text-white/50 font-bold">
              Community & Network
            </h4>
            <ul className="space-y-2.5 text-sm font-sans text-black/70 dark:text-white/70">
              <li>
                <a
                  href="https://x.com/soyaraxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0047FF] dark:hover:text-[#0047FF] flex items-center gap-2 transition-colors font-medium"
                >
                  <XIcon className="w-3.5 h-3.5 text-[#0047FF]" />
                  <span>x.com/soyaraxyz</span>
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/soyaradotxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0047FF] dark:hover:text-[#0047FF] flex items-center gap-2 transition-colors font-medium"
                >
                  <TelegramIcon className="w-3.5 h-3.5 text-[#0047FF]" />
                  <span>t.me/soyaradotxyz</span>
                </a>
              </li>
              <li className="pt-1">
                <a
                  href="https://genlayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0047FF] flex items-center gap-1 transition-colors text-black/60 dark:text-white/60 text-xs"
                >
                  <span>GenLayer Network</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://solana.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0047FF] flex items-center gap-1 transition-colors text-black/60 dark:text-white/60 text-xs"
                >
                  <span>Solana Foundation</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://sui.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0047FF] flex items-center gap-1 transition-colors text-black/60 dark:text-white/60 text-xs"
                >
                  <span>Sui Network</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-black/50 dark:text-white/50 gap-4">
          <div>
            &copy; {new Date().getFullYear()} Soyara (soyara.xyz). All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-[#0047FF] transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-[#0047FF] transition-colors">
              Terms of Service
            </a>
            <a href="https://app.soyara.xyz" target="_blank" rel="noopener noreferrer" className="text-[#0047FF] font-bold hover:underline">
              Launch app.soyara.xyz
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
