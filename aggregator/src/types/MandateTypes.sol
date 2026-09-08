// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  MandateTypes.sol
//  Soyara DEX · Paying for consensus once instead of once per trade
// ============================================================================
//
//  THE PROBLEM THIS SOLVES
//  -----------------------
//  A GenLayer verdict reaches the EVM as an external message, and those are
//  delivered only when the consensus round FINALIZES. On Bradbury that is the
//  appeal window, fifteen to twenty-five minutes. The py-genlayer SDK offers an
//  `on` parameter ("accepted" or "finalized") for IC-to-IC messages, but the
//  EthSend payload carries only address, calldata and value - there is no way
//  to deliver an EVM-bound verdict earlier, and that is deliberate: an appealed
//  round must not leave an irreversible verdict on the EVM.
//
//  So per-trade consensus, authenticated on chain at settlement, cannot be
//  fast. Every trade would put the appeal window in front of the user, which is
//  not a usable exchange.
//
//  WHAT A MANDATE CHANGES
//  ----------------------
//  Consensus approves a bounded POLICY once. That single round pays the
//  finalization cost, in the background, once. Afterwards each trade settles
//  immediately, and the executor checks it against the mandate on chain.
//
//  What is deliberately NOT given up: the executor still refuses anything
//  GenLayer did not authorise, and it still verifies each individual trade
//  rather than trusting the relayer. The difference is what consensus approves
//  - a bounded authority rather than one exact order.
//
//  HONESTY ABOUT THE TRADE-OFF
//  ---------------------------
//  A per-order commitment binds one exact trade: route, fee, collector,
//  recipient, quote, deadline, nonce. A mandate binds a user, a pair, a
//  direction, ceilings on size, slippage and fee, and an expiry. Within those
//  bounds the agent chooses the individual trade.
//
//  That is weaker per trade, and it is stated rather than hidden. But it is
//  paired with something the per-order design did NOT have: the executor
//  computes the expected output ITSELF from live pool reserves and enforces the
//  slippage band against its own number. Under the old design the quote was
//  supplied by the validators and the executor could only check internal
//  consistency. Here the chain checks the price.

struct TradingMandate {
    address user;          // who the mandate is for; nobody else can spend it
    address tokenIn;       // exact pair and direction. A mandate to sell USDC
    address tokenOut;      // for WGEN never authorises the reverse.
    uint256 maxAmountIn;   // per-trade ceiling
    uint256 totalBudgetIn; // lifetime ceiling across every trade under it
    uint256 spentIn;       // consumed so far; enforced against totalBudgetIn
    uint256 maxSlippageBps;// tightest protection the agent may offer the user
    uint256 maxFeeBps;     // ceiling on what may be skimmed
    address feeCollector;  // the only address that may receive the fee
    address router;        // the only entrypoint that may execute
    bytes32 routeHash;     // keccak256 of the ONLY route program permitted
    address pool;          // the pool the executor prices against, pinned here
    uint64  expiry;        // wall-clock end of authority
    bool    revoked;       // owner or validator kill switch
}

// ============================================================================
//  WHY routeHash AND pool ARE IN HERE
// ============================================================================
//
//  The review asked to "bind every route, fee, user, and post-validation quote
//  parameter to the consensus-approved identifier". Without these two fields a
//  mandate bound the user, the fee, the collector and the router - but left the
//  aggregator program free for the agent to choose per trade. That is the exact
//  hole the per-order commitment was built to close, reopened.
//
//  A single-hop V2 route is stable for the life of a mandate: the same pair,
//  the same direction, the same pool, so the same program bytes. The validators
//  therefore derive that program during the consensus round, and its hash goes
//  into the mandate. Per trade the executor requires
//  keccak256(aggProgram) == mandate.routeHash, so the route is bound to the
//  consensus-approved identifier exactly as it is for a single order.
//
//  `pool` is pinned for the same reason and is what the executor prices
//  against. Together they mean the agent chooses only ONE thing about a trade:
//  its size, within a ceiling consensus set.
//
//  On the quote, which is the one place this differs from the per-order design:
//  a per-order commitment binds a quote the validators computed BEFORE
//  settlement, and the executor can only check that minAmountOut is consistent
//  with it. Here the executor reads the pinned pool's live reserves AT
//  settlement and derives the expected output itself. There is no pre-validated
//  number to go stale, and no supplied figure to trust. For quote honesty that
//  is stronger, not weaker.
// ============================================================================
