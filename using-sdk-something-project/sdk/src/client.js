// src/client.js
//
// Thin client for the two calls that cannot happen in a browser.
//
// WHY A SERVER IS INVOLVED AT ALL
// -------------------------------
// Quoting, routing, intent parsing and program building are pure — they run
// anywhere with a public RPC and need no key. Two steps do not:
//
//   1. VALIDATE — `validate_swap` is a GenLayer consensus WRITE, so it needs a
//      funded GenLayer account to submit the transaction.
//   2. SETTLE   — the `execute*` functions carry an `onlyAgent` modifier, so the
//      caller must be an authorised relayer on the executor.
//
// Note what step 2 no longer includes. There used to be an
// `AgentExecutor.approveTradeWithParams` call here: the settlement agent wrote
// its own approval into the executor and then executed against it, which made
// that key — not GenLayer consensus — the thing authorising trades. Approvals
// now come from the AgentValidator Intelligent Contract, delivered to the
// executor over its ghost contract, so an agent key can only relay a trade
// consensus has already approved.
//
// Neither key belongs in client-side JavaScript, so both go through an endpoint
// you control. Point `baseUrl` at your own deployment.

import { INTELLIGENT_CONTRACTS, EXPLORER_URL } from './addresses.js';

export class SoyaraClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl  Origin hosting the Soyara API routes.
   * @param {number} [opts.pollIntervalMs=2000]
   * @param {number} [opts.maxPollAttempts=45]  ~2 min at the default interval.
   * @param {function} [opts.fetch]  Custom fetch (for Node <18 or testing).
   */
  constructor({ baseUrl, pollIntervalMs = 2000, maxPollAttempts = 45, fetch: f } = {}) {
    if (!baseUrl) throw new Error('SoyaraClient requires a baseUrl');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.pollIntervalMs = pollIntervalMs;
    this.maxPollAttempts = maxPollAttempts;
    this.fetch = f || globalThis.fetch;
    if (!this.fetch) throw new Error('No fetch available — pass one via opts.fetch');
  }

  async #post(path, body) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json;
    try { json = await res.json(); } catch { json = { error: `Non-JSON response (HTTP ${res.status})` }; }
    return { ok: res.ok, status: res.status, ...json };
  }

  /**
   * Submit a proposal for GenLayer consensus and wait for the verdict.
   *
   * A round takes tens of seconds: validators are selected by VRF, each
   * re-executes the proposal, then they commit and reveal. `onProgress` is
   * called on every poll so a caller can show something meaningful instead of
   * blocking silently.
   *
   * Never throws on a slow or undecided round — those are network conditions,
   * not rejections, and are reported as `{ approved: false, retryable: true }`.
   */
  async validate(proposal, { onProgress } = {}) {
    let result = await this.#post('/api/genlayer-validate', proposal);
    let proposalId = result.proposal_id || null;

    for (let attempt = 0; (result.pending || result.retryable) && attempt < this.maxPollAttempts; attempt += 1) {
      if (result.retryable && !result.pending) break; // decided-but-undecided: caller retries
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      if (onProgress) {
        onProgress({ attempt: attempt + 1, phase: result.statusName || 'PENDING', txHash: result.tx_hash });
      }
      result = await this.#post('/api/genlayer-validate', {
        checkTxHash: result.tx_hash,
        proposalId,
      });
      // The status check cannot always resolve an id; keep the one we have.
      proposalId = result.proposal_id || proposalId;
    }

    return {
      approved: Boolean(result.approved),
      pending: Boolean(result.pending),
      retryable: Boolean(result.retryable),
      queueFull: Boolean(result.queue_full),
      rateLimited: Boolean(result.rate_limited),
      proposalId,
      txHash: result.tx_hash || null,
      phase: result.statusName || null,
      reason: result.reason || '',
      validator: INTELLIGENT_CONTRACTS.agentValidator,
      explorerUrl: result.tx_hash ? `${EXPLORER_URL}/tx/${result.tx_hash}` : null,
    };
  }

  /**
   * Settle a validated swap.
   *
   * The server re-derives the proposal id from these exact parameters and reads
   * the verdict back on-chain before binding anything, so a settlement request
   * for a trade consensus did not approve is refused with 403 — passing
   * `validationApproved: true` is not sufficient on its own.
   */
  async settleSwap(trade) {
    const r = await this.#post('/api/agent-execute', { ...trade, validationApproved: true });
    if (!r.ok || !r.success) {
      const err = new Error(r.error || 'Settlement failed');
      err.notValidated = Boolean(r.notValidated);
      err.needsApproval = Boolean(r.needsApproval);
      err.stale = Boolean(r.stale);
      err.notRoutable = Boolean(r.notRoutable);
      throw err;
    }
    return r;
  }

  /** Settle a validated V2 deposit. */
  async addLiquidity(params) {
    const r = await this.#post('/api/agent-add-liquidity', { ...params, validationApproved: true });
    if (!r.ok || !r.success) throw Object.assign(new Error(r.error || 'Deposit failed'), r);
    return r;
  }

  /** Settle a validated V2 withdrawal. */
  async removeLiquidity(params) {
    const r = await this.#post('/api/agent-remove-liquidity', { ...params, validationApproved: true });
    if (!r.ok || !r.success) throw Object.assign(new Error(r.error || 'Withdrawal failed'), r);
    return r;
  }
}
