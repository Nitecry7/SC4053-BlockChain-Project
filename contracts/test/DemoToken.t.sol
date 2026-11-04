// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {DemoToken} from "../src/DemoToken.sol";

contract DemoTokenTest is Test {
    uint256 internal constant SUPPLY = 1_000_000e18;

    address internal holder = makeAddr("holder");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    DemoToken internal token;

    function setUp() public {
        token = new DemoToken("Demo Token", "DEMO", SUPPLY, holder);
    }

    function test_metadata() public view {
        assertEq(token.name(), "Demo Token");
        assertEq(token.symbol(), "DEMO");
        assertEq(token.decimals(), 18);
    }

    function test_constructor_mintsWholeSupplyToHolder() public view {
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(holder), SUPPLY);
    }

    function test_constructor_emitsMintTransfer() public {
        vm.expectEmit(true, true, false, true);
        emit IERC20.Transfer(address(0), holder, SUPPLY);
        new DemoToken("Demo Token", "DEMO", SUPPLY, holder);
    }

    function test_constructor_revertsWhenHolderIsZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        new DemoToken("Demo Token", "DEMO", SUPPLY, address(0));
    }

    function test_transfer_movesBalance() public {
        vm.prank(holder);
        assertTrue(token.transfer(alice, 5e18));
        assertEq(token.balanceOf(alice), 5e18);
        assertEq(token.balanceOf(holder), SUPPLY - 5e18);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1));
        vm.prank(alice);
        token.transfer(bob, 1);
    }

    function test_approveAndTransferFrom() public {
        vm.prank(holder);
        assertTrue(token.approve(alice, 10e18));
        assertEq(token.allowance(holder, alice), 10e18);

        vm.prank(alice);
        assertTrue(token.transferFrom(holder, bob, 4e18));
        assertEq(token.balanceOf(bob), 4e18);
        assertEq(token.allowance(holder, alice), 6e18);
    }

    function test_transferFrom_revertsWithoutAllowance() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, alice, 0, 1));
        vm.prank(alice);
        token.transferFrom(holder, bob, 1);
    }

    /// @dev There is no mint or burn entry point. The calls fail because the token has no such selector and no
    /// fallback, and the supply is unchanged afterwards.
    function test_noMintOrBurnEntryPoint() public {
        (bool mintOk,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", alice, 1));
        (bool burnOk,) = address(token).call(abi.encodeWithSignature("burn(uint256)", 1));
        assertFalse(mintOk);
        assertFalse(burnOk);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_hasNoOwner() public {
        (bool ok,) = address(token).call(abi.encodeWithSignature("owner()"));
        assertFalse(ok);
    }

    function testFuzz_supplyIsFixedAcrossTransfers(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        vm.prank(holder);
        token.transfer(alice, amount);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(holder) + token.balanceOf(alice), SUPPLY);
    }
}
