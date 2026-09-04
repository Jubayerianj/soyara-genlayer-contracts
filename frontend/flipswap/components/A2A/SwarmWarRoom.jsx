// components/A2A/SwarmWarRoom.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Zap, ShieldCheck, Play, RotateCcw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { orchestrateSwarm, AGENT_REGISTRY } from '../../services/a2a/agents';
import { useAgentSwapExecution } from '../../hooks/useAgentSwapExecution';
import ConsensusProgress from '../ConsensusProgress';
import ActivityPanel from '../ActivityPanel';
import BalanceStrip from '../BalanceStrip';
import { recordActivity } from '../../lib/txStore';
import styles from '../../styles/A2A.module.css';

const PRESET_CHIPS = [
  { label: '⚡ 100 USDC ➔ WGEN', query: 'Swap 100 USDC to WGEN with 0.3% slippage' },
  { label: '🧮 V2 vs V3 500 USDT', query: 'Compare V2 vs V3 route for 500 USDT to GEN' },
  { label: '💧 Add 10 WGEN LP', query: 'Add liquidity 10 WGEN and 200 USDC' },
  { label: '🛡️ Test 4% Slippage', query: 'Test 4% slippage to verify fail-closed cap' }
];

export default function SwarmWarRoom({ mode = 'user' }) {
  const { address: userAddress, isConnected } = useAccount();

  const [prompt, setPrompt] = useState('');
  const [timeline, setTimeline] = useState([
    {
      agent: AGENT_REGISTRY.intent,
      text: 'A2A Swarm online. Enter your trade intent or tap a preset above to begin multi-agent negotiation.',
      time: 'Ready'
    }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [payload, setPayload] = useState(null);
  const [execState, setExecState] = useState(null); // null | 'approving' | 'executing' | 'done' | 'error'
  const [execErrorMsg, setExecErrorMsg] = useState(null);
  // Consensus rounds dominate the wait here, so the timeline gets a live panel
  // showing the real phase and elapsed time rather than sitting silent.
  const [consensus, setConsensus] = useState(null); // {startedAt, statusName, txHash, retry}
  // Before/after balances around settlement — the agent wallet settles with no
  // wallet prompt, so this delta is the user's direct confirmation of movement.
  const [balanceSnapshot, setBalanceSnapshot] = useState(null);
  const [liveBalances, setLiveBalances] = useState(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline, isRunning]);

  // Normalize the swarm's proposal shape (agents.js RiskValidatorAgent.validate)
  // into what useAgentSwapExecution expects (matches pages/ai.jsx's buildProposalObject):
  // tokenIn/tokenOut as symbols + a separate *Address field, amountIn/minAmountOut as
  // human-readable numbers + a separate *Raw wei-string field.
  const proposalForExecution = useMemo(() => {
    if (!payload) return null;
    const { route, intent } = payload;
    return {
      action: intent?.action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP',
      tokenIn: route.tokenIn.symbol,
      tokenOut: route.tokenOut.symbol,
      tokenInAddress: route.tokenIn.isNative ? undefined : route.tokenIn.address,
      tokenOutAddress: route.tokenOut.isNative ? undefined : route.tokenOut.address,
      amountIn: route.amountInNum,
      amountInRaw: route.amountInWei,
      minAmountOut: route.minAmountOutNum,
      minAmountOutRaw: route.minAmountOutWei,
      slippageBps: intent?.slippageBps || 100,
      dex: route.chosenRoute?.includes('V3') ? 'v3' : 'v2',
      deadline: payload.risk?.proposal?.deadline,
      // When no pool can fill the pair, RouterMathAgent falls back to a rough
      // 1:1 estimate so the swarm dialogue can still complete. That estimate has
      // no liquidity behind it and can only revert, so it must never be
      // executable — e.g. ETH has no pool on Bradbury at all.
      executable: route.isLiveQuote !== false,
      notExecutableReason: route.isLiveQuote === false
        ? `No liquidity pool exists for ${route.tokenIn.symbol}/${route.tokenOut.symbol} on Soyara DEX. The rate shown is a rough estimate and cannot be executed.`
        : null,
      priceImpactPct: typeof route.priceImpact === 'number' ? route.priceImpact : null,
      highImpact: typeof route.priceImpact === 'number' && route.priceImpact >= 5,
    };
  }, [payload]);

  const {
    fromTokenObj,
    toTokenObj,
    needsApproval,
    hasInsufficientBalance,
    isNotExecutable,
    notExecutableReason,
    isApproving,
    approve,
    execute,
    isTxWaiting,
    isTxSuccess,
    isTxFailed,
    activeTxHash,
    executionError,
    reset: resetExecution,
  } = useAgentSwapExecution(proposalForExecution);

  useEffect(() => {
    if (isTxSuccess && activeTxHash) {
      setExecState('done');
      setBalanceRefreshKey((k) => k + 1);
    } else if (isTxFailed && activeTxHash) {
      setExecState('error');
      setExecErrorMsg('Transaction reverted on GenLayer');
    }
  }, [isTxSuccess, isTxFailed, activeTxHash]);

  useEffect(() => {
    if (executionError) {
      setExecState('error');
      setExecErrorMsg(executionError);
    }
  }, [executionError]);

  const handleStartSwarm = async (q) => {
    const textToRun = q || prompt;
    if (!textToRun.trim() || isRunning) return;

    setPrompt('');
    setPayload(null);
    setExecState(null);
    setExecErrorMsg(null);
    resetExecution();
    setConsensus(null);
    setIsRunning(true);

    setTimeline(prev => [
      ...prev,
      { isUser: true, text: textToRun, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);

    try {
      // Consensus rounds run for tens of seconds. Without this the timeline sat
      // completely still for the whole wait and read as a hang.
      const onProgress = (text, meta) => {
        setConsensus((prev) => ({
          startedAt: prev?.startedAt || Date.now(),
          statusName: meta?.statusName ?? prev?.statusName ?? null,
          txHash: meta?.txHash ?? prev?.txHash ?? null,
          retry: meta?.retry ?? prev?.retry ?? false,
        }));
        setTimeline((prev) => [
          ...prev,
          {
            agent: AGENT_REGISTRY.risk,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      };
      const generator = orchestrateSwarm(
        textToRun,
        userAddress || '0x3333333333333333333333333333333333333333',
        { onProgress }
      );
      for await (const step of generator) {
        if (step.type === 'SWARM_COMPLETE') {
          setPayload(step.payload);
          const r = step.payload?.risk;
          const rt = step.payload?.route;
          if (r) {
            recordActivity({
              id: r.proposalId || `swarm-${Date.now()}`,
              kind: 'swap',
              user: userAddress,
              pair: `${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`,
              label: `Swarm ${rt?.amountInNum ?? ''} ${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`,
              proposalId: r.proposalId || null,
              status: r.isApproved ? 'approved' : r.isPending ? 'pending' : 'rejected',
              reason: r.reason,
            });
          }
        }

        setTimeline(prev => [
          ...prev,
          {
            agent: step.agent,
            text: step.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      setTimeline(prev => [
        ...prev,
        { agent: AGENT_REGISTRY.risk, text: `Error: ${err.message}`, time: 'Alert' }
      ]);
    } finally {
      setConsensus(null);
      setIsRunning(false);
    }
  };

  // Real settlement through the GenLayer approval gate — see
  // hooks/useAgentSwapExecution.js (ERC20 approve → AgentExecutor one-time
  // approval → /api/agent-execute). Previously this was a fake 1s timeout
  // that never called any real API or submitted any on-chain transaction.
  const handleExecute = async () => {
    if (!isConnected || !userAddress) {
      alert('Please connect wallet on GenLayer Testnet.');
      return;
    }
    if (!payload?.risk?.isApproved) return;

    setExecErrorMsg(null);

    try {
      if (needsApproval) {
        setExecState('approving');
        const approveResult = await approve();
        if (approveResult) {
          setTimeline(prev => [
            ...prev,
            {
              agent: AGENT_REGISTRY.risk,
              text: `⏳ **One-time ${approveResult.symbol} approval submitted.** This is the only approval you sign for this token — every later swarm-executed trade settles with no wallet prompt.\n\nWaiting for confirmation... (Tx: \`${approveResult.hash.slice(0, 10)}...\`)`,
              time: 'Approval'
            }
          ]);
        }
      }

      setExecState('executing');
      setBalanceSnapshot(liveBalances);
      const validationResult = { approved: payload.risk.isApproved, proposal_id: payload.risk.proposalId };
      const result = await execute(validationResult);
      setBalanceRefreshKey((k) => k + 1);
      if (!result) return;

      let text;
      if (result.kind === 'wrap') {
        text = `🚀 **Wrap Submitted!** Tx: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`;
      } else if (result.kind === 'unwrap') {
        text = `🚀 **Unwrap Submitted!** Tx: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`;
      } else if (result.kind === 'add_liquidity') {
        text = `💧 **Liquidity Added via AgentExecutor!** One-time approval bound and consumed.\n\nOp Hash: \`${result.opHash?.slice(0, 14)}...\`\n\nExecution Tx: [${result.hash?.slice(0, 10)}...${result.hash?.slice(-8)}](${result.explorerUrl})`;
      } else if (result.kind === 'swap') {
        recordActivity({
          id: result.hash, kind: 'swap', user: userAddress,
          pair: `${proposalForExecution?.tokenIn} → ${proposalForExecution?.tokenOut}`,
          label: `Settled ${proposalForExecution?.amountIn} ${proposalForExecution?.tokenIn} → ${proposalForExecution?.tokenOut}`,
          settleTxHash: result.hash, status: 'settled',
        });
        text = `🚀 **Trade Executed via AgentExecutor!** One-time approval bound and consumed.\n\nTrade Hash: \`${result.tradeHash?.slice(0, 14)}...\`\n\nExecution Tx: [${result.hash?.slice(0, 10)}...${result.hash?.slice(-8)}](${result.explorerUrl})`;
      } else {
        text = `🚀 **Trade Submitted!** Tx: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`;
      }
      setTimeline(prev => [...prev, { agent: AGENT_REGISTRY.dev, text, time: 'Settlement' }]);
    } catch (err) {
      console.error('A2A execution failed:', err);
      setExecState('error');
      setExecErrorMsg(err?.shortMessage || err?.message || 'Execution rejected by user or network');
    }
  };

  return (
    <div className={styles.swarmGrid}>
      {/* Left: Interactive Dialogue Box */}
      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <Zap size={16} color="var(--blue-primary, #0284c7)" />
            <span>Agent Dialogue Feed</span>
          </div>
          <button onClick={() => setTimeline([])} className={styles.chip}>
            <RotateCcw size={11} style={{ display: 'inline', marginRight: '3px' }} /> Clear
          </button>
        </div>

        {/* Preset Chips */}
        <div className={styles.chipsBar}>
          {PRESET_CHIPS.map((c, i) => (
            <button key={i} className={styles.chip} onClick={() => handleStartSwarm(c.query)} disabled={isRunning}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form 
          className={styles.quickInputWrap}
          onSubmit={(e) => {
            e.preventDefault();
            handleStartSwarm();
          }}
        >
          <input 
            className={styles.quickInput}
            placeholder="Type trade intent (e.g., 'Swap 100 USDC to WGEN')..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning}
          />
          <button type="submit" className={styles.runBtn} disabled={isRunning || !prompt.trim()}>
            <Play size={14} /> Run
          </button>
        </form>

        {/* Timeline */}
        <div className={styles.timelineFeed}>
          {timeline.map((item, idx) => (
            <div key={idx} className={styles.timelineItem}>
              <div 
                className={styles.timelineAvatar} 
                style={{ 
                  background: item.isUser ? 'var(--blue-glow, rgba(2, 132, 199, 0.15))' : `${item.agent?.color}20`,
                  color: item.isUser ? 'var(--blue-primary, #0284c7)' : item.agent?.color
                }}
              >
                {item.isUser ? '👤' : item.agent?.icon}
              </div>
              <div className={styles.timelineBody}>
                <div className={styles.timelineHeader}>
                  <span className={styles.timelineName} style={{ color: item.isUser ? 'var(--blue-primary, #0284c7)' : item.agent?.color }}>
                    {item.isUser ? 'You' : item.agent?.name}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>{item.time}</span>
                </div>
                <div 
                  className={styles.timelineText}
                  dangerouslySetInnerHTML={{ 
                    __html: item.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.*?)`/g, '<code>$1</code>') 
                  }}
                />
              </div>
            </div>
          ))}
          {isRunning && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', padding: '0.4rem' }}>
              <div className={styles.agentDotWorking} />
              <span>Agents synthesizing consensus...</span>
            </div>
          )}
          {proposalForExecution && (
              <div style={{ margin: '0.6rem 0' }}>
                <BalanceStrip
                  tokens={[fromTokenObj, toTokenObj]}
                  snapshot={balanceSnapshot}
                  refreshKey={balanceRefreshKey}
                  onLoaded={setLiveBalances}
                />
              </div>
            )}
            <div style={{ margin: '0.6rem 0' }}>
              <ActivityPanel />
            </div>
            {consensus && (
              <div style={{ margin: '0.6rem 0' }}>
                <ConsensusProgress
                  statusName={consensus.statusName}
                  txHash={consensus.txHash}
                  startedAt={consensus.startedAt}
                  isRetryRound={consensus.retry}
                />
              </div>
            )}
            <div ref={scrollRef} />
        </div>
      </div>

      {/* Right: Clean Settlement Summary Card */}
      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <ShieldCheck size={16} color="#10b981" />
            <span>Settlement Execution</span>
          </div>
        </div>

        {payload ? (
          <div className={styles.summaryBox}>
            <div style={{ padding: '0.6rem 0.75rem', background: 'var(--blue-glow, rgba(2, 132, 199, 0.08))', borderRadius: '0.5rem', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>OPTIMAL ROUTE</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main, #ffffff)' }}>
                {payload.route.chosenRoute}
              </div>
            </div>

            <div className={styles.statRow}>
              <span>In / Out:</span>
              <span className={styles.statVal}>
                {payload.route.amountInNum} {payload.route.tokenIn.symbol} ➔ ~{payload.route.expectedOutNum.toFixed(4)} {payload.route.tokenOut.symbol}
              </span>
            </div>

            <div className={styles.statRow}>
              <span>Min Guaranteed:</span>
              <span className={styles.statVal}>
                {payload.route.minAmountOutNum.toFixed(4)} {payload.route.tokenOut.symbol} ({(payload.intent.slippageBps / 100).toFixed(2)}%)
              </span>
            </div>

            <div className={styles.statRow}>
              <span>GenVM Consensus:</span>
              <span
                className={styles.statVal}
                style={{ color: payload.risk.isApproved ? '#10b981' : payload.risk.isPending ? '#f59e0b' : '#f43f5e' }}
              >
                {payload.risk.isApproved ? '✅ Verified Quorum' : payload.risk.isPending ? '⏳ Consensus Pending' : '❌ Rejected'}
              </span>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '3px' }}>ONE-TIME HASH BINDING:</div>
              <div className={styles.hashBoxMini}>{payload.risk.tradeHash}</div>
            </div>

            <button
              onClick={handleExecute}
              disabled={!payload.risk.isApproved || execState === 'approving' || execState === 'executing' || isTxWaiting || hasInsufficientBalance || isNotExecutable}
              className={styles.executeBtn}
            >
              {(execState === 'approving' || execState === 'executing' || isTxWaiting) && (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {execState !== 'approving' && execState !== 'executing' && !isTxWaiting && <Zap size={16} />}
              {isNotExecutable
                ? 'No Liquidity Pool for This Pair'
                : hasInsufficientBalance
                ? `Insufficient ${proposalForExecution?.tokenIn || 'Token'} Balance`
                : execState === 'approving'
                ? `Approving ${proposalForExecution?.tokenIn}...`
                : execState === 'executing' || isTxWaiting
                  ? 'Settling on GenLayer...'
                  : needsApproval
                    ? `Approve ${proposalForExecution?.tokenIn} & Execute`
                    : 'Execute Non-Custodial Swap'}
            </button>

            {execState === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  Settled — ~{payload.route.expectedOutNum.toFixed(6)} {payload.route.tokenOut.symbol} sent to {userAddress ? `${userAddress.slice(0, 6)}…${userAddress.slice(-4)}` : 'your wallet'}
                  {activeTxHash && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontFamily: 'monospace', color: '#10b981' }}>
                      {activeTxHash.slice(0, 10)}…{activeTxHash.slice(-8)}
                    </span>
                  )}
                </div>
                {/* Settlement is a plain EVM transaction. The GenLayer explorer
                    indexes GenVM/consensus transactions, so linking there renders
                    an empty page and makes a successful swap look like it failed. */}
                {activeTxHash && (
                  <div style={{ fontWeight: 500, fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>
                    Settlement is an EVM transaction — the GenLayer explorer only indexes GenVM
                    consensus transactions, so it will show this hash as empty. Verify with{' '}
                    <code style={{ fontSize: '0.66rem' }}>eth_getTransactionReceipt</code> on {' '}
                    <code style={{ fontSize: '0.66rem' }}>rpc-bradbury.genlayer.com</code>.
                  </div>
                )}
                {/* ERC-20 output is invisible in most wallets until the token is
                    imported — say so, or a successful swap looks like lost funds. */}
                {!payload.route.tokenOut.isNative && (
                  <div style={{ fontWeight: 500, fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                    {payload.route.tokenOut.symbol} is an ERC-20 — add token{' '}
                    <code style={{ fontSize: '0.68rem' }}>{payload.route.tokenOut.address}</code>{' '}
                    in your wallet to see the balance.
                  </div>
                )}
              </div>
            )}

            {execState === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.75rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '0.5rem', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 600 }}>
                <XCircle size={16} /> {execErrorMsg || 'Execution failed'}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem' }}>
            No active trade proposal. Run a query on the left to see the settlement details here.
          </div>
        )}
      </div>
    </div>
  );
}
