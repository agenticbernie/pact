// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPactCreditPool {
    event PoolFunded(address indexed from, uint256 amount);
    event PoolWithdrawn(address indexed to, uint256 amount);

    function fundPool() external payable;

    function settleNative(bytes32 merchantId, uint256 amount) external;

    function withdraw(address payable to, uint256 amount) external;

    function setController(address controller) external;

    function availableBalance() external view returns (uint256);
}
