// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  MandateBindings.t.sol
//
//  The review asked for one thing, in two halves:
//
//    "authenticate the verdict at settlement, and bind every route, fee, user,
//     and post-validation quote parameter to the consensus-approved identifier"
//
//  A mandate is a consensus-approved identifier that authorises MANY trades,
//  which is the only way to keep settlement fast: an EVM-bound verdict is
//  delivered on finalization and nothing an IC does can hurry it, so per-trade
//  consensus means the appeal window in front of every trade.
//
//  The question that matters is whether the bindings survive that change. This
//  suite answers it one parameter at a time, and each test is named after the
//  word in the review it corresponds to.
// ============================================================================

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AgentExecutor }     from "../src/AgentExecutor.sol";
import { AgentExecutorBase } from "../src/base/AgentExecutorBase.sol";
import {
    IAGGFlowEntrypoint,
    IUniswapV2Router,
    IV3PositionManager
} from "../src/interfaces/IAgentExecutorDEX.sol";

contract MToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// A constant-product pair the executor can price against.
contract MPair {
    address public token0;
    address public token1;
    uint112 private r0;
    uint112 private r1;
    constructor(address a, address b, uint112 ra, uint112 rb) {
        (token0, token1) = a < b ? (a, b) : (b, a);
        (r0, r1)         = a < b ? (ra, rb) : (rb, ra);
    }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, 0); }
}

contract MFactory {
    mapping(address => mapping(address => address)) public pairs;
    function setPair(address a, address b, address p) external { pairs[a][b] = p; pairs[b][a] = p; }
    function getPair(address a, address b) external view returns (address) { return pairs[a][b]; }
}

/// Pays out whatever it is asked for, so these tests isolate the EXECUTOR's
/// checks rather than an AMM's.
contract MEntry is IAGGFlowEntrypoint {
    function executeSwap(SwapIntent calldata i, FeeCollection calldata, bytes calldata)
        external payable returns (uint256)
    { MToken(i.tokenUserBuys).mint(msg.sender, i.minAmountUserBuys); return i.minAmountUserBuys; }

    function executeSwapWithReceiver(SwapIntent calldata i, FeeCollection calldata, bytes calldata, address to)
        external payable returns (uint256)
    { MToken(i.tokenUserBuys).mint(to, i.minAmountUserBuys); return i.minAmountUserBuys; }
}

contract MRouter is IUniswapV2Router {
    function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)
        external pure returns (uint256,uint256,uint256) { return (0,0,0); }
    function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)
        external pure returns (uint256,uint256) { return (0,0); }
}

contract MPosMgr is IV3PositionManager {
    function mint(MintParams calldata) external returns (uint256,uint128,uint256,uint256) { return (0,0,0,0); }
    function decreaseLiquidity(DecreaseLiquidityParams calldata) external returns (uint256,uint256) { return (0,0); }
    function collect(CollectParams calldata) external returns (uint256,uint256) { return (0,0); }
    function positions(uint256) external pure
        returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)
    { return (0,address(0),address(0),address(0),0,0,0,0,0,0,0,0); }
}

contract MandateBindingsTest is Test {
    AgentExecutor executor;
    MToken tokenIn;
    MToken tokenOut;
    MPair  pair;
    MFactory factory;
    MEntry entry;

    address owner     = makeAddr("owner");
    address agent     = makeAddr("agent");
    address user      = makeAddr("user");
    address attacker  = makeAddr("attacker");
    address collector = makeAddr("collector");
    address validator = address(0x5555);

    bytes   ROUTE   = hex"02aabbcc";
    bytes32 RHASH;
    bytes32 constant MID = keccak256("mandate-1");

    uint256 constant RESERVE_IN  = 3_000e18;
    uint256 constant RESERVE_OUT = 3e18;

    function setUp() public {
        RHASH = keccak256(ROUTE);

        tokenIn  = new MToken("In", "IN");
        tokenOut = new MToken("Out", "OUT");
        entry    = new MEntry();
        factory  = new MFactory();
        pair     = new MPair(address(tokenIn), address(tokenOut), uint112(RESERVE_IN), uint112(RESERVE_OUT));
        factory.setPair(address(tokenIn), address(tokenOut), address(pair));

        address[] memory toks = new address[](2);
        toks[0] = address(tokenIn);
        toks[1] = address(tokenOut);

        executor = new AgentExecutor(
            owner, agent, address(entry), address(new MRouter()), address(new MPosMgr()), 300, toks
        );

        // A ghost contract always has code; the executor refuses a codeless
        // validator, so the fixture address needs some.
        vm.etch(validator, hex"600060005260206000f3");
        vm.startPrank(owner);
        executor.setGenLayerValidator(validator);
        executor.setV2Factory(address(factory));
        vm.stopPrank();

        tokenIn.mint(user, 1_000_000e18);
        vm.prank(user);
        tokenIn.approve(address(executor), type(uint256).max);

        _record();
    }

    function _record() internal {
        vm.prank(validator);
        executor.recordMandate(
            uint256(MID), user, address(tokenIn), address(tokenOut),
            100e18,      // per-trade ceiling
            500e18,      // lifetime budget
            100,         // 1% max slippage
            5,           // 5 bps max fee
            collector, address(entry),
            uint256(RHASH), address(pair),
            uint64(block.timestamp + 1 days)
        );
    }

    /// The expected output the executor should derive for `amountIn`.
    function _expected(uint256 amountIn, uint256 feeBps) internal pure returns (uint256) {
        uint256 routeInput = (amountIn * (10_000 - feeBps)) / 10_000;
        uint256 inWithFee  = routeInput * 997;
        return (inWithFee * RESERVE_OUT) / (RESERVE_IN * 1000 + inWithFee);
    }

    // ── "authenticate the verdict at settlement" ──────────────────────────────

    function test_OnlyTheValidatorCanCreateAuthority() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NotValidator.selector, agent));
        executor.recordMandate(
            uint256(keccak256("forged")), attacker, address(tokenIn), address(tokenOut),
            1e18, 1e18, 100, 5, attacker, address(entry), uint256(RHASH), address(pair),
            uint64(block.timestamp + 1 days)
        );
    }

    function test_OwnerCannotCreateAuthorityEither() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NotValidator.selector, owner));
        executor.recordMandate(
            uint256(keccak256("forged2")), attacker, address(tokenIn), address(tokenOut),
            1e18, 1e18, 100, 5, attacker, address(entry), uint256(RHASH), address(pair),
            uint64(block.timestamp + 1 days)
        );
    }

    function test_SettlingWithoutAMandateReverts() public {
        bytes32 unknown = keccak256("no-such-mandate");
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoMandate.selector, unknown));
        executor.executeSwapUnderMandate(unknown, 1e18, 0, 5, ROUTE);
    }

    // ── "bind every ROUTE ..." ────────────────────────────────────────────────

    function test_RouteIsBound() public {
        bytes memory hostile = hex"02ffffff";
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.RouteMismatch.selector, RHASH, keccak256(hostile))
        );
        executor.executeSwapUnderMandate(MID, 1e18, 0, 5, hostile);
    }

    // ── "... FEE ..." ─────────────────────────────────────────────────────────

    function test_FeeCeilingIsBound() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.FeeTooHigh.selector, uint256(900), uint256(5)));
        executor.executeSwapUnderMandate(MID, 1e18, 0, 900, ROUTE);
    }

    // ── "... USER ..." ────────────────────────────────────────────────────────

    function test_OutputGoesToTheMandateUserOnly() public {
        uint256 amountIn = 1e18;
        uint256 expected = _expected(amountIn, 5);

        uint256 before = tokenOut.balanceOf(user);
        vm.prank(agent);
        executor.executeSwapUnderMandate(MID, amountIn, expected, 5, ROUTE);

        assertGt(tokenOut.balanceOf(user), before, "the mandate's user must receive the output");
        assertEq(tokenOut.balanceOf(attacker), 0, "nobody else may");
    }

    // ── "... and POST-VALIDATION QUOTE parameter" ─────────────────────────────
    //
    //  Stronger here than in the per-order design: the executor derives the
    //  expected output from the pinned pool's live reserves at settlement,
    //  rather than checking a number the validators supplied earlier.

    function test_ExecutorPricesTheTradeItself() public {
        uint256 amountIn = 10e18;
        uint256 expected = _expected(amountIn, 5);

        // A floor below the mandate's slippage band is refused, even though the
        // agent is the one proposing it.
        uint256 tooLow = (expected * 8_000) / 10_000; // 20% below
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.QuoteInconsistent.selector, tooLow, expected)
        );
        executor.executeSwapUnderMandate(MID, amountIn, tooLow, 5, ROUTE);

        // At the band it settles.
        uint256 atBand = (expected * 9_900) / 10_000;
        vm.prank(agent);
        executor.executeSwapUnderMandate(MID, amountIn, atBand, 5, ROUTE);
    }

    // ── The ceilings that make a mandate bounded ──────────────────────────────

    function test_PerTradeCeilingIsEnforced() public {
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.MandateAmountExceeded.selector, uint256(101e18), uint256(100e18))
        );
        executor.executeSwapUnderMandate(MID, 101e18, 0, 5, ROUTE);
    }

    function test_LifetimeBudgetIsEnforced() public {
        // Five trades of 100 exhaust the 500 budget; the sixth must fail.
        for (uint256 i = 0; i < 5; i++) {
            uint256 exp = _expected(100e18, 5);
            vm.prank(agent);
            executor.executeSwapUnderMandate(MID, 100e18, (exp * 9_900) / 10_000, 5, ROUTE);
        }
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.MandateBudgetExceeded.selector, uint256(600e18), uint256(500e18))
        );
        executor.executeSwapUnderMandate(MID, 100e18, 0, 5, ROUTE);
    }

    function test_ReRecordingCannotRefillASpentBudget() public {
        uint256 exp = _expected(100e18, 5);
        vm.prank(agent);
        executor.executeSwapUnderMandate(MID, 100e18, (exp * 9_900) / 10_000, 5, ROUTE);

        _record(); // the validator re-records the same id

        (,,,,, uint256 spentIn,,,,,,,,) = executor.mandates(MID);
        assertEq(spentIn, 100e18, "a re-record must not reset what has been drawn");
    }

    function test_ExpiryEndsTheAuthority() public {
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.MandateExpired.selector, MID));
        executor.executeSwapUnderMandate(MID, 1e18, 0, 5, ROUTE);
    }

    function test_RevocationStopsItImmediately() public {
        vm.prank(owner);
        executor.revokeMandate(MID);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.MandateRevokedError.selector, MID));
        executor.executeSwapUnderMandate(MID, 1e18, 0, 5, ROUTE);
    }

    function test_OnlyAnAgentCanRelay() public {
        vm.prank(attacker);
        vm.expectRevert(AgentExecutorBase.Unauthorized.selector);
        executor.executeSwapUnderMandate(MID, 1e18, 0, 5, ROUTE);
    }
}
