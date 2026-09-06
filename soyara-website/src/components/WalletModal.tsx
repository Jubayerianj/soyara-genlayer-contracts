'use client';

import React, { useState } from 'react';
import { 
  X, 
  Wallet, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  Loader2, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const [selectedChain, setSelectedChain] = useState<'genlayer' | 'solana' | 'sui'>('genlayer');
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = (walletName: string) => {
    setConnectingWallet(walletName);
    setTimeout(() => {
      setConnectingWallet(null);
      if (selectedChain === 'genlayer') {
        setConnectedAccount('0x742d...44e');
      } else if (selectedChain === 'solana') {
        setConnectedAccount('8F3x...9Lp');
      } else {
        setConnectedAccount('0x3a9...b12');
      }
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-3xl border border-black/15 dark:border-white/20 bg-white dark:bg-[#07090e] p-6 shadow-2xl blue-glow-sm">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0047FF]/10 text-[#0047FF] flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-black dark:text-white font-mono">
              Connect Multi-Chain Wallet
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:border-[#0047FF] text-black dark:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chain selector pills */}
        <div className="flex p-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] my-4">
          <button
            onClick={() => setSelectedChain('genlayer')}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
              selectedChain === 'genlayer'
                ? 'bg-[#0047FF] text-white shadow-sm'
                : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white'
            }`}
          >
            GenLayer
          </button>
          <button
            onClick={() => setSelectedChain('solana')}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
              selectedChain === 'solana'
                ? 'bg-[#0047FF] text-white shadow-sm'
                : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white'
            }`}
          >
            Solana
          </button>
          <button
            onClick={() => setSelectedChain('sui')}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
              selectedChain === 'sui'
                ? 'bg-[#0047FF] text-white shadow-sm'
                : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white'
            }`}
          >
            Sui Network
          </button>
        </div>

        {/* Connected state */}
        {connectedAccount ? (
          <div className="py-6 text-center space-y-4 font-mono">
            <div className="w-12 h-12 rounded-full bg-[#0047FF]/10 text-[#0047FF] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-black/50 dark:text-white/50">CONNECTED ADDRESS</div>
              <div className="text-lg font-bold text-black dark:text-white mt-1">{connectedAccount}</div>
              <div className="text-xs text-[#0047FF] mt-1 font-sans">
                Ready to trade on {selectedChain === 'genlayer' ? 'app.soyara.xyz' : 'trade.soyara.xyz'}
              </div>
            </div>
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setConnectedAccount(null)}
                className="flex-1 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 hover:border-[#0047FF] text-black dark:text-white"
              >
                Disconnect
              </button>
              <a
                href={selectedChain === 'genlayer' ? 'https://app.soyara.xyz' : 'https://trade.soyara.xyz'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 text-xs font-mono font-bold rounded-xl bg-[#0047FF] text-white flex items-center justify-center gap-1.5"
              >
                <span>Go to App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          /* Wallet selection list */
          <div className="space-y-2 py-2">
            {selectedChain === 'genlayer' && (
              <>
                <button
                  onClick={() => handleConnect('GenLayer Native Provider')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0047FF] text-white flex items-center justify-center font-mono font-bold text-xs">
                      GL
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        GenLayer Native Keystore
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Direct Intelligent Contract access
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'GenLayer Native Provider' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleConnect('MetaMask / Web3')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white flex items-center justify-center font-mono font-bold text-xs">
                      MM
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        MetaMask / EVM Wallet
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Compatible with GenLayer RPC
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'MetaMask / Web3' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>
              </>
            )}

            {selectedChain === 'solana' && (
              <>
                <button
                  onClick={() => handleConnect('Phantom Wallet')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0047FF]/20 text-[#0047FF] flex items-center justify-center font-mono font-bold text-xs">
                      PH
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        Phantom Wallet
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Solana SVM Swaps
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'Phantom Wallet' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleConnect('Solflare')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white flex items-center justify-center font-mono font-bold text-xs">
                      SF
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        Solflare Wallet
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Solana high-speed liquidity
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'Solflare' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>
              </>
            )}

            {selectedChain === 'sui' && (
              <>
                <button
                  onClick={() => handleConnect('Suiet Wallet')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0047FF]/20 text-[#0047FF] flex items-center justify-center font-mono font-bold text-xs">
                      SU
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        Suiet Wallet
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Sui Move parallel execution
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'Suiet Wallet' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleConnect('Sui Wallet')}
                  disabled={connectingWallet !== null}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[#0047FF] bg-black/[0.01] dark:bg-white/[0.01] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white flex items-center justify-center font-mono font-bold text-xs">
                      SW
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-black dark:text-white font-mono">
                        Official Sui Wallet
                      </div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Mysten Labs ecosystem wallet
                      </div>
                    </div>
                  </div>
                  {connectingWallet === 'Sui Wallet' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047FF]" />
                  ) : (
                    <span className="text-xs font-mono text-[#0047FF] opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect &rarr;
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Modal footer security note */}
        <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[11px] font-mono text-black/50 dark:text-white/50">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0047FF]" />
            <span>End-to-End Cryptographic Security</span>
          </div>
          <span>Non-Custodial</span>
        </div>

      </div>
    </div>
  );
}
