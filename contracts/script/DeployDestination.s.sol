// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Destination chains: Arbitrum Sepolia (421614) or Base Sepolia (84532). Deploys MockUSDC.
/// forge script script/DeployDestination.s.sol --rpc-url arbitrum_sepolia --broadcast
/// forge script script/DeployDestination.s.sol --rpc-url base_sepolia --broadcast
contract DeployDestination is Script {
    function run() external returns (MockUSDC usdc) {
        require(block.chainid == 421614 || block.chainid == 84532, "DeployDestination: wrong chain");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        usdc = new MockUSDC();
        vm.stopBroadcast();
        console2.log("MockUSDC chain", block.chainid, ":", address(usdc));
    }
}
