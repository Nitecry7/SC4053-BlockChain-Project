// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Has no decimals() function and no fallback.
contract NoDecimalsStub {}

/// @dev decimals() reverts with custom error data, to check that OrderBook constructor reverts pass through unchanged.
contract RevertingDecimalsToken {
    error Boom(uint256 code);

    function decimals() external pure returns (uint8) {
        revert Boom(42);
    }
}

/// @dev Tries to call createMarket again from inside decimals(). If that nested call could succeed, this token reports
/// 6 decimals, so the outer creation fails with UnsupportedDecimals. If the nested call fails, it reports 18.
contract ReenteringDecimalsToken {
    MarketFactory internal immutable factory;
    address internal immutable other;

    constructor(MarketFactory factory_, address other_) {
        factory = factory_;
        other = other_;
    }

    function decimals() external returns (uint8) {
        (bool reentered,) = address(factory).call(abi.encodeCall(MarketFactory.createMarket, (address(this), other)));
        return reentered ? 6 : 18;
    }
}

contract MarketFactoryTest is Test {
    MarketFactory internal factory;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC20 internal tokenC;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new MarketFactory();
        tokenA = new MockERC20("Token A", "AAA", 18);
        tokenB = new MockERC20("Token B", "BBB", 18);
        tokenC = new MockERC20("Token C", "CCC", 18);
    }

    function _create(address creator, address base, address quote) internal returns (address market) {
        vm.prank(creator);
        market = factory.createMarket(base, quote);
    }

    // ---------------------------------------------------------------- createMarket

    function test_createMarket_deploysOrderBookForThePair() public {
        address market = _create(alice, address(tokenA), address(tokenB));

        assertGt(market.code.length, 0);
        assertEq(OrderBook(market).baseToken(), address(tokenA));
        assertEq(OrderBook(market).quoteToken(), address(tokenB));
    }

    function test_createMarket_emitsMarketCreated() public {
        address predicted = vm.computeCreateAddress(address(factory), 1);

        vm.expectEmit(true, true, true, true, address(factory));
        emit MarketFactory.MarketCreated(predicted, address(tokenA), address(tokenB), alice);
        address market = _create(alice, address(tokenA), address(tokenB));

        assertEq(market, predicted);
    }

    function test_createMarket_isPermissionlessAndRecordsNoOwner() public {
        address first = _create(alice, address(tokenA), address(tokenB));
        address second = _create(bob, address(tokenA), address(tokenC));

        assertTrue(first != second);
        assertTrue(factory.isMarket(first));
        assertTrue(factory.isMarket(second));
        (bool ok,) = address(factory).call(abi.encodeWithSignature("owner()"));
        assertFalse(ok);
    }

    function test_createMarket_factoryHoldsNoTokensAndIsNotTrader() public {
        address market = _create(alice, address(tokenA), address(tokenB));

        assertEq(tokenA.balanceOf(address(factory)), 0);
        assertEq(tokenB.balanceOf(address(factory)), 0);
        assertEq(IOrderBook(market).getUserOrderIds(address(factory)).length, 0);
    }

    function test_createMarket_revertsMarketExistsForExactPair() public {
        address market = _create(alice, address(tokenA), address(tokenB));

        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketExists.selector, market));
        _create(bob, address(tokenA), address(tokenB));

        assertEq(factory.marketCount(), 1);
    }

    function test_createMarket_revertsMarketExistsForReversedPair() public {
        address market = _create(alice, address(tokenA), address(tokenB));

        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketExists.selector, market));
        _create(bob, address(tokenB), address(tokenA));

        assertEq(factory.marketCount(), 1);
    }

    function test_createMarket_firstCreatorFixesOrientation() public {
        address market = _create(alice, address(tokenB), address(tokenA));

        assertEq(OrderBook(market).baseToken(), address(tokenB));
        assertEq(OrderBook(market).quoteToken(), address(tokenA));
    }

    function test_createMarket_distinctPairsCoexist() public {
        address ab = _create(alice, address(tokenA), address(tokenB));
        address ac = _create(alice, address(tokenA), address(tokenC)); // shares a token with the first
        address bc = _create(alice, address(tokenB), address(tokenC));

        assertEq(factory.marketCount(), 3);
        assertEq(factory.getMarket(address(tokenA), address(tokenB)), ab);
        assertEq(factory.getMarket(address(tokenA), address(tokenC)), ac);
        assertEq(factory.getMarket(address(tokenB), address(tokenC)), bc);
    }

    // ----------------------------------------------- OrderBook constructor reverts pass through

    function test_createMarket_revertsUnsupportedDecimals() public {
        MockERC20 sixDecimals = new MockERC20("Six", "SIX", 6);

        vm.expectRevert(IOrderBook.UnsupportedDecimals.selector);
        _create(alice, address(sixDecimals), address(tokenB));
        vm.expectRevert(IOrderBook.UnsupportedDecimals.selector);
        _create(alice, address(tokenA), address(sixDecimals));

        _assertNothingRegistered(address(sixDecimals), address(tokenB));
    }

    function test_createMarket_revertsInvalidTokens() public {
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        _create(alice, address(tokenA), address(tokenA));
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        _create(alice, address(0), address(tokenB));
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        _create(alice, address(tokenA), address(0));

        assertEq(factory.marketCount(), 0);
    }

    function test_createMarket_emptyRevertWhenTokenHasNoDecimals() public {
        address noDecimals = address(new NoDecimalsStub());

        vm.expectRevert(bytes(""));
        _create(alice, noDecimals, address(tokenB));

        _assertNothingRegistered(noDecimals, address(tokenB));
    }

    function test_createMarket_customRevertDataFromTokenPassesThroughUnchanged() public {
        address reverting = address(new RevertingDecimalsToken());

        vm.expectRevert(abi.encodeWithSelector(RevertingDecimalsToken.Boom.selector, 42));
        _create(alice, reverting, address(tokenB));

        _assertNothingRegistered(reverting, address(tokenB));
    }

    function test_createMarket_failedAttemptsLeaveNoOrphanMarket() public {
        MockERC20 sixDecimals = new MockERC20("Six", "SIX", 6);
        vm.expectRevert(IOrderBook.UnsupportedDecimals.selector);
        _create(alice, address(sixDecimals), address(tokenB));

        // The pair can still be listed correctly later with a valid token.
        address market = _create(alice, address(tokenA), address(tokenB));
        assertEq(factory.marketCount(), 1);
        assertEq(factory.getMarkets(0, 10)[0], market);
    }

    /// @dev The OrderBook constructor reads decimals() through a view interface, which is a STATICCALL, so a token
    /// cannot re-enter createMarket and break the one-market-per-pair rule. If it could, the nested call would
    /// succeed, this token would report 6 decimals, and the outer call would revert with UnsupportedDecimals.
    function test_createMarket_tokenCannotReenterFromDecimals() public {
        ReenteringDecimalsToken evil = new ReenteringDecimalsToken(factory, address(tokenB));

        // Two calls with this calldata: the outer one below, and the token's own nested attempt from decimals().
        vm.expectCall(address(factory), abi.encodeCall(MarketFactory.createMarket, (address(evil), address(tokenB))), 2);
        address market = _create(alice, address(evil), address(tokenB));

        assertEq(factory.marketCount(), 1, "exactly one market");
        assertEq(factory.getMarket(address(evil), address(tokenB)), market);
        assertEq(OrderBook(market).baseToken(), address(evil));
    }

    /// @dev Control for the test above: called normally (not through a STATICCALL), the same token does re-enter
    /// createMarket and succeeds. So the attempt is real, and it is the constructor's STATICCALL that blocks it.
    function test_control_reenteringTokenSucceedsOutsideStaticContext() public {
        ReenteringDecimalsToken evil = new ReenteringDecimalsToken(factory, address(tokenB));

        assertEq(evil.decimals(), 6, "nested createMarket succeeded, so the token reported 6");
        assertTrue(factory.getMarket(address(evil), address(tokenB)) != address(0));
        assertEq(factory.marketCount(), 1);
    }

    // -------------------------------------------------------------------- registry

    function test_registry_startsEmpty() public view {
        assertEq(factory.marketCount(), 0);
        assertEq(factory.getMarkets(0, 10).length, 0);
        assertEq(factory.getMarket(address(tokenA), address(tokenB)), address(0));
        assertFalse(factory.isMarket(address(0)));
    }

    function test_getMarket_isOrderInsensitive() public {
        address market = _create(alice, address(tokenA), address(tokenB));

        assertEq(factory.getMarket(address(tokenA), address(tokenB)), market);
        assertEq(factory.getMarket(address(tokenB), address(tokenA)), market);
        assertEq(factory.getMarket(address(tokenA), address(tokenC)), address(0));
    }

    function test_isMarket_trueOnlyForFactoryMarkets() public {
        address made = _create(alice, address(tokenA), address(tokenB));
        OrderBook outsider = new OrderBook(address(tokenA), address(tokenC));

        assertTrue(factory.isMarket(made));
        assertFalse(factory.isMarket(address(outsider)), "same code, but not created by this factory");
        assertFalse(factory.isMarket(address(tokenA)));
        assertFalse(factory.isMarket(address(factory)));
    }

    function test_getMarkets_recordsOldestFirst() public {
        address[] memory made = _createMany(3);
        address[] memory all = factory.getMarkets(0, 10);

        assertEq(all.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(all[i], made[i]);
        }
    }

    function test_getMarkets_middlePage() public {
        address[] memory made = _createMany(5);
        address[] memory page = factory.getMarkets(1, 3);

        assertEq(page.length, 3);
        assertEq(page[0], made[1]);
        assertEq(page[1], made[2]);
        assertEq(page[2], made[3]);
    }

    function test_getMarkets_limitZeroReturnsEmpty() public {
        _createMany(3);
        assertEq(factory.getMarkets(0, 0).length, 0);
        assertEq(factory.getMarkets(2, 0).length, 0);
    }

    function test_getMarkets_limitLargerThanRemainingIsTruncated() public {
        address[] memory made = _createMany(3);
        address[] memory page = factory.getMarkets(2, 100);

        assertEq(page.length, 1);
        assertEq(page[0], made[2]);
    }

    function test_getMarkets_offsetAtOrPastEndReturnsEmpty() public {
        _createMany(3);
        assertEq(factory.getMarkets(3, 10).length, 0);
        assertEq(factory.getMarkets(4, 10).length, 0);
        assertEq(factory.getMarkets(type(uint256).max, type(uint256).max).length, 0);
    }

    function test_getMarkets_maxLimitDoesNotOverflow() public {
        address[] memory made = _createMany(3);
        address[] memory page = factory.getMarkets(1, type(uint256).max);

        assertEq(page.length, 2);
        assertEq(page[0], made[1]);
        assertEq(page[1], made[2]);
    }

    function testFuzz_getMarkets_matchesRegistry(uint8 howMany, uint256 offset, uint256 limit) public {
        uint256 n = bound(howMany, 0, 8);
        address[] memory made = _createMany(n);
        offset = bound(offset, 0, n + 2); // mostly in range, so element comparison runs; past-the-end covered too

        address[] memory page = factory.getMarkets(offset, limit);

        uint256 expectedLen = offset >= n ? 0 : (limit < n - offset ? limit : n - offset);
        assertEq(page.length, expectedLen);
        for (uint256 i = 0; i < page.length; i++) {
            assertEq(page[i], made[offset + i]);
        }
    }

    /// @dev Creates n markets, each from a fresh token pair, so no pair repeats.
    function _createMany(uint256 n) internal returns (address[] memory made) {
        made = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            MockERC20 base = new MockERC20("Base", "BASE", 18);
            MockERC20 quote = new MockERC20("Quote", "QUOTE", 18);
            made[i] = _create(alice, address(base), address(quote));
        }
    }

    function _assertNothingRegistered(address a, address b) internal view {
        assertEq(factory.marketCount(), 0);
        assertEq(factory.getMarket(a, b), address(0));
        assertEq(factory.getMarkets(0, 10).length, 0);
    }
}
