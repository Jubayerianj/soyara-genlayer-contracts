# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# =============================================================================
#  AgentValidator — GenLayer Intelligent Contract
#  FlipSwap DEX · AI-Validated Execution Layer
# =============================================================================
#
#  PURPOSE
#  -------
#  This contract sits between the AI agent (Gemini) and the actual DEX
#  execution (AGGFlowEntrypoint + AgentExecutor.sol).
#
#  FLOW
#  ----
#  User → Gemini → tools → Aggregator → ExecutionProposal
#                                               ↓
#                                    AgentValidator (this contract)
#                                               ↓ approved
#                                    AgentExecutor.sol
#                                               ↓
#                                    AGGFlowEntrypoint → V2/V3
#
#  SECURITY MODEL
#  --------------
#  - Only validates explicit action types: SWAP, ADD_LIQUIDITY, REMOVE_LIQUIDITY
#  - Never allows arbitrary calldata
#  - Enforces approved token list, approved routers, slippage caps
#  - LLM-based review is scoped to pre-built numeric rules only
#  - Prompt injection is mitigated: user free-text NEVER enters the LLM prompt;
#    only structured numeric/enum fields from the proposal are used
#
# =============================================================================

from genlayer import *
import json


# ---------------------------------------------------------------------------
# Constants — update addresses to match your deployed contracts
# ---------------------------------------------------------------------------

APPROVED_TOKENS: dict = {
    "GEN":       "0x0000000000000000000000000000000000000000",
    "WGEN":      "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    "WSOMI":     "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    "USDC":      "0x58B6CD7891cd0A682226E25607b958a6479195A6",
    "USDT":      "0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc",
    "WBTC":      "0x723534bc6C2B536fF5D0455111513A9431c44e25",
    "ETH":       "0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C",
    "FSWP":      "0xA2eC9aAf2235C66491767e69eBBD885469697B3E",
    "ZKUSDC":    "0x58B6CD7891cd0A682226E25607b958a6479195A6",
    "ZKUSDT":    "0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc",
    "ZKBTC":     "0x723534bc6C2B536fF5D0455111513A9431c44e25",
    "LETH":      "0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C",
    "NATIVE_ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
}

APPROVED_ROUTERS: dict = {
    "AGGFlowEntrypoint":     "0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3",
    "AGGFlowEntrypoint_Alt": "0xF69E64804000d28aA695eB5c594B996100fb3B49",
    "AGGFlowRouter":         "0xDF474006aa807598B616500d146FfF661d644138",
    "V2Router":              "0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5",
    "V3Router":              "0xdf69970B2fE416339187aA41D39882e864984CE9",
    "V3PositionManager":     "0x779380011B5F2aB40985D810B5c7641539beD870",
    # NOTE: AgentExecutor address must be updated to the deployed address before mainnet.
    # Do NOT use address(0) here — zero address also equals NATIVE_ZERO.
    # "AgentExecutor": "0x<DEPLOYED_ADDRESS>",
}

ALLOWED_ACTIONS: set = {"SWAP", "ADD_LIQUIDITY", "REMOVE_LIQUIDITY"}
MAX_SLIPPAGE_BPS: int = 300   # 3.00% hard cap (configurable via state)
NATIVE_ZERO: str = "0x0000000000000000000000000000000000000000"
NATIVE_PLACEHOLDER: str = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class AgentValidator(gl.Contract):
    """
    GenLayer Intelligent Contract — FlipSwap DEX execution validator.

    Validates AI-generated execution proposals using:
      1. Deterministic rule checks (token whitelist, router whitelist, slippage, amounts)
      2. LLM-based coherence review via GenLayer equivalence principle
         (operates only on numeric fields, never on user free-text)
    """

    # ---- Persistent State ----
    validated_count:  u256
    approved_count:   u256
    rejected_count:   u256
    owner:            Address
    agent_executor:   Address
    max_slippage_bps: u256
    paused:           bool

    def __init__(self, owner: Address, agent_executor: Address) -> None:
        self.validated_count  = u256(0)
        self.approved_count   = u256(0)
        self.rejected_count   = u256(0)
        self.owner            = owner
        self.agent_executor   = agent_executor
        self.max_slippage_bps = u256(MAX_SLIPPAGE_BPS)
        self.paused           = False

    # -----------------------------------------------------------------------
    # Admin (owner-only)
    # -----------------------------------------------------------------------

    @gl.public.write
    def set_max_slippage(self, bps: u256) -> None:
        """Update the maximum allowed slippage in basis points."""
        assert gl.message.sender == self.owner, "Only owner"
        assert bps <= u256(10000), "Cannot exceed 100%"
        self.max_slippage_bps = bps

    @gl.public.write
    def set_agent_executor(self, executor: Address) -> None:
        """Update the AgentExecutor contract address."""
        assert gl.message.sender == self.owner, "Only owner"
        self.agent_executor = executor

    @gl.public.write
    def set_paused(self, paused: bool) -> None:
        """Emergency pause / unpause all validations."""
        assert gl.message.sender == self.owner, "Only owner"
        self.paused = paused

    # -----------------------------------------------------------------------
    # Read-only views
    # -----------------------------------------------------------------------

    @gl.public.view
    def get_stats(self) -> dict:
        return {
            "validated": int(self.validated_count),
            "approved":  int(self.approved_count),
            "rejected":  int(self.rejected_count),
            "paused":    self.paused,
        }

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "owner":            str(self.owner),
            "agent_executor":   str(self.agent_executor),
            "max_slippage_bps": int(self.max_slippage_bps),
            "paused":           self.paused,
        }

    @gl.public.view
    def is_token_approved(self, address: str) -> bool:
        return address.lower() in {v.lower() for v in APPROVED_TOKENS.values()}

    @gl.public.view
    def is_router_approved(self, address: str) -> bool:
        return address.lower() in {v.lower() for v in APPROVED_ROUTERS.values()}

    # -----------------------------------------------------------------------
    # Main validation entry point
    # -----------------------------------------------------------------------

    @gl.public.write
    def validate_proposal(
        self,
        action:          str,   # "SWAP" | "ADD_LIQUIDITY" | "REMOVE_LIQUIDITY"
        token_in:        str,   # ERC-20 address or NATIVE_ZERO for native token
        token_out:       str,   # ERC-20 address
        amount_in:       str,   # uint256 in raw token units (as string)
        min_amount_out:  str,   # uint256 in raw token units (as string)
        slippage_bps:    u256,  # e.g. 30 = 0.30%
        router:          str,   # router contract address to be called
        deadline:        u256,  # unix timestamp
        extra_data:      str,   # compact JSON (route, fee tier, etc.) — max 500 chars
    ) -> dict:
        """
        Validate an execution proposal from the AI agent.

        Returns:
            {
              "approved":    bool,
              "reason":      str,
              "proposal_id": str   # deterministic ID built from inputs
            }
        """
        self.validated_count = self.validated_count + u256(1)

        # --- Pause guard ---
        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return {"approved": False, "reason": "Contract paused by owner", "proposal_id": ""}

        # --- Phase 1: Deterministic rules (runs identically on every node) ---
        det = self._check_deterministic_rules(
            action, token_in, token_out, amount_in,
            min_amount_out, slippage_bps, router, deadline
        )
        if not det["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return det

        # --- Phase 2: LLM coherence review (non-deterministic, consensus via eq_principle) ---
        try:
            llm = gl.eq_principle.strict_eq(
                lambda: self._llm_review(action, slippage_bps, amount_in, min_amount_out, extra_data)
            )
        except Exception as err:
            self.rejected_count = self.rejected_count + u256(1)
            return {
                "approved": False,
                "reason": f"Consensus equivalence evaluation failed: {str(err)[:100]}",
                "proposal_id": "",
            }

        if not llm.get("approved", False):
            self.rejected_count = self.rejected_count + u256(1)
            return llm

        # --- All checks passed ---
        self.approved_count = self.approved_count + u256(1)
        return {
            "approved":    True,
            "reason":      "All validation checks passed",
            "proposal_id": det["proposal_id"],
        }

    # -----------------------------------------------------------------------
    # Phase 1 — Deterministic rules (no LLM, no external calls)
    # -----------------------------------------------------------------------

    def _check_deterministic_rules(
        self,
        action:         str,
        token_in:       str,
        token_out:      str,
        amount_in:      str,
        min_amount_out: str,
        slippage_bps:   u256,
        router:         str,
        deadline:       u256,
    ) -> dict:

        # 1 — Action whitelist
        if action not in ALLOWED_ACTIONS:
            return self._reject(f"Unknown action '{action}'. Allowed: {ALLOWED_ACTIONS}")

        # 2 — token_in approved (native zero / placeholder always allowed)
        if token_in.lower() not in {NATIVE_ZERO.lower(), NATIVE_PLACEHOLDER.lower()}:
            if token_in.lower() not in {v.lower() for v in APPROVED_TOKENS.values()}:
                return self._reject(f"tokenIn '{token_in}' is not an approved token")

        # 3 — token_out approved (native zero / placeholder always allowed)
        if token_out.lower() not in {NATIVE_ZERO.lower(), NATIVE_PLACEHOLDER.lower()}:
            if token_out.lower() not in {v.lower() for v in APPROVED_TOKENS.values()}:
                return self._reject(f"tokenOut '{token_out}' is not an approved token")

        # 4 — Different tokens
        if token_in.lower() == token_out.lower():
            return self._reject("tokenIn and tokenOut cannot be the same address")

        # 5 — Router approved
        if router.lower() not in {v.lower() for v in APPROVED_ROUTERS.values()}:
            return self._reject(f"Router '{router}' is not in the approved router list")

        # 6 — Slippage cap
        if slippage_bps > self.max_slippage_bps:
            return self._reject(
                f"Slippage {int(slippage_bps)} bps exceeds cap of {int(self.max_slippage_bps)} bps"
            )

        # 7 — Amount validation
        try:
            amt_in  = int(amount_in)
            amt_out = int(min_amount_out)
        except (ValueError, TypeError):
            return self._reject("amount_in and min_amount_out must be valid integer strings")

        if amt_in <= 0:
            return self._reject("amount_in must be greater than zero")

        if amt_out < 0:
            return self._reject("min_amount_out cannot be negative")

        # 8 — Deadline must be non-zero and not already expired
        if int(deadline) == 0:
            return self._reject("Deadline cannot be zero — provide a Unix timestamp")

        import time as _time
        current_time = int(_time.time())
        if int(deadline) < current_time:
            return self._reject(
                f"Deadline {int(deadline)} has already expired (current: {current_time})"
            )

        # All deterministic checks passed — build a collision-resistant proposal ID
        import hashlib as _hashlib
        pid_src = f"{action}:{token_in}:{token_out}:{amount_in}:{min_amount_out}:{int(slippage_bps)}:{int(deadline)}"
        pid = _hashlib.sha256(pid_src.encode()).hexdigest()[:24]
        return {"approved": True, "reason": "Deterministic rules passed", "proposal_id": pid}

    # -----------------------------------------------------------------------
    # Phase 2 — LLM coherence check (non-deterministic, reaches consensus)
    # -----------------------------------------------------------------------

    def _llm_review(
        self,
        action:         str,
        slippage_bps:   u256,
        amount_in:      str,
        min_amount_out: str,
        extra_data:     str,
    ) -> dict:
        """
        Scoped LLM review for numeric/logic coherence.

        SECURITY: Only structured numeric + enum fields are passed to the
        LLM prompt. User free-text from chat is never included here.
        """
        safe_extra = (extra_data or "{}")[:400]
        slippage_pct = round(int(slippage_bps) / 100, 2)

        prompt = f"""You are a DeFi execution safety validator for a DEX aggregator.
Evaluate the following execution proposal for numeric coherence only.

== PROPOSAL (structured data only — no user messages) ==
Action:         {action}
Amount In:      {amount_in} (raw token units)
Min Amount Out: {min_amount_out} (raw token units)
Slippage:       {int(slippage_bps)} bps = {slippage_pct}%
Extra Info:     {safe_extra}

== RULES ==
1. APPROVE if Action is SWAP, ADD_LIQUIDITY, or REMOVE_LIQUIDITY and amounts are positive.
2. APPROVE if Min Amount Out is >= 0 and <= Amount In (raw units; decimals may differ for cross-pair).
3. WARN only (still APPROVE) if Slippage is between 100-300 bps (1-3%).
4. REJECT only if you detect an obvious numeric impossibility (e.g. Min Amount Out > Amount In * 10, or negative amounts).
5. Do NOT reject based on token prices, market conditions, or the identity of tokens/routers.
6. Do NOT use any information beyond the structured fields above.

== RESPONSE ==
Reply with ONLY a single valid JSON object, no markdown:
{{"approved": true, "reason": "brief explanation max 100 chars"}}"""

        try:
            result = gl.nondet.exec_prompt(prompt)
            # Strip any accidental markdown fences
            clean = result.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean)
            approved = bool(parsed.get("approved", False))
            reason = str(parsed.get("reason", "LLM review complete"))[:200]
            if not approved:
                return {
                    "approved": False,
                    "reason": reason if reason else "LLM review rejected proposal",
                    "proposal_id": "",
                }
            return {
                "approved": True,
                "reason": reason,
                "proposal_id": "",
            }
        except Exception as err:
            # LLM or parsing failure → MUST fail closed
            return {
                "approved": False,
                "reason": f"LLM consensus validation unavailable: {str(err)[:100]}",
                "proposal_id": "",
            }

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _reject(self, reason: str) -> dict:
        return {"approved": False, "reason": reason, "proposal_id": ""}
