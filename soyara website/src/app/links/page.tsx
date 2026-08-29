'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ThemeProvider, useTheme } from '@/components/ThemeContext';
import { XIcon, TelegramIcon } from '@/components/SocialIcons';
import { 
  ArrowUpRight, 
  Cpu, 
  Layers, 
  Globe, 
  Copy, 
  Check, 
  Sun, 
  Moon, 
  ExternalLink,
  ShieldCheck,
  Share2,
  Sparkles,
  ArrowLeft,
  Terminal,
  BookOpen
} from 'lucide-react';

function LinksContent() {
  const { theme, toggleTheme } = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (url: string, id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const shareHub = () => {
    if (navigator.share) {
      navigator.share({
        title: 'SOYARA Official Links',
        text: 'All official Soyara AI DEX links, GenLayer app, Solana & Sui trading, and community.',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedId('hub-share');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const linkSections = [
    {
      category: 'DEX Applications',
      items: [
        {
          id: 'app-genlayer',
          title: 'Main GenLayer DEX',
          url: 'https://app.soyara.xyz',
          displayUrl: 'app.soyara.xyz',
          description: 'Intelligent Contracts that think, natural language intent swaps, and validator AI discussions.',
          badge: 'Primary DEX',
          icon: <Cpu className="w-5 h-5 text-[#0047FF]" />,
          featured: true
        },
        {
          id: 'trade-multichain',
          title: 'Solana & Sui High-Speed DEX',
          url: 'https://trade.soyara.xyz',
          displayUrl: 'trade.soyara.xyz',
          description: 'Sub-second SVM and Move liquidity swaps with atomic bridge routing to GenLayer.',
          badge: 'High Velocity',
          icon: <Layers className="w-5 h-5 text-[#0047FF]" />,
          featured: true
        }
      ]
    },
    {
      category: 'Official Socials & Community',
      items: [
        {
          id: 'telegram',
          title: 'Official Telegram Community',
          url: 'https://t.me/soyaradotxyz',
          displayUrl: 't.me/soyaradotxyz',
          description: 'Join announcements, active community discussions, and direct team updates.',
          badge: 'Active Group',
          icon: <TelegramIcon className="w-5 h-5 text-[#0047FF]" />,
          featured: false
        },
        {
          id: 'x-twitter',
          title: 'Official X (Twitter)',
          url: 'https://x.com/soyaraxyz',
          displayUrl: 'x.com/soyaraxyz',
          description: 'Latest alpha, intelligent contract demos, feature releases, and announcements.',
          badge: 'Official Account',
          icon: <XIcon className="w-5 h-5 text-[#0047FF]" />,
          featured: false
        }
      ]
    },
    {
      category: 'Website & Documentation',
      items: [
        {
          id: 'website',
          title: 'Soyara Official Website',
          url: 'https://soyara.xyz',
          displayUrl: 'soyara.xyz',
          description: 'Explore the full AI DEX ecosystem, interactive swap simulator, and real-time analytics.',
          badge: 'Portal',
          icon: <Globe className="w-5 h-5 text-[#0047FF]" />,
          featured: false
        },
        {
          id: 'genlayer-network',
          title: 'GenLayer Network',
          url: 'https://genlayer.com',
          displayUrl: 'genlayer.com',
          description: 'The decentralized foundation powering Soyara Intelligent Contracts and LLM consensus.',
          badge: 'Ecosystem',
          icon: <Sparkles className="w-5 h-5 text-[#0047FF]" />,
          featured: false
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300 py-8 px-4 sm:px-6 relative">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-radial-glow pointer-events-none -z-10" />

      {/* Top action bar */}
      <div className="max-w-xl mx-auto flex items-center justify-between mb-8 relative z-10">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-mono text-black/60 dark:text-white/60 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors p-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#07090e]/80 backdrop-blur-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={shareHub}
            className="flex items-center gap-1.5 text-xs font-mono text-black/70 dark:text-white/70 hover:text-[#0047FF] dark:hover:text-[#0047FF] p-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#07090e]/80 backdrop-blur-md transition-colors"
            title="Share Links Hub"
          >
            {copiedId === 'hub-share' ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#0047FF]" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#0047FF]" />
                <span>Share Hub</span>
              </>
            )}
          </button>

          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] text-black dark:text-white bg-white/80 dark:bg-[#07090e]/80 backdrop-blur-md transition-all"
            title={theme === 'dark' ? 'Switch to White / Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-white hover:text-[#0047FF]" /> : <Moon className="w-4 h-4 text-black hover:text-[#0047FF]" />}
          </button>
        </div>
      </div>

      {/* Profile / Brand Header */}
      <div className="max-w-xl mx-auto text-center mb-8 relative z-10">
        <div className="relative inline-block mb-4">
          <div className="w-20 h-20 rounded-full border-2 border-black/10 dark:border-white/20 p-1 bg-white dark:bg-black blue-glow shadow-2xl mx-auto">
            <Image
              src="/logo.png"
              alt="Soyara Logo"
              width={72}
              height={72}
              className="w-full h-full object-contain rounded-full"
              priority
            />
          </div>
          <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#0047FF] border-2 border-white dark:border-black flex items-center justify-center text-[10px] text-white">
            ✓
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-wider uppercase text-black dark:text-white">
          SOYARA
        </h1>
        <p className="text-xs font-mono text-[#0047FF] font-semibold mt-1">
          soyara.xyz &bull; Official Links Hub
        </p>

        <p className="text-xs sm:text-sm text-black/70 dark:text-white/70 max-w-md mx-auto mt-3 font-sans leading-relaxed">
          The AI-native swapping DEX on GenLayer. Contracts Can Think.
          Unified cross-chain liquidity across GenLayer, Solana, and Sui.
        </p>

        {/* Status pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] text-[11px] font-mono text-black/60 dark:text-white/60 mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0047FF] animate-pulse" />
          <span>All Endpoints Verified & Operational</span>
        </div>
      </div>

      {/* Links List */}
      <div className="max-w-xl mx-auto space-y-6 relative z-10 pb-16">
        {linkSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-black/50 dark:text-white/50 px-2 font-bold">
              {section.category}
            </h2>

            <div className="space-y-2.5">
              {section.items.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group relative flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                    item.featured
                      ? 'border-[#0047FF] bg-white dark:bg-[#07090e] blue-glow-sm hover:border-[#0047FF] hover:shadow-lg'
                      : 'border-black/15 dark:border-white/15 bg-white dark:bg-[#07090e] hover:border-[#0047FF]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 group-hover:bg-[#0047FF]/10 transition-colors mt-0.5">
                    {item.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-sm sm:text-base text-black dark:text-white font-mono group-hover:text-[#0047FF] transition-colors truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/30 flex-shrink-0">
                          {item.badge}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Copy URL Button */}
                        <button
                          onClick={(e) => copyToClipboard(item.url, item.id, e)}
                          title="Copy Link"
                          className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:border-[#0047FF] text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-all bg-black/[0.02] dark:bg-white/[0.02]"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-[#0047FF]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div className="p-1.5 rounded-lg text-black/50 dark:text-white/50 group-hover:text-[#0047FF] transition-colors">
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-[#0047FF] mt-0.5">
                      {item.displayUrl}
                    </div>

                    <p className="text-xs text-black/60 dark:text-white/60 mt-1 font-sans line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}

        {/* Classy Links Footer */}
        <div className="pt-8 text-center space-y-2 border-t border-black/10 dark:border-white/10">
          <div className="text-xs font-mono text-black/50 dark:text-white/50">
            SOYARA ECOSYSTEM DIRECTORY &bull; SOYARA.XYZ
          </div>
          <div className="flex items-center justify-center gap-4 text-xs font-mono">
            <a href="https://app.soyara.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
              app.soyara.xyz
            </a>
            <span>&bull;</span>
            <a href="https://trade.soyara.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
              trade.soyara.xyz
            </a>
            <span>&bull;</span>
            <a href="https://t.me/soyaradotxyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
              Telegram
            </a>
            <span>&bull;</span>
            <a href="https://x.com/soyaraxyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#0047FF] underline">
              X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LinksPage() {
  return (
    <ThemeProvider>
      <LinksContent />
    </ThemeProvider>
  );
}
