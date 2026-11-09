// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PactEscrow} from "../src/PactEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Avalanche Fuji (43113): deploys PactEscrow + MockUSDC.
/// forge script script/DeployFuji.s.sol --rpc-url avalanche_fuji --broadcast
contract DeployFuji is Script {
    function run() external returns (PactEscrow escrow, MockUSDC usdc) {
        require(block.chainid == 43113, "DeployFuji: wrong chain (expected 43113)");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        escrow = new PactEscrow();
        usdc = new MockUSDC();
        vm.stopBroadcast();
        console2.log("PactEscrow (Fuji):", address(escrow));
        console2.log("MockUSDC   (Fuji):", address(usdc));
    }
}
