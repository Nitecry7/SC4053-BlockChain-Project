// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";
import {ViewSpyERC20} from "./mocks/ViewSpyERC20.sol";

contract OrderBookMatchTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _assertChecks() private view {
        assertBookSorted();
        assertSolvent();
    }

    function _assertBalances(address trader, int256 baseDelta, int256 quoteDelta) private view {
        assertEq(int256(base.balanceOf(trader)) - int256(INITIAL_BALANCE), baseDelta, "base delta");
        assertEq(int256(quote.balanceOf(trader)) - int256(INITIAL_BALANCE), quoteDelta, "quote delta");
    }

    function _assertStatus(uint256 orderId, IOrderBook.Status status) private view {
        assertEq(uint8(book.getOrder(orderId).status), uint8(status), "status");
    }

    // Fill shapes

    function test_match_exactMatchBuyTaker() public {
        uint256 ask = _place(alice, SELL, 2e18, 5e18);
        uint256 bid = _place(bob, BUY, 2e18, 5e18);

        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.getOrder(ask).filled, 5e18);
        assertEq(book.getOrder(bid).filled, 5e18);
        assertEq(book.getOrder(bid).lockedQuote, 0);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), 0);
        _assertBalances(alice, -5e18, 10e18);
        _assertBalances(bob, 5e18, -10e18);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_match_exactMatchSellTakerExecutesAtMakerPrice() public {
        uint256 bid = _place(bob, BUY, 3e18, 5e18);
        uint256 ask = _place(alice, SELL, 2e18, 5e18);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(book.lastTradePrice(), 3e18);
        _assertBalances(alice, -5e18, 15e18);
        _assertBalances(bob, 5e18, -15e18);
        _assertChecks();
    }

    function test_match_makerPartlyFilled() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        uint256 bid = _place(bob, BUY, 2e18, 4e18);

        _assertStatus(ask, IOrderBook.Status.PartiallyFilled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.getOrder(ask).filled, 4e18);
        assertEq(book.bookHead(SELL), ask);
        assertEq(book.bookHead(BUY), 0);
        assertEq(base.balanceOf(address(book)), 6e18);
        _assertChecks();
    }

    function test_match_buyMakerPartlyFilledKeepsLockedQuoteFunded() public {
        uint256 bid = _place(bob, BUY, 2e18, 10e18);
        uint256 ask = _place(alice, SELL, 2e18, 4e18);

        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(book.getOrder(bid).lockedQuote, 12e18);
        assertEq(quote.balanceOf(address(book)), 12e18);
        _assertBalances(alice, -4e18, 8e18);
        _assertBalances(bob, 4e18, -20e18);
        _assertChecks();
    }

    function test_match_takerPartlyFilledRestsRemainder() public {
        uint256 ask = _place(alice, SELL, 2e18, 4e18);
        uint256 bid = _place(bob, BUY, 2e18, 10e18);

        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(bid).filled, 4e18);
        assertEq(book.getOrder(bid).lockedQuote, 12e18);
        assertEq(book.bookHead(BUY), bid);
        assertEq(book.bookHead(SELL), 0);
        _assertChecks();
    }

    function test_match_sellTakerPartlyFilledRestsRemainder() public {
        uint256 bid = _place(bob, BUY, 2e18, 4e18);
        uint256 ask = _place(alice, SELL, 2e18, 10e18);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.PartiallyFilled);
        assertEq(book.bookHead(SELL), ask);
        assertEq(base.balanceOf(address(book)), 6e18);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_match_partlyFilledMakerFilledAgain() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        _place(bob, BUY, 2e18, 4e18);

        uint256 bid = _place(carol, BUY, 3e18, 10e18);

        assertEq(book.getOrder(ask).filled, 10e18);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(book.getOrder(bid).filled, 6e18);
        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(bid).lockedQuote, 12e18);
        _assertBalances(alice, -10e18, 20e18);
        _assertBalances(carol, 6e18, -24e18);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 12e18);
        _assertChecks();
    }

    function test_match_stopsWhenTakerExactlyFilled() public {
        uint256 first = _place(alice, SELL, 2e18, 1e18);
        uint256 second = _place(carol, SELL, 3e18, 1e18);

        vm.recordLogs();
        _place(bob, BUY, 3e18, 1e18);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 trades = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(book) && logs[i].topics[0] == IOrderBook.Trade.selector) trades++;
        }
        assertEq(trades, 1);
        assertEq(book.lastTradePrice(), 2e18);
        _assertStatus(first, IOrderBook.Status.Filled);
        _assertStatus(second, IOrderBook.Status.Open);
        assertEq(book.getOrder(second).filled, 0);
        _assertChecks();
    }

    /// @dev Costs far above uint256 / price still settle: requiredQuote accepted this order, so the fill must too.
    function test_match_settlesWhenQtyTimesPriceExceedsUint256() public {
        uint256 hugeAmount = 1e40;
        uint256 hugePrice = 1e40;
        base.mint(alice, hugeAmount);
        quote.mint(bob, book.requiredQuote(hugeAmount, hugePrice));

        uint256 bid = _place(bob, BUY, hugePrice, hugeAmount);
        uint256 ask = _place(alice, SELL, hugePrice, hugeAmount);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(quote.balanceOf(alice), INITIAL_BALANCE + 1e62);
        assertEq(base.balanceOf(bob), INITIAL_BALANCE + hugeAmount);
        _assertChecks();
    }

    // Price improvement

    function test_match_buyerRefundedPriceImprovementWhenFilled() public {
        _place(alice, SELL, 2e18, 4e18);
        uint256 bid = _place(bob, BUY, 3e18, 4e18);

        assertEq(book.getOrder(bid).lockedQuote, 0);
        _assertBalances(bob, 4e18, -8e18);
        _assertBalances(alice, -4e18, 8e18);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_match_buyerRefundedPriceImprovementWithRemainderResting() public {
        _place(alice, SELL, 2e18, 4e18);
        uint256 bid = _place(bob, BUY, 3e18, 10e18);

        assertEq(book.getOrder(bid).lockedQuote, 18e18);
        assertEq(quote.balanceOf(address(book)), 18e18);
        _assertBalances(bob, 4e18, -26e18);
        _assertChecks();
    }

    // SPEC.md worked example

    function test_match_specWorkedExample() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        assertEq(base.balanceOf(address(book)), 10e18);

        uint256 bid = _place(bob, BUY, 2.2e18, 4e18);

        _assertBalances(bob, 4e18, -8e18);
        _assertBalances(alice, -10e18, 8e18);
        assertEq(base.balanceOf(bob), INITIAL_BALANCE + 4e18);
        assertEq(quote.balanceOf(bob), INITIAL_BALANCE - 8e18);
        assertEq(base.balanceOf(alice), INITIAL_BALANCE - 10e18);
        assertEq(quote.balanceOf(alice), INITIAL_BALANCE + 8e18);
        assertEq(base.balanceOf(address(book)), 6e18);
        assertEq(quote.balanceOf(address(book)), 0);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(ask).filled, 4e18);
        assertEq(book.getOrder(bid).lockedQuote, 0);
        _assertChecks();
    }

    // Crossing boundary

    function test_match_nonCrossingOrdersRest() public {
        uint256 ask = _place(alice, SELL, 3e18, 1e18);
        uint256 bid = _place(bob, BUY, 2e18, 1e18);

        _assertStatus(ask, IOrderBook.Status.Open);
        _assertStatus(bid, IOrderBook.Status.Open);
        assertEq(book.bookHead(SELL), ask);
        assertEq(book.bookHead(BUY), bid);
        assertFalse(book.hasTradePrice());
        assertEq(book.lastTradePrice(), 0);
        _assertChecks();
    }

    function test_match_oneTickBelowDoesNotCross() public {
        _place(alice, SELL, 2e18, 1e18);
        uint256 bid = _place(bob, BUY, 2e18 - 1e9, 1e18);

        _assertStatus(bid, IOrderBook.Status.Open);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    function test_match_sweepsLevelsBestFirstAtEachMakerPrice() public {
        uint256 cheap = _place(alice, SELL, 2e18, 1e18);
        uint256 dear = _place(carol, SELL, 3e18, 1e18);

        uint256 bid = _place(bob, BUY, 4e18, 2e18);

        _assertStatus(cheap, IOrderBook.Status.Filled);
        _assertStatus(dear, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.bookHead(SELL), 0);
        _assertBalances(alice, -1e18, 2e18);
        _assertBalances(carol, -1e18, 3e18);
        _assertBalances(bob, 2e18, -5e18);
        assertEq(book.lastTradePrice(), 3e18);
        _assertChecks();
    }

    function test_match_capLeavesRemainderRestingCrossed() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i <= cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }

        uint256 bid = _place(bob, BUY, 2e18, (cap + 1) * 1e18);

        assertEq(book.getOrder(bid).filled, cap * 1e18);
        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        assertEq(book.bookHead(BUY), bid);
        assertTrue(book.bookHead(SELL) != 0);
        assertEq(book.getBook(SELL, cap + 1).length, 1);
        _assertChecks();
    }

    /// @dev SPEC section 8 limitation (O4): on a crossed book the taker matches the opposite head, even though an older,
    /// better-priced order rests on the taker's own side.
    function test_match_crossedBookNewTakerFillsOppositeHeadAheadOfOlderOrder() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 olderAsk;
        for (uint256 i = 0; i <= cap; i++) {
            olderAsk = _place(alice, SELL, 2e18, 1e18);
        }
        uint256 crossedBid = _place(bob, BUY, 3e18, (cap + 1) * 1e18);
        (, uint256 bestBid) = book.getBestBid();
        (, uint256 bestAsk) = book.getBestAsk();
        assertGt(bestBid, bestAsk, "book should be crossed");

        uint256 newAsk = _place(carol, SELL, 2.5e18, 1e18);

        _assertStatus(newAsk, IOrderBook.Status.Filled);
        _assertBalances(carol, -1e18, 3e18);
        assertEq(book.lastTradePrice(), 3e18);
        _assertStatus(crossedBid, IOrderBook.Status.Filled);
        _assertStatus(olderAsk, IOrderBook.Status.Open);
        assertEq(book.getOrder(olderAsk).filled, 0);
        assertEq(book.bookHead(SELL), olderAsk);
        _assertChecks();
    }

    // Phase 3b: sweeps

    function test_sweep_buyTakerAcrossLevelsPartlyFillsLastMaker() public {
        uint256 first = _place(alice, SELL, 2e18, 1e18);
        uint256 second = _place(carol, SELL, 3e18, 2e18);
        uint256 last = _place(alice, SELL, 4e18, 5e18);

        uint256 bid = _place(bob, BUY, 5e18, 5e18);

        _assertStatus(first, IOrderBook.Status.Filled);
        _assertStatus(second, IOrderBook.Status.Filled);
        _assertStatus(last, IOrderBook.Status.PartiallyFilled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.getOrder(last).filled, 2e18);
        assertEq(book.bookHead(SELL), last);
        assertEq(book.lastTradePrice(), 4e18);
        _assertBalances(bob, 5e18, -16e18);
        _assertBalances(alice, -6e18, 10e18);
        _assertBalances(carol, -2e18, 6e18);
        assertEq(base.balanceOf(address(book)), 3e18);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_sweep_sellTakerAcrossLevelsPartlyFillsLastMaker() public {
        uint256 first = _place(bob, BUY, 4e18, 1e18);
        uint256 second = _place(carol, BUY, 3e18, 2e18);
        uint256 last = _place(bob, BUY, 2e18, 5e18);

        uint256 ask = _place(alice, SELL, 1e18, 5e18);

        _assertStatus(first, IOrderBook.Status.Filled);
        _assertStatus(second, IOrderBook.Status.Filled);
        _assertStatus(last, IOrderBook.Status.PartiallyFilled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        assertEq(book.getOrder(last).filled, 2e18);
        assertEq(book.getOrder(last).lockedQuote, 6e18);
        assertEq(book.bookHead(BUY), last);
        assertEq(book.lastTradePrice(), 2e18);
        _assertBalances(alice, -5e18, 14e18);
        _assertBalances(bob, 3e18, -14e18);
        _assertBalances(carol, 2e18, -6e18);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 6e18);
        _assertChecks();
    }

    // Phase 3b: FIFO at equal price

    function _assertFifo(IOrderBook.Side makerSide) private {
        IOrderBook.Side takerSide = makerSide == BUY ? SELL : BUY;
        uint256 first = _place(alice, makerSide, 2e18, 1e18);
        uint256 second = _place(carol, makerSide, 2e18, 1e18);
        uint256 third = _place(alice, makerSide, 2e18, 1e18);

        _place(bob, takerSide, 2e18, 1e18);
        _assertStatus(first, IOrderBook.Status.Filled);
        assertEq(book.getOrder(second).filled, 0);
        assertEq(book.getOrder(third).filled, 0);
        assertEq(book.bookHead(makerSide), second);
        _assertChecks();

        _place(bob, takerSide, 2e18, 0.5e18);
        _assertStatus(second, IOrderBook.Status.PartiallyFilled);
        assertEq(book.bookHead(makerSide), second, "partly filled maker keeps its place");
        assertEq(book.getOrder(third).filled, 0);
        _assertChecks();

        _place(bob, takerSide, 2e18, 1e18);
        _assertStatus(second, IOrderBook.Status.Filled);
        _assertStatus(third, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(third).filled, 0.5e18);
        assertEq(book.bookHead(makerSide), third);
        _assertChecks();
    }

    function test_fifo_askMakersFillInEntryOrder() public {
        _assertFifo(SELL);
    }

    function test_fifo_bidMakersFillInEntryOrder() public {
        _assertFifo(BUY);
    }

    // Phase 3b: crossing boundary

    function test_match_sellOneTickAboveBidDoesNotCross() public {
        uint256 bid = _place(bob, BUY, 2e18, 1e18);
        uint256 ask = _place(alice, SELL, 2e18 + 1e9, 1e18);

        _assertStatus(bid, IOrderBook.Status.Open);
        _assertStatus(ask, IOrderBook.Status.Open);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    // Phase 3b: the cap

    function test_cap_exactlyMaxFillsFillsTakerWithNoRemainder() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i < cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }

        uint256 bid = _place(bob, BUY, 2e18, cap * 1e18);

        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), 0);
        assertEq(book.getOrder(bid).lockedQuote, 0);
        _assertChecks();
    }

    function test_cap_oneMoreMakerLeavesFundedCrossedTakerThatLaterOrdersDoNotClear() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 lastAsk;
        for (uint256 i = 0; i <= cap; i++) {
            lastAsk = _place(alice, SELL, 2e18, 1e18);
        }

        uint256 bid = _place(bob, BUY, 3e18, (cap + 1) * 1e18);

        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(bid).filled, cap * 1e18);
        assertEq(book.getOrder(bid).lockedQuote, 3e18);
        assertEq(quote.balanceOf(address(book)), 3e18);
        assertEq(int256(quote.balanceOf(bob)) - int256(INITIAL_BALANCE), -int256(cap * 2e18 + 3e18));
        assertEq(book.bookHead(BUY), bid);
        assertEq(book.bookHead(SELL), lastAsk);
        _assertChecks();

        _place(carol, BUY, 1e18, 1e18);
        _place(carol, SELL, 5e18, 1e18);

        assertEq(book.bookHead(BUY), bid);
        assertEq(book.bookHead(SELL), lastAsk);
        assertEq(book.getOrder(bid).filled, cap * 1e18);
        assertEq(book.getOrder(lastAsk).filled, 0);
        _assertChecks();
    }

    /// @dev Bids taken in ascending price order always insert at the head, so no scan limit applies while building.
    function _placeRisingBids(uint256 count) private {
        for (uint256 i = 0; i < count; i++) {
            _place(bob, BUY, (i + 3) * 1e18, 1e18);
        }
    }

    function test_cap_remainderHittingBookTooDeepRevertsFillsToo() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 scan = book.MAX_INSERT_SCAN();
        _placeRisingBids(scan + 1 + cap);
        uint256 ask = _place(alice, SELL, 2e18, (cap + 1) * 1e18);
        assertEq(book.getOrder(ask).filled, cap * 1e18);
        assertEq(book.bookHead(SELL), ask);

        uint256 nextId = book.nextOrderId();
        uint256 carolBase = base.balanceOf(carol);
        uint256 carolQuote = quote.balanceOf(carol);
        uint256 lastPrice = book.lastTradePrice();

        vm.expectRevert(IOrderBook.BookTooDeep.selector);
        _place(carol, BUY, 2e18, 2e18);

        assertEq(book.getOrder(ask).filled, cap * 1e18, "fill rolled back");
        assertEq(book.nextOrderId(), nextId);
        assertEq(base.balanceOf(carol), carolBase);
        assertEq(quote.balanceOf(carol), carolQuote);
        assertEq(book.lastTradePrice(), lastPrice);
        _assertChecks();

        // The reverted call did cross: the same price with no remainder fills the ask.
        uint256 filler = _place(carol, BUY, 2e18, 1e18);
        _assertStatus(filler, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertChecks();
    }

    // Phase 3b: self-trade

    function test_selfTrade_partialFillNetsCorrectly() public {
        uint256 ask = _place(alice, SELL, 2e18, 3e18);
        uint256 bid = _place(alice, BUY, 3e18, 1e18);

        _assertStatus(ask, IOrderBook.Status.PartiallyFilled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertBalances(alice, -2e18, 0);
        assertEq(base.balanceOf(address(book)), 2e18);
        assertEq(quote.balanceOf(address(book)), 0);
        assertEq(book.lastTradePrice(), 2e18);
        _assertChecks();
    }

    function test_selfTrade_fullFillReturnsEverything() public {
        uint256 ask = _place(alice, SELL, 2e18, 3e18);
        uint256 bid = _place(alice, BUY, 3e18, 3e18);

        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertBalances(alice, 0, 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    // Phase 3b: random sequences

    function testFuzz_randomPlacementsKeepSolvencyAndBookOrder(uint256 seed) public {
        address[3] memory traders = [alice, bob, carol];
        for (uint256 i = 0; i < 30; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            IOrderBook.Side side = r % 2 == 0 ? BUY : SELL;
            address trader = traders[(r >> 8) % 3];
            uint256 price = (((r >> 16) % 20) + 1) * 1e17 + ((r >> 32) % 1_000) * 1e9;
            uint256 amount = (((r >> 48) % 50) + 1) * 1e17 + ((r >> 64) % 1_000) * 1e9;

            _place(trader, side, price, amount);

            _assertChecks();
        }
    }

    /// @dev Small orders rest on separate price bands, so equal-price queues build up. Occasional large orders cross
    /// the whole book, which is what reaches the fill cap and leaves crossed books.
    function _coarsePlacement(uint256 seed, uint256 i)
        private
        view
        returns (address trader, IOrderBook.Side side, uint256 price, uint256 amount)
    {
        uint256 r = uint256(keccak256(abi.encode(seed, i)));
        address[3] memory traders = [alice, bob, carol];
        trader = traders[(r >> 8) % 3];
        side = r % 2 == 0 ? BUY : SELL;
        if ((r >> 32) % 12 == 0) {
            price = side == BUY ? 6e18 : 1e18;
            amount = 100e18;
        } else {
            price = (((r >> 16) % 3) + (side == BUY ? 1 : 4)) * 1e18;
            amount = (((r >> 48) % 3) + 1) * 1e17;
        }
    }

    /// forge-config: default.fuzz.runs = 25
    /// forge-config: deep.fuzz.runs = 200
    function testFuzz_coarsePlacementsKeepSolvencyAndBookOrder(uint256 seed) public {
        for (uint256 i = 0; i < 80; i++) {
            (address trader, IOrderBook.Side side, uint256 price, uint256 amount) = _coarsePlacement(seed, i);

            _place(trader, side, price, amount);

            _assertChecks();
        }
    }

    // Phase 3b: gas measurements for SPEC O2. Run with --gas-report and --isolate

    function test_gas_fullCapSweepWithRefunds() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i < cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }

        _place(bob, BUY, 3e18, cap * 1e18);

        assertEq(book.bookHead(SELL), 0);
        _assertChecks();
    }

    function test_gas_insertAtMaxScanDepth() public {
        _placeRisingBids(book.MAX_INSERT_SCAN());

        uint256 bid = _place(carol, BUY, 1e18, 1e18);

        assertEq(book.bookNext(bid), 0);
        assertEq(book.getBook(BUY, type(uint256).max).length, book.MAX_INSERT_SCAN() + 1);
        _assertChecks();
    }

    /// @dev The worst placement built so far, not a proven upper bound: a full cap of fills with a refund on each, and
    /// fresh makers and a fresh taker so balances go from zero to nonzero, then a rest behind MAX_INSERT_SCAN
    /// equal-price bids, which also reads bookSeq at every step. Equal-price bids go first, since they cannot be
    /// inserted behind a deep book. Capped sells then leave asks resting below them, which crosses the book.
    function test_gas_worstCasePlacement() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 scan = book.MAX_INSERT_SCAN();
        for (uint256 i = 0; i < scan; i++) {
            _place(bob, BUY, 3e18, 1e18);
        }
        for (uint256 i = 0; i < (cap + 1) * cap; i++) {
            _place(bob, BUY, (i + 4) * 1e18, 1e18);
        }

        for (uint256 i = 0; i <= cap; i++) {
            address maker = makeAddr(string.concat("maker", vm.toString(i)));
            base.mint(maker, (cap + 1) * 1e18);
            vm.startPrank(maker);
            base.approve(address(book), type(uint256).max);
            book.placeLimitOrder(SELL, 2e18, (cap + 1) * 1e18);
            quote.transfer(carol, quote.balanceOf(maker));
            vm.stopPrank();
        }
        assertEq(book.getBook(BUY, type(uint256).max).length, scan);

        address taker = makeAddr("taker");
        quote.mint(taker, INITIAL_BALANCE);
        vm.startPrank(taker);
        quote.approve(address(book), type(uint256).max);
        uint256 bid = book.placeLimitOrder(BUY, 3e18, (cap + 1) * 1e18);
        vm.stopPrank();

        assertEq(book.getOrder(bid).filled, cap * 1e18);
        assertEq(book.bookNext(bid), 0);
        assertEq(book.lastTradePrice(), 2e18);
        _assertChecks();
    }

    // Trade price and events

    function test_match_updatesLastTradePrice() public {
        assertFalse(book.hasTradePrice());

        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 3e18, 1e18);
        assertTrue(book.hasTradePrice());
        assertEq(book.lastTradePrice(), 2e18);

        _place(carol, BUY, 5e18, 1e18);
        assertEq(book.lastTradePrice(), 2e18);

        _place(alice, SELL, 4e18, 1e18);
        assertEq(book.lastTradePrice(), 5e18);
        _assertChecks();
    }

    function test_match_emitsTradeWithMakerFields() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);

        vm.expectEmit(address(book));
        emit IOrderBook.Trade(ask, ask + 1, alice, bob, 2e18, 4e18, 8e18);
        _place(bob, BUY, 2.2e18, 4e18);
        _assertChecks();
    }

    function test_match_emitsTradeWithBuyMakerAndSellTaker() public {
        uint256 bid = _place(bob, BUY, 3e18, 4e18);

        vm.expectEmit(address(book));
        emit IOrderBook.Trade(bid, bid + 1, bob, alice, 3e18, 4e18, 12e18);
        _place(alice, SELL, 2e18, 4e18);
        _assertChecks();
    }

    function test_match_emitsOrderPlacedBeforeTrade() public {
        _place(alice, SELL, 2e18, 1e18);

        vm.recordLogs();
        _place(bob, BUY, 2e18, 1e18);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 placedAt = type(uint256).max;
        uint256 tradeAt = type(uint256).max;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(book)) continue;
            if (logs[i].topics[0] == IOrderBook.OrderPlaced.selector) placedAt = i;
            if (logs[i].topics[0] == IOrderBook.Trade.selector) tradeAt = i;
        }
        assertLt(placedAt, tradeAt);
        assertLt(tradeAt, logs.length);
        _assertChecks();
    }
}

/// @dev Pins what views show during a fill's payout (SPEC section 5). The guard hides this ordering from writes.
contract OrderBookPayoutViewsTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function test_payout_viewsShowFillSettledAndRemainderNotYetRested() public {
        ViewSpyERC20 spy = new ViewSpyERC20("Spy", "SPY");
        base = spy;
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);
        _fund(bob);

        vm.prank(alice);
        uint256 ask = book.placeLimitOrder(SELL, 2e18, 1e18);

        spy.arm(book, ask, ask + 1);
        vm.prank(bob);
        uint256 bid = book.placeLimitOrder(BUY, 2e18, 5e18);

        (
            bool taken,
            bool hasTradePrice,
            uint256 lastTradePrice,
            IOrderBook.Status makerStatus,
            uint256 makerFilled,
            IOrderBook.Status takerStatus,
            uint256 sellHead,
            uint256 buyHead
        ) = spy.snapshot();

        assertTrue(taken);
        assertTrue(hasTradePrice);
        assertEq(lastTradePrice, 2e18);
        assertEq(uint8(makerStatus), uint8(IOrderBook.Status.Filled));
        assertEq(makerFilled, 1e18);
        assertEq(sellHead, 0, "filled maker unlinked before the payout");

        assertEq(uint8(takerStatus), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(buyHead, 0, "remainder rests only after all fills");
        assertEq(book.bookHead(BUY), bid);
        assertBookSorted();
        assertSolvent();
    }

    function test_payout_tradeEmittedBeforeTransfers() public {
        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 1e18);

        vm.recordLogs();
        vm.prank(bob);
        book.placeLimitOrder(BUY, 2e18, 1e18);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 tradeAt = type(uint256).max;
        uint256 payoutAt = type(uint256).max;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(book) && logs[i].topics[0] == IOrderBook.Trade.selector) tradeAt = i;
            if (logs[i].emitter == address(base) && payoutAt == type(uint256).max) payoutAt = i;
        }
        assertLt(tradeAt, payoutAt);
        assertLt(payoutAt, logs.length);
        assertBookSorted();
        assertSolvent();
    }
}

contract OrderBookReentrancyTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    ReentrantERC20 private evil;

    /// @dev The malicious token takes the base role or the quote role, so both pulls and both payouts are reachable.
    function _deployWithEvil(bool evilIsBase) private {
        evil = new ReentrantERC20("Evil", "EVIL");
        if (evilIsBase) {
            base = evil;
        } else {
            quote = evil;
        }
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);
        _fund(bob);
    }

    function _placePayload() private pure returns (bytes memory) {
        return abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 2e18, 1e18));
    }

    function _cancelPayload() private pure returns (bytes memory) {
        return abi.encodeCall(IOrderBook.cancelOrder, (1));
    }

    function _assertReentryBlocked(bytes memory payload, address trader, IOrderBook.Side side) private {
        uint256 nextIdBefore = book.nextOrderId();
        uint256 baseBefore = base.balanceOf(trader);
        uint256 quoteBefore = quote.balanceOf(trader);

        evil.arm(address(book), payload);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(trader);
        book.placeLimitOrder(side, 2e18, 1e18);

        evil.arm(address(0), "");
        assertEq(book.nextOrderId(), nextIdBefore);
        assertEq(base.balanceOf(trader), baseBefore);
        assertEq(quote.balanceOf(trader), quoteBefore);
        assertBookSorted();
        assertSolvent();
    }

    function test_reentrancy_duringEscrowPullOfBase() public {
        _deployWithEvil(true);
        _assertReentryBlocked(_placePayload(), alice, SELL);
        _assertReentryBlocked(_cancelPayload(), alice, SELL);
    }

    function test_reentrancy_duringEscrowPullOfQuote() public {
        _deployWithEvil(false);
        _assertReentryBlocked(_placePayload(), bob, BUY);
        _assertReentryBlocked(_cancelPayload(), bob, BUY);
    }

    /// @dev The pull uses a good token, so the first balance change of the evil token is the fill's payout.
    function test_reentrancy_duringBasePayout() public {
        _deployWithEvil(true);
        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 2e18);

        _assertReentryBlocked(_placePayload(), bob, BUY);
        _assertReentryBlocked(_cancelPayload(), bob, BUY);
    }

    function test_reentrancy_duringQuotePayout() public {
        _deployWithEvil(false);
        vm.prank(bob);
        book.placeLimitOrder(BUY, 2e18, 2e18);

        _assertReentryBlocked(_placePayload(), alice, SELL);
        _assertReentryBlocked(_cancelPayload(), alice, SELL);
    }
}
