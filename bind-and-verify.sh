#!/usr/bin/env bash
#
# Second half of the redeploy: bind the executor to the IC, then verify the
# result against the chain rather than against any document.
#
# USAGE
#   export NEW_EXECUTOR=0x...
#   export NEW_IC=0x...
#   export OWNER_KEY=0x...      # must be the executor's owner
#   bash bind-and-verify.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVM_RPC="https://rpc.testnet-chain.genlayer.com"
GL_RPC="https://rpc-bradbury.genlayer.com"

: "${NEW_EXECUTOR:?export NEW_EXECUTOR}"
: "${NEW_IC:?export NEW_IC}"
: "${OWNER_KEY:?export OWNER_KEY}"

echo "STEP 4: binding $NEW_EXECUTOR -> $NEW_IC"
cd "$HERE/aggregator"
PRIVATE_KEY="$OWNER_KEY" AGENT_EXECUTOR="$NEW_EXECUTOR" GENLAYER_VALIDATOR="$NEW_IC" \
  forge script script/BootstrapValidator.s.sol \
  --rpc-url "$EVM_RPC" --broadcast >/tmp/bind.log 2>&1 \
  || { tail -40 /tmp/bind.log; exit 1; }
echo

fail=0
echo "STEP 5: verifying against the chain"

echo -n "  executor -> IC              : "
BOUND="$(cast call "$NEW_EXECUTOR" 'genLayerValidator()(address)' --rpc-url "$EVM_RPC")"
echo "$BOUND"
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
[ "$(lower "$BOUND")" = "$(lower "$NEW_IC")" ] || { echo "  !! not bound to the expected IC"; fail=1; }

echo -n "  IC -> executor              : "
genlayer call "$NEW_IC" get_config --rpc "$GL_RPC" 2>/dev/null | grep -oE "agent_executor: '0x[0-9a-fA-F]{40}'" || echo "(finalize the IC round first)"

# The bypass and the agent-written approval must both be absent from the
# deployed bytecode, not merely absent from the repository.
echo -n "  attestorThreshold is gone   : "
if cast call "$NEW_EXECUTOR" 'attestorThreshold()(uint256)' --rpc-url "$EVM_RPC" >/dev/null 2>&1; then
  echo "NO - still answers, this is not the fixed executor"; fail=1
else
  echo "yes"
fi

echo -n "  verdictDigest is gone       : "
if cast call "$NEW_EXECUTOR" 'verdictDigest(bytes32)' 0x0000000000000000000000000000000000000000000000000000000000000000 \
     --rpc-url "$EVM_RPC" >/dev/null 2>&1; then
  echo "NO - still answers"; fail=1
else
  echo "yes"
fi

echo -n "  owner is not the agent      : "
OWN="$(cast call "$NEW_EXECUTOR" 'owner()(address)' --rpc-url "$EVM_RPC")"
AGT="$(cast call "$NEW_EXECUTOR" 'authorisedAgent()(address)' --rpc-url "$EVM_RPC")"
if [ "$(lower "$OWN")" = "$(lower "$AGT")" ]; then echo "NO - both are $OWN"; fail=1; else echo "yes ($OWN / $AGT)"; fi

echo -n "  validator is a contract     : "
if [ "$(cast code "$BOUND" --rpc-url "$EVM_RPC")" = "0x" ]; then echo "NO"; fail=1; else echo "yes"; fi

# The mandate fast path prices trades from live reserves, and it refuses to do
# that until it can prove a pool is canonical. Without the factory every
# mandate settlement reverts with FactoryNotSet, so this is not optional.
echo -n "  v2Factory is set            : "
FACT="$(cast call "$NEW_EXECUTOR" 'v2Factory()(address)' --rpc-url "$EVM_RPC" 2>/dev/null || echo 0x0)"
if [ "$(lower "$FACT")" = "0x0000000000000000000000000000000000000000" ] || [ "$FACT" = "0x0" ]; then
  echo "NO - run setV2Factory or the mandate path cannot price anything"; fail=1
else
  echo "yes ($FACT)"
fi

echo -n "  mandate path is available   : "
if cast call "$NEW_EXECUTOR" 'isMandateLive(bytes32)(bool)' \
     0x0000000000000000000000000000000000000000000000000000000000000000 \
     --rpc-url "$EVM_RPC" >/dev/null 2>&1; then
  echo "yes"
else
  echo "NO - this executor predates mandates, trades will use per-order consensus"; fail=1
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "VERIFICATION FAILED - do not update the address map."
  exit 1
fi

echo "-----------------------------------------------------------------------"
echo "Verified. Now point every shipped address map at the new pair:"
echo
echo "  bash $HERE/update-addresses.sh $NEW_EXECUTOR $NEW_IC"
echo "  cd $HERE/../sdk && node test/addresses.mjs"
echo
echo "NOTE: users hold unlimited ERC-20 approvals against the OLD executor."
echo "Changing the settlement contract means every user approves once more."
echo "That is unavoidable when the executor address changes."
echo "-----------------------------------------------------------------------"
