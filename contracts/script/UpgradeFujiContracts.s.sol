// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PactEscrow} from "../src/PactEscrow.sol";
import {PactBatchDispatcher} from "../src/PactBatchDispatcher.sol";

/// @notice Avalanche Fuji (43113): deploys upgraded PactEscrow + PactBatchDispatcher
contract UpgradeFujiContracts is Script {
    function run() external returns (PactEscrow escrow, PactBatchDispatcher dispatcher) {
        require(block.chainid == 43113, "UpgradeFujiContracts: wrong chain (expected 43113)");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        escrow = new PactEscrow();
        dispatcher = new PactBatchDispatcher();
        vm.stopBroadcast();
        console2.log("Upgraded PactEscrow (Fuji)        :", address(escrow));
        console2.log("Upgraded PactBatchDispatcher (Fuji):", address(dispatcher));
    }
}
