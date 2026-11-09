// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PactBatchDispatcher
/// @notice Destination-chain helper for the Economy Route (docs/pact_docs.md §1.3): lets the Relayer
///         pay many merchants in ONE transaction to amortize gas.
/// @dev Stateless and holds no funds. It only moves the CALLER's own tokens (via allowance), so it
///      grants no one any power over anyone else's balance.
contract PactBatchDispatcher {
    using SafeERC20 for IERC20;

    error LengthMismatch();
    error EmptyBatch();

    event BatchTransfer(bytes32 indexed intentId, address indexed receiver, uint256 amount);
    event BatchDispatched(address indexed relayer, address indexed token, uint256 count, uint256 total);

    /// @param token      ERC-20 to pay out (destination-chain USDC).
    /// @param intentIds  Pact intent ids, emitted for off-chain traceability.
    /// @param receivers  Merchant addresses.
    /// @param amounts    Exact amounts (token atomic units) per receiver.
    function batchTransfer(
        address token,
        bytes32[] calldata intentIds,
        address[] calldata receivers,
        uint256[] calldata amounts
    ) external {
        uint256 n = receivers.length;
        if (n == 0) revert EmptyBatch();
        if (intentIds.length != n || amounts.length != n) revert LengthMismatch();

        IERC20 t = IERC20(token);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            t.safeTransferFrom(msg.sender, receivers[i], amounts[i]);
            total += amounts[i];
            emit BatchTransfer(intentIds[i], receivers[i], amounts[i]);
        }
        emit BatchDispatched(msg.sender, token, n, total);
    }
}
