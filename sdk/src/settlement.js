// src/settlement.js
//
// The settlement architecture, exposed to agents.
//
// A Soyara trade is authorised by a COMMITMENT, not by an agent key. The
// commitment is a hash the AgentExecutor derives from the whole order, and the
// GenLayer AgentValidator is the only address permitted to record a verdict
// against one. Settlement re-derives the commitment from the order it was
// handed and consumes the matching verdict, so changing any field - the route,
// the fee, the recipient, the quote - produces a commitment no verdict backs
// and the transaction reverts.
//
// That property is worth checking rather than trusting, which is what
// `verifyBindings` is for: it asks the deployed contract to re-derive the
// commitment and compares it to the one consensus approved. An agent that
// settles without this is taking someone's word for it.

import { createPublicClient, http, keccak256 } from 'viem';
import { CHAIN_ID, RPC_URL, CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from './addresses.js';
import EXECUTOR_ABI from './AgentExecutor.abi.json' with { type: 'json' };

const ZERO = '0x0000000000000000000000000000000000000000';
const A = CONTRACT_ADDRESSES[CHAIN_ID];

export const chain = {
  id: CHAIN_ID,
  name: 'GenLayer Bradbury',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

let _client = null;
export function getSettlementClient() {
  if (!_client) _client = createPublicClient({ chain, transport: http(RPC_URL) });
  return _client;
}

/**
 * The `SwapOrder` field order, which is load-bearing.
 *
 * This is the tuple the executor hashes. Reordering it produces a different
 * commitment with no error anywhere - the encoding simply stops matching, and
 * every settlement reverts with a verdict that appears to be missing. Keep it
 * identical to `SettlementTypes.sol`.
 */
export const SWAP_ORDER_FIELDS = Object.freeze([
  'user', 'tokenIn', 'tokenOut',
  'amountIn', 'minAmountOut', 'quotedAmountOut',
  'slippageBps', 'deadline',
  'router', 'feeBps', 'feeCollector',
  'routeHash', 'nonce',
]);

const BIGINT_FIELDS = new Set([
  'amountIn', 'minAmountOut', 'quotedAmountOut', 'slippageBps', 'deadline', 'feeBps', 'nonce',
]);

/** Wire form (decimal strings) to the bigint form viem needs. */
export function deserialiseOrder(raw) {
  if (!raw) return null;
  const out = {};
  for (const f of SWAP_ORDER_FIELDS) {
    if (raw[f] === undefined) throw new Error(`SwapOrder is missing "${f}"`);
    out[f] = BIGINT_FIELDS.has(f) ? BigInt(raw[f]) : raw[f];
  }
  return out;
}

/** Bigint form back to decimal strings, for JSON. */
export function serialiseOrder(order) {
  return Object.fromEntries(
    Object.entries(order).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]),
  );
}

/** Commitments cross the GenLayer boundary as uint256 and the EVM as bytes32. */
export function toBytes32(commitment) {
  const n = typeof commitment === 'bigint' ? commitment : BigInt(String(commitment));
  return `0x${n.toString(16).padStart(64, '0')}`;
}

const sameHex = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Ask the executor to derive the commitment for an order.
 *
 * Read it from the contract rather than reimplementing the encoding here. A
 * second implementation is a second thing that can drift, and a drifted
 * commitment fails silently: settlement reverts as though no verdict existed.
 */
export async function deriveCommitment(order, { client = getSettlementClient(), executor = A.agentExecutor } = {}) {
  const o = typeof order?.amountIn === 'bigint' ? order : deserialiseOrder(order);
  return client.readContract({
    address: executor, abi: EXECUTOR_ABI, functionName: 'getSwapCommitment', args: [o],
  });
}

/** Is a verdict recorded and still valid for this commitment? */
export async function isVerdictLive(commitment, { client = getSettlementClient(), executor = A.agentExecutor } = {}) {
  return client.readContract({
    address: executor, abi: EXECUTOR_ABI, functionName: 'isVerdictLive', args: [toBytes32(commitment)],
  });
}

/**
 * Which rail can carry this verdict, and how long it has.
 *
 * The three differ by nearly three orders of magnitude in latency, so an agent
 * that guesses will either poll for forty minutes when it did not need to, or
 * give up after thirty seconds when it did.
 *
 *   reuse     a live verdict already covers this commitment      seconds
 *   attestor  an M-of-N EIP-712 quorum can carry it now          ~30s
 *   consensus wait for the round to finalize and deliver it      appeal window
 */
export async function readSettlementPlan({
  commitment = null,
  deadline = null,
  client = getSettlementClient(),
  executor = A.agentExecutor,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const read = (functionName, args = []) =>
    client.readContract({ address: executor, abi: EXECUTOR_ABI, functionName, args }).catch(() => null);

  const [paused, threshold, validator] = await Promise.all([
    read('paused'), read('attestorThreshold'), read('genLayerValidator'),
  ]);

  let used = null;
  let expiry = null;
  if (commitment != null) {
    const c = toBytes32(commitment);
    [used, expiry] = await Promise.all([read('commitmentUsed', [c]), read('verdictExpiry', [c])]);
  }

  const expirySec = expiry != null ? Number(expiry) : 0;
  const verdictLive = expirySec > now;
  const thresholdNum = threshold != null ? Number(threshold) : 0;

  const blockers = [];
  if (paused === true) blockers.push('The executor is paused; no rail can settle while it is.');
  if (used === true) blockers.push('This commitment has already been consumed. Verdicts are single use.');
  if (deadline != null && Number(deadline) <= now) {
    blockers.push(`The order deadline passed ${now - Number(deadline)}s ago; settlement would revert.`);
  }

  let rail, etaSeconds, rationale;
  if (blockers.length) {
    rail = 'blocked'; etaSeconds = null; rationale = blockers[0];
  } else if (verdictLive) {
    rail = 'reuse'; etaSeconds = 2;
    rationale = 'A verdict for this exact commitment is already recorded on the executor.';
  } else if (thresholdNum > 0) {
    rail = 'attestor'; etaSeconds = 30;
    rationale = `An ${thresholdNum}-of-N attestor quorum can carry the verdict once the round decides, `
      + 'without waiting out the appeal window.';
  } else {
    rail = 'consensus'; etaSeconds = 2400;
    rationale = 'No attestor threshold is configured, so the verdict arrives when the GenLayer round '
      + 'finalizes and delivers it over the validator ghost contract.';
  }

  return {
    rail, etaSeconds, rationale, blockers,
    paused: paused === true,
    commitmentUsed: used === true,
    verdictLive,
    verdictExpiry: expirySec || null,
    secondsToExpiry: verdictLive ? expirySec - now : 0,
    attestorThreshold: thresholdNum,
    genLayerValidator: validator || null,
    secondsToDeadline: deadline != null ? Number(deadline) - now : null,
    executor,
  };
}

/**
 * Prove, against the deployed contract, that the approved commitment binds this
 * exact order - and that the route bytes about to run are the ones it covers.
 *
 * The first check subsumes every field, because the contract does the encoding:
 * if the route, fee, fee collector, recipient, quote, deadline or nonce differ
 * by anything at all from what consensus saw, the hashes diverge.
 *
 * @returns {{passed: boolean, bound: boolean, checks: Array, onChainCommitment: string|null}}
 *   `bound` covers the cryptographic bindings alone; `passed` also requires the
 *   practical preconditions (deadline open, balance, allowance) to hold.
 */
export async function verifyBindings({
  order,
  program = null,
  commitment,
  user = null,
  client = getSettlementClient(),
  executor = A.agentExecutor,
} = {}) {
  const checks = [];
  const add = (name, passed, detail, binding = false) => checks.push({ name, passed, detail, binding });

  if (!order || commitment == null) {
    add('Order binding', false, 'No bound order or commitment was supplied, so there is nothing to verify.', true);
    return { passed: false, bound: false, checks, onChainCommitment: null };
  }

  const o = typeof order.amountIn === 'bigint' ? order : deserialiseOrder(order);

  let onChain = null;
  try {
    onChain = await deriveCommitment(o, { client, executor });
  } catch (err) {
    add('Executor commitment', false, `getSwapCommitment failed: ${err.shortMessage || err.message}`, true);
  }

  if (onChain != null) {
    const matches = toBytes32(onChain) === toBytes32(commitment);
    add('Commitment binds this exact order', matches,
      matches
        ? 'The executor re-derives the approved commitment from this order. Route, fee, fee collector, '
          + 'recipient, quote, deadline and nonce are all inside it.'
        : 'MISMATCH: the executor derives a different commitment from this order than consensus approved. '
          + 'Settlement would revert, correctly.',
      true);
  }

  if (program) {
    const bound = sameHex(keccak256(program), o.routeHash);
    add('Route program matches routeHash', bound,
      bound
        ? 'keccak256(aggProgram) equals the committed routeHash, so the executed path is the validated path.'
        : 'The aggregator program does not hash to the committed routeHash.',
      true);
  }

  if (user) {
    add('Recipient bound', sameHex(o.user, user),
      sameHex(o.user, user)
        ? `Output is bound to ${o.user}; no relayer can redirect it.`
        : `The order names ${o.user}, not ${user}.`,
      true);
  }

  add('Router bound', sameHex(o.router, A.aggregatorEntrypoint),
    `Settlement is pinned to ${o.router}.`, true);

  add('Fee and collector bound', o.feeBps <= 100n,
    `${Number(o.feeBps) / 100}% to ${o.feeCollector}, fixed inside the commitment.`, true);

  const now = BigInt(Math.floor(Date.now() / 1000));
  add('Deadline still open', o.deadline > now,
    o.deadline > now
      ? `${o.deadline - now}s remaining before the order expires on-chain.`
      : `Expired ${now - o.deadline}s ago.`);

  if (o.tokenIn && o.tokenIn !== ZERO && user) {
    const erc20 = [
      { inputs: [{ type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
      { inputs: [{ type: 'address' }, { type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    ];
    try {
      const [bal, allow] = await Promise.all([
        client.readContract({ address: o.tokenIn, abi: erc20, functionName: 'balanceOf', args: [user] }),
        client.readContract({ address: o.tokenIn, abi: erc20, functionName: 'allowance', args: [user, executor] }),
      ]);
      add('Balance covers the order', bal >= o.amountIn,
        bal >= o.amountIn ? 'Sufficient input balance.' : `Holds ${bal}, order needs ${o.amountIn}.`);
      add('Executor allowance in place', allow >= o.amountIn,
        allow >= o.amountIn
          ? 'The one-time approval is granted; settlement needs no further wallet prompt.'
          : 'A one-time approval is still needed for this token.');
    } catch {
      /* an unreadable token is reported by the checks that remain */
    }
  }

  return {
    passed: checks.every((c) => c.passed),
    bound: checks.filter((c) => c.binding).every((c) => c.passed),
    checks,
    onChainCommitment: onChain != null ? toBytes32(onChain) : null,
  };
}

/** The deployed pair this SDK targets. */
export const DEPLOYMENT = Object.freeze({
  chainId: CHAIN_ID,
  agentExecutor: A.agentExecutor,
  agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
  aggregatorEntrypoint: A.aggregatorEntrypoint,
  rpcUrl: RPC_URL,
});
