// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  AgentExecutor.sol
//  Soyara DEX · AI Agent Bridge Contract (Execution Layer)
// ============================================================================
//
//  ARCHITECTURE
//  ------------
//  This file contains ONLY the five execute* functions. State, events, errors,
//  admin and the verdict registry live in:
//
//    src/base/AgentExecutorBase.sol       ← inherit
//    src/libraries/TradeHashLib.sol       ← commitment hashing
//    src/types/SettlementTypes.sol        ← the full settlement surface
//    src/interfaces/IAgentExecutorDEX.sol ← external protocol interfaces
//
//  FLOW
//  ----
//  AgentValidator (GenLayer Intelligent Contract)
//       │  a consensus round checks the order against LIVE pool state, then
//       │  emits an external message on finalization
//       ▼
//  AgentExecutor.recordVerdict(commitment, expiry)   ← msg.sender is the IC
//       │
//       ▼
//  Agent relays AgentExecutor.executeSwap(order, aggProgram)
//       │  1. Validate params (fail BEFORE burning the verdict)
//       │  2. Re-derive the commitment from the calldata being settled
//       │  3. Consume the verdict for exactly that commitment
//       │  4. Pull tokens, delegate to router
//       ▼
//  AGGFlowEntrypoint (aggregated swaps)
//  V2 Router / V3 PositionManager (liquidity)
//
//  WHAT THE COMMITMENT NOW COVERS
//  ------------------------------
//  The old approval hash spanned seven fields and left aggProgram, feeBps and
//  feeCollector free. An agent could hold a legitimate approval and still route
//  the trade wherever it liked, or skim an arbitrary share to an address of its
//  choosing, because none of those inputs entered the hash. They all enter it
//  now, together with the router, the validated quote, a nonce, the chain id
//  and this contract's address. There is no input to the movement of value that
//  consensus has not seen.
//
//  SECURITY
//  --------
//  - The verdict is authenticated by the contract, not asserted by the agent:
//    only the AgentValidator IC can write one (see AgentExecutorBase), and a
//    recorded consensus verdict is the ONLY thing that satisfies settlement.
//    There is no attestor quorum or any other bypass.
//  - Parameter validation runs BEFORE the verdict is consumed, so bad calldata
//    does not burn a good approval.
//  - Commitments are single-use and permanently marked, so a re-recorded verdict
//    cannot replay a settled trade.
//  - Reentrancy protected via ReentrancyGuard in AgentExecutorBase.
//
// ============================================================================

import { IERC20 }            from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 }         from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AgentExecutorBase } from "./base/AgentExecutorBase.sol";
import { TradeHashLib }      from "./libraries/TradeHashLib.sol";
import { SwapOrder }         from "./types/SettlementTypes.sol";
import {
    IAGGFlowEntrypoint,
    IUniswapV2Router,
    IV3PositionManager,
    IV2Pair,
    IV2Factory
} from "./interfaces/IAgentExecutorDEX.sol";
import { TradingMandate } from "./types/MandateTypes.sol";

contract AgentExecutor is AgentExecutorBase {
    using SafeERC20 for IERC20;

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address _owner,
        address _authorisedAgent,
        address _aggFlowEntrypoint,
        address _v2Router,
        address _v3PositionManager,
        uint256 _maxSlippageBps,
        address[] memory _initialApprovedTokens
    )
        AgentExecutorBase(
            _owner,
            _authorisedAgent,
            _aggFlowEntrypoint,
            _v2Router,
            _v3PositionManager,
            _maxSlippageBps,
            _initialApprovedTokens
        )
    {}

    // ── Execution: Swap ───────────────────────────────────────────────────────

    /**
     * @notice Settle a swap that GenLayer consensus has approved.
     *
     * @param order        The complete settlement surface. Every field is inside
     *                     the commitment, so nothing here can differ from what
     *                     the validators saw.
     * @param aggProgram   Aggregator routing calldata. Must hash to
     *                     `order.routeHash`, which is what consensus approved.
     */
    function executeSwap(
        SwapOrder calldata order,
        bytes     calldata aggProgram
    )
        external
        payable
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(order.deadline)
        returns (uint256 amountOut)
    {
        // ── 1. Parameter Validations (BEFORE consuming the verdict) ───────────
        _validateSwapOrder(order, aggProgram);

        // ── 2. Verdict Check ──────────────────────────────────────────────────
        // Re-derive the identifier from the calldata actually being settled. Any
        // divergence from what consensus approved — a different route, a fatter
        // fee, another recipient — lands on a commitment no verdict exists for.
        bytes32 commitment = TradeHashLib.swapCommitment(order, block.chainid, address(this));
        _consumeVerdict(commitment, order.user);

        // ── 3. Execute ────────────────────────────────────────────────────────
        amountOut = _performSwap(order, aggProgram);

        emit SwapExecuted(order.user, order.tokenIn, order.tokenOut, order.amountIn, amountOut);
    }

    /**
     * @dev All pre-conditions for a swap, split out so `executeSwap` stays within
     *      stack limits and each rule is individually readable.
     */
    function _validateSwapOrder(SwapOrder calldata order, bytes calldata aggProgram) internal view {
        if (order.user     == address(0))    revert ZeroAddress();
        if (order.tokenIn  == order.tokenOut) revert SameToken();
        if (order.amountIn == 0)             revert ZeroAmount();
        if (order.slippageBps > maxSlippageBps) {
            revert SlippageExceeded(order.slippageBps, maxSlippageBps);
        }

        // address(0) denotes the NATIVE asset, which is not an ERC-20 and so is
        // never present in the ERC-20 whitelist. Both sides must exempt it, or
        // the swap is unexecutable: previously only tokenIn was exempted, so
        // every swap OUT to native reverted with TokenNotApproved(0x0) before
        // any other check could run.
        if (order.tokenIn  != address(0) && !approvedTokens[order.tokenIn]) {
            revert TokenNotApproved(order.tokenIn);
        }
        if (order.tokenOut != address(0) && !approvedTokens[order.tokenOut]) {
            revert TokenNotApproved(order.tokenOut);
        }

        // The route must execute through the entrypoint consensus approved, and
        // that entrypoint must still be whitelisted at settlement time.
        if (order.router != aggFlowEntrypoint) revert RouterMismatch(aggFlowEntrypoint, order.router);
        if (!approvedRouters[order.router])    revert RouterNotApproved(order.router);

        // The route program itself, pinned by hash.
        bytes32 actualRoute = keccak256(aggProgram);
        if (actualRoute != order.routeHash) revert RouteMismatch(order.routeHash, actualRoute);

        // Fee ceiling is defence in depth — the fee is already in the commitment.
        if (order.feeBps > maxFeeBps) revert FeeTooHigh(order.feeBps, maxFeeBps);
        if (order.feeBps > 0 && order.feeCollector == address(0)) revert ZeroAddress();

        // The floor must be the declared slippage below the validated quote.
        //
        // This is what stops a settlement agent from lowering a user's
        // protection after consensus has spoken: previously the agent re-quoted
        // AFTER validation and rewrote minAmountOut on its own authority, so the
        // value settled was not the value approved. The quote is now part of the
        // approved order, and the relationship between the two is enforced here.
        //
        // Note the scope of this check: it proves minAmountOut is consistent with
        // quotedAmountOut, not that quotedAmountOut is honest. The honesty of the
        // quote is established off-chain by the validators, which read live pool
        // reserves during the consensus round.
        if (order.quotedAmountOut == 0) revert ZeroAmount();
        if (order.minAmountOut > order.quotedAmountOut) {
            revert QuoteInconsistent(order.minAmountOut, order.quotedAmountOut);
        }
        uint256 floor = (order.quotedAmountOut * (10_000 - order.slippageBps)) / 10_000;
        if (order.minAmountOut < floor) {
            revert QuoteInconsistent(order.minAmountOut, order.quotedAmountOut);
        }
    }

    /// @dev Token movement and the router call, isolated from validation.
    /// @dev Takes `memory` rather than `calldata` so both settlement paths share
    ///      it: `executeSwap` passes its calldata order, which converts
    ///      implicitly, and `executeSwapUnderMandate` builds its order in memory
    ///      from the mandate. One implementation moves the funds either way, so
    ///      the fast and slow paths cannot drift apart on how a trade executes.
    function _performSwap(SwapOrder memory order, bytes calldata aggProgram)
        internal
        returns (uint256 amountOut)
    {
        if (order.tokenIn != address(0)) {
            IERC20(order.tokenIn).safeTransferFrom(order.user, address(this), order.amountIn);
            IERC20(order.tokenIn).forceApprove(order.router, order.amountIn);
        }

        IAGGFlowEntrypoint.SwapIntent memory swapIntent = IAGGFlowEntrypoint.SwapIntent({
            tokenUserBuys:     order.tokenOut,
            minAmountUserBuys: order.minAmountOut,
            tokenUserSells:    order.tokenIn,
            amountUserSells:   order.amountIn
        });

        IAGGFlowEntrypoint.FeeCollection memory feeData = IAGGFlowEntrypoint.FeeCollection({
            feeCollectorAddress: order.feeCollector,
            feeBps:              order.feeBps,
            referrerAddress:     address(0),
            referrerFeeBps:      0,
            isInTokenFee:        true
        });

        amountOut = IAGGFlowEntrypoint(order.router).executeSwapWithReceiver{
            value: order.tokenIn == address(0) ? order.amountIn : 0
        }(swapIntent, feeData, aggProgram, order.user);

        if (order.tokenIn != address(0)) IERC20(order.tokenIn).forceApprove(order.router, 0);
    }

    // ── Execution: V2 Add Liquidity ───────────────────────────────────────────

    /**
     * @notice Settle a consensus-approved V2 add-liquidity operation.
     * @dev Params validated before the verdict is consumed. Unused tokens refunded.
     */
    function executeAddLiquidityV2(
        address user,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    )
        external
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        // ── 1. Param Validations ──────────────────────────────────────────────
        if (user   == address(0))   revert ZeroAddress();
        if (tokenA == tokenB)       revert SameToken();
        if (!approvedTokens[tokenA]) revert TokenNotApproved(tokenA);
        if (!approvedTokens[tokenB]) revert TokenNotApproved(tokenB);
        if (amountADesired == 0 || amountBDesired == 0) revert ZeroAmount();

        // ── 2. Verdict Check ──────────────────────────────────────────────────
        bytes32 commitment = TradeHashLib.v2AddHash(
            user, tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin,
            deadline, block.chainid, address(this)
        );
        _consumeVerdict(commitment, user);

        // ── 3. Execute ────────────────────────────────────────────────────────
        IERC20(tokenA).safeTransferFrom(user, address(this), amountADesired);
        IERC20(tokenB).safeTransferFrom(user, address(this), amountBDesired);
        IERC20(tokenA).forceApprove(v2Router, amountADesired);
        IERC20(tokenB).forceApprove(v2Router, amountBDesired);

        (amountA, amountB, liquidity) = IUniswapV2Router(v2Router).addLiquidity(
            tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin,
            user, deadline
        );

        // Refund unused tokens
        uint256 remainA = amountADesired - amountA;
        uint256 remainB = amountBDesired - amountB;
        if (remainA > 0) IERC20(tokenA).safeTransfer(user, remainA);
        if (remainB > 0) IERC20(tokenB).safeTransfer(user, remainB);

        IERC20(tokenA).forceApprove(v2Router, 0);
        IERC20(tokenB).forceApprove(v2Router, 0);

        emit LiquidityAdded(user, tokenA, tokenB, "V2", amountA, amountB);
    }

    // ── Execution: V2 Remove Liquidity ────────────────────────────────────────

    /// @notice Settle a consensus-approved V2 remove-liquidity operation.
    function executeRemoveLiquidityV2(
        address user,
        address tokenA,
        address tokenB,
        address lpToken,
        uint256 lpAmount,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    )
        external
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(deadline)
        returns (uint256 amountA, uint256 amountB)
    {
        // ── 1. Param Validations ──────────────────────────────────────────────
        if (user   == address(0))   revert ZeroAddress();
        if (tokenA == tokenB)       revert SameToken();
        if (!approvedTokens[tokenA]) revert TokenNotApproved(tokenA);
        if (!approvedTokens[tokenB]) revert TokenNotApproved(tokenB);
        if (lpAmount == 0)           revert ZeroAmount();

        // ── 2. Verdict Check ──────────────────────────────────────────────────
        bytes32 commitment = TradeHashLib.v2RemoveHash(
            user, tokenA, tokenB,
            lpToken, lpAmount,
            amountAMin, amountBMin,
            deadline, block.chainid, address(this)
        );
        _consumeVerdict(commitment, user);

        // ── 3. Execute ────────────────────────────────────────────────────────
        IERC20(lpToken).safeTransferFrom(user, address(this), lpAmount);
        IERC20(lpToken).forceApprove(v2Router, lpAmount);

        (amountA, amountB) = IUniswapV2Router(v2Router).removeLiquidity(
            tokenA, tokenB,
            lpAmount,
            amountAMin, amountBMin,
            user, deadline
        );

        IERC20(lpToken).forceApprove(v2Router, 0);
        emit LiquidityRemoved(user, tokenA, tokenB, "V2");
    }

    // ── Execution: V3 Add Liquidity (Mint Position) ───────────────────────────

    /**
     * @notice Settle a consensus-approved V3 mint-position operation.
     * @dev mintParams.recipient is always overridden to `user` — the NFT goes
     *      directly to the user regardless of what the agent passed in params.
     */
    function executeAddLiquidityV3(
        address user,
        IV3PositionManager.MintParams calldata params
    )
        external
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(params.deadline)
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        // ── 1. Param Validations ──────────────────────────────────────────────
        if (user == address(0)) revert ZeroAddress();
        if (!approvedTokens[params.token0]) revert TokenNotApproved(params.token0);
        if (!approvedTokens[params.token1]) revert TokenNotApproved(params.token1);
        if (params.amount0Desired == 0 && params.amount1Desired == 0) revert ZeroAmount();

        // ── 2. Verdict Check ──────────────────────────────────────────────────
        bytes32 commitment = TradeHashLib.v3AddHash(user, params, block.chainid, address(this));
        _consumeVerdict(commitment, user);

        // ── 3. Execute ────────────────────────────────────────────────────────
        if (params.amount0Desired > 0) {
            IERC20(params.token0).safeTransferFrom(user, address(this), params.amount0Desired);
            IERC20(params.token0).forceApprove(v3PositionManager, params.amount0Desired);
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).safeTransferFrom(user, address(this), params.amount1Desired);
            IERC20(params.token1).forceApprove(v3PositionManager, params.amount1Desired);
        }

        IV3PositionManager.MintParams memory mintParams = params;
        mintParams.recipient = user; // NFT always goes directly to user

        (tokenId, liquidity, amount0, amount1) = IV3PositionManager(v3PositionManager).mint(mintParams);

        // Refund unused tokens
        uint256 remain0 = params.amount0Desired - amount0;
        uint256 remain1 = params.amount1Desired - amount1;
        if (remain0 > 0) IERC20(params.token0).safeTransfer(user, remain0);
        if (remain1 > 0) IERC20(params.token1).safeTransfer(user, remain1);

        if (params.amount0Desired > 0) IERC20(params.token0).forceApprove(v3PositionManager, 0);
        if (params.amount1Desired > 0) IERC20(params.token1).forceApprove(v3PositionManager, 0);

        emit LiquidityAdded(user, params.token0, params.token1, "V3", amount0, amount1);
    }

    // ── Execution: V3 Remove Liquidity ────────────────────────────────────────

    /**
     * @notice Settle a consensus-approved V3 decrease-liquidity + collect.
     *
     * @param token0  token0 of the position — required for whitelist enforcement
     * @param token1  token1 of the position — required for whitelist enforcement
     */
    function executeRemoveLiquidityV3(
        address user,
        IV3PositionManager.DecreaseLiquidityParams calldata decreaseParams,
        uint256 tokenId,
        address token0,
        address token1
    )
        external
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(decreaseParams.deadline)
        returns (uint256 amount0, uint256 amount1)
    {
        // ── 1. Param Validations ──────────────────────────────────────────────
        if (user == address(0)) revert ZeroAddress();
        if (!approvedTokens[token0]) revert TokenNotApproved(token0);
        if (!approvedTokens[token1]) revert TokenNotApproved(token1);
        if (decreaseParams.liquidity == 0) revert ZeroAmount();

        // ── 2. Verdict Check ──────────────────────────────────────────────────
        bytes32 commitment = TradeHashLib.v3RemoveHash(
            user, decreaseParams, tokenId, token0, token1, block.chainid, address(this)
        );
        _consumeVerdict(commitment, user);

        // ── 3. Execute ────────────────────────────────────────────────────────
        (amount0, amount1) = IV3PositionManager(v3PositionManager).decreaseLiquidity(decreaseParams);

        IV3PositionManager(v3PositionManager).collect(
            IV3PositionManager.CollectParams({
                tokenId:    tokenId,
                recipient:  user,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit LiquidityRemoved(user, token0, token1, "V3");
    }

    // ── Execution: the fast path, under a consensus-approved mandate ──────────

    /**
     * @notice Settle immediately against a mandate consensus approved earlier.
     *
     * WHY THIS EXISTS
     * ---------------
     * A per-order verdict cannot be fast, and that is a property of the
     * platform rather than of this code. A verdict reaches the EVM as a GenVM
     * `EthSend` emission, and that emission carries only address, calldata,
     * value and fees - there is no delivery-timing field on it. `PostMessage`
     * and `DeployContract` both take an `on` ("accepted" | "finalized");
     * `EthSend` does not, so the chain applies finalization and an IC cannot
     * ask for anything sooner. On Bradbury that is the appeal window, fifteen
     * to twenty-five minutes, in front of every single trade.
     *
     * A mandate moves that wait off the per-trade path. Consensus approves a
     * bounded authority once, pays finalization once, and every trade inside
     * that authority settles now.
     *
     * WHAT IS STILL ENFORCED
     * ----------------------
     * The relayer is trusted with nothing. User, pair, direction, per-trade
     * ceiling, lifetime budget, fee, fee collector, router and expiry all come
     * from the mandate, which only the validator IC can write.
     *
     * And the price is computed HERE. `pool` is proven against the factory to
     * be the canonical pair for these tokens, its live reserves are read, the
     * constant-product output is derived in this function, and `minAmountOut`
     * must sit inside the mandate's slippage band of that number. Under the
     * per-order design the quote arrived from the validators and this contract
     * could only check it for internal consistency. Here the chain decides the
     * price - so on quote honesty the fast path is stricter than the slow one.
     */
    function executeSwapUnderMandate(
        bytes32 id,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeBps,
        bytes calldata aggProgram
    )
        external
        payable
        onlyAgent
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        TradingMandate storage m = mandates[id];

        // ── 1. Is this authority real, and still alive? ───────────────────────
        if (m.user == address(0))       revert NoMandate(id);
        if (m.revoked)                  revert MandateRevokedError(id);
        if (block.timestamp > m.expiry) revert MandateExpired(id);

        // ── 2. Is this trade inside it? ───────────────────────────────────────
        if (amountIn == 0)                revert ZeroAmount();
        if (amountIn > m.maxAmountIn)     revert MandateAmountExceeded(amountIn, m.maxAmountIn);
        uint256 wouldSpend = m.spentIn + amountIn;
        if (wouldSpend > m.totalBudgetIn) revert MandateBudgetExceeded(wouldSpend, m.totalBudgetIn);
        if (feeBps > m.maxFeeBps)         revert FeeTooHigh(feeBps, m.maxFeeBps);
        if (!approvedRouters[m.router])   revert RouterNotApproved(m.router);

        // The route is bound to the mandate, exactly as it is bound to a
        // per-order commitment. The agent picks the SIZE of a trade and
        // nothing else about it.
        bytes32 actualRoute = keccak256(aggProgram);
        if (actualRoute != m.routeHash) revert RouteMismatch(m.routeHash, actualRoute);

        // ── 3. Price it here, from reserves, not from anyone's word ───────────
        uint256 expectedOut = _quoteV2(m.pool, m.tokenIn, m.tokenOut, amountIn, feeBps);
        if (expectedOut == 0) revert ZeroAmount();
        uint256 floor = (expectedOut * (10_000 - m.maxSlippageBps)) / 10_000;
        if (minAmountOut < floor) revert QuoteInconsistent(minAmountOut, expectedOut);

        // ── 4. Draw the budget down BEFORE any external call ──────────────────
        //      so a reentrant path cannot spend the same allowance twice.
        m.spentIn = wouldSpend;
        emit MandateSpent(id, amountIn, wouldSpend);

        // ── 5. Execute ────────────────────────────────────────────────────────
        SwapOrder memory order = SwapOrder({
            user:            m.user,
            tokenIn:         m.tokenIn,
            tokenOut:        m.tokenOut,
            amountIn:        amountIn,
            minAmountOut:    minAmountOut,
            quotedAmountOut: expectedOut,
            slippageBps:     m.maxSlippageBps,
            deadline:        block.timestamp,
            router:          m.router,
            feeBps:          feeBps,
            feeCollector:    m.feeCollector,
            routeHash:       m.routeHash,
            nonce:           0
        });

        amountOut = _performSwap(order, aggProgram);
        emit SwapExecuted(m.user, m.tokenIn, m.tokenOut, amountIn, amountOut);
    }

    /**
     * @dev Constant-product output for `amountIn`, read from the pool itself.
     *
     *      The factory check is not decoration. Without it an agent could pass
     *      a pair contract it deployed with flattering reserves and have this
     *      function bless any price at all.
     *
     *      The entrypoint takes its fee off the INPUT before routing, so the
     *      calculation starts from the post-fee amount; otherwise every
     *      expectation reads high by exactly the fee and the slippage floor is
     *      set above what the trade can actually return.
     */
    function _quoteV2(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 feeBps
    ) internal view returns (uint256) {
        if (v2Factory == address(0)) revert FactoryNotSet();
        if (IV2Factory(v2Factory).getPair(tokenIn, tokenOut) != pool) revert NotCanonicalPool(pool);

        (uint112 r0, uint112 r1,) = IV2Pair(pool).getReserves();
        address t0 = IV2Pair(pool).token0();

        (uint256 reserveIn, uint256 reserveOut) = t0 == tokenIn
            ? (uint256(r0), uint256(r1))
            : (uint256(r1), uint256(r0));
        if (reserveIn == 0 || reserveOut == 0) return 0;

        uint256 routeInput = (amountIn * (10_000 - feeBps)) / 10_000;
        uint256 inWithFee  = routeInput * 997;
        return (inWithFee * reserveOut) / (reserveIn * 1000 + inWithFee);
    }
}
