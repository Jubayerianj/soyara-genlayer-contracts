// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";

/// @notice Deploys ONLY AgentExecutor against the already-deployed aggregator
///         and DEX contracts. Used to ship the multi-agent authorisation change
///         without redeploying the whole stack.
contract DeployExecutorOnly is Script {
    function run() external {
        uint256 pk = vm.envUint("GOV_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address entrypoint = 0x95feE6Cb918Ed9C621E36082EE8D998873031EaA;
        address v2Router   = 0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5;
        address v3PosMgr   = 0x779380011B5F2aB40985D810B5c7641539beD870;

        address[] memory approvedTokens = new address[](6);
        approvedTokens[0] = 0x315374AA9b5536037Cc1Efeea2439CCC0913A77e; // WGEN
        approvedTokens[1] = 0x58B6CD7891cd0A682226E25607b958a6479195A6; // USDC
        approvedTokens[2] = 0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc; // USDT
        approvedTokens[3] = 0x723534bc6C2B536fF5D0455111513A9431c44e25; // WBTC
        approvedTokens[4] = 0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C; // ETH
        approvedTokens[5] = 0xA2eC9aAf2235C66491767e69eBBD885469697B3E; // FSWP

        // Owner and agent should NOT be the same key.
        //
        // The owner can rotate `genLayerValidator`; the agent relays
        // settlements. One key holding both means one key that can install a
        // validator it controls and then settle against its own verdicts. The
        // contract blocks the cheap forms of that (the validator must be a
        // contract, and may not be a registered agent), but role separation is
        // the operator's half of the job. Set EXECUTOR_OWNER to a second key,
        // ideally a multisig; it falls back to the deployer so an existing
        // one-key deploy still works.
        address ownerAddr = vm.envOr("EXECUTOR_OWNER", deployer);
        if (ownerAddr == deployer) {
            console.log("!! EXECUTOR_OWNER unset: owner and agent are the SAME key.");
            console.log("!! Set EXECUTOR_OWNER to separate authorisation from relaying.");
        }

        vm.startBroadcast(pk);
        AgentExecutor exec = new AgentExecutor(
            ownerAddr,  // owner
            deployer,   // primary authorised agent
            entrypoint,
            v2Router,
            v3PosMgr,
            300,        // max slippage bps
            approvedTokens
        );
        // Bootstrap the validator if its address is already known.
        //
        // Usually it is NOT: the AgentValidator Intelligent Contract takes this
        // executor's address as a constructor argument, so the executor has to
        // exist first. That ordering is why `genLayerValidator` cannot be a
        // constructor parameter here, and why it needs a second transaction.
        //
        // Until it is set, `recordVerdict` reverts with ValidatorNotSet and
        // nothing settles. That is the intended state: an executor with no
        // validator fails closed rather than falling back to trusting the agent.
        address validator = vm.envOr("GENLAYER_VALIDATOR", address(0));
        if (validator != address(0)) {
            exec.setGenLayerValidator(validator);
        }
        vm.stopBroadcast();

        console.log("AgentExecutor:", address(exec));
        console.log("owner        :", ownerAddr);
        console.log("agent        :", deployer);
        if (validator != address(0)) {
            console.log("validator IC :", validator);
        } else {
            console.log("");
            console.log("!! genLayerValidator is UNSET - nothing can settle yet.");
            console.log("!! Deploy AgentValidator with agent_executor =", address(exec));
            console.log("!! then run BootstrapValidator.s.sol with GENLAYER_VALIDATOR set.");
        }
    }
}
