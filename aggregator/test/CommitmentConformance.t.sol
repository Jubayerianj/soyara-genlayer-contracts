// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { TradeHashLib } from "../src/libraries/TradeHashLib.sol";
import { SwapOrder } from "../src/types/SettlementTypes.sol";
import { IV3PositionManager } from "../src/interfaces/IAgentExecutorDEX.sol";

// ============================================================================
//  CommitmentConformance.t.sol
//
//  The commitment is computed in two languages: here in Solidity, and in Python
//  inside the AgentValidator Intelligent Contract. If the two ever disagree the
//  failure is silent and total - the IC records a verdict under one identifier,
//  the executor derives another, and every settlement reverts as unapproved
//  with nothing in either log explaining why.
//
//  This suite pins the encoding with a fixed vector. The matching Python side
//  lives in genlayer-inteligent-contracts/test_commitment_conformance.py, which
//  asserts the same constants. Change the struct or the tag and both fail.
// ============================================================================

contract CommitmentConformanceTest is Test {

    // A FROZEN TEST VECTOR, not the live deployment. Its only job is to be the
    // same 20 bytes on both sides of the language boundary, so that a change to
    // the struct or the type tag breaks Solidity and Python identically. The
    // deployed executor is 0x0F1E9857... (see DEPLOYMENTS.md); changing this
    // constant to match it would silently rebase every expected hash below.
    address constant EXECUTOR = 0xa835c0a86dD64726eF23D83a8ca7D60b542EE2e4;
    uint256 constant CHAIN_ID = 4221;

    function _vector() internal pure returns (SwapOrder memory) {
        return SwapOrder({
            user:            0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2,
            tokenIn:         0x58B6CD7891cd0A682226E25607b958a6479195A6, // USDC
            tokenOut:        0x315374AA9b5536037Cc1Efeea2439CCC0913A77e, // WGEN
            amountIn:        1_000_000,
            minAmountOut:    994_000_000_000_000_000,
            quotedAmountOut: 1_000_000_000_000_000_000,
            slippageBps:     30,
            deadline:        1_800_000_000,
            router:          0x95feE6Cb918Ed9C621E36082EE8D998873031EaA,
            feeBps:          5,
            feeCollector:    0x48234eD645676b794a4CbC7483513e58cB04e22E,
            routeHash:       keccak256(hex"02315374aa9b5536037cc1efeea2439ccc0913a77e"),
            nonce:           1
        });
    }

    /// The exact preimage abi.encode produces, so the Python side can build the
    /// same bytes rather than guessing whether the struct is inlined.
    function test_LogPreimageAndCommitment() public pure {
        SwapOrder memory order = _vector();
        bytes memory preimage = abi.encode(TradeHashLib.SWAP_TYPE, CHAIN_ID, EXECUTOR, order);

        console2.log("preimage length:", preimage.length);
        console2.logBytes(preimage);
        console2.logBytes32(keccak256(preimage));
        console2.logBytes32(TradeHashLib.swapCommitment(order, CHAIN_ID, EXECUTOR));
        console2.logBytes32(TradeHashLib.SWAP_TYPE);
        console2.logBytes32(order.routeHash);
    }

    /// A static struct must be inlined by abi.encode, with no offset word. If
    /// that ever stopped being true the Python encoder would be silently wrong.
    function test_StructIsEncodedInline() public pure {
        SwapOrder memory order = _vector();
        bytes memory preimage = abi.encode(TradeHashLib.SWAP_TYPE, CHAIN_ID, EXECUTOR, order);

        // 3 leading words + 13 struct fields, every one of them static.
        assertEq(preimage.length, 32 * 16, "SwapOrder must encode as 13 inline words");

        // Spot-check that field 4 (the first struct member) really is `user`.
        bytes32 word;
        assembly { word := mload(add(preimage, add(32, mul(3, 32)))) }
        assertEq(address(uint160(uint256(word))), order.user, "word 3 must be order.user");
    }

    /// The frozen vector. The Python encoder in AgentValidator.py asserts this
    /// same value, so the two implementations cannot drift apart unnoticed.
    function test_CommitmentMatchesFrozenVector() public pure {
        assertEq(
            TradeHashLib.swapCommitment(_vector(), CHAIN_ID, EXECUTOR),
            0x1411afb0e1aee4db138052565fa8136bb9ed1d333e35caf67b8ce1759ddababe,
            "commitment drifted from the frozen vector - update the Python side too"
        );
    }

    // ── Liquidity commitments ────────────────────────────────────────────────
    //
    // Liquidity settles through the same verdict registry, so its identifiers
    // need the same cross-language guarantee.

    address constant LIQ_USER = 0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2;
    address constant TOKEN_A  = 0x58B6CD7891cd0A682226E25607b958a6479195A6;
    address constant TOKEN_B  = 0x315374AA9b5536037Cc1Efeea2439CCC0913A77e;
    address constant LP_TOKEN = 0x4680BCe1632824d30D2F53656dD610736c3e312e;

    /// Frozen, and asserted identically by the Python side.
    function test_LiquidityCommitmentsMatchFrozenVectors() public pure {
        assertEq(
            TradeHashLib.v2AddHash(
                LIQ_USER, TOKEN_A, TOKEN_B,
                100e18, 200e18, 99e18, 198e18,
                1_800_000_000, CHAIN_ID, EXECUTOR
            ),
            0x100ccfa86be1e9f1e4709e7207f585d9772bf01063b5fb4a9e55e63f7b4ce317,
            "v2 add commitment drifted"
        );
        assertEq(
            TradeHashLib.v2RemoveHash(
                LIQ_USER, TOKEN_A, TOKEN_B,
                LP_TOKEN, 50e18, 49e18, 98e18,
                1_800_000_000, CHAIN_ID, EXECUTOR
            ),
            0xa98a357b82137940e9309315904cecd862ed1fdc96506ba17c81df9f190050d8,
            "v2 remove commitment drifted"
        );
    }

    function test_LogLiquidityCommitments() public pure {
        console2.logBytes32(
            TradeHashLib.v2AddHash(
                LIQ_USER, TOKEN_A, TOKEN_B,
                100e18, 200e18, 99e18, 198e18,
                1_800_000_000, CHAIN_ID, EXECUTOR
            )
        );
        console2.logBytes32(
            TradeHashLib.v2RemoveHash(
                LIQ_USER, TOKEN_A, TOKEN_B,
                LP_TOKEN, 50e18, 49e18, 98e18,
                1_800_000_000, CHAIN_ID, EXECUTOR
            )
        );
    }

    // ── V3 liquidity commitments ─────────────────────────────────────────────
    //
    // Negative ticks are the ordinary case for a range below spot, and Solidity
    // sign-extends int24 across the full word. A Python encoder that treated the
    // tick as unsigned would agree on every positive-range position and diverge
    // on exactly the ones users actually open, so the vector below uses a
    // negative lower tick deliberately.

    function v3AddVector() external view returns (bytes32) {
        IV3PositionManager.MintParams memory p = IV3PositionManager.MintParams({
            token0:         TOKEN_A,
            token1:         TOKEN_B,
            fee:            3000,
            tickLower:      -887220,
            tickUpper:      887220,
            amount0Desired: 100e18,
            amount1Desired: 200e18,
            amount0Min:     99e18,
            amount1Min:     198e18,
            recipient:      address(0xdead), // deliberately NOT in the hash
            deadline:       1_800_000_000
        });
        return this.v3AddOf(LIQ_USER, p);
    }

    function v3AddOf(address user, IV3PositionManager.MintParams calldata p)
        external pure returns (bytes32)
    {
        return TradeHashLib.v3AddHash(user, p, CHAIN_ID, EXECUTOR);
    }

    function v3RemoveVector() external view returns (bytes32) {
        IV3PositionManager.DecreaseLiquidityParams memory p =
            IV3PositionManager.DecreaseLiquidityParams({
                tokenId:    4242,
                liquidity:  123456789,
                amount0Min: 49e18,
                amount1Min: 98e18,
                deadline:   1_800_000_000
            });
        return this.v3RemoveOf(LIQ_USER, p, 4242, TOKEN_A, TOKEN_B);
    }

    function v3RemoveOf(
        address user,
        IV3PositionManager.DecreaseLiquidityParams calldata p,
        uint256 tokenId,
        address token0,
        address token1
    ) external pure returns (bytes32) {
        return TradeHashLib.v3RemoveHash(user, p, tokenId, token0, token1, CHAIN_ID, EXECUTOR);
    }

    function test_LogV3Commitments() public view {
        console2.logBytes32(this.v3AddVector());
        console2.logBytes32(this.v3RemoveVector());
    }

    /// Frozen, and asserted identically by the Python side.
    function test_V3CommitmentsMatchFrozenVectors() public view {
        assertEq(
            this.v3AddVector(),
            0xca6521d598a543cd272f47488f3d4bb16406b73304b6208dabe4bd47c4307f4a,
            "v3 add commitment drifted"
        );
        assertEq(
            this.v3RemoveVector(),
            0xdd2fd08b01d28a42b45e4b961a8867fd8efd47feb9984df910192a0988fece2d,
            "v3 remove commitment drifted"
        );
    }

    /// The recipient is overridden to `user` by the executor, so binding it would
    /// make the commitment depend on a value that cannot affect the outcome.
    function test_V3AddIgnoresRecipient() public view {
        IV3PositionManager.MintParams memory a = IV3PositionManager.MintParams({
            token0: TOKEN_A, token1: TOKEN_B, fee: 3000,
            tickLower: -887220, tickUpper: 887220,
            amount0Desired: 100e18, amount1Desired: 200e18,
            amount0Min: 99e18, amount1Min: 198e18,
            recipient: address(0xdead), deadline: 1_800_000_000
        });
        IV3PositionManager.MintParams memory b = a;
        b.recipient = address(0xbeef);
        assertEq(this.v3AddOf(LIQ_USER, a), this.v3AddOf(LIQ_USER, b));
    }

    /// But the tokens the executor whitelist-checks on removal MUST be bound.
    function test_V3RemoveBindsTokens() public view {
        IV3PositionManager.DecreaseLiquidityParams memory p =
            IV3PositionManager.DecreaseLiquidityParams({
                tokenId: 4242, liquidity: 123456789,
                amount0Min: 49e18, amount1Min: 98e18, deadline: 1_800_000_000
            });
        assertTrue(
            this.v3RemoveOf(LIQ_USER, p, 4242, TOKEN_A, TOKEN_B)
                != this.v3RemoveOf(LIQ_USER, p, 4242, TOKEN_A, LP_TOKEN),
            "token1 must change the commitment"
        );
    }

    /// The tag is what separates a swap approval from a liquidity approval, and
    /// the V2 suffix is what stops an identifier minted under the old
    /// seven-field scheme from being presented to this executor.
    function test_SwapTypeTagIsFrozen() public pure {
        assertEq(
            TradeHashLib.SWAP_TYPE,
            keccak256("SOYARA_SWAP_V2"),
            "swap type tag changed"
        );
    }
}
