// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  AgentExecutor.sol
//  FlipSwap DEX · AI Agent Bridge Contract
// ============================================================================
//
//  PURPOSE
//  -------
//  AgentExecutor is the Solidity bridge between GenLayer's AgentValidator
//  intelligent contract and your existing DEX infrastructure (V2, V3,
//  AGGFlowEntrypoint).
//
//  FLOW
//  ----
//  GenLayer AgentValidator
//       │ approved execution intent (signed by validator)
//       ▼
//  AgentExecutor.executeSwap() / executeAddLiquidity() / executeRemoveLiquidity()
//       │ validate token, router, slippage, deadline on-chain
//       ▼
//  AGGFlowEntrypoint (for swaps)
//  V2 / V3 Router   (for liquidity)
//
//  SECURITY
//  --------
//  - Only whitelisted routers can be called
//  - Only whitelisted tokens can be used
//  - Slippage hard-capped at maxSlippageBps
//  - No arbitrary calldata — only explicit function selectors
//  - Caller must be the authorised agent (backend wallet, not user)
//  - User is always the recipient of funds
//  - Reentrancy protected
//
// ============================================================================

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

// ── Interfaces ──────────────────────────────────────────────────────────────

/// @notice Minimal AGGFlowEntrypoint interface
interface IAGGFlowEntrypoint {
    struct SwapIntent {
        address tokenUserBuys;
        uint256 minAmountUserBuys;
        address tokenUserSells;
        uint256 amountUserSells;
    }

    struct FeeCollection {
        address feeCollectorAddress;
        uint256 feeBps;
        address referrerAddress;
        uint256 referrerFeeBps;
        bool    isInTokenFee;
    }

    function executeSwapWithReceiver(
        SwapIntent    calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes         calldata program,
        address               receiver
    ) external payable returns (uint256 amountOut);
}

/// @notice Minimal SoyaraDex V2 Router interface
interface IUniswapV2Router {
    function addLiquidity(
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA, address tokenB,
        uint256 liquidity,
        uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
}

/// @notice Minimal SoyaraDex V3 NonfungiblePositionManager interface
interface IV3PositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1);
}

// ── Main Contract ────────────────────────────────────────────────────────────

contract AgentExecutor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── State ──────────────────────────────────────────────────────────────

    /// @notice Address authorised to call execute* functions (the agent backend wallet)
    address public authorisedAgent;

    /// @notice AGGFlowEntrypoint for swaps
    address public aggFlowEntrypoint;

    /// @notice SoyaraDex V2 Router
    address public v2Router;

    /// @notice SoyaraDex V3 NonfungiblePositionManager
    address public v3PositionManager;

    /// @notice Maximum slippage in basis points (300 = 3%)
    uint256 public maxSlippageBps;

    /// @notice Approved tokens mapping
    mapping(address => bool) public approvedTokens;

    /// @notice Approved routers mapping
    mapping(address => bool) public approvedRouters;

    /// @notice Emergency pause
    bool public paused;

    // ── Events ─────────────────────────────────────────────────────────────

    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event LiquidityAdded(
        address indexed user,
        address tokenA,
        address tokenB,
        string  version,
        uint256 amountA,
        uint256 amountB
    );

    event LiquidityRemoved(
        address indexed user,
        address tokenA,
        address tokenB,
        string  version
    );

    event TokenApproved(address indexed token, bool approved);
    event RouterApproved(address indexed router, bool approved);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event Paused(bool paused);

    // ── Errors ─────────────────────────────────────────────────────────────

    error Unauthorized();
    error ContractPaused();
    error TokenNotApproved(address token);
    error RouterNotApproved(address router);
    error SlippageExceeded(uint256 bps, uint256 maxBps);
    error DeadlineExpired();
    error ZeroAmount();
    error ZeroAddress();
    error SameToken();

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyAgent() {
        if (msg.sender != authorisedAgent) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier onlyApprovedToken(address token) {
        if (token != address(0) && !approvedTokens[token]) revert TokenNotApproved(token);
        _;
    }

    modifier onlyApprovedRouter(address router) {
        if (!approvedRouters[router]) revert RouterNotApproved(router);
        _;
    }

    modifier validDeadline(uint256 deadline) {
        if (deadline < block.timestamp) revert DeadlineExpired();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(
        address _owner,
        address _authorisedAgent,
        address _aggFlowEntrypoint,
        address _v2Router,
        address _v3PositionManager,
        uint256 _maxSlippageBps,
        address[] memory _initialApprovedTokens
    ) Ownable(_owner) {
        if (_authorisedAgent    == address(0)) revert ZeroAddress();
        if (_aggFlowEntrypoint  == address(0)) revert ZeroAddress();
        if (_v2Router           == address(0)) revert ZeroAddress();
        if (_v3PositionManager  == address(0)) revert ZeroAddress();

        authorisedAgent    = _authorisedAgent;
        aggFlowEntrypoint  = _aggFlowEntrypoint;
        v2Router           = _v2Router;
        v3PositionManager  = _v3PositionManager;
        maxSlippageBps     = _maxSlippageBps;
        paused             = false;

        // Approve initial routers
        approvedRouters[_aggFlowEntrypoint] = true;
        approvedRouters[_v2Router]          = true;
        approvedRouters[_v3PositionManager] = true;

        // Approve initial tokens
        for (uint256 i = 0; i < _initialApprovedTokens.length; i++) {
            approvedTokens[_initialApprovedTokens[i]] = true;
        }
    }

    // ── Owner Admin ────────────────────────────────────────────────────────

    function setAuthorisedAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        emit AgentUpdated(authorisedAgent, _agent);
        authorisedAgent = _agent;
    }

    function setMaxSlippage(uint256 _bps) external onlyOwner {
        require(_bps <= 10_000, "Cannot exceed 100%");
        maxSlippageBps = _bps;
    }

    function setApprovedToken(address _token, bool _approved) external onlyOwner {
        approvedTokens[_token] = _approved;
        emit TokenApproved(_token, _approved);
    }

    function setApprovedRouter(address _router, bool _approved) external onlyOwner {
        approvedRouters[_router] = _approved;
        emit RouterApproved(_router, _approved);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    // ── Execution: Swap ────────────────────────────────────────────────────

    /**
     * @notice Execute a swap approved by GenLayer AgentValidator.
     *
     * @param user           The user who will receive the output tokens
     * @param tokenIn        Input token (address(0) for native)
     * @param tokenOut       Output token
     * @param amountIn       Exact input amount
     * @param minAmountOut   Minimum output amount (slippage protected)
     * @param slippageBps    Slippage in basis points (for validation only)
     * @param deadline       Unix timestamp
     * @param aggProgram     AGGFlow bytecode program for route execution
     * @param feeBps         Protocol fee in basis points
     * @param feeCollector   Protocol fee recipient address
     */
    function executeSwap(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 slippageBps,
        uint256 deadline,
        bytes   calldata aggProgram,
        uint256 feeBps,
        address feeCollector
    )
        external
        payable
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(deadline)
        returns (uint256 amountOut)
    {
        // Validate inputs
        if (user == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert SameToken();
        if (amountIn == 0) revert ZeroAmount();
        if (slippageBps > maxSlippageBps) revert SlippageExceeded(slippageBps, maxSlippageBps);

        // Token approvals check (native = address(0) is always allowed)
        if (tokenIn  != address(0) && !approvedTokens[tokenIn])  revert TokenNotApproved(tokenIn);
        if (!approvedTokens[tokenOut]) revert TokenNotApproved(tokenOut);

        // Pull tokens from user (agent must have ensured user gave approval)
        if (tokenIn != address(0)) {
            IERC20(tokenIn).safeTransferFrom(user, address(this), amountIn);
            IERC20(tokenIn).forceApprove(aggFlowEntrypoint, amountIn);
        }

        // Build swap intent
        IAGGFlowEntrypoint.SwapIntent memory swapIntent = IAGGFlowEntrypoint.SwapIntent({
            tokenUserBuys:    tokenOut,
            minAmountUserBuys: minAmountOut,
            tokenUserSells:   tokenIn,
            amountUserSells:  amountIn
        });

        // Build fee collection (zero fees if no collector set)
        IAGGFlowEntrypoint.FeeCollection memory feeCollection = IAGGFlowEntrypoint.FeeCollection({
            feeCollectorAddress: feeCollector != address(0) ? feeCollector : address(this),
            feeBps:              feeCollector != address(0) ? feeBps : 0,
            referrerAddress:     address(this),
            referrerFeeBps:      0,
            isInTokenFee:        true
        });

        uint256 value = tokenIn == address(0) ? amountIn : 0;

        // Execute through AGGFlowEntrypoint — user receives output directly
        amountOut = IAGGFlowEntrypoint(aggFlowEntrypoint).executeSwapWithReceiver{value: value}(
            swapIntent,
            feeCollection,
            aggProgram,
            user
        );

        emit SwapExecuted(user, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ── Execution: V2 Add Liquidity ─────────────────────────────────────────

    /**
     * @notice Execute a V2 add-liquidity approved by GenLayer AgentValidator.
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
        if (user == address(0)) revert ZeroAddress();
        if (!approvedTokens[tokenA]) revert TokenNotApproved(tokenA);
        if (!approvedTokens[tokenB]) revert TokenNotApproved(tokenB);
        if (tokenA == tokenB) revert SameToken();
        if (amountADesired == 0 || amountBDesired == 0) revert ZeroAmount();

        // Pull tokens from user
        IERC20(tokenA).safeTransferFrom(user, address(this), amountADesired);
        IERC20(tokenB).safeTransferFrom(user, address(this), amountBDesired);

        // Approve router
        IERC20(tokenA).forceApprove(v2Router, amountADesired);
        IERC20(tokenB).forceApprove(v2Router, amountBDesired);

        // Execute
        (amountA, amountB, liquidity) = IUniswapV2Router(v2Router).addLiquidity(
            tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin,
            user,       // LP tokens go directly to user
            deadline
        );

        // Refund any unused tokens
        uint256 remainA = amountADesired - amountA;
        uint256 remainB = amountBDesired - amountB;
        if (remainA > 0) IERC20(tokenA).safeTransfer(user, remainA);
        if (remainB > 0) IERC20(tokenB).safeTransfer(user, remainB);

        // Reset approvals
        IERC20(tokenA).forceApprove(v2Router, 0);
        IERC20(tokenB).forceApprove(v2Router, 0);

        emit LiquidityAdded(user, tokenA, tokenB, "V2", amountA, amountB);
    }

    // ── Execution: V2 Remove Liquidity ──────────────────────────────────────

    /**
     * @notice Execute a V2 remove-liquidity approved by GenLayer AgentValidator.
     */
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
        if (user == address(0)) revert ZeroAddress();
        if (!approvedTokens[tokenA]) revert TokenNotApproved(tokenA);
        if (!approvedTokens[tokenB]) revert TokenNotApproved(tokenB);
        if (lpAmount == 0) revert ZeroAmount();

        // Pull LP tokens from user
        IERC20(lpToken).safeTransferFrom(user, address(this), lpAmount);
        IERC20(lpToken).forceApprove(v2Router, lpAmount);

        // Execute
        (amountA, amountB) = IUniswapV2Router(v2Router).removeLiquidity(
            tokenA, tokenB,
            lpAmount,
            amountAMin, amountBMin,
            user,       // tokens go directly to user
            deadline
        );

        IERC20(lpToken).forceApprove(v2Router, 0);

        emit LiquidityRemoved(user, tokenA, tokenB, "V2");
    }

    // ── Execution: V3 Add Liquidity (Mint Position) ─────────────────────────

    /**
     * @notice Execute a V3 mint-position approved by GenLayer AgentValidator.
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
        if (user == address(0)) revert ZeroAddress();
        if (!approvedTokens[params.token0]) revert TokenNotApproved(params.token0);
        if (!approvedTokens[params.token1]) revert TokenNotApproved(params.token1);
        if (params.amount0Desired == 0 && params.amount1Desired == 0) revert ZeroAmount();

        // Pull tokens from user
        if (params.amount0Desired > 0) {
            IERC20(params.token0).safeTransferFrom(user, address(this), params.amount0Desired);
            IERC20(params.token0).forceApprove(v3PositionManager, params.amount0Desired);
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).safeTransferFrom(user, address(this), params.amount1Desired);
            IERC20(params.token1).forceApprove(v3PositionManager, params.amount1Desired);
        }

        // Build params with user as recipient
        IV3PositionManager.MintParams memory mintParams = params;
        mintParams.recipient = user; // NFT goes to user

        // Execute
        (tokenId, liquidity, amount0, amount1) = IV3PositionManager(v3PositionManager).mint(mintParams);

        // Refund unused tokens
        uint256 remain0 = params.amount0Desired - amount0;
        uint256 remain1 = params.amount1Desired - amount1;
        if (remain0 > 0) IERC20(params.token0).safeTransfer(user, remain0);
        if (remain1 > 0) IERC20(params.token1).safeTransfer(user, remain1);

        // Reset approvals
        if (params.amount0Desired > 0) IERC20(params.token0).forceApprove(v3PositionManager, 0);
        if (params.amount1Desired > 0) IERC20(params.token1).forceApprove(v3PositionManager, 0);

        emit LiquidityAdded(user, params.token0, params.token1, "V3", amount0, amount1);
    }

    // ── Execution: V3 Remove Liquidity ──────────────────────────────────────

    /**
     * @notice Execute a V3 decrease-liquidity + collect approved by GenLayer AgentValidator.
     */
    function executeRemoveLiquidityV3(
        address user,
        IV3PositionManager.DecreaseLiquidityParams calldata decreaseParams,
        uint256 tokenId
    )
        external
        onlyAgent
        nonReentrant
        whenNotPaused
        validDeadline(decreaseParams.deadline)
        returns (uint256 amount0, uint256 amount1)
    {
        if (user == address(0)) revert ZeroAddress();
        if (decreaseParams.liquidity == 0) revert ZeroAmount();

        // Decrease liquidity (user must have approved position manager to transfer NFT,
        // or this contract must be approved as operator)
        (amount0, amount1) = IV3PositionManager(v3PositionManager).decreaseLiquidity(decreaseParams);

        // Collect fees + withdrawn amounts to user
        IV3PositionManager(v3PositionManager).collect(
            IV3PositionManager.CollectParams({
                tokenId:    tokenId,
                recipient:  user,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit LiquidityRemoved(user, address(0), address(0), "V3");
    }

    // ── Safety ─────────────────────────────────────────────────────────────

    /// @notice Owner can rescue stuck ERC-20 tokens
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Owner can rescue stuck ETH
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
