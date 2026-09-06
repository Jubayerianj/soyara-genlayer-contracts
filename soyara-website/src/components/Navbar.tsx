'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from './ThemeContext';
import { 
  Sun, 
  Moon, 
  Menu, 
  X, 
  ExternalLink, 
  Wallet, 
  Sparkles, 
  ChevronDown,
  Cpu,
  Layers,
  ArrowUpRight,
  Globe,
  Brain,
  MessageSquare,
  BarChart3,
  Link as LinkIcon
} from 'lucide-react';
import { XIcon, TelegramIcon } from './SocialIcons';

interface NavbarProps {
  onOpenWallet: () => void;
}

export default function Navbar({ onOpenWallet }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [appsDropdownOpen, setAppsDropdownOpen] = useState(false);

  // Close menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setAppsDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent background scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [menuOpen]);

  return (
    <>
      <nav className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/85 dark:bg-black/85 border-b border-black/10 dark:border-white/10 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Left: Logo & Brand */}
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative w-10 h-10 rounded-full overflow-hidden border border-black/10 dark:border-white/20 p-0.5 bg-white dark:bg-black shadow-sm group-hover:border-[#0047FF] transition-all">
                  <Image
                    src="/logo.png"
                    alt="Soyara Logo"
                    width={40}
                    height={40}
                    className="w-full h-full object-contain rounded-full"
                    priority
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-wider text-black dark:text-white font-mono uppercase">
                      SOYARA
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#0047FF]/10 text-[#0047FF] border border-[#0047FF]/30 tracking-widest uppercase">
                      GENLAYER
                    </span>
                  </div>
                  <span className="text-[11px] text-black/50 dark:text-white/50 tracking-tight font-sans">
                    AI Swapping DEX
                  </span>
                </div>
              </Link>
            </div>

            {/* Middle: Desktop Nav Links (hidden on smaller screens, accessible via 3-line menu) */}
            <div className="hidden xl:flex items-center gap-6">
              <a
                href="/#intelligent-contracts"
                className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors"
              >
                Intelligent Contracts
              </a>
              <a
                href="/#ai-discussions"
                className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors"
              >
                AI Discussions
              </a>
              <a
                href="/#analytics"
                className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors"
              >
                Analytics Intelligence
              </a>
              <a
                href="/#multichain"
                className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-colors"
              >
                Solana & Sui Hub
              </a>
              <Link
                href="/links"
                className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg border border-[#0047FF]/30 text-[#0047FF] bg-[#0047FF]/5 hover:bg-[#0047FF] hover:text-white transition-all"
              >
                /links
              </Link>

              {/* DEX Apps Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setAppsDropdownOpen(!appsDropdownOpen)}
                  onBlur={() => setTimeout(() => setAppsDropdownOpen(false), 200)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:border-[#0047FF]/40 transition-all bg-black/[0.02] dark:bg-white/[0.02]"
                >
                  <span>DEX Apps</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${appsDropdownOpen ? 'rotate-180 text-[#0047FF]' : ''}`} />
                </button>

                {appsDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white dark:bg-[#07090e] border border-black/10 dark:border-white/15 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <a
                      href="https://app.soyara.xyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#0047FF]/10 text-[#0047FF] flex items-center justify-center flex-shrink-0 group-hover:bg-[#0047FF] group-hover:text-white transition-colors">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-black dark:text-white">app.soyara.xyz</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#0047FF]" />
                        </div>
                        <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
                          GenLayer Main AI DEX &bull; Intelligent Contracts
                        </p>
                      </div>
                    </a>

                    <div className="h-px bg-black/5 dark:bg-white/10 my-1" />

                    <a
                      href="https://trade.soyara.xyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/10 text-black dark:text-white flex items-center justify-center flex-shrink-0 group-hover:bg-[#0047FF] group-hover:text-white transition-colors">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-black dark:text-white">trade.soyara.xyz</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#0047FF]" />
                        </div>
                        <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
                          Solana & Sui DEX &bull; Sub-second Velocity
                        </p>
                      </div>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions and the Three-Line Menu (ALWAYS VISIBLE ON ALL SCREEN TYPES) */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              
              {/* Social Link: X (Visible on md+) */}
              <a
                href="https://x.com/soyaraxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex p-2.5 rounded-xl border border-black/10 dark:border-white/15 hover:border-[#0047FF]/50 text-black dark:text-white bg-black/[0.02] dark:bg-white/[0.04] hover:bg-[#0047FF]/10 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                title="Soyara on X (x.com/soyaraxyz)"
                aria-label="X (Twitter)"
              >
                <XIcon className="w-4 h-4" />
              </a>

              {/* Social Link: Telegram (Visible on md+) */}
              <a
                href="https://t.me/soyaradotxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex p-2.5 rounded-xl border border-black/10 dark:border-white/15 hover:border-[#0047FF]/50 text-black dark:text-white bg-black/[0.02] dark:bg-white/[0.04] hover:bg-[#0047FF]/10 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                title="Soyara Telegram (t.me/soyaradotxyz)"
                aria-label="Telegram"
              >
                <TelegramIcon className="w-4 h-4" />
              </a>

              {/* Theme Toggle Button (Always visible) */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle Theme"
                className="p-2.5 rounded-xl border border-black/10 dark:border-white/15 hover:border-[#0047FF]/50 text-black dark:text-white bg-black/[0.02] dark:bg-white/[0.04] hover:bg-[#0047FF]/10 transition-all"
                title={theme === 'dark' ? 'Switch to White / Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-white hover:text-[#0047FF] transition-colors" />
                ) : (
                  <Moon className="w-4 h-4 text-black hover:text-[#0047FF] transition-colors" />
                )}
              </button>

              {/* Wallet Connect (Visible on sm+) */}
              <button
                onClick={onOpenWallet}
                className="hidden sm:flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-black/15 dark:border-white/20 text-black dark:text-white hover:border-[#0047FF] hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all bg-white dark:bg-black"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Connect Wallet</span>
              </button>

              {/* Launch App Main CTA (Visible on sm+) */}
              <a
                href="https://app.soyara.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white transition-all shadow-md shadow-[#0047FF]/25 hover:shadow-lg hover:shadow-[#0047FF]/40 active:scale-95"
              >
                <span>Launch App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* THE THREE-LINE MENU BUTTON: SHOWN ON ALL SCREEN SIZES INCLUDING DESKTOP */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Toggle Full Navigation Menu"
                className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
                  menuOpen
                    ? 'border-[#0047FF] bg-[#0047FF] text-white shadow-md shadow-[#0047FF]/30'
                    : 'border-black/15 dark:border-white/20 hover:border-[#0047FF] text-black dark:text-white bg-black/[0.02] dark:bg-white/[0.04] hover:bg-[#0047FF]/10'
                }`}
                title="Full Navigation Menu"
              >
                {menuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>

            </div>
          </div>
        </div>
      </nav>

      {/* FULL SCREEN / SLIDE-OVER DRAWER MENU (DISPLAYS ON ALL SCREEN SIZES INCLUDING DESKTOP) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
          {/* Backdrop blur overlay */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity" 
            onClick={() => setMenuOpen(false)}
          />

          {/* Slide-over panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-[#07090e] border-l border-black/15 dark:border-white/15 shadow-2xl flex flex-col justify-between overflow-y-auto">
              
              {/* Drawer Top Header */}
              <div className="p-6 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border border-black/10 dark:border-white/20 p-0.5 bg-white dark:bg-black shadow-sm">
                      <Image
                        src="/logo.png"
                        alt="Soyara Logo"
                        width={36}
                        height={36}
                        className="w-full h-full object-contain rounded-full"
                      />
                    </div>
                    <div>
                      <div className="text-base font-bold font-mono text-black dark:text-white uppercase tracking-wider">
                        SOYARA MENU
                      </div>
                      <div className="text-[11px] text-[#0047FF] font-mono">
                        AI Swapping DEX Hub
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setMenuOpen(false)}
                    className="p-2 rounded-xl border border-black/10 dark:border-white/15 hover:border-[#0047FF] text-black dark:text-white hover:bg-[#0047FF]/10 transition-all"
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Launch DEX Gateways */}
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <a
                    href="https://app.soyara.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex flex-col p-3 rounded-xl bg-[#0047FF] hover:bg-[#0037cc] text-white transition-all shadow-md group"
                  >
                    <div className="flex items-center justify-between">
                      <Cpu className="w-4 h-4" />
                      <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                    <span className="font-bold font-mono text-xs mt-2 uppercase tracking-wide">
                      GenLayer DEX
                    </span>
                    <span className="text-[10px] opacity-80 font-mono">
                      app.soyara.xyz
                    </span>
                  </a>

                  <a
                    href="https://trade.soyara.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex flex-col p-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-black hover:border-[#0047FF] text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Layers className="w-4 h-4 text-[#0047FF]" />
                      <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                    <span className="font-bold font-mono text-xs mt-2 uppercase tracking-wide">
                      Solana & Sui
                    </span>
                    <span className="text-[10px] text-black/50 dark:text-white/50 font-mono">
                      trade.soyara.xyz
                    </span>
                  </a>
                </div>
              </div>

              {/* Drawer Navigation Links */}
              <div className="p-6 space-y-4 flex-1">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-black/40 dark:text-white/40 font-bold block mb-2 px-1">
                    Ecosystem Navigation
                  </span>
                  <div className="space-y-1">
                    <a
                      href="/#intelligent-contracts"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <Brain className="w-4 h-4 text-[#0047FF]" />
                      <span>Intelligent Contracts (Think)</span>
                    </a>

                    <a
                      href="/#ai-discussions"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <MessageSquare className="w-4 h-4 text-[#0047FF]" />
                      <span>AI Discussions & Consensus</span>
                    </a>

                    <a
                      href="/#analytics"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <BarChart3 className="w-4 h-4 text-[#0047FF]" />
                      <span>Analytics Intelligence</span>
                    </a>

                    <a
                      href="/#multichain"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium text-black/80 dark:text-white/80 hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <Layers className="w-4 h-4 text-[#0047FF]" />
                      <span>Solana & Sui Network Swap</span>
                    </a>

                    <Link
                      href="/links"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#0047FF]/10 border border-[#0047FF]/30 text-sm font-bold text-[#0047FF] hover:bg-[#0047FF] hover:text-white transition-all mt-2"
                    >
                      <div className="flex items-center gap-3">
                        <LinkIcon className="w-4 h-4" />
                        <span>All Official Links (/links)</span>
                      </div>
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                {/* Community Socials */}
                <div className="pt-3 border-t border-black/10 dark:border-white/10">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-black/40 dark:text-white/40 font-bold block mb-2 px-1">
                    Official Community
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href="https://x.com/soyaraxyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.02] dark:bg-white/[0.02] text-xs font-mono text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <XIcon className="w-3.5 h-3.5 text-[#0047FF]" />
                      <span>x.com/soyaraxyz</span>
                    </a>

                    <a
                      href="https://t.me/soyaradotxyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.02] dark:bg-white/[0.02] text-xs font-mono text-black dark:text-white hover:text-[#0047FF] dark:hover:text-[#0047FF] transition-all"
                    >
                      <TelegramIcon className="w-3.5 h-3.5 text-[#0047FF]" />
                      <span>t.me/soyaradotxyz</span>
                    </a>
                  </div>
                </div>

                {/* Actions & Utilities */}
                <div className="pt-3 border-t border-black/10 dark:border-white/10 space-y-2">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenWallet();
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3 text-xs font-semibold rounded-xl border border-black/20 dark:border-white/20 text-black dark:text-white hover:border-[#0047FF] hover:text-[#0047FF] transition-all"
                  >
                    <Wallet className="w-4 h-4 text-[#0047FF]" />
                    <span>Connect Multi-Chain Wallet</span>
                  </button>

                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between p-3 text-xs font-mono rounded-xl border border-black/10 dark:border-white/10 text-black dark:text-white hover:border-[#0047FF] transition-all"
                  >
                    <span className="flex items-center gap-2">
                      {theme === 'dark' ? <Sun className="w-4 h-4 text-white" /> : <Moon className="w-4 h-4 text-black" />}
                      <span>Current Mode: {theme === 'dark' ? 'Dark Mode' : 'White / Light Mode'}</span>
                    </span>
                    <span className="text-[#0047FF] font-bold">Switch &rarr;</span>
                  </button>
                </div>
              </div>

              {/* Drawer Bottom Status */}
              <div className="p-4 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] text-[11px] font-mono text-black/50 dark:text-white/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0047FF] animate-pulse" />
                  <span>GenLayer &bull; Solana &bull; Sui</span>
                </div>
                <span>v1.0 Operational</span>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
