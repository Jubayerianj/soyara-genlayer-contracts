# Redeploying the enforcing pair

The executor and the AgentValidator IC are a matched pair: the IC takes the
executor's address as a constructor argument, and the executor accepts
`recordVerdict` only from the IC. Replacing one without the other leaves
settlement dead. This is the whole sequence.

Chain `4221`. EVM RPC `https://rpc.testnet-chain.genlayer.com`,
GenLayer RPC `https://rpc-bradbury.genlayer.com`.

---

## 0. Optional but immediate: disarm the bypass on the CURRENT deployment

The live executor `0x0F1E9857...` still has `attestorThreshold() == 2`, so a
2-of-2 attestor quorum can settle a commitment GenLayer never approved. One
transaction closes that without waiting for the redeploy:

```bash
cast send 0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1 \
  'setAttestorThreshold(uint256)' 0 \
  --rpc-url https://rpc.testnet-chain.genlayer.com \
  --private-key $GOV_PRIVATE_KEY

# verify
cast call 0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1 'attestorThreshold()(uint256)' \
  --rpc-url https://rpc.testnet-chain.genlayer.com   # -> 0
```

After this, GenLayer consensus is the only authority on the deployed contract.
The redeploy below makes that structural rather than a setting.

---

## 1. Deploy the executor

Set `EXECUTOR_OWNER` to a key that is **not** the settlement agent. The agent
relays; the owner can rotate the validator. One key holding both means one key
that can install a validator it controls and settle against its own verdicts.

```bash
cd aggregator
GOV_PRIVATE_KEY=0x...  EXECUTOR_OWNER=0x<multisig-or-second-key> \
forge script script/DeployExecutorOnly.s.sol \
  --rpc-url https://rpc.testnet-chain.genlayer.com --broadcast
```

Note the printed `AgentExecutor:` address as `$NEW_EXECUTOR`. At this point
`recordVerdict` reverts with `ValidatorNotSet` (`0x6bb49bc4`) and nothing can
settle. That window is safe by construction.

## 2. Deploy the Intelligent Contract against it

The annotated source is ~80 KB and exceeds the GenVM pubdata limit, so deploy
the stripped build.

```bash
cd ../genlayer-inteligent-contracts
python3 build_deployable.py            # -> build/AgentValidator.min.py, ~49 KB

genlayer deploy --contract build/AgentValidator.min.py \
  --args <owner> $NEW_EXECUTOR
```

## 3. Finalize the deploy round

A decided transaction sits in `Accepted` until someone finalizes it, and nothing
does this automatically. Until it happens the IC is not callable. Poll until:

```bash
genlayer call $NEW_IC get_config --rpc https://rpc-bradbury.genlayer.com
# -> agent_executor: $NEW_EXECUTOR
```

## 4. Bind the executor to the IC

```bash
cd ../aggregator
PRIVATE_KEY=0x...  AGENT_EXECUTOR=$NEW_EXECUTOR  GENLAYER_VALIDATOR=$NEW_IC \
forge script script/BootstrapValidator.s.sol \
  --rpc-url https://rpc.testnet-chain.genlayer.com --broadcast
```

`setGenLayerValidator` now rejects an address with no code and an address
registered as a relaying agent, so this fails loudly rather than quietly
installing a key where consensus belongs.

## 5. Update the address map in all four places

`$NEW_EXECUTOR` and `$NEW_IC` must land in:

| File | Field |
|---|---|
| `frontend/flipswap/constants/addresses.js` | `agentExecutor`, `agentValidator` |
| `frontend/flipswap/.env.local` | `AGENT_EXECUTOR_ADDRESS` |
| `sdk/src/addresses.js` | `agentExecutor`, `agentValidator` |
| `DEPLOYMENTS.md`, `dex-contracts/README.md`, `genlayer-inteligent-contracts/README.md` | the address tables |

`ATTESTOR_PRIVATE_KEYS` can be deleted from `.env.local`; nothing reads it now.

Next.js reads `.env.local` only at startup, so restart the dev server.

## 6. Verify against the chain, not against this document

```bash
cd sdk && node test/addresses.mjs
```

That suite asserts, against the live deployment: every shipped address has code,
the executor exposes `genLayerValidator`, it is bound to the IC the SDK ships,
the validator is a contract rather than an EOA, the validator is not the
settlement agent, and `attestorThreshold` **no longer answers at all**. The last
one fails on any pre-fix executor, which is the point.

Then confirm the pairing by hand:

```bash
cast call $NEW_EXECUTOR 'genLayerValidator()(address)' \
  --rpc-url https://rpc.testnet-chain.genlayer.com          # -> $NEW_IC

genlayer call $NEW_IC get_config --rpc https://rpc-bradbury.genlayer.com
# -> agent_executor: $NEW_EXECUTOR
```

## 7. Settle one real trade end to end

Latency is now the full appeal window, 15 to 25 minutes, because the verdict
travels as an external message delivered on finalization and `EthSend` takes no
`on=` parameter. Expect the trade to sit on the settlement queue. Confirm
`isVerdictLive(commitment)` flips true before settlement, and that the
`VerdictConsumed` event reports `GenLayerConsensus`.
