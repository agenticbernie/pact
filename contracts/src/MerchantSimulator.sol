// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {PactErrors} from "./PactErrors.sol";
import {IMerchantSimulator} from "./IMerchantSimulator.sol";

/// @notice Registered test merchants. Records native settlement per merchant ID
/// and forwards value to the registered recipient. Pool-only entrypoint.
contract MerchantSimulator is IMerchantSimulator, Ownable, ReentrancyGuard {
    using Address for address payable;

    struct Merchant {
        address payable recipient;
        bool active;
        uint256 totalReceived;
    }

    mapping(bytes32 => Merchant) public merchants;
    mapping(bytes32 => bool) private _registered;
    address public pool;

    constructor() Ownable(msg.sender) {}

    function renounceOwnership() public override onlyOwner {
        revert PactErrors.RenounceDisabled();
    }

    function registerMerchant(bytes32 merchantId, address payable recipient) external onlyOwner {
        if (merchantId == bytes32(0) || recipient == address(0) || _registered[merchantId]) {
            revert PactErrors.InvalidPolicy();
        }
        _registered[merchantId] = true;
        merchants[merchantId] = Merchant({recipient: recipient, active: true, totalReceived: 0});
        emit MerchantRegistered(merchantId, recipient);
    }

    function setMerchantActive(bytes32 merchantId, bool active) external onlyOwner {
        if (!_registered[merchantId]) {
            revert PactErrors.InvalidPolicy();
        }
        merchants[merchantId].active = active;
    }

    function setPool(address pool_) external onlyOwner {
        if (pool != address(0)) {
            revert PactErrors.AuthorityAlreadySet();
        }
        if (pool_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        pool = pool_;
    }

    function receivePayment(bytes32 merchantId) external payable nonReentrant {
        if (msg.sender != pool) {
            revert PactErrors.UnauthorizedCaller();
        }
        if (!_registered[merchantId]) {
            revert PactErrors.MerchantNotAllowed();
        }
        Merchant storage record = merchants[merchantId];
        if (!record.active) {
            revert PactErrors.MerchantInactive();
        }
        if (msg.value == 0) {
            revert PactErrors.InvalidAmount();
        }
        record.totalReceived += msg.value;
        record.recipient.sendValue(msg.value);
        emit MerchantPaymentReceived(merchantId, msg.value, record.totalReceived);
    }

    function isMerchantActive(bytes32 merchantId) external view returns (bool) {
        return _registered[merchantId] && merchants[merchantId].active;
    }
}
