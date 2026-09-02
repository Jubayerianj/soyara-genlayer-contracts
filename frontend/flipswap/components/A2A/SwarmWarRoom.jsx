// components/A2A/SwarmWarRoom.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Zap, ShieldCheck, Play, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { useAccount } from 'wagmi';
import { orchestrateSwarm, AGENT_REGISTRY } from '../../services/a2a/agents';
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
  const [execState, setExecState] = useState(null); // null | 'executing' | 'done' | 'error'

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline, isRunning]);

  const handleStartSwarm = async (q) => {
    const textToRun = q || prompt;
    if (!textToRun.trim() || isRunning) return;

    setPrompt('');
    setPayload(null);
    setExecState(null);
    setIsRunning(true);

    setTimeline(prev => [
      ...prev,
      { isUser: true, text: textToRun, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);

    try {
      const generator = orchestrateSwarm(textToRun, userAddress || '0x3333333333333333333333333333333333333333');
      for await (const step of generator) {
        if (step.type === 'SWARM_COMPLETE') {
          setPayload(step.payload);
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
      setIsRunning(false);
    }
  };

  const handleExecute = async () => {
    if (!isConnected || !userAddress) {
      alert('Please connect wallet on GenLayer Testnet.');
      return;
    }
    setExecState('executing');
    await new Promise(r => setTimeout(r, 1000));
    setExecState('done');
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
              <span className={styles.statVal} style={{ color: payload.risk.isApproved ? '#10b981' : '#f43f5e' }}>
                {payload.risk.isApproved ? '✅ Verified Quorum' : '❌ Rejected'}
              </span>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '3px' }}>ONE-TIME HASH BINDING:</div>
              <div className={styles.hashBoxMini}>{payload.risk.tradeHash}</div>
            </div>

            <button
              onClick={handleExecute}
              disabled={!payload.risk.isApproved || execState === 'executing'}
              className={styles.executeBtn}
            >
              <Zap size={16} />
              {execState === 'executing' ? 'Settling on GenLayer...' : 'Execute Non-Custodial Swap'}
            </button>

            {execState === 'done' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                <CheckCircle2 size={16} /> Settled! Tokens sent directly to your wallet.
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
