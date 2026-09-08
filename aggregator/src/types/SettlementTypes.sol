// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  SettlementTypes.sol
//  Soyara DEX · The complete settlement surface of an agent-executed swap
// ============================================================================
//
//  WHY THIS STRUCT EXISTS
//  ----------------------
//  A GenLayer consensus verdict is only worth as much as the set of facts it
//  covers. The previous design hashed seven fields — user, tokenIn, tokenOut,
//  amountIn, minAmountOut, slippageBps, deadline — and left the three that
//  actually decide where the money goes as free parameters on the execution
//  call:
//
//      · aggProgram   the route the aggregator walks
//      · feeBps       how much is skimmed off the top
//      · feeCollector who receives that skim
//
//  So a settlement agent holding an approval for an honest trade could execute
//  it down a hostile route, or with feeBps set to 9_000 paid to an address it
//  controls, and every on-chain check still passed. `SwapOrder` closes that by
//  making the commitment cover EVERY input to the transfer of value, so the
//  consensus-approved identifier and the executed trade are the same object.
//
//  FIELD NOTES
//  -----------
//  quotedAmountOut  The live pool quote the validators checked this order
//                   against. Binding it lets the executor verify on-chain that
//                   `minAmountOut` is genuinely the declared slippage below the
//                   validated quote, rather than a floor the agent lowered on
//                   its own after consensus had spoken.
//
//  routeHash        keccak256(aggProgram). The program itself is calldata and
//                   can be large; its hash pins it into the commitment at
//                   constant cost, and the executor re-derives and compares it.
//
//  router           The entrypoint that must perform the swap. Pinning it stops
//                   an approval issued against the audited aggregator from being
//                   replayed through a router swapped in later.
//
//  nonce            Distinguishes two otherwise identical intents. Without it a
//                   user who legitimately wants to make the same trade twice in
//                   one block produces one commitment for both, and the second
//                   can never obtain its own verdict.
//
// ============================================================================

struct SwapOrder {
    address user;
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 minAmountOut;
    uint256 quotedAmountOut;
    uint256 slippageBps;
    uint256 deadline;
    address router;
    uint256 feeBps;
    address feeCollector;
    bytes32 routeHash;
    uint256 nonce;
}
