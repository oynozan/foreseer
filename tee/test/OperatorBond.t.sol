// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Test } from "forge-std/Test.sol";
import { OperatorBond } from "../contracts/OperatorBond.sol";

contract OperatorBondTest is Test {
    OperatorBond bondc;
    address governance = address(0x60);
    address treasury = address(0x7EA);
    address op = address(0xA11CE);

    function setUp() public {
        bondc = new OperatorBond(governance, treasury, 10 ether, 7 days);
        vm.deal(op, 100 ether);
    }

    function test_BondAndMinimum() public {
        vm.prank(op);
        vm.expectRevert("bond below minimum");
        bondc.bond{ value: 1 ether }();

        vm.prank(op);
        bondc.bond{ value: 10 ether }();
        assertTrue(bondc.isBonded(op));

        vm.prank(op);
        bondc.bond{ value: 5 ether }();
        (uint256 amount, , ) = bondc.bonds(op);
        assertEq(amount, 15 ether);
    }

    function test_WithdrawDelayEnforced() public {
        vm.startPrank(op);
        bondc.bond{ value: 20 ether }();
        bondc.requestWithdraw(8 ether);
        assertFalse(bondc.isBonded(op) == false);
        vm.expectRevert("withdrawal still locked");
        bondc.withdraw();
        vm.warp(block.timestamp + 7 days);
        uint256 before = op.balance;
        bondc.withdraw();
        assertEq(op.balance, before + 8 ether);
        vm.expectRevert("nothing pending");
        bondc.withdraw();
        vm.stopPrank();
    }

    function test_WithdrawBelowMinimumUnbonds() public {
        vm.startPrank(op);
        bondc.bond{ value: 12 ether }();
        bondc.requestWithdraw(5 ether);
        vm.stopPrank();
        assertFalse(bondc.isBonded(op));
    }

    function test_OnlyOnePendingWithdrawal() public {
        vm.startPrank(op);
        bondc.bond{ value: 20 ether }();
        bondc.requestWithdraw(1 ether);
        vm.expectRevert("withdrawal already pending");
        bondc.requestWithdraw(1 ether);
        vm.stopPrank();
    }

    function test_SlashActiveAndPending() public {
        vm.startPrank(op);
        bondc.bond{ value: 20 ether }();
        bondc.requestWithdraw(6 ether);
        vm.stopPrank();

        vm.prank(governance);
        bondc.slash(op, 10 ether, "double sign");
        assertEq(treasury.balance, 10 ether);
        (uint256 amount, uint256 pending, ) = bondc.bonds(op);
        assertEq(pending, 0);
        assertEq(amount, 10 ether);

        vm.warp(block.timestamp + 7 days);
        vm.prank(op);
        vm.expectRevert("nothing pending");
        bondc.withdraw();
    }

    function test_SlashOnlyGovernance() public {
        vm.prank(op);
        bondc.bond{ value: 10 ether }();
        vm.prank(op);
        vm.expectRevert("only governance");
        bondc.slash(op, 1 ether, "nope");
        vm.prank(governance);
        vm.expectRevert("amount exceeds bond");
        bondc.slash(op, 11 ether, "too much");
    }

    function test_GovernanceHandover() public {
        vm.prank(governance);
        bondc.setGovernance(address(0x61));
        vm.prank(governance);
        vm.expectRevert("only governance");
        bondc.setParameters(1, 1);
        vm.prank(address(0x61));
        bondc.setParameters(1 ether, 1 days);
        assertEq(bondc.minimumBond(), 1 ether);
    }
}
