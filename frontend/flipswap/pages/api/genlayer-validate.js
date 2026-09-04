// pages/api/genlayer-validate.js
//
// Validation route — calls AgentValidator GenLayer IC using the WRITE flow.
// validate_proposal is @gl.public.write and mutates state (validated_count etc).
// It MUST be called as writeContract + waitForTransactionReceipt to trigger
// GenLayer's Optimistic Democracy consensus across all validator nodes.
//
// When AGENT_PRIVATE_KEY is set in .env.local, the server-side agent wallet
// signs the write transaction. If not set, falls back to read simulation
// (marked isSimulation=true — callers must NOT use simulations to gate settlement).

import { validateSwapProposal, validateLiquidityProposal, checkSwapValidationStatus, finalizeStuckValidation, GENLAYER_CONFIG } from '../../lib/genlayer.js';
import { leaseAgent, getKeeperAccount, poolStatus } from '../../lib/agentPool.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proposal = req.body;

  if (!proposal) {
    return res.status(400).json({ error: 'Proposal payload is required' });
  }

  // Keeper account for public calls (finalising idle transactions).
  const agentAccount = getKeeperAccount();

  // ── Polling path: check status of an already-submitted validate_proposal tx ──
  // Used when a prior call returned pending:true. This does NOT resubmit a
  // transaction — it just re-checks the existing one, so polling repeatedly
  // never adds more load to the network.
  if (proposal.checkTxHash) {
    try {
      // proposalId lets the status check read the recorded verdict — a write's
      // return value is not recoverable from its receipt.
      let statusResult = await checkSwapValidationStatus(proposal.checkTxHash, proposal.proposalId || null);

      // Caller exhausted its poll budget and the round never got votes. Left
      // alone these idle txs pile up against the agent account and eventually
      // make new addTransaction calls revert at ConsensusMain (surfacing as a
      // bogus "Rejected by Validator"). Clear it, then report it as retryable.
      if (proposal.finalizeIfStuck && statusResult.pending && agentAccount) {
        const finalizeResult = await finalizeStuckValidation(proposal.checkTxHash, agentAccount);
        if (finalizeResult.finalized) {
          statusResult = {
            ...statusResult,
            pending: false,
            retryable: true,
            reason: 'GenVM validators never voted on this round, so it was cleared automatically. This is a network condition, not a rejection — run another round to continue.',
          };
        }
      }

      return res.status(200).json({
        approved:         Boolean(statusResult.approved),
        pending:          Boolean(statusResult.pending),
        retryable:        Boolean(statusResult.retryable),
        reason:           statusResult.reason,
        // Echo back the id the caller supplied when the status check itself
        // could not resolve one. Otherwise a poller that follows this response
        // loses the proposal id after the first poll and can never look the
        // verdict up — the round then reports "Consensus reached — reading the
        // recorded verdict" forever.
        proposal_id:      statusResult.proposalId || proposal.proposalId || '',
        genlayer_contract: statusResult.contractAddress,
        contract_name:    statusResult.contractName,
        network:          statusResult.network,
        chainId:          statusResult.chainId,
        timestamp:        statusResult.timestamp,
        tx_hash:          statusResult.txHash || proposal.checkTxHash,
        // Real GenVM lifecycle phase, so the UI can show what the round is
        // actually doing instead of an unexplained spinner.
        statusName:       statusResult.statusName || null,
        consensus_mode:   'Optimistic Democracy (GenVM write tx)',
        is_write_flow:    true,
        live_execution:   Boolean(statusResult.success),
      });
    } catch (error) {
      console.error('API /genlayer-validate status-check error (failing closed):', error);
      return res.status(503).json({ approved: false, pending: true, reason: 'Status check unavailable — try again shortly' });
    }
  }

  const action = (proposal.action || 'SWAP').toUpperCase();

  if (!['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'].includes(action)) {
    return res.status(400).json({
      approved: false,
      reason: `Unsupported action '${action}'. Allowed: SWAP, ADD_LIQUIDITY, REMOVE_LIQUIDITY`,
    });
  }

  // ── Reserve a sender lane ───────────────────────────────────────────────
  // GenLayer serialises consensus rounds per sender, so two rounds signed by
  // the same key collide and the second reverts. Each in-flight round gets its
  // own account from the pool.
  const lease = leaseAgent();

  if (!lease) {
    const status = poolStatus();
    if (status.total === 0) {
      console.warn('[genlayer-validate] no agent keys configured — falling back to read simulation');
    } else {
      // Every lane is mid-round. This is congestion, not a rejection.
      return res.status(200).json({
        approved: false,
        pending: true,
        reason: `All ${status.total} validation lanes are mid-round. This is queue congestion, not a rejection — retrying shortly will go through.`,
        proposal_id: '',
        genlayer_contract: GENLAYER_CONFIG.agentValidator,
        contract_name: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
        consensus_mode: 'Optimistic Democracy (GenVM write tx)',
        is_write_flow: true,
        live_execution: false,
      });
    }
  }

  // Pass the leased account so genlayer.js uses the consensus WRITE flow
  // (writeContract + waitForTransactionReceipt). Without it, it falls back to
  // readContract (simulation only, which does not satisfy the consensus gate).
  const options = lease ? { account: lease.account } : {};

  try {
    let validationResult;

    if (action === 'SWAP') {
      validationResult = await validateSwapProposal(proposal, options);
    } else {
      validationResult = await validateLiquidityProposal(proposal, options);
    }

    // Keep the lane reserved only while its round is genuinely in flight;
    // a decided round frees it immediately for the next request.
    if (lease) {
      if (validationResult.pending && validationResult.txHash) lease.markSubmitted(validationResult.txHash);
      else lease.release();
    }

    // FAIL CLOSED: if consensus fails, approved must be false
    const approved = Boolean(validationResult.approved);

    return res.status(200).json({
      approved,
      pending:          Boolean(validationResult.pending),
      retryable:        Boolean(validationResult.retryable),
      reason:           validationResult.reason,
      proposal_id:      validationResult.proposalId || '',
      genlayer_contract: validationResult.contractAddress,
      contract_name:    validationResult.contractName,
      network:          validationResult.network,
      chainId:          validationResult.chainId,
      timestamp:        validationResult.timestamp,
      tx_hash:          validationResult.txHash || null,
      statusName:       validationResult.statusName || null,
      queue_full:       Boolean(validationResult.queueFull),
      via_mandate:      Boolean(validationResult.viaMandate),
      consensus_mode:   validationResult.viaMandate
        ? 'Mandate (pre-approved by GenVM consensus — instant view check)'
        : validationResult.isSimulation
        ? 'Read simulation (no consensus — not write flow)'
        : 'Optimistic Democracy (GenVM write tx)',
      is_write_flow:    !validationResult.isSimulation,
      live_execution:   Boolean(validationResult.success),
      details:          validationResult.details || null,
    });
  } catch (error) {
    console.error('API /genlayer-validate error (failing closed):', error);
    if (lease) lease.release();

    // FAIL CLOSED: Never return approved=true when consensus is unavailable
    return res.status(503).json({
      approved:         false,
      reason:           'Consensus unavailable — failed closed',
      proposal_id:      '',
      genlayer_contract: action === 'SWAP' ? GENLAYER_CONFIG.agentValidator : GENLAYER_CONFIG.liquidityValidator,
      contract_name:    action === 'SWAP' ? 'AgentValidator (GenLayer IC)' : 'LiquidityValidator (GenLayer IC)',
      network:          GENLAYER_CONFIG.chainName,
      chainId:          GENLAYER_CONFIG.chainId,
      timestamp:        new Date().toISOString(),
      consensus_mode:   'Optimistic Democracy (GenVM)',
      is_write_flow:    false,
      live_execution:   false,
    });
  }
}
