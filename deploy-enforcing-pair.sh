#!/usr/bin/env bash
#
# Redeploy the enforcing AgentExecutor + AgentValidator pair.
#
# The two are a matched pair: the IC takes the executor's address as a
# constructor argument, and the executor accepts recordVerdict only from the IC.
# Neither can be replaced alone.
#
# USAGE
#   export AGENT_KEY=0x...     # hot key: deploys, and relays settlements
#   export OWNER_KEY=0x...     # cold key: owns the executor, rotates the validator
#   bash deploy-enforcing-pair.sh
#
# AGENT_KEY and OWNER_KEY MUST be different. The agent signs every settlement,
# so it is exposed continuously; the owner can rotate genLayerValidator. One key
# holding both is one key that can install a validator it controls and then
# settle against its own verdicts. The contract blocks the cheap forms of that
# (the validator must be a contract, and may not be a registered agent), but
# keeping the roles on separate keys is the operator's half of the job.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVM_RPC="https://rpc.testnet-chain.genlayer.com"
GL_RPC="https://rpc-bradbury.genlayer.com"
OLD_EXECUTOR="0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1"

: "${AGENT_KEY:?export AGENT_KEY (the hot settlement key)}"
: "${OWNER_KEY:?export OWNER_KEY (a DIFFERENT key that will own the executor)}"

AGENT_ADDR="$(cast wallet address --private-key "$AGENT_KEY")"
OWNER_ADDR="$(cast wallet address --private-key "$OWNER_KEY")"

if [ "$AGENT_ADDR" = "$OWNER_ADDR" ]; then
  echo "AGENT_KEY and OWNER_KEY are the same address ($AGENT_ADDR)."
  echo "That is the role collapse this deploy exists to fix. Use two keys."
  exit 1
fi

echo "agent (hot, relays settlements): $AGENT_ADDR"
echo "owner (cold, rotates validator): $OWNER_ADDR"
echo

# ---------------------------------------------------------------------------
# STEP 0  Disarm the attestor rail on the CURRENT executor.
#
# Separate from, and before, the redeploy. The steps below wait on GenLayer
# finalization, which is 15 to 25 minutes, and the live contract should not
# carry an armed bypass during that window.
# ---------------------------------------------------------------------------
CUR="$(cast call "$OLD_EXECUTOR" 'attestorThreshold()(uint256)' --rpc-url "$EVM_RPC" 2>/dev/null || echo gone)"
if [ "$CUR" != "gone" ] && [ "$CUR" != "0" ]; then
  echo "STEP 0: disarming the attestor rail on $OLD_EXECUTOR (reads ${CUR}-of-N)"
  cast send "$OLD_EXECUTOR" 'setAttestorThreshold(uint256)' 0 \
    --rpc-url "$EVM_RPC" --private-key "$AGENT_KEY" >/dev/null
  echo "        now reads: $(cast call "$OLD_EXECUTOR" 'attestorThreshold()(uint256)' --rpc-url "$EVM_RPC")"
else
  echo "STEP 0: attestor rail already disarmed (reads $CUR)"
fi
echo

# ---------------------------------------------------------------------------
# STEP 1  Make sure the owner can pay for the bootstrap in step 4.
# ---------------------------------------------------------------------------
if [ "$(cast balance "$OWNER_ADDR" --rpc-url "$EVM_RPC")" = "0" ]; then
  echo "STEP 1: funding owner with 2 GEN"
  cast send "$OWNER_ADDR" --value 2ether \
    --rpc-url "$EVM_RPC" --private-key "$AGENT_KEY" >/dev/null
fi
echo "STEP 1: owner holds $(cast balance "$OWNER_ADDR" --rpc-url "$EVM_RPC" --ether) GEN"
echo

# ---------------------------------------------------------------------------
# STEP 2  Deploy the executor.
# ---------------------------------------------------------------------------
echo "STEP 2: deploying AgentExecutor"
cd "$HERE/aggregator"
GOV_PRIVATE_KEY="$AGENT_KEY" EXECUTOR_OWNER="$OWNER_ADDR" \
  forge script script/DeployExecutorOnly.s.sol \
  --rpc-url "$EVM_RPC" --broadcast >/tmp/deploy-exec.log 2>&1 \
  || { tail -40 /tmp/deploy-exec.log; exit 1; }

NEW_EXECUTOR="$(grep -oE 'AgentExecutor: 0x[0-9a-fA-F]{40}' /tmp/deploy-exec.log | tail -1 | awk '{print $2}')"
[ -n "$NEW_EXECUTOR" ] || { echo "could not parse the executor address"; tail -40 /tmp/deploy-exec.log; exit 1; }

echo "        AgentExecutor: $NEW_EXECUTOR"
echo "        genLayerValidator is unset, so recordVerdict reverts with"
echo "        ValidatorNotSet and nothing settles. That is the intended state."
echo

# ---------------------------------------------------------------------------
# STEP 3  Deploy the Intelligent Contract against it.
#
# The annotated source is ~80 KB, past the GenVM pubdata limit, so the stripped
# build is what goes on chain.
# ---------------------------------------------------------------------------
echo "STEP 3: building and deploying AgentValidator"
cd "$HERE/genlayer-inteligent-contracts"
python3 build_deployable.py
genlayer deploy --contract build/AgentValidator.min.py \
  --args "$OWNER_ADDR" "$NEW_EXECUTOR" --rpc "$GL_RPC" | tee /tmp/deploy-ic.log

echo
echo "-----------------------------------------------------------------------"
echo "Deploy round submitted. It must FINALIZE before the IC is callable, and"
echo "nothing finalizes it automatically. Poll until this answers:"
echo
echo "  genlayer call <IC> get_config --rpc $GL_RPC"
echo
echo "Then finish the bind:"
echo
echo "  export NEW_EXECUTOR=$NEW_EXECUTOR"
echo "  export NEW_IC=<address printed above>"
echo "  export OWNER_KEY=\$OWNER_KEY"
echo "  bash $HERE/bind-and-verify.sh"
echo "-----------------------------------------------------------------------"
