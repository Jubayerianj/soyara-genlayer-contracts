# FlipSwap DEX — GenLayer Intelligent Contracts

AI-validated execution layer for the FlipSwap DEX aggregator, deployed on the **GenLayer Bradbury Testnet**.

---

## 🚀 Deployed Contracts (Bradbury Testnet)

| Contract | Address |
|---|---|
| **AgentValidator** (GenLayer IC) | `0x0a7125fdFAf4092b10Be8f509ce76A2AE7f5735A` |
| **AgentExecutor** (settlement) | `0x758d57cF9c96bC6235c1fA3929209A1C42346E18` |
| **LiquidityValidator** | `0xEFb9473B5269A79d72Df4b6E73E310791a185eeC` |

> The AgentValidator and the AgentExecutor are a matched pair and must be
> replaced together: the IC holds the executor's address and the executor
> accepts `recordVerdict` only from the IC. The LiquidityValidator authorises
> nothing on this path; the executor takes verdicts only from AgentValidator.

### The matched settlement contract

`AgentValidator.py` and the `AgentExecutor` are a matched pair: the validator
holds the executor's address, and the executor accepts `recordVerdict` **only**
from this validator, over its ghost contract. They must be reviewed and
deployed together.

The executor's Solidity source is **not duplicated into this folder**. It lives
at its canonical path, with the base contract and libraries it needs:

| File | Path |
|---|---|
| `AgentExecutor.sol` | [`../aggregator/src/AgentExecutor.sol`](../aggregator/src/AgentExecutor.sol) |
| `AgentExecutorBase.sol` | [`../aggregator/src/base/AgentExecutorBase.sol`](../aggregator/src/base/AgentExecutorBase.sol) |
| `TradeHashLib.sol` | [`../aggregator/src/libraries/TradeHashLib.sol`](../aggregator/src/libraries/TradeHashLib.sol) |
| `SettlementTypes.sol` | [`../aggregator/src/types/SettlementTypes.sol`](../aggregator/src/types/SettlementTypes.sol) |
| Tests (57) | [`../aggregator/test/`](../aggregator/test/) |

A copy of `AgentExecutor.sol` used to sit in this folder and had gone stale: it
still carried `onlyAgent` on `executeSwap` and an `approveTradeWithParams` that
let the settlement agent write its own approval, which is the design this work
replaced. Anyone reading the pair here would have concluded the verdict was
still enforced by a privileged key. `test_commitment_conformance.py` now fails
if a copy is reintroduced.

### Frontend address map

```js
export const CONTRACT_ADDRESSES = {
  4221: {
    factory: "0x4680BCe1632824d30D2F53656dD610736c3e312e",
    router: "0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5",
    weth: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wgen: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WGEN: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wrappedNative: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WETH: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    aggregatorRouter: '0xafCAD2bf0E85e30a2b54ac6491dC81987cE7767C',
    aggregatorEntrypoint: '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA',
    dexFeeVault: '0x48234eD645676b794a4CbC7483513e58cB04e22E',
    // SoyaraDex V3
    v3Factory: "0xBd959038300aF0C8dd1873E497d6D0a565b4E246",
    v3Router: "0xdf69970B2fE416339187aA41D39882e864984CE9",
    v3NftDescriptor: "0xef334fcAA42A17CF8f76627408Ee0cE91eBaE6E4",
    v3NftPositionDescriptor: "0xbC5a5E695a70208Bd18B742C6731C749F1748795",
    v3PositionManager: "0x779380011B5F2aB40985D810B5c7641539beD870",
    v3Migrator: "0xa338b743Ec494ebB8345f4B6F27ffC902b7EF5Aa",
    v3Quoter: "0xca4914407868bc37ccbE324cA149DD475d39A2Bf",
    v3TickLens: "0xCa4c7EdB398684cB4C5B3fD0cc6ced30b5a5f4d3",
    multicall: "0x6d1503E294b122Eb6B37ECe9c74d24D83f8B478b",
    // GenLayer Intelligent Contracts
    // AgentValidator and AgentExecutor were redeployed 2026-09-07 AS A PAIR, when
    // verdict enforcement moved out of the settlement agent and into the executor.
    // Each holds the other's address, so they must be replaced together:
    //   executor.genLayerValidator() -> 0xf47492A9...
    //   IC get_config().agent_executor -> 0x0F1E9857...
    // The previous pair (0x7ABa9466... / 0xa835c0a8...) is retired: that executor
    // still exposes approveTradeWithParams, which let the agent write its own
    // approval. Do not point new code at it. See DEPLOYMENTS.md.
    agentValidator: "0x0a7125fdFAf4092b10Be8f509ce76A2AE7f5735A",
    liquidityValidator: "0xEFb9473B5269A79d72Df4b6E73E310791a185eeC",
    agentExecutor: "0x758d57cF9c96bC6235c1fA3929209A1C42346E18",
  }
};
```

- **Network:** GenLayer Bradbury Testnet (chainId: `4221`)
- **RPC:** `https://rpc-bradbury.genlayer.com`
- **Explorer:** `https://explorer-bradbury.genlayer.com`
- **Deployer / Owner:** `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2`
- **Updated & Active:** 2026-09-04

> **2026-09-04 redeploy:** the previous AgentValidator (`0xFc77C6A2...`) had a stale
> `APPROVED_ROUTERS` whitelist left over from before `AGGFlowEntrypoint`/`AGGFlowRouter`
> were redeployed, so every real proposal submitted by the frontend (which always sends
> the current `aggregatorEntrypoint` address) was rejected at the deterministic
> router-whitelist check before it ever reached execution. It also read `time.time()`
> to check deadline expiry, which is non-deterministic across GenVM validator nodes.
> Both are fixed in this version; deadline expiry is now enforced only on-chain by
> `AgentExecutor`'s `validDeadline` modifier.

---

## 📐 Architecture

```
User → Gemini AI Agent → settlement agent (relayer)
            │
            │  the FULL order: route program, fee, fee collector,
            │  user, quote, router, deadline, nonce
            ▼
     AgentValidator (GenLayer IC)
            │  · policy rules
            │  · DECODES the aggregator route program
            │  · confirms every pool against the V2/V3 factory
            │  · re-derives the output from LIVE reserves
            │  · LLM coherence review
            │
            │  emit external message on FINALIZATION
            ▼
     AgentExecutor.recordVerdict(commitment, expiry)   ← msg.sender is the IC
            │
            │  agent relays executeSwap(order, aggProgram, [])
            ▼
     AgentExecutor → AGGFlowEntrypoint → V2/V3 Pools
```

### Where authority lives

The settlement agent used to be the enforcement point. It read the verdict off
this contract, decided it was satisfied, and then called
`AgentExecutor.approveTradeWithParams` — an `onlyAgent` function that simply
wrote its own approval into executor storage. The executor never learned
anything about GenLayer, so the root of trust was a private key in a web
server's environment and consensus was advisory.

Authority now sits in the contract. `AgentExecutor.recordVerdict` is callable
only by this Intelligent Contract: on GenLayer an IC reaches the EVM through its
**ghost contract**, which executes external messages via `handleOp()`, so the
executor sees `msg.sender` equal to the IC's own address. No operator key can
reach it. The agent's remaining power is to relay a trade consensus has already
approved.

### What the verdict covers

The old approval hash spanned seven fields and left `aggProgram`, `feeBps` and
`feeCollector` free on the execution call. An agent holding a legitimate approval
could route the trade anywhere and skim any fee the entrypoint would accept — up
to 100% — to an address of its choosing.

The commitment now spans the whole `SwapOrder`: user, both tokens, amount,
minimum, the validated quote, slippage, deadline, router, fee, fee collector,
`keccak256(aggProgram)` and a nonce, plus the chain id and the executor's
address. The executor re-derives it from the calldata it is settling, so
anything consensus did not see lands on an identifier no verdict backs.

The commitment is computed twice — here in Python and in Solidity by
`TradeHashLib` — and the two are pinned against each other by frozen vectors in
`test_commitment_conformance.py` and `CommitmentConformance.t.sol`. Run both
after touching either.

### Staying inside the documented API surface

The IC→EVM call is the single point the whole design rests on, so it is built
only from types GenLayer actually documents: the `u*`/`i*` families, `Address`,
`bool`, `str`, `bytes`.

That rules out two things the py-genlayer source offers but the docs do not
list, and both were tempting:

| Tempting | Used instead | Why |
|---|---|---|
| `recordVerdict(bytes32,uint64)` | `recordVerdict(uint256,uint64)` | A 32-byte hash *is* a `bytes32`, but fixed-size byte types are absent from the documented type mapping. Both encode to one static word, so the natural-looking type buys nothing and would bet the integration on an undocumented type existing in the pinned runner. |
| `getReserves() -> tuple[u112,u112,u32]` | `IERC20.balanceOf(pool)` | Multi-value returns need a tuple-typed stub, also undocumented. Balances and reserves are equal in a healthy pool — every V2 swap and mint syncs them — and when they diverge it is because of a donation, which inflates the balance and makes our computed output higher than the pool will really pay. The honest quote then reads low against ours and the trade is refused. The bias runs in the safe direction. |

`keccak256` is handled the same way. The runtime ships an implementation at
`genlayer.types.keccak`, which is also undocumented, so `AgentValidator.py`
imports it inside a `try` and falls back to a vendored pure-Python keccak-256.
The conformance test verifies the fallback against reference vectors including
the 135/136/137-byte block boundaries, where a padding mistake would hide.

The Python conformance test enforces this: it reads each stub's annotations out
of the source and rejects any type outside the documented mapping, so a future
edit cannot quietly reintroduce one.

### Time is deterministic here

GenVM pins the standard library clock to the transaction timestamp, so
`datetime.now(timezone.utc)` and `time.time()` return the same value on every
validator. An older comment in this contract claimed the opposite and avoided
time entirely; that was wrong, and two things follow from fixing it:

- **Verdicts expire.** A verdict is granted `min(deadline, now + 900s)`. It was
  issued against a quote that was live during the round, and letting it stay
  spendable for an hour would reintroduce the stale-price problem from the other
  direction.
- **Expired proposals are refused up front**, instead of spending a multi-minute
  consensus round only to be rejected by `validDeadline` at settlement.

### One consensus round per trade

The round is opened by `/api/genlayer-validate`, not at settlement. That route
quotes live pool state, builds the route program, assembles the order, and runs
`validate_swap` over it — then returns the order. `/api/agent-execute` takes it
back, waits for the verdict to reach the executor, and settles.

Handing the order back over the wire is safe for the same reason the whole
design works: nothing in the settlement route can authorise a trade. A modified
order hashes to a commitment no verdict backs, and the executor refuses it. The
client is holding a receipt, not a permission.

It is also what makes retries work. Re-quoting on a retry would rebuild the
route from current pools, and a route that moved by one pool yields a different
commitment — so the verdict the previous attempt was waiting on would be
orphaned and the caller could poll forever.

### Consensus rounds vs. finalization

External messages are delivered **on finalization only**; `on='accepted'` is not
available for them. So there is a real window between "the round approved this"
and "the executor will honour it", bounded by the appeal window. The settlement
routes poll `AgentExecutor.isVerdictLive(commitment)` and return `pending` during
that window rather than reporting a failure.

### Deployment order

The executor is deployed first, because the IC takes the executor's address as a
constructor argument. That means `genLayerValidator` cannot be a constructor
argument on the executor side, and must be bootstrapped afterwards:

```
1. deploy AgentExecutor
2. deploy AgentValidator with agent_executor = <executor address>
3. AgentExecutor.setGenLayerValidator(<validator address>)   ← owner only
```

Until step 3, `recordVerdict` reverts with `ValidatorNotSet` and nothing can
settle. That is deliberate: the contract fails closed rather than falling back
to trusting the agent.

---

## 📄 Contracts

### `AgentValidator.py`
Validates AI-generated swap/liquidity execution proposals.

**Key methods:**

```python
validate_swap(
    user,               # recipient; now part of the commitment
    token_in, token_out,
    amount_in,          # raw units as string
    min_amount_out,     # raw units as string
    quoted_amount_out,  # the live quote this order was validated against
    slippage_bps,       # e.g. 30 = 0.30%
    deadline,           # unix timestamp
    router,             # approved entrypoint
    fee_bps,            # consensus-governed, capped at 100 bps
    fee_collector,      # must be the canonical protocol collector
    route_program,      # 0x-prefixed aggProgram bytes — DECODED and verified
    nonce,
) -> {"approved": bool, "reason": str, "commitment": str, "live_quote": str, "pools": str}

validate_liquidity_v2_add(user, token_a, token_b, amount_a_desired,
                          amount_b_desired, amount_a_min, amount_b_min, deadline)
validate_liquidity_v2_remove(user, token_a, token_b, lp_token, lp_amount,
                             amount_a_min, amount_b_min, deadline)
validate_liquidity_v3_add(user, token0, token1, fee, tick_lower, tick_upper,
                          amount0_desired, amount1_desired,
                          amount0_min, amount1_min, deadline)
validate_liquidity_v3_remove(user, token_id, token0, token1, liquidity,
                             amount0_min, amount1_min, deadline)
```

All four operation types settle through the same registry, and each one's
commitment is pinned across Python and Solidity by a frozen vector.

`validate_proposal`, `issue_trading_mandate` and `check_mandate` remain for
backward compatibility and risk bookkeeping, but **none of them can authorise a
settlement**. They never see the route, the fee, the fee collector or the user,
so they cannot produce the identifier the executor checks, and they emit no
`recordVerdict` message. All three now return `settlement_authority: false` so
that a caller cannot mistake an approval from them for permission to settle.

`check_mandate` in particular is the `@gl.public.view` the GenLayer review called
"validating through a read simulation". It used to matter because the settlement
agent acted on its answer; it no longer can.

**Security model:**
- Only approved tokens (whitelist) are accepted
- Only approved routers (AGGFlowEntrypoint, V2/V3 routers) are accepted
- Hard slippage cap: **3% (300 bps)** — adjustable by owner
- Fee capped at **1% (100 bps)** and payable only to the canonical collector
- The route program is decoded, and **every pool is confirmed against the V2/V3
  factory** as the canonical pool for the pair it claims to serve
- The output is **re-derived from live reserves** and must match the declared
  quote within 50 bps
- `min_amount_out` must sit exactly one slippage band below that verified quote
- An opcode or pool type the decoder does not understand is **rejected**, not
  waved through: an unverifiable route cannot be approved
- LLM prompt contains **zero user free-text** — only structured numeric fields
- Emergency pause by owner

### `LiquidityValidator.py`
Specialized validator for V2 and V3 liquidity operations.

**Methods:**
- `validate_add_liquidity_v2(...)` — V2 add liquidity
- `validate_remove_liquidity_v2(...)` — V2 remove liquidity
- `validate_add_liquidity_v3(...)` — V3 mint position (checks fee tier + tick range)
- `validate_remove_liquidity_v3(...)` — V3 decrease liquidity

---

## 🛠 CLI Usage

### Read contract state
```bash
genlayer call 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e get_stats
genlayer call 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e get_config
genlayer call 0xEFb9473B5269A79d72Df4b6E73E310791a185eeC get_stats
```

### Update max slippage
```bash
genlayer write 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e set_max_slippage \
  --args 200
```

### Emergency pause
```bash
genlayer write 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e set_paused \
  --args true
```

---

## ⏭ Next Steps

1. **Redeploy** AgentExecutor and AgentValidator, then run
   `AgentExecutor.setGenLayerValidator(...)` — see *Deployment order* above.
2. **Verify the IC→EVM message end to end on Bradbury.** The external-message
   path (`_AgentExecutorEVM(...).emit().recordVerdict(...)`) cannot be exercised
   in Studio, where `@gl.evm.contract_interface` calls are not implemented. The
   first live run should confirm that a finalised `validate_swap` round leaves
   `isVerdictLive(commitment) == true` on the executor.
3. **Measure the finalization window** on Bradbury and tune `VERDICT_WAIT_MS` in
   `lib/verdict.js` to match it.
4. **Update token addresses** — fill in real addresses for ZKUSDC, ZKUSDT, LETH,
   ZKBTC, etc. in both contracts.
5. **One round per trade — done.** `/api/genlayer-validate` now builds the
   exact order that will settle and runs `validate_swap` over it, then hands
   that order to `/api/agent-execute`, which waits for the verdict and settles
   without opening anything new. The panel the user sees is a verdict on the
   trade that actually settles, and the multi-minute round latency is paid once
   rather than twice. `validate_proposal` remains only for `pages/dev.jsx` and
   the docs page.
