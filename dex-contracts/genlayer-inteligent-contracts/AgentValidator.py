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
from dataclasses import dataclass
import json
import hashlib


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

# NOTE: keep this in sync with DEPLOYMENTS.md / frontend/flipswap/constants/addresses.js.
# AGGFlowEntrypoint and AGGFlowRouter were redeployed alongside AgentExecutor — the
# previous entries here pointed at the pre-redeployment addresses, which caused every
# real proposal (frontend always submits the current aggregatorEntrypoint) to fail the
# deterministic router-whitelist check below.
APPROVED_ROUTERS: dict = {
    "AGGFlowEntrypoint":        "0x95feE6Cb918Ed9C621E36082EE8D998873031EaA",
    "AGGFlowEntrypoint_Legacy": "0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3",
    "AGGFlowEntrypoint_Legacy2": "0xF69E64804000d28aA695eB5c594B996100fb3B49",
    "AGGFlowRouter":            "0xafCAD2bf0E85e30a2b54ac6491dC81987cE7767C",
    "AGGFlowRouter_Legacy":     "0xDF474006aa807598B616500d146FfF661d644138",
    "V2Router":                 "0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5",
    "V3Router":                 "0xdf69970B2fE416339187aA41D39882e864984CE9",
    "V3PositionManager":        "0x779380011B5F2aB40985D810B5c7641539beD870",
    "AgentExecutor":            "0xaE547F01f9ddCa4dB66cdbf0727f7563Fc44bC26",
}

def addr(value) -> str:
    """
    Normalise an address argument to a lowercase string.

    GenLayer calldata is self-describing, so an address-shaped argument can
    arrive either as a plain `str` (what genlayer-js sends for a `str` param)
    or as an `Address` object (what the genlayer CLI produces when an argument
    looks like 40 hex chars). Calling `.lower()` directly blows up on the
    latter with "'Address' object has no attribute 'lower'", which previously
    made the whole validation revert. Going through `str()` accepts both.
    """
    return str(value).strip().lower()


ALLOWED_ACTIONS: set = {"SWAP", "ADD_LIQUIDITY", "REMOVE_LIQUIDITY"}
MAX_SLIPPAGE_BPS: int = 300   # 3.00% hard cap (configurable via state)
NATIVE_ZERO: str = "0x0000000000000000000000000000000000000000"
NATIVE_PLACEHOLDER: str = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"


# ===========================================================================
#  SETTLEMENT BINDING — the executor's commitment, recomputed here
# ===========================================================================
#
#  WHY THIS SECTION EXISTS
#  -----------------------
#  This contract used to produce a 24-character SHA-256 digest over seven
#  fields and store it as `proposal_id`. Nothing on chain referred to that
#  value. The settlement agent read the verdict off this contract, decided it
#  was satisfied, and then wrote its OWN approval into AgentExecutor with a
#  privileged `approveTradeWithParams` call. Consensus was advisory; the agent's
#  private key was the real authority.
#
#  The identifier below is no longer this contract's private bookkeeping. It is
#  byte-for-byte the commitment AgentExecutor recomputes from the calldata it
#  settles (see TradeHashLib.swapCommitment and SettlementTypes.sol), and this
#  contract sends it to the executor itself. Two consequences follow:
#
#    · Approval can only originate from a consensus round. External messages
#      leave an IC through its ghost contract, so the executor sees msg.sender
#      equal to this contract's address and rejects everyone else.
#    · The verdict covers the WHOLE order — route, fee, fee collector, user,
#      router and the quote — so there is no parameter left for an agent to
#      choose after the round has ended.
#
#  The encoding must match Solidity's `abi.encode` exactly. Every field of the
#  SwapOrder struct is a static 32-byte word, so the encoding is a plain
#  concatenation and needs no dynamic offsets. Field ORDER is load-bearing and
#  must track SettlementTypes.sol.
# ===========================================================================

from datetime import datetime, timezone

# NOTE ON IMPORTS: u24 / u64 / u160 / u256 / Address all arrive through
# `from genlayer import *` above, and must NOT be imported from `genlayer.types`
# explicitly.
#
# That explicit import is what the py-genlayer source suggests and it is exactly
# what broke the first deployment of this contract: the round reached consensus,
# the ghost contract appeared at the address, and the IC behind it silently did
# not exist. The receipt says FINISHED_WITH_ERROR and nothing else - no
# traceback, no message - so from the outside it looks identical to a successful
# deploy until the first call returns "contract not found".
#
# Isolated with two throwaway contracts: one importing these names from
# `genlayer.types` failed, an otherwise identical one relying on the star import
# succeeded. `@gl.evm.contract_interface` itself is fine on this runner.


# ---------------------------------------------------------------------------
# keccak-256
# ---------------------------------------------------------------------------
#
#  The commitment is a keccak-256 hash, and it has to be byte-identical to the
#  one Solidity computes. The GenVM runtime ships an implementation, but it is
#  not part of the DOCUMENTED API surface, so its import path is not something a
#  pinned runner version guarantees. If it is missing, this contract would fail
#  at import - taking down validation entirely rather than degrading.
#
#  So: use the runtime's implementation when it is there, and fall back to the
#  vendored one below when it is not. Keccak-256 is a fixed algorithm with fixed
#  test vectors, so the fallback is not an approximation of the real thing, it IS
#  the real thing; test_commitment_conformance.py exercises both paths and pins
#  them to the same vectors.
# ---------------------------------------------------------------------------

_KECCAK_MASK64 = (1 << 64) - 1

_KECCAK_RC = (
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
)

_KECCAK_ROT = (
    (0, 36, 3, 41, 18),
    (1, 44, 10, 45, 2),
    (62, 6, 43, 15, 61),
    (28, 55, 25, 21, 56),
    (27, 20, 39, 8, 14),
)


def _rotl64(value: int, shift: int) -> int:
    shift &= 63
    if shift == 0:
        return value & _KECCAK_MASK64
    return ((value << shift) | (value >> (64 - shift))) & _KECCAK_MASK64


def _keccak_f1600(lanes: list) -> None:
    for rnd in range(24):
        c = [lanes[x][0] ^ lanes[x][1] ^ lanes[x][2] ^ lanes[x][3] ^ lanes[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rotl64(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                lanes[x][y] ^= d[x]

        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rotl64(lanes[x][y], _KECCAK_ROT[x][y])

        for x in range(5):
            for y in range(5):
                lanes[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y] & _KECCAK_MASK64) & b[(x + 2) % 5][y])

        lanes[0][0] ^= _KECCAK_RC[rnd]


def _keccak256_vendored(data: bytes) -> bytes:
    rate = 136
    lanes = [[0] * 5 for _ in range(5)]

    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % rate != 0:
        padded.append(0x00)
    padded[-1] ^= 0x80

    for offset in range(0, len(padded), rate):
        block = padded[offset:offset + rate]
        for i in range(rate // 8):
            lane = int.from_bytes(block[i * 8:(i + 1) * 8], "little")
            lanes[i % 5][i // 5] ^= lane
        _keccak_f1600(lanes)

    out = bytearray()
    for i in range(4):
        out += lanes[i % 5][i // 5].to_bytes(8, "little")
    return bytes(out)


#  Resolution order, established by probing the live runner rather than reading
#  the SDK source:
#
#    1. `gl.Keccak256` - present on the pinned Bradbury runner, and the only one
#       of these that is reachable through the documented `gl` surface.
#    2. `genlayer.types.keccak` - the path the py-genlayer source suggests. It is
#       NOT present on the pinned runner, which is exactly why this is a chain of
#       fallbacks and not a single import.
#    3. The vendored implementation above.
def _resolve_keccak():  # pragma: no cover - runner dependent
    impl = getattr(gl, "Keccak256", None)
    if impl is not None:
        try:
            if impl(b"").digest().hex().startswith("c5d24601"):
                return lambda data: impl(data).digest()
        except Exception:
            pass
    try:
        from genlayer.types.keccak import Keccak256 as _RuntimeKeccak256

        if _RuntimeKeccak256(b"").digest().hex().startswith("c5d24601"):
            return lambda data: _RuntimeKeccak256(data).digest()
    except Exception:
        pass
    return _keccak256_vendored


# Each candidate is checked against the known digest of the empty string before
# it is trusted. A hash that is subtly wrong produces commitments that match
# nothing, and every settlement then fails for a reason no log would explain.
_keccak_backend = _resolve_keccak()



# GenLayer Bradbury. Mixed into every commitment so a verdict minted here can
# never be replayed against a deployment on another chain.
CHAIN_ID: int = 4221

# Soyara DEX contracts consulted for live route and quote facts.
# Keep in sync with frontend/flipswap/constants/addresses.js and DEPLOYMENTS.md.
V2_FACTORY: str = "0x4680BCe1632824d30D2F53656dD610736c3e312e"
V3_FACTORY: str = "0xBd959038300aF0C8dd1873E497d6D0a565b4E246"
V3_QUOTER:  str = "0xca4914407868bc37ccbE324cA149DD475d39A2Bf"
WGEN:       str = "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e"

# Fee policy. AgentExecutor caps feeBps independently; this is the tighter
# policy rule, and it also pins WHO may receive the fee — the parameter that was
# previously free for the agent to choose.
CANONICAL_FEE_COLLECTOR: str = "0x48234eD645676b794a4CbC7483513e58cB04e22E"
MAX_FEE_BPS: int = 100

# The input-side fee AGGFlowEntrypoint takes before the route runs. The
# simulation must subtract it or every quote check would be systematically off.
ENTRYPOINT_FEE_BPS: int = 5

# How far the agent's declared quote may sit from the one recomputed from live
# reserves. Covers block-to-block drift between quoting and validation without
# admitting a fabricated number.
QUOTE_TOLERANCE_BPS: int = 50

# How long a verdict stays spendable, in seconds.
#
# This MUST exceed the appeal window, and that is not a tuning preference.
#
# The expiry is computed here, during the consensus round, but the verdict does
# not reach AgentExecutor until the round FINALIZES, because it travels as an
# external message and those are delivered on finalization only. So the clock
# starts long before the verdict can be used. Set this below the appeal window
# and every verdict arrives already expired: the executor stores it, reports
# isVerdictLive() as false forever, and no trade can ever settle.
#
# That is exactly what happened on the first live run. A 900-second TTL against
# an appeal window of roughly 40 minutes meant the verdict expired about 25
# minutes before it was delivered. Nothing in the contract or the executor was
# wrong; the two clocks simply did not overlap.
#
# Two hours leaves generous headroom over the observed window. Quote freshness
# is NOT what this bounds - that is enforced by the executor's quote-band check
# and by the trade's own deadline, whichever is sooner.
VERDICT_TTL_SECONDS: int = 7200

# V3 fee tiers Soyara deploys, and the protocol tick bound.
#
# A TUPLE, not a set, and the order is load-bearing. `_any_canonical_v3_pool`
# iterates these and returns the first pool it finds, so the result depends on
# iteration order. Set ordering is a function of hashing rather than of the
# source, which is not the kind of thing to rely on inside a consensus round
# where every validator must reach a byte-identical answer. A tuple iterates in
# written order, everywhere, always.
V3_FEE_TIERS: tuple = (500, 3000, 10000)
V3_MAX_TICK: int = 887272

# Route program opcodes and pool types — see AGGFlow.sol.
_OP_END              = 0x00
_OP_ROUTER_ERC20     = 0x01
_OP_USER_ERC20       = 0x02
_OP_NATIVE           = 0x03
_OP_ONE_POOL         = 0x04
_OP_APPLY_PERMIT     = 0x05

_PT_UNIV2 = 0
_PT_UNIV3 = 1
_PT_WRAP  = 2

_DIRECTION_TOKEN0_TO_TOKEN1 = 0


# ---------------------------------------------------------------------------
# EVM interfaces
# ---------------------------------------------------------------------------
#
# NOTE ON SHAPE: py-genlayer builds the Solidity selector from the Python method
# name VERBATIM — there is no snake_case-to-camelCase conversion — and asserts
# that every parameter is positional-only. Hence the camelCase names and the
# trailing `/` in each signature. Getting either wrong produces a selector that
# matches no function on the target contract.

# ---------------------------------------------------------------------------
# EVM calls
# ---------------------------------------------------------------------------
#
#  These go through `gl.vm.gl_call.gl_call_generic` rather than the documented
#  `@gl.evm.contract_interface` accessor, because that accessor DOES NOT WORK on
#  the pinned Bradbury runner.
#
#  The generated proxy stores the target contract at `_proxy_parent`, while the
#  call implementation reads `self.parent`, so every call raises
#  `AttributeError: '...ViewProxy' object has no attribute 'parent'` before it
#  reaches the chain. Verified on the live network: a throwaway contract calling
#  the V2 factory through the accessor failed on both the eager and the lazy
#  accessor, and the same call through the bridge below returned the correct
#  pair address. It is an inconsistency inside the SDK, not something a contract
#  can hold differently.
#
#  Using an undocumented entry point is a real cost and not one to pay lightly -
#  the documented surface is what a pinned runner guarantees. It is paid here
#  because the documented path is broken on this runner and the alternative is
#  no on-chain verification of route or quote at all, which is the substance of
#  what the validators are for. `_evm_view` tries the documented accessor first
#  precisely so that a fixed SDK is picked up automatically.
#
#  The encoder itself (`gl.evm.MethodEncoder`) is the SDK's own, so selectors and
#  ABI encoding stay the SDK's responsibility either way.

def _evm_view(address: str, method: str, params: tuple, ret, args: tuple):
    """
    One EVM view call: encode, call, decode.

    `params` and `ret` are GenLayer type objects, so the selector is derived by
    the SDK exactly as it would be for a declared interface.
    """
    encoder = gl.evm.MethodEncoder(method, params, ret)
    calldata = encoder.encode_call(args)
    result = gl.vm.gl_call.gl_call_generic(
        {"EthCall": {"address": Address(addr(address)), "calldata": calldata}},
        lambda raw: gl.evm.decode(ret, raw),
    )
    return result.get() if hasattr(result, "get") else result


def _evm_send(address: str, method: str, params: tuple, args: tuple) -> None:
    """
    Emit an external message to an EVM contract.

    This is the call that carries the verdict out of GenVM: it leaves through
    this contract's ghost, so the recipient sees `msg.sender` equal to this
    contract's address. Delivery happens on FINALIZATION, never on acceptance.
    """
    encoder = gl.evm.MethodEncoder(method, params, type(None))
    calldata = encoder.encode_call(args)
    result = gl.vm.gl_call.gl_call_generic(
        {"EthSend": {"address": Address(addr(address)), "calldata": calldata, "value": 0}},
        lambda _raw: None,
    )
    if hasattr(result, "get"):
        result.get()


# ---------------------------------------------------------------------------
# ABI word helpers
# ---------------------------------------------------------------------------

def _word_uint(value: int) -> bytes:
    """One abi.encode word for a uint256."""
    v = int(value)
    if v < 0 or v >= (1 << 256):
        raise ValueError(f"uint256 out of range: {value}")
    return v.to_bytes(32, "big")


def _word_addr(value) -> bytes:
    """One abi.encode word for an address (left-padded to 32 bytes)."""
    hex_str = addr(value)
    if hex_str.startswith("0x"):
        hex_str = hex_str[2:]
    if len(hex_str) != 40:
        raise ValueError(f"not a 20-byte address: {value}")
    return bytes(12) + bytes.fromhex(hex_str)


def _word_int(value: int) -> bytes:
    """
    One abi.encode word for a SIGNED integer (int24 ticks).

    Solidity sign-extends a negative int24 across the full 32 bytes, so a naive
    unsigned encoding of a negative tick produces a different commitment. V3
    ranges below the current price have negative ticks routinely, which makes
    this the ordinary case rather than an edge one.
    """
    v = int(value)
    if v < -(1 << 255) or v >= (1 << 255):
        raise ValueError(f"int256 out of range: {value}")
    if v < 0:
        v += 1 << 256
    return v.to_bytes(32, "big")


def _word_bytes32(value) -> bytes:
    """One abi.encode word for a bytes32, given as 0x-prefixed hex."""
    hex_str = str(value).strip().lower()
    if hex_str.startswith("0x"):
        hex_str = hex_str[2:]
    if len(hex_str) != 64:
        raise ValueError(f"not a 32-byte value: {value}")
    return bytes.fromhex(hex_str)


def _keccak(data: bytes) -> bytes:
    return _keccak_backend(data)


# Type tags, matching TradeHashLib. Versioned so an identifier minted under the
# old seven-field scheme cannot be presented to the new executor.
_SWAP_TYPE_TAG      = _keccak(b"SOYARA_SWAP_V2")
_V2_ADD_TYPE_TAG    = _keccak(b"SOYARA_V2_ADD_V2")
_V2_REMOVE_TYPE_TAG = _keccak(b"SOYARA_V2_REMOVE_V2")
_V3_ADD_TYPE_TAG    = _keccak(b"SOYARA_V3_ADD_V2")
_V3_REMOVE_TYPE_TAG = _keccak(b"SOYARA_V3_REMOVE_V2")


def _commitment_key(value) -> str:
    """
    A commitment in the canonical form the storage map is keyed by.

    Accepts the hex string, or the integer some callers turn it into, and
    returns lowercase 0x-prefixed hex either way.
    """
    if isinstance(value, int):
        return "0x" + value.to_bytes(32, "big").hex()
    text = str(value).strip().lower()
    if not text.startswith("0x"):
        text = "0x" + text
    return text


def swap_commitment(order: dict, executor: str) -> bytes:
    """
    The 32-byte identifier AgentExecutor will recompute at settlement.

    Mirrors:
        keccak256(abi.encode(SWAP_TYPE, chainId, executor, SwapOrder))

    Field order tracks SettlementTypes.sol and MUST NOT be reordered: a mismatch
    does not fail loudly, it silently produces an identifier the executor will
    never recognise, and every settlement then reverts as unapproved.
    """
    return _keccak(
        _SWAP_TYPE_TAG
        + _word_uint(CHAIN_ID)
        + _word_addr(executor)
        + _word_addr(order["user"])
        + _word_addr(order["token_in"])
        + _word_addr(order["token_out"])
        + _word_uint(order["amount_in"])
        + _word_uint(order["min_amount_out"])
        + _word_uint(order["quoted_amount_out"])
        + _word_uint(order["slippage_bps"])
        + _word_uint(order["deadline"])
        + _word_addr(order["router"])
        + _word_uint(order["fee_bps"])
        + _word_addr(order["fee_collector"])
        + _word_bytes32(order["route_hash"])
        + _word_uint(order["nonce"])
    )


def v2_add_commitment(op: dict, executor: str) -> bytes:
    """Mirrors TradeHashLib.v2AddHash."""
    return _keccak(
        _V2_ADD_TYPE_TAG
        + _word_uint(CHAIN_ID)
        + _word_addr(executor)
        + _word_addr(op["user"])
        + _word_addr(op["token_a"])
        + _word_addr(op["token_b"])
        + _word_uint(op["amount_a_desired"])
        + _word_uint(op["amount_b_desired"])
        + _word_uint(op["amount_a_min"])
        + _word_uint(op["amount_b_min"])
        + _word_uint(op["deadline"])
    )


def v2_remove_commitment(op: dict, executor: str) -> bytes:
    """Mirrors TradeHashLib.v2RemoveHash."""
    return _keccak(
        _V2_REMOVE_TYPE_TAG
        + _word_uint(CHAIN_ID)
        + _word_addr(executor)
        + _word_addr(op["user"])
        + _word_addr(op["token_a"])
        + _word_addr(op["token_b"])
        + _word_addr(op["lp_token"])
        + _word_uint(op["lp_amount"])
        + _word_uint(op["amount_a_min"])
        + _word_uint(op["amount_b_min"])
        + _word_uint(op["deadline"])
    )


def v3_add_commitment(op: dict, executor: str) -> bytes:
    """Mirrors TradeHashLib.v3AddHash."""
    return _keccak(
        _V3_ADD_TYPE_TAG
        + _word_uint(CHAIN_ID)
        + _word_addr(executor)
        + _word_addr(op["user"])
        + _word_addr(op["token0"])
        + _word_addr(op["token1"])
        + _word_uint(op["fee"])
        + _word_int(op["tick_lower"])
        + _word_int(op["tick_upper"])
        + _word_uint(op["amount0_desired"])
        + _word_uint(op["amount1_desired"])
        + _word_uint(op["amount0_min"])
        + _word_uint(op["amount1_min"])
        + _word_uint(op["deadline"])
    )


def v3_remove_commitment(op: dict, executor: str) -> bytes:
    """Mirrors TradeHashLib.v3RemoveHash."""
    return _keccak(
        _V3_REMOVE_TYPE_TAG
        + _word_uint(CHAIN_ID)
        + _word_addr(executor)
        + _word_addr(op["user"])
        + _word_uint(op["token_id"])
        + _word_addr(op["token0"])
        + _word_addr(op["token1"])
        + _word_uint(op["liquidity"])
        + _word_uint(op["amount0_min"])
        + _word_uint(op["amount1_min"])
        + _word_uint(op["deadline"])
    )


# ---------------------------------------------------------------------------
# Route program decoding
# ---------------------------------------------------------------------------
#
#  The commitment binds keccak256(aggProgram). Verifying a JSON *description* of
#  the route would leave the description and the executed bytes free to disagree,
#  so the validators decode the program bytes themselves and check the hash. What
#  is verified below is therefore exactly what runs.
#
#  Anything the grammar does not cover is refused rather than waved through: an
#  unrecognised opcode or pool type means the route cannot be verified, and an
#  unverifiable route must not be approved.

class _ProgramCursor:
    """Byte reader mirroring AGGFlow's InputStream."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def _take(self, n: int) -> bytes:
        if self.pos + n > len(self.data):
            raise ValueError("route program is truncated")
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def u8(self) -> int:
        return self._take(1)[0]

    def u16(self) -> int:
        return int.from_bytes(self._take(2), "big")

    def u24(self) -> int:
        return int.from_bytes(self._take(3), "big")

    def u256(self) -> int:
        return int.from_bytes(self._take(32), "big")

    def address(self) -> str:
        return "0x" + self._take(20).hex()

    def exhausted(self) -> bool:
        return self.pos >= len(self.data)


def _decode_swap(cur: "_ProgramCursor") -> dict:
    pool_type = cur.u8()
    if pool_type == _PT_UNIV2:
        pool = cur.address()
        direction = cur.u8()
        fee_ppm = cur.u24()
        return {"kind": "v2", "pool": pool, "dir": direction, "fee_ppm": fee_ppm}
    if pool_type == _PT_UNIV3:
        pool = cur.address()
        direction = cur.u8()
        return {"kind": "v3", "pool": pool, "dir": direction}
    if pool_type == _PT_WRAP:
        flags = cur.u8()
        weth = cur.address() if (flags & 2) == 2 else WGEN
        return {"kind": "wrap", "wrap": (flags & 1) == 1, "weth": weth}
    raise ValueError(f"unsupported pool type {pool_type} in route program")


def _decode_distribution(cur: "_ProgramCursor") -> list:
    """The legs of one split, each with the share of the stage input it takes."""
    legs: list = []
    count = cur.u8()
    if count == 0:
        raise ValueError("route stage distributes across zero pools")
    for _ in range(count):
        share = cur.u16()
        legs.append({"share": share, "swap": _decode_swap(cur)})
    return legs


def decode_route_program(program: bytes) -> list:
    """
    The route as a list of STAGES, each consuming the router's balance of one
    token and splitting it across one or more pools.

    Stages rather than a flat pool list, because AGGFlow routes may fan out: a
    stage can send fractions of its input through several pools in parallel and
    let the outputs accumulate. Flattening that into a single path would
    misprice every split route, which is precisely the kind of quote a validator
    is supposed to catch.
    """
    cur = _ProgramCursor(program)
    stages: list = []
    while not cur.exhausted():
        op = cur.u8()
        if op == _OP_END:
            break
        if op in (_OP_ROUTER_ERC20, _OP_USER_ERC20):
            token = cur.address()
            stages.append({"op": op, "token": token, "legs": _decode_distribution(cur)})
        elif op == _OP_NATIVE:
            stages.append({"op": op, "token": NATIVE_ZERO, "legs": _decode_distribution(cur)})
        elif op == _OP_ONE_POOL:
            token = cur.address()
            # Single-pool optimisation: no split header, the whole stage input
            # goes through one pool.
            stages.append({"op": op, "token": token, "legs": [{"share": 65535, "swap": _decode_swap(cur)}]})
        elif op == _OP_APPLY_PERMIT:
            cur.address()
            cur.u256()  # value
            cur.u256()  # deadline
            cur.u8()    # v
            cur.u256()  # r
            cur.u256()  # s
        else:
            raise ValueError(f"unsupported opcode 0x{op:02x} in route program")
    if not stages:
        raise ValueError("route program contains no swap stages")
    return stages


def _v2_amount_out(amount_in: int, reserve_in: int, reserve_out: int, fee_ppm: int) -> int:
    """
    Constant-product output, mirroring AGGFlow._swapUniV2 exactly.

    The fee is parts-per-million there, not basis points; using the wrong scale
    produces a quote that looks plausible and is wrong by orders of magnitude.
    """
    if reserve_in <= 0 or reserve_out <= 0 or amount_in <= 0:
        return 0
    amount_in_with_fee = amount_in * (1_000_000 - fee_ppm)
    return (amount_in_with_fee * reserve_out) // (reserve_in * 1_000_000 + amount_in_with_fee)


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
    # proposal_id -> "1" approved / "0" rejected.
    #
    # A GenLayer write transaction's RETURN VALUE is not recoverable from the
    # receipt: `receipt.result` carries the consensus vote enum (AGREE/DISAGREE),
    # not the contract's payload. Callers therefore had no way to learn whether a
    # validation actually approved, and defaulted to "rejected" even when the
    # round had approved the trade. Persisting the verdict lets the caller read it
    # back with `get_validation` — a view, so it is instant and free.
    validations:      TreeMap[str, str]

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
        assert gl.message.sender_address == self.owner, "Only owner"
        assert bps <= u256(10000), "Cannot exceed 100%"
        self.max_slippage_bps = bps

    @gl.public.write
    def set_agent_executor(self, executor: Address) -> None:
        """Update the AgentExecutor contract address."""
        assert gl.message.sender_address == self.owner, "Only owner"
        self.agent_executor = executor

    @gl.public.write
    def set_paused(self, paused: bool) -> None:
        """Emergency pause / unpause all validations."""
        assert gl.message.sender_address == self.owner, "Only owner"
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
        return addr(address) in {v.lower() for v in APPROVED_TOKENS.values()}

    @gl.public.view
    def is_router_approved(self, address: str) -> bool:
        return addr(address) in {v.lower() for v in APPROVED_ROUTERS.values()}

    @gl.public.view
    def get_validation(self, proposal_id: str) -> dict:
        """
        Read back the verdict of a previously validated proposal.

        Needed because a write transaction's return value cannot be recovered
        from its receipt — the receipt only carries the consensus vote enum. This
        view is how a caller learns whether `validate_proposal` approved a trade.

        It is also a cache: a proposal that has already been validated can be
        re-checked instantly here, with no new consensus round.
        """
        # Coerce before touching the map.
        #
        # A commitment is a 0x-prefixed hex string, and several callers parse it
        # as a number on the way in - the genlayer CLI does exactly this, since
        # `0x...` is valid integer syntax to it. The TreeMap's keys are strings,
        # and comparing an int against one raises TypeError deep inside the
        # storage layer, which surfaces as a wall of VM traceback rather than
        # anything a caller can act on. Normalising here is cheaper than every
        # caller getting the type right.
        key = _commitment_key(proposal_id)
        if key not in self.validations:
            return {"found": False, "approved": False, "reason": "No validation recorded for this proposal_id"}
        approved = self.validations[key] == "1"
        return {
            "found": True,
            "approved": approved,
            "reason": "All validation checks passed" if approved else "Proposal was rejected by GenVM consensus",
            "proposal_id": key,
        }

    # -----------------------------------------------------------------------
    # Swap validation — live route and quote facts, bound to the settlement
    # -----------------------------------------------------------------------
    #
    #  This is the entry point that replaces `validate_proposal` for swaps.
    #
    #  What the previous one checked: that the numbers were well-formed, the
    #  tokens and router were whitelisted, and an LLM found the two amounts
    #  coherent. It never looked at a pool. It could not tell a real quote from
    #  an invented one, nor a canonical Soyara pool from a contract the caller
    #  had deployed that morning, because neither the route nor the quote was an
    #  input it examined.
    #
    #  What this one checks, in order:
    #    1. Policy: tokens, router, slippage cap, fee cap, fee recipient.
    #    2. Route authenticity: the aggregator program is DECODED, and every
    #       pool it touches is confirmed against the V2/V3 factory as the
    #       canonical pool for the pair it claims to serve.
    #    3. Live quote: the output is recomputed from current reserves, split by
    #       split, and the agent's declared quote must match within tolerance.
    #    4. Protection band: min_amount_out must be the declared slippage below
    #       that verified quote.
    #    5. LLM coherence review, unchanged and still scoped to numbers.
    #
    #  Then it computes the executor's commitment over the whole order and sends
    #  it to AgentExecutor.recordVerdict itself, so the approval reaching the
    #  chain carries this contract's address as msg.sender.

    @gl.public.write
    def validate_swap(
        self,
        user:              str,
        token_in:          str,
        token_out:         str,
        amount_in:         str,
        min_amount_out:    str,
        quoted_amount_out: str,
        slippage_bps:      u256,
        deadline:          u256,
        router:            str,
        fee_bps:           u256,
        fee_collector:     str,
        route_program:     str,   # 0x-prefixed aggProgram bytes, hashed into the commitment
        nonce:             u256,
    ) -> dict:
        self.validated_count = self.validated_count + u256(1)

        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Contract paused by owner")

        # --- Phase 1: deterministic policy ---
        policy = self._check_swap_policy(
            user, token_in, token_out, amount_in, min_amount_out,
            quoted_amount_out, slippage_bps, deadline, router,
            fee_bps, fee_collector,
        )
        if not policy["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return policy

        amt_in    = int(amount_in)
        min_out   = int(min_amount_out)
        quoted    = int(quoted_amount_out)

        # --- Phase 2: decode the route the executor will actually run ---
        try:
            program_bytes = self._parse_hex(route_program)
            stages = decode_route_program(program_bytes)
        except Exception as e:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Route program could not be decoded: {e}")

        route_hash = "0x" + _keccak(program_bytes).hex()

        # --- Phase 3: verify route authenticity and re-derive the quote ---
        #
        # The entrypoint takes its fee off the input BEFORE the route runs, so
        # the simulation has to start from the post-fee amount or every quote
        # would read low by exactly the fee.
        route_input = (amt_in * (10_000 - int(fee_bps))) // 10_000
        try:
            sim = self._simulate_route(stages, token_in, token_out, route_input)
        except Exception as e:
            # A read against a pool that is not a pool, a truncated return, a
            # reverting quoter: unverifiable, therefore not approved.
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Route could not be verified against live pool state: {e}")

        if not sim["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(sim["reason"])

        live_out = int(sim["amount_out"])
        if live_out <= 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Live pool state yields no output for this route")

        # The declared quote must match what the pools actually offer.
        drift_bps = abs(quoted - live_out) * 10_000 // max(live_out, 1)
        if drift_bps > QUOTE_TOLERANCE_BPS:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(
                f"Declared quote {quoted} disagrees with live pool state {live_out} "
                f"by {drift_bps} bps, over the {QUOTE_TOLERANCE_BPS} bps tolerance"
            )

        # And the protection floor must be the declared slippage below it. This
        # is the same rule AgentExecutor enforces on chain; checking it here too
        # means a proposal that would revert never consumes a consensus round.
        floor = (quoted * (10_000 - int(slippage_bps))) // 10_000
        if min_out > quoted or min_out < floor:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(
                f"min_amount_out {min_out} is not within the {int(slippage_bps)} bps "
                f"band below the quote {quoted}"
            )

        # --- Phase 4: LLM coherence review (unchanged, still numbers only) ---
        try:
            llm_approved = self._consensus_review(
                "SWAP", slippage_bps, amount_in, min_amount_out,
                json.dumps({"pools": len(sim["pools"]), "stages": len(stages)}),
            )
        except Exception:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Consensus unavailable — failed closed")

        if not llm_approved:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("LLM coherence review did not approve this proposal")

        # --- Phase 5: bind the verdict to the settlement ---
        order = {
            "user":              user,
            "token_in":          token_in,
            "token_out":         token_out,
            "amount_in":         amt_in,
            "min_amount_out":    min_out,
            "quoted_amount_out": quoted,
            "slippage_bps":      int(slippage_bps),
            "deadline":          int(deadline),
            "router":            router,
            "fee_bps":           int(fee_bps),
            "fee_collector":     fee_collector,
            "route_hash":        route_hash,
            "nonce":             int(nonce),
        }
        commitment = swap_commitment(order, str(self.agent_executor))
        commitment_hex = "0x" + commitment.hex()

        self.approved_count = self.approved_count + u256(1)
        self.validations[commitment_hex] = "1"

        # External messages are delivered on FINALIZATION, never on acceptance —
        # a settlement becomes possible only once this round can no longer be
        # appealed away. That latency is the price of the guarantee.
        expiry = self._emit_verdict(commitment, deadline)

        return {
            "approved":    True,
            "reason":      "Route, quote and settlement parameters verified against live pool state",
            "proposal_id": commitment_hex,
            "commitment":  commitment_hex,
            "route_hash":  route_hash,
            "live_quote":  str(live_out),
            "expires_at":  str(expiry),
            "pools":       ",".join(sim["pools"]),
        }

    # -----------------------------------------------------------------------
    # Swap validation helpers
    # -----------------------------------------------------------------------

    def _reject_swap(self, reason: str) -> dict:
        return {"approved": False, "reason": reason, "proposal_id": "", "commitment": ""}

    def _parse_hex(self, value: str) -> bytes:
        raw = str(value).strip()
        if raw.startswith("0x") or raw.startswith("0X"):
            raw = raw[2:]
        if len(raw) % 2 != 0:
            raise ValueError("hex string has an odd number of characters")
        return bytes.fromhex(raw)

    def _check_swap_policy(
        self,
        user:              str,
        token_in:          str,
        token_out:         str,
        amount_in:         str,
        min_amount_out:    str,
        quoted_amount_out: str,
        slippage_bps:      u256,
        deadline:          u256,
        router:            str,
        fee_bps:           u256,
        fee_collector:     str,
    ) -> dict:
        approved_tokens = {v.lower() for v in APPROVED_TOKENS.values()}
        native_forms = {NATIVE_ZERO.lower(), NATIVE_PLACEHOLDER.lower()}

        if addr(user) == NATIVE_ZERO.lower():
            return self._reject_swap("user cannot be the zero address")

        if addr(token_in) not in native_forms and addr(token_in) not in approved_tokens:
            return self._reject_swap(f"tokenIn '{token_in}' is not an approved token")

        if addr(token_out) not in native_forms and addr(token_out) not in approved_tokens:
            return self._reject_swap(f"tokenOut '{token_out}' is not an approved token")

        if addr(token_in) == addr(token_out):
            return self._reject_swap("tokenIn and tokenOut cannot be the same address")

        if addr(router) not in {v.lower() for v in APPROVED_ROUTERS.values()}:
            return self._reject_swap(f"Router '{router}' is not in the approved router list")

        if slippage_bps > self.max_slippage_bps:
            return self._reject_swap(
                f"Slippage {int(slippage_bps)} bps exceeds cap of {int(self.max_slippage_bps)} bps"
            )

        # The fee and its recipient are now consensus-governed parameters. They
        # used to be neither hashed nor checked, so an agent could route the
        # user's input to any address it liked at any rate the entrypoint would
        # accept, which was up to 100%.
        if int(fee_bps) > MAX_FEE_BPS:
            return self._reject_swap(
                f"fee_bps {int(fee_bps)} exceeds the policy maximum of {MAX_FEE_BPS} bps"
            )
        if int(fee_bps) > 0 and addr(fee_collector) != CANONICAL_FEE_COLLECTOR.lower():
            return self._reject_swap(
                f"fee_collector '{fee_collector}' is not the canonical protocol fee collector"
            )

        try:
            amt_in  = int(amount_in)
            min_out = int(min_amount_out)
            quoted  = int(quoted_amount_out)
        except (ValueError, TypeError):
            return self._reject_swap("amount fields must be valid integer strings")

        if amt_in <= 0:
            return self._reject_swap("amount_in must be greater than zero")
        if min_out < 0:
            return self._reject_swap("min_amount_out cannot be negative")
        if quoted <= 0:
            return self._reject_swap("quoted_amount_out must be greater than zero")

        # Expiry IS checked here. GenVM pins the standard library clock to the
        # transaction timestamp, so this comparison is identical on every
        # validator - there is no consensus hazard in reading the time.
        #
        # Checking it early matters for a practical reason: a GenVM round takes
        # minutes, and an already-expired proposal would spend all of them only
        # to be refused by AgentExecutor's validDeadline modifier at the end.
        # AgentExecutor still enforces it at settlement; this just stops the
        # network doing work that cannot produce a usable verdict.
        if int(deadline) == 0:
            return self._reject_swap("Deadline cannot be zero — provide a Unix timestamp")
        if int(deadline) <= self._now():
            return self._reject_swap("Deadline has already passed — request a fresh quote")

        return {"approved": True, "reason": "Policy checks passed", "proposal_id": "", "commitment": ""}

    def _simulate_route(self, stages: list, token_in: str, token_out: str, route_input: int) -> dict:
        """
        Walk the decoded route against live chain state.

        Returns the output amount the pools would actually produce, and the list
        of pools touched. Every pool is checked for authenticity as it is walked,
        so a route that reaches a contract the factories never deployed fails
        here rather than being priced.
        """
        # Normalise the native asset to its zero-address form up front.
        #
        # The native token has two spellings in this codebase - the zero address
        # and the 0xEeee... placeholder - and the route program only ever emits
        # the zero form. A proposal that arrived using the placeholder would seed
        # the balance under a key no stage consumes, and the route would be
        # rejected as unverifiable for a reason that has nothing to do with it.
        balances: dict = {self._norm_native(token_in): int(route_input)}
        pools: list = []

        for stage in stages:
            stage_token = addr(stage["token"])
            available = balances.pop(stage_token, 0)
            if available <= 0:
                return {
                    "approved": False,
                    "reason": f"Route stage consumes {stage_token}, which the previous stages never produced",
                }

            legs = stage["legs"]
            remaining = available
            for index, leg in enumerate(legs):
                amount = (available * int(leg["share"])) // 65_535
                if index == len(legs) - 1:
                    amount = remaining
                remaining -= amount

                result = self._simulate_leg(leg["swap"], stage_token, amount)
                if not result["approved"]:
                    return result

                out_token = addr(result["token_out"])
                balances[out_token] = balances.get(out_token, 0) + int(result["amount_out"])
                if result.get("pool"):
                    pools.append(result["pool"])

        # Whatever the route left denominated in the token the user is buying.
        # Residue in any other token is not counted: the executor only credits
        # the output token, so a route that ends holding something else has not
        # produced the trade that was proposed.
        produced = balances.get(self._norm_native(token_out), 0)
        return {"approved": True, "amount_out": produced, "balances": balances, "pools": pools}

    def _norm_native(self, token: str) -> str:
        """Both spellings of the native asset collapse to the zero address."""
        low = addr(token)
        return NATIVE_ZERO.lower() if low == NATIVE_PLACEHOLDER.lower() else low

    def _simulate_leg(self, swap: dict, token_in: str, amount_in: int) -> dict:
        kind = swap["kind"]

        if kind == "wrap":
            weth = addr(swap["weth"])
            if weth not in {v.lower() for v in APPROVED_TOKENS.values()}:
                return {"approved": False, "reason": f"Wrap target '{weth}' is not an approved token"}
            if swap["wrap"]:
                if self._norm_native(token_in) != NATIVE_ZERO.lower():
                    return {"approved": False, "reason": "Wrap leg fed a token that is not the native asset"}
                return {"approved": True, "token_out": weth, "amount_out": amount_in, "pool": None}
            if token_in != weth:
                return {"approved": False, "reason": "Unwrap leg fed a token that is not the wrapped native asset"}
            return {"approved": True, "token_out": NATIVE_ZERO.lower(), "amount_out": amount_in, "pool": None}

        pool_addr = addr(swap["pool"])

        if kind == "v2":
            token0 = addr(_evm_view(pool_addr, "token0", (), Address, ()))
            token1 = addr(_evm_view(pool_addr, "token1", (), Address, ()))

            canonical = addr(_evm_view(
                V2_FACTORY, "getPair", (Address, Address), Address,
                (Address(token0), Address(token1)),
            ))
            if canonical != pool_addr:
                return {
                    "approved": False,
                    "reason": f"Pool {pool_addr} is not the canonical Soyara V2 pair for its own tokens",
                }

            # Reserves are read as the pool's TOKEN BALANCES rather than via
            # getReserves().
            #
            # getReserves() returns three values, and a multi-value return needs
            # a tuple-typed stub - which, like bytes32, is outside GenLayer's
            # documented type mapping. balanceOf is squarely inside it.
            #
            # The two agree exactly in a healthy pool: every V2 swap and mint
            # syncs reserves to balances, so they only diverge when someone has
            # transferred tokens to the pair without calling sync. That donation
            # inflates the balance, which makes the output computed here slightly
            # HIGHER than the pool will really pay, so the honest quote looks low
            # against ours and the trade is rejected rather than approved on an
            # optimistic number. The bias runs in the safe direction.
            reserve0 = int(_evm_view(token0, "balanceOf", (Address,), u256, (Address(pool_addr),)))
            reserve1 = int(_evm_view(token1, "balanceOf", (Address,), u256, (Address(pool_addr),)))

            if token_in == token0:
                reserve_in, reserve_out, token_out = reserve0, reserve1, token1
                expected_dir = _DIRECTION_TOKEN0_TO_TOKEN1
            elif token_in == token1:
                reserve_in, reserve_out, token_out = reserve1, reserve0, token0
                expected_dir = 1
            else:
                return {
                    "approved": False,
                    "reason": f"Pool {pool_addr} does not trade {token_in}",
                }

            # A direction byte disagreeing with the token flow means the program
            # would price against the wrong reserve at execution time.
            if int(swap["dir"]) != expected_dir:
                return {
                    "approved": False,
                    "reason": f"Route direction byte for pool {pool_addr} contradicts the token flow",
                }

            if reserve_in <= 0 or reserve_out <= 0:
                return {"approved": False, "reason": f"Pool {pool_addr} has no liquidity"}

            amount_out = _v2_amount_out(amount_in, reserve_in, reserve_out, int(swap["fee_ppm"]))
            return {"approved": True, "token_out": token_out, "amount_out": amount_out, "pool": pool_addr}

        if kind == "v3":
            token0 = addr(_evm_view(pool_addr, "token0", (), Address, ()))
            token1 = addr(_evm_view(pool_addr, "token1", (), Address, ()))
            fee = int(_evm_view(pool_addr, "fee", (), u24, ()))

            canonical = addr(_evm_view(
                V3_FACTORY, "getPool", (Address, Address, u24), Address,
                (Address(token0), Address(token1), u24(fee)),
            ))
            if canonical != pool_addr:
                return {
                    "approved": False,
                    "reason": f"Pool {pool_addr} is not the canonical Soyara V3 pool for its own tokens and fee tier",
                }

            if token_in == token0:
                token_out = token1
                expected_dir = 1  # zeroForOne
            elif token_in == token1:
                token_out = token0
                expected_dir = 0
            else:
                return {"approved": False, "reason": f"Pool {pool_addr} does not trade {token_in}"}

            amount_out = int(_evm_view(
                V3_QUOTER, "quoteExactInputSingle",
                (Address, Address, u24, u256, u160), u256,
                (Address(token_in), Address(token_out), u24(fee), u256(amount_in), u160(0)),
            ))
            if amount_out <= 0:
                return {"approved": False, "reason": f"V3 pool {pool_addr} cannot fill this size"}

            return {"approved": True, "token_out": token_out, "amount_out": amount_out, "pool": pool_addr}

        return {"approved": False, "reason": f"Unsupported route leg '{kind}'"}

    # -----------------------------------------------------------------------
    # Liquidity validation — same registry, same authentication
    # -----------------------------------------------------------------------
    #
    #  Liquidity settled through the same privileged path swaps did: the agent
    #  called `approveTrade(hash)` and then executed against its own approval.
    #  These two methods put liquidity on the same footing as swaps — the verdict
    #  is issued by consensus and delivered to AgentExecutor by this contract.
    #
    #  There is no quote to verify here, but there is still a route fact worth
    #  checking, and it is the one that matters for liquidity: that the pair
    #  being deposited into, or the LP token being burned, is the canonical
    #  Soyara pair for those tokens rather than a look-alike contract.

    @gl.public.write
    def validate_liquidity_v2_add(
        self,
        user:             str,
        token_a:          str,
        token_b:          str,
        amount_a_desired: str,
        amount_b_desired: str,
        amount_a_min:     str,
        amount_b_min:     str,
        deadline:         u256,
    ) -> dict:
        self.validated_count = self.validated_count + u256(1)

        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Contract paused by owner")

        check = self._check_liquidity_policy(user, token_a, token_b, deadline)
        if not check["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return check

        try:
            amt_a = int(amount_a_desired)
            amt_b = int(amount_b_desired)
            min_a = int(amount_a_min)
            min_b = int(amount_b_min)
        except (ValueError, TypeError):
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("amount fields must be valid integer strings")

        if amt_a <= 0 or amt_b <= 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("both deposit amounts must be greater than zero")
        if min_a > amt_a or min_b > amt_b:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("minimum accepted amount cannot exceed the desired amount")

        try:
            pair = self._canonical_v2_pair(token_a, token_b)
        except Exception as e:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Pair could not be verified on chain: {e}")

        if pair == NATIVE_ZERO.lower():
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("No canonical Soyara V2 pair exists for this token pair")

        try:
            llm_approved = self._consensus_review(
                "ADD_LIQUIDITY", u256(0), amount_a_desired, amount_b_desired, "{}"
            )
        except Exception:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Consensus unavailable — failed closed")

        if not llm_approved:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("LLM coherence review did not approve this deposit")

        commitment = v2_add_commitment(
            {
                "user":             user,
                "token_a":          token_a,
                "token_b":          token_b,
                "amount_a_desired": amt_a,
                "amount_b_desired": amt_b,
                "amount_a_min":     min_a,
                "amount_b_min":     min_b,
                "deadline":         int(deadline),
            },
            str(self.agent_executor),
        )
        return self._issue_verdict(commitment, deadline, "V2 add-liquidity approved", pair)

    @gl.public.write
    def validate_liquidity_v2_remove(
        self,
        user:         str,
        token_a:      str,
        token_b:      str,
        lp_token:     str,
        lp_amount:    str,
        amount_a_min: str,
        amount_b_min: str,
        deadline:     u256,
    ) -> dict:
        self.validated_count = self.validated_count + u256(1)

        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Contract paused by owner")

        check = self._check_liquidity_policy(user, token_a, token_b, deadline)
        if not check["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return check

        try:
            lp_amt = int(lp_amount)
            min_a  = int(amount_a_min)
            min_b  = int(amount_b_min)
        except (ValueError, TypeError):
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("amount fields must be valid integer strings")

        if lp_amt <= 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("lp_amount must be greater than zero")
        if min_a < 0 or min_b < 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("minimum withdrawal amounts cannot be negative")

        try:
            pair = self._canonical_v2_pair(token_a, token_b)
        except Exception as e:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Pair could not be verified on chain: {e}")

        # The LP token being burned must BE the canonical pair. Without this the
        # user could be induced to hand over a real LP position while the
        # withdrawal is executed against a look-alike contract.
        if addr(lp_token) != pair or pair == NATIVE_ZERO.lower():
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(
                f"lp_token '{lp_token}' is not the canonical Soyara V2 pair for these tokens"
            )

        try:
            llm_approved = self._consensus_review(
                "REMOVE_LIQUIDITY", u256(0), lp_amount, amount_a_min, "{}"
            )
        except Exception:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Consensus unavailable — failed closed")

        if not llm_approved:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("LLM coherence review did not approve this withdrawal")

        commitment = v2_remove_commitment(
            {
                "user":         user,
                "token_a":      token_a,
                "token_b":      token_b,
                "lp_token":     lp_token,
                "lp_amount":    lp_amt,
                "amount_a_min": min_a,
                "amount_b_min": min_b,
                "deadline":     int(deadline),
            },
            str(self.agent_executor),
        )
        return self._issue_verdict(commitment, deadline, "V2 remove-liquidity approved", pair)

    def _check_liquidity_policy(self, user: str, token_a: str, token_b: str, deadline: u256) -> dict:
        approved_tokens = {v.lower() for v in APPROVED_TOKENS.values()}

        if addr(user) == NATIVE_ZERO.lower():
            return self._reject_swap("user cannot be the zero address")
        if addr(token_a) not in approved_tokens:
            return self._reject_swap(f"tokenA '{token_a}' is not an approved token")
        if addr(token_b) not in approved_tokens:
            return self._reject_swap(f"tokenB '{token_b}' is not an approved token")
        if addr(token_a) == addr(token_b):
            return self._reject_swap("tokenA and tokenB cannot be the same address")
        if int(deadline) == 0:
            return self._reject_swap("Deadline cannot be zero — provide a Unix timestamp")
        if int(deadline) <= self._now():
            return self._reject_swap("Deadline has already passed — request a fresh quote")
        return {"approved": True, "reason": "Policy checks passed", "proposal_id": "", "commitment": ""}

    def _canonical_v2_pair(self, token_a: str, token_b: str) -> str:
        """The pair address the Soyara V2 factory actually deployed, or zero."""
        return addr(_evm_view(
            V2_FACTORY, "getPair", (Address, Address), Address,
            (Address(addr(token_a)), Address(addr(token_b))),
        ))

    def _now(self) -> int:
        """
        Transaction time, in unix seconds.

        Safe inside a consensus round: GenVM pins the standard library clock to
        the transaction timestamp, so every validator re-executing this sees the
        same value. (An older comment in this file claimed the opposite and
        avoided time entirely; the documented behaviour is that
        `datetime.now(timezone.utc)` and `time.time()` are deterministic here.)
        """
        return int(datetime.now(timezone.utc).timestamp())

    def _emit_verdict(self, commitment: bytes, deadline: u256) -> int:
        """
        Hand the verdict to AgentExecutor over this contract's ghost contract.

        This is the call that carries the whole design: it leaves GenVM as an
        external message, the ghost delivers it, and the executor sees
        `msg.sender` equal to this contract's address. Nothing an operator holds
        a key for can produce it.

        The commitment crosses as a u256 rather than a bytes32 - see the stub on
        _AgentExecutorEVM for why - and the two encode identically, so the
        executor recovers the same 32 bytes.

        Returns the expiry actually granted.
        """
        expiry = min(int(deadline), self._now() + VERDICT_TTL_SECONDS)

        _evm_send(
            str(self.agent_executor),
            "recordVerdict",
            (u256, u64),
            (u256(int.from_bytes(commitment, "big")), u64(expiry)),
        )
        return expiry

    def _issue_verdict(self, commitment: bytes, deadline: u256, reason: str, pool: str) -> dict:
        """Record the verdict and hand it to AgentExecutor over the ghost."""
        commitment_hex = "0x" + commitment.hex()
        self.approved_count = self.approved_count + u256(1)
        self.validations[commitment_hex] = "1"

        expiry = self._emit_verdict(commitment, deadline)

        return {
            "approved":    True,
            "reason":      reason,
            "proposal_id": commitment_hex,
            "commitment":  commitment_hex,
            "expires_at":  str(expiry),
            "pool":        pool,
        }

    # -----------------------------------------------------------------------
    # V3 liquidity validation
    # -----------------------------------------------------------------------
    #
    #  V3 positions settled through the same privileged path everything else
    #  did. They now go through the verdict registry too, so the executor's
    #  V3 entry points are no longer reachable without a consensus round.

    @gl.public.write
    def validate_liquidity_v3_add(
        self,
        user:            str,
        token0:          str,
        token1:          str,
        fee:             u256,   # V3 fee tier, e.g. 3000 = 0.30%
        tick_lower:      str,    # signed; string because ticks are negative below spot
        tick_upper:      str,
        amount0_desired: str,
        amount1_desired: str,
        amount0_min:     str,
        amount1_min:     str,
        deadline:        u256,
    ) -> dict:
        self.validated_count = self.validated_count + u256(1)

        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Contract paused by owner")

        check = self._check_liquidity_policy(user, token0, token1, deadline)
        if not check["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return check

        try:
            lower = int(tick_lower)
            upper = int(tick_upper)
            amt0  = int(amount0_desired)
            amt1  = int(amount1_desired)
            min0  = int(amount0_min)
            min1  = int(amount1_min)
        except (ValueError, TypeError):
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("tick and amount fields must be valid integer strings")

        # A V3 position with an inverted or out-of-range range is not a position;
        # the position manager would revert, after the round had been paid for.
        if lower >= upper:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("tick_lower must be below tick_upper")
        if lower < -V3_MAX_TICK or upper > V3_MAX_TICK:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"tick range exceeds the V3 bound of +/-{V3_MAX_TICK}")

        if amt0 <= 0 and amt1 <= 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("at least one deposit amount must be greater than zero")
        if min0 > amt0 or min1 > amt1:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("minimum accepted amount cannot exceed the desired amount")

        if int(fee) not in V3_FEE_TIERS:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"fee tier {int(fee)} is not one of {list(V3_FEE_TIERS)}")

        # The route fact for a V3 deposit: the pool must be one the Soyara V3
        # factory deployed for exactly this pair and tier.
        try:
            pool = self._canonical_v3_pool(token0, token1, int(fee))
        except Exception as e:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Pool could not be verified on chain: {e}")

        if pool == NATIVE_ZERO.lower():
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(
                f"No canonical Soyara V3 pool exists for this pair at the {int(fee)} fee tier"
            )

        try:
            llm_approved = self._consensus_review(
                "ADD_LIQUIDITY", u256(0), amount0_desired, amount1_desired, "{}"
            )
        except Exception:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Consensus unavailable — failed closed")

        if not llm_approved:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("LLM coherence review did not approve this position")

        commitment = v3_add_commitment(
            {
                "user": user, "token0": token0, "token1": token1, "fee": int(fee),
                "tick_lower": lower, "tick_upper": upper,
                "amount0_desired": amt0, "amount1_desired": amt1,
                "amount0_min": min0, "amount1_min": min1,
                "deadline": int(deadline),
            },
            str(self.agent_executor),
        )
        return self._issue_verdict(commitment, deadline, "V3 mint approved", pool)

    @gl.public.write
    def validate_liquidity_v3_remove(
        self,
        user:        str,
        token_id:    str,
        token0:      str,
        token1:      str,
        liquidity:   str,
        amount0_min: str,
        amount1_min: str,
        deadline:    u256,
    ) -> dict:
        self.validated_count = self.validated_count + u256(1)

        if self.paused:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Contract paused by owner")

        check = self._check_liquidity_policy(user, token0, token1, deadline)
        if not check["approved"]:
            self.rejected_count = self.rejected_count + u256(1)
            return check

        try:
            position = int(token_id)
            liq      = int(liquidity)
            min0     = int(amount0_min)
            min1     = int(amount1_min)
        except (ValueError, TypeError):
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("tokenId and amount fields must be valid integer strings")

        if liq <= 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("liquidity must be greater than zero")
        if min0 < 0 or min1 < 0:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("minimum withdrawal amounts cannot be negative")

        # The withdrawal is determined by tokenId, but the executor reads
        # token0/token1 to enforce its whitelist, so they are inputs to whether
        # the call is permitted and must be verified as a real pair. The fee tier
        # is not a parameter of the executor's remove path, so the check is that
        # SOME canonical pool exists for these two tokens rather than one tier.
        try:
            pool = self._any_canonical_v3_pool(token0, token1)
        except Exception as e:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap(f"Pool could not be verified on chain: {e}")

        if pool == NATIVE_ZERO.lower():
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("No canonical Soyara V3 pool exists for these tokens")

        try:
            llm_approved = self._consensus_review(
                "REMOVE_LIQUIDITY", u256(0), liquidity, amount0_min, "{}"
            )
        except Exception:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("Consensus unavailable — failed closed")

        if not llm_approved:
            self.rejected_count = self.rejected_count + u256(1)
            return self._reject_swap("LLM coherence review did not approve this withdrawal")

        commitment = v3_remove_commitment(
            {
                "user": user, "token_id": position,
                "token0": token0, "token1": token1,
                "liquidity": liq, "amount0_min": min0, "amount1_min": min1,
                "deadline": int(deadline),
            },
            str(self.agent_executor),
        )
        return self._issue_verdict(commitment, deadline, "V3 decrease-liquidity approved", pool)

    def _canonical_v3_pool(self, token0: str, token1: str, fee: int) -> str:
        """The pool the Soyara V3 factory deployed for this pair and tier, or zero."""
        return addr(_evm_view(
            V3_FACTORY, "getPool", (Address, Address, u24), Address,
            (Address(addr(token0)), Address(addr(token1)), u24(fee)),
        ))

    def _any_canonical_v3_pool(self, token0: str, token1: str) -> str:
        """The first canonical pool across the standard tiers, or zero."""
        for tier in V3_FEE_TIERS:
            pool = self._canonical_v3_pool(token0, token1, tier)
            if pool != NATIVE_ZERO.lower():
                return pool
        return NATIVE_ZERO.lower()

    # -----------------------------------------------------------------------
    # Phase 2 — LLM coherence check (non-deterministic, reaches consensus)
    # -----------------------------------------------------------------------

    # ── Consensus wrappers ────────────────────────────────────────────────
    #
    # The nondeterministic call is isolated in its own method on purpose.
    # genvm-lint marks the scope CONTAINING an inline `strict_eq(lambda: ...)`
    # as a non-deterministic context, and storage writes are forbidden there —
    # which is why `validate_proposal` and `issue_trading_mandate` previously
    # failed lint with "storage writes are forbidden in non-deterministic
    # contexts" and "nested non-deterministic blocks are forbidden". Keeping the
    # lambda here means the callers stay deterministic and may write state.
    #
    # Only a BARE BOOLEAN crosses the strict_eq boundary — see _llm_review.

    def _consensus_review(
        self,
        action:         str,
        slippage_bps:   u256,
        amount_in:      str,
        min_amount_out: str,
        extra_data:     str,
    ) -> bool:
        # A nested def passed BY NAME, not an inline lambda. genvm-lint marks the
        # scope containing an inline nondet lambda as a non-deterministic context,
        # which then makes this very strict_eq call read as a nested nondet block.
        # This is the pattern GenLayer's own contract template uses.
        def review() -> bool:
            return self._llm_review(action, slippage_bps, amount_in, min_amount_out, extra_data)

        return gl.eq_principle.strict_eq(review)

    def _llm_review(
        self,
        action:         str,
        slippage_bps:   u256,
        amount_in:      str,
        min_amount_out: str,
        extra_data:     str,
    ) -> bool:
        """
        Scoped LLM review for numeric/logic coherence.

        Returns a BARE BOOLEAN on purpose. This runs inside
        `gl.eq_principle.strict_eq`, which compares the returned value across
        validators for exact equality — so it must carry no LLM-authored prose.
        An earlier version returned the model's own `reason` string, which
        differs per node, so nodes could never agree and rounds terminated
        UNDETERMINED (DISAGREE) instead of producing a verdict.

        SECURITY: Only structured numeric + enum fields are passed to the
        LLM prompt. User free-text from chat is never included here.
        """
        safe_extra = (extra_data or "{}")[:400]
        slippage_pct = round(int(slippage_bps) / 100, 2)

        # The two amount fields mean DIFFERENT things per action, and a single
        # set of swap-shaped rules made validators disagree on liquidity.
        #
        # For a deposit, `amount_in` and `min_amount_out` are the two INDEPENDENT
        # sides of the position — "10 WGEN and 200 USDC" is perfectly valid, yet
        # the old rule "REJECT if Min Amount Out > Amount In * 10" told the model
        # to refuse it while another rule said approve. Different validators
        # resolved that contradiction differently, so `strict_eq` could not agree,
        # the round raised, and it failed closed WITHOUT recording a verdict —
        # which surfaced to users as add-liquidity being intermittently stuck.
        # Ratio rules only make sense for a swap.
        if action in ("ADD_LIQUIDITY", "REMOVE_LIQUIDITY"):
            rules = (
                "1. The two amounts are INDEPENDENT sides of a liquidity position,\n"
                "   NOT a swap pair. Their ratio carries no meaning here: any ratio\n"
                "   is valid because it simply reflects the pool's current price.\n"
                "2. APPROVE whenever both amounts are positive integers.\n"
                "3. APPROVE regardless of slippage between 1 and 300 bps.\n"
                "4. REJECT ONLY if an amount is zero, negative, or not a number."
            )
        else:
            rules = (
                "1. APPROVE if the action is SWAP and both amounts are positive.\n"
                "2. APPROVE if Min Amount Out is >= 0. Token decimals differ across\n"
                "   pairs, so a larger Min Amount Out than Amount In is normal and\n"
                "   is NOT grounds for rejection on its own.\n"
                "3. WARN only (still APPROVE) if Slippage is between 100-300 bps.\n"
                "4. REJECT ONLY on an obvious numeric impossibility: a negative or\n"
                "   zero amount, or a non-numeric value."
            )

        prompt = f"""You are a DeFi execution safety validator for a DEX aggregator.
Evaluate the following execution proposal for numeric coherence only.

== PROPOSAL (structured data only — no user messages) ==
Action:         {action}
Amount In:      {amount_in} (raw token units)
Min Amount Out: {min_amount_out} (raw token units)
Slippage:       {int(slippage_bps)} bps = {slippage_pct}%
Extra Info:     {safe_extra}

== RULES ==
{rules}
COMMON:
- Do NOT reject based on token prices, market conditions, or the identity of
  tokens/routers.
- Do NOT use any information beyond the structured fields above.

== RESPONSE ==
Reply with ONLY a single valid JSON object, no markdown:
{{"approved": true, "reason": "brief explanation max 100 chars"}}"""

        try:
            result = gl.nondet.exec_prompt(prompt)
            # Strip any accidental markdown fences
            clean = result.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean)
            return bool(parsed.get("approved", False))
        except Exception:
            # LLM or parsing failure → MUST fail closed
            return False
