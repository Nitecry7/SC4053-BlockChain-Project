// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";
import {ViewSpyERC20} from "./mocks/ViewSpyERC20.sol";

/// @dev Phase 7 regression suite: one test per engine issue in docs/ai-audit/issues/ (001 to 006), named after it.
/// Each reproduces the original failure scenario and asserts the fixed behaviour. Some issues also have their
/// original regression tests in the phase suites; these stand on their own so the report can cite one file.
contract OrderBookRegressionTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _assertStatus(uint256 orderId, IOrderBook.Status status) private view {
        assertEq(uint8(book.getOrder(orderId).status), uint8(status), "status");
    }

    /// @dev Issue 001: unlinking an order that is not in the book used to set that side's head to 0, hiding every
    /// resting order. Now it reverts and leaves the side intact. Uses real placed orders, not harness-written ones.
    function test_issue001_unlinkOfOrderNotInBookRevertsAndKeepsTheSide() public {
        uint256 best = _place(bob, BUY, 2e18, 1e18);
        uint256 worst = _place(bob, BUY, 1e18, 1e18);
        uint256 filled = _place(carol, BUY, 3e18, 1e18);
        _place(alice, SELL, 3e18, 1e18); // fills `filled`, which leaves the book
        _assertStatus(filled, IOrderBook.Status.Filled);

        vm.expectRevert(IOrderBook.OrderNotActive.selector);
        book.exposedUnlink(filled);

        assertEq(book.bookHead(BUY), best, "the side was not emptied");
        assertEq(book.bookNext(best), worst);
        assertEq(book.getBook(BUY, 10).length, 2);
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Issue 002 (documentation): placement pays out during matching, before a partly filled taker rests. SPEC
    /// section 5 documents what views show during a payout; this pins it. The filled maker is already out of the book,
    /// the taker is PartiallyFilled but not yet resting.
    function test_issue002_viewsDuringAPayoutMatchTheDocumentedDeviation() public {
        ViewSpyERC20 spy = new ViewSpyERC20("Spy", "SPY");
        base = spy;
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);
        _fund(bob);

        uint256 ask = _place(alice, SELL, 2e18, 1e18);
        spy.arm(book, ask, ask + 1);
        uint256 bid = _place(bob, BUY, 2e18, 3e18);

        (
            bool taken,,,
            IOrderBook.Status makerStatus,,
            IOrderBook.Status takerStatus,
            uint256 sellHead,
            uint256 buyHead,
        ) = spy.snapshot();
        assertTrue(taken);
        assertEq(uint8(makerStatus), uint8(IOrderBook.Status.Filled));
        assertEq(sellHead, 0, "filled maker unlinked before the payout");
        assertEq(uint8(takerStatus), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(buyHead, 0, "taker not yet resting during the payout");
        assertEq(book.bookHead(BUY), bid, "rests after all fills");
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Issue 003: a fill where qty * price exceeds uint256 used to panic in settlement although escrow had
    /// accepted the order. Settlement now uses mulDiv like the escrow.
    function test_issue003_fillWhoseQtyTimesPriceExceedsUint256Settles() public {
        uint256 hugeAmount = 1e40;
        uint256 hugePrice = 1e40; // 1e80 > 2^256 ~ 1.16e77
        base.mint(alice, hugeAmount);
        quote.mint(bob, book.requiredQuote(hugeAmount, hugePrice));

        uint256 bid = _place(bob, BUY, hugePrice, hugeAmount);
        uint256 ask = _place(alice, SELL, hugePrice, hugeAmount);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(quote.balanceOf(alice), INITIAL_BALANCE + 1e62);
        assertEq(base.balanceOf(bob), INITIAL_BALANCE + hugeAmount);
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Issue 004: three matching bugs the Phase 3a tests could not see. (a) A maker filled a second time must
    /// use its remaining size; (b) matching stops once the taker is filled, though more liquidity crosses;
    /// (c) Trade reports maker and taker, not seller and buyer.
    function test_issue004_makerFilledTwiceTakerStopsAndTradeFieldsForBuyMaker() public {
        uint256 bigAsk = _place(alice, SELL, 2e18, 3e18);
        _place(bob, BUY, 2e18, 1e18);
        // (a) The second taker is LARGER than the maker's remaining 2. The pre-fix code sized the fill from the maker's
        // full amount (3), overfilling it; the fixed code fills exactly 2 and rests the taker's last 1.
        uint256 second = _place(bob, BUY, 2e18, 3e18);
        _assertStatus(bigAsk, IOrderBook.Status.Filled);
        assertEq(book.getOrder(bigAsk).filled, 3e18, "maker overfilled");
        _assertStatus(second, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(second).filled, 2e18, "second fill used the maker's full size, not its remainder");
        vm.prank(bob);
        book.cancelOrder(second); // clear the resting remainder before (b)

        _place(alice, SELL, 2e18, 1e18);
        uint256 moreLiquidity = _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // (b) filled by the first ask only
        assertEq(book.getOrder(moreLiquidity).filled, 0, "matching continued after the taker was filled");
        _assertStatus(moreLiquidity, IOrderBook.Status.Open);

        uint256 bidMaker = _place(carol, BUY, 1.5e18, 1e18);
        vm.expectEmit(address(book));
        // (c) maker = the resting buy (carol), taker = the incoming sell (alice)
        emit IOrderBook.Trade(bidMaker, bidMaker + 1, carol, alice, 1.5e18, 1e18, 1.5e18);
        _place(alice, SELL, 1.5e18, 1e18);
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Issue 005: from address(0), cancelling an unknown ID used to revert with the wrong error, and cancelling
    /// ID 0 on an empty side used to succeed. Both now revert with NotOrderOwner.
    function test_issue005_zeroAddressCannotCancelUnknownOrIdZero() public {
        vm.startPrank(address(0));
        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        book.cancelOrder(99);
        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        book.cancelOrder(0);
        vm.stopPrank();
        assertEq(uint8(book.getOrder(0).status), uint8(IOrderBook.Status.Open), "order 0 untouched (zero value)");
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Issue 006: a self-owned lowest-trigger buy stop plus MAX_INSERT_SCAN + 1 dust bids used to make every
    /// triggerStopOrders call revert with BookTooDeep, blocking all stops on both sides. Now the unplaceable stop is
    /// cancelled and refunded and the honest stop activates in the same call.
    function test_issue006_unplaceableStopNoLongerBlocksTriggers() public {
        address mallory = makeAddr("mallory");
        _fund(mallory);
        _place(alice, SELL, 1e18, 1e18);
        _place(bob, BUY, 1e18, 1e18); // last trade 1
        vm.prank(mallory);
        uint256 blocker = book.placeStopLimitOrder(BUY, 1e9, 1e9, 1e9);
        for (uint256 i = 0; i <= book.MAX_INSERT_SCAN(); i++) {
            _place(mallory, BUY, 1e9, 1e9);
        }
        vm.prank(carol);
        uint256 honest = book.placeStopLimitOrder(SELL, 1e18, 0.9e18, 2e18);

        vm.prank(bob);
        assertEq(book.triggerStopOrders(10), 2, "no revert; both activated");

        _assertStatus(blocker, IOrderBook.Status.Cancelled);
        _assertStatus(honest, IOrderBook.Status.Open);
        assertEq(book.stopHead(BUY), 0);
        assertBookSorted();
        assertSolvent();
    }
}

/// @dev The brief's full journey (section 5.1 feature list) on the deployed stack: issue ERC20s, list a market,
/// submit limit orders, automatic execution with a partial fill, cancel the remainder (Bonus 1), batched multi-party
/// matching (Bonus 2) and a conditional stop-limit order (Bonus 3). Every balance is exact.
contract BriefJourneyRegressionTest is Test {
    TokenFactory private tokenFactory;
    MarketFactory private marketFactory;
    IERC20 private ntu;
    IERC20 private sgdx;
    OrderBook private book;

    address private issuer = makeAddr("issuer");
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private carol = makeAddr("carol");
    address private dave = makeAddr("dave");
    address private keeper = makeAddr("keeper");

    function _fund(address who) private {
        vm.startPrank(issuer);
        ntu.transfer(who, 1_000e18);
        sgdx.transfer(who, 1_000e18);
        vm.stopPrank();
        vm.startPrank(who);
        ntu.approve(address(book), type(uint256).max);
        sgdx.approve(address(book), type(uint256).max);
        vm.stopPrank();
    }

    function _place(address who, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256 id) {
        vm.prank(who);
        id = book.placeLimitOrder(side, price, amount);
    }

    function test_briefJourney_issueListTradePartialCancelBatchStop() public {
        // Asset issuer: two ERC20 tokens through the TokenFactory; listing through the MarketFactory.
        tokenFactory = new TokenFactory();
        marketFactory = new MarketFactory();
        vm.startPrank(issuer);
        ntu = IERC20(tokenFactory.createToken("NTU Token", "NTU", 1_000_000e18));
        sgdx = IERC20(tokenFactory.createToken("Singapore Dollar X", "SGDx", 1_000_000e18));
        book = OrderBook(marketFactory.createMarket(address(ntu), address(sgdx)));
        vm.stopPrank();
        _fund(alice);
        _fund(bob);
        _fund(carol);
        _fund(dave);

        // Limit orders, automatic execution, partial fill: Alice sells 100 at 2, Bob buys 40.
        uint256 ask = _place(alice, IOrderBook.Side.Sell, 2e18, 100e18);
        _place(bob, IOrderBook.Side.Buy, 2e18, 40e18);
        assertEq(uint8(book.getOrder(ask).status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(sgdx.balanceOf(alice), 1_080e18);
        assertEq(ntu.balanceOf(bob), 1_040e18);

        // Bonus 1: Alice cancels the unfilled 60 and gets exactly 60 back.
        vm.prank(alice);
        book.cancelOrder(ask);
        assertEq(ntu.balanceOf(alice), 960e18);

        // Bonus 2: batched multi-party matching. Carol and Dave post 11 asks of 1 at 2; Bob and Alice each bid 11
        // (Bob at 3, Alice at 2.5) and hit the cap; one keeper matchOrders settles all four.
        for (uint256 i = 0; i < 11; i++) {
            _place(carol, IOrderBook.Side.Sell, 2e18, 1e18);
            _place(dave, IOrderBook.Side.Sell, 2e18, 1e18);
        }
        _place(bob, IOrderBook.Side.Buy, 3e18, 11e18);
        _place(alice, IOrderBook.Side.Buy, 2.5e18, 11e18);
        vm.prank(keeper);
        assertEq(book.matchOrders(10), 2);
        assertEq(ntu.balanceOf(carol), 989e18);
        assertEq(sgdx.balanceOf(carol), 1_022e18);
        assertEq(ntu.balanceOf(dave), 989e18);
        assertEq(sgdx.balanceOf(dave), 1_022e18);
        assertEq(ntu.balanceOf(bob), 1_051e18);
        assertEq(sgdx.balanceOf(bob), 1_000e18 - 80e18 - 22e18);
        assertEq(ntu.balanceOf(alice), 971e18);
        assertEq(sgdx.balanceOf(alice), 1_080e18 - 22e18);

        // Bonus 3: conditional order. Dave's sell stop (trigger 1.8, limit 1.7) activates after a trade at 1.8 and
        // sells into Carol's bid at 1.75.
        vm.prank(dave);
        uint256 stop = book.placeStopLimitOrder(IOrderBook.Side.Sell, 1.8e18, 1.7e18, 5e18);
        _place(carol, IOrderBook.Side.Buy, 1.75e18, 5e18);
        _place(carol, IOrderBook.Side.Buy, 1.8e18, 1e18);
        _place(bob, IOrderBook.Side.Sell, 1.8e18, 1e18);
        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 1);
        assertEq(uint8(book.getOrder(stop).status), uint8(IOrderBook.Status.Filled));
        assertEq(sgdx.balanceOf(dave), 1_022e18 + 8.75e18);

        // The book holds nothing it does not owe, and the keeper never gained or paid anything.
        assertEq(ntu.balanceOf(address(book)), 0);
        assertEq(sgdx.balanceOf(address(book)), 0);
        assertEq(ntu.balanceOf(keeper), 0);
        assertEq(sgdx.balanceOf(keeper), 0);
    }
}
