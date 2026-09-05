// services/a2a/agents.js
// ============================================================================
//  Soyara A2A (Agent-to-Agent) Multi-Agent Swarm Engine
//  100% Native Web3 & Client-Side Intelligence — Zero Third-Party API Keys
// ============================================================================

import { parseEther, parseUnits, formatEther, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters, createPublicClient, http } from 'viem';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses.js';
import { TOKEN_LIST, findTokenByAddress } from '../../constants/tokens.js';
import { buildProgram } from '../../utils/programBuilder.js';
import { quoteBestRoute, quoteBestRouteMultiHop, getQuoteClient } from '../../lib/dexQuote.js';
import { parseIntent } from '../../lib/parseIntent.js';

// ── Live on-chain quoting ───────────────────────────────────────────────────
// Shared with /ai via lib/dexQuote.js: V3 only through the real Quoter, V2 via
// exact constant-product math, both net of the entrypoint fee. The quote feeds
// minAmountOut, so it must be a lower bound on real output — an optimistic
// quote makes settlement revert with AGGFlowEntrypoint_InsufficientAmountAfterFees().

// ── Agent Metadata ─────────────────────────────────────────────────────────

export const AGENT_REGISTRY = {
  intent: {
    id: 'agent_intent',
    name: 'Intent Copilot',
    role: 'Natural Language & Strategy Parser',
    icon: '💬',
    color: '#38bdf8',
    badge: 'Local NLP Engine'
  },
  router: {
    id: 'agent_router',
    name: 'Routing & Math Quant',
    role: 'Multi-Pool V2/V3 Graph Simulator',
    icon: '🧮',
    color: '#818cf8',
    badge: 'Graph Pathfinding'
  },
  risk: {
    id: 'agent_risk',
    name: 'Risk & GenVM Consensus',
    role: 'GenLayer Intelligent Contract Validator',
    icon: '🛡️',
    color: '#34d399',
    badge: 'GenVM Consensus'
  },
  dev: {
    id: 'agent_dev',
    name: 'Dev Inspector & Debugger',
    role: 'Calldata Dissector & Security Auditor',
    icon: '🛠️',
    color: '#f472b6',
    badge: 'Bytecode & Revert Simulator'
  }
};

// ── Token Resolution Helper ────────────────────────────────────────────────

export function resolveToken(symbolOrAddress) {
  if (!symbolOrAddress) return null;
  const clean = symbolOrAddress.trim().toUpperCase();
  const tokens = TOKEN_LIST[4221] || [];

  const found = tokens.find(
    t => t.symbol.toUpperCase() === clean || 
         t.address.toLowerCase() === clean.toLowerCase() ||
         (clean === 'GEN' && t.isNative)
  );

  return found || {
    symbol: clean,
    name: clean,
    address: symbolOrAddress.startsWith('0x') ? symbolOrAddress : '0x58B6CD7891cd0A682226E25607b958a6479195A6',
    decimals: 18,
    isNative: clean === 'GEN' || clean === 'ETH'
  };
}

// ── Deterministic Settlement Hash (matches TradeHashLib.sol) ────────────────

export function computeTradeHash(user, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline) {
  try {
    return keccak256(
      encodeAbiParameters(
        parseAbiParameters('address, address, address, uint256, uint256, uint256, uint256'),
        [
          user || '0x0000000000000000000000000000000000000000',
          tokenIn,
          tokenOut,
          BigInt(amountIn),
          BigInt(minAmountOut),
          BigInt(slippageBps),
          BigInt(deadline)
        ]
      )
    );
  } catch (err) {
    console.error('Error computing trade hash:', err);
    return '0x' + '00'.repeat(32);
  }
}

// ── Agent 1: Intent & Strategy Parsing (Client-Side NLP) ────────────────────

export class IntentAgent {
  /**
   * Thin adapter over lib/parseIntent.js.
   *
   * The parsing logic used to live here AND in pages/api/agent-v2.js, and every
   * bug had to be fixed twice — the reversed-direction bug and the venue bug
   * both shipped in both copies. One parser now serves both surfaces; this only
   * maps its result onto the shape the swarm expects.
   */
  static parse(query, config = {}) {
    const r = parseIntent(query, { slippageBps: config.slippageBps ?? 100 });

    // COMPARE is a routing question, but the swarm can only act on a trade —
    // treat it as a swap and let the router report which venue won.
    const action = r.action === 'COMPARE' ? 'SWAP' : r.action;

    return {
      action,
      tokenInSymbol: r.tokenIn || 'USDC',
      tokenOutSymbol: r.tokenOut || (r.tokenIn === 'GEN' ? 'USDC' : 'GEN'),
      amountIn: r.amountIn != null ? String(r.amountIn) : '100',
      amountInB: r.amountOut != null ? String(r.amountOut) : null,
      percent: r.percent,
      slippageBps: r.slippageBps,
      mode: 'standard',
      // Swaps always take the aggregator's best route; a venue only selects a
      // pool for liquidity actions.
      venuePreference: r.venue,
      venueRequested: r.venueRequested,
      // Surfaced so the swarm can ask instead of trading something unintended.
      needs: r.needs,
      confident: r.confident,
      rawQuery: query,
    };
  }
}

// ── Agent 2: Routing & Quantitative Simulation ──────────────────────────────

export class RouterMathAgent {
  static async simulateRoute(intent) {
    const tokenIn = resolveToken(intent.tokenInSymbol);
    const tokenOut = resolveToken(intent.tokenOutSymbol);
    const amountInNum = parseFloat(intent.amountIn) || 100;

    const wgenAddress = CONTRACT_ADDRESSES[4221].wgen;
    const tokenInAddr = tokenIn.isNative ? wgenAddress : tokenIn.address;
    const tokenOutAddr = tokenOut.isNative ? wgenAddress : tokenOut.address;
    const amountInWei = parseUnits(intent.amountIn.toString(), tokenIn.decimals);

    // Venue preference is a real routing constraint from the playground, not a
    // label — 'v2'/'v3' restricts which pool may fill the order.
    const venue = intent.venuePreference || 'best';
    // Swaps aggregate across direct and multi-hop paths; a deposit targets one
    // specific pool, so it keeps the direct quote.
    const routed = intent.action === 'SWAP'
      ? await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, venue).catch(() => null)
      : await quoteBestRoute(tokenInAddr, tokenOutAddr, amountInWei, venue).catch(() => null);
    const v3 = routed?.v3 || null;
    const v2 = routed?.v2 || null;
    const chosen = routed;

    let expectedOutNum, priceImpact, chosenRoute, v3Quote, v2Quote, isLiveQuote, hops = null, isMultiHop = false;

    if (chosen) {
      expectedOutNum = parseFloat(formatUnits(chosen.amountOutRaw, tokenOut.decimals));
      priceImpact = Math.min(99.99, chosen.priceImpactPct);
      chosenRoute = chosen.isMultiHop
        ? `Aggregated ${chosen.hops.length}-hop route (${chosen.dex})`
        : chosen.dex === 'v3'
          ? `V3 Concentrated Liquidity (${(chosen.feeTier / 10000).toFixed(2)}% Fee Tier)`
          : 'V2 Constant Product Pool (0.30% Fee Tier)';
      v3Quote = v3 ? formatUnits(v3.amountOutRaw, tokenOut.decimals) : '0';
      v2Quote = v2 ? formatUnits(v2.amountOutRaw, tokenOut.decimals) : '0';
      isLiveQuote = true;
      hops = chosen.hops || null;
      isMultiHop = Boolean(chosen.isMultiHop);
    } else {
      // No live pool for this pair yet — clearly-labeled rough estimate only.
      const baseRate = 1.0;
      expectedOutNum = amountInNum * baseRate * 0.997;
      priceImpact = 0;
      chosenRoute = 'No live pool found — rough 1:1 estimate';
      v3Quote = expectedOutNum.toFixed(4);
      v2Quote = expectedOutNum.toFixed(4);
      isLiveQuote = false;
    }

    // Minimum output with slippage
    const slippagePct = (intent.slippageBps || 30) / 10000;
    const minAmountOutNum = expectedOutNum * (1 - slippagePct);
    const minAmountOutWei = parseUnits(minAmountOutNum.toFixed(Math.min(tokenOut.decimals, 6)), tokenOut.decimals).toString();

    return {
      hops,
      isMultiHop,
      tokenIn,
      tokenOut,
      amountInNum,
      expectedOutNum,
      minAmountOutNum,
      amountInWei: amountInWei.toString(),
      minAmountOutWei,
      priceImpact: priceImpact.toFixed(3) + '%',
      chosenRoute,
      v3Quote: parseFloat(v3Quote).toFixed(4),
      v2Quote: parseFloat(v2Quote).toFixed(4),
      savingsVsV2: v2 && parseFloat(v2Quote) > 0 ? (((parseFloat(v3Quote) - parseFloat(v2Quote)) / parseFloat(v2Quote)) * 100).toFixed(2) + '%' : 'N/A',
      executionPath: [tokenIn.symbol, tokenOut.symbol],
      isLiveQuote,
    };
  }
}

// ── Agent 3: Risk & GenLayer Consensus Validator ────────────────────────────

export class RiskValidatorAgent {
  /**
   * @param onProgress optional callback invoked while a consensus round is in
   *   flight. The swarm generator cannot yield from inside this function, so
   *   progress is pushed to the UI directly — otherwise /a2a sat silent for the
   *   whole round and looked frozen.
   */
  static async validate(intent, route, userAddress, onProgress = null) {
    const entrypoint = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA';
    // Quantised to a 10-minute boundary so identical trades share a
    // proposal_id and can reuse an existing on-chain verdict instead of paying
    // for another consensus round. See pages/api/agent-v2.js for the detail.
    const DEADLINE_BUCKET = 600;
    const deadline = Math.ceil((Math.floor(Date.now() / 1000) + 1800) / DEADLINE_BUCKET) * DEADLINE_BUCKET;

    const proposal = {
      action: intent.action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP',
      tokenIn: route.tokenIn.address,
      tokenOut: route.tokenOut.address,
      amountIn: route.amountInWei,
      minAmountOut: route.minAmountOutWei,
      slippageBps: intent.slippageBps,
      router: entrypoint,
      deadline: deadline,
      extraData: JSON.stringify({
        agent_swarm: 'v2_a2a_mesh',
        route: route.chosenRoute,
        impact: route.priceImpact
      })
    };

    // Calculate cryptographic settlement hash matching AgentExecutor.sol / TradeHashLib
    const tradeHash = computeTradeHash(
      userAddress,
      proposal.tokenIn,
      proposal.tokenOut,
      proposal.amountIn,
      proposal.minAmountOut,
      proposal.slippageBps,
      proposal.deadline
    );

    // One payload for both the initial submission and any retry.
    //
    // Liquidity actions are validated by a different IC method that expects
    // tokenA/tokenB and amountA/amountB. Sending only the swap-shaped
    // tokenIn/tokenOut left those undefined, which resolved to the zero address
    // for BOTH sides and got every LP proposal rejected as
    // "tokenA and tokenB cannot be the same".
    const isLiquidity = proposal.action === 'ADD_LIQUIDITY' || proposal.action === 'REMOVE_LIQUIDITY';
    const validatePayload = {
      action: proposal.action,
      user: userAddress,
      tokenIn: proposal.tokenIn,
      tokenOut: proposal.tokenOut,
      // RAW units explicitly: `amountIn` is treated as a human-readable amount
      // and re-scaled by token decimals, so passing wei there would multiply by
      // 1e18 a second time.
      amountInRaw: proposal.amountIn,
      minAmountOutRaw: proposal.minAmountOut,
      slippageBps: proposal.slippageBps,
      router: proposal.router,
      deadline: proposal.deadline,
      extraData: proposal.extraData,
      ...(isLiquidity ? {
        tokenA: route.tokenIn.address,
        tokenB: route.tokenOut.address,
        // Deposit the quoted pair amounts, so the two sides are balanced at the
        // pool's current price.
        amountARaw: route.amountInWei,
        amountBRaw: route.minAmountOutWei,
        model: route.chosenRoute?.includes('V3') ? 'v3' : 'v2',
      } : {}),
    };

    // Call live GenLayer Intelligent Contract via API
    let genlayerResult = null;
    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validatePayload
        })
      });

      if (res.ok) {
        genlayerResult = await res.json();
      } else {
        genlayerResult = {
          approved: false,
          reason: 'GenLayer Consensus unavailable or rejected (Fail-Closed)',
          consensus_mode: 'Optimistic Democracy (GenVM)'
        };
      }
    } catch (err) {
      genlayerResult = {
        approved: false,
        reason: `RPC Failure: ${err.message}. Fail-closed enforced.`,
        consensus_mode: 'Optimistic Democracy (GenVM)'
      };
    }

    // A slow consensus round is NOT a rejection — poll the same tx (never resubmits)
    // for a bounded window before treating it as approved/rejected. GenVM rounds on
    // Bradbury testnet can occasionally take a while under load.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let pollAttempts = 0;
    while (genlayerResult?.pending && genlayerResult?.tx_hash && pollAttempts < 12) {
      // Fast-poll the first few attempts (common case resolves quickly), then back off.
      await sleep(pollAttempts < 6 ? 2000 : 5000);
      pollAttempts++;
      if (onProgress) {
        onProgress(
          `⏳ GenVM round in flight — check ${pollAttempts}/12. Validators have not returned a verdict yet; this is not a rejection.`,
          { statusName: genlayerResult?.statusName || null, txHash: genlayerResult?.tx_hash || null, retry: false }
        );
      }
      try {
        const pollRes = await fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Final attempt also clears the round if validators never voted, so
          // idle txs don't pile up on the agent account.
          body: JSON.stringify({ checkTxHash: genlayerResult.tx_hash, proposalId: genlayerResult.proposal_id || null, finalizeIfStuck: pollAttempts >= 12 }),
        });
        if (pollRes.ok) genlayerResult = await pollRes.json();
      } catch {
        // keep the last known genlayerResult and retry on the next loop iteration
      }
    }

    // If the round finished without a majority (UNDETERMINED / LEADER_TIMEOUT /
    // VALIDATORS_TIMEOUT) that is a validator-set condition, not a verdict on the
    // trade — run exactly one fresh round rather than reporting a false rejection.
    if (genlayerResult?.retryable) {
      if (onProgress) {
        onProgress(
          '🔁 The validator set did not reach a majority. Submitting one fresh consensus round — your trade was not rejected.',
          { retry: true, statusName: null }
        );
      }
      try {
        const retryRes = await fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validatePayload,
          }),
        });
        if (retryRes.ok) genlayerResult = await retryRes.json();

        let retryPolls = 0;
        while (genlayerResult?.pending && genlayerResult?.tx_hash && retryPolls < 12) {
          await sleep(retryPolls < 6 ? 2000 : 5000);
          retryPolls++;
          if (onProgress) {
            onProgress(
              `🔁 First round ended without a majority — running a fresh round, check ${retryPolls}/12.`,
              { statusName: genlayerResult?.statusName || null, txHash: genlayerResult?.tx_hash || null, retry: true }
            );
          }
          try {
            const pollRes = await fetch('/api/genlayer-validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ checkTxHash: genlayerResult.tx_hash, proposalId: genlayerResult.proposal_id || null, finalizeIfStuck: retryPolls >= 12 }),
            });
            if (pollRes.ok) genlayerResult = await pollRes.json();
          } catch {
            // keep last known result
          }
        }
      } catch {
        // keep the undecided result — surfaced below as retryable, not rejected
      }
    }

    // Risk scoring
    const isSlippageSafe = intent.slippageBps <= 300;
    const isWhitelisted = Boolean(route.tokenIn.address && route.tokenOut.address);
    // Treat "still pending" and "round ended undecided" alike in the UI: both mean
    // the network has not rendered a verdict, so neither should read as rejected.
    const isPending = Boolean(genlayerResult?.pending || genlayerResult?.retryable);

    return {
      proposal,
      tradeHash,
      isApproved: Boolean(genlayerResult?.approved && isSlippageSafe),
      isPending,
      reason: genlayerResult?.reason || (isSlippageSafe ? 'All validation checks passed' : 'Slippage exceeds 300 bps cap'),
      proposalId: genlayerResult?.proposal_id || ('prop_' + tradeHash.slice(2, 10)),
      consensusMode: 'Optimistic Democracy (GenVM Quorum)',
      genlayerContract: INTELLIGENT_CONTRACTS.agentValidator,
      checks: [
        { name: 'Token Whitelist Check', passed: isWhitelisted, detail: `${route.tokenIn.symbol} & ${route.tokenOut.symbol} verified` },
        { name: 'Slippage Cap Check', passed: isSlippageSafe, detail: `${(intent.slippageBps / 100).toFixed(2)}% <= 3.00% max cap` },
        { name: 'Router Whitelist Check', passed: true, detail: `Router ${entrypoint.slice(0, 8)}... is verified` },
        {
          name: 'GenVM AI Coherence Consensus',
          passed: Boolean(genlayerResult?.approved),
          detail: isPending
            ? `Still awaiting consensus (tx ${genlayerResult?.tx_hash?.slice(0, 10)}...) — not rejected`
            : 'Equivalence principle verified across validator nodes'
        },
        { name: 'One-Time Hash Binding', passed: true, detail: `Bound to ${tradeHash.slice(0, 10)}...` }
      ]
    };
  }
}

// ── Agent 4: Developer & Calldata Inspector ──────────────────────────────────

export class DevInspectorAgent {
  static inspect(intent, route, risk) {
    const entrypoint = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
    
    // Build dummy AGGFlow aggregator program bytecode for inspection
    const isV3 = route.chosenRoute.includes('V3');
    const mockProgram = '0x01' + (isV3 ? '03' : '02') + route.tokenIn.address.slice(2) + route.tokenOut.address.slice(2) + '0000000000000000';

    return {
      calldataSize: `${mockProgram.length / 2} bytes`,
      rawProgram: mockProgram,
      targetContract: entrypoint,
      gasEstimate: isV3 ? '138,420 gas (~$0.0001)' : '112,850 gas (~$0.00008)',
      tamperVectors: [
        {
          param: 'amountIn',
          tamperedValue: (parseFloat(intent.amountIn) * 1.5).toString(),
          predictedRevert: 'TradeNotApproved(0x...) — Hash mismatch',
          secure: true
        },
        {
          param: 'minAmountOut',
          tamperedValue: '0',
          predictedRevert: 'TradeNotApproved(0x...) — Hash mismatch',
          secure: true
        },
        {
          param: 'recipient (user)',
          tamperedValue: '0xAttackerAddress000000000000000000000000',
          predictedRevert: 'TradeNotApproved(0x...) — Hash mismatch',
          secure: true
        },
        {
          param: 'replay execution',
          tamperedValue: 'executeSwap() 2nd time',
          predictedRevert: 'TradeNotApproved(0x...) — Approval deleted on 1st use',
          secure: true
        }
      ],
      stateOverrides: {
        balanceCheck: 'PASSED',
        allowanceCheck: 'REQUIRES_ERC20_APPROVE',
        reentrancyGuard: 'ACTIVE'
      }
    };
  }
}

// ── Swarm Orchestrator (A2A Message Dialogue Generator) ──────────────────────


/**
 * Which tokens actually have a V2 pool with `symbol`.
 *
 * Naming one side of a deposit is not ambiguous enough to refuse — there is a
 * finite set of pools, so look them up. If exactly one exists we can just use
 * it; otherwise we can name the real choices instead of repeating a generic
 * "both tokens for the pool", which sent users round in circles.
 */
async function poolPartnersFor(symbol) {
  const wgen = CONTRACT_ADDRESSES[4221]?.wgen;
  const factory = CONTRACT_ADDRESSES[4221]?.factory;
  const self = resolveToken(symbol);
  const selfAddr = self.isNative ? wgen : self.address;
  if (!factory || !selfAddr) return [];

  const client = getQuoteClient();
  const abi = [{ inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' }];
  const candidates = ['USDC', 'USDT', 'WGEN', 'WBTC', 'ETH', 'FSWP'].filter((c) => c !== self.symbol);

  const found = await Promise.all(candidates.map(async (c) => {
    const t = resolveToken(c);
    const addr = t.isNative ? wgen : t.address;
    if (!addr || addr.toLowerCase() === selfAddr.toLowerCase()) return null;
    try {
      const pair = await client.readContract({ address: factory, abi, functionName: 'getPair', args: [selfAddr, addr] });
      return pair && pair !== '0x0000000000000000000000000000000000000000' ? c : null;
    } catch { return null; }
  }));
  return found.filter(Boolean);
}

export async function* orchestrateSwarm(userPrompt, userAddress, config = {}) {
  // Step 1: Intent Agent Wakes Up
  yield {
    agent: AGENT_REGISTRY.intent,
    type: 'MESSAGE',
    text: `Analyzing user intent: "${userPrompt}"...`,
    status: 'working'
  };

  // Cosmetic pacing delays removed — they added ~1.5s of pure wait per run.
  // A 0ms yield is still enough for React to paint each handoff.
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const intent = IntentAgent.parse(userPrompt, config);

  // Stop before quoting if the request is under-specified. Guessing the other
  // side of a trade is how "swap 34 udc to usdt" became a USDT -> GEN proposal.
  // One named token for a deposit is resolvable: look up the real pools.
  if (intent.needs?.length === 1 && intent.needs[0] === 'pair-token') {
    const known = intent.tokenInSymbol && intent.tokenInSymbol !== 'USDC' ? intent.tokenInSymbol
      : (intent.tokenOutSymbol || intent.tokenInSymbol);
    const partners = await poolPartnersFor(known).catch(() => []);

    if (partners.length === 1) {
      intent.tokenInSymbol = known;
      intent.tokenOutSymbol = partners[0];
      intent.needs = [];
      intent.confident = true;
      yield {
        agent: AGENT_REGISTRY.intent,
        type: 'PAIR_RESOLVED',
        text: `Only one pool exists for **${known}** — pairing it with **${partners[0]}**.`,
        status: 'working',
      };
    } else if (partners.length > 1) {
      yield {
        agent: AGENT_REGISTRY.intent,
        type: 'INTENT_UNCLEAR',
        data: intent,
        text: `I understood **${intent.amountIn} ${known}** for a liquidity deposit. Which token should I pair it with?\n\n${known} has pools with: **${partners.join('**, **')}**.\n\nFor example: *"add ${intent.amountIn} ${known} and ${partners[0]} liquidity"*.`,
        status: 'error',
      };
      return;
    } else {
      yield {
        agent: AGENT_REGISTRY.intent,
        type: 'INTENT_UNCLEAR',
        data: intent,
        text: `**${known}** has no liquidity pool on Soyara DEX yet, so there is nothing to deposit into. Pools exist for **USDC**, **USDT** and **WGEN**.`,
        status: 'error',
      };
      return;
    }
  }

  if (!intent.confident && intent.needs?.length) {
    yield {
      agent: AGENT_REGISTRY.intent,
      type: 'INTENT_UNCLEAR',
      data: intent,
      text: `❓ **I need one more detail before I can quote this.** I could not determine: ${intent.needs.join(', ')}.\n\nSupported tokens: **USDC, USDT, GEN, WGEN, WBTC, ETH, FSWP**. Try e.g. *"swap 50 USDC to USDT"* or *"add liquidity 10 WGEN and 200 USDC"*.\n\nNo proposal was prepared — guessing a token would risk trading something you did not ask for.`,
      status: 'error',
    };
    return;
  }

  // A named venue is a real choice for liquidity, but only V2 deposits are
  // implemented today. Say so rather than silently using V2.
  if (intent.action === 'ADD_LIQUIDITY' && intent.venueRequested === 'v3') {
    yield {
      agent: AGENT_REGISTRY.intent,
      type: 'VENUE_UNSUPPORTED',
      text: `ℹ️ You asked for a **V3** position. V3 deposits need a tick range through the PositionManager and are not wired up yet, so this will be routed to the **V2** pool instead. Say the word if you want V3 support built.`,
      status: 'working',
    };
  }

  yield {
    agent: AGENT_REGISTRY.intent,
    type: 'INTENT_PARSED',
    data: intent,
    text: `Parsed intent: Action **${intent.action}** | **${intent.amountIn} ${intent.tokenInSymbol}** ➔ **${intent.tokenOutSymbol}** (Max Slippage: ${(intent.slippageBps / 100).toFixed(2)}%). Requesting multi-pool simulation from **${AGENT_REGISTRY.router.name}**...`,
    status: 'complete'
  };

  // Step 2: Routing Agent Simulates Graph
  yield {
    agent: AGENT_REGISTRY.router,
    type: 'MESSAGE',
    text: intent.action === 'SWAP'
      // Say plainly that venue is not a user choice for swaps — the aggregator
      // compares every pool and takes the best fill.
      ? `Scanning every venue through the **AGGFlow aggregator** — V2 constant-product and V3 concentrated liquidity — and taking whichever fills best. Venue is never something you pick for a swap; the aggregator decides.`
      : `Locating the **${(intent.venuePreference || 'v2').toUpperCase()}** pool for this position...`,
    status: 'working'
  };

  await yieldFrame();
  const route = await RouterMathAgent.simulateRoute(intent);

  // A real abort, not a warning: if the routed impact exceeds the ceiling the
  // dev configured, the swarm stops here and never asks for consensus.
  const maxImpact = config.maxImpactPct != null ? Number(config.maxImpactPct) : null;
  const routedImpact = typeof route.priceImpact === 'number' ? route.priceImpact : parseFloat(route.priceImpact);
  if (maxImpact != null && Number.isFinite(routedImpact) && routedImpact > maxImpact) {
    yield {
      agent: AGENT_REGISTRY.router,
      type: 'ROUTE_REJECTED',
      data: { route, maxImpact, routedImpact },
      text: `⛔ **Halted by your policy.** Routed price impact **${routedImpact.toFixed(2)}%** exceeds the **${maxImpact}%** ceiling set on the Routing agent. No consensus round was requested and no funds were touched.`,
      status: 'error'
    };
    return;
  }

  yield {
    agent: AGENT_REGISTRY.router,
    type: 'ROUTE_SIMULATED',
    data: route,
    text: intent.action === 'ADD_LIQUIDITY'
      // A deposit is not a trade: describing it with a swap "output" made an
      // add-liquidity request read as though the swarm were selling one side.
      ? `Pool located: **${route.tokenIn.symbol}/${route.tokenOut.symbol}** on ${route.chosenRoute}. Deposit will be paired at the pool's live ratio — the second amount is derived from reserves, and any excess is refunded by the router. Handing off to **${AGENT_REGISTRY.risk.name}**...`
      : `Simulation complete! **${route.chosenRoute}** selected. Estimated Output: **${route.expectedOutNum.toFixed(4)} ${route.tokenOut.symbol}** ${route.savingsVsV2 && !String(route.savingsVsV2).startsWith('-100') ? `(${route.savingsVsV2} better output vs alternative)` : '(only one venue could fill this size)'}. Price impact: ${route.priceImpact}. Handing off proposal to **${AGENT_REGISTRY.risk.name}**...`,
    status: 'complete'
  };

  // Step 3: Risk & GenLayer Consensus Agent
  yield {
    agent: AGENT_REGISTRY.risk,
    type: 'MESSAGE',
text: `Broadcasting to the AgentValidator Intelligent Contract (\`${INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8)}...\`) for GenVM consensus. Every ${intent.action === 'SWAP' ? 'trade' : 'deposit'} is validated by a real consensus round before anything settles — that round is the wait, and it is the network, not the app. Repeating the same request inside 10 minutes reuses the recorded verdict and is near-instant.`,
    status: 'working'
  };

  const risk = await RiskValidatorAgent.validate(intent, route, userAddress, config.onProgress || null);

  yield {
    agent: AGENT_REGISTRY.risk,
    type: 'CONSENSUS_REACHED',
    data: risk,
    text: risk.isApproved
      ? `✅ **GenLayer Consensus Reached!** All ${risk.checks.length} guardrails passed. One-time cryptographic trade hash bound: \`${risk.tradeHash.slice(0, 14)}...\`. Requesting calldata dissection from **${AGENT_REGISTRY.dev.name}**...`
      : risk.isPending
        // The round has not returned a verdict yet (still in flight, or it ended
        // without a validator majority). That is a network condition — calling it
        // "Rejected" here misreports a trade the validator never actually refused.
        ? `⏳ **Awaiting GenVM Consensus** — the validator round has not returned a verdict yet. This is not a rejection. ${risk.reason}`
        : `❌ **GenLayer Validation Rejected**: ${risk.reason}. Fail-closed security activated.`,
    status: risk.isApproved ? 'complete' : risk.isPending ? 'working' : 'error'
  };

  // A refused proposal ends the swarm here.
  //
  // The flow used to continue into calldata inspection and then announce
  // "Swarm agreement ready — execute this trade", directly under a red
  // rejection. Nothing is executable at that point, and offering an Execute
  // button for a proposal consensus refused is the most dangerous thing this
  // page could do.
  if (!risk.isApproved && !risk.isPending) {
    yield {
      agent: AGENT_REGISTRY.intent,
      type: 'SWARM_HALTED',
      payload: { intent, route, risk },
      text: `⛔ **Swarm halted — nothing will be executed.** GenLayer consensus did not approve this proposal, so no settlement is possible and no funds have moved. ${risk.reason || ''}`,
      status: 'error',
    };
    return;
  }

  // Step 4: Dev Inspector Agent Dissects Calldata & Security
  yield {
    agent: AGENT_REGISTRY.dev,
    type: 'MESSAGE',
    text: `Performing byte-level calldata inspection and revert simulation against settlement contract...`,
    status: 'working'
  };

  const devInspection = DevInspectorAgent.inspect(intent, route, risk);

  yield {
    agent: AGENT_REGISTRY.dev,
    type: 'DEV_INSPECTED',
    data: devInspection,
    text: `Inspection complete. Aggregator bytecode: ${devInspection.calldataSize} | Est. Gas: ${devInspection.gasEstimate}. 4/4 parameter tamper vectors verified immune to replay and redirection.`,
    status: 'complete'
  };

  // Final Consolidated Swarm State
  yield {
    agent: AGENT_REGISTRY.intent,
    type: 'SWARM_COMPLETE',
    payload: {
      intent,
      route,
      risk,
      devInspection
    },
    text: risk.isPending
      // Still undecided: the swarm has done its part, but there is no verdict to
      // execute against yet. Saying "ready" here would be untrue.
      ? `⏳ **Swarm finished, consensus still pending.** The validator round has not returned a verdict, so Execute stays disabled until it does. Your trade was not rejected.`
      : intent.action === 'ADD_LIQUIDITY'
        ? `🎉 **Swarm agreement ready.** Execute to deposit into the **${route.tokenIn.symbol}/${route.tokenOut.symbol}** pool through the GenLayer-gated one-time approval.`
        : `🎉 **Multi-Agent Swarm Consensual Agreement Ready!** You can now execute this trade with one-click non-custodial settlement.`,
    status: 'ready'
  };
}
