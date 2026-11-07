// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";
import {ViewSpyERC20} from "./mocks/ViewSpyERC20.sol";

/// @dev Phase 5: matchOrders. A book only becomes crossed when a placement hits MAX_MATCHES_PER_TX while still
/// crossing, so every crossed book here is built that way, as it would be in real use.
contract OrderBookBatchTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    address private keeper = makeAddr("keeper");

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _match(address caller, uint256 maxMatches) private returns (uint256) {
        vm.prank(caller);
        return book.matchOrders(maxMatches);
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

    function _isCrossed() private view returns (bool) {
        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        (uint256 askId, uint256 askPrice) = book.getBestAsk();
        return bidId != 0 && askId != 0 && bidPrice >= askPrice;
    }

    /// @dev `asks` asks of 1 base at `askPrice` from alice, then one bid from bob for all of them at `bidPrice`. The
    /// bid fills the cap and rests crossed against the asks that are left.
    function _crossedByCap(uint256 asks, uint256 askPrice, uint256 bidPrice)
        private
        returns (uint256 firstAsk, uint256 bid)
    {
        for (uint256 i = 0; i < asks; i++) {
            uint256 id = _place(alice, SELL, askPrice, 1e18);
            if (i == 0) firstAsk = id;
        }
        bid = _place(bob, BUY, bidPrice, asks * 1e18);
        assertEq(book.getOrder(bid).filled, book.MAX_MATCHES_PER_TX() * 1e18, "placement hit the cap");
        assertTrue(_isCrossed(), "book left crossed");
    }

    // Clearing a crossed book

    function test_batch_clearsBookLeftCrossedByCapOverSeveralCalls() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        (uint256 firstAsk, uint256 bid) = _crossedByCap(25, 2e18, 2e18);
        _assertChecks();

        assertEq(_match(keeper, cap), cap, "first call fills the cap");
        assertTrue(_isCrossed());
        _assertChecks();

        assertEq(_match(keeper, cap), 5, "second call fills the rest");
        assertFalse(_isCrossed());
        _assertChecks();

        assertEq(_match(keeper, cap), 0, "nothing left to match");

        _assertStatus(bid, IOrderBook.Status.Filled);
        for (uint256 id = firstAsk; id < firstAsk + 25; id++) {
            _assertStatus(id, IOrderBook.Status.Filled);
        }
        assertEq(book.bookHead(BUY), 0);
        assertEq(book.bookHead(SELL), 0);
        _assertBalances(alice, -25e18, 50e18);
        _assertBalances(bob, 25e18, -50e18);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_batch_capRespectedExactly() public {
        (, uint256 bid) = _crossedByCap(25, 2e18, 2e18);
        uint256 cap = book.MAX_MATCHES_PER_TX();

        for (uint256 maxMatches = 1; maxMatches <= 4; maxMatches++) {
            uint256 filledBefore = book.getOrder(bid).filled;
            vm.recordLogs();
            assertEq(_match(keeper, maxMatches), maxMatches);
            assertEq(_countTrades(vm.getRecordedLogs()), maxMatches, "one Trade per fill");
            assertEq(book.getOrder(bid).filled - filledBefore, maxMatches * 1e18, "exactly maxMatches fills");
            _assertChecks();
        }
        // cap fills at placement, then 1 + 2 + 3 + 4 = 10 here, so 5 asks remain crossed.
        assertEq(book.getOrder(bid).filled, (cap + 10) * 1e18);
        assertEq(_match(keeper, cap), 5);
        _assertChecks();
    }

    function test_batch_stopsWhenBookNoLongerCrossed() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i <= cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }
        uint256 higherAsk = _place(carol, SELL, 3e18, 1e18);
        uint256 bid = _place(bob, BUY, 2e18, (cap + 3) * 1e18);
        assertTrue(_isCrossed());

        assertEq(_match(keeper, cap), 1, "only the ask at 2 crosses");

        assertFalse(_isCrossed());
        _assertStatus(bid, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(bid).filled, (cap + 1) * 1e18);
        assertEq(book.getOrder(bid).lockedQuote, 4e18, "2 base still funded at 2");
        assertEq(book.bookHead(BUY), bid);
        assertEq(book.bookHead(SELL), higherAsk);
        _assertChecks();
    }

    // Multi-party batch (brief: "batched execution of multi-party order matching")

    /// @dev Four sellers and four buyers, all settled in ONE matchOrders transaction. Each buyer's placement fills
    /// the cap and rests 1 base crossed, at a different limit price, so each buyer also gets a price-improvement
    /// refund in the batch.
    function test_batch_multiPartySettlesFourBuyersAndFourSellersInOneCall() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        address[4] memory sellers = [makeAddr("seller1"), makeAddr("seller2"), makeAddr("seller3"), makeAddr("seller4")];
        address[4] memory buyers = [makeAddr("buyer1"), makeAddr("buyer2"), makeAddr("buyer3"), makeAddr("buyer4")];
        uint256[4] memory bidPrices = [uint256(3e18), 2.9e18, 2.8e18, 2.7e18];
        for (uint256 i = 0; i < 4; i++) {
            _fund(sellers[i]);
            _fund(buyers[i]);
        }

        uint256 asksPerSeller = cap + 1; // 4 * cap asks feed the capped placements, 4 are left for the batch
        uint256[4] memory lastAsk;
        for (uint256 r = 0; r < asksPerSeller; r++) {
            for (uint256 s = 0; s < 4; s++) {
                lastAsk[s] = _place(sellers[s], SELL, 2e18, 1e18);
            }
        }
        uint256[4] memory bids;
        for (uint256 b = 0; b < 4; b++) {
            bids[b] = _place(buyers[b], BUY, bidPrices[b], (cap + 1) * 1e18);
            _assertStatus(bids[b], IOrderBook.Status.PartiallyFilled);
        }
        assertTrue(_isCrossed());
        _assertChecks();

        int256[4] memory sellerQuoteBefore;
        int256[4] memory buyerBaseBefore;
        int256[4] memory buyerQuoteBefore;
        for (uint256 i = 0; i < 4; i++) {
            sellerQuoteBefore[i] = int256(quote.balanceOf(sellers[i]));
            buyerBaseBefore[i] = int256(base.balanceOf(buyers[i]));
            buyerQuoteBefore[i] = int256(quote.balanceOf(buyers[i]));
        }

        vm.recordLogs();
        assertEq(_match(keeper, cap), 4, "four fills in one transaction");
        assertEq(_countTrades(vm.getRecordedLogs()), 4);

        for (uint256 i = 0; i < 4; i++) {
            _assertStatus(lastAsk[i], IOrderBook.Status.Filled);
            _assertStatus(bids[i], IOrderBook.Status.Filled);
            // In this call: each seller gets 2 quote; each buyer gets 1 base and a refund of (limit - 2) quote.
            assertEq(int256(quote.balanceOf(sellers[i])) - sellerQuoteBefore[i], 2e18, "seller paid in batch");
            assertEq(int256(base.balanceOf(buyers[i])) - buyerBaseBefore[i], 1e18, "buyer base in batch");
            assertEq(
                int256(quote.balanceOf(buyers[i])) - buyerQuoteBefore[i],
                int256(bidPrices[i]) - 2e18,
                "buyer price-improvement refund in batch"
            );
            // Overall: every fill was at the asks' price of 2.
            _assertBalances(sellers[i], -int256(asksPerSeller * 1e18), int256(asksPerSeller * 2e18));
            _assertBalances(buyers[i], int256((cap + 1) * 1e18), -int256((cap + 1) * 2e18));
        }
        assertEq(base.balanceOf(keeper), 0, "caller never funded, never paid");
        assertEq(quote.balanceOf(keeper), 0);
        assertEq(book.bookHead(BUY), 0);
        assertEq(book.bookHead(SELL), 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    // Maker and price follow bookSeq

    function test_batch_olderAskIsMakerAndSetsPrice() public {
        (, uint256 bid) = _crossedByCap(11, 2e18, 3e18);
        (uint256 askId,) = book.getBestAsk();
        uint256 bobQuoteBefore = quote.balanceOf(bob);

        vm.expectEmit(address(book));
        emit IOrderBook.Trade(askId, bid, alice, bob, 2e18, 1e18, 2e18);
        _match(keeper, 1);

        assertEq(book.lastTradePrice(), 2e18);
        assertEq(quote.balanceOf(bob) - bobQuoteBefore, 1e18, "bob refunded the price improvement");
        _assertBalances(alice, -11e18, 22e18);
        _assertBalances(bob, 11e18, -22e18);
        _assertChecks();
    }

    function test_batch_olderBidIsMakerAndSetsPrice() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 lastBid;
        for (uint256 i = 0; i <= cap; i++) {
            lastBid = _place(bob, BUY, 3e18, 1e18);
        }
        uint256 ask = _place(alice, SELL, 2e18, (cap + 1) * 1e18);
        assertTrue(_isCrossed());

        vm.expectEmit(address(book));
        emit IOrderBook.Trade(lastBid, ask, bob, alice, 3e18, 1e18, 3e18);
        assertEq(_match(keeper, 1), 1);

        assertEq(book.lastTradePrice(), 3e18);
        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertBalances(alice, -int256((cap + 1) * 1e18), int256((cap + 1) * 3e18));
        _assertBalances(bob, int256((cap + 1) * 1e18), -int256((cap + 1) * 3e18));
        _assertChecks();
    }

    /// @dev Swaps the two heads' bookSeq through the harness, so the newer order ID has the lower sequence. The maker
    /// must follow bookSeq, not the order ID (SPEC O1).
    function test_batch_makerFollowsBookSeqNotOrderId() public {
        (, uint256 bid) = _crossedByCap(11, 2e18, 3e18);
        (uint256 askId,) = book.getBestAsk();
        assertLt(askId, bid);
        uint256 askSeq = book.bookSeq(askId);
        book.writeBookSeq(askId, book.bookSeq(bid));
        book.writeBookSeq(bid, askSeq);

        vm.expectEmit(address(book));
        emit IOrderBook.Trade(bid, askId, bob, alice, 3e18, 1e18, 3e18);
        _match(keeper, 1);

        assertEq(book.lastTradePrice(), 3e18, "bid is now the maker, so its price applies");
        _assertChecks();
    }

    // Unlinking: both orders are in the book here

    function test_batch_filledTakerInBookIsUnlinked() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i < cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }
        uint256 bigAsk = _place(carol, SELL, 2e18, 5e18);
        uint256 bid = _place(bob, BUY, 2e18, (cap + 2) * 1e18);
        assertTrue(_isCrossed());

        assertEq(_match(keeper, cap), 1);

        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.bookHead(BUY), 0, "filled taker left the book");
        assertEq(book.bookPrev(bid), 0);
        assertEq(book.bookNext(bid), 0);
        _assertStatus(bigAsk, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(bigAsk).filled, 2e18);
        assertEq(book.bookHead(SELL), bigAsk, "partly filled maker keeps its place");
        _assertChecks();
    }

    function test_batch_bothFilledAreBothUnlinked() public {
        (uint256 firstAsk, uint256 bid) = _crossedByCap(11, 2e18, 2e18);
        uint256 lastAsk = firstAsk + 10;

        assertEq(_match(keeper, 1), 1);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(lastAsk, IOrderBook.Status.Filled);
        assertEq(book.bookHead(BUY), 0);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.getBook(BUY, 1).length, 0);
        assertEq(book.getBook(SELL, 1).length, 0);
        _assertChecks();
    }

    // No-op and validation

    function test_batch_noOpOnEmptyBookReturnsZero() public {
        assertEq(_match(keeper, 1), 0);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    function test_batch_noOpWhenOnlyAsks() public {
        _place(alice, SELL, 2e18, 1e18);
        assertEq(_match(keeper, 1), 0);
        _assertChecks();
    }

    /// @dev Review M1: with the bid side non-empty and no asks, an empty ask head reads as order 0 at price 0, which
    /// would look crossed if the empty-side check were missing.
    function test_batch_noOpWhenOnlyBids() public {
        uint256 bid = _place(bob, BUY, 2e18, 1e18);
        assertEq(_match(keeper, book.MAX_MATCHES_PER_TX()), 0);
        _assertStatus(bid, IOrderBook.Status.Open);
        assertEq(book.bookHead(BUY), bid);
        _assertChecks();
    }

    /// @dev Review M1, after a real clear: the asks run out first and bids are left, so the loop must stop on the
    /// empty ask side, not on the cap.
    function test_batch_stopsWhenAsksRunOutWithBidsLeft() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 olderBid = _place(carol, BUY, 1e18, 1e18);
        (, uint256 bid) = _crossedByCap(12, 2e18, 2e18); // 2 asks left crossed against bob's 2-base remainder
        uint256 lowBid = _place(carol, BUY, 1e18, 1e18);

        assertEq(_match(keeper, cap), 2);

        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), olderBid, "non-crossing bids stay");
        assertEq(book.bookNext(olderBid), lowBid);
        _assertChecks();
    }

    /// @dev Review L2: one trader is both sides of the crossing. Net effect of every fill is zero.
    function test_batch_selfTradeAcrossTheCrossingNetsToZero() public {
        for (uint256 i = 0; i < 11; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }
        uint256 bid = _place(alice, BUY, 3e18, 11e18);
        assertTrue(_isCrossed());

        assertEq(_match(keeper, 1), 1);

        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertBalances(alice, 0, 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_batch_noOpWhenNotCrossedChangesNothing() public {
        uint256 bid = _place(bob, BUY, 2e18, 1e18);
        uint256 ask = _place(alice, SELL, 2e18 + 1e9, 1e18);

        vm.recordLogs();
        assertEq(_match(keeper, book.MAX_MATCHES_PER_TX()), 0);
        assertEq(vm.getRecordedLogs().length, 0, "no events, no transfers");

        _assertStatus(bid, IOrderBook.Status.Open);
        _assertStatus(ask, IOrderBook.Status.Open);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    function test_batch_revertsInvalidMaxCountAtZero() public {
        vm.expectRevert(IOrderBook.InvalidMaxCount.selector);
        _match(keeper, 0);
    }

    function test_batch_revertsInvalidMaxCountAboveCap() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        vm.expectRevert(IOrderBook.InvalidMaxCount.selector);
        _match(keeper, cap + 1);
    }

    function test_batch_acceptsMaxCountAtCapAndAtOne() public {
        assertEq(_match(keeper, book.MAX_MATCHES_PER_TX()), 0);
        assertEq(_match(keeper, 1), 0);
    }

    function test_batch_invalidMaxCountCheckedBeforeMatching() public {
        _crossedByCap(11, 2e18, 2e18);
        vm.expectRevert(IOrderBook.InvalidMaxCount.selector);
        _match(keeper, 0);
        assertTrue(_isCrossed(), "nothing matched");
        _assertChecks();
    }

    // Third party

    function test_batch_thirdPartyCallerGainsAndLosesNothing() public {
        _crossedByCap(15, 2e18, 3e18);
        uint256 carolBase = base.balanceOf(carol);
        uint256 carolQuote = quote.balanceOf(carol);

        assertEq(_match(carol, book.MAX_MATCHES_PER_TX()), 5);

        assertEq(base.balanceOf(carol), carolBase);
        assertEq(quote.balanceOf(carol), carolQuote);
        assertEq(book.getUserOrderIds(carol).length, 0, "no order recorded for the caller");
        _assertBalances(alice, -15e18, 30e18);
        _assertBalances(bob, 15e18, -30e18);
        _assertChecks();
    }

    function test_batch_unfundedCallerCanClearTheBook() public {
        _crossedByCap(12, 2e18, 2e18);
        assertEq(base.balanceOf(keeper), 0);
        assertEq(quote.balanceOf(keeper), 0);

        assertEq(_match(keeper, 2), 2);

        assertEq(base.balanceOf(keeper), 0);
        assertEq(quote.balanceOf(keeper), 0);
        assertFalse(_isCrossed());
        _assertChecks();
    }

    // Fuzz: random crossed books are always fully cleared with exact balances

    function testFuzz_batch_clearsAnyCapCrossedBookExactly(uint256 extraAsks, uint256 askTicks, uint256 premiumTicks)
        public
    {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        extraAsks = bound(extraAsks, 1, 3 * cap);
        uint256 askPrice = bound(askTicks, 1, 1e9) * 1e9;
        uint256 bidPrice = askPrice + bound(premiumTicks, 0, 1e9) * 1e9;
        uint256 total = cap + extraAsks;

        _crossedByCap(total, askPrice, bidPrice);

        uint256 fills = 0;
        for (uint256 calls = 0; calls < 4 && _isCrossed(); calls++) {
            fills += _match(keeper, cap);
            _assertChecks();
        }

        assertEq(fills, extraAsks);
        assertFalse(_isCrossed());
        int256 cost = int256(total * askPrice); // total * 1e18 base at askPrice, divided by PRICE_SCALE
        _assertBalances(alice, -int256(total * 1e18), cost);
        _assertBalances(bob, int256(total * 1e18), -cost);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
    }

    /// @dev Review L1: the crossing built from the sell side, so the bids are older and are the makers. Random bid
    /// sizes and prices (each at or above the ask), and one capped ask that fills against many bids across several
    /// calls, possibly resting a few lots once the bids run out. Every fill must be at that bid's own price, with no refund, and the book must end uncrossed.
    function testFuzz_batch_bidMakersClearAtTheirOwnPrices(uint256 seed, uint256 bidCount, uint256 extraLots) public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        bidCount = bound(bidCount, cap + 1, 3 * cap);
        extraLots = bound(extraLots, 0, 5);
        uint256 askPrice = 2e18;

        uint256 totalBase = 0;
        uint256 totalCost = 0;
        uint256 firstBid = 0;
        for (uint256 i = 0; i < bidCount; i++) {
            uint256 h = uint256(keccak256(abi.encode(seed, i)));
            uint256 size = (1 + h % 5) * 1e18;
            uint256 price = askPrice + ((h >> 8) % 1000) * 1e15; // 2.000 to 2.999, tick-aligned
            uint256 id = _place(bob, BUY, price, size);
            if (i == 0) firstBid = id;
            totalBase += size;
            totalCost += size * price / 1e18;
        }

        uint256 ask = _place(alice, SELL, askPrice, totalBase + extraLots * 1e9);
        assertEq(book.lastTradePrice() >= askPrice, true);

        for (uint256 calls = 0; calls < 4 && _isCrossed(); calls++) {
            _match(keeper, cap);
            _assertChecks();
        }

        assertFalse(_isCrossed());
        for (uint256 id = firstBid; id < firstBid + bidCount; id++) {
            _assertStatus(id, IOrderBook.Status.Filled);
            assertEq(book.getOrder(id).lockedQuote, 0);
        }
        assertEq(book.getOrder(ask).filled, totalBase);
        assertEq(book.bookHead(BUY), 0);
        assertEq(book.bookHead(SELL), extraLots == 0 ? 0 : ask);
        _assertBalances(alice, -int256(totalBase + extraLots * 1e9), int256(totalCost));
        _assertBalances(bob, int256(totalBase), -int256(totalCost));
        assertEq(quote.balanceOf(address(book)), 0);
        assertEq(base.balanceOf(address(book)), extraLots * 1e9);
    }

    // Gas

    function test_gas_matchOrdersFullCapWithRefunds() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        _crossedByCap(2 * cap, 2e18, 3e18);
        vm.prank(keeper);
        uint256 gasBefore = gasleft();
        book.matchOrders(cap);
        emit log_named_uint("matchOrders(10) gas, 10 fills with refunds", gasBefore - gasleft());
        _assertChecks();
    }

    function _countTrades(Vm.Log[] memory logs) private view returns (uint256 count) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(book) && logs[i].topics[0] == IOrderBook.Trade.selector) count++;
        }
    }
}

/// @dev What views show during a matchOrders payout. Both orders are in the book, so CEI per fill means a filled
/// taker, not only a filled maker, must be out of the book before the first transfer.
contract OrderBookBatchPayoutViewsTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function test_matchPayout_viewsShowBothFilledOrdersAlreadyUnlinked() public {
        ViewSpyERC20 spy = new ViewSpyERC20("Spy", "SPY");
        base = spy;
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);
        _fund(bob);

        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 lastAsk;
        for (uint256 i = 0; i <= cap; i++) {
            vm.prank(alice);
            lastAsk = book.placeLimitOrder(SELL, 2e18, 1e18);
        }
        vm.prank(bob);
        uint256 bid = book.placeLimitOrder(BUY, 3e18, (cap + 1) * 1e18);
        assertEq(book.bookHead(BUY), bid);

        spy.arm(book, lastAsk, bid);
        book.matchOrders(1);

        (
            bool taken,
            bool hasTradePrice,
            uint256 lastTradePrice,
            IOrderBook.Status makerStatus,,
            IOrderBook.Status takerStatus,
            uint256 sellHead,
            uint256 buyHead,
        ) = spy.snapshot();
        assertTrue(taken);
        assertTrue(hasTradePrice);
        assertEq(lastTradePrice, 2e18);
        assertEq(uint8(makerStatus), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(takerStatus), uint8(IOrderBook.Status.Filled));
        assertEq(sellHead, 0, "filled maker unlinked before the payout");
        assertEq(buyHead, 0, "filled taker unlinked before the payout");
        assertBookSorted();
        assertSolvent();
    }
}

/// @dev Re-entry into and during matchOrders. Deferred from Phase 4, where matchOrders was a stub.
contract OrderBookBatchReentrancyTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;
    uint256 private constant MINTED = 100e18;

    ReentrantERC20 private evil;
    address private keeper = makeAddr("keeper");

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

        evil.mint(address(evil), MINTED);
        evil.execute(address(evil), abi.encodeCall(evil.approve, (address(book), type(uint256).max)));
    }

    /// @dev 11 asks of 1 at 2 from alice; bob bids 11 at 3, fills the cap and rests 1 crossed. The next matchOrders
    /// fill makes three transfers: 1 base to bob, 2 quote to alice, then a 1 quote refund to bob.
    function _crossedBook(bool evilIsBase) private returns (uint256 ask, uint256 bid) {
        _deployWithEvil(evilIsBase);
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i <= cap; i++) {
            ask = _placeAs(alice, SELL, 2e18, 1e18);
        }
        bid = _placeAs(bob, BUY, 3e18, (cap + 1) * 1e18);
        assertEq(book.bookHead(BUY), bid);
        assertEq(book.bookHead(SELL), ask);
    }

    function _placeAs(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _payloads() private pure returns (bytes[] memory payloads) {
        payloads = new bytes[](5);
        payloads[0] = abi.encodeCall(IOrderBook.matchOrders, (1));
        payloads[1] = abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 5e18, 1e18));
        payloads[2] = abi.encodeCall(IOrderBook.cancelOrder, (1));
        payloads[3] = abi.encodeCall(IOrderBook.triggerStopOrders, (1));
        payloads[4] = abi.encodeCall(IOrderBook.placeStopLimitOrder, (IOrderBook.Side.Buy, 1e18, 1e18, 1e18));
    }

    /// @param skip Evil-token balance changes in the fill to let through before firing.
    function _assertMatchTransferReentryBlocked(bool evilIsBase, uint256 skip) private {
        (uint256 ask, uint256 bid) = _crossedBook(evilIsBase);
        bytes[] memory payloads = _payloads();
        uint256 bidFilled = book.getOrder(bid).filled;
        uint256 heldBase = base.balanceOf(address(book));
        uint256 heldQuote = quote.balanceOf(address(book));

        for (uint256 i = 0; i < payloads.length; i++) {
            evil.arm(address(book), payloads[i], skip, false);
            vm.prank(keeper);
            vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
            book.matchOrders(1);
            evil.arm(address(0), "");

            assertEq(uint8(book.getOrder(ask).status), uint8(IOrderBook.Status.Open));
            assertEq(book.getOrder(bid).filled, bidFilled);
            assertEq(base.balanceOf(address(book)), heldBase);
            assertEq(quote.balanceOf(address(book)), heldQuote);
            assertBookSorted();
            assertSolvent();
        }
    }

    function test_reentrancy_duringMatchBasePayout() public {
        _assertMatchTransferReentryBlocked(true, 0);
    }

    function test_reentrancy_duringMatchQuotePayout() public {
        _assertMatchTransferReentryBlocked(false, 0);
    }

    function test_reentrancy_duringMatchPriceImprovementRefund() public {
        _assertMatchTransferReentryBlocked(false, 1);
    }

    /// @dev Deferred from Phase 4: matchOrders re-entered during the price-improvement refund of a placement. The
    /// token is the buyer, so the third quote change of its placement (pull, seller payout, refund) fires.
    function test_reentrancy_matchOrdersDuringPlacementPriceImprovementRefund() public {
        _deployWithEvil(false);
        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 1e18);
        evil.arm(address(book), abi.encodeCall(IOrderBook.matchOrders, (1)), 2, false);
        uint256 owned = evil.balanceOf(address(evil));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        evil.execute(address(book), abi.encodeCall(IOrderBook.placeLimitOrder, (BUY, 3e18, 2e18)));

        // The revert also rolls back the token's `fired` record; the swallow test below pins where it fires.
        assertEq(book.nextOrderId(), 2);
        assertEq(evil.balanceOf(address(evil)), owned);
        assertFalse(book.hasTradePrice());
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Swallow-mode twin of the test above: shows the inner matchOrders fires on the refund transfer, fails with
    /// the guard error, and the placement still completes with the refund paid once.
    function test_swallow_matchOrdersDuringPlacementRefundPaidOnce() public {
        _deployWithEvil(false);
        vm.prank(alice);
        uint256 ask = book.placeLimitOrder(SELL, 2e18, 1e18);
        evil.arm(address(book), abi.encodeCall(IOrderBook.matchOrders, (1)), 2, true);
        uint256 owned = evil.balanceOf(address(evil));

        evil.execute(address(book), abi.encodeCall(IOrderBook.placeLimitOrder, (BUY, 3e18, 2e18)));

        assertTrue(evil.innerCallFailed());
        assertEq(bytes4(evil.innerRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(evil.firedTo(), address(evil), "fired on the transfer to the buyer");
        assertEq(evil.firedValue(), 1e18, "the refund: 1 base at limit 3, filled at 2");
        // Paid 3 * 2 escrow up front; got 1 refund on the fill; 3 still locked for the unfilled 1 base.
        assertEq(owned - evil.balanceOf(address(evil)), 6e18 - 1e18);
        assertEq(uint8(book.getOrder(ask).status), uint8(IOrderBook.Status.Filled));
        assertEq(book.getOrder(2).lockedQuote, 3e18);
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Swallow mode: the inner matchOrders fails, the outer one completes, and the refund is paid exactly once.
    function test_swallow_matchPriceImprovementRefundPaidOnce() public {
        (uint256 ask, uint256 bid) = _crossedBook(false);
        uint256 bobQuoteBefore = quote.balanceOf(bob);
        uint256 aliceQuoteBefore = quote.balanceOf(alice);
        evil.arm(address(book), abi.encodeCall(IOrderBook.matchOrders, (1)), 1, true);

        vm.prank(keeper);
        assertEq(book.matchOrders(1), 1);

        assertTrue(evil.innerCallFailed());
        assertEq(bytes4(evil.innerRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(evil.firedTo(), bob);
        assertEq(evil.firedValue(), 1e18);
        assertEq(quote.balanceOf(bob) - bobQuoteBefore, 1e18, "refund paid once");
        assertEq(quote.balanceOf(alice) - aliceQuoteBefore, 2e18, "seller paid once");
        assertEq(uint8(book.getOrder(ask).status), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(book.getOrder(bid).status), uint8(IOrderBook.Status.Filled));
        assertEq(quote.balanceOf(address(book)), 0);
        assertBookSorted();
        assertSolvent();
    }
}
