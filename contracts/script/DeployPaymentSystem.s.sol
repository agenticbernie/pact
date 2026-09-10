// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactErrors} from "../src/PactErrors.sol";

/// @notice Local-first deployment: merchant → pool → controller, one-time
/// wiring, merchant registration, pool funding, and a triangle assertion.
/// Chain guard aborts on known mainnets before any broadcast. No default
/// broadcast target: callers pass an explicit --rpc-url (local Anvil in
/// Phase 02; testnet use belongs to Phase 07 with lane approval).
contract DeployPaymentSystem is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address recipient = vm.envAddress("MERCHANT_RECIPIENT");
        bytes32 merchantId = vm.envBytes32("MERCHANT_ID");
        uint256 fundWei = vm.envUint("POOL_FUND_WEI");
        vm.startBroadcast(key);
        address operator = vm.addr(key);
        (, PactCreditPool pool,) = deployAll(recipient, merchantId, operator);
        vm.stopBroadcast();
        // Separate broadcast transaction so both simulation and chain execute
        // the funding call with the key holder as sender (nested calls inside
        // a broadcast block otherwise run with the script as sender).
        vm.broadcast(key);
        pool.fundPool{value: fundWei}();
    }

    function deployAll(address recipient, bytes32 merchantId, address owner)
        public
        returns (MerchantSimulator merchant, PactCreditPool pool, PactCardController controller)
    {
        if (_isMainnet(block.chainid)) {
            revert PactErrors.InvalidPolicy();
        }
        if (recipient == address(0) || merchantId == bytes32(0) || owner == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
        merchant.registerMerchant(merchantId, payable(recipient));
        merchant.transferOwnership(owner);
        pool.transferOwnership(owner);
        controller.transferOwnership(owner);
        require(
            merchant.pool() == address(pool) && pool.controller() == address(controller)
                && address(pool.merchant()) == address(merchant) && address(controller.pool()) == address(pool)
                && address(controller.merchant()) == address(merchant),
            "wiring triangle"
        );
    }

    function _isMainnet(uint256 chainId) internal pure returns (bool) {
        return chainId == 1 || chainId == 10 || chainId == 56 || chainId == 100 || chainId == 137 || chainId == 250
            || chainId == 8453 || chainId == 42161 || chainId == 43114 || chainId == 59144 || chainId == 534352;
    }
}
