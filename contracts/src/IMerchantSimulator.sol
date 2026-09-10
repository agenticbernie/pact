// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMerchantSimulator {
    event MerchantRegistered(bytes32 indexed merchantId, address recipient);
    event MerchantPaymentReceived(bytes32 indexed merchantId, uint256 amount, uint256 totalReceived);

    function registerMerchant(bytes32 merchantId, address payable recipient) external;

    function setMerchantActive(bytes32 merchantId, bool active) external;

    function setPool(address pool) external;

    function receivePayment(bytes32 merchantId) external payable;

    function isMerchantActive(bytes32 merchantId) external view returns (bool);
}
