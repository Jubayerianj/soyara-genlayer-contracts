'use client';

import React, { useState } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import InteractiveSwapTerminal from '@/components/InteractiveSwapTerminal';
import ContractsCanThink from '@/components/ContractsCanThink';
import AiDiscussions from '@/components/AiDiscussions';
import AnalyticsIntelligence from '@/components/AnalyticsIntelligence';
import MultiChainEcosystem from '@/components/MultiChainEcosystem';
import DirectGateways from '@/components/DirectGateways';
import FaqSection from '@/components/FaqSection';
import Footer from '@/components/Footer';
import WalletModal from '@/components/WalletModal';

export default function Home() {
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const scrollToDemo = () => {
    const el = document.getElementById('ai-swap-terminal');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <ThemeProvider>
      <main className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
        {/* Navigation Bar */}
        <Navbar onOpenWallet={() => setWalletModalOpen(true)} />

        {/* Hero Section */}
        <Hero onExploreDemo={scrollToDemo} />

        {/* Interactive AI Swap Simulator Terminal */}
        <InteractiveSwapTerminal />

        {/* Intelligent Contracts (Contracts Can Think) */}
        <ContractsCanThink />

        {/* AI Discussions & Validator Consensus */}
        <AiDiscussions />

        {/* Analytics Intelligence */}
        <AnalyticsIntelligence />

        {/* Multi-Chain Architecture (Solana & Sui) */}
        <MultiChainEcosystem />

        {/* Direct Ecosystem Gateways (app.soyara.xyz & trade.soyara.xyz) */}
        <DirectGateways />

        {/* FAQ Section */}
        <FaqSection />

        {/* Classy Footer */}
        <Footer />

        {/* Connect Multi-Chain Wallet Modal */}
        <WalletModal
          isOpen={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
        />
      </main>
    </ThemeProvider>
  );
}
