// components/AIAgent/ProposalPanel.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Cpu, ExternalLink, ArrowRight, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { INTELLIGENT_CONTRACTS } from '../../constants/addresses';
import { useTheme } from '../contexts/ThemeContext';

const ProposalPanel = ({
  proposal,
  validationResult,
  onValidate,
  onExecute,
  onApprove,
  needsApproval,
  isApproving,
  isValidating,
  isExecuting,
  txHash,
  executionError,
}) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  const textMain = isDark ? '#f8fafc' : '#0f172a';
  const textSub = isDark ? '#cbd5e1' : '#334155';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const boxBg = isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc';
  const boxBorder = isDark ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0';
  const divider = isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0';

  if (!proposal) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '320px',
        color: textMuted,
        textAlign: 'center',
        padding: '24px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)',
          border: isDark ? '1px solid rgba(56, 189, 248, 0.15)' : '1px solid rgba(2, 132, 199, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          color: '#0284c7',
        }}>
          <Cpu size={28} />
        </div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: textMain, fontWeight: 700 }}>
          No Active Proposal
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: textMuted, maxWidth: '280px', lineHeight: 1.5 }}>
          Ask the AI agent to prepare a trade route, compare pools, or simulate liquidity on GenLayer.
        </p>
      </div>
    );
  }

  const action = (proposal.action || 'SWAP').toUpperCase();
  const isSwap = action === 'SWAP';
  const icAddress = isSwap ? INTELLIGENT_CONTRACTS.agentValidator : INTELLIGENT_CONTRACTS.liquidityValidator;

  const getActionColor = () => {
    switch (action) {
      case 'SWAP': return '#0284c7';
      case 'ADD_LIQUIDITY': return '#10b981';
      case 'REMOVE_LIQUIDITY': return '#f59e0b';
      default: return '#0284c7';
    }
  };

  const actionColor = getActionColor();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={proposal.proposalId || `${proposal.action}-${proposal.tokenIn}-${proposal.tokenOut}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: `${actionColor}18`,
            color: actionColor,
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.5px',
            border: `1px solid ${actionColor}33`,
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: actionColor,
            }} />
            {action} PROPOSAL
          </div>
          <span style={{ fontSize: '0.75rem', color: textMuted }}>
            Chain ID: 4221 (Bradbury)
          </span>
        </div>

        {/* Trade Summary Box */}
        <div style={{
          background: boxBg,
          border: `1px solid ${boxBorder}`,
          borderRadius: '14px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {isSwap ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: textMuted }}>Pay</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 750, color: textMain }}>
                  {proposal.amountIn} <span style={{ color: '#0284c7' }}>{proposal.tokenIn}</span>
                </div>
              </div>
              <div style={{ color: textMuted, padding: '0 8px' }}>
                <ArrowRight size={20} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: textMuted }}>Receive (Est.)</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#10b981' }}>
                  {proposal.expectedOutput || `${proposal.minAmountOut} ${proposal.tokenOut}`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted, fontSize: '0.85rem' }}>Asset A</span>
                <span style={{ color: textMain, fontWeight: 650, fontSize: '0.85rem' }}>{proposal.amountA} {proposal.tokenA}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted, fontSize: '0.85rem' }}>Asset B</span>
                <span style={{ color: textMain, fontWeight: 650, fontSize: '0.85rem' }}>{proposal.amountB} {proposal.tokenB}</span>
              </div>
            </div>
          )}

          <div style={{ height: '1px', background: divider }} />

          {/* Details breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Route</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.route || 'AGGFlow Entrypoint'}</span>
            </div>
            {isSwap && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted }}>Min. Received</span>
                <span style={{ color: textMain, fontWeight: 600 }}>{proposal.minAmountOut} {proposal.tokenOut}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Price Impact</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.priceImpact || '<0.01%'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Max Slippage</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.slippage || '0.30%'} (30 bps)</span>
            </div>
          </div>
        </div>

        {/* GenLayer Intelligent Contract Validation Card */}
        <div style={{
          background: boxBg,
          border: `1px solid ${boxBorder}`,
          borderRadius: '14px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} style={{ color: '#0284c7' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: textMain }}>
                GenLayer IC Consensus
              </span>
            </div>
            <a
              href={`https://explorer-bradbury.genlayer.com/address/${icAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: '#0284c7',
                fontSize: '0.75rem',
                textDecoration: 'none',
                fontFamily: 'monospace',
                background: 'rgba(2, 132, 199, 0.1)',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              {icAddress.substring(0, 6)}...{icAddress.substring(38)}
              <ExternalLink size={12} />
            </a>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: textMuted, lineHeight: 1.45 }}>
            Before execution on-chain, this proposal must reach consensus validation across GenLayer validator nodes via GenVM.
          </p>

          {!validationResult ? (
            <button
              type="button"
              onClick={onValidate}
              disabled={isValidating}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                color: '#ffffff',
                fontWeight: 650,
                fontSize: '0.9rem',
                cursor: isValidating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
              }}
            >
              {isValidating ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Validating with GenVM Consensus...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Validate with GenLayer IC
                </>
              )}
            </button>
          ) : (
            <div style={{
              borderRadius: '10px',
              padding: '12px',
              background: validationResult.approved ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${validationResult.approved ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: validationResult.approved ? '#10b981' : '#ef4444',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}>
                {validationResult.approved ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {validationResult.approved ? 'Approved by GenLayer Consensus' : 'Rejected by Validator'}
              </div>
              <div style={{ fontSize: '0.82rem', color: textSub }}>
                {validationResult.reason}
              </div>
              {validationResult.proposal_id && (
                <div style={{ fontSize: '0.72rem', color: textMuted, fontFamily: 'monospace', marginTop: '2px' }}>
                  ID: {validationResult.proposal_id}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Execution Section */}
        {validationResult && validationResult.approved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {needsApproval ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={isApproving}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '14px',
                  color: '#ffffff',
                  fontWeight: 650,
                  fontSize: '0.95rem',
                  cursor: isApproving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                }}
              >
                {isApproving ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Approving {proposal.tokenIn}...
                  </>
                ) : (
                  `1. Approve ${proposal.tokenIn}`
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onExecute}
              disabled={needsApproval || isExecuting}
              style={{
                background: needsApproval
                  ? isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                color: needsApproval ? textMuted : '#ffffff',
                fontWeight: 650,
                fontSize: '0.95rem',
                cursor: needsApproval || isExecuting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: needsApproval ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.3)',
              }}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Executing on Soyara DEX...
                </>
              ) : (
                needsApproval ? '2. Execute Trade (Approve First)' : 'Confirm & Execute on GenLayer'
              )}
            </button>

            {executionError && (
              <div style={{
                fontSize: '0.8rem',
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.4,
              }}>
                <strong>Execution Error:</strong> {executionError}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default ProposalPanel;
