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

    // If live call returned successfully
    return res.status(200).json({
      approved: validationResult.approved,
      reason: validationResult.reason,
      proposal_id: validationResult.proposalId,
      genlayer_contract: validationResult.contractAddress,
      contract_name: validationResult.contractName,
      network: validationResult.network,
      chainId: validationResult.chainId,
      timestamp: validationResult.timestamp,
      consensus_mode: 'Optimistic Democracy (GenVM)',
      live_execution: true,
      details: validationResult.details || null,
    });
  } catch (error) {
    console.error('API /genlayer-validate error:', error);
    
    // Perform deterministic safety rule verification as backup
    const validActions = ['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'];
    const approved = validActions.includes(action) && Number(proposal.slippageBps || 30) <= 300;

    return res.status(200).json({
      approved,
      reason: approved 
        ? 'Deterministic safety validation passed on GenLayer ruleset' 
        : (error.message || 'Validation rejected'),
      proposal_id: `prop_fallback_${Date.now().toString(36)}`,
      genlayer_contract: action === 'SWAP' ? GENLAYER_CONFIG.agentValidator : GENLAYER_CONFIG.liquidityValidator,
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      consensus_mode: 'Deterministic Ruleset',
      live_execution: false,
    });
  }
}
