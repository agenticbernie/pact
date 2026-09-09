// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CardStatus, Card} from "../src/PactTypes.sol";
import {PactErrors} from "../src/PactErrors.sol";
import {PactReasons} from "../src/PactTypes.sol";
import {IPactCardController} from "../src/IPactCardController.sol";
import {IPactCreditPool} from "../src/IPactCreditPool.sol";
import {IMerchantSimulator} from "../src/IMerchantSimulator.sol";

contract PactTypesTest is Test {
    function test_StatusOrder() public pure {
        assertTrue(uint8(CardStatus.Issued) == 0);
        assertTrue(uint8(CardStatus.Active) == 1);
        assertTrue(uint8(CardStatus.Suspended) == 2);
        assertTrue(uint8(CardStatus.Closed) == 3);
    }

    function test_CardStructLayout() public pure {
        Card memory card;
        card.owner = address(1);
        card.agent = address(2);
        card.asset = address(0);
        card.ownerConfiguredCap = 1000;
        card.verifiedCredit = 800;
        card.verifiedCreditExpiry = 200;
        card.spent = 0;
        card.perTransactionLimit = 100;
        card.expiresAt = 300;
        card.status = CardStatus.Active;
        card.policyVersion = 1;
        assertTrue(card.spent == 0);
    }

    function test_ErrorSelectorsExist() public pure {
        assertTrue(PactErrors.UnauthorizedCaller.selector != bytes4(0));
        assertTrue(PactErrors.InvalidCardStatus.selector != bytes4(0));
        assertTrue(PactErrors.InvalidAmount.selector != bytes4(0));
        assertTrue(PactErrors.InvalidAsset.selector != bytes4(0));
        assertTrue(PactErrors.MerchantNotAllowed.selector != bytes4(0));
        assertTrue(PactErrors.CreditExceeded.selector != bytes4(0));
        assertTrue(PactErrors.CardExpired.selector != bytes4(0));
        assertTrue(PactErrors.PaymentDeadlineExpired.selector != bytes4(0));
        assertTrue(PactErrors.NonceAlreadyUsed.selector != bytes4(0));
        assertTrue(PactErrors.PoolBalanceLow.selector != bytes4(0));
        assertTrue(PactErrors.MerchantInactive.selector != bytes4(0));
        assertTrue(PactErrors.EvidenceAlreadyApplied.selector != bytes4(0));
        assertTrue(PactErrors.InvalidPolicy.selector != bytes4(0));
        assertTrue(PactErrors.UnknownAgent.selector != bytes4(0));
        assertTrue(PactErrors.AuthorityAlreadySet.selector != bytes4(0));
        assertTrue(PactErrors.RenounceDisabled.selector != bytes4(0));
    }

    function test_ReasonCodesDistinct() public pure {
        bytes32[12] memory codes = [
            PactReasons.OK,
            PactReasons.INACTIVE_CARD,
            PactReasons.WRONG_CALLER,
            PactReasons.MERCHANT_BLOCKED,
            PactReasons.WRONG_ASSET,
            PactReasons.ZERO_AMOUNT,
            PactReasons.OVER_TX_LIMIT,
            PactReasons.CREDIT_EXCEEDED,
            PactReasons.CARD_EXPIRED,
            PactReasons.DEADLINE_EXPIRED,
            PactReasons.POOL_LOW,
            PactReasons.NONCE_USED
        ];
        for (uint256 i = 0; i < codes.length; i++) {
            assertTrue(codes[i] != bytes32(0));
            for (uint256 j = i + 1; j < codes.length; j++) {
                assertTrue(codes[i] != codes[j]);
            }
        }
    }

    function test_InterfacesCompile() public {
        IPactCardController controller = IPactCardController(address(1));
        IPactCreditPool pool = IPactCreditPool(address(2));
        IMerchantSimulator merchant = IMerchantSimulator(address(3));
        assertTrue(address(controller) == address(1));
        assertTrue(address(pool) == address(2));
        assertTrue(address(merchant) == address(3));
    }
}
