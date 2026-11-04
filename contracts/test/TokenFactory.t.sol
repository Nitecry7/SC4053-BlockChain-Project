// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

contract TokenFactoryTest is Test {
    TokenFactory internal factory;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new TokenFactory();
    }

    function _create(address creator, string memory name, string memory symbol, uint256 supply)
        internal
        returns (address token)
    {
        vm.prank(creator);
        token = factory.createToken(name, symbol, supply);
    }

    // ---------------------------------------------------------------- createToken

    function test_createToken_mintsWholeSupplyToCaller() public {
        DemoToken token = DemoToken(_create(alice, "Alpha", "ALP", 1000e18));

        assertEq(token.name(), "Alpha");
        assertEq(token.symbol(), "ALP");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1000e18);
        assertEq(token.balanceOf(alice), 1000e18);
        assertEq(token.balanceOf(address(factory)), 0, "the factory must never hold tokens");
    }

    function test_createToken_emitsTokenCreated() public {
        address predicted = vm.computeCreateAddress(address(factory), 1);

        vm.expectEmit(true, true, false, true, address(factory));
        emit TokenFactory.TokenCreated(predicted, alice, "Alpha", "ALP", 1000e18);
        address token = _create(alice, "Alpha", "ALP", 1000e18);

        assertEq(token, predicted);
    }

    function test_createToken_revertsEmptyName() public {
        vm.expectRevert(TokenFactory.EmptyName.selector);
        _create(alice, "", "ALP", 1e18);
    }

    function test_createToken_revertsEmptySymbol() public {
        vm.expectRevert(TokenFactory.EmptySymbol.selector);
        _create(alice, "Alpha", "", 1e18);
    }

    function test_createToken_revertsZeroSupply() public {
        vm.expectRevert(TokenFactory.ZeroSupply.selector);
        _create(alice, "Alpha", "ALP", 0);
    }

    function test_createToken_revertsSupplyTooLarge() public {
        uint256 max = factory.MAX_SUPPLY();
        vm.expectRevert(TokenFactory.SupplyTooLarge.selector);
        _create(alice, "Alpha", "ALP", max + 1);
    }

    function test_createToken_acceptsExactlyMaxSupplyAndOneWei() public {
        uint256 max = factory.MAX_SUPPLY();
        assertEq(max, 1e27);
        assertEq(DemoToken(_create(alice, "Max", "MAX", max)).totalSupply(), max);
        assertEq(DemoToken(_create(alice, "One", "ONE", 1)).totalSupply(), 1);
    }

    function test_createToken_validationOrder() public {
        // Name is checked first, then symbol, then supply.
        vm.expectRevert(TokenFactory.EmptyName.selector);
        _create(alice, "", "", 0);
        vm.expectRevert(TokenFactory.EmptySymbol.selector);
        _create(alice, "Alpha", "", 0);
    }

    function test_createToken_sameNameAndSymbolGiveDistinctTokens() public {
        address first = _create(alice, "Alpha", "ALP", 1e18);
        address second = _create(bob, "Alpha", "ALP", 1e18);
        assertTrue(first != second);
        assertEq(factory.tokenCount(), 2);
    }

    function testFuzz_createToken_supplyInBounds(uint256 supply) public {
        supply = bound(supply, 1, factory.MAX_SUPPLY());
        DemoToken token = DemoToken(_create(alice, "Alpha", "ALP", supply));
        assertEq(token.totalSupply(), supply);
        assertEq(token.balanceOf(alice), supply);
    }

    function testFuzz_createToken_supplyAboveMaxReverts(uint256 supply) public {
        supply = bound(supply, factory.MAX_SUPPLY() + 1, type(uint256).max);
        vm.expectRevert(TokenFactory.SupplyTooLarge.selector);
        _create(alice, "Alpha", "ALP", supply);
    }

    // ------------------------------------------------------------------- registry

    function test_registry_startsEmpty() public view {
        assertEq(factory.tokenCount(), 0);
        assertEq(factory.getTokens(0, 10).length, 0);
        assertFalse(factory.isFactoryToken(address(0)));
    }

    function test_registry_recordsTokensOldestFirst() public {
        address a = _create(alice, "A", "A", 1e18);
        address b = _create(bob, "B", "B", 1e18);
        address c = _create(alice, "C", "C", 1e18);

        assertEq(factory.tokenCount(), 3);
        address[] memory all = factory.getTokens(0, 10);
        assertEq(all.length, 3);
        assertEq(all[0], a);
        assertEq(all[1], b);
        assertEq(all[2], c);
    }

    function test_isFactoryToken_trueOnlyForFactoryTokens() public {
        address made = _create(alice, "A", "A", 1e18);
        DemoToken outsider = new DemoToken("Outsider", "OUT", 1e18, alice);

        assertTrue(factory.isFactoryToken(made));
        assertFalse(factory.isFactoryToken(address(outsider)), "same code, but not issued by this factory");
        assertFalse(factory.isFactoryToken(alice));
        assertFalse(factory.isFactoryToken(address(factory)));
    }

    function test_getTokens_middlePage() public {
        address[] memory made = _createMany(5);
        address[] memory page = factory.getTokens(1, 3);
        assertEq(page.length, 3);
        assertEq(page[0], made[1]);
        assertEq(page[1], made[2]);
        assertEq(page[2], made[3]);
    }

    function test_getTokens_limitZeroReturnsEmpty() public {
        _createMany(3);
        assertEq(factory.getTokens(0, 0).length, 0);
        assertEq(factory.getTokens(2, 0).length, 0);
    }

    function test_getTokens_limitLargerThanRemainingIsTruncated() public {
        address[] memory made = _createMany(3);
        address[] memory page = factory.getTokens(2, 100);
        assertEq(page.length, 1);
        assertEq(page[0], made[2]);
    }

    function test_getTokens_offsetAtOrPastEndReturnsEmpty() public {
        _createMany(3);
        assertEq(factory.getTokens(3, 10).length, 0);
        assertEq(factory.getTokens(4, 10).length, 0);
        assertEq(factory.getTokens(type(uint256).max, type(uint256).max).length, 0);
    }

    function test_getTokens_maxLimitDoesNotOverflow() public {
        address[] memory made = _createMany(3);
        address[] memory page = factory.getTokens(1, type(uint256).max);
        assertEq(page.length, 2);
        assertEq(page[0], made[1]);
        assertEq(page[1], made[2]);
    }

    function testFuzz_getTokens_matchesRegistry(uint8 howMany, uint256 offset, uint256 limit) public {
        uint256 n = bound(howMany, 0, 12);
        address[] memory made = _createMany(n);
        offset = bound(offset, 0, n + 2); // mostly in range, so element comparison runs; past-the-end covered too

        address[] memory page = factory.getTokens(offset, limit);

        uint256 expectedLen = offset >= n ? 0 : (limit < n - offset ? limit : n - offset);
        assertEq(page.length, expectedLen);
        for (uint256 i = 0; i < page.length; i++) {
            assertEq(page[i], made[offset + i]);
        }
    }

    function _createMany(uint256 n) internal returns (address[] memory made) {
        made = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            made[i] = _create(alice, "T", "T", 1e18);
        }
    }
}
