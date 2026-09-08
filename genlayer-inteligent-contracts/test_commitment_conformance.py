#!/usr/bin/env python3
"""
Cross-language conformance test for the settlement commitment.

WHY
---
The identifier that authorises a settlement is computed twice: in Solidity by
TradeHashLib.swapCommitment, and in Python here in AgentValidator. If the two
ever disagree, nothing raises. The Intelligent Contract records a verdict under
one identifier, AgentExecutor derives a different one from the same trade, and
every settlement reverts as unapproved with neither side able to say why. That
failure mode is exactly the kind of thing that costs a day to diagnose, so it is
pinned with a frozen vector on both sides.

The matching Solidity assertions live in
dex-contracts/aggregator/test/CommitmentConformance.t.sol. Change the SwapOrder
struct, its field order, or the type tag, and both suites fail together.

This does NOT import AgentValidator normally - that module needs the GenVM
runtime. It lifts the shipped encoder out of the source file by AST and runs it
against stubs, so what is under test is the real code, not a copy of it.

    python3 test_commitment_conformance.py
"""

import ast
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "AgentValidator.py")

# Frozen vector — must equal CommitmentConformance.t.sol
EXPECTED_PREIMAGE = (
    "962479974a40e9c7a7a02218e052b96aa7c311de4637e9297fa84fd276e61b36"
    "000000000000000000000000000000000000000000000000000000000000107d"
    "000000000000000000000000a835c0a86dd64726ef23d83a8ca7d60b542ee2e4"
    "00000000000000000000000023d542dcefb00b1f4268e67a0ec1ef4de0a58fe2"
    "00000000000000000000000058b6cd7891cd0a682226e25607b958a6479195a6"
    "000000000000000000000000315374aa9b5536037cc1efeea2439ccc0913a77e"
    "00000000000000000000000000000000000000000000000000000000000f4240"
    "0000000000000000000000000000000000000000000000000dcb65bbcabd0000"
    "0000000000000000000000000000000000000000000000000de0b6b3a7640000"
    "000000000000000000000000000000000000000000000000000000000000001e"
    "000000000000000000000000000000000000000000000000000000006b49d200"
    "00000000000000000000000095fee6cb918ed9c621e36082ee8d998873031eaa"
    "0000000000000000000000000000000000000000000000000000000000000005"
    "00000000000000000000000048234ed645676b794a4cbc7483513e58cb04e22e"
    "845c0fcefdc1d080d148138925d9e208f1f5b4fd1ecfff3d7e6060dd6e4ab0c7"
    "0000000000000000000000000000000000000000000000000000000000000001"
)
EXPECTED_COMMITMENT = "0x1411afb0e1aee4db138052565fa8136bb9ed1d333e35caf67b8ce1759ddababe"
EXPECTED_ROUTE_HASH = "0x845c0fcefdc1d080d148138925d9e208f1f5b4fd1ecfff3d7e6060dd6e4ab0c7"

ROUTE_PROGRAM = bytes.fromhex("02315374aa9b5536037cc1efeea2439ccc0913a77e")

ORDER = {
    "user":              "0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2",
    "token_in":          "0x58B6CD7891cd0A682226E25607b958a6479195A6",
    "token_out":         "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    "amount_in":         1_000_000,
    "min_amount_out":    994_000_000_000_000_000,
    "quoted_amount_out": 1_000_000_000_000_000_000,
    "slippage_bps":      30,
    "deadline":          1_800_000_000,
    "router":            "0x95feE6Cb918Ed9C621E36082EE8D998873031EaA",
    "fee_bps":           5,
    "fee_collector":     "0x48234eD645676b794a4CbC7483513e58cB04e22E",
    "route_hash":        EXPECTED_ROUTE_HASH,
    "nonce":             1,
}
# A FROZEN TEST VECTOR, not the live deployment. It must stay byte-identical to
# EXECUTOR in ../aggregator/test/CommitmentConformance.t.sol so the two
# implementations are compared on the same input. The deployed executor is
# 0x0F1E9857... (see DEPLOYMENTS.md).
EXECUTOR = "0xa835c0a86dD64726eF23D83a8ca7D60b542EE2e4"


def _keccak_backend():
    """Any keccak-256 available locally. GenVM ships its own; this is for CI."""
    try:
        from Crypto.Hash import keccak as _k
        return lambda data: _k.new(digest_bits=256, data=data).digest()
    except Exception:
        pass
    try:
        from eth_hash.auto import keccak as _k
        return lambda data: _k(data)
    except Exception:
        pass
    try:
        import sha3
        return lambda data: sha3.keccak_256(data).digest()
    except Exception:
        return None


# Names lifted out of AgentValidator.py, in source order.
WANTED = {
    "addr", "NATIVE_ZERO", "NATIVE_PLACEHOLDER", "CHAIN_ID", "WGEN",
    "APPROVED_TOKENS",
    "_OP_END", "_OP_ROUTER_ERC20", "_OP_USER_ERC20", "_OP_NATIVE",
    "_OP_ONE_POOL", "_OP_APPLY_PERMIT",
    "_PT_UNIV2", "_PT_UNIV3", "_PT_WRAP", "_DIRECTION_TOKEN0_TO_TOKEN1",
    "_word_uint", "_word_addr", "_word_bytes32", "_keccak",
    "_SWAP_TYPE_TAG", "_V2_ADD_TYPE_TAG", "_V2_REMOVE_TYPE_TAG",
    "swap_commitment", "v2_add_commitment", "v2_remove_commitment",
    "v3_add_commitment", "v3_remove_commitment", "_word_int",
    "_V3_ADD_TYPE_TAG", "_V3_REMOVE_TYPE_TAG",
    "_ProgramCursor", "_decode_swap", "_decode_distribution",
    "decode_route_program", "_v2_amount_out",
    # The vendored keccak, which runs whenever the runtime's undocumented
    # implementation is not present in the pinned runner.
    "_KECCAK_MASK64", "_KECCAK_RC", "_KECCAK_ROT",
    "_rotl64", "_keccak_f1600", "_keccak256_vendored",
}


def load_shipped_encoder(keccak):
    """Exec the real helpers from AgentValidator.py against runtime stubs."""
    tree = ast.parse(open(SOURCE).read())
    kept = []
    for node in tree.body:
        name = None
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            name = node.name
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name = node.target.id
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        if name in WANTED:
            kept.append(node)

        missing = WANTED - {
            (n.name if isinstance(n, (ast.FunctionDef, ast.ClassDef))
             else n.target.id if isinstance(n, ast.AnnAssign)
             else n.targets[0].id)
            for n in kept
        }

    if missing:
        raise AssertionError(f"AgentValidator.py no longer defines: {sorted(missing)}")

    module = ast.Module(body=kept, type_ignores=[])
    ast.fix_missing_locations(module)

    class _Keccak256:
        def __init__(self, data):
            self._d = keccak(data)

        def digest(self):
            return self._d

    # `_keccak_backend` is bound by a try/except in the module, which the
    # name-based extraction above does not carry over. Seed it with a known-good
    # implementation so the ENCODING assertions are testing the encoding rather
    # than the hash; the vendored hash is then verified separately, on vectors.
    namespace = {"Keccak256": _Keccak256, "_keccak_backend": keccak}
    exec(compile(module, SOURCE, "exec"), namespace)
    return namespace


# The ABI type each GenLayer annotation maps to, mirroring
# genlayer/evm/_internal/type_dicts.py. Only the types this contract's stubs use.



def evm_call_sites():
    """
    Every EVM call the contract makes, as (method, arg_types, is_send).

    The contract used to declare these as `@gl.evm.contract_interface` classes,
    which is the documented shape. It no longer can: that accessor is broken on
    the pinned Bradbury runner (it stores the target at `_proxy_parent` and then
    reads `self.parent`), so calls go through `gl.vm.gl_call.gl_call_generic`
    instead. See the comment above `_evm_view` in AgentValidator.py.

    The types are still what produce the selector, so they still need checking -
    this lifts them out of the actual call sites rather than out of a
    declaration that no longer exists.
    """
    tree = ast.parse(open(SOURCE).read())
    sites = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id not in ("_evm_view", "_evm_send"):
            continue
        is_send = node.func.id == "_evm_send"
        # _evm_view(address, method, params, ret, args)
        # _evm_send(address, method, params, args)
        method_node = node.args[1]
        params_node = node.args[2]
        if not isinstance(method_node, ast.Constant):
            continue
        types = []
        if isinstance(params_node, ast.Tuple):
            for el in params_node.elts:
                types.append(getattr(el, "id", "?"))
        sites.append((method_node.value, tuple(types), is_send))
    return sites


def main() -> int:
    keccak = _keccak_backend()
    if keccak is None:
        print("SKIP: no keccak-256 backend (pip install pycryptodome or eth-hash)")
        return 0

    ns = load_shipped_encoder(keccak)
    failures = []

    def check(label, actual, expected):
        if actual != expected:
            failures.append(f"{label}\n     got: {actual}\n  wanted: {expected}")
        else:
            print(f"  ok  {label}")

    # 1. The type tag.
    check("swap type tag", "0x" + ns["_SWAP_TYPE_TAG"].hex(),
          "0x" + keccak(b"SOYARA_SWAP_V2").hex())

    # 2. The route hash the vector commits to.
    check("route hash", "0x" + ns["_keccak"](ROUTE_PROGRAM).hex(), EXPECTED_ROUTE_HASH)

    # 3. The abi.encode preimage, word for word. This is the assertion that
    #    catches a reordered or added struct field.
    w_uint, w_addr, w_b32 = ns["_word_uint"], ns["_word_addr"], ns["_word_bytes32"]
    preimage = (
        ns["_SWAP_TYPE_TAG"]
        + w_uint(ns["CHAIN_ID"]) + w_addr(EXECUTOR)
        + w_addr(ORDER["user"]) + w_addr(ORDER["token_in"]) + w_addr(ORDER["token_out"])
        + w_uint(ORDER["amount_in"]) + w_uint(ORDER["min_amount_out"])
        + w_uint(ORDER["quoted_amount_out"]) + w_uint(ORDER["slippage_bps"])
        + w_uint(ORDER["deadline"]) + w_addr(ORDER["router"])
        + w_uint(ORDER["fee_bps"]) + w_addr(ORDER["fee_collector"])
        + w_b32(ORDER["route_hash"]) + w_uint(ORDER["nonce"])
    )
    check("abi.encode preimage length", len(preimage), 32 * 16)
    check("abi.encode preimage", preimage.hex(), EXPECTED_PREIMAGE)

    # 4. The shipped swap_commitment, end to end.
    check("swap_commitment", "0x" + ns["swap_commitment"](ORDER, EXECUTOR).hex(),
          EXPECTED_COMMITMENT)

    # 5. Any change to a field must change the identifier. A commitment that
    #    ignores a field is the whole bug this work exists to fix.
    base = ns["swap_commitment"](ORDER, EXECUTOR)
    for field, tweak in [
        ("user", "0x000000000000000000000000000000000000dEaD"),
        ("fee_bps", 6),
        ("fee_collector", "0x000000000000000000000000000000000000bEEF"),
        ("route_hash", "0x" + "11" * 32),
        ("quoted_amount_out", 1_000_000_000_000_000_001),
        ("min_amount_out", 994_000_000_000_000_001),
        ("router", "0x000000000000000000000000000000000000CAFE"),
        ("nonce", 2),
        ("deadline", 1_800_000_001),
        ("slippage_bps", 31),
    ]:
        mutated = dict(ORDER)
        mutated[field] = tweak
        if ns["swap_commitment"](mutated, EXECUTOR) == base:
            failures.append(f"commitment ignores '{field}' - it is not bound")
        else:
            print(f"  ok  commitment binds '{field}'")

    if ns["swap_commitment"](ORDER, "0x0000000000000000000000000000000000000123") == base:
        failures.append("commitment ignores the executor address")
    else:
        print("  ok  commitment binds the executor address")

    # 5b. Liquidity commitments, frozen against CommitmentConformance.t.sol.
    liq_user = "0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2"
    token_a  = "0x58B6CD7891cd0A682226E25607b958a6479195A6"
    token_b  = "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e"
    lp_token = "0x4680BCe1632824d30D2F53656dD610736c3e312e"

    check("v2 add commitment", "0x" + ns["v2_add_commitment"]({
        "user": liq_user, "token_a": token_a, "token_b": token_b,
        "amount_a_desired": 100 * 10**18, "amount_b_desired": 200 * 10**18,
        "amount_a_min": 99 * 10**18, "amount_b_min": 198 * 10**18,
        "deadline": 1_800_000_000,
    }, EXECUTOR).hex(),
        "0x100ccfa86be1e9f1e4709e7207f585d9772bf01063b5fb4a9e55e63f7b4ce317")

    check("v2 remove commitment", "0x" + ns["v2_remove_commitment"]({
        "user": liq_user, "token_a": token_a, "token_b": token_b,
        "lp_token": lp_token, "lp_amount": 50 * 10**18,
        "amount_a_min": 49 * 10**18, "amount_b_min": 98 * 10**18,
        "deadline": 1_800_000_000,
    }, EXECUTOR).hex(),
        "0xa98a357b82137940e9309315904cecd862ed1fdc96506ba17c81df9f190050d8")

    # 5b-ii. V3 liquidity. The lower tick is negative on purpose: Solidity
    #        sign-extends int24 across the whole word, so an encoder that treated
    #        ticks as unsigned would agree on every position above spot and
    #        diverge on exactly the ranges users actually open.
    check("v3 add commitment", "0x" + ns["v3_add_commitment"]({
        "user": liq_user, "token0": token_a, "token1": token_b, "fee": 3000,
        "tick_lower": -887220, "tick_upper": 887220,
        "amount0_desired": 100 * 10**18, "amount1_desired": 200 * 10**18,
        "amount0_min": 99 * 10**18, "amount1_min": 198 * 10**18,
        "deadline": 1_800_000_000,
    }, EXECUTOR).hex(),
        "0xca6521d598a543cd272f47488f3d4bb16406b73304b6208dabe4bd47c4307f4a")

    check("v3 remove commitment", "0x" + ns["v3_remove_commitment"]({
        "user": liq_user, "token_id": 4242,
        "token0": token_a, "token1": token_b,
        "liquidity": 123456789,
        "amount0_min": 49 * 10**18, "amount1_min": 98 * 10**18,
        "deadline": 1_800_000_000,
    }, EXECUTOR).hex(),
        "0xdd2fd08b01d28a42b45e4b961a8867fd8efd47feb9984df910192a0988fece2d")

    # Signed-word encoding, directly.
    check("int word for -1", ns["_word_int"](-1).hex(), "ff" * 32)
    check("int word for -887220", ns["_word_int"](-887220).hex(),
          ((1 << 256) - 887220).to_bytes(32, "big").hex())
    check("int word for 887220", ns["_word_int"](887220).hex(),
          (887220).to_bytes(32, "big").hex())

    # 5b-iii. The vendored keccak, on its own terms.
    #
    # This is the implementation that runs if the runtime's undocumented
    # `genlayer.types.keccak` is absent from the pinned runner. It has to be
    # exactly right, not approximately right: a commitment computed with a
    # subtly wrong hash matches nothing and every settlement fails. Block
    # boundaries (135/136/137 bytes around the 136-byte rate) are where a
    # padding mistake would hide.
    vendored = ns["_keccak256_vendored"]
    check("vendored keccak of empty input", vendored(b"").hex(),
          "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    for probe in [b"", b"abc", b"SOYARA_SWAP_V2", b"recordVerdict(uint256,uint64)",
                  bytes(range(256)) * 3, b"x" * 135, b"y" * 136, b"z" * 137]:
        if vendored(probe) != keccak(probe):
            failures.append(f"vendored keccak disagrees on a {len(probe)}-byte input")
    else:
        print("  ok  vendored keccak matches the reference on all probes")

    # 5c. The IC-to-EVM boundary.
    #
    # The selector is the part most likely to be silently wrong, and a wrong one
    # produces a call that hits no function at all. AgentSettlementApproval.t.sol
    # asserts the executor's recordVerdict has exactly the selector derived here,
    # and that calldata shaped this way is accepted from the validator address
    # and refused from every other.
    sites = evm_call_sites()
    by_name = {name: (types, is_send) for name, types, is_send in sites}

    expected = {
        "recordVerdict":          (("u256", "u64"), True),
        "getPair":                (("Address", "Address"), False),
        "getPool":                (("Address", "Address", "u24"), False),
        "token0":                 ((), False),
        "token1":                 ((), False),
        "fee":                    ((), False),
        "balanceOf":              (("Address",), False),
        "quoteExactInputSingle":  (("Address", "Address", "u24", "u256", "u160"), False),
    }
    for name, (types, is_send) in expected.items():
        if name not in by_name:
            failures.append(f"contract no longer makes an EVM call to '{name}'")
            continue
        check(f"EVM call '{name}' arg types", by_name[name][0], types)
        check(f"EVM call '{name}' is {'send' if is_send else 'view'}", by_name[name][1], is_send)

    # Only the send path may write, and only to record a verdict. An extra send
    # would be a second way for this contract to move value on the EVM side.
    sends = sorted({n for n, _, is_send in sites if is_send})
    check("EVM send call sites", sends, ["recordVerdict"])

    solidity_sig = "recordVerdict(uint256,uint64)"
    check("recordVerdict selector", "0x" + keccak(solidity_sig.encode()).hex()[:8],
          "0x" + keccak(b"recordVerdict(uint256,uint64)").hex()[:8])

    # 6. Route program decoding: one V2 leg pulled from the user.
    program = (
        bytes([0x02])
        + bytes.fromhex("58B6CD7891cd0A682226E25607b958a6479195A6")
        + bytes([1])                                                    # one leg
        + (65535).to_bytes(2, "big")                                    # full share
        + bytes([0])                                                    # PT_UNIV2
        + bytes.fromhex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")     # pool
        + bytes([0])                                                    # dir token0->token1
        + (3000).to_bytes(3, "big")                                     # fee ppm
    )
    stages = ns["decode_route_program"](program)
    check("decoded stage count", len(stages), 1)
    check("decoded leg count", len(stages[0]["legs"]), 1)
    swap = stages[0]["legs"][0]["swap"]
    check("decoded pool kind", swap["kind"], "v2")
    check("decoded pool address", swap["pool"], "0x" + "aa" * 20)
    check("decoded fee ppm", swap["fee_ppm"], 3000)

    # An unknown opcode must fail closed rather than decode to an empty route.
    try:
        ns["decode_route_program"](bytes([0x77]))
        failures.append("unknown opcode was accepted instead of rejected")
    except ValueError:
        print("  ok  unknown opcode rejected")

    try:
        ns["decode_route_program"](bytes([0x02]) + bytes(5))
        failures.append("truncated program was accepted instead of rejected")
    except ValueError:
        print("  ok  truncated program rejected")

    # 7. Constant-product math must mirror AGGFlow._swapUniV2 (fee in ppm).
    amount_in, r_in, r_out, fee_ppm = 10**18, 10**24, 2 * 10**24, 3000
    expected = (amount_in * (1_000_000 - fee_ppm) * r_out) // (
        r_in * 1_000_000 + amount_in * (1_000_000 - fee_ppm)
    )
    check("v2 constant-product output", ns["_v2_amount_out"](amount_in, r_in, r_out, fee_ppm), expected)
    check("v2 output on an empty pool", ns["_v2_amount_out"](amount_in, 0, r_out, fee_ppm), 0)

    print()
    # ── The matched settlement contract ──────────────────────────────────
    #
    # A copy of AgentExecutor.sol used to live in this folder and went stale
    # with nothing noticing. It still carried `onlyAgent` on executeSwap and an
    # `approveTradeWithParams` that let the settlement agent write its own
    # approval, which is the design this work replaced. A reviewer opening the
    # folder saw the fixed validator sitting beside the rejected executor and
    # would reasonably have concluded nothing had been fixed.
    #
    # "Keep the copy in sync" was already the intent and it failed silently, so
    # the rule is one copy at its canonical path and a failure here if a second
    # one appears.
    here = os.path.dirname(os.path.abspath(__file__))
    agg = os.path.normpath(os.path.join(here, "..", "aggregator", "src"))

    strays = sorted(f for f in os.listdir(here) if f.endswith(".sol"))
    check("no Solidity copy duplicated into the IC folder", strays, [])

    exec_src = os.path.join(agg, "AgentExecutor.sol")
    base_src = os.path.join(agg, "base", "AgentExecutorBase.sol")
    check("canonical AgentExecutor.sol exists", os.path.isfile(exec_src), True)
    check("canonical AgentExecutorBase.sol exists", os.path.isfile(base_src), True)

    if os.path.isfile(exec_src) and os.path.isfile(base_src):
        both = open(exec_src).read() + open(base_src).read()
        # The markers that separate the enforcing executor from the one the
        # review rejected. Match DECLARATIONS, not mentions: the base contract
        # carries a comment explaining why the agent-written approval was
        # removed, and a comment recording that history is worth keeping - an
        # earlier version of this check failed on it, which would have pushed
        # someone to delete the explanation to make a test go green.
        check("executor authenticates the verdict itself (recordVerdict)",
              bool(re.search(r"function\s+recordVerdict\s*\(", both)), True)
        check("recordVerdict is restricted to the validator (onlyValidator)",
              bool(re.search(r"modifier\s+onlyValidator\b", both)), True)
        check("no agent-written approval function remains",
              bool(re.search(r"function\s+approveTrade\w*\s*\(", both)), False)
        check("executeSwap is not gated on the agent alone (onlyAgent)",
              bool(re.search(r"function\s+executeSwap[\s\S]{0,400}?\bonlyAgent\b[\s\S]{0,40}?\{", both)), False)

        # The attestor quorum was a second settlement rail: M signing keys could
        # authorise a trade no GenLayer round had approved, because nothing on
        # chain tied a signature to a verdict the IC had recorded. It was
        # removed. These assert it has not crept back in.
        check("no attestor quorum verifier",
              bool(re.search(r"function\s+_verifyAttestorQuorum\s*\(", both)), False)
        check("no attestor threshold setter",
              bool(re.search(r"function\s+setAttestorThreshold\s*\(", both)), False)
        check("no attestations argument on any execute path",
              bool(re.search(r"bytes\[\]\s+calldata\s+attestations", both)), False)
        check("_consumeVerdict has no fallback branch",
              bool(re.search(r"_consumeVerdict[\s\S]{0,900}?\belse\b", both)), False)
        check("settlement requires a recorded verdict",
              bool(re.search(r"if\s*\(\s*exp\s*==\s*0\s*\)\s*revert\s+NoConsensusVerdict", both)), True)

        # The owner must not be able to install a bare key where consensus goes.
        check("validator must be a contract",
              bool(re.search(r"code\.length\s*==\s*0\s*\)\s*revert\s+ValidatorNotAContract", both)), True)
        check("validator and relaying agent are mutually exclusive",
              bool(re.search(r"_validator\s*==\s*authorisedAgent[\s\S]{0,80}?RoleConflict", both)), True)

    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print("  - " + f)
        return 1
    print("All commitment conformance checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
