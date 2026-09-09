// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {PactErrors} from "./PactErrors.sol";
import {IPactCreditPool} from "./IPactCreditPool.sol";
import {IMerchantSimulator} from "./IMerchantSimulator.sol";

/// @notice Holds native testnet CTC and settles registered merchants when told
/// to by the card controller. No receive/fallback: untracked direct deposits
/// revert, so `availableBalance` always equals explicitly funded value.
contract PactCreditPool is IPactCreditPool, Ownable, ReentrancyGuard {
    using Address for address payable;

    address public controller;
    IMerchantSimulator public immutable merchant;

    constructor(address merchant_) Ownable(msg.sender) {
        if (merchant_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        merchant = IMerchantSimulator(merchant_);
    }

    function renounceOwnership() public override onlyOwner {
        revert PactErrors.RenounceDisabled();
    }

    function setController(address controller_) external onlyOwner {
        if (controller != address(0)) {
            revert PactErrors.AuthorityAlreadySet();
        }
        if (controller_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        controller = controller_;
    }

    function fundPool() external payable onlyOwner {
        if (msg.value == 0) {
            revert PactErrors.InvalidAmount();
        }
        emit PoolFunded(msg.sender, msg.value);
    }

    function settleNative(bytes32 merchantId, uint256 amount) external nonReentrant {
        if (msg.sender != controller) {
            revert PactErrors.UnauthorizedCaller();
        }
        if (amount == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (address(this).balance < amount) {
            revert PactErrors.PoolBalanceLow();
        }
        merchant.receivePayment{value: amount}(merchantId);
    }

    /// @notice Testnet administration only: recover funds to an explicit address.
    /// Never part of the payment path.
    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        if (address(this).balance < amount) {
            revert PactErrors.PoolBalanceLow();
        }
        to.sendValue(amount);
        emit PoolWithdrawn(to, amount);
    }

    function availableBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
