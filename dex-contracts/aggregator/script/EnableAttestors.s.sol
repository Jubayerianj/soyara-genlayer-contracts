// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { AgentExecutor } from "../src/AgentExecutor.sol";

// ============================================================================
//  EnableAttestors.s.sol
//
//  Turns on the fast settlement rail.
//
//  WHY IT EXISTS
//  -------------
//  A GenLayer consensus round DECIDES in about twenty seconds. What takes forty
//  minutes is finalization, and the only reason settlement waits for it is that
//  an Intelligent Contract's external message is delivered on finalization. The
//  verdict itself is readable from the IC as soon as the round is accepted.
//
//  So the wait is not consensus being slow. It is the delivery mechanism.
//
//  The attestation rail carries the same verdict over a different road:
//  attestors read the IC's recorded verdict and sign the SAME commitment under
//  EIP-712, and the executor verifies the signatures on chain. Settlement in
//  seconds rather than in forty minutes.
//
//  WHAT IS AND IS NOT GIVEN UP
//  ---------------------------
//  The consensus round still decides. Attestors sign only what the IC has
//  already approved; they cannot originate an approval, because the thing they
//  sign is a commitment and a commitment nobody validated is one the executor
//  has no verdict for on either rail.
//
//  What changes is the trust assumption at settlement: from "the validator IC
//  wrote this" to "M of N attestors agree the validator IC approved this". That
//  is weaker than the consensus rail and it should be said plainly. It is also
//  far stronger than what this system had before, where a single key both
//  authorised and executed, and where the approval covered seven fields and
//  left the route and the fee for that key to choose:
//
//    · the signature covers the ENTIRE commitment, route and fee included
//    · it takes M distinct signers, not one
//    · an attestor may never be a settlement agent, enforced on chain by
//      RoleConflict in setVerdictAttestor / setAgentAuthorisation
//
//  Attestor keys only ever sign. They never send a transaction, so they need no
//  funding and belong in a separate service or an HSM.
//
//  To turn the rail OFF again, set the threshold to zero. GenLayer consensus
//  then becomes the only source of authority, at the cost of the finalization
//  wait.
//
//  USAGE
//      PRIVATE_KEY=... AGENT_EXECUTOR=0x... ATTESTORS="0xA,0xB" THRESHOLD=2 \
//      forge script script/EnableAttestors.s.sol --rpc-url <rpc> --broadcast
// ============================================================================

contract EnableAttestors is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address executorAddr = vm.envAddress("AGENT_EXECUTOR");
        address[] memory attestors = vm.envAddress("ATTESTORS", ",");
        uint256 threshold = vm.envUint("THRESHOLD");

        require(executorAddr != address(0), "AGENT_EXECUTOR not set");
        require(attestors.length > 0, "ATTESTORS not set");
        require(threshold > 0 && threshold <= attestors.length, "THRESHOLD out of range");

        AgentExecutor exec = AgentExecutor(payable(executorAddr));

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < attestors.length; i++) {
            exec.setVerdictAttestor(attestors[i], true);
        }
        exec.setAttestorThreshold(threshold);
        vm.stopBroadcast();

        console2.log("executor :", executorAddr);
        console2.log("threshold:", exec.attestorThreshold());
        for (uint256 i = 0; i < attestors.length; i++) {
            console2.log("attestor :", attestors[i], exec.verdictAttestors(attestors[i]));
            require(exec.verdictAttestors(attestors[i]), "attestor not registered");
        }
        require(exec.attestorThreshold() == threshold, "threshold not set");
        console2.log("");
        console2.log("Fast rail ON. Attestors sign what the validator IC approved;");
        console2.log("the executor verifies the quorum over the same commitment.");
    }
}
