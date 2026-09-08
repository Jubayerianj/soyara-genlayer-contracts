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
import { SwapOrder } from "../src/types/SettlementTypes.sol";

// ============================================================================
//  What this suite is actually asserting
//  -------------------------------------
//  The old suite proved that a trade could not be tampered with AFTER the agent
//  had approved it. That left the important question untested: who gets to
//  approve in the first place? It was the agent, so every guarantee reduced to
//  "the agent's key is honest".
//
//  These tests assert the stronger property. Section 1 shows no operator key can
//  create an approval. Section 2 shows the identifier consensus signs off on now
//  spans the route, the fee, the fee collector and the validated quote, so an
//  agent holding a real verdict still cannot redirect the money. Section 3
// ============================================================================

// ── Mock ERC-20 Token ────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ── Mock AGGFlow Entrypoint ──────────────────────────────────────────────────

contract MockAGGFlowEntrypoint is IAGGFlowEntrypoint {
    /// Records what the executor actually asked the aggregator to do, so tests
    /// can assert the fee and route reaching the router are the approved ones.
    bytes   public lastProgram;
    uint256 public lastFeeBps;
    address public lastFeeCollector;

    function executeSwapWithReceiver(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program,
        address receiver
    ) external payable override returns (uint256 amountOut) {
        lastProgram      = program;
        lastFeeBps       = feeCollection.feeBps;
        lastFeeCollector = feeCollection.feeCollectorAddress;

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

    /// Stands in for the AgentValidator Intelligent Contract. On GenLayer the
    /// IC's external messages arrive from its ghost contract, which shares the
    /// IC's address, so `vm.prank(validator)` is a faithful model of that call.
    address public validator = address(0x5555);

    uint256 public constant MAX_SLIPPAGE_BPS = 300; // 3%
    uint256 public constant AMOUNT_IN = 100 * 10 ** 18;
    uint256 public constant MIN_AMOUNT_OUT = 195 * 10 ** 18;
    /// The live pool quote the validators checked. minAmountOut sits exactly one
    /// slippage band below it, which is the relationship the executor enforces.
    uint256 public constant QUOTED_AMOUNT_OUT = 1955 * 10 ** 17; // 195.5e18
    uint256 public constant SLIPPAGE_BPS = 30; // 0.30%
    uint256 public constant FEE_BPS = 5;       // 0.05% platform fee
    uint256 public deadline;

    bytes public constant ROUTE = hex"c0ffee01";

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

        // A GenLayer IC reaches the EVM through its ghost, and a ghost is a
        // contract, so the executor now refuses a codeless validator. Give the
        // fixture address code so it can stand in for one.
        vm.etch(validator, hex"600060005260206000f3");

        vm.prank(owner);
        executor.setGenLayerValidator(validator);

        // Fund user and mockEntrypoint
        tokenIn.mint(user, 10_000 * 10 ** 18);
        tokenOut.mint(address(mockEntrypoint), 10_000 * 10 ** 18);
        tokenC.mint(user, 10_000 * 10 ** 18);

        // User approves AgentExecutor to pull tokenIn
        vm.prank(user);
        tokenIn.approve(address(executor), type(uint256).max);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _order() internal view returns (SwapOrder memory) {
        return SwapOrder({
            user:            user,
            tokenIn:         address(tokenIn),
            tokenOut:        address(tokenOut),
            amountIn:        AMOUNT_IN,
            minAmountOut:    MIN_AMOUNT_OUT,
            quotedAmountOut: QUOTED_AMOUNT_OUT,
            slippageBps:     SLIPPAGE_BPS,
            deadline:        deadline,
            router:          address(mockEntrypoint),
            feeBps:          FEE_BPS,
            feeCollector:    feeCollector,
            routeHash:       keccak256(ROUTE),
            nonce:           1
        });
    }

    /// Model of a completed GenLayer consensus round approving `order`.
    function _recordVerdict(SwapOrder memory order) internal returns (bytes32 commitment) {
        commitment = executor.getSwapCommitment(order);
        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(deadline));
    }

    function _settle(SwapOrder memory order) internal returns (uint256) {
        vm.prank(agent);
        return executor.executeSwap(order, ROUTE);
    }

    // =========================================================================
    //  1. THE VERDICT IS THE CONTRACT'S TO ENFORCE, NOT THE AGENT'S
    // =========================================================================

    /// The central regression: the settlement agent has no way to authorise
    /// anything. Previously it called approveTradeWithParams and the trade went
    /// through; that function no longer exists, and the registry behind it is
    /// closed to every key the operator holds.
    function test_Agent_CannotRecordVerdict() public {
        bytes32 commitment = executor.getSwapCommitment(_order());

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NotValidator.selector, agent));
        executor.recordVerdict(uint256(commitment), uint64(deadline));
    }

    function test_Owner_CannotRecordVerdict() public {
        bytes32 commitment = executor.getSwapCommitment(_order());

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NotValidator.selector, owner));
        executor.recordVerdict(uint256(commitment), uint64(deadline));
    }

    function test_Attacker_CannotRecordVerdict() public {
        bytes32 commitment = executor.getSwapCommitment(_order());

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NotValidator.selector, attacker));
        executor.recordVerdict(uint256(commitment), uint64(deadline));
    }

    /// With no verdict on record the agent cannot settle, even with perfectly
    /// well-formed parameters and full token allowance.
    function test_RevertIf_NoVerdict() public {
        SwapOrder memory order = _order();
        bytes32 commitment = executor.getSwapCommitment(order);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, commitment));
        executor.executeSwap(order, ROUTE);
    }

    function test_ValidatorRecords_AgentRelays_Success() public {
        SwapOrder memory order = _order();
        bytes32 commitment = _recordVerdict(order);
        assertTrue(executor.isVerdictLive(commitment), "verdict should be live");

        uint256 balanceBefore = tokenOut.balanceOf(user);
        uint256 amountOut = _settle(order);

        assertGt(amountOut, MIN_AMOUNT_OUT);
        assertEq(tokenOut.balanceOf(user) - balanceBefore, amountOut, "user receives the output");
        assertFalse(executor.isVerdictLive(commitment), "verdict consumed");
        assertTrue(executor.commitmentUsed(commitment), "commitment permanently burned");

        // The route and fee that reached the aggregator are the approved ones.
        assertEq(mockEntrypoint.lastProgram(), ROUTE);
        assertEq(mockEntrypoint.lastFeeBps(), FEE_BPS);
        assertEq(mockEntrypoint.lastFeeCollector(), feeCollector);
    }

    /// Settlement fails closed before the validator is bootstrapped.
    function test_RevertIf_ValidatorNotSet() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenIn);
        tokens[1] = address(tokenOut);

        AgentExecutor fresh = new AgentExecutor(
            owner, agent, address(mockEntrypoint), address(mockV2Router),
            address(mockV3PositionManager), MAX_SLIPPAGE_BPS, tokens
        );

        vm.prank(validator);
        vm.expectRevert(AgentExecutorBase.ValidatorNotSet.selector);
        fresh.recordVerdict(uint256(keccak256("anything")), uint64(deadline));
    }

    function test_ExpiredVerdict_CannotSettle() public {
        SwapOrder memory order = _order();
        bytes32 commitment = executor.getSwapCommitment(order);

        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(block.timestamp + 60));

        vm.warp(block.timestamp + 61);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.VerdictExpired.selector, commitment));
        executor.executeSwap(order, ROUTE);
    }

    function test_Replay_CannotSettleTwice() public {
        SwapOrder memory order = _order();
        bytes32 commitment = _recordVerdict(order);
        _settle(order);

        // Even a validator re-recording the same commitment cannot resurrect it.
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.CommitmentAlreadyUsed.selector, commitment));
        executor.recordVerdict(uint256(commitment), uint64(deadline));

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.CommitmentAlreadyUsed.selector, commitment));
        executor.executeSwap(order, ROUTE);
    }

    function test_ValidatorCanRevokeBeforeSettlement() public {
        SwapOrder memory order = _order();
        bytes32 commitment = _recordVerdict(order);

        vm.prank(validator);
        executor.revokeVerdict(commitment);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, commitment));
        executor.executeSwap(order, ROUTE);
    }

    /// Revocation only ever subtracts authority, so the owner holding that lever
    /// adds no way to approve anything.
    function test_OwnerCanRevokeButNotApprove() public {
        SwapOrder memory order = _order();
        bytes32 commitment = _recordVerdict(order);

        vm.prank(owner);
        executor.revokeVerdict(commitment);
        assertFalse(executor.isVerdictLive(commitment));

        vm.prank(attacker);
        vm.expectRevert(AgentExecutorBase.Unauthorized.selector);
        executor.revokeVerdict(commitment);
    }

    // ── The IC-to-EVM boundary, at the ABI level ─────────────────────────────
    //
    //  The authentication rests on a call that originates inside GenVM: the
    //  validator IC declares a stub, py-genlayer turns it into calldata, and the
    //  IC's ghost contract delivers it. None of that can run here - GenVM is not
    //  in this test harness, and `@gl.evm.contract_interface` is not implemented
    //  in Studio either, so the usual local sanity check is unavailable.
    //
    //  What CAN be checked locally is the part most likely to be silently wrong:
    //  the selector. py-genlayer builds it from the Python method name VERBATIM
    //  (there is no snake_case-to-camelCase conversion, despite what the docs'
    //  own ERC-20 example implies) joined to the ABI type names. So the stub
    //  `def recordVerdict(self, commitment: bytes32, expiry: u64, /)` produces
    //  keccak256("recordVerdict(uint256,uint64)")[:4]. If that disagreed with the
    //  executor by one character, every verdict would land on a non-existent
    //  function and settlement would fail with nothing to point at.
    //
    //  The matching Python assertion is in test_commitment_conformance.py.

    function test_ICSelector_MatchesExecutorFunction() public pure {
        assertEq(
            bytes4(keccak256("recordVerdict(uint256,uint64)")),
            AgentExecutorBase.recordVerdict.selector,
            "the selector py-genlayer generates must hit recordVerdict"
        );
    }

    /// Raw calldata shaped exactly as the IC's ghost would deliver it, sent from
    /// the IC's address, must be accepted - and the same bytes from anyone else
    /// must not be.
    function test_ICCalldata_AcceptedOnlyFromValidator() public {
        SwapOrder memory order = _order();
        bytes32 commitment = executor.getSwapCommitment(order);

        bytes memory icCalldata = abi.encodeWithSelector(
            bytes4(keccak256("recordVerdict(uint256,uint64)")),
            uint256(commitment),
            uint64(deadline)
        );

        // 4-byte selector + two 32-byte static words is the whole message.
        assertEq(icCalldata.length, 4 + 64, "IC calldata must be selector + two words");

        vm.prank(attacker);
        (bool spoofed, ) = address(executor).call(icCalldata);
        assertFalse(spoofed, "only the validator IC may record a verdict");

        vm.prank(validator);
        (bool ok, ) = address(executor).call(icCalldata);
        assertTrue(ok, "ghost-delivered calldata must be accepted");
        assertTrue(executor.isVerdictLive(commitment), "verdict must be live after the IC call");

        // And it settles, which is the property the whole boundary exists for.
        assertGt(_settle(order), MIN_AMOUNT_OUT);
    }

    // =========================================================================
    //  2. EVERY PARAMETER THAT MOVES VALUE IS INSIDE THE COMMITMENT
    // =========================================================================
    //
    //  Each test below records a verdict for an honest order, then has the agent
    //  attempt to settle a modified one. The modified order hashes to a different
    //  commitment, which no verdict backs.

    function _expectTamperRejected(SwapOrder memory tampered) internal {
        bytes32 tamperedCommitment = executor.getSwapCommitment(tampered);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, tamperedCommitment));
        executor.executeSwap(tampered, ROUTE);
    }

    /// THE headline gap. aggProgram was not hashed at all, so an agent holding a
    /// verdict for an honest trade could walk any route it liked.
    function test_RouteTamper_CannotSettle() public {
        _recordVerdict(_order());

        bytes memory hostileRoute = hex"deadbeef";
        SwapOrder memory tampered = _order();
        tampered.routeHash = keccak256(hostileRoute);

        bytes32 tamperedCommitment = executor.getSwapCommitment(tampered);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, tamperedCommitment));
        executor.executeSwap(tampered, hostileRoute);
    }

    /// Swapping the program while keeping the approved routeHash is caught even
    /// earlier, by the hash-of-calldata check.
    function test_RouteSubstitution_CaughtByRouteHash() public {
        SwapOrder memory order = _order();
        _recordVerdict(order);

        bytes memory hostileRoute = hex"deadbeef";
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentExecutorBase.RouteMismatch.selector,
                keccak256(ROUTE),
                keccak256(hostileRoute)
            )
        );
        executor.executeSwap(order, hostileRoute);
    }

    /// The drain that the old design permitted: raise the fee, point it at an
    /// address you control, keep everything else identical.
    function test_FeeTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.feeBps = 90;
        _expectTamperRejected(tampered);
    }

    function test_FeeCollectorTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.feeCollector = attacker;
        _expectTamperRejected(tampered);
    }

    /// Belt and braces: a fee above the cap is refused before the verdict is even
    /// looked up, so a mis-issued verdict cannot authorise a drain either.
    function test_FeeAboveCap_Rejected() public {
        SwapOrder memory order = _order();
        order.feeBps = 9000;
        _recordVerdict(order); // even WITH a verdict

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.FeeTooHigh.selector, uint256(9000), uint256(100)));
        executor.executeSwap(order, ROUTE);
    }

    function test_OwnerCannotRaiseFeeCapPastAbsoluteMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.FeeTooHigh.selector, uint256(1000), uint256(500)));
        executor.setMaxFeeBps(1000);
    }

    /// The post-validation re-quote, and the subtlest case in the suite.
    ///
    /// The agent used to re-quote AFTER consensus and rewrite minAmountOut on its
    /// own authority. Here it shaves the floor by only 0.05 WGEN - a change small
    /// enough to pass every standalone check, including the quote-band rule. It
    /// is caught solely because the value consensus approved is inside the
    /// commitment, which is exactly the binding that was missing.
    function test_LoweredMinOutAfterVerdict_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.minAmountOut = 19495 * 10 ** 16; // 194.95e18, still inside the band
        _expectTamperRejected(tampered);
    }

    /// And an internally inconsistent order is refused outright: the floor must
    /// be the declared slippage below the validated quote.
    function test_MinOutBelowQuoteBand_Rejected() public {
        SwapOrder memory order = _order();
        order.minAmountOut = 100 * 10 ** 18; // far below quote - slippage
        _recordVerdict(order);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentExecutorBase.QuoteInconsistent.selector,
                order.minAmountOut,
                QUOTED_AMOUNT_OUT
            )
        );
        executor.executeSwap(order, ROUTE);
    }

    function test_MinOutAboveQuote_Rejected() public {
        SwapOrder memory order = _order();
        order.minAmountOut = QUOTED_AMOUNT_OUT + 1;
        _recordVerdict(order);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentExecutorBase.QuoteInconsistent.selector,
                order.minAmountOut,
                QUOTED_AMOUNT_OUT
            )
        );
        executor.executeSwap(order, ROUTE);
    }

    function test_QuoteTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.quotedAmountOut = QUOTED_AMOUNT_OUT + 1;
        _expectTamperRejected(tampered);
    }

    function test_UserTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.user = attacker;
        _expectTamperRejected(tampered);
    }

    function test_AmountInTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.amountIn = AMOUNT_IN * 2;
        _expectTamperRejected(tampered);
    }

    function test_TokenInTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.tokenIn = address(tokenC);
        _expectTamperRejected(tampered);
    }

    function test_TokenOutTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.tokenOut = address(tokenC);
        _expectTamperRejected(tampered);
    }

    function test_DeadlineTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.deadline = deadline + 1;
        _expectTamperRejected(tampered);
    }

    function test_SlippageTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.slippageBps = 100;
        _expectTamperRejected(tampered);
    }

    function test_NonceTamper_CannotSettle() public {
        _recordVerdict(_order());
        SwapOrder memory tampered = _order();
        tampered.nonce = 2;
        _expectTamperRejected(tampered);
    }

    /// A router substituted after approval is refused, so a verdict issued
    /// against the audited aggregator cannot be spent through another one.
    function test_RouterTamper_Rejected() public {
        MockAGGFlowEntrypoint other = new MockAGGFlowEntrypoint();
        SwapOrder memory order = _order();
        order.router = address(other);
        _recordVerdict(order);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentExecutorBase.RouterMismatch.selector,
                address(mockEntrypoint),
                address(other)
            )
        );
        executor.executeSwap(order, ROUTE);
    }

    /// The commitment binds this contract, so a verdict recorded on one executor
    /// is meaningless on another deployment of the same code.
    function test_CommitmentIsBoundToThisExecutor() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenIn);
        tokens[1] = address(tokenOut);

        AgentExecutor other = new AgentExecutor(
            owner, agent, address(mockEntrypoint), address(mockV2Router),
            address(mockV3PositionManager), MAX_SLIPPAGE_BPS, tokens
        );

        SwapOrder memory order = _order();
        assertTrue(
            executor.getSwapCommitment(order) != other.getSwapCommitment(order),
            "same order must commit differently per executor"
        );
    }

    function test_UnauthorisedRelayer_CannotSettle() public {
        SwapOrder memory order = _order();
        _recordVerdict(order);

        vm.prank(attacker);
        vm.expectRevert(AgentExecutorBase.Unauthorized.selector);
        executor.executeSwap(order, ROUTE);
    }

    function test_SecondAgent_CanRelay_AfterAuthorisation() public {
        address agent2 = address(0xA2A2);

        vm.prank(owner);
        executor.setAgentAuthorisation(agent2, true);
        assertTrue(executor.isAgent(agent2));

        SwapOrder memory order = _order();
        _recordVerdict(order);

        vm.prank(agent2);
        uint256 amountOut = executor.executeSwap(order, ROUTE);
        assertGt(amountOut, MIN_AMOUNT_OUT);
    }

    // =========================================================================
    //  3. THERE IS NO SECOND RAIL
    // =========================================================================
    //
    //  This contract used to accept an M-of-N EIP-712 attestor quorum in place
    //  of a consensus verdict, to avoid waiting out the appeal window. Nothing
    //  on chain tied an attestation to a verdict the IC had actually recorded,
    //  so those signing keys were a complete substitute for GenLayer consensus.
    //  These tests pin the removal: the entry points are gone, and no amount of
    //  signed material settles a commitment consensus has not approved.

    /// The old attestation-carrying entry points must not exist on the contract.
    /// Selectors computed from the pre-removal ABI.
    function test_AttestationEntryPoints_AreGone() public {
        bytes4[4] memory gone = [
            bytes4(0x109a0117), // executeSwap(SwapOrder,bytes,bytes[])
            bytes4(0xd93432f8), // setAttestorThreshold(uint256)
            bytes4(0xd07e6107), // setVerdictAttestor(address,bool)
            bytes4(0x710445d1)  // verdictDigest(bytes32)
        ];
        for (uint256 i = 0; i < gone.length; i++) {
            (bool ok, ) = address(executor).call(abi.encodePacked(gone[i], bytes32(0), bytes32(0)));
            assertFalse(ok, "an attestation-era entry point is still reachable");
        }
    }

    /// The whole point: with no verdict recorded, settlement fails, and there is
    /// no second argument a relayer could supply to change that.
    function test_NoVerdict_NothingCanSubstitute() public {
        SwapOrder memory order = _order();
        bytes32 commitment = executor.getSwapCommitment(order);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, commitment));
        executor.executeSwap(order, ROUTE);

        assertFalse(executor.commitmentUsed(commitment));
    }

    // ── The owner is the last party who could subvert the registry ───────────
    //
    //  `setGenLayerValidator` is onlyOwner. Left unguarded, the owner could
    //  point it at an address it holds the key for and then call
    //  `recordVerdict` directly, which is the agent-enforces-the-verdict design
    //  wearing a different hat. A ghost contract always has code.

    function test_ValidatorCannotBeAnEOA() public {
        address eoa = makeAddr("ownerControlledEOA");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.ValidatorNotAContract.selector, eoa));
        executor.setGenLayerValidator(eoa);
    }

    /// One address must never be able to both authorise and relay.
    function test_ValidatorCannotBeAnAgent() public {
        address candidate = makeAddr("wouldBeBothRoles");
        vm.etch(candidate, hex"600060005260206000f3");

        vm.startPrank(owner);
        executor.setAgentAuthorisation(candidate, true);

        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.RoleConflict.selector, candidate)
        );
        executor.setGenLayerValidator(candidate);
        vm.stopPrank();
    }

    function test_AgentCannotBecomeTheValidator() public {
        vm.startPrank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.RoleConflict.selector, validator)
        );
        executor.setAgentAuthorisation(validator, true);

        vm.expectRevert(
            abi.encodeWithSelector(AgentExecutorBase.RoleConflict.selector, validator)
        );
        executor.setAuthorisedAgent(validator);
        vm.stopPrank();
    }

    function test_RevertIf_NonOwner_AuthorisesAgent() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.setAgentAuthorisation(attacker, true);
    }

    // =========================================================================
    //  4. LIQUIDITY OPERATIONS USE THE SAME REGISTRY
    // =========================================================================

    function test_LiquidityV2_RequiresConsensusVerdict() public {
        uint256 amountA = 100 * 10 ** 18;
        uint256 amountB = 200 * 10 ** 18;

        vm.startPrank(user);
        tokenIn.approve(address(executor), type(uint256).max);
        tokenC.approve(address(executor), type(uint256).max);
        vm.stopPrank();

        bytes32 commitment = executor.getLiquidityV2AddHash(
            user, address(tokenIn), address(tokenC), amountA, amountB, 0, 0, deadline
        );

        // No verdict yet.
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, commitment));
        executor.executeAddLiquidityV2(
            user, address(tokenIn), address(tokenC), amountA, amountB, 0, 0, deadline
        );

        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(deadline));

        vm.prank(agent);
        (uint256 outA, uint256 outB, uint256 liquidity) = executor.executeAddLiquidityV2(
            user, address(tokenIn), address(tokenC), amountA, amountB, 0, 0, deadline
        );

        assertEq(outA, amountA);
        assertEq(outB, amountB);
        assertGt(liquidity, 0);
        assertTrue(executor.commitmentUsed(commitment));
    }

    function _mintParams() internal view returns (IV3PositionManager.MintParams memory) {
        return IV3PositionManager.MintParams({
            token0:         address(tokenIn),
            token1:         address(tokenC),
            fee:            3000,
            tickLower:      -887220,
            tickUpper:      887220,
            amount0Desired: 100 * 10 ** 18,
            amount1Desired: 200 * 10 ** 18,
            amount0Min:     0,
            amount1Min:     0,
            recipient:      address(0xdead), // overridden to `user` on execution
            deadline:       deadline
        });
    }

    function test_LiquidityV3_RequiresConsensusVerdict() public {
        vm.startPrank(user);
        tokenIn.approve(address(executor), type(uint256).max);
        tokenC.approve(address(executor), type(uint256).max);
        vm.stopPrank();

        IV3PositionManager.MintParams memory params = _mintParams();
        bytes32 commitment = executor.getLiquidityV3AddHash(user, params);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, commitment));
        executor.executeAddLiquidityV3(user, params);

        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(deadline));

        vm.prank(agent);
        (uint256 tokenId, , uint256 amount0, uint256 amount1) =
            executor.executeAddLiquidityV3(user, params);

        assertEq(tokenId, 1);
        assertEq(amount0, params.amount0Desired);
        assertEq(amount1, params.amount1Desired);
        assertTrue(executor.commitmentUsed(commitment));
    }

    /// A negative lower tick is the ordinary case for a range below spot, and it
    /// must be inside the commitment like everything else.
    function test_LiquidityV3_TickTamper_CannotSettle() public {
        vm.startPrank(user);
        tokenIn.approve(address(executor), type(uint256).max);
        tokenC.approve(address(executor), type(uint256).max);
        vm.stopPrank();

        IV3PositionManager.MintParams memory params = _mintParams();
        // Read the hash BEFORE the prank: vm.prank applies to the next call, and
        // a view call made inside the same statement would consume it.
        bytes32 honest = executor.getLiquidityV3AddHash(user, params);
        vm.prank(validator);
        executor.recordVerdict(uint256(honest), uint64(deadline));

        IV3PositionManager.MintParams memory tampered = params;
        tampered.tickLower = -887200; // 20 ticks tighter
        bytes32 tamperedCommitment = executor.getLiquidityV3AddHash(user, tampered);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, tamperedCommitment));
        executor.executeAddLiquidityV3(user, tampered);
    }

    /// token0/token1 are what the executor whitelist-checks on a V3 withdrawal,
    /// so they are inputs to whether the call is permitted and must be bound.
    /// They were NOT in the commitment until this change.
    function test_LiquidityV3Remove_TokenTamper_CannotSettle() public {
        IV3PositionManager.DecreaseLiquidityParams memory params =
            IV3PositionManager.DecreaseLiquidityParams({
                tokenId:    4242,
                liquidity:  123456789,
                amount0Min: 0,
                amount1Min: 0,
                deadline:   deadline
            });

        bytes32 commitment = executor.getLiquidityV3RemoveHash(
            user, params, 4242, address(tokenIn), address(tokenC)
        );
        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(deadline));

        // Same position, a different (still whitelisted) pair declared.
        bytes32 tampered = executor.getLiquidityV3RemoveHash(
            user, params, 4242, address(tokenIn), address(tokenOut)
        );
        assertTrue(tampered != commitment, "the declared tokens must change the commitment");

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, tampered));
        executor.executeRemoveLiquidityV3(
            user, params, 4242, address(tokenIn), address(tokenOut)
        );

        // The declared pair consensus actually approved settles.
        vm.prank(agent);
        executor.executeRemoveLiquidityV3(
            user, params, 4242, address(tokenIn), address(tokenC)
        );
        assertTrue(executor.commitmentUsed(commitment));
    }

    function test_LiquidityV2_TamperedAmount_CannotSettle() public {
        uint256 amountA = 100 * 10 ** 18;
        uint256 amountB = 200 * 10 ** 18;

        vm.startPrank(user);
        tokenIn.approve(address(executor), type(uint256).max);
        tokenC.approve(address(executor), type(uint256).max);
        vm.stopPrank();

        bytes32 commitment = executor.getLiquidityV2AddHash(
            user, address(tokenIn), address(tokenC), amountA, amountB, 0, 0, deadline
        );
        vm.prank(validator);
        executor.recordVerdict(uint256(commitment), uint64(deadline));

        bytes32 tampered = executor.getLiquidityV2AddHash(
            user, address(tokenIn), address(tokenC), amountA * 2, amountB, 0, 0, deadline
        );

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutorBase.NoConsensusVerdict.selector, tampered));
        executor.executeAddLiquidityV2(
            user, address(tokenIn), address(tokenC), amountA * 2, amountB, 0, 0, deadline
        );
    }
}
