# Soyara: GenLayer contracts

The on-chain half of Soyara DEX on **GenLayer Bradbury** (chain `4221`): the
GenLayer Intelligent Contract that authorises a trade, and the Solidity executor
that refuses to settle anything it did not authorise.

**This repository contains contracts only.** The application (the `/ai` chat
agent, the `/a2a` agent swarm, the pools app) lives in the product repository.

## Where things are

| | Path |
|---|---|
| **AgentValidator** (GenLayer IC, Python/GenVM) | [`genlayer-inteligent-contracts/AgentValidator.py`](genlayer-inteligent-contracts/AgentValidator.py) |
| **AgentExecutor** (settlement, Solidity) | [`aggregator/src/AgentExecutor.sol`](aggregator/src/AgentExecutor.sol) |
| Executor base: verdict and mandate registries, roles | [`aggregator/src/base/AgentExecutorBase.sol`](aggregator/src/base/AgentExecutorBase.sol) |
| Commitment encoding | [`aggregator/src/libraries/TradeHashLib.sol`](aggregator/src/libraries/TradeHashLib.sol) |
| The `SwapOrder` and `TradingMandate` structs | [`aggregator/src/types/`](aggregator/src/types/) |
| AMM aggregation (V2/V3 routing) | [`aggregator/src/entrypoint/`](aggregator/src/entrypoint/), [`aggregator/src/flow/`](aggregator/src/flow/) |
| Underlying AMMs | [`v2 dex contracts/`](<v2 dex contracts>), [`v3 dex contracts/`](<v3 dex contracts>) |
| **Proof that the chain is this source** | [`verify-deployment.sh`](verify-deployment.sh) |

The validator and the executor are a **matched pair** and must be deployed
together: the validator holds the executor's address, and the executor accepts
`recordVerdict` and `recordMandate` **only** from that validator.

## Deployed on Bradbury

| Contract | Address |
|---|---|
| AgentValidator (IC) | `0xd1D809A1210cc039AEdBF5cD04628416Ad0e6a92` |
| AgentExecutor | `0x1BCBad3da718690fa60289DcBF15835e5C79021f` |
| AGGFlow entrypoint | `0x95feE6Cb918Ed9C621E36082EE8D998873031EaA` |
| V2 factory / router | `0x4680BCe1632824d30D2F53656dD610736c3e312e` / `0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5` |
| V3 factory / router / quoter | `0xBd959038300aF0C8dd1873E497d6D0a565b4E246` / `0xdf69970B2fE416339187aA41D39882e864984CE9` / `0xca4914407868bc37ccbE324cA149DD475d39A2Bf` |

RPC `https://rpc-bradbury.genlayer.com`

| Role | Address |
|---|---|
| owner (cold; rotates the validator) | `0xF186d1414B7F399572F3945D1b84cc230caB9c55` |
| authorisedAgent (hot; relays settlements only) | `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2` |

The two are deliberately different keys. When they were the same, the key that
signs every settlement could also rotate the validator and change settlement
policy, which is the concentration this design exists to remove.

### Verify it

```bash
bash verify-deployment.sh
```

Against the chain, not this README: the executor's runtime bytecode is a fresh
`forge build` of `aggregator/src` byte for byte (`bytecode_hash = "none"`, so
comments cannot move it); the IC's deployed code, read with
`gen_getContractCode`, is `build/AgentValidator.min.py` byte for byte and has no
V3 liquidity validator; the pair is bound both ways; owner and agent differ; and
the executor refuses an order no round approved, a verdict written by the agent
or the owner, a mandate nobody issued, and a V3 mint.

## How settlement is enforced

The executor, not a privileged agent, is what authorises a trade. The IC reaches
the EVM through its ghost contract, so the executor sees `msg.sender` equal to
the IC's own address; `recordVerdict` and `recordMandate` are `onlyValidator`,
and no key an operator holds can call them. The agent relays.

A swap settles on one of **two rails**, and both need an authority only the IC
can write:

| Rail | Authority, written by the IC | Settlement call | What the executor enforces | Latency |
|---|---|---|---|---|
| **consensus** | `validate_swap` → `recordVerdict(commitment, expiry)` | `executeSwap(order, aggProgram)` | Re-derives the commitment from the whole order and consumes the matching verdict. Single use. | Appeal window, about 30 min |
| **mandate** | `issue_trading_mandate` → `recordMandate(...)` | `executeSwapUnderMandate(id, amountIn, minAmountOut, feeBps, aggProgram)` | User, pair, direction, per-trade ceiling, lifetime budget, fee, collector, router and the route by hash; prices the trade itself from the pinned pool's live reserves. | One transaction |

```
user intent
     │  best-route quote → the exact SwapOrder
     ▼
covered by a live mandate on its best route? ──yes──► executeSwapUnderMandate
     │ no
     ▼
AgentValidator.validate_swap (GenVM consensus)
     │  decodes the aggregator route program
     │  confirms every pool against the V2/V3 factory
     │  re-derives the output from LIVE reserves
     │  LLM coherence review under strict_eq
     │  external message, emitted on finalization
     ▼
AgentExecutor.recordVerdict(commitment, expiry)     ← onlyValidator
     ▼
AgentExecutor.executeSwap(order, aggProgram)
     re-derives the commitment from the ORDER and consumes it
```

**The per-order commitment** is `keccak256` over the whole `SwapOrder`: user,
tokenIn, tokenOut, amountIn, minAmountOut, **quotedAmountOut**, slippageBps,
deadline, **router**, **feeBps**, **feeCollector**, **routeHash**, nonce, plus
the chain id and the executor address. Change any one of them and the executor
derives a different commitment, which no verdict backs, and settlement reverts
with `NoConsensusVerdict`. Verdicts are single use (`CommitmentAlreadyUsed`).

**A mandate** pays the appeal window once instead of per trade, because a
verdict reaches the EVM as an `EthSend` emission, which carries no
delivery-timing field, and so arrives only on finalization. Consensus verifies
the pool against the V2 factory, reads its live reserves, refuses a per-trade
cap above 10% of the reserve, and builds the route program itself; the
settlement agent chooses only the size of each trade. The trade-off is stated
in `aggregator/src/types/MandateTypes.sol`: a mandate is a bounded authority,
not one exact order, and in exchange the executor prices every trade from live
reserves rather than checking a supplied quote.

**One trade, one authority.** The application chooses the rail before any round
is opened. A trade that a live mandate covers on its best route is never given
a verdict of its own, and a trade with its own verdict never falls onto a
mandate, so one intent cannot settle twice. The application's agent flows have
no third path: nothing on its `/ai` or `/a2a` surfaces sends a trade to the
AGGFlow entrypoint directly.

There is exactly one way a verdict arrives: the IC records it over its ghost
contract. `_consumeVerdict` has no second branch. An earlier version also
accepted an M-of-N EIP-712 attestor quorum; it was removed from the bytecode,
because nothing on chain linked such a signature to a verdict the IC had
actually recorded.

The owner cannot route around this either. `setGenLayerValidator` rejects an
address with no code (a ghost contract always has code, so an EOA can never be
installed there) and rejects any address registered as a relaying agent, with
the same check applied from the agent side.

## V3 liquidity

V3 **swaps** route and verify normally: the IC prices a V3 leg through the
quoter.

V3 **liquidity** is not on the settlement path. The IC's
`validate_liquidity_v3_add` / `_remove` were removed when the deployable build
hit GenVM's per-block pubdata limit, so no verdict can exist for a V3 mint or
burn. `AgentExecutor` still carries `executeAddLiquidityV3` /
`executeRemoveLiquidityV3` in its deployed bytecode; both revert with
`NoConsensusVerdict` and are annotated as unreachable in the source, and
removing them means deploying a new executor and re-pointing the IC to it with its owner-only `set_agent_executor`; the IC itself stays. The application makes no V3 liquidity
call and manages V3 positions in its pools app. The separate `LiquidityValidator`
contract (`0xEFb9473B...`), which authorised nothing, is retired and its source
removed; see `DEPLOYMENTS.md`.

## Tests

```bash
# Solidity: 67 tests - every parameter-tamper and replay vector, both rails,
# every mandate binding, and the V3 entry points failing closed
cd aggregator && forge test

# Cross-language: the Python encoder must produce byte-identical commitments
cd genlayer-inteligent-contracts && python3 test_commitment_conformance.py

# GenLayer's linter (Python >= 3.10)
genvm-lint check genlayer-inteligent-contracts/AgentValidator.py
```

`test_commitment_conformance.py` also guards the pairing itself: it fails if a
copy of the settlement source is duplicated into the IC folder, if
`recordVerdict`/`onlyValidator` go missing, or if an agent-written approval
function reappears.

## Deploying

See [`DEPLOY-RUNBOOK.md`](DEPLOY-RUNBOOK.md). The IC is size-limited by GenVM
pubdata, so the stripped build is what deploys:

```bash
cd genlayer-inteligent-contracts
python3 build_deployable.py          # strips comments/docstrings
genlayer deploy --contract build/AgentValidator.min.py --args <owner> <executor>
```

Then bind the pair with `aggregator/script/BootstrapValidator.s.sol`. Until
that runs, `recordVerdict` reverts with `ValidatorNotSet` and nothing can
settle; the executor never falls back to trusting the agent key.
