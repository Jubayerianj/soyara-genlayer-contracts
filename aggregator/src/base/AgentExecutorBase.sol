// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// ============================================================================
//  AgentExecutorBase.sol
//  Soyara DEX · State, Verdict Registry, Admin & Access Control
// ============================================================================
//
//  PURPOSE
//  -------
//  Everything that is NOT execution logic: state, events, errors, modifiers,
//  owner admin, and the verdict registry that decides what may settle.
//
//  WHAT CHANGED, AND WHY
//  ---------------------
//  Previously the settlement agent enforced the GenLayer verdict. The agent
//  server read the verdict off the AgentValidator Intelligent Contract, decided
//  it was satisfied, and then called `approveTradeWithParams` — an onlyAgent
//  function that simply wrote `approvedTrades[hash] = true`. The executor never
//  learned anything about GenLayer. Its only real gate was "is the caller the
//  agent", which means the root of trust was a private key sitting in a web
//  server's environment, and the consensus layer was advisory. Whoever held
//  that key could approve and settle any trade GenLayer had never seen.
//
//  The verdict is now authenticated by the contract itself. `recordVerdict` is
//  callable ONLY by the AgentValidator Intelligent Contract: on GenLayer an IC
//  reaches the EVM through its ghost contract, which executes external messages
//  via `handleOp()` so the recipient sees `msg.sender` equal to the IC's own
//  address. An approval therefore cannot exist unless a GenVM consensus round
//  produced it. The agent keeps only the ability to relay a trade consensus has
//  already approved, and a fully compromised agent key can no longer authorise
//  anything.
//
//  THERE IS NO SECOND RAIL. An earlier version of this contract carried an
//  optional attestor quorum: M registered keys signing the same commitment
//  under EIP-712 could settle a trade when no consensus verdict had arrived
//  yet. It existed because EVM-bound external messages are delivered only on
//  finalization (`EthSend` takes no `on=` parameter on the pinned runner), so
//  the honest wait is the appeal window, 15 to 25 minutes on Bradbury.
//
//  That rail has been removed. Nothing on chain could link an attestation to a
//  verdict the Intelligent Contract had actually recorded, so M signing keys
//  were, in the executor's eyes, a full substitute for GenLayer consensus -
//  the very property this contract exists to deny. Latency is the honest price
//  of consensus enforcement, and paying it is the point.
//
// ============================================================================

import { IERC20 }          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 }       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable }         from "@openzeppelin/contracts/access/Ownable.sol";
import { TradeHashLib }    from "../libraries/TradeHashLib.sol";
import { SwapOrder }       from "../types/SettlementTypes.sol";
import { IV3PositionManager } from "../interfaces/IAgentExecutorDEX.sol";

abstract contract AgentExecutorBase is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Verdict provenance ────────────────────────────────────────────────────

    /// @notice How a settled commitment obtained its authorisation. There is
    ///         exactly one way; the enum is kept so the event stays
    ///         self-describing rather than emitting a bare truth.
    enum VerdictSource {
        None,
        GenLayerConsensus  // written by the AgentValidator IC via its ghost
    }

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Primary agent. Kept for backward compatibility: existing
    ///         deployments and tooling reference this single address.
    address public authorisedAgent;

    /// @notice Additional authorised agents.
    ///
    /// Agents are relayers, not authorisers. Registering one lets an independent
    /// operator submit settlements without routing through the primary server;
    /// it grants no power to approve anything, because approval comes from the
    /// verdict registry below.
    mapping(address => bool) public agents;

    /// @notice The AgentValidator Intelligent Contract. The ONLY address that
    ///         can record a verdict. Zero until bootstrapped, and settlement
    ///         fails closed while it is zero.
    ///
    /// @dev Set after deployment rather than in the constructor because the IC
    ///      takes this executor's address as its own constructor argument — the
    ///      executor necessarily exists first, so its address cannot be known
    ///      here.
    address public genLayerValidator;

    /// @notice Live verdicts: commitment => expiry timestamp. Zero means no
    ///         verdict. Deleted when the commitment settles.
    mapping(bytes32 => uint64) public verdictExpiry;

    /// @notice Permanent one-time gate. Set the moment a commitment settles and
    ///         never cleared, so a re-recorded verdict cannot replay a trade.
    mapping(bytes32 => bool) public commitmentUsed;

    /// @notice AGGFlowEntrypoint for aggregated swaps
    address public aggFlowEntrypoint;

    /// @notice SoyaraDex V2 Router
    address public v2Router;

    /// @notice SoyaraDex V3 NonfungiblePositionManager
    address public v3PositionManager;

    /// @notice Maximum allowed slippage for swaps (in basis points)
    uint256 public maxSlippageBps;

    /// @notice Maximum protocol fee an order may carry, in basis points.
    ///
    /// Defence in depth. The fee is already inside the commitment, so consensus
    /// has seen it; this bounds the damage if a verdict is ever issued for an
    /// order carrying an absurd fee.
    uint256 public maxFeeBps;

    /// @notice Ceiling the owner itself cannot raise `maxFeeBps` past.
    uint256 public constant ABSOLUTE_MAX_FEE_BPS = 500; // 5%

    /// @notice ERC-20 token whitelist
    mapping(address => bool) public approvedTokens;

    /// @notice Router / entrypoint whitelist
    mapping(address => bool) public approvedRouters;

    /// @notice Emergency pause flag
    bool public paused;

    // ── Events ────────────────────────────────────────────────────────────────

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
    event AgentAuthorisationUpdated(address indexed agent, bool allowed);
    event Paused(bool isPaused);
    event MaxFeeBpsUpdated(uint256 bps);

    event GenLayerValidatorUpdated(address indexed oldValidator, address indexed newValidator);

    /// @notice A GenLayer consensus round approved this commitment.
    event VerdictRecorded(bytes32 indexed commitment, uint64 expiry);
    event VerdictRevoked(bytes32 indexed commitment);
    event VerdictConsumed(bytes32 indexed commitment, address indexed user, VerdictSource source);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error ContractPaused();
    error TokenNotApproved(address token);
    error RouterNotApproved(address router);
    error SlippageExceeded(uint256 bps, uint256 maxBps);
    error DeadlineExpired();
    error ZeroAmount();
    error ZeroAddress();
    error SameToken();

    error ValidatorNotSet();
    error NotValidator(address caller);
    /// @notice No consensus verdict exists for the exact parameters being settled.
    error NoConsensusVerdict(bytes32 commitment);
    error VerdictExpired(bytes32 commitment);
    error CommitmentAlreadyUsed(bytes32 commitment);
    error InvalidCommitment();

    error RoleConflict(address account);
    /// @notice `genLayerValidator` was pointed at something with no code. An
    ///         Intelligent Contract always reaches the EVM through its ghost,
    ///         and a ghost is a contract, so an EOA here could only mean a key
    ///         was being installed where consensus belongs.
    error ValidatorNotAContract(address target);

    error RouteMismatch(bytes32 expected, bytes32 actual);
    error RouterMismatch(address expected, address actual);
    error FeeTooHigh(uint256 bps, uint256 maxBps);
    error QuoteInconsistent(uint256 minAmountOut, uint256 quotedAmountOut);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    /// @dev Gates who may RELAY a settlement. This is an operational control,
    ///      not the security boundary — the security boundary is the verdict
    ///      registry, which no agent can write to.
    modifier onlyAgent() {
        if (msg.sender != authorisedAgent && !agents[msg.sender]) revert Unauthorized();
        _;
    }

    /// @dev Gates who may AUTHORISE a settlement: the AgentValidator IC alone.
    modifier onlyValidator() {
        if (genLayerValidator == address(0)) revert ValidatorNotSet();
        if (msg.sender != genLayerValidator) revert NotValidator(msg.sender);
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier validDeadline(uint256 deadline) {
        if (deadline < block.timestamp) revert DeadlineExpired();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address _owner,
        address _authorisedAgent,
        address _aggFlowEntrypoint,
        address _v2Router,
        address _v3PositionManager,
        uint256 _maxSlippageBps,
        address[] memory _initialApprovedTokens
    ) Ownable(_owner) {
        if (_authorisedAgent   == address(0)) revert ZeroAddress();
        if (_aggFlowEntrypoint == address(0)) revert ZeroAddress();
        if (_v2Router          == address(0)) revert ZeroAddress();
        if (_v3PositionManager == address(0)) revert ZeroAddress();

        authorisedAgent   = _authorisedAgent;
        aggFlowEntrypoint = _aggFlowEntrypoint;
        v2Router          = _v2Router;
        v3PositionManager = _v3PositionManager;
        maxSlippageBps    = _maxSlippageBps;
        maxFeeBps         = 100; // 1% — the platform fee is 5 bps in practice
        paused            = false;

        approvedRouters[_aggFlowEntrypoint] = true;
        approvedRouters[_v2Router]          = true;
        approvedRouters[_v3PositionManager] = true;

        for (uint256 i = 0; i < _initialApprovedTokens.length; i++) {
            approvedTokens[_initialApprovedTokens[i]] = true;
        }
    }

    // ── Owner Admin ───────────────────────────────────────────────────────────

    /**
     * @notice Bootstrap or rotate the AgentValidator Intelligent Contract.
     * @dev The IC's ghost contract shares the IC's address, and external
     *      messages arrive with `msg.sender` set to it, so this is the address
     *      published for the validator on GenLayer.
     */
    function setGenLayerValidator(address _validator) external onlyOwner {
        if (_validator == address(0)) revert ZeroAddress();

        // The owner is the last remaining party who could subvert the verdict
        // registry, by pointing it at an address it holds the key for and then
        // calling `recordVerdict` directly. These two checks close the cheap
        // version of that. A ghost contract always has code, so requiring code
        // costs an honest deployment nothing and denies an EOA outright; and a
        // validator that is also a relayer would be one key on both sides of
        // the boundary the whole design is built around.
        if (_validator.code.length == 0) revert ValidatorNotAContract(_validator);
        if (_validator == authorisedAgent || agents[_validator]) revert RoleConflict(_validator);

        emit GenLayerValidatorUpdated(genLayerValidator, _validator);
        genLayerValidator = _validator;
    }

    function setAuthorisedAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        if (_agent == genLayerValidator) revert RoleConflict(_agent);
        emit AgentUpdated(authorisedAgent, _agent);
        authorisedAgent = _agent;
    }

    /**
     * @notice Register or revoke an additional relaying agent.
     * @dev The validator can never be enrolled as a relayer: one address that
     *      both authorises and executes is exactly what this contract denies.
     */
    function setAgentAuthorisation(address _agent, bool _allowed) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        if (_allowed && _agent == genLayerValidator) revert RoleConflict(_agent);
        agents[_agent] = _allowed;
        emit AgentAuthorisationUpdated(_agent, _allowed);
    }

    /// @notice True when `_who` may relay settlements.
    function isAgent(address _who) external view returns (bool) {
        return _who == authorisedAgent || agents[_who];
    }

    function setMaxSlippage(uint256 _bps) external onlyOwner {
        require(_bps <= 10_000, "Cannot exceed 100%");
        maxSlippageBps = _bps;
    }

    function setMaxFeeBps(uint256 _bps) external onlyOwner {
        if (_bps > ABSOLUTE_MAX_FEE_BPS) revert FeeTooHigh(_bps, ABSOLUTE_MAX_FEE_BPS);
        maxFeeBps = _bps;
        emit MaxFeeBpsUpdated(_bps);
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

    // ── Verdict Registry ──────────────────────────────────────────────────────

    /**
     * @notice Record a GenLayer consensus verdict for one commitment.
     *
     * @dev CALLABLE ONLY BY THE AGENTVALIDATOR INTELLIGENT CONTRACT. This is the
     *      authentication the whole design rests on: the IC emits an external
     *      message on finalization, its ghost delivers the call, and `msg.sender`
     *      is the IC's address. No key held by any operator can reach this.
     *
     * @dev WHY uint256 AND NOT bytes32. The commitment is a 32-byte hash and
     *      `bytes32` is its natural type, but this parameter is not really typed
     *      by Solidity — it is typed by the GenVM stub on the other side of the
     *      call, and py-genlayer builds the selector from the stub's declared
     *      types. GenLayer's documented type mapping covers `u256`/`u64` and
     *      says nothing about a `bytes32` equivalent, so declaring this
     *      `bytes32` would make the integration depend on an undocumented type
     *      being present in whichever runner version the IC is pinned to. Both
     *      types occupy one static ABI word, so `uint256` costs nothing and
     *      keeps the boundary inside what GenLayer actually guarantees.
     *
     * @param commitment The identifier the IC derived from the full order — the
     *                   same value the executor re-derives from calldata, passed
     *                   as a uint256 and used as bytes32.
     * @param expiry     Unix timestamp after which the verdict is stale. Bounds
     *                   how long an approval can sit unspent, independently of
     *                   the trade's own deadline — a verdict issued against a
     *                   live quote should not still be spendable an hour later.
     */
    function recordVerdict(uint256 commitment, uint64 expiry) external onlyValidator {
        bytes32 id = bytes32(commitment);
        if (id == bytes32(0)) revert InvalidCommitment();
        if (commitmentUsed[id]) revert CommitmentAlreadyUsed(id);
        verdictExpiry[id] = expiry;
        emit VerdictRecorded(id, expiry);
    }

    /**
     * @notice Withdraw a verdict that has not yet settled.
     * @dev Open to the validator IC and to the owner. Revocation can only ever
     *      subtract authority, so allowing the owner to do it adds a safety
     *      lever without adding a way to authorise anything.
     */
    function revokeVerdict(bytes32 commitment) external {
        if (msg.sender != genLayerValidator && msg.sender != owner()) revert Unauthorized();
        delete verdictExpiry[commitment];
        emit VerdictRevoked(commitment);
    }

    /// @notice True when `commitment` currently carries a live consensus verdict.
    function isVerdictLive(bytes32 commitment) external view returns (bool) {
        uint64 exp = verdictExpiry[commitment];
        return exp != 0 && block.timestamp <= exp;
    }

    /**
     * @dev Authorise and burn one commitment. Reverts unless the commitment is
     *      backed by a live verdict recorded by the AgentValidator IC. There is
     *      no other way to satisfy it.
     *
     *      The used-marker is written BEFORE any external call in the caller, so
     *      a commitment can never settle twice even across a reentrant path.
     */
    function _consumeVerdict(
        bytes32 commitment,
        address user
    ) internal returns (VerdictSource source) {
        if (commitmentUsed[commitment]) revert CommitmentAlreadyUsed(commitment);

        uint64 exp = verdictExpiry[commitment];
        // No verdict on record means no consensus round approved these exact
        // parameters. There is no alternative branch to fall through to.
        if (exp == 0) revert NoConsensusVerdict(commitment);
        if (block.timestamp > exp) revert VerdictExpired(commitment);

        delete verdictExpiry[commitment];
        source = VerdictSource.GenLayerConsensus;

        commitmentUsed[commitment] = true;
        emit VerdictConsumed(commitment, user, source);
    }

    // ── Commitment Helpers ────────────────────────────────────────────────────
    //
    // Public so the validator IC, the settlement agent and the frontend all
    // derive the identifier from one implementation instead of three.

    /// @notice The commitment for a swap order, bound to this chain and contract.
    function getSwapCommitment(SwapOrder calldata order) public view returns (bytes32) {
        return TradeHashLib.swapCommitment(order, block.chainid, address(this));
    }

    function getLiquidityV2AddHash(
        address user,
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256 amountAMin, uint256 amountBMin,
        uint256 deadline
    ) public view returns (bytes32) {
        return TradeHashLib.v2AddHash(
            user, tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin,
            deadline, block.chainid, address(this)
        );
    }

    function getLiquidityV2RemoveHash(
        address user,
        address tokenA, address tokenB,
        address lpToken, uint256 lpAmount,
        uint256 amountAMin, uint256 amountBMin,
        uint256 deadline
    ) public view returns (bytes32) {
        return TradeHashLib.v2RemoveHash(
            user, tokenA, tokenB,
            lpToken, lpAmount,
            amountAMin, amountBMin,
            deadline, block.chainid, address(this)
        );
    }

    function getLiquidityV3AddHash(
        address user,
        IV3PositionManager.MintParams calldata params
    ) public view returns (bytes32) {
        return TradeHashLib.v3AddHash(user, params, block.chainid, address(this));
    }

    function getLiquidityV3RemoveHash(
        address user,
        IV3PositionManager.DecreaseLiquidityParams calldata params,
        uint256 tokenId,
        address token0,
        address token1
    ) public view returns (bytes32) {
        return TradeHashLib.v3RemoveHash(
            user, params, tokenId, token0, token1, block.chainid, address(this)
        );
    }

    // ── Safety ────────────────────────────────────────────────────────────────

    /// @notice Owner can rescue stuck ERC-20 tokens.
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Owner can rescue stuck ETH.
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
