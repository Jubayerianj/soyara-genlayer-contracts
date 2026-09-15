#!/usr/bin/env python3
"""
Offline tests for SoyaraAgentDex.py.

The contract needs GenVM to import, so this file installs a small stand-in for
the `genlayer` module first: storage types become dicts and lists, the Bradbury
JSON-RPC read returns reserves the test controls, and the LLM answers what the
test tells it to. Everything else, including every amount, price and balance
change, is the shipped contract code.

What it cannot prove is GenVM itself: storage views, calldata encoding, fees and
real validator agreement. scripts/studio-next-e2e.mjs in the app covers those
against the deployed contract.

    python3 test_soyara_agent_dex.py
"""

import importlib.util
import json
import os
import sys
import types
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "SoyaraAgentDex.py")
ONE = 10**18


# --------------------------------------------------------------------- stubs

class _Generic:
    def __class_getitem__(cls, _item):
        return cls


class TreeMap(dict, _Generic):
    def get_or_insert_default(self, key):
        if key not in self:
            self[key] = DynArray()
        return self[key]


class DynArray(list, _Generic):
    pass


class UserError(Exception):
    def __init__(self, data):
        super().__init__(data)
        self.data = data


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Address:
    def __init__(self, value):
        if isinstance(value, Address):
            value = value.as_hex
        v = str(value)
        if not (v.startswith("0x") and len(v) == 42):
            raise ValueError("bad address")
        int(v[2:], 16)
        self.as_hex = v


class World:
    """What the stubbed network returns."""
    sender = "0x" + "a1" * 20
    now = 1_800_000_000
    reserves = {}          # Bradbury pair address (lower) -> (reserve0, reserve1)
    llm_answer = "true"
    rpc_down = False
    prompts = []


def _post(url, body=None, headers=None):
    if World.rpc_down:
        raise RuntimeError("down")
    req = json.loads(body)
    to = req["params"][0]["to"].lower()
    r0, r1 = World.reserves[to]
    result = "0x" + format(r0, "064x") + format(r1, "064x") + "0" * 64
    return types.SimpleNamespace(status=200, body=json.dumps({"result": result}).encode())


def _run_nondet_default(leader, validator):
    value = leader()
    assert validator(Return(value)), "validator disagreed with an honest leader"
    return value


def _exec_prompt(prompt, **_):
    World.prompts.append(prompt)
    return World.llm_answer


class Contract:
    """GenVM zero-initialises every annotated storage field; so does this."""

    def __new__(cls, *args, **kwargs):
        obj = super().__new__(cls)
        defaults = {TreeMap: TreeMap, DynArray: DynArray, int: int, str: str, bool: bool}
        for name, kind in getattr(cls, "__annotations__", {}).items():
            kind = getattr(kind, "__origin__", kind)
            setattr(obj, name, defaults.get(kind, lambda: None)())
        return obj


def _install_stub():
    gl = types.ModuleType("genlayer")
    identity = lambda f: f
    gl.storage = types.SimpleNamespace(allow=identity, TreeMap=TreeMap, DynArray=DynArray)
    gl.u256 = gl.u64 = gl.u32 = int
    gl.Address = Address
    gl.contract = types.SimpleNamespace(Contract=Contract)
    gl.public = types.SimpleNamespace(write=identity, view=identity)
    gl.message = type("Msg", (), {
        "sender_address": property(lambda _s: Address(World.sender)),
        "raw": property(lambda _s: {"datetime": datetime.fromtimestamp(World.now, tz=timezone.utc).isoformat()}),
    })()

    def _no_timestamp():
        raise SystemError("2: inval")  # what the Studio Next runner does

    gl.vm = types.SimpleNamespace(
        UserError=UserError,
        Return=Return,
        get_timestamp=_no_timestamp,
        run_nondet_default=_run_nondet_default,
    )
    gl.nondet = types.SimpleNamespace(web=types.SimpleNamespace(post=_post), exec_prompt=_exec_prompt)
    gl.eq_principle = types.SimpleNamespace(strict_eq=lambda fn: fn())
    sys.modules["genlayer"] = gl


_install_stub()
_spec = importlib.util.spec_from_file_location("soyara_agent_dex", SOURCE)
dex = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dex)


# ------------------------------------------------------------------- helpers

USER = "0x" + "a1" * 20
AGENT = "0x" + "b2" * 20
OTHER = "0x" + "c3" * 20
_rid = [0]


def rid():
    _rid[0] += 1
    return format(_rid[0], "016x")


def as_user(addr):
    World.sender = addr


def set_market(pair, base_reserve, quote_reserve):
    """Set Bradbury reserves in pool orientation; stored in token0/token1 order."""
    market = dex.MARKETS[pair][0].lower()
    base, quote = pair.split("/")
    if dex.BRADBURY_TOKENS[base].lower() < dex.BRADBURY_TOKENS[quote].lower():
        World.reserves[market] = (base_reserve, quote_reserve)
    else:
        World.reserves[market] = (quote_reserve, base_reserve)


def fresh():
    World.now = 1_800_000_000
    World.llm_answer = "true"
    World.rpc_down = False
    World.prompts = []
    set_market("USDC/USDT", 2_965_085 * ONE, 2_965_027 * ONE)
    set_market("ETH/USDC", 979 * ONE // 1000, 2552 * ONE)
    set_market("ETH/USDT", 998 * ONE // 1000, 2504 * ONE)
    set_market("WGEN/USDC", 23 * ONE, 22_156 * ONE)
    as_user(USER)
    c = dex.SoyaraAgentDex()
    for pair in dex.MARKETS:
        c.anchor_pool(pair)
    c.claim_test_tokens(USER)
    return c


def bal(c, who, sym):
    return int(c.get_balances(who)[sym])


FAILED = []


def check(name, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + name + (("  " + str(detail)) if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


def raises(fn, text):
    try:
        fn()
    except UserError as e:
        return text in str(e.data)
    return False


# --------------------------------------------------------------------- tests

def test_pure_math():
    check("amount_out_for matches x*y=k with 0.3% fee",
          dex.amount_out_for(1_000, 1_000_000, 1_000_000) == 996)
    check("amount_out_for is zero on empty input", dex.amount_out_for(0, 10, 10) == 0)
    check("shortfall_bps is zero above reference", dex.shortfall_bps(101, 100) == 0)
    check("shortfall_bps measures below reference", dex.shortfall_bps(97, 100) == 300)
    check("deviation_bps is symmetric in distance", dex.deviation_bps(98, 100) == 200 and dex.deviation_bps(102, 100) == 200)
    check("isqrt exact", dex.isqrt(10**36) == 10**18 and dex.isqrt(15) == 3)
    check("fmt_amount trims", dex.fmt_amount(15 * ONE // 10) == "1.5" and dex.fmt_amount(3 * ONE) == "3")
    check("pair_for finds both directions",
          dex.pair_for("USDT", "USDC") == ("USDC/USDT", False) and dex.pair_for("ETH", "USDC") == ("ETH/USDC", True))
    check("pair_for refuses a pair with no pool", dex.pair_for("WGEN", "ETH") == (None, False))
    nb, nq = dex.re_anchor(1000 * ONE, 1000 * ONE, 1 * ONE, 4 * ONE)
    check("re_anchor keeps k and moves the price", abs(nb * nq - 1000 * ONE * 1000 * ONE) < 1000 * ONE * 2 and abs(nq * 100 // nb - 400) <= 1)


def test_orientation_against_bradbury_addresses():
    # ETH (0x0F56...) sorts before USDC (0x58B6...), so on Bradbury ETH is token0.
    check("ETH/USDC base is token0", dex.orient_reserves("ETH/USDC", 1, 2) == (1, 2))
    # USDC (0x58B6...) sorts after USDT (0x4B54...), so USDT is token0.
    check("USDC/USDT base is token1", dex.orient_reserves("USDC/USDT", 1, 2) == (2, 1))
    # WGEN (0x3153...) sorts before USDC.
    check("WGEN/USDC base is token0", dex.orient_reserves("WGEN/USDC", 1, 2) == (1, 2))


def test_seed_and_faucet():
    c = fresh()
    pools = {p["pair"]: p for p in c.get_pools()}
    eth = pools["ETH/USDC"]
    price = int(eth["price"]) / ONE
    check("ETH/USDC seeded at the live Bradbury price", abs(price - 2552 / 0.979) < 1, price)
    check("seed uses configured depth", int(eth["reserve_base"]) == 250 * ONE)
    check("faucet credited USDC", bal(c, USER, "USDC") == 1000 * ONE)
    check("faucet cooldown enforced", raises(lambda: c.claim_test_tokens(USER), "cooldown"))
    World.now += 3601
    c.claim_test_tokens(USER)
    check("faucet works again after an hour", bal(c, USER, "USDC") == 2000 * ONE)


def test_consensus_swap_settles():
    c = fresh()
    r = rid()
    q = c.quote("USDC", "USDT", 100 * ONE)
    v = c.swap(r, "USDC", "USDT", 100 * ONE, int(q["amount_out"]), 100)
    check("consensus swap approved", v["approved"], v["reason"])
    check("USDC debited", bal(c, USER, "USDC") == 900 * ONE)
    check("USDT credited with the quoted output", bal(c, USER, "USDT") == 1000 * ONE + int(q["amount_out"]))
    check("verdict readable by request id", c.get_verdict(r)["approved"] is True)
    trades = c.get_trades(USER, 10)
    check("trade recorded on the consensus rail", len(trades) == 1 and trades[0]["rail"] == "consensus")
    check("replay of the same request id refused", raises(lambda: c.swap(r, "USDC", "USDT", ONE, 0, 100), "already used"))


def test_consensus_swap_refusals():
    c = fresh()
    v = c.swap(rid(), "USDC", "USDT", 5000 * ONE, 0, 100)
    check("insufficient balance refused and recorded", not v["approved"] and "Not enough" in v["reason"])
    check("refusal leaves balances untouched", bal(c, USER, "USDC") == 1000 * ONE)
    v = c.swap(rid(), "USDC", "ETH", 300 * ONE, 0, 300)
    check("trade over 10% of the live market refused", not v["approved"] and "Too large" in v["reason"], v["reason"])
    v = c.swap(rid(), "WGEN", "ETH", ONE, 0, 100)
    check("pair without a pool refused", not v["approved"] and "No pool" in v["reason"])
    v = c.swap(rid(), "USDC", "USDT", ONE, 0, 301)
    check("slippage above 3% refused", not v["approved"] and "Slippage" in v["reason"])
    v = c.swap(rid(), "USDC", "USDT", 100 * ONE, 101 * ONE, 100)
    check("output below the user's minimum refused", not v["approved"] and "minimum" in v["reason"])
    check("unsupported token raises", raises(lambda: c.swap(rid(), "DOGE", "USDT", ONE, 0, 100), "unsupported"))
    check("stats count refusals", c.get_config()["refusals"] == 5)


def test_market_moves_pool_is_reanchored_or_refused():
    c = fresh()
    # Bradbury ETH doubles. The pool is now 50% off, which a consensus swap re-anchors
    # before pricing, so the user gets the live price rather than a stale one.
    set_market("ETH/USDC", 979 * ONE // 1000, 5104 * ONE)
    q_before = c.quote("USDC", "ETH", 100 * ONE)
    v = c.swap(rid(), "USDC", "ETH", 100 * ONE, 0, 100)
    check("drifted pool re-anchored, trade settles at the live price", v["approved"], v["reason"])
    got = int(v["amount_out"])
    check("output reflects the new market, not the stale pool", got < int(q_before["amount_out"]) * 6 // 10, (got, q_before["amount_out"]))
    pool = {p["pair"]: p for p in c.get_pools()}["ETH/USDC"]
    check("pool price now near the live market", abs(int(pool["price"]) / ONE - 5104 / 0.979) / (5104 / 0.979) < 0.01)


def test_mandate_rail():
    c = fresh()
    mid = rid()
    v = c.issue_mandate(mid, AGENT, "USDC", "USDT", 300 * ONE, 100 * ONE, 100, 60,
                        "trade up to 300 usdc into usdt, 100 max each time")
    check("mandate issued", v["approved"], v["reason"])
    check("LLM saw the user's instruction", World.prompts and "300 usdc" in World.prompts[-1])
    m = c.get_mandate(mid)
    check("mandate active with the live reference price", m["status"] == "active" and int(m["ref_price"]) > 0)

    as_user(AGENT)
    v = c.swap_under_mandate(rid(), mid, 100 * ONE, 0)
    check("agent settles under the mandate", v["approved"], v["reason"])
    check("user's USDC moved, not the agent's", bal(c, USER, "USDC") == 900 * ONE and bal(c, AGENT, "USDC") == 0)
    v = c.swap_under_mandate(rid(), mid, 101 * ONE, 0)
    check("over the per-trade cap refused", not v["approved"] and "per-trade cap" in v["reason"])
    c.swap_under_mandate(rid(), mid, 100 * ONE, 0)
    c.swap_under_mandate(rid(), mid, 100 * ONE, 0)
    v = c.swap_under_mandate(rid(), mid, 50 * ONE, 0)
    check("budget exhausted refused", not v["approved"] and "budget" in v["reason"], v["reason"])
    check("mandate reports spent", c.get_mandate(mid)["status"] == "spent")

    as_user(OTHER)
    v = c.swap_under_mandate(rid(), mid, ONE, 0)
    check("stranger cannot use the mandate", not v["approved"] and "Only the mandate" in v["reason"])


def test_mandate_expiry_revocation_and_band():
    c = fresh()
    mid = rid()
    c.issue_mandate(mid, AGENT, "USDC", "USDT", 500 * ONE, 200 * ONE, 50, 10, "")
    check("no instruction means no LLM call", World.prompts == [])
    as_user(AGENT)
    World.now += 11 * 60
    v = c.swap_under_mandate(rid(), mid, ONE, 0)
    check("expired mandate refused", not v["approved"] and "expired" in v["reason"])

    World.now -= 11 * 60
    as_user(USER)
    c.revoke_mandate(mid)
    as_user(AGENT)
    v = c.swap_under_mandate(rid(), mid, ONE, 0)
    check("revoked mandate refused", not v["approved"] and "revoked" in v["reason"])

    as_user(USER)
    mid2 = rid()
    c.issue_mandate(mid2, AGENT, "USDC", "USDT", 600 * ONE, 200 * ONE, 30, 60, "")
    as_user(AGENT)
    # 200 USDC against 1M depth moves the pool ~0.02%; a 0.3% fee plus impact is
    # 0.32%, just outside a 0.3% band.
    v = c.swap_under_mandate(rid(), mid2, 200 * ONE, 0)
    check("fill outside the mandate's price band refused", not v["approved"] and "band" in v["reason"], v["reason"])


def test_mandate_refusals_at_issue():
    c = fresh()
    World.llm_answer = "false"
    v = c.issue_mandate(rid(), AGENT, "USDC", "USDT", 300 * ONE, 100 * ONE, 100, 60, "only 10 usdc per trade")
    check("LLM 'false' refuses the mandate", not v["approved"] and "looser" in v["reason"])
    World.llm_answer = "true"
    v = c.issue_mandate(rid(), USER, "USDC", "USDT", 300 * ONE, 100 * ONE, 100, 60, "")
    check("agent equal to user refused", not v["approved"] and "different address" in v["reason"])
    v = c.issue_mandate(rid(), AGENT, "USDC", "USDT", 5000 * ONE, 100 * ONE, 100, 60, "")
    check("budget above balance refused", not v["approved"] and "balance" in v["reason"])
    v = c.issue_mandate(rid(), AGENT, "USDC", "ETH", 900 * ONE, 300 * ONE, 100, 60, "")
    check("cap over 10% of the live market refused", not v["approved"] and "10%" in v["reason"], v["reason"])
    v = c.issue_mandate(rid(), AGENT, "USDC", "USDT", 100 * ONE, 100 * ONE, 100, 60 * 25, "")
    check("mandate over 24h refused", not v["approved"] and "24 hours" in v["reason"])
    check("revoke by a stranger raises", raises(lambda: (as_user(OTHER), c.revoke_mandate("nope")), "No such"))


def test_desk_view_is_one_read():
    c = fresh()
    c.swap(rid(), "USDC", "USDT", 10 * ONE, 0, 100)
    d = c.get_desk(USER, 5)
    check("desk carries pools, balances, mandates and trades",
          len(d["pools"]) == 4 and d["balances"]["USDC"] == str(990 * ONE) and d["mandates"] == [] and len(d["trades"]) == 1)
    anon = c.get_desk("", 5)
    check("desk without a user carries only public state", "balances" not in anon and len(anon["pools"]) == 4)


def test_market_unavailable_raises():
    c = fresh()
    World.rpc_down = True
    check("an unreachable market fails the round rather than guessing",
          raises(lambda: c.swap(rid(), "USDC", "USDT", ONE, 0, 100), "market unavailable"))


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print()
    if FAILED:
        print(str(len(FAILED)) + " failed: " + ", ".join(FAILED))
        sys.exit(1)
    print("all passed")
