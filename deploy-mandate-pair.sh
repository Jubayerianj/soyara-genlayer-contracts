#!/usr/bin/env bash
#
# Deploy the executor + validator pair that supports mandates.
#
# WHY A REDEPLOY IS NEEDED
# ------------------------
# executeSwapUnderMandate, recordMandate, isMandateLive and setV2Factory are new
# functions. The executor at 0x758d57cF... does not have them, so the fast path
# cannot work against it.
#
# WHAT THIS GETS YOU
# ------------------
# One consensus round per user/pair, in the background, and then every trade is
# a single EVM transaction. The wait exists because a GenLayer verdict reaches
# the EVM as an `EthSend` emission that carries no delivery-timing field - only
# PostMessage and DeployContract take on=accepted - so the chain delivers on
# finalization and per-trade consensus can never be fast. A mandate pays that
# once instead of every trade.
#
# USAGE
#   export AGENT_KEY=0x...     # hot key: deploys, and relays settlements
#   export OWNER_KEY=0x...     # cold key: owns the executor. MUST differ.
#   bash deploy-mandate-pair.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVM_RPC="https://rpc.testnet-chain.genlayer.com"
GL_RPC="https://rpc-bradbury.genlayer.com"
V2_FACTORY="0x4680BCe1632824d30D2F53656dD610736c3e312e"

: "${AGENT_KEY:?export AGENT_KEY}"
: "${OWNER_KEY:?export OWNER_KEY (must differ from AGENT_KEY)}"

AGENT_ADDR="$(cast wallet address --private-key "$AGENT_KEY")"
OWNER_ADDR="$(cast wallet address --private-key "$OWNER_KEY")"
[ "$AGENT_ADDR" != "$OWNER_ADDR" ] || { echo "AGENT_KEY and OWNER_KEY must be different addresses"; exit 1; }

echo "agent (hot): $AGENT_ADDR"
echo "owner (cold): $OWNER_ADDR"
echo

# ---------------------------------------------------------------------------
# 1. Executor
# ---------------------------------------------------------------------------
echo "STEP 1: deploying AgentExecutor"
cd "$HERE/aggregator"
GOV_PRIVATE_KEY="$AGENT_KEY" EXECUTOR_OWNER="$OWNER_ADDR" \
  forge script script/DeployExecutorOnly.s.sol --rpc-url "$EVM_RPC" --broadcast \
  >/tmp/mandate-exec.log 2>&1 || { tail -40 /tmp/mandate-exec.log; exit 1; }

NEW_EXECUTOR="$(grep -oE 'AgentExecutor: 0x[0-9a-fA-F]{40}' /tmp/mandate-exec.log | tail -1 | awk '{print $2}')"
[ -n "$NEW_EXECUTOR" ] || { echo "could not parse the executor address"; tail -40 /tmp/mandate-exec.log; exit 1; }
echo "        AgentExecutor: $NEW_EXECUTOR"

# ---------------------------------------------------------------------------
# 2. The factory the executor prices against
#
# Without this every mandate settlement reverts with FactoryNotSet. The factory
# is what proves a pool is the canonical pair for its tokens before its reserves
# are believed - skip it and an agent could price against a pool it deployed.
# ---------------------------------------------------------------------------
echo "STEP 2: pointing the executor at the V2 factory"
cast send "$NEW_EXECUTOR" 'setV2Factory(address)' "$V2_FACTORY" \
  --rpc-url "$EVM_RPC" --private-key "$OWNER_KEY" >/dev/null
echo "        v2Factory: $(cast call "$NEW_EXECUTOR" 'v2Factory()(address)' --rpc-url "$EVM_RPC")"

# ---------------------------------------------------------------------------
# 3. The Intelligent Contract, bound to this executor
# ---------------------------------------------------------------------------
echo "STEP 3: building and deploying AgentValidator"
cd "$HERE/genlayer-inteligent-contracts"
python3 build_deployable.py
SIZE=$(wc -c < build/AgentValidator.min.py)
echo "        deployable: $SIZE bytes"
if [ "$SIZE" -gt 65000 ]; then
  echo "        !! larger than any deploy known to have succeeded here (49 KB did, ~76 KB was rejected)."
  echo "        !! if this is refused for size, strip harder or split the liquidity validators out."
fi

genlayer deploy --contract build/AgentValidator.min.py \
  --args "$OWNER_ADDR" "$NEW_EXECUTOR" --rpc "$GL_RPC" | tee /tmp/mandate-ic.log

echo
echo "-----------------------------------------------------------------------"
echo "Finalize the deploy round, then bind:"
echo
echo "  export NEW_EXECUTOR=$NEW_EXECUTOR"
echo "  export NEW_IC=<address printed above>"
echo "  export OWNER_KEY=\$OWNER_KEY"
echo "  bash $HERE/bind-and-verify.sh"
echo
echo "Then point the app at the new pair:"
echo "  bash $HERE/update-addresses.sh \$NEW_EXECUTOR \$NEW_IC"
echo
echo "NOTE: a new executor address means every user approves once more. Their"
echo "existing approvals point at the previous contract."
echo "-----------------------------------------------------------------------"
