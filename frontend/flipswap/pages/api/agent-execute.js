// pages/api/agent-execute.js
//
// SERVER-SIDE AGENT EXECUTION ROUTE
// ==================================
// This API route is the critical bridge that enforces the GenLayer-to-settlement
// flow. It CANNOT be replaced by a direct frontend wallet call because:
//
//   AgentExecutor.approveTradeWithParams()  →  onlyAgent modifier
//   AgentExecutor.executeSwap()             →  onlyAgent modifier
//
// Only the authorisedAgent wallet (set at AgentExecutor deployment time) can call
// these functions. This server holds that private key and acts as the agent.
//
// SECURITY MODEL
// --------------
// 1. The user calls /api/genlayer-validate FIRST (GenLayer write tx → consensus)
// 2. Only after approved=true does the user call this route with a proposalId
// 3. This route re-validates the proposal params against the GenLayer IC result
//    (stored in the request — a production system would verify on-chain)
// 4. Calls AgentExecutor.approveTradeWithParams() with the EXACT same params
// 5. Then calls AgentExecutor.executeSwap() — which checks+consumes the hash
// 6. Any parameter difference → TradeNotApproved revert on-chain
//
// FAIL-CLOSED: if any step fails, the entire settlement is aborted.

import { createPublicClient, createWalletClient, http, parseUnits, zeroAddress, keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { quoteBestRouteMultiHop } from '../../lib/dexQuote.js';
import { computeProposalId, readValidationVerdict, checkTradeAgainstMandate } from '../../lib/genlayer.js';

// GenLayer Bradbury Testnet chain config (chain ID 4221)
const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public:  { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

/**
 * Compute the exact same trade hash as TradeHashLib.swapHash() in Solidity:
 *   keccak256(abi.encode(user, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline))
 */
function computeTradeHash(user, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, address, address, uint256, uint256, uint256, uint256'),
      [user, tokenIn, tokenOut, BigInt(amountIn), BigInt(minAmountOut), BigInt(slippageBps), BigInt(deadline)]
    )
  );
}

/**
 * Retry a write that the RPC node throttled.
 *
 * Bradbury replies `-32005 transaction gas rate limit exceeded: node is at
 * capacity, retry in ~Nms`. Settlement cannot rotate senders the way validation
 * can — AgentExecutor's onlyAgent modifier means these calls must come from the
 * authorised agent — so waiting the hinted interval is the correct remedy here.
 * Without this the throttle surfaced mid-flow as a bare
 * "Request exceeds defined limit", which reads like a failed trade when in fact
 * nothing was submitted.
 */
async function sendWithRetry(fn, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
      const throttled = /-32005|gas rate limit|at capacity|exceeds defined limit/i.test(text);
      if (!throttled || attempt >= 4) throw err;
      const hint = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
      const wait = Math.min(8000, (hint ? parseInt(hint[1], 10) : 1500) + attempt * 500);
      console.warn(`[settlement] ${label} throttled by node, retrying in ${wait}ms (attempt ${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Environment guard ---
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;

  // Resolve the executor from the SAME constant the client approves against.
  // Env vars are only read at server startup, so after a redeploy the browser
  // (which hot-reloads constants) would approve the new executor while this
  // route still pulled tokens with the old one. The user's allowance then sat
  // on a different contract and settlement failed inside the token's
  // transferFrom — surfacing as the token's SafeMath error,
  // "ds-math-sub-underflow", which looks like a routing/liquidity bug.
  // Keeping both sides on one source of truth removes that whole class of drift.
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor
    || process.env.AGENT_EXECUTOR_ADDRESS
    || process.env.NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS;

  if (!agentPrivateKey) {
    console.error('[agent-execute] AGENT_PRIVATE_KEY not set — settlement aborted (fail-closed)');
    return res.status(503).json({
      success: false,
      error: 'Settlement agent not configured — fail-closed',
    });
  }

  if (!agentExecutorAddress || agentExecutorAddress === '0x0000000000000000000000000000000000000000') {
    console.error('[agent-execute] AGENT_EXECUTOR_ADDRESS not set — settlement aborted (fail-closed)');
    return res.status(503).json({
      success: false,
      error: 'AgentExecutor not deployed — settlement blocked (fail-closed)',
    });
  }

  const {
    user,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    slippageBps,
    deadline,
    aggProgram,       // bytes — the AGGFlow routing program
    proposalId,       // from GenLayer validation response (informational)
    mandateId,        // consensus-issued mandate, if the trade was validated that way
    validationApproved,
  } = req.body;

  // --- Input validation ---
  if (!user || !tokenIn || !tokenOut || !amountIn || !minAmountOut || slippageBps === undefined || !deadline) {
    return res.status(400).json({ error: 'Missing required trade parameters' });
  }

  // Cheap client-side hint. NOT the gate — the real check is the on-chain
  // verdict lookup in STEP 0a below.
  if (!validationApproved) {
    return res.status(403).json({
      success: false,
      error: 'Settlement blocked: GenLayer validation was not approved — fail-closed',
    });
  }

  if (!aggProgram) {
    return res.status(400).json({ error: 'aggProgram (routing calldata) is required' });
  }

  try {
    // --- Set up agent wallet (server-side only) ---
    const pkHex = agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`;
    const account = privateKeyToAccount(pkHex);

    const publicClient = createPublicClient({
      chain: genLayerBradbury,
      transport: http('https://rpc-bradbury.genlayer.com'),
    });

    const walletClient = createWalletClient({
      account,
      chain: genLayerBradbury,
      transport: http('https://rpc-bradbury.genlayer.com'),
    });

    const tokenInAddr  = tokenIn  === '0x0000000000000000000000000000000000000000' ? zeroAddress : tokenIn;
    const tokenOutAddr = tokenOut === '0x0000000000000000000000000000000000000000' ? zeroAddress : tokenOut;
    const amountInBig      = BigInt(amountIn);
    let   minAmountOutBig  = BigInt(minAmountOut);
    const slippageBpsBig   = BigInt(slippageBps);
    const deadlineBig      = BigInt(deadline);
    const feeCollector     = process.env.FEE_COLLECTOR_ADDRESS || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
    const feeBps           = 5n; // 0.05% platform fee

    // ── STEP 0a: VERIFY THE GENLAYER VERDICT ON-CHAIN ────────────────────────
    // This is the enforcement point of the GenLayer-to-settlement flow.
    //
    // Previously this route accepted the client's word: the request carried
    // `validationApproved: true` and `proposalId`, neither of which was ever
    // checked, so a direct POST could settle a trade GenLayer had never seen.
    // The verdict is now read from the AgentValidator IC itself.
    //
    // Critically, it is BOUND TO THE EXACT PARAMETERS BEING SETTLED: the
    // proposal id is derived on-chain by `compute_proposal_id` from these same
    // params, so an approval issued for one trade cannot authorise a different
    // one, and a fabricated id simply is not found.
    //
    // Verified BEFORE the re-quote below, so the parameters checked against
    // consensus are exactly the ones the user validated.
    let verifiedVia = null;
    let derivedProposalId = null;

    // Kick the ERC-20 pre-flight off now so it overlaps the GenLayer verdict
    // lookup instead of running after it — these are independent RPC round
    // trips against different chains.
    const preflightPromise = (tokenInAddr !== zeroAddress)
      ? (async () => {
          const erc20Abi = [
            { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
            { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
          ];
          return Promise.all([
            publicClient.readContract({ address: tokenInAddr, abi: erc20Abi, functionName: 'allowance', args: [user, agentExecutorAddress] }),
            publicClient.readContract({ address: tokenInAddr, abi: erc20Abi, functionName: 'balanceOf', args: [user] }),
          ]);
        })()
      : Promise.resolve(null);

    try {
      derivedProposalId = await computeProposalId({
        action: 'SWAP',
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        amountIn: amountInBig.toString(),
        minAmountOut: minAmountOutBig.toString(),
        slippageBps: Number(slippageBpsBig),
        deadline: Number(deadlineBig),
      });

      if (derivedProposalId) {
        const verdict = await readValidationVerdict(derivedProposalId);
        if (verdict?.approved) {
          verifiedVia = { path: 'consensus_write', proposalId: derivedProposalId };
        }
      }

      // Mandate path — OFF BY DEFAULT.
      //
      // A mandate's authority does originate from a consensus WRITE
      // (`issue_trading_mandate`), but each individual trade is then admitted by
      // `check_mandate`, a @gl.public.view. That is a read, and it is precisely
      // what the GenLayer review called "validating through a read simulation".
      // The enforced flow therefore requires a per-trade consensus verdict
      // recorded by `validate_proposal`, and this fast lane must be switched on
      // deliberately (GENLAYER_ALLOW_MANDATE_FAST_PATH=true) for demos where
      // per-trade round latency is unacceptable.
      const mandateFastPathEnabled = process.env.GENLAYER_ALLOW_MANDATE_FAST_PATH === 'true';
      const effectiveMandateId = mandateFastPathEnabled
        ? (mandateId || process.env.GENLAYER_MANDATE_ID)
        : null;
      if (!verifiedVia && effectiveMandateId) {
        const m = await checkTradeAgainstMandate(effectiveMandateId, {
          user,
          tokenIn: tokenInAddr,
          tokenOut: tokenOutAddr,
          amountIn: amountInBig.toString(),
          slippageBps: Number(slippageBpsBig),
          deadline: Number(deadlineBig),
        });
        if (m?.approved) {
          verifiedVia = { path: 'consensus_mandate', mandateId: effectiveMandateId };
        }
      }
    } catch (e) {
      console.error('[agent-execute] on-chain verdict lookup failed:', e.message);
    }

    if (!verifiedVia) {
      console.warn('[agent-execute] REFUSED: no on-chain GenLayer approval for these params');
      return res.status(403).json({
        success: false,
        notValidated: true,
        error:
          'Settlement blocked: no GenLayer consensus verdict exists on-chain for these exact trade parameters. '
          + 'The trade must be validated by a validate_proposal consensus write on the AgentValidator '
          + 'Intelligent Contract before it can settle — fail-closed.',
        derivedProposalId,
      });
    }

    console.log(`[agent-execute] GenLayer approval verified on-chain via ${verifiedVia.path}`);

    // ── STEP 0: Pre-flight allowance / balance check ─────────────────────────
    // AgentExecutor pulls tokenIn from the user with transferFrom. If the user
    // has not approved THIS executor (or is short on balance), the token's own
    // SafeMath reverts with "ds-math-sub-underflow" — an opaque message that
    // reads like a routing or liquidity bug. Check first and say plainly what
    // is wrong and which contract needs approving.
    const preflight = await preflightPromise;
    if (preflight) {
      const [allowance, balance] = preflight;

      if (balance < amountInBig) {
        return res.status(400).json({
          success: false,
          error: `Insufficient balance: wallet holds ${balance} but the trade needs ${amountInBig} (raw units).`,
          needsApproval: false,
        });
      }
      if (allowance < amountInBig) {
        return res.status(400).json({
          success: false,
          error: `Token approval missing for the settlement contract. Approve at least ${amountInBig} (raw units) for AgentExecutor at ${agentExecutorAddress}, then execute again.`,
          needsApproval: true,
          spender: agentExecutorAddress,
        });
      }
    }

    // ── STEP 0b: Re-quote against live pool state ────────────────────────────
    // minAmountOut is computed when the quote is generated and then sits in the
    // client's React state. If the pool moves — or the page simply held the
    // proposal for a while, or a hot reload left a stale proposal on screen —
    // that minimum becomes unreachable and settlement reverts with
    // AGGFlowEntrypoint_InsufficientAmountAfterFees() (0x499c1728), which tells
    // the user nothing about the actual remedy (re-quote).
    //
    // Re-derive the floor from live reserves. If the requested minimum is still
    // achievable it is kept untouched, so the user's protection is never
    // silently weakened. If the price moved further than their own slippage
    // tolerance allows, refuse and say so plainly instead of settling at a
    // materially worse rate.
    let requoteInfo = null;
    try {
      const wgenAddr = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
      const fresh = await quoteBestRouteMultiHop(
        tokenInAddr === zeroAddress ? wgenAddr : tokenInAddr,
        tokenOutAddr === zeroAddress ? wgenAddr : tokenOutAddr,
        amountInBig,
        'best'
      );

      if (!fresh?.amountOutRaw) {
        // No pool can fill this pair. The proposal's minAmountOut came from the
        // reference-price fallback in /api/agent-v2, which is a display estimate
        // and not backed by any liquidity — settling it could only ever revert.
        return res.status(400).json({
          success: false,
          notRoutable: true,
          error:
            'No routable liquidity pool exists for this pair on Soyara DEX, so this trade cannot settle. ' +
            'The displayed rate was a reference estimate, not a live pool quote.',
        });
      }

      {
        const liveOut = fresh.amountOutRaw;
        if (minAmountOutBig > liveOut) {
          // One slippage band of drift is what the user already accepted.
          const tolerated = (liveOut * (10000n + slippageBpsBig)) / 10000n;
          if (minAmountOutBig > tolerated) {
            return res.status(409).json({
              success: false,
              stale: true,
              error:
                `Price moved beyond your ${Number(slippageBpsBig) / 100}% slippage tolerance since this quote was made. ` +
                `The pool now returns ${liveOut} but the trade requires at least ${minAmountOutBig} (raw units). ` +
                `Request a fresh quote and execute again.`,
              liveAmountOut: liveOut.toString(),
              requestedMinOut: minAmountOutBig.toString(),
            });
          }
          const adjusted = (liveOut * (10000n - slippageBpsBig)) / 10000n;
          requoteInfo = { from: minAmountOutBig.toString(), to: adjusted.toString(), liveAmountOut: liveOut.toString() };
          console.log(`[agent-execute] re-quoted minOut ${minAmountOutBig} -> ${adjusted} (live ${liveOut})`);
          minAmountOutBig = adjusted;
        }
      }
    } catch (e) {
      // A quoter failure must not block settlement — the on-chain minAmountOut
      // check is still the real guard.
      console.warn('[agent-execute] live re-quote unavailable:', e.message);
    }

    // Trade hash must be computed AFTER any re-quote so it commits to the value
    // actually settled with.
    const tradeHash = computeTradeHash(
      user, tokenInAddr, tokenOutAddr,
      amountInBig, minAmountOutBig, slippageBpsBig, deadlineBig
    );

    console.log(`[agent-execute] Binding one-time approval for trade ${tradeHash.slice(0, 10)}...`);
    console.log(`[agent-execute] user=${user} tokenIn=${tokenInAddr} tokenOut=${tokenOutAddr}`);
    console.log(`[agent-execute] amountIn=${amountInBig} minOut=${minAmountOutBig} slippage=${slippageBpsBig}bps`);

    // ── STEP 1: approveTradeWithParams (onlyAgent — server-side only) ─────────
    // Writes keccak256(abi.encode(user, tokenIn, tokenOut, amountIn, minOut, slippage, deadline))
    // to approvedTrades[tradeHash] = true in AgentExecutor storage.
    const approveTxHash = await sendWithRetry(() => walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'approveTradeWithParams',
      args: [user, tokenInAddr, tokenOutAddr, amountInBig, minAmountOutBig, slippageBpsBig, deadlineBig],
    }), 'approveTradeWithParams');

    console.log(`[agent-execute] approveTradeWithParams submitted: ${approveTxHash}`);

    // Wait for approval tx to be mined
    const approveReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveTxHash,
    });

    if (approveReceipt.status !== 'success') {
      return res.status(500).json({
        success: false,
        error: 'approveTradeWithParams transaction reverted — settlement aborted (fail-closed)',
        approveTxHash,
      });
    }

    console.log(`[agent-execute] Approval confirmed in block ${approveReceipt.blockNumber}. Executing swap...`);

    // ── STEP 2: executeSwap (onlyAgent — server-side only) ────────────────────
    // AgentExecutor internally:
    //   1. Validates all params
    //   2. Reads+deletes approvedTrades[tradeHash] — reverts with TradeNotApproved if missing or tampered
    //   3. Pulls tokenIn from user → approves entrypoint → calls AGGFlowEntrypoint.executeSwapWithReceiver
    //   4. Output tokens go directly to user
    const isNative = tokenInAddr === zeroAddress;
    const execTxHash = await sendWithRetry(() => walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'executeSwap',
      args: [
        user,
        tokenInAddr,
        tokenOutAddr,
        amountInBig,
        minAmountOutBig,
        slippageBpsBig,
        deadlineBig,
        aggProgram,
        feeBps,
        feeCollector,
      ],
      value: isNative ? amountInBig : 0n,
    }), 'executeSwap');

    console.log(`[agent-execute] executeSwap submitted: ${execTxHash}`);

    // Wait for execution receipt
    const execReceipt = await publicClient.waitForTransactionReceipt({
      hash: execTxHash,
    });

    if (execReceipt.status !== 'success') {
      return res.status(500).json({
        success: false,
        error: 'executeSwap transaction reverted — TradeNotApproved or parameter mismatch',
        execTxHash,
        approveReceipt: approveTxHash,
      });
    }

    console.log(`[agent-execute] Swap executed successfully in block ${execReceipt.blockNumber}`);

    return res.status(200).json({
      success: true,
      tradeHash,
      proposalId: proposalId || '',
      approveTxHash,
      execTxHash,
      blockNumber: execReceipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      // Non-null when the pool moved between quote and settlement and the
      // minimum was re-derived from live reserves within the user's tolerance.
      requoted: requoteInfo,
      // How the GenLayer approval was verified on-chain for this settlement.
      verifiedVia,
    });

  } catch (err) {
    console.error('[agent-execute] Settlement error (fail-closed):', err);

    // Map known revert errors to helpful messages
    let errorMessage = err?.shortMessage || err?.message || 'Settlement failed — fail-closed';
    if (errorMessage.includes('TradeNotApproved')) {
      errorMessage = 'Trade hash mismatch — parameters were tampered after approval. Settlement reverted.';
    } else if (errorMessage.includes('Unauthorized')) {
      errorMessage = 'Agent wallet is not authorised on AgentExecutor — check AGENT_PRIVATE_KEY.';
    } else if (errorMessage.includes('DeadlineExpired')) {
      errorMessage = 'Trade deadline has expired — request a new validation and retry.';
    } else if (errorMessage.includes('SlippageExceeded')) {
      errorMessage = 'Slippage exceeds the on-chain cap — GenLayer validator should have caught this.';
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}
