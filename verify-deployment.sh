#!/usr/bin/env bash
#
# Is the deployed pair exactly what this repository says it is?
#
#   bash verify-deployment.sh
#
# Checked against the chain, not against any document in this repository:
#
#   1. AgentExecutor: `forge build` of aggregator/src produces the runtime
#      bytecode deployed at the executor address, byte for byte
#      (foundry.toml sets bytecode_hash = "none", so comments cannot move it).
#   2. AgentValidator: build_deployable.py produces the code deployed at the IC
#      address, byte for byte (read with gen_getContractCode), and that code has
#      no V3 liquidity validator.
#   3. The pair is bound both ways: executor.genLayerValidator() is the IC, and
#      the IC's get_config().agent_executor is the executor.
#   4. The executor refuses what it should (eth_call from the real relayer, no
#      gas): an order with no verdict, a verdict written by anyone but the IC,
#      a mandate nobody issued, and a V3 mint.
#
# Needs: forge + cast (Foundry), python3, curl. `genlayer` (the GenLayer CLI)
# is used for step 3 when installed.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVM_RPC="${EVM_RPC:-https://rpc-bradbury.genlayer.com}"
GL_RPC="${GL_RPC:-https://rpc-bradbury.genlayer.com}"
EXECUTOR="${EXECUTOR:-0x1BCBad3da718690fa60289DcBF15835e5C79021f}"
IC="${IC:-0xd1D809A1210cc039AEdBF5cD04628416Ad0e6a92}"

fail=0
ok()  { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fail=1; }
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "AgentExecutor $EXECUTOR"
( cd "$HERE/aggregator" && forge build >/dev/null 2>&1 ) || bad "forge build failed"
LOCAL="$(python3 -c "import json;print(json.load(open('$HERE/aggregator/out/AgentExecutor.sol/AgentExecutor.json'))['deployedBytecode']['object'].lower())")"
CHAIN="$(cast code "$EXECUTOR" --rpc-url "$EVM_RPC" | tr 'A-Z' 'a-z')"
if [ "$LOCAL" = "$CHAIN" ]; then ok "runtime bytecode matches this source ($(( (${#CHAIN} - 2) / 2 )) bytes)"; else bad "runtime bytecode differs from this source"; fi

echo "AgentValidator $IC"
( cd "$HERE/genlayer-inteligent-contracts" && python3 build_deployable.py >/dev/null ) || bad "build_deployable.py failed"
curl -s -m 60 -X POST "$GL_RPC" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"gen_getContractCode\",\"params\":[{\"address\":\"$IC\"}]}" \
  | python3 -c "import sys,json,base64; open('$TMP/ic.py','wb').write(base64.b64decode(json.load(sys.stdin)['result']))" \
  || bad "could not read the IC code"
if cmp -s "$TMP/ic.py" "$HERE/genlayer-inteligent-contracts/build/AgentValidator.min.py"; then
  ok "deployed code is build/AgentValidator.min.py byte for byte ($(wc -c < "$TMP/ic.py" | tr -d ' ') bytes)"
else
  bad "deployed code differs from build/AgentValidator.min.py"
fi
if grep -q -E "def validate_liquidity_v3|def validate_add_liquidity_v3|def validate_remove_liquidity_v3" "$TMP/ic.py"; then
  bad "the deployed IC still has a V3 liquidity validator"
else
  ok "the deployed IC has no V3 liquidity validator"
fi

echo "Binding"
BOUND="$(cast call "$EXECUTOR" 'genLayerValidator()(address)' --rpc-url "$EVM_RPC")"
[ "$(lower "$BOUND")" = "$(lower "$IC")" ] && ok "executor.genLayerValidator() = $BOUND" || bad "executor is bound to $BOUND"
if command -v genlayer >/dev/null 2>&1; then
  BACK="$(genlayer call "$IC" get_config --rpc "$GL_RPC" 2>/dev/null | grep -oE "agent_executor: '0x[0-9a-fA-F]{40}'" | grep -oE '0x[0-9a-fA-F]{40}')"
  [ "$(lower "$BACK")" = "$(lower "$EXECUTOR")" ] && ok "IC get_config().agent_executor = $BACK" || bad "IC is bound to ${BACK:-nothing}"
else
  echo "  skip  IC -> executor (install the GenLayer CLI to check this side)"
fi
OWNER="$(cast call "$EXECUTOR" 'owner()(address)' --rpc-url "$EVM_RPC")"
AGENT="$(cast call "$EXECUTOR" 'authorisedAgent()(address)' --rpc-url "$EVM_RPC")"
[ "$(lower "$OWNER")" != "$(lower "$AGENT")" ] && ok "owner $OWNER is not the relaying agent $AGENT" || bad "owner and agent are the same key"

echo "The executor refuses what it should (eth_call from the relayer)"
revert_selector() { "$@" 2>&1 | grep -oE '"data":"0x[0-9a-fA-F]{8}' | head -1 | cut -d'"' -f4; }
expect() { # name, expected signature, command...
  local name="$1" sig="$2"; shift 2
  local want got; want="$(cast sig "$sig")"; got="$(revert_selector "$@")"
  [ "$got" = "$want" ] && ok "$name -> ${sig%%(*}" || bad "$name -> expected ${sig%%(*} ($want), got ${got:-no revert}"
}
PROG=0x0258b6cd7891cd0a682226e25607b958a6479195a601ffff0055a5ff46cfb55dcf05d236a0fdde5a0c866b64be00000bb8
RH="$(cast keccak "$PROG")"
DL=$(( $(date +%s) + 3600 ))
ORDER="(0x3333333333333333333333333333333333333333,0x58B6CD7891cd0A682226E25607b958a6479195A6,0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc,1000000000000000000,997000000000000000,1000000000000000000,30,$DL,0x95feE6Cb918Ed9C621E36082EE8D998873031EaA,5,0x48234eD645676b794a4CbC7483513e58cB04e22E,$RH,1)"
SWAP_SIG="executeSwap((address,address,address,uint256,uint256,uint256,uint256,uint256,address,uint256,address,bytes32,uint256),bytes)"
expect "an order no consensus round approved" "NoConsensusVerdict(bytes32)" \
  cast call "$EXECUTOR" "$SWAP_SIG" "$ORDER" "$PROG" --from "$AGENT" --rpc-url "$EVM_RPC"
expect "a verdict written by the relaying agent" "NotValidator(address)" \
  cast call "$EXECUTOR" 'recordVerdict(uint256,uint64)' 1 "$DL" --from "$AGENT" --rpc-url "$EVM_RPC"
expect "a verdict written by the owner" "NotValidator(address)" \
  cast call "$EXECUTOR" 'recordVerdict(uint256,uint64)' 1 "$DL" --from "$OWNER" --rpc-url "$EVM_RPC"
expect "a mandate nobody issued" "NoMandate(bytes32)" \
  cast call "$EXECUTOR" 'executeSwapUnderMandate(bytes32,uint256,uint256,uint256,bytes)' \
  0x$(printf 'ab%.0s' {1..32}) 1000000000000000000 1 5 "$PROG" --from "$AGENT" --rpc-url "$EVM_RPC"
expect "a V3 mint (no validator can approve one)" "NoConsensusVerdict(bytes32)" \
  cast call "$EXECUTOR" 'executeAddLiquidityV3(address,(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))' \
  0x3333333333333333333333333333333333333333 \
  "(0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc,0x58B6CD7891cd0A682226E25607b958a6479195A6,3000,-60,60,1000000000000000000,1000000000000000000,0,0,0x3333333333333333333333333333333333333333,$DL)" \
  --from "$AGENT" --rpc-url "$EVM_RPC"

echo
if [ "$fail" -eq 0 ]; then echo "The deployed pair is this repository."; else echo "MISMATCH - see FAIL lines above."; fi
exit "$fail"
