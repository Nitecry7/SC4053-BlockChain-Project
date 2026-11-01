// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";

/// @dev Shared setup for every OrderBook test: tokens, book, and three funded traders.
/// The book is a harness, so that assertBookSorted can read the internal links in every phase.
abstract contract OrderBookBase is Test {
    uint256 internal constant INITIAL_BALANCE = 1_000_000e18;
    uint256 private constant MAX_BOOK_WALK = 1_000;

    MockERC20 internal base;
    MockERC20 internal quote;
    OrderBookHarness internal book;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public virtual {
        base = new MockERC20("Base", "BASE", 18);
        quote = new MockERC20("Quote", "QUOTE", 18);
        book = new OrderBookHarness(address(base), address(quote));

        _fund(alice);
        _fund(bob);
        _fund(carol);
    }

    /// @dev Walks both lists and checks the links, the side of each order, and strict priority order.
    function assertBookSorted() internal view {
        _assertSideSorted(IOrderBook.Side.Buy);
        _assertSideSorted(IOrderBook.Side.Sell);
    }

    function _assertSideSorted(IOrderBook.Side side) private view {
        uint256 prev = 0;
        uint256 current = book.bookHead(side);
        uint256 steps = 0;

        while (current != 0) {
            assertLt(steps, MAX_BOOK_WALK, "book walk did not end: cycle in list");
            steps++;

            IOrderBook.Order memory order = book.readOrder(current);
            assertEq(uint8(order.side), uint8(side), "order on the wrong side");
            assertEq(book.bookPrev(current), prev, "prev link does not match the walk");

            if (prev != 0) {
                uint256 prevPrice = book.readOrder(prev).price;
                if (prevPrice == order.price) {
                    assertLt(book.bookSeq(prev), book.bookSeq(current), "equal price not in bookSeq order");
                } else if (side == IOrderBook.Side.Buy) {
                    assertGt(prevPrice, order.price, "bids not descending");
                } else {
                    assertLt(prevPrice, order.price, "asks not ascending");
                }
            }

            prev = current;
            current = book.bookNext(current);
        }
    }

    function _fund(address trader) private {
        base.mint(trader, INITIAL_BALANCE);
        quote.mint(trader, INITIAL_BALANCE);
        vm.startPrank(trader);
        base.approve(address(book), type(uint256).max);
        quote.approve(address(book), type(uint256).max);
        vm.stopPrank();
    }
}

/// @dev Has no decimals() function and no fallback.
contract NoDecimalsToken {}

contract OrderBookConstructorTest is OrderBookBase {
    function test_setUp_storesTokensAndConstants() public view {
        assertEq(book.baseToken(), address(base));
        assertEq(book.quoteToken(), address(quote));
        assertEq(book.PRICE_SCALE(), 1e18);
        assertEq(book.LOT_SIZE(), 1e9);
        assertEq(book.TICK_SIZE(), 1e9);
        assertEq(book.MAX_MATCHES_PER_TX(), 10);
        assertEq(book.MAX_INSERT_SCAN(), 100);
    }

    function test_setUp_fundsAndApprovesTraders() public view {
        address[3] memory traders = [alice, bob, carol];
        for (uint256 i = 0; i < traders.length; i++) {
            assertEq(base.balanceOf(traders[i]), INITIAL_BALANCE);
            assertEq(quote.balanceOf(traders[i]), INITIAL_BALANCE);
            assertEq(base.allowance(traders[i], address(book)), type(uint256).max);
            assertEq(quote.allowance(traders[i], address(book)), type(uint256).max);
        }
    }

    function test_constructor_revertsWhenBaseNot18Decimals() public {
        MockERC20 sixDecimals = new MockERC20("Six", "SIX", 6);
        vm.expectRevert(IOrderBook.UnsupportedDecimals.selector);
        new OrderBook(address(sixDecimals), address(quote));
    }

    function test_constructor_revertsWhenQuoteNot18Decimals() public {
        MockERC20 sixDecimals = new MockERC20("Six", "SIX", 6);
        vm.expectRevert(IOrderBook.UnsupportedDecimals.selector);
        new OrderBook(address(base), address(sixDecimals));
    }

    function test_constructor_emptyRevertWhenTokenHasNoDecimals() public {
        address noDecimals = address(new NoDecimalsToken());
        vm.expectRevert(bytes(""));
        new OrderBook(noDecimals, address(quote));
    }

    function test_constructor_revertsWhenSameToken() public {
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        new OrderBook(address(base), address(base));
    }

    function test_constructor_revertsWhenBaseIsZeroAddress() public {
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        new OrderBook(address(0), address(quote));
    }

    function test_constructor_revertsWhenQuoteIsZeroAddress() public {
        vm.expectRevert(IOrderBook.InvalidTokens.selector);
        new OrderBook(address(base), address(0));
    }
}
