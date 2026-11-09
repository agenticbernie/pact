// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PactBatchDispatcher} from "../src/PactBatchDispatcher.sol";

/// @notice Destination chains only (Arbitrum Sepolia 421614 / Base Sepolia 84532).
/// forge script script/DeployBatchDispatcher.s.sol --rpc-url arbitrum_sepolia --broadcast
/// forge script script/DeployBatchDispatcher.s.sol --rpc-url base_sepolia --broadcast
contract DeployBatchDispatcher is Script {
    function run() external returns (PactBatchDispatcher d) {
        require(block.chainid == 421614 || block.chainid == 84532, "DeployBatchDispatcher: wrong chain");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        d = new PactBatchDispatcher();
        vm.stopBroadcast();
        console2.log("PactBatchDispatcher chain", block.chainid, ":", address(d));
    }
}
