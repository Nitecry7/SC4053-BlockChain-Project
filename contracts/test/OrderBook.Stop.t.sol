// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";

/// @dev Phases 6a and 6b: stop-limit placement, cancel of pending stops, and triggerStopOrders.
contract OrderBookStopTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    address private keeper = makeAddr("keeper");

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _stop(address trader, IOrderBook.Side side, uint256 trigger, uint256 limit, uint256 amount)
        private
        returns (uint256)
    {
        vm.prank(trader);
        return book.placeStopLimitOrder(side, trigger, limit, amount);
    }

    function _trigger(uint256 maxCount) private returns (uint256) {
        vm.prank(keeper);
        return book.triggerStopOrders(maxCount);
    }

    /// @dev Sets lastTradePrice with a 1-base trade between alice and bob that leaves nothing resting.
    function _tradeAt(uint256 price) private {
        _place(alice, SELL, price, 1e18);
        _place(bob, BUY, price, 1e18);
        assertEq(book.lastTradePrice(), price);
    }

    function _assertChecks() private view {
        assertBookSorted();
        assertSolvent();
    }

    function _assertStatus(uint256 orderId, IOrderBook.Status status) private view {
        assertEq(uint8(book.getOrder(orderId).status), uint8(status), "status");
    }

    function _delta(address trader) private view returns (int256 baseDelta, int256 quoteDelta) {
        baseDelta = int256(base.balanceOf(trader)) - int256(INITIAL_BALANCE);
        quoteDelta = int256(quote.balanceOf(trader)) - int256(INITIAL_BALANCE);
    }

    function _assertBalances(address trader, int256 baseDelta, int256 quoteDelta) private view {
        (int256 b, int256 q) = _delta(trader);
        assertEq(b, baseDelta, "base delta");
        assertEq(q, quoteDelta, "quote delta");
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 topic) private view returns (uint256 count) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(book) && logs[i].topics[0] == topic) count++;
        }
    }

    // ---------------------------------------------------------------- 6a: placement

    function test_place_buyStopEscrowsQuoteAtLimitAndEmits() public {
        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderPlaced(1, carol, BUY, 2.5e18, 3e18, 4e18);
        uint256 id = _stop(carol, BUY, 2.5e18, 3e18, 4e18);

        IOrderBook.Order memory o = book.getOrder(id);
        assertEq(uint8(o.status), uint8(IOrderBook.Status.PendingTrigger));
        assertEq(o.price, 3e18, "price is the limit price");
        assertEq(o.triggerPrice, 2.5e18);
        assertEq(o.lockedQuote, 12e18, "requiredQuote(4, 3)");
        assertEq(o.filled, 0);
        _assertBalances(carol, 0, -12e18);
        assertEq(quote.balanceOf(address(book)), 12e18);
        _assertChecks();
    }

    function test_place_sellStopEscrowsBaseAndEmits() public {
        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderPlaced(1, carol, SELL, 1.5e18, 1.4e18, 3e18);
        uint256 id = _stop(carol, SELL, 1.5e18, 1.4e18, 3e18);

        assertEq(book.getOrder(id).lockedQuote, 0);
        _assertStatus(id, IOrderBook.Status.PendingTrigger);
        _assertBalances(carol, -3e18, 0);
        assertEq(base.balanceOf(address(book)), 3e18);
        _assertChecks();
    }

    function test_place_pendingStopIsNotInTheBookButIsListedForTheTrader() public {
        uint256 bid = _place(bob, BUY, 1e18, 1e18);
        uint256 buyStop = _stop(carol, BUY, 2e18, 2e18, 1e18);
        uint256 sellStop = _stop(carol, SELL, 0.5e18, 0.5e18, 1e18);

        assertEq(book.getBook(BUY, 10).length, 1);
        assertEq(book.getBook(SELL, 10).length, 0);
        (uint256 bestBidId,) = book.getBestBid();
        (uint256 bestAskId,) = book.getBestAsk();
        assertEq(bestBidId, bid);
        assertEq(bestAskId, 0, "a pending sell stop is not an ask");

        uint256[] memory ids = book.getUserOrderIds(carol);
        assertEq(ids.length, 2);
        assertEq(ids[0], buyStop);
        assertEq(ids[1], sellStop);
        assertEq(book.stopHead(BUY), buyStop);
        assertEq(book.stopHead(SELL), sellStop);
        _assertChecks();
    }

    function test_place_pendingStopDoesNotMatchAndIsNotMatched() public {
        _place(alice, SELL, 1e18, 1e18);
        uint256 buyStop = _stop(carol, BUY, 1e18, 5e18, 1e18); // would cross the ask if it were live

        _assertStatus(buyStop, IOrderBook.Status.PendingTrigger);
        assertFalse(book.hasTradePrice());

        _place(bob, SELL, 5e18, 1e18); // a sell at the stop's limit does not hit it either
        _assertStatus(buyStop, IOrderBook.Status.PendingTrigger);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    function test_place_validationOrderAndTriggerChecks() public {
        vm.startPrank(carol);
        vm.expectRevert(IOrderBook.ZeroAmount.selector);
        book.placeStopLimitOrder(BUY, 0, 0, 0);
        vm.expectRevert(IOrderBook.ZeroPrice.selector);
        book.placeStopLimitOrder(BUY, 0, 1e18, 1e9 + 1); // zero trigger before the lot check
        vm.expectRevert(IOrderBook.ZeroPrice.selector);
        book.placeStopLimitOrder(BUY, 1e18, 0, 1e18);
        vm.expectRevert(IOrderBook.InvalidLotSize.selector);
        book.placeStopLimitOrder(BUY, 1e18 + 1, 1e18, 1e9 + 1); // lot check before tick check
        vm.expectRevert(IOrderBook.InvalidTickSize.selector);
        book.placeStopLimitOrder(BUY, 1e18 + 1, 1e18, 1e18); // trigger off the tick
        vm.expectRevert(IOrderBook.InvalidTickSize.selector);
        book.placeStopLimitOrder(SELL, 1e18, 1e18 + 1, 1e18); // limit off the tick
        vm.stopPrank();

        assertEq(book.nextOrderId(), 1, "nothing recorded");
        _assertChecks();
    }

    function test_place_stopListsSortedByTriggerWithTiesInPlacementOrder() public {
        uint256 b3 = _stop(carol, BUY, 3e18, 3e18, 1e18);
        uint256 b1 = _stop(carol, BUY, 1e18, 3e18, 1e18);
        uint256 b2a = _stop(carol, BUY, 2e18, 3e18, 1e18);
        uint256 b2b = _stop(carol, BUY, 2e18, 3e18, 1e18);
        uint256 s1 = _stop(carol, SELL, 1e18, 1e18, 1e18);
        uint256 s3 = _stop(carol, SELL, 3e18, 1e18, 1e18);

        assertEq(book.stopHead(BUY), b1, "lowest buy trigger first");
        assertEq(book.bookNext(b1), b2a);
        assertEq(book.bookNext(b2a), b2b, "equal triggers in placement order");
        assertEq(book.bookNext(b2b), b3);
        assertEq(book.stopHead(SELL), s3, "highest sell trigger first");
        assertEq(book.bookNext(s3), s1);
        _assertChecks();
    }

    function test_place_stopListInsertBoundedByMaxInsertScan() public {
        uint256 scan = book.MAX_INSERT_SCAN();
        for (uint256 i = 0; i <= scan; i++) {
            _stop(carol, BUY, 1e18, 1e18, 1e9);
        }
        vm.prank(carol);
        vm.expectRevert(IOrderBook.BookTooDeep.selector);
        book.placeStopLimitOrder(BUY, 1e18, 1e18, 1e9); // equal trigger queues last: past the scan limit

        _stop(carol, BUY, 0.5e18, 1e18, 1e9); // a new head needs no scan
        _assertChecks();
    }

    // ---------------------------------------------------------------- 6a: cancel of pending stops

    function test_cancel_pendingBuyStopRefundsFullEscrow() public {
        uint256 id = _stop(carol, BUY, 2e18, 3e18, 4e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(id, carol, 0, 12e18);
        vm.prank(carol);
        book.cancelOrder(id);

        _assertStatus(id, IOrderBook.Status.Cancelled);
        assertEq(book.getOrder(id).lockedQuote, 0);
        assertEq(book.stopHead(BUY), 0);
        _assertBalances(carol, 0, 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_pendingSellStopRefundsFullEscrow() public {
        uint256 id = _stop(carol, SELL, 1e18, 0.5e18, 7e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(id, carol, 7e18, 0);
        vm.prank(carol);
        book.cancelOrder(id);

        _assertBalances(carol, 0, 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(book.stopHead(SELL), 0);
        _assertChecks();
    }

    function test_cancel_pendingStopHeadMiddleTailKeepLinks() public {
        uint256 a = _stop(carol, BUY, 1e18, 1e18, 1e18);
        uint256 b = _stop(carol, BUY, 2e18, 2e18, 1e18);
        uint256 c = _stop(carol, BUY, 3e18, 3e18, 1e18);
        uint256 d = _stop(carol, BUY, 4e18, 4e18, 1e18);

        vm.startPrank(carol);
        book.cancelOrder(b); // middle
        assertEq(book.bookNext(a), c);
        assertEq(book.bookPrev(c), a);
        book.cancelOrder(a); // head
        assertEq(book.stopHead(BUY), c);
        book.cancelOrder(d); // tail
        assertEq(book.bookNext(c), 0);
        book.cancelOrder(c); // only element
        vm.stopPrank();

        assertEq(book.stopHead(BUY), 0);
        _assertBalances(carol, 0, 0);
        _assertChecks();
    }

    function test_cancel_pendingStopByNonOwnerReverts() public {
        uint256 id = _stop(carol, SELL, 1e18, 1e18, 1e18);
        vm.prank(bob);
        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        book.cancelOrder(id);
        _assertStatus(id, IOrderBook.Status.PendingTrigger);
        _assertChecks();
    }

    function test_cancel_cancelledStopIsNeverTriggered() public {
        uint256 id = _stop(carol, SELL, 2e18, 1e18, 1e18);
        vm.prank(carol);
        book.cancelOrder(id);
        _tradeAt(1e18); // would make the stop eligible

        vm.recordLogs();
        assertEq(_trigger(10), 0);
        assertEq(_countLogs(vm.getRecordedLogs(), IOrderBook.StopOrderTriggered.selector), 0);
        _assertStatus(id, IOrderBook.Status.Cancelled);
        _assertBalances(carol, 0, 0);
        _assertChecks();
    }

    function test_cancel_activatedStopCancelsLikeALimitOrder() public {
        _tradeAt(2e18);
        uint256 id = _stop(carol, BUY, 2e18, 1.9e18, 1e18);
        assertEq(_trigger(1), 1);
        _assertStatus(id, IOrderBook.Status.Open);

        vm.prank(carol);
        book.cancelOrder(id);
        _assertBalances(carol, 0, 0);
        _assertChecks();
    }

    // ---------------------------------------------------------------- 6b: triggerStopOrders validation and eligibility

    function test_trigger_revertsInvalidMaxCount() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        vm.startPrank(keeper);
        vm.expectRevert(IOrderBook.InvalidMaxCount.selector);
        book.triggerStopOrders(0);
        vm.expectRevert(IOrderBook.InvalidMaxCount.selector);
        book.triggerStopOrders(cap + 1);
        assertEq(book.triggerStopOrders(cap), 0);
        assertEq(book.triggerStopOrders(1), 0);
        vm.stopPrank();
    }

    function test_trigger_nothingBeforeTheFirstTrade() public {
        uint256 buyStop = _stop(carol, BUY, 1e9, 1e18, 1e18); // the lowest possible trigger
        uint256 sellStop = _stop(carol, SELL, 1000e18, 1e18, 1e18); // a very high trigger
        assertFalse(book.hasTradePrice());

        vm.recordLogs();
        assertEq(_trigger(10), 0);
        assertEq(vm.getRecordedLogs().length, 0);
        _assertStatus(buyStop, IOrderBook.Status.PendingTrigger);
        _assertStatus(sellStop, IOrderBook.Status.PendingTrigger);
        _assertChecks();
    }

    function test_trigger_wrongSideOfThePriceDoesNotTrigger() public {
        _tradeAt(2e18);
        uint256 buyStop = _stop(carol, BUY, 2e18 + 1e9, 3e18, 1e18); // buy needs last >= trigger
        uint256 sellStop = _stop(carol, SELL, 2e18 - 1e9, 1e18, 1e18); // sell needs last <= trigger

        vm.recordLogs();
        assertEq(_trigger(10), 0);
        assertEq(vm.getRecordedLogs().length, 0);
        _assertStatus(buyStop, IOrderBook.Status.PendingTrigger);
        _assertStatus(sellStop, IOrderBook.Status.PendingTrigger);
        _assertChecks();
    }

    function test_trigger_exactTriggerPriceTriggersBothSides() public {
        _tradeAt(2e18);
        uint256 buyStop = _stop(carol, BUY, 2e18, 1e18, 1e18);
        uint256 sellStop = _stop(carol, SELL, 2e18, 3e18, 1e18);

        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(buyStop, 2e18);
        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(sellStop, 2e18);
        assertEq(_trigger(10), 2);

        _assertStatus(buyStop, IOrderBook.Status.Open);
        _assertStatus(sellStop, IOrderBook.Status.Open);
        assertEq(book.stopHead(BUY), 0);
        assertEq(book.stopHead(SELL), 0);
        _assertChecks();
    }

    /// @dev Review L1: the event carries the price that made the stop eligible, not the stop's own trigger.
    function test_trigger_eventCarriesLastTradePriceNotTriggerPrice() public {
        _tradeAt(2e18);
        uint256 buyStop = _stop(carol, BUY, 1.5e18, 1e18, 1e18);

        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(buyStop, 2e18);
        assertEq(_trigger(1), 1);
        _assertChecks();
    }

    /// @dev Review L2: a pending but ineligible buy head must not hide an eligible sell head.
    function test_trigger_ineligibleBuyHeadDoesNotHideEligibleSellStop() public {
        _tradeAt(2e18);
        uint256 buyStop = _stop(carol, BUY, 3e18, 3e18, 1e18); // needs last >= 3
        uint256 sellStop = _stop(carol, SELL, 2e18, 2.5e18, 1e18);

        assertEq(_trigger(10), 1);
        _assertStatus(buyStop, IOrderBook.Status.PendingTrigger);
        _assertStatus(sellStop, IOrderBook.Status.Open);
        _assertChecks();
    }

    function test_trigger_buySideFirstWhenBothEligible() public {
        _tradeAt(2e18);
        uint256 sellStop = _stop(carol, SELL, 2e18, 3e18, 1e18);
        uint256 buyStop = _stop(carol, BUY, 2e18, 1e18, 1e18);

        assertEq(_trigger(1), 1);
        _assertStatus(buyStop, IOrderBook.Status.Open);
        _assertStatus(sellStop, IOrderBook.Status.PendingTrigger);
        assertEq(_trigger(1), 1);
        _assertStatus(sellStop, IOrderBook.Status.Open);
        _assertChecks();
    }

    // ---------------------------------------------------------------- 6b: activation outcomes

    function test_trigger_activatedSellStopFillsAgainstABid() public {
        _tradeAt(2e18);
        uint256 bid = _place(bob, BUY, 1.8e18, 2e18);
        uint256 stop = _stop(carol, SELL, 2e18, 1.5e18, 2e18);

        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(stop, 2e18);
        vm.expectEmit(address(book));
        emit IOrderBook.Trade(bid, stop, bob, carol, 1.8e18, 2e18, 3.6e18);
        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.lastTradePrice(), 1.8e18, "filled at the resting bid's price");
        _assertBalances(carol, -2e18, 3.6e18);
        assertEq(book.getBook(SELL, 1).length, 0);
        _assertChecks();
    }

    function test_trigger_activatedBuyStopFillsWithPriceImprovementRefund() public {
        _tradeAt(2e18);
        uint256 ask = _place(alice, SELL, 2.2e18, 1e18);
        uint256 stop = _stop(carol, BUY, 2e18, 3e18, 1e18); // escrows 3
        _assertBalances(carol, 0, -3e18);

        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.Filled);
        _assertBalances(carol, 1e18, -2.2e18); // paid the ask's price, 0.8 refunded
        assertEq(book.getOrder(stop).lockedQuote, 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_trigger_activatedStopWithNoLiquidityRestsAsLimitOrder() public {
        _tradeAt(2e18);
        uint256 stop = _stop(carol, SELL, 2e18, 2.5e18, 3e18);

        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.Open);
        (uint256 bestAskId, uint256 bestAskPrice) = book.getBestAsk();
        assertEq(bestAskId, stop);
        assertEq(bestAskPrice, 2.5e18, "rests at its limit price");
        assertEq(book.stopHead(SELL), 0);
        assertEq(base.balanceOf(address(book)), 3e18, "escrow stays with the resting order");

        uint256 bid = _place(bob, BUY, 2.5e18, 1e18); // and fills later like any ask
        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(stop, IOrderBook.Status.PartiallyFilled);
        _assertChecks();
    }

    /// @dev Review L5: an activated buy stop that partly fills with price improvement keeps exactly the A5 escrow for
    /// its remainder, and the rest of the escrow is refunded.
    function test_trigger_activatedBuyStopPartFillKeepsExactRemainderEscrow() public {
        _tradeAt(2e18);
        _place(alice, SELL, 2.2e18, 1e18);
        uint256 stop = _stop(carol, BUY, 2e18, 3e18, 4e18); // escrows 12

        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(stop).filled, 1e18);
        assertEq(book.getOrder(stop).lockedQuote, 9e18, "requiredQuote(3, 3) for the remainder");
        _assertBalances(carol, 1e18, -11.2e18); // paid 2.2 for the fill, 9 still locked, 0.8 refunded
        assertEq(quote.balanceOf(address(book)), 9e18);
        (uint256 bestBidId, uint256 bestBidPrice) = book.getBestBid();
        assertEq(bestBidId, stop);
        assertEq(bestBidPrice, 3e18);
        _assertChecks();
    }

    function test_trigger_partialFillRestsTheRemainder() public {
        _tradeAt(2e18);
        _place(bob, BUY, 1.9e18, 1e18);
        uint256 stop = _stop(carol, SELL, 2e18, 1.9e18, 3e18);

        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(stop).filled, 1e18);
        (uint256 bestAskId,) = book.getBestAsk();
        assertEq(bestAskId, stop);
        assertEq(base.balanceOf(address(book)), 2e18);
        _assertChecks();
    }

    function test_trigger_activatedStopQueuesBehindEarlierOrdersAtItsPrice() public {
        _tradeAt(2e18);
        uint256 stop = _stop(carol, BUY, 2e18, 1.9e18, 1e18); // lower order ID than the bid below
        uint256 laterBid = _place(bob, BUY, 1.9e18, 1e18); // enters the book first

        assertEq(_trigger(1), 1);
        assertGt(book.bookSeq(stop), book.bookSeq(laterBid), "fresh bookSeq on activation");
        assertEq(book.bookHead(BUY), laterBid);
        assertEq(book.bookNext(laterBid), stop);

        _place(alice, SELL, 1.9e18, 1e18);
        _assertStatus(laterBid, IOrderBook.Status.Filled);
        _assertStatus(stop, IOrderBook.Status.Open);
        _assertChecks();
    }

    function test_trigger_cannotTriggerTheSameStopTwice() public {
        _tradeAt(2e18);
        uint256 stop = _stop(carol, SELL, 2e18, 2.5e18, 1e18);

        vm.recordLogs();
        assertEq(_trigger(10), 1);
        assertEq(_trigger(10), 0, "already activated");
        assertEq(_countLogs(vm.getRecordedLogs(), IOrderBook.StopOrderTriggered.selector), 1);
        _assertStatus(stop, IOrderBook.Status.Open);
        _assertChecks();
    }

    // ---------------------------------------------------------------- 6b: limits

    function test_trigger_maxCountRespected() public {
        _tradeAt(2e18);
        uint256 a = _stop(carol, SELL, 2e18, 3e18, 1e18);
        uint256 b = _stop(carol, SELL, 2e18, 3e18, 1e18);
        uint256 c = _stop(carol, SELL, 2e18, 3e18, 1e18);

        assertEq(_trigger(2), 2);
        _assertStatus(a, IOrderBook.Status.Open);
        _assertStatus(b, IOrderBook.Status.Open);
        _assertStatus(c, IOrderBook.Status.PendingTrigger);
        _assertChecks();

        assertEq(_trigger(2), 1);
        _assertStatus(c, IOrderBook.Status.Open);
        _assertChecks();
    }

    /// @dev Two eligible sell stops, each able to take 10 fills. The whole call has ONE budget of 10 fills: the first
    /// stop uses it all, the second activates but rests unmatched (crossed), and matchOrders clears it later.
    function test_trigger_sharedFillBudgetAcrossTheWholeCall() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        _tradeAt(2e18);
        for (uint256 i = 0; i < 2 * cap; i++) {
            _place(bob, BUY, 2e18, 1e18);
        }
        uint256 first = _stop(carol, SELL, 2e18, 1e18, cap * 1e18);
        uint256 second = _stop(carol, SELL, 2e18, 1e18, cap * 1e18);

        vm.recordLogs();
        assertEq(_trigger(2), 2);
        assertEq(_countLogs(vm.getRecordedLogs(), IOrderBook.Trade.selector), cap, "one budget for the whole call");

        _assertStatus(first, IOrderBook.Status.Filled);
        _assertStatus(second, IOrderBook.Status.Open);
        assertEq(book.getOrder(second).filled, 0, "no budget left for the second stop");
        (, uint256 bestBid) = book.getBestBid();
        (uint256 bestAskId, uint256 bestAsk) = book.getBestAsk();
        assertEq(bestAskId, second);
        assertGt(bestBid, bestAsk, "left crossed for matchOrders");
        _assertChecks();

        vm.prank(keeper);
        assertEq(book.matchOrders(cap), cap);
        _assertStatus(second, IOrderBook.Status.Filled);
        assertEq(book.bookHead(BUY), 0);
        _assertBalances(carol, -int256(2 * cap * 1e18), int256(2 * cap * 2e18));
        _assertChecks();
    }

    /// @dev A fill made by one activated stop moves lastTradePrice, which makes the next stop eligible in the same call.
    function test_trigger_cascadeWithinOneCall() public {
        _tradeAt(2e18);
        _place(bob, BUY, 1.5e18, 1e18);
        _place(bob, BUY, 1.4e18, 1e18);
        uint256 s1 = _stop(carol, SELL, 2e18, 1e18, 1e18);
        uint256 s2 = _stop(carol, SELL, 1.5e18, 1e18, 1e18); // not eligible at 2

        assertEq(_trigger(10), 2);

        _assertStatus(s1, IOrderBook.Status.Filled);
        _assertStatus(s2, IOrderBook.Status.Filled);
        assertEq(book.lastTradePrice(), 1.4e18);
        _assertChecks();
    }

    function test_trigger_cascadeStillBoundedByMaxCount() public {
        _tradeAt(2e18);
        _place(bob, BUY, 1.5e18, 1e18);
        uint256 s1 = _stop(carol, SELL, 2e18, 1e18, 1e18);
        uint256 s2 = _stop(carol, SELL, 1.5e18, 1e18, 1e18);

        assertEq(_trigger(1), 1);
        _assertStatus(s1, IOrderBook.Status.Filled);
        _assertStatus(s2, IOrderBook.Status.PendingTrigger);
        assertEq(_trigger(1), 1);
        _assertStatus(s2, IOrderBook.Status.Open);
        _assertChecks();
    }

    function test_trigger_thirdPartyCallerGainsAndLosesNothing() public {
        _tradeAt(2e18);
        _place(bob, BUY, 1.8e18, 1e18);
        _stop(carol, SELL, 2e18, 1.5e18, 1e18);

        assertEq(_trigger(10), 1);
        assertEq(base.balanceOf(keeper), 0);
        assertEq(quote.balanceOf(keeper), 0);
        assertEq(book.getUserOrderIds(keeper).length, 0);
        _assertChecks();
    }

    /// @dev Review L4: gas for the heaviest trigger call built here. Ten activations, each inserted behind 90 resting
    /// bids at a better price (no fills).
    function test_gas_triggerTenActivationsDeepInserts() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        _tradeAt(2e18);
        for (uint256 i = 0; i < 90; i++) {
            _place(bob, BUY, 1.9e18, 1e9);
        }
        for (uint256 i = 0; i < cap; i++) {
            _stop(carol, BUY, 2e18, 1.8e18, 1e18);
        }
        vm.prank(keeper);
        uint256 gasBefore = gasleft();
        book.triggerStopOrders(cap);
        emit log_named_uint("triggerStopOrders(10) gas, 10 activations behind 90 bids", gasBefore - gasleft());
        assertEq(book.stopHead(BUY), 0);
        _assertChecks();
    }

    function test_gas_triggerTenActivationsTenFillsWithRefunds() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        _tradeAt(2e18);
        for (uint256 i = 0; i < cap; i++) {
            _place(alice, SELL, 2e18, 1e18);
        }
        for (uint256 i = 0; i < cap; i++) {
            _stop(carol, BUY, 2e18, 3e18, 1e18);
        }
        vm.prank(keeper);
        uint256 gasBefore = gasleft();
        book.triggerStopOrders(cap);
        emit log_named_uint("triggerStopOrders(10) gas, 10 activations, 10 fills with refunds", gasBefore - gasleft());
        assertEq(book.bookHead(SELL), 0);
        _assertChecks();
    }

    // ---------------------------------------------------------------- activation into a too-deep book (review H1)

    /// @dev Review H1 attack: Mallory's buy stop has the lowest possible trigger, so it heads the buy-stop list and is
    /// eligible after any trade, and 101 dust bids at its limit rank ahead of it. Before the fix, activating it reverted
    /// with BookTooDeep, so every triggerStopOrders call reverted and no stop on either side could ever activate. Now
    /// the unplaceable stop is cancelled and refunded, and the honest sell stop still activates in the same call.
    function test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers() public {
        address mallory = makeAddr("mallory");
        _fund(mallory);
        _tradeAt(1e18);
        uint256 scan = book.MAX_INSERT_SCAN();
        uint256 blocker = _stop(mallory, BUY, 1e9, 1e9, 1e9);
        for (uint256 i = 0; i <= scan; i++) {
            _place(mallory, BUY, 1e9, 1e9); // 1 wei of escrow each
        }
        uint256 honest = _stop(carol, SELL, 1e18, 0.9e18, 2e18);
        _assertBalances(mallory, 0, -int256(scan + 2)); // the whole attack locks 102 wei

        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(blocker, 1e18);
        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(blocker, mallory, 0, 1);
        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(honest, 1e18);
        assertEq(_trigger(10), 2, "both count as triggered");

        _assertStatus(blocker, IOrderBook.Status.Cancelled);
        assertEq(book.getOrder(blocker).lockedQuote, 0);
        _assertStatus(honest, IOrderBook.Status.Open);
        (uint256 bestAskId,) = book.getBestAsk();
        assertEq(bestAskId, honest, "the honest stop rests as an ask");
        assertEq(book.stopHead(BUY), 0);
        assertEq(book.stopHead(SELL), 0);
        _assertBalances(mallory, 0, -int256(scan + 1)); // only the dust bids stay locked
        _assertChecks();
    }

    /// @dev An honest buy stop whose limit ranks behind more than MAX_INSERT_SCAN resting bids is cancelled with its
    /// exact escrow refunded, rather than reverting the call.
    function test_trigger_honestStopBehindTooDeepBookIsRefundedExactly() public {
        _tradeAt(2e18);
        uint256 scan = book.MAX_INSERT_SCAN();
        for (uint256 i = 0; i <= scan; i++) {
            _place(bob, BUY, 1.5e18, 1e9);
        }
        uint256 stop = _stop(carol, BUY, 2e18, 1.5e18, 4e18); // escrows 6
        _assertBalances(carol, 0, -6e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(stop, carol, 0, 6e18);
        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.Cancelled);
        _assertBalances(carol, 0, 0);
        assertEq(book.getBook(BUY, scan + 2).length, scan + 1, "the book is unchanged");
        _assertChecks();
    }

    function test_trigger_unplaceableSellStopRefundsBase() public {
        _tradeAt(1e18);
        uint256 scan = book.MAX_INSERT_SCAN();
        for (uint256 i = 0; i <= scan; i++) {
            _place(alice, SELL, 3e18, 1e9);
        }
        uint256 stop = _stop(carol, SELL, 1e18, 3e18, 5e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(stop, carol, 5e18, 0);
        assertEq(_trigger(1), 1);

        _assertStatus(stop, IOrderBook.Status.Cancelled);
        _assertBalances(carol, 0, 0);
        _assertChecks();
    }

    // ---------------------------------------------------------------- solvency with pending stops

    function test_solvency_contractHoldsEscrowOfPendingStops() public {
        _stop(carol, BUY, 2e18, 3e18, 2e18); // 6 quote
        _stop(carol, SELL, 1e18, 1e18, 5e18); // 5 base
        _place(bob, BUY, 0.5e18, 2e18); // 1 quote, resting
        assertEq(quote.balanceOf(address(book)), 7e18);
        assertEq(base.balanceOf(address(book)), 5e18);
        _assertChecks();
    }

    /// @dev Random stops of both sides around a random last price, then trigger until nothing is eligible.
    function testFuzz_trigger_randomStopsKeepSolvencyAndLists(uint256 seed) public {
        uint256 last = (1 + seed % 50) * 0.1e18;
        _tradeAt(last);
        for (uint256 i = 0; i < 12; i++) {
            uint256 h = uint256(keccak256(abi.encode(seed, i)));
            uint256 trigger = (1 + h % 50) * 0.1e18;
            uint256 limit = (1 + (h >> 16) % 50) * 0.1e18;
            uint256 amount = (1 + (h >> 32) % 4) * 1e18;
            IOrderBook.Side side = (h >> 48) % 2 == 0 ? BUY : SELL;
            if ((h >> 56) % 3 == 0) {
                _place(i % 2 == 0 ? alice : bob, side, limit, amount);
            } else {
                _stop(carol, side, trigger, limit, amount);
            }
            _assertChecks();
        }
        for (uint256 calls = 0; calls < 5; calls++) {
            _trigger(book.MAX_MATCHES_PER_TX());
            _assertChecks();
        }
        // Five calls allow 50 activations for at most 12 stops, so nothing eligible may be left (review L3).
        uint256 buyHead = book.stopHead(BUY);
        uint256 sellHead = book.stopHead(SELL);
        uint256 finalPrice = book.lastTradePrice();
        assertTrue(buyHead == 0 || book.getOrder(buyHead).triggerPrice > finalPrice, "eligible buy stop left pending");
        assertTrue(
            sellHead == 0 || book.getOrder(sellHead).triggerPrice < finalPrice, "eligible sell stop left pending"
        );
        assertEq(_trigger(1), 0, "nothing left to trigger");
        _assertChecks();
    }
}

/// @dev Re-entry during stop placement and during the matching that triggerStopOrders runs.
contract OrderBookStopReentrancyTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    ReentrantERC20 private evil;
    address private keeper = makeAddr("keeper");

    /// @dev Evil quote token. Sets lastTradePrice to 2 with a clean trade, then: bob bids 1 at 1.8, carol has a sell
    /// stop at trigger 2. Triggering it pays carol quote (an evil balance change) during the fill.
    function _setUp() private returns (uint256 bid, uint256 stop) {
        evil = new ReentrantERC20("Evil", "EVIL");
        quote = evil;
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);
        _fund(bob);
        _fund(carol);

        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 1e18);
        vm.prank(bob);
        book.placeLimitOrder(BUY, 2e18, 1e18);
        vm.prank(bob);
        bid = book.placeLimitOrder(BUY, 1.8e18, 1e18);
        vm.prank(carol);
        stop = book.placeStopLimitOrder(SELL, 2e18, 1.5e18, 1e18);
    }

    function _payloads(uint256 stop) private pure returns (bytes[] memory p) {
        p = new bytes[](5);
        p[0] = abi.encodeCall(IOrderBook.triggerStopOrders, (1));
        p[1] = abi.encodeCall(IOrderBook.placeStopLimitOrder, (IOrderBook.Side.Sell, 2e18, 1e18, 1e18));
        p[2] = abi.encodeCall(IOrderBook.cancelOrder, (stop));
        p[3] = abi.encodeCall(IOrderBook.matchOrders, (1));
        p[4] = abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 5e18, 1e18));
    }

    function test_reentrancy_duringTriggeredFillRevertsAndChangesNothing() public {
        (uint256 bid, uint256 stop) = _setUp();
        bytes[] memory payloads = _payloads(stop);
        uint256 heldBase = base.balanceOf(address(book));
        uint256 heldQuote = quote.balanceOf(address(book));

        for (uint256 i = 0; i < payloads.length; i++) {
            evil.arm(address(book), payloads[i]);
            vm.prank(keeper);
            vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
            book.triggerStopOrders(1);
            evil.arm(address(0), "");

            assertEq(uint8(book.getOrder(stop).status), uint8(IOrderBook.Status.PendingTrigger));
            assertEq(uint8(book.getOrder(bid).status), uint8(IOrderBook.Status.Open));
            assertEq(book.stopHead(SELL), stop);
            assertEq(base.balanceOf(address(book)), heldBase);
            assertEq(quote.balanceOf(address(book)), heldQuote);
            assertBookSorted();
            assertSolvent();
        }
    }

    function test_swallow_duringTriggeredFillActivatesOnce() public {
        (uint256 bid, uint256 stop) = _setUp();
        evil.arm(address(book), abi.encodeCall(IOrderBook.triggerStopOrders, (1)), 0, true);
        uint256 carolQuoteBefore = quote.balanceOf(carol);

        vm.recordLogs();
        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 1);

        assertTrue(evil.innerCallFailed());
        assertEq(bytes4(evil.innerRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(evil.firedTo(), carol, "fired on the payout to the stop's trader");
        assertEq(quote.balanceOf(carol) - carolQuoteBefore, 1.8e18, "paid once");
        assertEq(uint8(book.getOrder(stop).status), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(book.getOrder(bid).status), uint8(IOrderBook.Status.Filled));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 triggeredLogs = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == IOrderBook.StopOrderTriggered.selector) triggeredLogs++;
        }
        assertEq(triggeredLogs, 1);
        assertBookSorted();
        assertSolvent();
    }

    function test_reentrancy_duringStopEscrowPullReverts() public {
        _setUp();
        evil.arm(address(book), abi.encodeCall(IOrderBook.triggerStopOrders, (1)));
        uint256 nextId = book.nextOrderId();

        vm.prank(carol);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        book.placeStopLimitOrder(BUY, 3e18, 3e18, 1e18); // pulls evil quote

        assertEq(book.nextOrderId(), nextId, "nothing recorded");
        assertBookSorted();
        assertSolvent();
    }
}
