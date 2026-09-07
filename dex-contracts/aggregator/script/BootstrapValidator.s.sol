// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { AgentExecutor } from "../src/AgentExecutor.sol";

// ============================================================================
//  BootstrapValidator.s.sol
//
//  The second half of deployment, and the step that turns the executor on.
//
//  WHY IT IS SEPARATE
//  ------------------
//  The two contracts each need the other's address:
//
//      AgentValidator's constructor takes  agent_executor
//      AgentExecutor's verdict gate needs  genLayerValidator
//
//  Something has to go first, and it is the executor - which is why
//  `genLayerValidator` is set by a transaction rather than in the constructor.
//  Between the two deployments the executor is live but inert: `recordVerdict`
//  reverts with ValidatorNotSet, so no trade can settle. That window is safe by
//  construction, and closing it is this script's whole job.
//
//  USAGE
//  -----
//      AGENT_EXECUTOR=0x...  GENLAYER_VALIDATOR=0x...  \
//      forge script script/BootstrapValidator.s.sol \
//        --rpc-url https://rpc-bradbury.genlayer.com --broadcast
//
//  Run it again to ROTATE the validator after redeploying the IC. Rotating does
//  not invalidate verdicts already recorded, so drain or revoke anything
//  outstanding first if the old IC is being retired for cause.
// ============================================================================

contract BootstrapValidator is Script {
    function run() external {
        uint256 pk        = vm.envUint("PRIVATE_KEY");
        address executor  = vm.envAddress("AGENT_EXECUTOR");
        address validator = vm.envAddress("GENLAYER_VALIDATOR");

        require(executor  != address(0), "AGENT_EXECUTOR not set");
        require(validator != address(0), "GENLAYER_VALIDATOR not set");

        AgentExecutor exec = AgentExecutor(payable(executor));

        address previous = exec.genLayerValidator();
        console2.log("executor        :", executor);
        console2.log("current validator:", previous);
        console2.log("new validator   :", validator);

        vm.startBroadcast(pk);
        exec.setGenLayerValidator(validator);
        vm.stopBroadcast();

        require(exec.genLayerValidator() == validator, "validator not set");
        console2.log("");
        console2.log("Verdicts are now accepted from the AgentValidator IC only.");
        console2.log("Confirm end to end: run a validate_swap round, wait for it to");
        console2.log("FINALIZE, then check isVerdictLive(commitment) on the executor.");
    }
}
