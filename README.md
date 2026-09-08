# Soyara — GenLayer contracts

The on-chain half of Soyara DEX on **GenLayer Bradbury** (chain `4221`): the
GenLayer Intelligent Contract that validates a trade, and the Solidity executor
that enforces its verdict at settlement.

**This repository contains contracts only.** It previously also carried the
FlipSwap frontend, the marketing site and an example integration, which made it
hard to review the contract artifact on its own. Those now live in the product
repository and nothing here depends on them. What remains is the Intelligent
Contract, the settlement executor, the AMMs they route through, their tests,
and the deployment record.

## Where things are

| | Path |
|---|---|
| **AgentValidator** (GenLayer IC, Python/GenVM) | [`genlayer-inteligent-contracts/AgentValidator.py`](genlayer-inteligent-contracts/AgentValidator.py) |
| **AgentExecutor** (settlement, Solidity) | [`aggregator/src/AgentExecutor.sol`](aggregator/src/AgentExecutor.sol) |
| Executor base — verdict registry, roles | [`aggregator/src/base/AgentExecutorBase.sol`](aggregator/src/base/AgentExecutorBase.sol) |
| Commitment encoding | [`aggregator/src/libraries/TradeHashLib.sol`](aggregator/src/libraries/TradeHashLib.sol) |
| The `SwapOrder` struct | [`aggregator/src/types/SettlementTypes.sol`](aggregator/src/types/SettlementTypes.sol) |
| AMM aggregation (V2/V3 routing) | [`aggregator/src/entrypoint/`](aggregator/src/entrypoint/), [`aggregator/src/flow/`](aggregator/src/flow/) |
| Underlying AMMs | [`v2 dex contracts/`](<v2 dex contracts>), [`v3 dex contracts/`](<v3 dex contracts>) |

The validator and the executor are a **matched pair** and must be deployed
together: the validator holds the executor's address, and the executor accepts
`recordVerdict` **only** from that validator.

## Deployed on Bradbury

| Contract | Address |
|---|---|
| AgentValidator (IC) | `0xf47492A969b2bC8f99B62Bdf8958541F2234C42b` |
| AgentExecutor | `0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1` |
| AGGFlow entrypoint | `0x95feE6Cb918Ed9C621E36082EE8D998873031EaA` |
| V2 factory / router | `0x4680BCe1632824d30D2F53656dD610736c3e312e` / `0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5` |
| V3 factory / router / quoter | `0xBd959038300aF0C8dd1873E497d6D0a565b4E246` / `0xdf69970B2fE416339187aA41D39882e864984CE9` / `0xca4914407868bc37ccbE324cA149DD475d39A2Bf` |

RPC `https://rpc-bradbury.genlayer.com` · owner `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2`

## How the verdict is enforced

The executor, not a privileged agent, is what authorises a trade.

```
user intent
     │
     ▼
AgentValidator (GenVM consensus)
     │  decodes the aggregator route program
     │  confirms every pool against the V2/V3 factory
     │  re-derives the output from LIVE reserves
     │  LLM coherence review under strict_eq
     │
     │  external message, emitted on finalization
     ▼
AgentExecutor.recordVerdict(commitment, expiry)     ← onlyValidator
     │
     ▼
AgentExecutor.executeSwap(order, aggProgram, attestations)
        re-derives the commitment from the ORDER and consumes it
```

The commitment is `keccak256` over the whole `SwapOrder`: user, tokenIn,
tokenOut, amountIn, minAmountOut, **quotedAmountOut**, slippageBps, deadline,
**router**, **feeBps**, **feeCollector**, **routeHash**, nonce — plus the chain
id and the executor address. Change any one of them and the executor derives a
different commitment, which no verdict backs, and settlement reverts. A relayer
therefore cannot substitute a route, raise the fee, redirect the output, or
settle against a quote consensus never saw. Verdicts are single use.

There is exactly one way a verdict arrives: the AgentValidator IC records it
over its ghost contract (`VerdictSource.GenLayerConsensus`). `_consumeVerdict`
has no second branch — no recorded verdict means `NoConsensusVerdict` and the
settlement reverts.

An earlier version also accepted an M-of-N EIP-712 attestor quorum, so a trade
could settle about thirty seconds after the round decided instead of waiting out
the appeal window. It was removed: nothing on chain linked such a signature to a
verdict the IC had actually recorded, so those keys amounted to a substitute for
consensus. Settlement now waits for finalization, 15 to 25 minutes on Bradbury.
That latency is the honest cost of the guarantee.

The owner cannot route around this either. `setGenLayerValidator` rejects an
address with no code (a ghost contract always has code, so an EOA can never be
installed there) and rejects any address registered as a relaying agent, with
the same check applied from the agent side.

## Tests

```bash
# Solidity: 54 tests, including every parameter-tamper and replay vector
cd aggregator && forge test

# Cross-language: the Python encoder must produce byte-identical commitments
cd genlayer-inteligent-contracts && python3 test_commitment_conformance.py
```

`test_commitment_conformance.py` also guards the pairing itself: it fails if a
copy of the settlement source is duplicated into the IC folder, if
`recordVerdict`/`onlyValidator` go missing, or if an agent-written approval
function reappears.

## Deploying

The IC is size-limited by GenVM pubdata, so deploy the stripped build:

```bash
cd genlayer-inteligent-contracts
python3 build_deployable.py          # strips comments/docstrings
genlayer deploy --contract build/AgentValidator.deployable.py --args <owner> <executor>
```

Then bind the pair, from `aggregator/script/`: `BootstrapValidator.s.sol`
points the executor at the IC. Until that runs, `recordVerdict` reverts with
`ValidatorNotSet` and nothing can settle, which is deliberate — the executor
never falls back to trusting the agent key.
