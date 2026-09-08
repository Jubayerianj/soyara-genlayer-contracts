# 🌐 Soyara / FlipSwap DEX — Deployment Registry

This document lists all active smart contracts, Intelligent Contracts, and infrastructure endpoints deployed across supported networks.

---

## 1. GenLayer Bradbury Testnet (AI Consensus Layer)

| Parameter | Value |
|---|---|
| Network Name** | GenLayer Bradbury Testnet |
| Chain ID | `4221` |
| RPC Endpoint | `https://rpc-bradbury.genlayer.com` |
| Block Explorer | `https://explorer-bradbury.genlayer.com` |


### Intelligent Contracts (ICs)

| Contract | Address | Transaction Hash |
|---|---|---|
| **AgentValidator** (current — verdict authenticated at settlement) | `0xf47492A969b2bC8f99B62Bdf8958541F2234C42b` | see `BootstrapValidator.s.sol/4221/run-latest.json` |
| AgentValidator (retired — superseded during the same rollout) | `0x8627CfDC1df6DcD813113FA2F400B35a99a781D4` | `0x37980bd6bd1d3c854fb06ef07af1fd207cfb67089e62666c9cd05c5877eea0d3` |
| AgentValidator (retired — superseded during the same rollout) | `0x001E00a816fa93bC2cA07587d929Aa98C31051DD` | see `BootstrapValidator.s.sol/4221/run-1788784195752.json` |
| AgentValidator (retired — agent enforced the verdict) | `0x7ABa94668afC24463Be323f9bB65BD4b4F480d89` | `0x527fa134b17d499efc967807cdb153a9fcc2e37fbba4e446911220f0f7cdaf86` |
| AgentValidator (failed deploy — explicit `genlayer.types` import, see below) | `0xf06FC7dA4d0dd806971d0Dd01A29bfE514BAa92B` | `0xaef0acef22ee6e7990599c14b55da695a1f9c160bd63f2592ec2e6d1fc7f471c` |
| AgentValidator (retired — failed genvm-lint, 12 errors) | `0x78FA2A758bdB65a66F4B9C08D8DC54066d0e0395` | `0x3f70ffa33317575dbb9e3a482e2901f5b3e82bed5e67e4a75ac8949b291ec85b` |
| AgentValidator (retired — swap-shaped rules broke liquidity consensus) | `0x69c33B036a982e7C7107b1634451A0C227cB2BBA` | `0x56cd8a4628f0234a47a668e03a12dd8019fbc7041b9314de1a5f1395102357e4` |
| AgentValidator (retired — queue exhausted, see PendingQueueFull below) | `0x683cBF11F807aB184ed2B4a5dDDC9E49dbBa0f51` | `0x874ff1cb09c15abb3b5e0817911879e00f2b92ba4807e6614a46197c1606661f` |
| AgentValidator (retired — determinism fix, no persisted verdicts) | `0x440FB164C93cC5657a1b1F53e8B4E1113c43AB9D` | `0x53d3a96a97976070b246e49d25e36a5b03917c456168268c3c1d5dd673a09711` |
| AgentValidator (retired — mandates, but non-deterministic strict_eq payload) | `0x7B6B4aFC5098fFe85124D4242577f06DCe497d0b` | `0x0b9a274730b29e4be04af221344f0dfb3379845863a548adca3a6ebd17658961` |
| **LiquidityValidator** | `0xEFb9473B5269A79d72Df4b6E73E310791a185eeC` | `0x6029755fe523a1fcb2c87f20a3c9cc3fcc12f04f57b6db203a40b8c718fcdf23` |
| AgentValidator (retired — mandate build, queue blocked) | `0xDBFB9DDAc98084a792d2a8884B4FEbDD4F52F506` | `0xef1090da0b8b9197bd810dfc370abdbb03cf6c4b9746859b6d2cc33b025bd32b` |
| AgentValidator (retired — no mandate support) | `0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e` | `0x0e445f38830e3445af9f8781b302eceb2efd0cd21277c3eb1ef5ee6cd7108e79` |
| AgentValidator (retired — stale router whitelist + non-deterministic `time.time()`) | `0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5` | `0x80788d9ee015f11468f4e372ead51f0dd522fb70e62343e241bd23c7b3384dbf` |

### 2026-09-07 — verdict enforcement moved into the executor

`AgentExecutor` and `AgentValidator` were redeployed **as a pair** and are bound
to each other: the IC holds the executor's address, the executor holds the IC's.
Replacing one without the other leaves settlement dead.

| Contract | Address |
|---|---|
| **AgentExecutor** (EVM) | `0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1` |
| **AgentValidator** (IC) | `0xf47492A969b2bC8f99B62Bdf8958541F2234C42b` |

Deployment order is forced by a circular dependency: the IC takes the executor's
address as a constructor argument, so the executor must exist first, which is
why `genLayerValidator` is set by a transaction rather than in the constructor.

```
1. forge script script/DeployExecutorOnly.s.sol --broadcast
2. python3 build_deployable.py && genlayer deploy --contract build/AgentValidator.min.py \
     --args <owner> <executor>
3. finalize the deploy round (see below), wait until `genlayer call <ic> get_config` answers
4. AGENT_EXECUTOR=<executor> GENLAYER_VALIDATOR=<ic> \
     forge script script/BootstrapValidator.s.sol --broadcast
```

Between 1 and 4 the executor is live but inert: `recordVerdict` reverts with
`ValidatorNotSet` (`0x6bb49bc4`) and nothing settles. That is deliberate. The
executor never falls back to trusting the agent key.

### ⚠️ A deploy can "succeed" and leave no contract behind

Three things have to go right, and only the third is obvious:

1. **The EVM transaction is mined.** Creates the ghost contract at the address.
2. **The GenVM execution succeeds.** Check `txExecutionResultName` in the deploy
   output. `FINISHED_WITH_ERROR` means the module did not import, and you get
   **no traceback and no message** — the receipt carries `txExecutionResult: 2`
   and nothing else. From the outside it is indistinguishable from success until
   the first call returns `contract not found`.
3. **The round is finalized.** Until then the ghost exists and the IC does not.

The first deploy of this contract failed at step 2 because of a single line:

```python
from genlayer.types import u24, u64, u160   # ← fails on the pinned runner
```

Those names arrive through `from genlayer import *`. Isolated with two throwaway
contracts, one per hypothesis: the one importing from `genlayer.types` failed,
an otherwise identical one using the star import succeeded, and
`@gl.evm.contract_interface` was fine in both. The py-genlayer source on `main`
exports those names; the pinned runner does not. **Prefer the star import.**

### ⚠️ `@gl.evm.contract_interface` is broken on the pinned Bradbury runner

Calling an EVM contract through the documented accessor fails before it reaches
the chain:

```
AttributeError: '_V2Pair.ViewProxy' object has no attribute 'parent'
```

The generated proxy stores the target at `_proxy_parent` (confirmed with
`dir()`: `_proxy_args, _proxy_kwargs, _proxy_parent, getPair`) while the call
implementation reads `self.parent`. It is an inconsistency inside the SDK, so no
contract-side spelling avoids it. Both the eager accessor and its `.lazy`
counterpart fail identically, and `gl.eth_contract` is absent on this runner.

This matters more than a normal SDK bug because both halves of the settlement
design run through it: the validators' live pool reads, and the external message
that carries the verdict to `AgentExecutor.recordVerdict`.

**Workaround, verified on the live network.** The SDK's encoder is fine; only
the generated accessor is broken. Encode with `gl.evm.MethodEncoder` and call
through `gl.vm.gl_call.gl_call_generic`:

```python
encoder = gl.evm.MethodEncoder("getPair", (Address, Address), Address)
calldata = encoder.encode_call((Address(a), Address(b)))
result = gl.vm.gl_call.gl_call_generic(
    {"EthCall": {"address": Address(factory), "calldata": calldata}},
    lambda raw: gl.evm.decode(Address, raw),
)
pair = result.get()          # -> 0x55A5ff46cFb55DcF05D236A0Fdde5a0c866B64Be
```

`EthSend` is the same shape with a `value` field, and is what emits the external
message. `AgentValidator.py` wraps both as `_evm_view` / `_evm_send`.

`gl.vm.gl_call.gl_call_generic` is **undocumented**, which is a real cost: the
documented surface is what a pinned runner guarantees. It is paid here because
the documented path does not work on this runner and the alternative is no
on-chain verification of route or quote at all. Revisit when the SDK is fixed.

**Reproducing it.** Deploy a contract whose only job is to call the V2 factory
both ways and return the outcomes as strings. Deployment is cheap; the cost is
the finalization wait before the contract can be called.

### Other runner findings (probed, not read from source)

| Question | Answer on the pinned runner |
|---|---|
| `from genlayer.types import u24, u64, u160` | **Fails.** Use the star import. |
| `u24` / `u64` / `u160` / `u256` via `from genlayer import *` | Available |
| `gl.Keccak256` | **Available** (`genlayer.types.keccak` is not) |
| `gl.evm.bytes32` | Available, though the boundary uses `u256` |
| `@gl.evm.contract_interface` at import time | Works; only the CALL is broken |
| `gl.eth_contract` | Absent |
| `genlayer._internal.on_chain` | Absent |
| `datetime.now(timezone.utc)` | Works, deterministic |

### Deployment source size and the pubdata limit

An Intelligent Contract is deployed as SOURCE, so the whole file becomes
transaction calldata, and GenLayer Chain enforces a per-block pubdata limit.
The annotated `AgentValidator.py` is ~76 KB and was rejected with
`BlockPubdataLimitReached`.

`build_deployable.py` strips comments and docstrings (tokenizer + AST, so a `#`
inside a string is safe) to produce `build/AgentValidator.min.py` at ~49 KB. The
annotated file stays the source of truth in the repo; only the build goes on
chain.

The limit is per BLOCK, not per transaction: the same 49 KB build was rejected
once and accepted on retry a few seconds later. If a deploy fails with
`BlockPubdataLimitReached`, retry before assuming the contract is too big.

### Removed: the attestation rail

There used to be a second settlement rail here, and it is worth recording why it
existed and why it is gone.

**Why it existed.** A consensus round decides in about twenty seconds, but the
verdict only reaches `AgentExecutor` when the round *finalizes*, because it
travels as an EVM-bound external message. On the pinned Bradbury runner
`EthSend` takes no `on=` parameter (the `accepted`/`finalized` choice exists for
IC-to-IC messages, not for EVM ones), so the delivery road cannot be shortened.
The wait was never consensus being slow; it was delivery. The rail let a 2-of-2
quorum of registered attestors read the verdict out of the IC as soon as the
round was accepted and sign the same commitment under EIP-712, and settlement
took **30 seconds** instead of the appeal window.

**Why it is gone.** Nothing on chain tied an attestation to a verdict the IC had
actually recorded. The policy that attestors sign only what the IC approved
lived in the signing service, not in the contract. To the executor, M signatures
were simply a *substitute* for a GenLayer verdict — which is the one thing this
executor exists to refuse. A guarantee enforced only by the process that
benefits from it is not a guarantee, and this system had already been reviewed
twice on precisely that point.

So the rail is removed, not merely disabled. `setAttestorThreshold`,
`setVerdictAttestor`, `verdictDigest` and the `bytes[] attestations` argument on
all five execute functions no longer exist, and `script/EnableAttestors.s.sol`
is deleted. `_consumeVerdict` has one branch: a live verdict recorded by the
AgentValidator IC, or the call reverts with `NoConsensusVerdict`.

**The cost is real and is the point.** Settlement now waits out the appeal
window, roughly 15 to 25 minutes on Bradbury. Latency is the honest price of
consensus enforcement.

### The owner is the last party who could subvert the registry

`setGenLayerValidator` is `onlyOwner`. Left unguarded, the owner could point it
at an address it holds the key for and then call `recordVerdict` directly, which
is the agent-enforces-the-verdict design wearing a different hat. Two checks
close the cheap version of that:

- the target **must have code** (`ValidatorNotAContract`). A ghost contract
  always does, so this costs an honest deployment nothing and denies an EOA
  outright.
- the target **may not be a relaying agent**, and an agent may not be made the
  validator (`RoleConflict`), enforced from both sides.

Owner trust does not reduce to zero — the owner can still pause, rescue tokens,
and deploy a contract of its own — but a single key can no longer both authorise
and execute, and installing a bare key where consensus belongs now reverts.

**Operationally, `owner` and `authorisedAgent` should not be the same address.**
On the current deployment they both are `0x23D542DC...`. Splitting them, ideally
with the owner behind a multisig, is a one-transaction change and is
recommended before mainnet.

### Finalization is a call, not a timer

A decided transaction sits in `Accepted` until someone finalizes it. Nothing
does this automatically. Until it happens:

- a deployed IC is not callable, and
- **an external message is never delivered** — which is exactly how the verdict
  reaches `AgentExecutor.recordVerdict`.

`client.finalizeIdlenessTxs({ account, txIds })` performs the call; it is a
no-op until the appeal window has elapsed, so it is safe to retry on a loop.
Observed window on Bradbury: roughly 15 to 25 minutes. Production needs a
keeper doing this, or settlement waits on whoever happens to call.

### ⚠️ Critical: a write's RETURN VALUE is not recoverable from its receipt

`receipt.result` is the **consensus vote enum** (`0` IDLE / `1` AGREE / `2`
DISAGREE / `3` TIMEOUT) — it is *not* what the contract returned. There is no
field on the receipt carrying the contract's payload. Reading
`receipt.result.approved` therefore yields `undefined`, so **every** validation
reports as rejected, including ones the contract approved. This was the single
biggest cause of "Rejected by Validator" in the UI.

The contract now persists each verdict (`validations: TreeMap[str, str]`) and the
app reads it back with the `get_validation` view:

```
validate_proposal (write, consensus)   → records verdict in state
get_validation(proposal_id) (view)     → instant read of that verdict
compute_proposal_id(...)   (view)      → the id for a given parameter set
```

`compute_proposal_id` also enables a genuine cache: an identical parameter set
already validated resolves in ~1s with **no new consensus round**.

Also note `waitForTransactionReceipt` returns a *stripped* receipt by default —
pass `fullTransaction: true` or `statusName`/`txExecutionResultName` come back
`undefined` and every round looks unusable.

### ⚠️ Critical: what crosses `gl.eq_principle.strict_eq` must be deterministic

`strict_eq` compares the value returned by the non-deterministic block **across
validators for exact equality**. Anything LLM-authored — in particular the
model's own `reason` prose — differs on every node, so the comparison can never
succeed and the round terminates `UNDETERMINED` with `DISAGREE` instead of
producing a verdict. Symptom: rounds reach `FINISHED_WITH_RETURN` (the contract
ran fine) yet never reach `ACCEPTED`, and the UI shows a validation that never
resolves.

Return only a **bare boolean** from inside `strict_eq` and compose all
human-readable text deterministically outside it:

```python
# WRONG — the LLM's wording differs per validator, so nodes never agree
llm = gl.eq_principle.strict_eq(lambda: self._llm_review(...))  # returns dict w/ "reason"

# RIGHT — only the decision crosses the boundary
llm_approved = gl.eq_principle.strict_eq(lambda: self._llm_review(...))  # returns bool
```

The same rule is why `time.time()` was removed from the deterministic rules:
wall-clock reads differ per node. Deadline expiry is enforced on-chain by
`AgentExecutor`'s `validDeadline` modifier instead.

### ⚠️ Operational note: GenLayer consensus queueing on Bradbury

`ConsensusMain` keeps a pending queue per sender and processes it in strict
order. A second `addTransaction` from the same sender while an earlier round is
still pending reverts with **`TransactionNotAtPendingQueueHead()`**.

Because Bradbury's activator can take minutes (transactions sit at
`PENDING / NOT_VOTED` until a validator activates them, and `activateTransaction`
requires a VRF proof so only the network can do it), a single shared agent key
means the whole app is serialised behind one queue lane — and one stuck round
makes **every** later action revert. In the UI those reverts previously read as
"Rejected by Validator", which looked like a trade rejection but was a queue
collision.

**Mitigations now in place:**

| Mitigation | Where |
|---|---|
| Pool of funded sender lanes, one per in-flight round | `frontend/flipswap/lib/agentPool.js` + `AGENT_PRIVATE_KEYS` |
| Trading mandates: one consensus write authorises many trades, each later trade is an instant `@gl.public.view` check | `AgentValidator.py` → `issue_trading_mandate` / `check_mandate` |
| Pre-validation at quote time so consensus overlaps user think-time | `frontend/flipswap/pages/ai.jsx` |
| Undecided rounds reported as retryable, never as "rejected" | `frontend/flipswap/lib/genlayer.js` |
| Idle/never-voted rounds cleared automatically | `finalizeStuckValidation()` via `finalizeIdlenessTxs` |

Configure lanes in `frontend/flipswap/.env.local` (gitignored):

```
AGENT_PRIVATE_KEYS=0xlane1,0xlane2,0xlane3,...
```

Every lane needs GEN for gas. Only the lane that also settles trades needs to be
the `authorisedAgent` on `AgentExecutor`.

Beyond the per-sender queue, a contract's queue is also processed in order: a
round parked at the head in a non-final state (`UNDETERMINED`, or a round that
timed out) blocks the rounds behind it, and it cannot be cleared early —
`finalizeTransaction` reverts with `FinalizationNotAllowed()` until its
finalization window elapses. This is why per-trade consensus is fragile on this
testnet and why the mandate path (an instant `@gl.public.view` check that never
enters the queue) is the durable answer for per-trade latency.

---


### Core & Periphery Contracts

| Component | Contract | Address |
|---|---|---|
| **DEX V2 Factory** | `SwappingDexV2Factory` | `0x4680BCe1632824d30D2F53656dD610736c3e312e` |
| **DEX V2 Router** | `UniswapV2Router02` | `0x130c961dcf9d89258119f8bB7344635616946BFF` |
| **Wrapped Native** | `WETH ` | `0x315374AA9b5536037Cc1Efeea2439CCC0913A77e` |
| **Aggregator Entrypoint** | `AGGFlowEntrypoint` | `0xF69E64804000d28aA695eB5c594B996100fb3B49` |
| **Aggregator Router** | `AGGFlowRouter` | `0x0624E93350bFfc5B3570589FCae68e2CaBe6c620` |

### AgentExecutor — the settlement gate

`AgentExecutor.sol` is the on-chain enforcement contract for the
GenLayer-to-settlement flow. It is deployed and bound to the AgentValidator IC.

**Read the live contract before reading anything below.** The addresses in this
file are a convenience; the chain is the source of truth, and the pairing is
verifiable in two calls:

```bash
# executor -> IC
cast call 0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1 'genLayerValidator()(address)' \
  --rpc-url https://rpc.testnet-chain.genlayer.com
# -> 0xf47492A969b2bC8f99B62Bdf8958541F2234C42b

# IC -> executor
genlayer call 0xf47492A969b2bC8f99B62Bdf8958541F2234C42b get_config \
  --rpc https://rpc-bradbury.genlayer.com
# -> agent_executor: 0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1
```

The current executor has **no** `approveTradeWithParams`; the retired ones below
still do, and that function is exactly the design this work removed. Do not read
a retired address as the current one.

| Component | Contract | Address |
|---|---|---|
| **Settlement Gate** | `AgentExecutor` (executor enforces the verdict) | `0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1` |
| Settlement Gate (retired — agent wrote its own approval) | `AgentExecutor` (multi-agent) | `0xa835c0a86dD64726eF23D83a8ca7D60b542EE2e4` |
| Settlement Gate (retired — single agent only) | `AgentExecutor` | `0xBda36A9453003E2eEe5D6Cb07ad253e64BaB4729` |
| Settlement Gate (retired — native-out blocked, see below) | `AgentExecutor` | `0xaE547F01f9ddCa4dB66cdbf0727f7563Fc44bC26` |
| **Aggregator Entrypoint** | `AGGFlowEntrypoint` (new) | `0x95feE6Cb918Ed9C621E36082EE8D998873031EaA` |
| **Aggregator Router** | `AGGFlowRouter` (new) | `0xafCAD2bf0E85e30a2b54ac6491dC81987cE7767C` |

The `Core & Periphery` table above lists the **first-generation** V2 router and
aggregator entrypoint. The executor is wired to the newer ones, which is what
`aggFlowEntrypoint()` / `v2Router()` / `v3PositionManager()` return on chain:
`0x95feE6Cb918Ed9C621E36082EE8D998873031EaA`,
`0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5`,
`0x779380011B5F2aB40985D810B5c7641539beD870`.

Redeploying the executor means redeploying the IC with it — see the matched-pair
note above — because each holds the other's address.

### ⚠️ address(0) is NATIVE and must be exempt from the ERC-20 whitelist

`AgentExecutor` validated `tokenOut` against `approvedTokens` without exempting
`address(0)`, while `tokenIn` *was* exempted. Native is not an ERC-20 and was
never in the whitelist, so **every swap out to native GEN reverted with
`TokenNotApproved(0x0)`** before any other check ran — surfacing in the UI as a
bare "executeSwap reverted". Only the owner can call `setApprovedToken`, so this
could not be patched operationally; the check itself had to be made symmetric:

```solidity
if (tokenIn  != address(0) && !approvedTokens[tokenIn])  revert TokenNotApproved(tokenIn);
if (tokenOut != address(0) && !approvedTokens[tokenOut]) revert TokenNotApproved(tokenOut);
```

**Redeploying the settlement gate invalidates existing ERC-20 approvals** — users
must approve the new `AgentExecutor` address before their first swap.

Note: the deployed AgentValidator IC still lists the previous executor address in
its informational `APPROVED_ROUTERS` map. That is harmless — validation checks the
`router` parameter (the AGGFlowEntrypoint), never the executor — and corrects
itself on the next IC deploy.

**Architecture enforced by AgentExecutor:**
```
GenLayer AgentValidator (consensus write tx, @gl.public.write)
    ↓ approved = true
/api/agent-execute (server-side, AGENT_PRIVATE_KEY)
    → AgentExecutor.approveTradeWithParams(user, tokenIn, tokenOut, amountIn, minOut, slippage, deadline)
    → AgentExecutor.executeSwap(...)  ← checks+deletes hash, reverts TradeNotApproved if tampered
        → AGGFlowEntrypoint → V2/V3 DEX
```


### ⚠️ `minAmountOut` must come from integer math, never from a display string

`/api/agent-v2` derived the on-chain `minAmountOut` from `quote.minAmountOut`, a
value already rounded for display with `.toFixed(4)`. For a small output that
rounding goes **up**: a real output of `0.005697365…` GEN became `0.0057`, so the
enforced minimum exceeded what the pool could actually deliver and every
settlement reverted with `AGGFlowEntrypoint_InsufficientAmountAfterFees()`
(selector `0x499c1728`). The `/ai` page therefore validated fine and then failed
to execute.

Display values and enforced values must be computed separately:

```js
// enforced on-chain — integer math, rounds DOWN
const minOutRaw = (onChain.amountOutRaw * 997n) / 1000n;
// shown to the user — adaptive precision, TRUNCATES so it can never overstate
const minAmountOut = formatAmountDisplay(minOutRaw, decimalsOut);
```

`amountInRaw` likewise now uses `parseUnits` instead of the old
`BigInt(Math.floor(x * 1e6)) * 10n ** (dec - 6n)` scaling, which truncated small
inputs.

### ⚠️ Intent parsing: order token matches by position in the sentence

The regex fast-path collected tokens by iterating a fixed list
(`['usdc','usdt','gen','wgen',…]`) and taking `foundTokens[0]` as `tokenIn`. The
sentence order was never consulted, so **"Swap 0.01 GEN to USDC" produced a
USDC → GEN proposal** — a proposal to buy the token the user asked to sell.
Matches are now sorted by their index in the text. Venue markers (`v2`/`v3`) are
also stripped before reading the trade size, so "swap usdc to gen on v3" no
longer reads an amount of `3`.

### Verified settlement

| Item | Value |
|---|---|
| Execute tx | `0x60a13394cde27626d90fb6ab31bedda154dcf34edc8a649840231425a6ccf287` |
| Block / status | `20535464` / `success`, 18 logs, 267,377 gas |
| Validation path | mandate fast path, `via_mandate: true`, ~4s |

### V2 Pair Init Code Hash
```
0x01888feb01db41d97ad6fb1883d7e286650d46c410b82338aeb4a37554c28bcd
```

---

## 3. Approved Whitelist Tokens

| Symbol | Name | Address | Decimals |
|---|---|---|---|
| `GEN` | Native GenLayer / Somnia | `0x0000000000000000000000000000000000000000` | 18 |
| `WGEN` ` | Wrapped Native | `0x315374AA9b5536037Cc1Efeea2439CCC0913A77e` | 18 |
| `USDC` / `ZKUSDC` | USD Coin | `0x58B6CD7891cd0A682226E25607b958a6479195A6` | 18 |
| `USDT` / `ZKUSDT` | Tether USD | `0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc` | 18 |
| `WBTC` / `ZKBTC` | Wrapped Bitcoin | `0x723534bc6C2B536fF5D0455111513A9431c44e25` | 18 |
| `ETH` / `LETH` | Wrapped Ethereum | `0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C` | 18 |
| `FSWP` | Soyara Token  | `0xA2eC9aAf2235C66491767e69eBBD885469697B3E` | 18 |

> **Decimals: every deployed test token uses 18, including USDC/USDT/WBTC.**
> These are testnet mocks, not mainnet-faithful reissues, so the usual 6/8-decimal
> assumptions do **not** hold here. This table previously listed 6/6/8, which is
> wrong — verified against each token's own `decimals()` on Bradbury.
> `frontend/flipswap/constants/tokens.js` has always been correct at 18.
> Read decimals from that file (or on-chain), never from memory of what these
> symbols mean elsewhere.

### Settlement re-quotes against live reserves before binding the approval

`minAmountOut` is fixed when the quote is generated and then sits in the client's
React state. A proposal left on screen — or one held across a hot reload — keeps a
minimum the pool may no longer be able to fill, and settlement then reverts with
`AGGFlowEntrypoint_InsufficientAmountAfterFees()` (`0x499c1728`), which says
nothing about the actual remedy.

`/api/agent-execute` now re-derives the floor from live reserves before
`approveTradeWithParams`:

| Live output vs requested minimum | Behaviour |
|---|---|
| Requested minimum still achievable | Kept **untouched** — protection is never silently weakened |
| Short by less than one slippage band | Minimum re-derived from live reserves; response carries `requoted: {from, to, liveAmountOut}` |
| Short by more than the slippage tolerance | `409` with `stale: true` and a plain-language "request a fresh quote" message |

The trade hash is computed *after* this step, so the one-time approval always
commits to the value actually settled with.

### Approvals are one-time and unlimited (agentic UX)

This is an agentic system: the user delegates execution to the agent, so the
ERC-20 `approve()` they sign is for `type(uint256).max` against `AgentExecutor`
and is signed **once per token**. Approving only the current trade's `amountIn`
would re-prompt the wallet before every swap, which defeats the delegation.

That is safe because the ERC-20 allowance is plumbing, not the gate:

- `AgentExecutor` binds a one-time hash per trade —
  `keccak256(abi.encode(user, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline))` —
  via `approveTradeWithParams`, and **consumes** it in `executeSwap`.
- That hash is only ever bound after GenLayer's `AgentValidator` approved the
  proposal, so the agent can move funds only through a trade consensus authorised.
- Any parameter mismatch reverts with `TradeNotApproved`; the hash cannot replay.

Redeploying `AgentExecutor` invalidates every existing allowance — that is the one
legitimate reason users must approve again.

### Pre-flight guards before settlement

Three failure modes used to surface only as opaque on-chain reverts. Each is now
caught before the trade is bound, and the same guards run in both `/ai` and
`/a2a` because both consume `hooks/useAgentSwapExecution.js`:

| Condition | Where caught | Behaviour |
|---|---|---|
| Pair has no liquidity pool | `/api/agent-v2` marks `executable:false`; `/api/agent-execute` returns `400 notRoutable` | Execute button disabled, reads "No Liquidity Pool for This Pair" |
| Wallet balance below `amountIn` | `useAgentSwapExecution` balance read | Execute disabled, reads "Insufficient <TOKEN> Balance" — no longer a raw-units error at settlement |
| Quote aged out past slippage tolerance | `/api/agent-execute` live re-quote | `409 stale` with a plain "request a fresh quote" message |

**Unroutable pairs on Bradbury today:** `WBTC`, `ETH` and `FSWP` have no pool
against `USDC`. Quotes for them come from the `TOKEN_PRICES_USD` reference table
and are display estimates only. Routable: `USDC/WGEN`, `USDC/USDT`, `WGEN/USDT`.

---

## Response to the GenLayer review

> "The requested enforced GenLayer-to-settlement flow is still incomplete: the
> current app validates through a read simulation and settles directly through
> AGGFlowEntrypoint without consuming the new one-time approval, and
> AgentValidator still fails lint."

### 1. "validates through a read simulation" — FIXED, and it was still true until now

The per-trade gate was a client-supplied boolean. `/api/agent-execute` accepted
`validationApproved: true` and a `proposalId` that was **never checked** — only
echoed back in the response. A direct POST settled a real trade with
`proposalId: "TOTALLY-FAKE-NEVER-VALIDATED"` and no GenLayer round at all.

Settlement now reads the verdict from the AgentValidator IC itself, **bound to the
exact parameters being settled**: `compute_proposal_id` derives the id on-chain
from those params and `get_validation` returns the recorded verdict, so an
approval issued for one trade cannot authorise another and a fabricated id is
simply not found. This runs *before* the live re-quote, so the params checked
against consensus are exactly the ones the user validated.

The mandate fast path (`check_mandate`, a `@gl.public.view`) is a read, and is
therefore **off by default** — it is what the review objected to. Enabling it
requires `GENLAYER_ALLOW_MANDATE_FAST_PATH=true`, and the same flag gates the
validation side in `lib/genlayer.js` so the two can never disagree.

| Attempt | Result |
|---|---|
| POST with fabricated `proposalId`, no validation | `403` — "no GenLayer consensus verdict exists on-chain for these exact trade parameters" |
| Full flow: `validate_proposal` write → verdict recorded → settle | `200`, `verifiedVia: {path: "consensus_write", proposalId: "73b90476c75802007a60f5a4"}` |

### 2. "settles directly through AGGFlowEntrypoint without consuming the one-time approval" — FIXED

Settlement runs `AgentExecutor.approveTradeWithParams()` then
`AgentExecutor.executeSwap()`, which checks and **deletes** the hash:

```solidity
if (!approvedTrades[tradeHash]) revert TradeNotApproved(tradeHash);
delete approvedTrades[tradeHash];
```

The direct-AGGFlowEntrypoint fallback in `useAgentSwapExecution` has been
**removed**. It was unreachable while AgentExecutor is configured, but it settled
without binding or consuming the hash — exactly the flagged gap — so it now fails
closed rather than silently dropping enforcement.

### 3. "AgentValidator still fails lint" — cannot reproduce; every check available here passes

The GenLayer CLI (v0.x) exposes no `lint` subcommand, so the exact tool and
version used by the review is unknown. Against the canonical `genlayer new`
template, `AgentValidator.py` checks out on every requirement:

| Check | Result |
|---|---|
| `# { "Depends": "py-genlayer:..." }` runtime header, first line | present |
| `@allow_storage` on the storage dataclass (`TradingMandate`) | present |
| Every `@gl.public` method fully annotated (params + return) | passes |
| Non-deterministic constructs (`time`, `random`, `requests`, `os`, `datetime`) | none |
| `python3 -m py_compile` | passes |
| Deploys and completes a consensus round on Bradbury | yes — see table above |

The original lint failure was most likely the `time.time()` call in the
deterministic rules, which was removed earlier (wall-clock reads differ per
validator; deadline expiry is enforced on-chain by `AgentExecutor`'s
`validDeadline` modifier instead). **If the review can name the linter and
version, the remaining diagnosis is quick** — the one construct a generic Python
linter would flag is `from genlayer import *` (ruff/flake8 `F403`), which is
GenLayer's own documented idiom and is what the official template uses.

### ⚠️ `PendingQueueFull` — an IC can be blocked by its own stalled rounds

An Intelligent Contract may hold only a limited number of unresolved consensus
rounds (**20** on Bradbury). Once stalled rounds fill that queue, `ConsensusMain`
rejects **every** new `addTransaction` to that contract, and the app cannot
validate anything at all.

The failure is easy to misread. It surfaces as an ordinary EVM revert —

```
Transaction reverted: EVM tx 0x… to consensus contract 0x0112Bf6e… was reverted.
```

— which looks exactly like a rejected trade, and it fails *fast* (~5s), so it
also looks unrelated to the slowness that caused it. The revert data decodes to:

```
0xd48a82a3  PendingQueueFull(address recipient, uint256 max)
            recipient = 0x683cBF11…  (the AgentValidator IC)
            max       = 20
```

`lib/genlayer.js` now replays a failed submission to recover this selector and
reports it as `queue_full` + `retryable`, so the UI shows an amber backlog notice
rather than a red rejection. **Nothing is validated or refused in this state — the
proposal never reaches the validators.**

There is no way to drain the queue from outside: `finalizeIdlenessTxs` exists on
the genlayer-js client but requires an explicit list of stuck transaction ids,
and none of the queue-management ABI signatures probed (`finalizeIdlenessTxs()`,
`(uint256)`, `(address,uint256)`, `getPendingQueueSize(address)`, …) exist on
this ConsensusMain deployment. **The practical remedy is redeploying the IC**,
which starts with an empty queue. Recorded verdicts and mandates stay behind on
the old contract; both are caches, so nothing is lost functionally.

### ⚠️ Deploy the IC with the CLI, not `genlayer-js.deployContract`

`deployContract` returned `ACCEPTED` / `FINISHED_WITH_ERROR` on three attempts —
with no constructor args, with hex-string addresses, and with 20-byte
`Uint8Array` addresses. The CLI deployed the identical source first try:

```bash
genlayer deploy --contract dex-solidity-contracts/genlayer-inteligent-contracts/AgentValidator.py \
  --args 0x<owner> 0x<agentExecutor> --rpc https://rpc-bradbury.genlayer.com
```

Note the constructor signature is `__init__(owner: Address, agent_executor: Address)`
— deploying with no args fails.

### Verified after the redeploy

| Flow | Result |
|---|---|
| Swap, quote → validate → settle | **working** — 2.0s quote, verdict at 5.1s (cache hit), settled 11.8s, `verifiedVia: consensus_write` |
| First cold consensus round | **working** — approved in 18.5s |
| Add liquidity | **intermittent** — one round approved in 49s; two others reached consensus but recorded no verdict |

The liquidity intermittency is inside the IC: when the `gl.eq_principle.strict_eq`
LLM review raises, `validate_proposal` fails closed and returns **without**
writing to `validations`, so `get_validation` finds nothing and the app reports
"Consensus reached but the verdict is not yet readable". Retrying usually
succeeds. A durable fix means recording a verdict on that path too, which needs a
contract change and redeploy.

`/api/agent-add-liquidity` now also pairs the deposit against live reserves
before binding the approval. A V2 deposit must match the pool ratio exactly, and
two slightly off-ratio amounts made the router revert with
`UniswapV2Router: INSUFFICIENT_A_AMOUNT`; the over-supplied side is reduced to the
optimal pairing instead.

### ⚠️ The LLM review must be ACTION-AWARE, or liquidity cannot reach consensus

`_llm_review` applied one set of swap-shaped rules to every action:

```
2. APPROVE if Min Amount Out is >= 0 and <= Amount In
4. REJECT ... if Min Amount Out > Amount In * 10
```

For a deposit, `amount_in` and `min_amount_out` are the two **independent sides
of a position**, not a swap pair. "10 WGEN and 200 USDC" is a perfectly ordinary
deposit, yet rule 4 told the model to reject it while rule 1 said approve.
Different validators resolved that contradiction differently, so
`gl.eq_principle.strict_eq` could not agree, the round raised, and
`validate_proposal` failed closed **without writing to `validations`** — leaving
`get_validation` with nothing to return.

The user-visible symptom was add-liquidity being intermittently stuck on
"Consensus reached but the verdict is not yet readable", while swaps were fine.
The rules are now branched by action: ratio checks apply only to SWAP, and a
liquidity proposal is approved whenever both amounts are positive integers.

Verified on the new contract with the exact failing shape (20x ratio):
`ACCEPTED | found=true approved=true`.

### Multi-agent authorisation

`authorisedAgent` was a single address, so only one operator could ever settle and
any third-party agent had to route through that operator's server. The executor
now also carries `mapping(address => bool) agents`, and `onlyAgent` passes for
either — existing tooling keeps working with no migration.

```solidity
function setAgentAuthorisation(address _agent, bool _allowed) external onlyOwner;
function isAgent(address _who) external view returns (bool);
```

This does **not** weaken the gate. A registered agent still cannot invent a trade:
every execution is bound to a consensus-approved parameter hash that is checked
and deleted on use, and that hash is only ever bound after `AgentValidator`
approved the proposal. Agents never custody anything — tokens move from the user
straight through the router in one call — so revoking an agent cannot strand
funds.

Verified on-chain: `isAgent(lane)` false -> true after `setAgentAuthorisation`,
and 25/25 Foundry tests including a registered agent settling independently,
revocation taking effect immediately, and only the owner being able to register.

### Verified end to end on the multi-agent executor

| Step | Result |
|---|---|
| Quote | 5 USDC -> 4.9825 USDT |
| Consensus write | `ACCEPTED`, `found=true approved=true` |
| Settlement | `success`, 4.984985 USDT received |
| One-time approval | **consumed** |
| Tx | `0x50f1454a9cefc119d57e9e3e3ef6aa0eb1e2a87d014d24d332715565987f5263` |

**Redeploying the executor invalidates every existing ERC-20 approval** — users
must approve the new address once before their first trade.

## The lint failure, reproduced and fixed

GenLayer's linter is **`genvm-linter`**, documented at
<https://docs.genlayer.com/api-references/genlayer-linter>:

```bash
pip install genvm-linter     # 0.11.0
genvm-lint check AgentValidator.py
```

### A trap that hid this for two review cycles

`genvm-linter>=0.1.0` requires **Python >= 3.10**. On Python 3.9, pip silently
installs `0.0.1` — a placeholder whose entire contents are `__version__ =
"0.0.1"`. It provides no `genvm-lint` binary and checks nothing. Anyone lint-
checking on 3.9 sees an apparently successful install and no errors, while the
reviewer on 3.10+ sees a genuine failure.

### The actual failure — 12 errors

```
line 493: self.validated_count in 'AgentValidator.validate_proposal' reachable from
          non-deterministic block; storage writes are forbidden in non-deterministic contexts
line 519: gl.eq_principle.strict_eq() ... nested non-deterministic blocks are forbidden
```

**Cause.** In `SafeEntryPointFinder`, the linter treats the scope *containing* an
inline nondet lambda as a non-deterministic context:

```python
# Track lambdas that contain nondet - their containing scope is safe
self.lambda_scopes: set[str] = set()
all_safe = entry_finder.safe_functions | entry_finder.lambda_scopes
```

So `gl.eq_principle.strict_eq(lambda: self._llm_review(...))` written inline in
`validate_proposal` made that whole method non-deterministic, and every
`self.x = ...` in it illegal.

**Fix**, matching the pattern in GenLayer's own contract template: move the
nondet call into a dedicated helper and pass a **named nested `def`**, never an
inline lambda.

```python
def _consensus_review(self, ...) -> bool:
    def review() -> bool:
        return self._llm_review(...)
    return gl.eq_principle.strict_eq(review)
```

The caller stays deterministic and may write storage.

```
AgentValidator.py     ✓ Lint passed (3 checks)   ✓ Validation passed
LiquidityValidator.py ✓ Lint passed (3 checks)   ✓ Validation passed
```

Consensus verified on the redeployed contract: SWAP 45s `ACCEPTED found=true
approved=true`; ADD_LIQUIDITY 42s `ACCEPTED found=true approved=true`.

