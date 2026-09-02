import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  usePublicClient,
  useBalance 
} from 'wagmi';
import { parseUnits, zeroAddress } from 'viem';
import { 
  Sparkles, 
  Send, 
  Bot, 
  RotateCcw, 
  Cpu, 
  ShieldCheck, 
  ExternalLink, 
  Layers, 
  ArrowRightLeft,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  TrendingUp,
  Sliders,
  Flame
} from 'lucide-react';

import ChatMessage from '../components/AIAgent/ChatMessage';
import ProposalPanel from '../components/AIAgent/ProposalPanel';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../constants/addresses';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens';
import { ERC20_ABI } from '../constants/abis';
import AGGFLOW_ENTRYPOINT_ABI from '../abi/AGGFlowEntrypoint.json';
import { buildProgram } from '../utils/programBuilder';
import { useTheme } from '../components/contexts/ThemeContext';
import aiStyles from '../styles/AIPage.module.css';

const STARTER_PROMPTS = [
  '⚡ Swap 100 USDC to GEN with best route',
  '🛡️ How do GenLayer Intelligent Contracts protect my trades?',
  '📊 Compare V2 vs V3 for 50 WGEN to USDT',
  '🪙 What tokens are supported on GenLayer?',
  '💧 Add liquidity 10 GEN and 200 USDC',
  '🔒 What is the slippage protection policy?',
];

const TOPIC_CHIPS = [
  { label: '⚡ Trade & Quotes', prompt: 'Swap 100 USDC to GEN on V3 optimal route' },
  { label: '🛡️ GenVM Validation', prompt: 'How does GenLayer Optimistic Democracy and AgentValidator IC work?' },
  { label: '📊 V2 vs V3 Fees', prompt: 'What is the fee difference between V2 classic and V3 concentrated pools?' },
  { label: '🪙 Token Prices', prompt: 'List all supported tokens and their prices on GenLayer Testnet' },
  { label: '🔒 Slippage Policy', prompt: 'Explain the 3% slippage cap and MEV safety rules' },
];

export default function AIPage() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [mobileTab, setMobileTab] = useState('chat'); // 'chat' | 'proposal'
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "👋 Welcome to **Soyara AI Trading** on **GenLayer Testnet**!\n\nI am your specialized DeFi trading assistant. Every execution proposal is verified by decentralized AI consensus on **GenVM** via the **AgentValidator** (`" + INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8) + "...`) and **LiquidityValidator** Intelligent Contracts.\n\nAsk me for real-time swap quotes, route comparisons, fee analysis, or to prepare trade proposals!",
      toolsUsed: ['GenVM Consensus', 'AgentValidator IC', 'DeFi Analytics'],
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentProposal, setCurrentProposal] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTxHash, setActiveTxHash] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Native GEN balance
  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: userAddress,
  });

  // Entrypoint address
  const entrypointAddress = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  const wgenAddress = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

  // Find tokenIn object from current proposal
  const fromTokenObj = useMemo(() => {
    if (!currentProposal) return null;
    const symbol = currentProposal.tokenIn || currentProposal.fromToken;
    const address = currentProposal.tokenInAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'GEN', isNative: symbol === 'GEN', decimals: 18 };
  }, [currentProposal]);

  const toTokenObj = useMemo(() => {
    if (!currentProposal) return null;
    const symbol = currentProposal.tokenOut || currentProposal.toToken;
    const address = currentProposal.tokenOutAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'USDC', isNative: false, decimals: 18 };
  }, [currentProposal]);

  // Token Allowance Check
  const isFromNative = fromTokenObj?.isNative || fromTokenObj?.symbol === 'GEN';
  const { data: allowance, refetch: refetchAllowance, isFetching: isCheckingAllowance } = useReadContract({
    address: isFromNative ? undefined : fromTokenObj?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: !isFromNative && userAddress && entrypointAddress ? [userAddress, entrypointAddress] : undefined,
    query: {
      enabled: !isFromNative && !!userAddress && !!entrypointAddress && !!fromTokenObj?.address,
    },
  });

  const isWrapOrUnwrapProposal = useMemo(() => {
    if (!currentProposal) return false;
    const symIn = fromTokenObj?.symbol || currentProposal.tokenIn;
    const symOut = toTokenObj?.symbol || currentProposal.tokenOut;
    return (symIn === 'GEN' && symOut === 'WGEN') || (symIn === 'WGEN' && symOut === 'GEN') || currentProposal.dex === 'wrap' || currentProposal.dex === 'unwrap';
  }, [currentProposal, fromTokenObj, toTokenObj]);

  const needsApproval = useMemo(() => {
    if (!currentProposal || isFromNative || isWrapOrUnwrapProposal || !userAddress || !fromTokenObj?.address) return false;
    if (allowance === undefined) return false;
    const decimals = fromTokenObj?.decimals || 18;
    const amountInWei = currentProposal.amountInRaw 
      ? BigInt(currentProposal.amountInRaw)
      : parseUnits(String(currentProposal.amountIn || '0'), decimals);
    return allowance < amountInWei;
  }, [currentProposal, isFromNative, isWrapOrUnwrapProposal, userAddress, fromTokenObj, allowance]);

  // Contract write hooks
  const { writeContractAsync: approveAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: executeSwapAsync } = useWriteContract();

  // Watch transaction receipt
  const { isLoading: isTxWaiting, isSuccess: isTxSuccess, isError: isTxFailed } = useWaitForTransactionReceipt({
    hash: activeTxHash,
  });

  useEffect(() => {
    if (isTxSuccess && activeTxHash) {
      setIsExecuting(false);
      refetchAllowance();
      refetchNativeBalance();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `🎉 **Transaction Confirmed On-Chain!**\n\nYour AI-validated swap has been executed on Soyara DEX.\n\nTx Hash: \`${activeTxHash}\``,
          toolsUsed: ['GenLayer Bradbury Explorer', 'AGGFlow Entrypoint'],
        }
      ]);
    } else if (isTxFailed && activeTxHash) {
      setIsExecuting(false);
      setExecutionError('Transaction reverted on GenLayer');
    }
  }, [isTxSuccess, isTxFailed, activeTxHash, refetchAllowance, refetchNativeBalance]);

  // Send message to AI Agent
  const handleSend = async (textToSend) => {
    const text = typeof textToSend === 'string' ? textToSend : input;
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setExecutionError(null);

    try {
      const res = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.proposal) {
        setCurrentProposal(data.proposal);
        setValidationResult(null);
        setActiveTxHash(null);
        setMobileTab('proposal');
      }

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: data.reply || 'I have analyzed your request.',
          toolsUsed: data.toolsUsed || [],
        }
      ]);
    } catch (err) {
      console.error('Agent API call failed:', err);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue reaching the AI network. Please try again.',
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate current proposal with GenLayer Intelligent Contract
  const handleValidate = async () => {
    if (!currentProposal || isValidating) return;
    setIsValidating(true);
    setExecutionError(null);

    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentProposal),
      });

      const data = await res.json();
      setValidationResult(data);

      if (data.approved) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🛡️ **GenLayer IC Validation Approved!**\n\n- **Validator**: \`${data.genlayer_contract}\`\n- **Consensus**: *${data.consensus_mode || 'Optimistic Democracy (GenVM)'}*\n- **Proposal ID**: \`${data.proposal_id}\`\n- **Status**: *${data.reason}*\n\nYou can now proceed to execute the trade on-chain.`,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ **GenLayer IC Validation Rejected**\n\nReason: *${data.reason}*`,
            toolsUsed: ['AgentValidator IC'],
          }
        ]);
      }
    } catch (err) {
      console.error('Validation error:', err);
      setValidationResult({
        approved: false,
        reason: 'Network error communicating with GenLayer Intelligent Contract',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Approve token
  const handleApprove = async () => {
    if (!fromTokenObj?.address || !entrypointAddress || !currentProposal) return;
    setExecutionError(null);

    try {
      const decimals = fromTokenObj.decimals || 18;
      const amountInWei = currentProposal.amountInRaw
        ? BigInt(currentProposal.amountInRaw)
        : parseUnits(String(currentProposal.amountIn || '0'), decimals);

      const hash = await approveAsync({
        address: fromTokenObj.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [entrypointAddress, amountInWei],
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⏳ Approval submitted for **${currentProposal.amountIn} ${fromTokenObj.symbol}**. Waiting for confirmation... (Tx: \`${hash.slice(0, 10)}...\`)`,
        }
      ]);

      await refetchAllowance();
    } catch (err) {
      console.error('Approval failed:', err);
      setExecutionError(err?.shortMessage || err?.message || 'Token approval rejected by user');
    }
  };

  // Gas estimation helper for GenLayer
  const getTxGasParams = useCallback(async (fallbackGasLimit = 3500000n) => {
    let params = { gas: fallbackGasLimit };
    if (!publicClient) return params;
    try {
      const block = await publicClient.getBlock({ blockTag: 'latest' }).catch(() => null);
      const baseFee = block?.baseFeePerGas ?? 1000000000n;
      params.maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    } catch {
      params.maxFeePerGas = 8000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    }
    return params;
  }, [publicClient]);

  // Resolve V2 Pair or V3 Pool for execution
  const resolvePoolRoute = useCallback(async (tokenInFormatted, tokenOutFormatted, dexPref = 'best') => {
    const factoryV2 = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
    const factoryV3 = CONTRACT_ADDRESSES[4221]?.v3Factory || '0xBd959038300aF0C8dd1873E497d6D0a565b4E246';

    const tokenInAddr = tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address;
    const tokenOutAddr = tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address;

    // 1. Try V3 if requested or best
    if ((dexPref === 'v3' || dexPref === 'best') && publicClient) {
      const feeTiers = [500, 3000, 10000];
      for (const fee of feeTiers) {
        try {
          const pool = await publicClient.readContract({
            address: factoryV3,
            abi: [{
              inputs: [
                { name: 'tokenA', type: 'address' },
                { name: 'tokenB', type: 'address' },
                { name: 'fee', type: 'uint24' },
              ],
              name: 'getPool',
              outputs: [{ name: 'pool', type: 'address' }],
              stateMutability: 'view',
              type: 'function',
            }],
            functionName: 'getPool',
            args: [tokenInAddr, tokenOutAddr, fee],
          });
          if (pool && pool !== zeroAddress && pool !== '0x0000000000000000000000000000000000000000') {
            return { poolAddress: pool, poolType: 'v3', fee, dexName: 'UniswapV3' };
          }
        } catch (e) {
          // continue
        }
      }
    }

    // 2. Fallback to V2 Pair
    if (publicClient) {
      try {
        const pair = await publicClient.readContract({
          address: factoryV2,
          abi: [{
            inputs: [
              { name: 'tokenA', type: 'address' },
              { name: 'tokenB', type: 'address' },
            ],
            name: 'getPair',
            outputs: [{ name: 'pair', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'getPair',
          args: [tokenInAddr, tokenOutAddr],
        });
        if (pair && pair !== zeroAddress && pair !== '0x0000000000000000000000000000000000000000') {
          return { poolAddress: pair, poolType: 'v2', fee: 3000, dexName: 'OurV2' };
        }
      } catch (e) {
        // continue
      }
    }

    return null;
  }, [publicClient, wgenAddress]);

  // Execute swap on-chain
  const handleExecute = async () => {
    if (!currentProposal || !userAddress) return;
    setIsExecuting(true);
    setExecutionError(null);

    try {
      const isNative = isFromNative;
      const decimalsIn = fromTokenObj?.decimals || 18;
      const decimalsOut = toTokenObj?.decimals || 18;

      const amountInWei = currentProposal.amountInRaw
        ? BigInt(currentProposal.amountInRaw)
        : parseUnits(String(currentProposal.amountIn || '0'), decimalsIn);

      const minAmountOutWei = currentProposal.minAmountOutRaw
        ? BigInt(currentProposal.minAmountOutRaw)
        : parseUnits(String(currentProposal.minAmountOut || '1'), decimalsOut);

      const tokenInFormatted = {
        ...fromTokenObj,
        address: isNative ? zeroAddress : fromTokenObj.address,
        isNative,
      };
      const tokenOutFormatted = {
        ...toTokenObj,
        address: toTokenObj.isNative ? zeroAddress : toTokenObj.address,
        isNative: toTokenObj.isNative || toTokenObj.symbol === 'GEN',
      };

      const isWrapOp = (fromTokenObj?.symbol === 'GEN' && toTokenObj?.symbol === 'WGEN') || currentProposal.dex === 'wrap';
      const isUnwrapOp = (fromTokenObj?.symbol === 'WGEN' && toTokenObj?.symbol === 'GEN') || currentProposal.dex === 'unwrap';

      if (isWrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await executeSwapAsync({
          address: wgenAddress,
          abi: [
            {
              type: 'function',
              name: 'deposit',
              inputs: [],
              outputs: [],
              stateMutability: 'payable',
            }
          ],
          functionName: 'deposit',
          value: amountInWei,
          ...gasParams,
        });
        setActiveTxHash(hash);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Wrap Submitted!**\n\nWrapping **${currentProposal.amountIn} GEN** to **WGEN** (1:1 direct wrap)...\n\nTx Hash: [${hash.slice(0, 10)}...${hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${hash})`,
            toolsUsed: ['WGEN Deposit', 'GenLayer Bradbury'],
          }
        ]);
        return;
      }

      if (isUnwrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await executeSwapAsync({
          address: wgenAddress,
          abi: [
            {
              type: 'function',
              name: 'withdraw',
              inputs: [{ name: 'wad', type: 'uint256' }],
              outputs: [],
              stateMutability: 'nonpayable',
            }
          ],
          functionName: 'withdraw',
          args: [amountInWei],
          ...gasParams,
        });
        setActiveTxHash(hash);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Unwrap Submitted!**\n\nUnwrapping **${currentProposal.amountIn} WGEN** to **GEN** (1:1 direct unwrap)...\n\nTx Hash: [${hash.slice(0, 10)}...${hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${hash})`,
            toolsUsed: ['WGEN Withdraw', 'GenLayer Bradbury'],
          }
        ]);
        return;
      }

      const resolvedRoute = await resolvePoolRoute(
        tokenInFormatted,
        tokenOutFormatted,
        currentProposal.dex || 'best'
      );

      if (!resolvedRoute) {
        throw new Error(`No active liquidity pool found on Soyara DEX for ${fromTokenObj.symbol}/${toTokenObj.symbol}`);
      }

      const program = buildProgram(tokenInFormatted, tokenOutFormatted, resolvedRoute, wgenAddress);

      const swapIntent = [
        tokenOutFormatted.isNative ? zeroAddress : tokenOutFormatted.address,
        minAmountOutWei,
        tokenInFormatted.isNative ? zeroAddress : tokenInFormatted.address,
        amountInWei,
      ];

      const feeCollector = CONTRACT_ADDRESSES[4221]?.dexFeeVault || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
      const feeCollection = [
        feeCollector,
        5n,
        zeroAddress,
        0n,
        false,
      ];

      const gasParams = await getTxGasParams(3500000n);

      const hash = await executeSwapAsync({
        address: entrypointAddress,
        abi: AGGFLOW_ENTRYPOINT_ABI,
        functionName: 'executeSwap',
        args: [swapIntent, feeCollection, program],
        value: isNative ? amountInWei : 0n,
        ...gasParams,
      });

      setActiveTxHash(hash);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `🚀 **Trade Submitted!**\n\nExecution is broadcasting on GenLayer Bradbury Testnet...\n\nTx Hash: [${hash.slice(0, 10)}...${hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${hash})`,
          toolsUsed: ['AGGFlowEntrypoint', 'GenLayer Bradbury'],
        }
      ]);
    } catch (err) {
      console.error('Execution failed:', err);
      setIsExecuting(false);
      setExecutionError(err?.shortMessage || err?.message || 'Execution rejected by user or network');
    }
  };

  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Cleared active session! What trade or DeFi question would you like to explore next?",
      }
    ]);
    setCurrentProposal(null);
    setValidationResult(null);
    setActiveTxHash(null);
    setExecutionError(null);
  };

  return (
    <>
      <Head>
        <title>Soyara AI Trading — GenLayer Intelligent Contracts</title>
        <meta name="description" content="Soyara DEX - AI-Validated DeFi Execution on GenLayer Bradbury Testnet" />
      </Head>

      <div className={`${aiStyles.container} ${isDark ? aiStyles.themeDark : aiStyles.themeLight}`}>
        {/* Top Intelligence Banner */}
        <div className={aiStyles.banner}>
          <div className={aiStyles.bannerInner}>
            <div className={aiStyles.bannerLeft}>
              <div className={aiStyles.bannerIcon}>
                <Cpu size={20} />
              </div>
              <div>
                <div className={aiStyles.bannerTitle}>
                  GenLayer Intelligent Contracts Active
                </div>
                <div className={aiStyles.bannerDesc}>
                  AgentValidator: <code className={aiStyles.code}>{INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8)}...{INTELLIGENT_CONTRACTS.agentValidator.slice(-6)}</code> · Optimistic Democracy Consensus on GenVM
                </div>
              </div>
            </div>

            <div className={aiStyles.bannerRight}>
              <div className={aiStyles.statusPill}>
                <span className={aiStyles.statusDot} />
                Bradbury Testnet (4221)
              </div>
            </div>
          </div>
        </div>

        {/* Quick Topic Chips */}
        <div className={aiStyles.topicChipsContainer}>
          <div className={aiStyles.topicChipsTitle}>
            <Sparkles size={14} style={{ color: '#0284c7' }} />
            <span>Topics:</span>
          </div>
          <div className={aiStyles.topicChipsScroll}>
            {TOPIC_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  handleSend(chip.prompt);
                  setMobileTab('chat');
                }}
                className={aiStyles.topicChipBtn}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className={aiStyles.mobileTabSwitcher}>
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`${aiStyles.mobileTabBtn} ${mobileTab === 'chat' ? aiStyles.mobileTabBtnActive : ''}`}
          >
            <Bot size={16} />
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('proposal')}
            className={`${aiStyles.mobileTabBtn} ${mobileTab === 'proposal' ? aiStyles.mobileTabBtnActive : ''}`}
          >
            <ShieldCheck size={16} />
            <span>Proposal {currentProposal ? '•' : ''}</span>
          </button>
        </div>

        {/* Main Grid */}
        <div className={aiStyles.mainGrid}>
          {/* Left Column: Chat Assistant */}
          <div className={`${aiStyles.chatCard} ${mobileTab !== 'chat' ? aiStyles.hideOnMobileChat : ''}`}>
            <div className={aiStyles.chatHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Soyara AI Assistant</span>
              </div>
              <button 
                type="button"
                onClick={handleReset}
                className={aiStyles.resetBtn}
                title="Reset Conversation"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className={aiStyles.messagesContainer}>
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  toolsUsed={msg.toolsUsed}
                />
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.85rem' }}
                >
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#0284c7' }} />
                  <span>AI Agent is analyzing routes & calculating quotes on GenLayer...</span>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Starter Prompts */}
            <div className={aiStyles.startersWrapper}>
              <div className={aiStyles.startersScroll}>
                {STARTER_PROMPTS.map((promptText, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      handleSend(promptText.replace(/^[^\w]+/, ''));
                      setMobileTab('chat');
                    }}
                    className={aiStyles.starterChip}
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box */}
            <div className={aiStyles.inputWrapper}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask me to quote, swap, compare routes, or discuss DeFi on GenLayer..."
                className={aiStyles.textInput}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`${aiStyles.sendButton} ${(!input.trim() || isLoading) ? aiStyles.sendButtonDisabled : ''}`}
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Right Column: Execution & Validation Panel */}
          <div className={`${aiStyles.proposalCard} ${mobileTab !== 'proposal' ? aiStyles.hideOnMobileProposal : ''}`}>
            <div className={aiStyles.proposalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>AI Execution Proposal</span>
              </div>
              {currentProposal && (
                <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                  {currentProposal.route || 'V2'}
                </span>
              )}
            </div>

            <div className={aiStyles.proposalBody}>
              <ProposalPanel
                proposal={currentProposal}
                validationResult={validationResult}
                onValidate={handleValidate}
                onExecute={handleExecute}
                onApprove={handleApprove}
                needsApproval={needsApproval}
                isApproving={isApproving}
                isValidating={isValidating}
                isExecuting={isExecuting || isTxWaiting}
                txHash={activeTxHash}
                executionError={executionError}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
