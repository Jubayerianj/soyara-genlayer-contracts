# Redeploying the pair

The executor and the AgentValidator IC are a matched pair: the IC takes the
executor's address as a constructor argument, and the executor accepts
`recordVerdict` and `recordMandate` only from the IC. Replacing one without the
other leaves settlement dead. This is the whole sequence; `deploy-mandate-pair.sh`
and `bind-and-verify.sh` script it.

Chain `4221`. EVM RPC `https://rpc.testnet-chain.genlayer.com` (or
`https://rpc-bradbury.genlayer.com`), GenLayer RPC `https://rpc-bradbury.genlayer.com`.

The deployment in service is listed in `DEPLOYMENTS.md`, and
`bash verify-deployment.sh` proves it matches this source. There is no bypass
on it to disarm: the attestor rail is absent from its bytecode.

---

## 1. Deploy the executor

Set `EXECUTOR_OWNER` to a key that is **not** the settlement agent. The agent
relays; the owner can rotate the validator. One key holding both means one key
that can install a validator it controls and settle against its own verdicts.

```bash
cd aggregator
GOV_PRIVATE_KEY=0x<agent>  EXECUTOR_OWNER=0x<owner> \
forge script script/DeployExecutorOnly.s.sol \
  --rpc-url https://rpc.testnet-chain.genlayer.com --broadcast
```

Note the printed `AgentExecutor:` address as `$NEW_EXECUTOR`. At this point
`recordVerdict` reverts with `ValidatorNotSet` (`0x6bb49bc4`) and nothing can
settle. That window is safe by construction.

## 2. Point it at the V2 factory

The mandate rail prices every trade from a pool it first proves canonical
through the factory. Without this, every mandate settlement reverts with
`FactoryNotSet`.

```bash
cast send $NEW_EXECUTOR 'setV2Factory(address)' 0x4680BCe1632824d30D2F53656dD610736c3e312e \
  --rpc-url https://rpc.testnet-chain.genlayer.com --private-key $OWNER_KEY
```

## 3. Deploy the Intelligent Contract against it

The annotated source exceeds GenVM's per-block pubdata limit, so deploy the
stripped build.

```bash
cd ../genlayer-inteligent-contracts
python3 build_deployable.py            # -> build/AgentValidator.min.py, ~48 KB
genvm-lint check build/AgentValidator.min.py

genlayer deploy --contract build/AgentValidator.min.py \
  --args <owner> $NEW_EXECUTOR --rpc https://rpc-bradbury.genlayer.com
```

If the deploy is refused with `BlockPubdataLimitReached`, retry before assuming
the contract is too big: the limit is per block.

## 4. Finalize the deploy round

A decided transaction sits in `Accepted` until someone finalizes it. Until then
the IC is not callable. Poll until:

```bash
genlayer call $NEW_IC get_config --rpc https://rpc-bradbury.genlayer.com
# -> agent_executor: $NEW_EXECUTOR
```

## 5. Bind the executor to the IC

```bash
cd ../aggregator
PRIVATE_KEY=$OWNER_KEY  AGENT_EXECUTOR=$NEW_EXECUTOR  GENLAYER_VALIDATOR=$NEW_IC \
forge script script/BootstrapValidator.s.sol \
  --rpc-url https://rpc.testnet-chain.genlayer.com --broadcast
```

`setGenLayerValidator` rejects an address with no code and an address
registered as a relaying agent, so this fails loudly rather than quietly
installing a key where consensus belongs.

## 6. Verify against the chain, not against this document

```bash
EXECUTOR=$NEW_EXECUTOR IC=$NEW_IC bash verify-deployment.sh
```

It proves the executor's runtime bytecode and the IC's deployed code are this
source byte for byte, that the pair is bound both ways, that owner and agent
differ, and that the executor refuses an unapproved order, a verdict or
mandate from anyone but the IC, and a V3 mint.

Then update the address maps (this repository's `README.md`, `DEPLOYMENTS.md`
and `genlayer-inteligent-contracts/README.md`, and the application's address
constants). A new executor address means every user approves once more.

## 7. Settle one real trade on each rail

- **consensus**: a trade with its own `validate_swap` round. Latency is the
  appeal window (about 30 minutes), because the verdict travels as an external
  message delivered on finalization and `EthSend` takes no `on=` parameter.
  Confirm `isVerdictLive(commitment)` flips true before settlement and that
  `executeSwap` emits `VerdictConsumed`.
- **mandate**: `issue_trading_mandate` once, wait for `isMandateLive(id)`, then
  settle with `executeSwapUnderMandate`, which emits `MandateSpent` and settles
  in one transaction.
