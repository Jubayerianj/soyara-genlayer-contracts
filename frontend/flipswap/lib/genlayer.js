import { createClient, chains } from 'genlayer-js';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens.js';

export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainName: 'GenLayer Bradbury Testnet',
  rpcUrl: 'https://rpc-bradbury.genlayer.com',
  explorerUrl: 'https://explorer-bradbury.genlayer.com',
  agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
  liquidityValidator: INTELLIGENT_CONTRACTS.liquidityValidator,
};

let cachedClient = null;

export function getGenLayerClient() {
  if (!cachedClient) {
    cachedClient = createClient({
      chain: chains.testnetBradbury,
    });
  }
  return cachedClient;
}

/**
 * Turn a decided (ACCEPTED+) transaction receipt from AgentValidator.validate_proposal
 * into the standard validation-result shape used by validateSwapProposal and
 * checkSwapValidationStatus.
 */
// GenVM round outcomes where the network never REACHED a verdict. genlayer-js
// counts these as "decided states", so waitForTransactionReceipt({status:'ACCEPTED'})
// resolves on them and the receipt carries no `result` — which previously fell
// through to the generic branch below and got labelled "Rejected by GenLayer
// consensus". That is wrong and was the cause of trades being shown as rejected
// when the validator had actually approved them (or simply never voted):
// a round that ends without a majority is a NETWORK condition, not a verdict
// on the trade. These are retryable by submitting a fresh consensus round.
const UNDECIDED_STATUSES = ['UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'];

function interpretValidationReceipt(receipt, ctx) {
  const { txHash, validatorAddress, action, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, slippageBps, router, deadline } = ctx;

  const base = {
    proposalId: '',
    txHash,
    // The real GenVM lifecycle state (PENDING / PROPOSING / COMMITTING /
    // REVEALING / ACCEPTED / FINALIZED ...). Surfaced so the UI can show what
    // the round is actually doing instead of an opaque spinner.
    statusName: receipt?.statusName || null,
    executionResult: receipt?.txExecutionResultName || null,
    contractAddress: validatorAddress,
    contractName: 'AgentValidator (GenLayer IC)',
    network: GENLAYER_CONFIG.chainName,
    chainId: GENLAYER_CONFIG.chainId,
    timestamp: new Date().toISOString(),
  };

  // ── Round ended without a verdict → retryable, NOT a rejection ──────────
  if (UNDECIDED_STATUSES.includes(receipt?.statusName)) {
    return {
      ...base,
      success: true,
      approved: false, // still fail-closed: settlement stays blocked
      retryable: true,
      reason:
        `GenVM round ended as ${receipt.statusName} — the validator set did not reach a majority. ` +
        `This is a network condition, not a rejection of your trade. Submitting a fresh consensus round usually resolves it.`,
    };
  }

  // ── Genuine failures: the contract raised, or the tx was cancelled ──────
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' || receipt?.statusName === 'CANCELED') {
    return {
      ...base,
      success: false,
      approved: false,
      reason: `GenLayer consensus failed: ${receipt?.statusName || receipt?.txExecutionResultName} — failed closed`,
    };
  }

  // NOTE: `receipt.result` is the CONSENSUS VOTE enum (0 IDLE / 1 AGREE /
  // 2 DISAGREE / 3 TIMEOUT) — it is NOT the contract's return payload. A write
  // transaction's return value cannot be recovered from the receipt at all.
  // Reading `receipt.result.approved` therefore always yielded `undefined`,
  // which made every validation — including approved ones — report as rejected.
  //
  // The verdict is now persisted on-chain by validate_proposal and read back
  // with the `get_validation` view; see readValidationVerdict(). This function
  // only classifies the round's consensus outcome.
  const decided = receipt?.statusName === 'ACCEPTED' || receipt?.statusName === 'FINALIZED';
  const ranToCompletion = receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN';

  if (decided && ranToCompletion) {
    return {
      ...base,
      success: true,
      approved: false,      // caller must resolve the verdict via get_validation
      needsVerdictLookup: true,
      reason: 'Consensus reached — reading the recorded verdict.',
      details: action ? { action, tokenIn, tokenOut, amountInRaw: String(amountInRaw), minAmountOutRaw: String(minAmountOutRaw), slippageBps, router, deadline } : undefined,
    };
  }

  // Decided state but the contract did not run to completion — ambiguous, so
  // treat as retryable rather than asserting the validator rejected the trade.
  return {
    ...base,
    success: true,
    approved: false,
    retryable: true,
    reason: `GenVM round finished (${receipt?.statusName || 'unknown status'}) without a usable result — retry to run a fresh round.`,
  };
}

/**
 * Turn a ConsensusMain submission revert into something a user can act on.
 *
 * A failed `addTransaction` is NOT a verdict — the proposal never reached the
 * validators at all — but it surfaced as a raw "EVM tx ... was reverted", which
 * reads exactly like a rejected trade. The important case is PendingQueueFull:
 * an Intelligent Contract may hold only so many unresolved consensus rounds, and
 * once stalled rounds fill that queue every new submission bounces until they
 * clear.
 */
/**
 * True when a write failed because the RPC node is throttling, not because the
 * transaction is bad.
 *
 * Bradbury returns `-32005 transaction gas rate limit exceeded: node is at
 * capacity, retry in ~Nms` with a `retryAfterMs` hint. The app used to surface
 * this as a flat "Request exceeds defined limit" with `retryable: false`, i.e.
 * as though the validator had refused the trade — when in fact the proposal was
 * never submitted at all. Throttling is per sender, so simply waiting (or using
 * another funded lane) clears it.
 */
export function parseRateLimit(err) {
  const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
  if (!/-32005|gas rate limit|at capacity|exceeds defined limit|rate limit/i.test(text)) return null;
  const hinted = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
  return { retryAfterMs: hinted ? Math.min(10000, parseInt(hinted[1], 10)) : 1500 };
}

export async function describeSubmissionRevert(message) {
  const text = String(message || '');

  // A failed addTransaction reads like this, and carries only the tx hash —
  // the revert data is not in the message, so replay the call to recover it.
  const isSubmissionRevert = /consensus contract .* was reverted/i.test(text);
  if (!isSubmissionRevert) return null;

  const generic = {
    retryable: true,
    reason:
      'GenLayer did not accept the proposal for consensus, so no round ever started — '
      + 'your trade was neither validated nor rejected. This is a network-side condition; retry shortly.',
  };

  const hash = text.match(/0x[0-9a-fA-F]{64}/);
  if (!hash) return generic;

  try {
    const res = await fetch(GENLAYER_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash[0]] }),
    });
    const { result: tx } = await res.json();
    if (!tx) return generic;

    const call = await fetch(GENLAYER_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ from: tx.from, to: tx.to, data: tx.input, value: tx.value }, tx.blockNumber || 'latest'],
      }),
    });
    const { error } = await call.json();
    const data = typeof error?.data === 'string' ? error.data : '';
    const selector = data.slice(0, 10).toLowerCase();

    // PendingQueueFull(address recipient, uint256 max): an Intelligent Contract
    // may hold only so many unresolved rounds. Once stalled rounds fill that
    // queue, every new submission bounces until they clear — nothing to do with
    // the trade itself.
    if (selector === '0xd48a82a3') {
      const max = data.length >= 138 ? parseInt(data.slice(-64), 16) : null;
      return {
        queueFull: true,
        retryable: true,
        reason:
          `GenLayer could not accept the proposal: the AgentValidator contract already has the maximum `
          + `number of unresolved consensus rounds queued${max ? ` (${max})` : ''}. This is a network backlog, `
          + `not a rejection — your trade was never validated or refused. Submissions resume once the stalled `
          + `rounds clear.`,
      };
    }
    if (selector === '0x0844056a') {
      return {
        retryable: true,
        reason:
          'GenLayer could not accept the proposal: an earlier round from the same sender is still at the '
          + 'head of the queue. A collision, not a rejection — retry shortly.',
      };
    }
    return generic;
  } catch {
    return generic;
  }
}

/**
 * Read a recorded validation verdict (instant view).
 *
 * This is how the app learns whether `validate_proposal` approved a trade,
 * since the write's return value is not recoverable from its receipt. It also
 * short-circuits repeat validations of identical parameters: once a verdict is
 * recorded, it is readable forever without another consensus round.
 */
export async function readValidationVerdict(proposalId) {
  if (!proposalId) return null;
  const client = getGenLayerClient();
  try {
    const v = await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'get_validation',
      args: [proposalId],
    });
    if (!v || !v.found) return null;
    return { approved: Boolean(v.approved), reason: v.reason, proposalId };
  } catch (err) {
    console.warn('[genlayer] get_validation failed:', err?.shortMessage || err?.message);
    return null;
  }
}

/** The proposal_id the contract will assign to these exact parameters (view). */
export async function computeProposalId(args) {
  const client = getGenLayerClient();
  try {
    return await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'compute_proposal_id',
      args: [args.action, args.tokenIn, args.tokenOut, String(args.amountIn), String(args.minAmountOut), parseInt(args.slippageBps, 10), parseInt(args.deadline, 10)],
    });
  } catch (err) {
    console.warn('[genlayer] compute_proposal_id failed:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Establish a trading mandate: ONE consensus round that authorises many trades.
 *
 * This is the slow call, and it is meant to be made rarely (once per session /
 * per agent). Afterwards `checkTradeAgainstMandate` validates each trade with an
 * instant view, so per-trade latency stops depending on GenVM round timing.
 *
 * @param {object} terms   { user, tokens[], maxAmountIn, maxSlippageBps, expiresAt, maxTrades }
 * @param {object} account signer for the consensus write (a pool lane)
 */
export async function issueTradingMandate(terms, account) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const tokens = Array.isArray(terms.tokens) ? terms.tokens.join(',') : String(terms.tokens || '');
  const args = [
    terms.user,
    tokens.toLowerCase(),
    String(terms.maxAmountIn),
    parseInt(terms.maxSlippageBps, 10),
    parseInt(terms.expiresAt, 10),
    parseInt(terms.maxTrades, 10),
  ];

  const txHash = await client.writeContract({
    account,
    address: validatorAddress,
    functionName: 'issue_trading_mandate',
    args,
    value: 0n,
  });

  try {
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: 'ACCEPTED', retries: 8, fullTransaction: true });
    const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress });
    const result = receipt?.result ?? null;
    return {
      ...interpreted,
      mandateId: result?.mandate_id || '',
      txHash,
    };
  } catch (err) {
    if (String(err?.message || '').includes('Timed out waiting')) {
      return {
        success: true,
        approved: false,
        pending: true,
        mandateId: '',
        txHash,
        reason: 'Mandate round submitted and awaiting GenVM consensus — poll this txHash.',
        contractAddress: validatorAddress,
      };
    }
    throw err;
  }
}

/** Read a mandate's committed terms (view — instant). */
export async function getMandate(mandateId) {
  const client = getGenLayerClient();
  try {
    return await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'get_mandate',
      args: [mandateId],
    });
  } catch (err) {
    console.error('[genlayer] get_mandate failed:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Fast path: validate a trade against an already consensus-approved mandate.
 *
 * `check_mandate` is a @gl.public.view, so this is a plain read — no consensus
 * round, no activation wait, no multi-minute latency. Its authority comes from
 * `issue_trading_mandate`, which DID run full Optimistic Democracy consensus
 * when the session's mandate was established.
 *
 * Settlement is still gated exactly as before: AgentExecutor requires a
 * one-time approval hash over the exact trade parameters and consumes it on
 * use, so a trade that is unapproved, modified, or replayed still cannot settle.
 *
 * Returns null when there is no usable mandate, so callers fall back to the
 * full per-trade consensus round.
 */
export async function checkTradeAgainstMandate(mandateId, trade) {
  if (!mandateId) return null;
  const client = getGenLayerClient();

  try {
    const result = await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'check_mandate',
      args: [
        mandateId,
        trade.user,
        trade.tokenIn,
        trade.tokenOut,
        String(trade.amountIn),
        parseInt(trade.slippageBps, 10),
        parseInt(trade.deadline, 10),
      ],
    });

    const approved = Boolean(result && result.approved);
    return {
      success: true,
      approved,
      viaMandate: true,
      mandateId,
      reason: result?.reason || (approved ? 'Trade is within a GenVM consensus-approved mandate' : 'Trade falls outside the mandate'),
      proposalId: approved ? `mandate_${mandateId}` : '',
      contractAddress: GENLAYER_CONFIG.agentValidator,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[genlayer] mandate check unavailable, falling back to full consensus:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Unstick a validate_proposal transaction that GenLayer validators never voted
 * on (status stays PENDING with txExecutionResult NOT_VOTED).
 *
 * These do not clear on their own, they accumulate against the agent account,
 * and once enough pile up new `addTransaction` calls start reverting at the
 * ConsensusMain contract — which surfaced in the UI as a bogus
 * "Rejected by Validator: transaction reverted" error. `finalizeIdlenessTxs`
 * is GenLayer's own public remedy for idle transactions (the same thing
 * `genlayer finalize-batch` does), so the app calls it itself instead of
 * requiring manual CLI intervention.
 *
 * @param {string} txHash    the stuck GenLayer transaction id
 * @param {object} account   the agent account (needed to sign the public call)
 */
export async function finalizeStuckValidation(txHash, account) {
  const client = getGenLayerClient();
  if (!account || typeof client.finalizeIdlenessTxs !== 'function') return { finalized: false };

  try {
    const evmTxHash = await client.finalizeIdlenessTxs({ account, txIds: [txHash] });
    console.log(`[genlayer] finalized idle validation tx ${txHash} (evm tx ${evmTxHash})`);
    return { finalized: true, evmTxHash };
  } catch (err) {
    console.error('[genlayer] finalizeIdlenessTxs failed:', err?.shortMessage || err?.message);
    return { finalized: false, error: err?.shortMessage || err?.message };
  }
}

/**
 * Poll for the outcome of a validate_proposal transaction that previously
 * returned pending:true. Does a SHORT bounded wait (does not resubmit the
 * transaction) so callers can call this repeatedly from the UI without
 * creating more load on the network.
 */
export async function checkSwapValidationStatus(txHash, proposalId = null) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  try {
    // ── Cheap check first: is the verdict already recorded? ──────────────────
    // This is a poll, so it runs repeatedly. waitForTransactionReceipt blocks
    // for ~11s before giving up (retries x interval), which made each poll cost
    // far more than the sleep between polls — a finished round could sit
    // undetected for ten seconds. `get_validation` is a single view read, so
    // ask it directly and return the instant the verdict exists.
    if (proposalId) {
      const early = await readValidationVerdict(proposalId);
      if (early) {
        return {
          success: true,
          approved: early.approved,
          pending: false,
          reason: early.reason,
          proposalId,
          txHash,
          contractAddress: validatorAddress,
          contractName: 'AgentValidator (GenLayer IC)',
          network: GENLAYER_CONFIG.chainName,
          chainId: GENLAYER_CONFIG.chainId,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: 'ACCEPTED',
      // One attempt only: this function is called on a polling loop, so a long
      // internal wait here just duplicates the caller's own cadence.
      retries: 1,
      // Without this the SDK returns a stripped receipt and statusName /
      // txExecutionResultName come back undefined, so the round looks unusable.
      fullTransaction: true,
    });
    const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress });

    // The receipt cannot carry the contract's verdict, so read it back.
    if (interpreted.needsVerdictLookup) {
      if (proposalId) {
        // Re-read a few times before giving up.
        //
        // State can lag the round by a moment, and the caller's response to
        // "not readable" is to run an ENTIRE fresh consensus round — 60-120s to
        // recover from what is often a 1-2s lag. Liquidity felt far slower than
        // swaps largely because of this. A cheap view read is the right retry.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const verdict = await readValidationVerdict(proposalId);
          if (verdict) {
            return { ...interpreted, approved: verdict.approved, reason: verdict.reason, proposalId, needsVerdictLookup: false };
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
        return {
          ...interpreted,
          retryable: true,
          reason: 'Consensus reached but the contract recorded no verdict — the round failed closed. A fresh round is needed.',
        };
      }

      // Consensus SUCCEEDED but we have no proposal id to look the verdict up
      // with. That is a lookup gap on our side, not a verdict — returning it as
      // {approved:false, retryable:false} made the UI render a red "Rejected by
      // Validator" for a round the validators had just accepted. Anything that
      // reaches this branch must stay retryable.
      return {
        ...interpreted,
        retryable: true,
        reason:
          'Consensus reached, but this app could not read the verdict back — the proposal id was '
          + 'not carried through the poll. Your trade was NOT rejected. Re-checking resolves it.',
      };
    }
    return interpreted;
  } catch (err) {
    if (String(err?.message || '').includes('Timed out waiting')) {
      return {
        success: true,
        approved: false,
        pending: true,
        reason: 'Still awaiting GenVM consensus — not rejected, check back shortly.',
        proposalId: '',
        statusName: 'PENDING',
        txHash,
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
      };
    }
    console.error('checkSwapValidationStatus error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'Status check failed — failed closed',
      proposalId: '',
      txHash,
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Normalize a token address or symbol into a 0x address
 */
export function resolveTokenAddress(tokenOrAddress) {
  if (!tokenOrAddress) return '0x0000000000000000000000000000000000000000';
  
  if (typeof tokenOrAddress === 'object') {
    if (tokenOrAddress.isNative) return '0x0000000000000000000000000000000000000000';
    return tokenOrAddress.address || '0x0000000000000000000000000000000000000000';
  }

  const str = String(tokenOrAddress).trim();
  if (str.startsWith('0x') && str.length === 42) {
    if (str.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return '0x0000000000000000000000000000000000000000';
    }
    return str;
  }

  // Symbol lookup
  const token = TOKEN_LIST[4221]?.find(
    (t) => t.symbol.toLowerCase() === str.toLowerCase() || t.name.toLowerCase() === str.toLowerCase()
  );

  if (token) {
    if (token.isNative) return '0x0000000000000000000000000000000000000000';
    return token.address;
  }

  return str;
}

/**
 * Validate a Swap Execution Proposal using GenLayer AgentValidator IC.
 *
 * Uses the correct GenLayer WRITE flow (writeContract + waitForTransactionReceipt)
 * because validate_proposal is decorated @gl.public.write and mutates contract state
 * (validated_count, approved_count, rejected_count).
 *
 * Fails CLOSED on any consensus failure: approved: false is returned, never true.
 *
 * @param {object} proposal  - Trade proposal fields
 * @param {object} options   - { account, privateKey } — signer for the write tx.
 *                             If neither is provided, falls back to readContract
 *                             (non-state-mutating preview only, for UI display).
 */
export async function validateSwapProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const action = (proposal.action || 'SWAP').toUpperCase();
  const tokenIn = resolveTokenAddress(proposal.tokenIn || proposal.fromToken);
  const tokenOut = resolveTokenAddress(proposal.tokenOut || proposal.toToken);

  // Decimal scaling helper
  const tokenInObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenIn.toLowerCase() || (tokenIn === '0x0000000000000000000000000000000000000000' && t.isNative));
  const tokenOutObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenOut.toLowerCase() || (tokenOut === '0x0000000000000000000000000000000000000000' && t.isNative));

  const decimalsIn = tokenInObj?.decimals || 18;
  const decimalsOut = tokenOutObj?.decimals || 18;

  let amountInRaw = proposal.amountInRaw;
  if (!amountInRaw && proposal.amountIn !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.amountIn) * (10 ** decimalsIn)));
      amountInRaw = parsed.toString();
    } catch {
      amountInRaw = '1000000000000000000';
    }
  }
  if (!amountInRaw || amountInRaw === '0') amountInRaw = '1000000000000000000';

  let minAmountOutRaw = proposal.minAmountOutRaw;
  if (!minAmountOutRaw && proposal.minAmountOut !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.minAmountOut) * (10 ** decimalsOut)));
      minAmountOutRaw = parsed.toString();
    } catch {
      minAmountOutRaw = '950000000000000000';
    }
  }
  if (!minAmountOutRaw) minAmountOutRaw = '1';

  let slippageBps = parseInt(proposal.slippageBps || 30, 10);
  if (isNaN(slippageBps)) slippageBps = 30;

  const defaultRouter = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  const router = proposal.router || defaultRouter;

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  const extraData = typeof proposal.extraData === 'string'
    ? proposal.extraData
    : JSON.stringify(proposal.extraData || { route: proposal.route || 'V2', model: proposal.model || 'v2' });

  const callArgs = [
    action,
    tokenIn,
    tokenOut,
    String(amountInRaw),
    String(minAmountOutRaw),
    slippageBps,
    router,
    deadline,
    extraData.slice(0, 500),
  ];

  // ── Fast path: this exact proposal already has a recorded verdict ─────────
  // Verdicts persist on-chain, so an identical set of parameters resolves via a
  // view in ~1s instead of running another multi-minute consensus round.
  const proposalId = await computeProposalId({
    action, tokenIn, tokenOut,
    amountIn: String(amountInRaw), minAmountOut: String(minAmountOutRaw),
    slippageBps, deadline,
  });
  if (proposalId) {
    const recorded = await readValidationVerdict(proposalId);
    if (recorded) {
      return {
        success: true,
        approved: recorded.approved,
        reason: recorded.approved
          ? 'Consensus-approved on GenVM (verdict already recorded on-chain)'
          : recorded.reason,
        proposalId,
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
        details: { action, tokenIn, tokenOut, amountInRaw: String(amountInRaw), minAmountOutRaw: String(minAmountOutRaw), slippageBps, router, deadline },
      };
    }
  }

  // ── Fast path: trade covered by a consensus-approved mandate — OPT-IN ─────
  // A GenVM write has to be activated by the network before validators can vote,
  // which on Bradbury can take minutes. `check_mandate` is a view, so it answers
  // immediately, and the mandate it reads was itself established by a full
  // Optimistic Democracy round.
  //
  // It is nevertheless OFF BY DEFAULT. Admitting each individual trade through a
  // view is what the GenLayer review called "validating through a read
  // simulation", so the enforced flow requires a per-trade `validate_proposal`
  // consensus write whose verdict is recorded on-chain and re-read by
  // /api/agent-execute before settlement. This must stay in lockstep with the
  // matching gate there: enabling one without the other means validation
  // approves via mandate while settlement refuses for want of a written verdict.
  const mandateFastPathEnabled = process.env.GENLAYER_ALLOW_MANDATE_FAST_PATH === 'true';
  const mandateId = mandateFastPathEnabled
    ? (options.mandateId || proposal.mandateId || process.env.GENLAYER_MANDATE_ID)
    : null;
  if (mandateId && proposal.user) {
    const fast = await checkTradeAgainstMandate(mandateId, {
      user: proposal.user,
      tokenIn,
      tokenOut,
      amountIn: String(amountInRaw),
      slippageBps,
      deadline,
    });
    if (fast?.approved) {
      return {
        ...fast,
        details: { action, tokenIn, tokenOut, amountInRaw: String(amountInRaw), minAmountOutRaw: String(minAmountOutRaw), slippageBps, router, deadline },
      };
    }
    // Not covered by the mandate (or unavailable) → fall through to a full round.
  }

  // ── GenLayer Write Flow (correct path) ────────────────────────────────────
  // validate_proposal is @gl.public.write — it MUST be called as a write
  // transaction so GenLayer's Optimistic Democracy consensus is triggered.
  // readContract only simulates locally on one node — it bypasses consensus.
  const account = options.account || (options.privateKey ? createAccount(options.privateKey) : null);

  if (account && typeof client.writeContract === 'function') {
    try {
      // The node throttles per sender and tells us how long to wait, so a
      // throttled submission is worth retrying rather than reporting as a
      // rejected trade. Nothing has been submitted when this fires.
      let txHash;
      for (let attempt = 0; ; attempt += 1) {
        try {
          txHash = await client.writeContract({
            account,
            address: validatorAddress,
            functionName: 'validate_proposal',
            args: callArgs,
            value: 0n,
            // Size of the validator set for this round.
            //
            // Fewer validators = fewer independent re-executions (each of which
            // makes its own LLM call inside strict_eq) and less commit/reveal
            // coordination, so rounds finish sooner. It is left UNSET by default
            // on purpose: shrinking the set weakens the Optimistic Democracy
            // quorum, which is the exact property the GenLayer review is
            // assessing. Set GENLAYER_VALIDATORS=1 only for demos where latency
            // matters more than quorum strength — never for a submission.
            ...(process.env.GENLAYER_VALIDATORS
              ? { numOfInitialValidators: Number(process.env.GENLAYER_VALIDATORS) }
              : {}),
          });
          break;
        } catch (submitErr) {
          const limited = parseRateLimit(submitErr);
          if (!limited || attempt >= 3) throw submitErr;
          const wait = limited.retryAfterMs + 250 * attempt;
          console.warn(`[genlayer] node at capacity, retrying submit in ${wait}ms (attempt ${attempt + 1}/4)`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }

      if (typeof client.waitForTransactionReceipt === 'function') {
        // NOTE: wait for ACCEPTED, not FINALIZED. ACCEPTED is the point at which
        // Optimistic Democracy consensus has decided the result (genlayer-js's own
        // DECIDED_STATES includes ACCEPTED) — the execution result is already final
        // at this point. FINALIZED only comes after the appeal-bond window closes.
        //
        // Bradbury testnet consensus rounds can occasionally take much longer than
        // any reasonable synchronous HTTP request should block for (observed: several
        // minutes under load). Rather than waiting indefinitely (bad UX) or timing out
        // and reporting a false "rejected" (misleading — the trade may still approve
        // moments later), this waits a bounded amount and, on timeout, returns
        // pending:true with the txHash so the caller can poll checkSwapValidationStatus
        // instead of treating a slow round as a rejection.
        try {
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: 'ACCEPTED',
            // Was 8 (~24s). Polling is now far cheaper than this wait: a poll
            // reads the recorded verdict directly and returns in ~1.5s, so
            // blocking here just delayed the moment the caller could start
            // checking. Keep a short inline wait for the genuinely fast case,
            // then hand straight over to the poll loop.
            retries: 2, // ~6s
            fullTransaction: true,
          });
          const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress, action, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, slippageBps, router, deadline });
          if (interpreted.needsVerdictLookup && proposalId) {
            const verdict = await readValidationVerdict(proposalId);
            if (verdict) {
              return { ...interpreted, approved: verdict.approved, reason: verdict.reason, proposalId, needsVerdictLookup: false };
            }
            // Round succeeded but the verdict is not readable yet — retryable,
            // never a rejection.
            return { ...interpreted, retryable: true, reason: 'Consensus reached but the verdict is not yet readable — retry shortly.' };
          }
          return interpreted;
        } catch (waitErr) {
          if (String(waitErr?.message || '').includes('Timed out waiting')) {
            return {
              success: true,
              approved: false,
              pending: true,
              reason: 'Still awaiting GenVM Optimistic Democracy consensus — this can take several minutes on Bradbury testnet under load. Not rejected — check back shortly.',
              // Carry the id so the poller can read the verdict once it lands.
              proposalId: proposalId || '',
              txHash,
              contractAddress: validatorAddress,
              contractName: 'AgentValidator (GenLayer IC)',
              network: GENLAYER_CONFIG.chainName,
              chainId: GENLAYER_CONFIG.chainId,
              timestamp: new Date().toISOString(),
            };
          }
          throw waitErr;
        }
      }
    } catch (writeErr) {
      // A submission revert means the round never started — decode it so this
      // does not read as "your trade was rejected".
      const submissionDetail = await describeSubmissionRevert(writeErr?.shortMessage || writeErr?.message);
      // Write tx failed (network, rejected, etc.) → fail closed
      console.error('AgentValidator write tx failed (failing closed):', writeErr);
      return {
        success: false,
        approved: false,
        ...submissionDetail,
        ...(parseRateLimit(writeErr) ? { retryable: true, rateLimited: true } : {}),
        reason:
          (parseRateLimit(writeErr)
            ? 'The GenLayer RPC node is at capacity and throttled the submission, so no consensus round started. '
              + 'Your trade was not validated or rejected — retry in a moment.'
            : null)
          || submissionDetail?.reason
          || writeErr?.shortMessage
          || writeErr?.message
          || 'GenLayer write transaction failed — consensus unavailable, failed closed',
        proposalId: '',
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ── Fallback: Read simulation (no account / signer available) ────────────
  // This path is used for UI previews only. It does NOT mutate contract state
  // and does NOT constitute proper GenLayer write-flow consensus. The result
  // must NOT be used to gate actual settlement.
  try {
    const result = await client.readContract({
      address: validatorAddress,
      functionName: 'validate_proposal',
      args: callArgs,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Simulation approved (read-only preview — not consensus)' : 'Simulation rejected by validator'),
      proposalId: result?.proposal_id || (isApproved ? `sim_${Date.now()}` : ''),
      txHash: null,
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
      isSimulation: true,  // Caller must check this — simulations do NOT gate settlement
      details: {
        action,
        tokenIn,
        tokenOut,
        amountInRaw: String(amountInRaw),
        minAmountOutRaw: String(minAmountOutRaw),
        slippageBps,
        router,
        deadline,
      },
    };
  } catch (err) {
    console.error('AgentValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'GenLayer Intelligent Contract consensus unavailable — failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Validate a Liquidity Proposal using GenLayer LiquidityValidator IC
 */
export async function validateLiquidityProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.liquidityValidator;

  const isV3 = proposal.model === 'v3' || proposal.isV3;
  const isRemove = proposal.action === 'REMOVE_LIQUIDITY';

  // ── V2 add-liquidity goes through the SAME enforced path as swaps ─────────
  // Everything below this branch calls `client.readContract`, i.e. a local
  // simulation on a single node that never triggers Optimistic Democracy — the
  // "validates through a read simulation" the GenLayer review rejected.
  //
  // LiquidityValidator cannot back an enforced flow as deployed: it has no
  // verdict persistence (no `get_validation`, no `compute_proposal_id`), so a
  // verdict it issues cannot be re-read on-chain at settlement time.
  // AgentValidator already accepts ADD_LIQUIDITY and records the verdict, so a
  // V2 deposit is validated by a real consensus write there and
  // /api/agent-add-liquidity verifies that verdict before binding the one-time
  // approval. Mapping is tokenA→token_in, tokenB→token_out,
  // amountA→amount_in, amountB→min_amount_out; the settlement route derives the
  // proposal id from exactly the same mapping.
  // Withdrawals validate through AgentValidator as well, so the verdict is
  // recorded and /api/agent-remove-liquidity can read it back. Mapping matches
  // the settlement route: tokenA/tokenB, amountIn = LP burned, minAmountOut =
  // the minimum of side A.
  if (!isV3) {
    const tokenAIn = proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn;
    const tokenBIn = proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut;
    if (tokenAIn && tokenBIn) {
      // Use the WRAPPED address for native on both sides of the flow.
      //
      // AgentExecutor.executeAddLiquidityV2 pulls both sides with transferFrom,
      // so it can only ever deal in ERC-20s — settlement therefore substitutes
      // WGEN for native GEN. Validation used to resolve GEN to the zero address
      // instead, which produced a DIFFERENT proposal_id from the one settlement
      // derives, so the verdict could never be found and every deposit was
      // refused with "no GenLayer consensus verdict exists on-chain for these
      // exact liquidity parameters". Both sides must normalise identically.
      const WGEN = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
      const asErc20 = (t) => {
        const resolved = resolveTokenAddress(t);
        return (!resolved || resolved === '0x0000000000000000000000000000000000000000') ? WGEN : resolved;
      };
      const amountARaw = String(proposal.amountARaw ?? proposal.amountA ?? proposal.amountInRaw ?? '0');
      const amountBRaw = String(proposal.amountBRaw ?? proposal.amountB ?? proposal.minAmountOutRaw ?? '0');
      const result = await validateSwapProposal(
        {
          ...proposal,
          // Use the PROPOSAL's action. Hardcoding ADD_LIQUIDITY meant a
          // withdrawal was validated as a deposit, so settlement (which derives
          // the id with REMOVE_LIQUIDITY) could never find the verdict.
          action: isRemove ? 'REMOVE_LIQUIDITY' : 'ADD_LIQUIDITY',
          tokenIn: asErc20(tokenAIn),
          tokenOut: asErc20(tokenBIn),
          amountInRaw: amountARaw,
          minAmountOutRaw: amountBRaw,
          slippageBps: proposal.slippageBps ?? 30,
        },
        options
      );
      return {
        ...result,
        isLiquidity: true,
        liquidityModel: 'v2',
        amountARaw,
        amountBRaw,
      };
    }
  }

  // Accept the swap-shaped field names too. The /a2a swarm describes every
  // action with tokenIn/tokenOut, so reading only tokenA/tokenB left both
  // undefined — and resolveTokenAddress(undefined) returns the zero address,
  // making the pair look like NATIVE/NATIVE. Every liquidity proposal was then
  // rejected with "tokenA and tokenB cannot be the same".
  const rawTokenA = proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn;
  const rawTokenB = proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut;

  if (!rawTokenA || !rawTokenB) {
    return {
      success: false,
      approved: false,
      reason: 'Liquidity proposal is missing its token pair (expected tokenA/tokenB, token0/token1, or tokenIn/tokenOut).',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }

  const tokenA = resolveTokenAddress(rawTokenA);
  const tokenB = resolveTokenAddress(rawTokenB);

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  try {
    let result;
    let functionName;
    let args;

    if (isRemove) {
      if (isV3) {
        functionName = 'validate_remove_liquidity_v3';
        args = [
          String(proposal.tokenId || '1'),
          String(proposal.liquidity || '1000000'),
          String(proposal.amount0Min || '0'),
          String(proposal.amount1Min || '0'),
          deadline,
        ];
      } else {
        functionName = 'validate_remove_liquidity_v2';
        args = [
          tokenA,
          tokenB,
          String(proposal.lpAmount || '1000000000000000000'),
          String(proposal.minAmountA || '0'),
          String(proposal.minAmountB || '0'),
          deadline,
        ];
      }
    } else {
      // Add Liquidity
      if (isV3) {
        functionName = 'validate_add_liquidity_v3';
        args = [
          tokenA,
          tokenB,
          parseInt(proposal.fee || 3000, 10),
          parseInt(proposal.tickLower || -887220, 10),
          parseInt(proposal.tickUpper || 887220, 10),
          String(proposal.amount0Desired || '1000000000000000000'),
          String(proposal.amount1Desired || '1000000000000000000'),
          String(proposal.amount0Min || '900000000000000000'),
          String(proposal.amount1Min || '900000000000000000'),
          deadline,
        ];
      } else {
        // As with the token pair, accept the swap-shaped amount fields the
        // /a2a swarm sends (amountInRaw / minAmountOutRaw) so a liquidity
        // proposal is not silently validated against placeholder amounts.
        const amountARaw = String(proposal.amountARaw ?? proposal.amountA ?? proposal.amountInRaw ?? '1000000000000000000');
        const amountBRaw = String(proposal.amountBRaw ?? proposal.amountB ?? proposal.minAmountOutRaw ?? '1000000000000000000');
        // Minimums default to 0.5% below the desired amounts — comfortably
        // inside the IC's 300 bps implied-slippage cap.
        const minARaw = String(proposal.minAmountARaw ?? proposal.minAmountA ?? (BigInt(amountARaw) * 995n) / 1000n);
        const minBRaw = String(proposal.minAmountBRaw ?? proposal.minAmountB ?? (BigInt(amountBRaw) * 995n) / 1000n);

        functionName = 'validate_add_liquidity_v2';
        args = [tokenA, tokenB, amountARaw, amountBRaw, minARaw, minBRaw, deadline];
      }
    }

    // Execute read contract simulation
    result = await client.readContract({
      address: validatorAddress,
      functionName,
      args,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Liquidity validation passed on GenVM' : 'Liquidity proposal rejected by GenLayer consensus'),
      proposalId: result?.proposal_id || (isApproved ? `liq_${Date.now()}` : ''),
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('LiquidityValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'Liquidity validation failed on GenLayer IC — failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Fetch stats from both Intelligent Contracts
 */
export async function getIntelligentContractStats() {
  const client = getGenLayerClient();
  try {
    const [agentStats, liqStats] = await Promise.all([
      client.readContract({
        address: GENLAYER_CONFIG.agentValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
      client.readContract({
        address: GENLAYER_CONFIG.liquidityValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
    ]);

    return {
      agentValidator: {
        address: GENLAYER_CONFIG.agentValidator,
        stats: agentStats,
      },
      liquidityValidator: {
        address: GENLAYER_CONFIG.liquidityValidator,
        stats: liqStats,
      },
    };
  } catch (err) {
    console.error('Failed to get Intelligent Contract stats:', err);
    return null;
  }
}
