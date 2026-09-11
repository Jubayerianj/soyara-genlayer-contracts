# AgentValidator: the GenLayer Intelligent Contract behind Soyara settlement

The Intelligent Contract that authorises every agent trade on Soyara DEX, on the
**GenLayer Bradbury Testnet** (chain `4221`). It is one half of a matched pair:
it writes verdicts and mandates, and `AgentExecutor` refuses to settle anything
it did not write.

## Deployed

| | |
|---|---|
| **AgentValidator** (this contract) | `0xd1D809A1210cc039AEdBF5cD04628416Ad0e6a92` |
| **AgentExecutor** (its pair) | `0x1BCBad3da718690fa60289DcBF15835e5C79021f` |
| Executor owner (cold) | `0xF186d1414B7F399572F3945D1b84cc230caB9c55` |
| Settlement agent (hot, relays only) | `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2` |
| RPC | `https://rpc-bradbury.genlayer.com` |

The deployed code is `build/AgentValidator.min.py` byte for byte, and the pair is
bound both ways. `../verify-deployment.sh` checks all of it against the chain:

```bash
bash ../verify-deployment.sh
```

It fetches this contract's code with `gen_getContractCode` and compares it to a
fresh build, compiles the executor and compares its runtime bytecode to the
deployed one, and reads the binding from both sides.

## How it authorises settlement

The IC reaches the EVM through its **ghost contract**, which executes external
messages via `handleOp()`, so `AgentExecutor` sees `msg.sender` equal to the IC's
own address. Both of the executor's authority-writing functions are
`onlyValidator`; the settlement agent and the owner are refused with
`NotValidator`. An agent key can relay a trade. It cannot approve one.

Three write methods end in an external message to the executor:

| Method | Emits | Settles through |
|---|---|---|
| `validate_swap` | `recordVerdict(commitment, expiry)` | `executeSwap(order, aggProgram)`: consumes the verdict, single use |
| `issue_trading_mandate` | `recordMandate(id, user, tokenIn, tokenOut, caps, fee, collector, router, routeHash, pool, expiry)` | `executeSwapUnderMandate(id, amountIn, minAmountOut, feeBps, aggProgram)`: checked and priced on chain per trade |
| `validate_liquidity_v2_add` / `_remove` | `recordVerdict(commitment, expiry)` | `executeAddLiquidityV2` / `executeRemoveLiquidityV2` |

These are the two settlement rails for a swap. The app decides which one a trade
uses **before** any round is opened, and a trade never has both: a trade that a
live mandate covers on its best route gets no verdict of its own, and a trade
with its own verdict never falls onto a mandate.

```
user intent
     │  best-route quote → the exact SwapOrder (route program, fee, collector,
     │  recipient, quote, deadline, nonce)
     ▼
covered by a live mandate?  ──yes──►  executeSwapUnderMandate   (seconds)
     │ no
     ▼
validate_swap (GenVM consensus)
     │  decodes the aggregator route program
     │  confirms every pool against the V2/V3 factory
     │  re-derives the output from LIVE reserves
     │  LLM coherence review under strict_eq
     │
     │  external message, delivered on finalization
     ▼
AgentExecutor.recordVerdict(commitment, expiry)     ← onlyValidator
     ▼
AgentExecutor.executeSwap(order, aggProgram)        (after the appeal window)
     re-derives the commitment from the ORDER and consumes it
```

## Public interface (as deployed)

| Method | Kind | What it does |
|---|---|---|
| `validate_swap(user, token_in, token_out, amount_in, min_amount_out, quoted_amount_out, slippage_bps, deadline, router, fee_bps, fee_collector, route_program, nonce)` | write | Policy (whitelists, slippage cap 300 bps, fee cap 100 bps, canonical collector), then decodes `route_program`, confirms every pool against the factories, re-derives the output from live reserves (must match `quoted_amount_out` within 50 bps), requires `min_amount_out` to sit within the slippage band below it (the rule the executor enforces again on chain), runs the LLM review, and emits the verdict. |
| `issue_trading_mandate(user, token_in, token_out, max_amount_in, total_budget_in, max_slippage_bps, max_fee_bps, fee_collector, router, ttl_seconds, nonce)` | write | Resolves the pool from the V2 factory, reads its live reserves, refuses an illiquid pool or a per-trade cap above 10% of the reserve, **builds the route program itself**, and emits `recordMandate`. |
| `validate_liquidity_v2_add(...)` / `validate_liquidity_v2_remove(...)` | write | V2 deposits and withdrawals for the pools app. Confirms the pair (and the LP token) is the canonical factory pair, then emits a verdict for that exact operation. |
| `get_validation(proposal_id)` | view | The verdict a round recorded. A GenLayer write's return value is not recoverable from its receipt, so callers read it back here. |
| `get_config()` / `get_stats()` | view | Owner, paired executor, slippage cap, pause state; counters. |
| `is_token_approved(address)` / `is_router_approved(address)` | view | Whitelist lookups. |
| `set_max_slippage` / `set_agent_executor` / `set_paused` | write | Owner only. |

`genvm-lint check AgentValidator.py` and `genvm-lint check build/AgentValidator.min.py`
both pass (genvm-linter 0.11.0, 12 methods: 5 view, 7 write).

## V3 liquidity is not on the settlement path

`validate_liquidity_v3_add` / `_remove` and their helpers were **removed**. The
56 KB deployable build was refused with `BlockPubdataLimitReached`, and ~49 KB is
what deploys; those validators were the part nothing called. What follows:

- No verdict can exist for a V3 mint or burn. `AgentExecutor` still has
  `executeAddLiquidityV3` / `executeRemoveLiquidityV3` in its deployed bytecode,
  and both revert with `NoConsensusVerdict`: they fail closed. Removing them
  means redeploying the pair.
- The app makes no V3 liquidity call, and its validate route refuses a V3
  liquidity request before any round, pointing to the pools app.
- V3 **swaps** are unaffected: `_simulate_leg` still prices a V3 leg through the
  quoter, so a route crossing a V3 pool is verified against live state.
- The separate `LiquidityValidator` contract (`0xEFb9473B5269A79d72Df4b6E73E310791a185eeC`)
  is retired. The executor never accepted its answers, so it authorised nothing,
  and its source has been removed from this repository. Its deployed code remains
  readable on chain.

## What the verdict covers

The commitment spans the whole `SwapOrder`: user, both tokens, amount, minimum,
the validated quote, slippage, deadline, router, fee, fee collector,
`keccak256(aggProgram)` and a nonce, plus the chain id and the executor's
address. The executor re-derives it from the calldata it is settling, so
anything consensus did not see lands on an identifier no verdict backs.

The commitment is computed twice, here in Python and in Solidity by
`TradeHashLib`, and the two are pinned against each other by frozen vectors in
`test_commitment_conformance.py` and `CommitmentConformance.t.sol`. Run both
after touching either.

## What a mandate covers

A mandate is a bounded authority for one user, pair and direction: a per-trade
ceiling, a lifetime budget (which re-recording cannot refill), a slippage and
fee ceiling, the fee collector, the router, **the route by hash** (built by the
validators from the verified pool, and required per trade as
`keccak256(aggProgram) == routeHash`), the pool the executor prices against, and
an expiry. The settlement agent chooses only the size of each trade, and the
executor computes the expected output from the pool's live reserves itself.

The mandate id is derived from inputs the caller knows before the round runs
(type tag, chain id, executor, user, both tokens, nonce), so a caller can look a
mandate up by id after the round. The route is not part of the id; it is part of
the mandate's contents, which only `recordMandate` writes.

## Timing

A round decides in roughly 20 to 30 seconds. The verdict reaches the executor
as an EVM-bound external message, and GenVM's `EthSend` emission carries no
delivery-timing field (only `PostMessage` and `DeployContract` take
`on = accepted | finalized`), so it is delivered when the round **finalizes**:
the appeal window, 15 to 25 minutes on Bradbury. Finalization is a call someone
has to make; the app's settlement queue makes it.

A verdict is granted `min(deadline, now + 7200s)`. The TTL must exceed the
appeal window: a 900-second TTL once expired every verdict before it arrived.

## Staying inside the documented API surface

The IC→EVM call is the single point the whole design rests on, so it is built
only from types GenLayer actually documents: the `u*`/`i*` families, `Address`,
`bool`, `str`, `bytes`.

| Tempting | Used instead | Why |
|---|---|---|
| `recordVerdict(bytes32,uint64)` | `recordVerdict(uint256,uint64)` | A 32-byte hash *is* a `bytes32`, but fixed-size byte types are absent from the documented type mapping. Both encode to one static word, so the natural-looking type buys nothing and would bet the integration on an undocumented type existing in the pinned runner. |
| `getReserves() -> tuple[u112,u112,u32]` | `IERC20.balanceOf(pool)` | Multi-value returns need a tuple-typed stub, also undocumented. Balances and reserves are equal in a healthy pool, and when they diverge it is because of a donation, which makes the computed output higher than the pool will really pay, so the honest quote reads low against it and the trade is refused. The bias runs in the safe direction. |

`keccak256` is handled the same way: the runtime's `genlayer.types.keccak` is
undocumented, so `AgentValidator.py` imports it inside a `try` and falls back to
a vendored pure-Python keccak-256, verified by the conformance test against
reference vectors including the 135/136/137-byte block boundaries.

GenVM pins the standard library clock to the transaction timestamp, so
`datetime.now(timezone.utc)` is deterministic across validators; expired
proposals are refused up front.

## Building, testing, deploying

```bash
python3 build_deployable.py              # strips comments/docstrings -> build/AgentValidator.min.py
python3 test_commitment_conformance.py   # Python/Solidity commitment vectors + pairing guards
genvm-lint check AgentValidator.py       # needs Python >= 3.10; on 3.9 pip installs an empty 0.0.1
```

Deploying the pair is scripted in `../deploy-mandate-pair.sh` and
`../bind-and-verify.sh`. The executor is deployed first because the IC takes its
address as a constructor argument; `genLayerValidator` is then set by the owner.
Until it is, `recordVerdict` reverts with `ValidatorNotSet` and nothing can
settle.

## CLI

```bash
genlayer call 0xd1D809A1210cc039AEdBF5cD04628416Ad0e6a92 get_config --rpc https://rpc-bradbury.genlayer.com
genlayer call 0xd1D809A1210cc039AEdBF5cD04628416Ad0e6a92 get_stats  --rpc https://rpc-bradbury.genlayer.com
cast call 0x1BCBad3da718690fa60289DcBF15835e5C79021f 'genLayerValidator()(address)' --rpc-url https://rpc-bradbury.genlayer.com
```
