// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6); // 1M USDC initial pool for relayer
    }

    function decimals() public pure override returns (uint8) {
        return 6; // Mandatory: Real USDC uses 6 decimals
    }

    function faucet() external {
        _mint(msg.sender, 500 * 10**6); // 500 test USDC per tap
    }
}
