// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import { IV3PositionManager } from "../interfaces/IAgentExecutorDEX.sol";
import { SwapOrder }          from "../types/SettlementTypes.sol";

// ============================================================================
//  TradeHashLib.sol
//  Soyara DEX · Deterministic Commitment Hashing
// ============================================================================
//
//  PURPOSE
//  -------
//  Derives the single identifier that GenLayer consensus approves and that the
//  executor later re-derives from the calldata it is actually settling. If the
//  two match, the trade on chain is bit-for-bit the trade the validators saw.
//
//  SECURITY PROPERTIES
//  -------------------
//  · abi.encode (never abi.encodePacked) — no dynamic-type concatenation
//    ambiguity between adjacent fields.
//  · A distinct type tag per operation, so a V2 remove-liquidity approval can
//    never be spent as a V3 mint even if every numeric field lines up.
//  · chainId and the executor address are mixed into every hash. A verdict is
//    therefore valid on exactly one contract on exactly one chain: replaying a
//    testnet approval against mainnet, or against a redeployed executor, yields
//    an identifier nothing has ever approved.
//  · For swaps the hash spans the WHOLE settlement surface, route and fee
//    included — see SettlementTypes.sol for why that matters.
//
// ============================================================================

library TradeHashLib {

    // ── Operation type tags ───────────────────────────────────────────────────
    //
    // Versioned: the swap tag moved to V2 when route, fee, quote and nonce
    // entered the commitment, so an identifier minted under the old seven-field
    // scheme cannot be presented to the new executor.

    bytes32 internal constant SWAP_TYPE      = keccak256("SOYARA_SWAP_V2");
    bytes32 internal constant V2_ADD_TYPE    = keccak256("SOYARA_V2_ADD_V2");
    bytes32 internal constant V2_REMOVE_TYPE = keccak256("SOYARA_V2_REMOVE_V2");
    bytes32 internal constant V3_ADD_TYPE    = keccak256("SOYARA_V3_ADD_V2");
    bytes32 internal constant V3_REMOVE_TYPE = keccak256("SOYARA_V3_REMOVE_V2");

    // ── Swap ──────────────────────────────────────────────────────────────────

    /**
     * @notice The consensus-approved identifier for a swap.
     * @dev Every field of `order` is covered, so there is no parameter left for
     *      a settlement agent to choose after the verdict is issued.
     * @param order    Full settlement surface, including routeHash, fee, fee
     *                 collector, router and the validated quote.
     * @param chainId  Chain the commitment is valid on.
     * @param executor Executor contract the commitment is valid on.
     */
    function swapCommitment(
        SwapOrder memory order,
        uint256 chainId,
        address executor
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(SWAP_TYPE, chainId, executor, order));
    }

    // ── V2 Liquidity ──────────────────────────────────────────────────────────

    /// @notice Commitment for a V2 add-liquidity operation.
    function v2AddHash(
        address user,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline,
        uint256 chainId,
        address executor
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                V2_ADD_TYPE, chainId, executor,
                user, tokenA, tokenB,
                amountADesired, amountBDesired,
                amountAMin, amountBMin,
                deadline
            )
        );
    }

    /// @notice Commitment for a V2 remove-liquidity operation.
    function v2RemoveHash(
        address user,
        address tokenA,
        address tokenB,
        address lpToken,
        uint256 lpAmount,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline,
        uint256 chainId,
        address executor
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                V2_REMOVE_TYPE, chainId, executor,
                user, tokenA, tokenB,
                lpToken, lpAmount,
                amountAMin, amountBMin,
                deadline
            )
        );
    }

    // ── V3 Liquidity ──────────────────────────────────────────────────────────

    /// @notice Commitment for a V3 mint (add liquidity) operation.
    function v3AddHash(
        address user,
        IV3PositionManager.MintParams calldata p,
        uint256 chainId,
        address executor
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                V3_ADD_TYPE, chainId, executor,
                user,
                p.token0, p.token1, p.fee,
                p.tickLower, p.tickUpper,
                p.amount0Desired, p.amount1Desired,
                p.amount0Min, p.amount1Min,
                p.deadline
            )
        );
    }

    /// @notice Commitment for a V3 decrease-liquidity (remove liquidity) operation.
    ///
    /// @dev token0/token1 are included even though the withdrawal itself is
    ///      determined by tokenId. The executor reads them to enforce the token
    ///      whitelist, which makes them inputs to whether the call is permitted;
    ///      leaving them out of the commitment would let a relayer satisfy that
    ///      check with any whitelisted pair rather than the position's own.
    ///      Every value the executor acts on belongs in the identifier.
    function v3RemoveHash(
        address user,
        IV3PositionManager.DecreaseLiquidityParams calldata p,
        uint256 tokenId,
        address token0,
        address token1,
        uint256 chainId,
        address executor
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                V3_REMOVE_TYPE, chainId, executor,
                user, tokenId,
                token0, token1,
                p.liquidity,
                p.amount0Min, p.amount1Min,
                p.deadline
            )
        );
    }
}
