// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AgentExecutor } from "../src/AgentExecutor.sol";
import { AgentExecutorBase } from "../src/base/AgentExecutorBase.sol";
import {
    IAGGFlowEntrypoint,
    IUniswapV2Router,
    IV3PositionManager
} from "../src/interfaces/IAgentExecutorDEX.sol";
import { TradeHashLib } from "../src/libraries/TradeHashLib.sol";

// ── Mock ERC-20 Token ────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ── Mock AGGFlow Entrypoint ──────────────────────────────────────────────────

contract MockAGGFlowEntrypoint is IAGGFlowEntrypoint {
    function executeSwapWithReceiver(
        SwapIntent calldata swapIntent,
        FeeCollection calldata,
        bytes calldata,
        address receiver
    ) external payable override returns (uint256 amountOut) {
        if (swapIntent.tokenUserSells != address(0)) {
            IERC20(swapIntent.tokenUserSells).transferFrom(msg.sender, address(this), swapIntent.amountUserSells);
        }
        amountOut = swapIntent.minAmountUserBuys + 50 * 10 ** 18; // Returns slightly more than min
        IERC20(swapIntent.tokenUserBuys).transfer(receiver, amountOut);
    }
}

// ── Mock V2 Router ───────────────────────────────────────────────────────────

contract MockV2Router is IUniswapV2Router {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external override returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);
        return (amountADesired, amountBDesired, 1000 * 10 ** 18);
    }

    function removeLiquidity(
        address,
        address,
        uint256,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256
    ) external override returns (uint256 amountA, uint256 amountB) {
        return (amountAMin, amountBMin);
    }
}

// ── Mock V3 Position Manager ─────────────────────────────────────────────────

contract MockV3PositionManager is IV3PositionManager {
    function mint(MintParams calldata params)
        external
        override
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        if (params.amount0Desired > 0) {
            IERC20(params.token0).transferFrom(msg.sender, address(this), params.amount0Desired);
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).transferFrom(msg.sender, address(this), params.amount1Desired);
        }
        return (1, 1000, params.amount0Desired, params.amount1Desired);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        override
        returns (uint256 amount0, uint256 amount1)
    {
        return (params.amount0Min, params.amount1Min);
    }

    function collect(CollectParams calldata params)
        external
        override
        returns (uint256 amount0, uint256 amount1)
    {
        return (0, 0);
    }
}

// ── Main Test Contract ───────────────────────────────────────────────────────

contract AgentSettlementApprovalTest is Test {
    AgentExecutor public executor;
    MockAGGFlowEntrypoint public mockEntrypoint;
    MockV2Router public mockV2Router;
    MockV3PositionManager public mockV3PositionManager;

    MockERC20 public tokenIn;
    MockERC20 public tokenOut;
    MockERC20 public tokenC;

    address public owner = address(0x1111);
    address public agent = address(0x2222);
    address public attacker = address(0x9999);
    address public user = address(0x3333);
    address public feeCollector = address(0x4444);

    uint256 public constant MAX_SLIPPAGE_BPS = 300; // 3%
    uint256 public constant AMOUNT_IN = 100 * 10 ** 18;
    uint256 public constant MIN_AMOUNT_OUT = 195 * 10 ** 18;
    uint256 public constant SLIPPAGE_BPS = 30; // 0.30%
    uint256 public deadline;

    function setUp() public {
        deadline = block.timestamp + 3600;

        mockEntrypoint = new MockAGGFlowEntrypoint();
        mockV2Router = new MockV2Router();
        mockV3PositionManager = new MockV3PositionManager();

        tokenIn = new MockERC20("USD Coin", "USDC");
        tokenOut = new MockERC20("Wrapped GEN", "WGEN");
        tokenC = new MockERC20("Tether USD", "USDT");

        address[] memory initialTokens = new address[](3);
        initialTokens[0] = address(tokenIn);
        initialTokens[1] = address(tokenOut);
        initialTokens[2] = address(tokenC);

        executor = new AgentExecutor(
            owner,
            agent,
            address(mockEntrypoint),
            address(mockV2Router),
            address(mockV3PositionManager),
            MAX_SLIPPAGE_BPS,
            initialTokens
        );

        // Fund user and mockEntrypoint
        tokenIn.mint(user, 10_000 * 10 ** 18);
        tokenOut.mint(address(mockEntrypoint), 10_000 * 10 ** 18);
        tokenC.mint(user, 10_000 * 10 ** 18);

        // User approves AgentExecutor to pull tokenIn
        vm.prank(user);
        tokenIn.approve(address(executor), type(uint256).max);
    }

    // ── 1. Success Path with One-Time Approval ────────────────────────────────

    function test_ExecuteSwap_Success() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // 1. Agent registers one-time approval for the exact trade parameters
        vm.prank(agent);
        executor.approveTrade(tradeHash);
        assertTrue(executor.isTradeApproved(tradeHash));

        uint256 userBalBefore = tokenOut.balanceOf(user);

        // 2. Agent executes the swap
        vm.prank(agent);
        uint256 amountOut = executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );

        // 3. User received the output tokens
        assertGt(amountOut, MIN_AMOUNT_OUT);
        assertEq(tokenOut.balanceOf(user) - userBalBefore, amountOut);

        // 4. Approval has been consumed (cannot be used again)
        assertFalse(executor.isTradeApproved(tradeHash));
    }

    // ── 2. Unapproved Trade Rejection ────────────────────────────────────────

    function test_RevertIf_TradeNotApproved() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Trade is NOT approved in executor
        assertFalse(executor.isTradeApproved(tradeHash));

        // Execution MUST revert with TradeNotApproved
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tradeHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    // ── 3. Parameter Tampering Rejections ────────────────────────────────────

    function test_RevertIf_ModifiedTrade_AmountIn() public {
        // Approve trade for AMOUNT_IN = 100 tokens
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Attacker attempts to settle with tampered amountIn = 150 tokens
        uint256 tamperedAmountIn = 150 * 10 ** 18;
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            tamperedAmountIn,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            tamperedAmountIn,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_MinAmountOut() public {
        // Approve trade for MIN_AMOUNT_OUT = 195 tokens
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Attacker attempts to lower minAmountOut to 50 tokens (abnormal slippage / sandwich exploit)
        uint256 tamperedMinOut = 50 * 10 ** 18;
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            tamperedMinOut,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            tamperedMinOut,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_User() public {
        // Approve trade for user
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Attacker attempts to divert proceeds to attacker address
        bytes32 tamperedHash = executor.getTradeHash(
            attacker,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            attacker,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_TokenIn() public {
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Attacker attempts to substitute tokenIn with tokenC
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenC),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenC),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_TokenOut() public {
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Attacker attempts to substitute tokenOut with tokenC
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenC),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenC),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_Deadline() public {
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Modify deadline
        uint256 modifiedDeadline = deadline + 600;
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            modifiedDeadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            modifiedDeadline,
            "",
            0,
            feeCollector
        );
    }

    function test_RevertIf_ModifiedTrade_SlippageBps() public {
        vm.prank(agent);
        executor.approveTradeWithParams(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // Modify slippage bps
        uint256 modifiedSlippage = 100;
        bytes32 tamperedHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            modifiedSlippage,
            deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tamperedHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            modifiedSlippage,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    // ── 4. Replay Attack Prevention (One-Time Approval) ──────────────────────

    function test_RevertIf_ReplayExecution_OneTimeApproval() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        // 1. Approve trade
        vm.prank(agent);
        executor.approveTrade(tradeHash);

        // 2. First execution succeeds
        vm.prank(agent);
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );

        // 3. Second execution (replay) MUST revert with TradeNotApproved
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tradeHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    // ── 5. Revocation Rejection ──────────────────────────────────────────────

    function test_RevertIf_RevokedApproval() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        executor.approveTrade(tradeHash);
        assertTrue(executor.isTradeApproved(tradeHash));

        // Agent revokes the approval
        vm.prank(agent);
        executor.revokeTradeApproval(tradeHash);
        assertFalse(executor.isTradeApproved(tradeHash));

        // Execution reverts
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, tradeHash));
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    // ── 6. Unauthorized Caller Rejections ────────────────────────────────────

    function test_RevertIf_UnauthorizedCallerApproves() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(attacker);
        vm.expectRevert(AgentExecutorBase.Unauthorized.selector);
        executor.approveTrade(tradeHash);
    }

    function test_RevertIf_UnauthorizedCallerExecutes() public {
        bytes32 tradeHash = executor.getTradeHash(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline
        );

        vm.prank(agent);
        executor.approveTrade(tradeHash);

        vm.prank(attacker);
        vm.expectRevert(AgentExecutorBase.Unauthorized.selector);
        executor.executeSwap(
            user,
            address(tokenIn),
            address(tokenOut),
            AMOUNT_IN,
            MIN_AMOUNT_OUT,
            SLIPPAGE_BPS,
            deadline,
            "",
            0,
            feeCollector
        );
    }

    // ── 7. Liquidity Operations One-Time Approval ────────────────────────────

    function test_LiquidityV2_OneTimeApprovalAndTamperRejection() public {
        uint256 amtA = 10 * 10 ** 18;
        uint256 amtB = 20 * 10 ** 18;
        uint256 minA = 9 * 10 ** 18;
        uint256 minB = 19 * 10 ** 18;

        tokenOut.mint(user, 100 * 10 ** 18);
        vm.prank(user);
        tokenOut.approve(address(executor), type(uint256).max);

        bytes32 opHash = executor.getLiquidityV2AddHash(
            user,
            address(tokenIn),
            address(tokenOut),
            amtA,
            amtB,
            minA,
            minB,
            deadline
        );

        // Unapproved reverts
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, opHash));
        executor.executeAddLiquidityV2(user, address(tokenIn), address(tokenOut), amtA, amtB, minA, minB, deadline);

        // Approve
        vm.prank(agent);
        executor.approveTrade(opHash);
        assertTrue(executor.isTradeApproved(opHash));

        // Execution consumes approval
        vm.prank(agent);
        executor.executeAddLiquidityV2(user, address(tokenIn), address(tokenOut), amtA, amtB, minA, minB, deadline);
        assertFalse(executor.isTradeApproved(opHash));

        // Replay reverts
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.TradeNotApproved.selector, opHash));
        executor.executeAddLiquidityV2(user, address(tokenIn), address(tokenOut), amtA, amtB, minA, minB, deadline);
    }
}
