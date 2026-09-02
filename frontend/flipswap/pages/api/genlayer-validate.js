// pages/api/genlayer-validate.js
import { validateSwapProposal, validateLiquidityProposal, getIntelligentContractStats, GENLAYER_CONFIG } from '../../lib/genlayer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proposal = req.body;

  if (!proposal) {
    return res.status(400).json({ error: 'Proposal payload is required' });
  }

  const action = (proposal.action || 'SWAP').toUpperCase();

  try {
    let validationResult;

    if (action === 'SWAP') {
      validationResult = await validateSwapProposal(proposal);
    } else if (action === 'ADD_LIQUIDITY' || action === 'REMOVE_LIQUIDITY') {
      validationResult = await validateLiquidityProposal(proposal);
    } else {
      return res.status(400).json({
        approved: false,
        reason: `Unsupported action '${action}'. Allowed: SWAP, ADD_LIQUIDITY, REMOVE_LIQUIDITY`,
      });
    }

    // Live validation response from GenLayer Intelligent Contract
    return res.status(200).json({
      approved: Boolean(validationResult.approved),
      reason: validationResult.reason,
      proposal_id: validationResult.proposalId || '',
      genlayer_contract: validationResult.contractAddress,
      contract_name: validationResult.contractName,
      network: validationResult.network,
      chainId: validationResult.chainId,
      timestamp: validationResult.timestamp,
      consensus_mode: 'Optimistic Democracy (GenVM)',
      live_execution: Boolean(validationResult.success),
      details: validationResult.details || null,
    });
  } catch (error) {
    console.error('API /genlayer-validate error:', error);
    
    // FAIL CLOSED: Never fail open when consensus is unavailable
    return res.status(503).json({
      approved: false,
      reason: `Consensus unavailable: ${error?.shortMessage || error?.message || 'GenLayer Intelligent Contract validation failed'}`,
      proposal_id: '',
      genlayer_contract: action === 'SWAP' ? GENLAYER_CONFIG.agentValidator : GENLAYER_CONFIG.liquidityValidator,
      contract_name: action === 'SWAP' ? 'AgentValidator (GenLayer IC)' : 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
      consensus_mode: 'Optimistic Democracy (GenVM)',
      live_execution: false,
    });
  }
}
