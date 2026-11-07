// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";
import {OrderBookHarness} from "./mocks/OrderBookHarness.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";
import {ViewSpyERC20} from "./mocks/ViewSpyERC20.sol";

contract OrderBookCancelTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _cancel(address trader, uint256 orderId) private {
        vm.prank(trader);
        book.cancelOrder(orderId);
    }

    function _assertChecks() private view {
        assertBookSorted();
        assertSolvent();
    }

    function _assertStatus(uint256 orderId, IOrderBook.Status status) private view {
        assertEq(uint8(book.getOrder(orderId).status), uint8(status), "status");
    }

    function _assertBalances(address trader, int256 baseDelta, int256 quoteDelta) private view {
        assertEq(int256(base.balanceOf(trader)) - int256(INITIAL_BALANCE), baseDelta, "base delta");
        assertEq(int256(quote.balanceOf(trader)) - int256(INITIAL_BALANCE), quoteDelta, "quote delta");
    }

    function _assertBookIds(IOrderBook.Side side, uint256[] memory expected) private view {
        IOrderBook.Order[] memory orders = book.getBook(side, expected.length + 1);
        assertEq(orders.length, expected.length, "book length");
        for (uint256 i = 0; i < expected.length; i++) {
            assertEq(orders[i].id, expected[i], "book order");
        }
    }

    function _ids(uint256 a, uint256 b) private pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _threeAsks() private returns (uint256 a, uint256 b, uint256 c) {
        a = _place(alice, SELL, 2e18, 1e18);
        b = _place(alice, SELL, 3e18, 1e18);
        c = _place(alice, SELL, 4e18, 1e18);
    }

    // Refunds

    function test_cancel_openSellRefundsBaseOnly() public {
        uint256 id = _place(alice, SELL, 2e18, 10e18);

        _cancel(alice, id);

        _assertStatus(id, IOrderBook.Status.Cancelled);
        _assertBalances(alice, 0, 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_openBuyRefundsQuoteOnly() public {
        uint256 id = _place(bob, BUY, 2.2e18, 4e18);
        assertEq(book.getOrder(id).lockedQuote, 8.8e18);

        _cancel(bob, id);

        _assertStatus(id, IOrderBook.Status.Cancelled);
        assertEq(book.getOrder(id).lockedQuote, 0);
        _assertBalances(bob, 0, 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_partlyFilledSellRefundsRemainderOnly() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        _place(bob, BUY, 2e18, 4e18);

        _cancel(alice, ask);

        _assertStatus(ask, IOrderBook.Status.Cancelled);
        assertEq(book.getOrder(ask).filled, 4e18);
        _assertBalances(alice, -4e18, 8e18);
        assertEq(base.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_partlyFilledBuyRefundsRemainderOnly() public {
        uint256 bid = _place(bob, BUY, 3e18, 10e18);
        _place(alice, SELL, 3e18, 4e18);
        assertEq(book.getOrder(bid).lockedQuote, 18e18);

        _cancel(bob, bid);

        _assertStatus(bid, IOrderBook.Status.Cancelled);
        assertEq(book.getOrder(bid).filled, 4e18);
        assertEq(book.getOrder(bid).lockedQuote, 0);
        _assertBalances(bob, 4e18, -12e18);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_buyTakerRemainderWithPriceImprovementRefundsLockedQuote() public {
        _place(alice, SELL, 2e18, 4e18);
        uint256 bid = _place(bob, BUY, 3e18, 10e18);

        _cancel(bob, bid);

        _assertBalances(bob, 4e18, -8e18);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_onlyAffectsThatOrdersEscrow() public {
        uint256 first = _place(alice, SELL, 2e18, 3e18);
        uint256 second = _place(alice, SELL, 3e18, 5e18);
        uint256 other = _place(carol, SELL, 2.5e18, 7e18);
        uint256 bid = _place(bob, BUY, 1e18, 2e18);

        _cancel(alice, first);

        assertEq(base.balanceOf(address(book)), 12e18);
        assertEq(quote.balanceOf(address(book)), 2e18);
        _assertBalances(alice, -5e18, 0);
        _assertStatus(second, IOrderBook.Status.Open);
        _assertStatus(other, IOrderBook.Status.Open);
        _assertStatus(bid, IOrderBook.Status.Open);
        _assertChecks();
    }

    // Reverts

    /// @dev Everything a failed cancel could have touched, compared before and after.
    function _assertCancelReverts(address caller, uint256 orderId, bytes4 selector) private {
        IOrderBook.Order memory before = book.getOrder(orderId);
        uint256 bookBase = base.balanceOf(address(book));
        uint256 bookQuote = quote.balanceOf(address(book));
        uint256 callerBase = base.balanceOf(caller);
        uint256 callerQuote = quote.balanceOf(caller);

        vm.expectRevert(selector);
        _cancel(caller, orderId);

        IOrderBook.Order memory afterwards = book.getOrder(orderId);
        assertEq(uint8(afterwards.status), uint8(before.status));
        assertEq(afterwards.filled, before.filled);
        assertEq(afterwards.lockedQuote, before.lockedQuote);
        assertEq(base.balanceOf(address(book)), bookBase);
        assertEq(quote.balanceOf(address(book)), bookQuote);
        assertEq(base.balanceOf(caller), callerBase);
        assertEq(quote.balanceOf(caller), callerQuote);
        _assertChecks();
    }

    function test_cancel_filledOrderRevertsOrderNotActive() public {
        uint256 ask = _place(alice, SELL, 2e18, 1e18);
        uint256 bid = _place(bob, BUY, 2e18, 1e18);

        _assertCancelReverts(alice, ask, IOrderBook.OrderNotActive.selector);
        _assertCancelReverts(bob, bid, IOrderBook.OrderNotActive.selector);
    }

    function test_cancel_twiceRevertsOrderNotActive() public {
        uint256 keep = _place(alice, SELL, 3e18, 1e18);
        uint256 id = _place(alice, SELL, 2e18, 1e18);
        _cancel(alice, id);

        _assertCancelReverts(alice, id, IOrderBook.OrderNotActive.selector);

        assertEq(book.bookHead(SELL), keep, "second cancel did not empty the side");
    }

    function test_cancel_nonOwnerRevertsNotOrderOwner() public {
        uint256 id = _place(alice, SELL, 2e18, 1e18);

        _assertCancelReverts(bob, id, IOrderBook.NotOrderOwner.selector);

        _assertStatus(id, IOrderBook.Status.Open);
        assertEq(book.bookHead(SELL), id);
    }

    function test_cancel_nonOwnerOnFilledOrderRevertsNotOrderOwner() public {
        uint256 ask = _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18);

        _assertCancelReverts(carol, ask, IOrderBook.NotOrderOwner.selector);
    }

    function test_cancel_unknownIdRevertsNotOrderOwner() public {
        _place(alice, SELL, 2e18, 1e18);

        _assertCancelReverts(alice, 99, IOrderBook.NotOrderOwner.selector);
        _assertCancelReverts(alice, 0, IOrderBook.NotOrderOwner.selector);
    }

    // Links

    function test_cancel_head() public {
        (uint256 a, uint256 b, uint256 c) = _threeAsks();

        _cancel(alice, a);

        assertEq(book.bookHead(SELL), b);
        assertEq(book.bookPrev(b), 0);
        assertEq(book.bookNext(a), 0);
        assertEq(book.bookPrev(a), 0);
        _assertBookIds(SELL, _ids(b, c));
        _assertChecks();
    }

    function test_cancel_middle() public {
        (uint256 a, uint256 b, uint256 c) = _threeAsks();

        _cancel(alice, b);

        assertEq(book.bookNext(a), c);
        assertEq(book.bookPrev(c), a);
        assertEq(book.bookNext(b), 0);
        assertEq(book.bookPrev(b), 0);
        _assertBookIds(SELL, _ids(a, c));
        _assertChecks();
    }

    function test_cancel_tail() public {
        (uint256 a, uint256 b, uint256 c) = _threeAsks();

        _cancel(alice, c);

        assertEq(book.bookNext(b), 0);
        assertEq(book.bookPrev(c), 0);
        _assertBookIds(SELL, _ids(a, b));
        _assertChecks();
    }

    function test_cancel_onlyElement() public {
        uint256 id = _place(bob, BUY, 2e18, 1e18);

        _cancel(bob, id);

        assertEq(book.bookHead(BUY), 0);
        (uint256 bestId, uint256 bestPrice) = book.getBestBid();
        assertEq(bestId, 0);
        assertEq(bestPrice, 0);
        _assertChecks();
    }

    function test_cancel_laterMatchingSkipsCancelledOrder() public {
        (uint256 a, uint256 b, uint256 c) = _threeAsks();
        _cancel(alice, a);

        uint256 bid = _place(bob, BUY, 4e18, 1e18);

        assertEq(book.getOrder(a).filled, 0);
        _assertStatus(b, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.bookHead(SELL), c);
        assertEq(book.lastTradePrice(), 3e18);
        _assertChecks();
    }

    // Event

    function test_cancel_emitsOrderCancelledForSell() public {
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        _place(bob, BUY, 2e18, 4e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(ask, alice, 6e18, 0);
        _cancel(alice, ask);
        _assertChecks();
    }

    function test_cancel_emitsOrderCancelledForBuy() public {
        uint256 bid = _place(bob, BUY, 3e18, 10e18);
        _place(alice, SELL, 3e18, 4e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(bid, bob, 0, 18e18);
        _cancel(bob, bid);
        _assertChecks();
    }

    function test_cancel_zeroAddressCallerOnUnknownIdRevertsNotOrderOwner() public {
        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        _cancel(address(0), 99);

        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        _cancel(address(0), 0);

        assertEq(uint8(book.getOrder(0).status), uint8(IOrderBook.Status.Open), "order 0 untouched");
        _assertChecks();
    }

    // Later matching, on both sides

    function _assertMatchingSkipsCancelled(IOrderBook.Side makerSide, uint256 cancelIndex) private {
        IOrderBook.Side takerSide = makerSide == BUY ? SELL : BUY;
        uint256[3] memory prices = makerSide == BUY ? [uint256(4e18), 3e18, 2e18] : [uint256(2e18), 3e18, 4e18];
        uint256[3] memory ids;
        for (uint256 i = 0; i < 3; i++) {
            ids[i] = _place(alice, makerSide, prices[i], 1e18);
        }

        _cancel(alice, ids[cancelIndex]);

        uint256 taker = _place(bob, takerSide, makerSide == BUY ? 1e18 : 5e18, 2e18);

        _assertStatus(taker, IOrderBook.Status.Filled);
        assertEq(book.getOrder(ids[cancelIndex]).filled, 0);
        _assertStatus(ids[cancelIndex], IOrderBook.Status.Cancelled);
        for (uint256 i = 0; i < 3; i++) {
            if (i != cancelIndex) _assertStatus(ids[i], IOrderBook.Status.Filled);
        }
        assertEq(book.bookHead(makerSide), 0);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_laterMatchingSkipsCancelledAsk_head() public {
        _assertMatchingSkipsCancelled(SELL, 0);
    }

    function test_cancel_laterMatchingSkipsCancelledAsk_middle() public {
        _assertMatchingSkipsCancelled(SELL, 1);
    }

    function test_cancel_laterMatchingSkipsCancelledAsk_tail() public {
        _assertMatchingSkipsCancelled(SELL, 2);
    }

    function test_cancel_laterMatchingSkipsCancelledBid_head() public {
        _assertMatchingSkipsCancelled(BUY, 0);
    }

    function test_cancel_laterMatchingSkipsCancelledBid_middle() public {
        _assertMatchingSkipsCancelled(BUY, 1);
    }

    function test_cancel_laterMatchingSkipsCancelledBid_tail() public {
        _assertMatchingSkipsCancelled(BUY, 2);
    }

    function test_cancel_onlyOrderThenTakerRests() public {
        uint256 ask = _place(alice, SELL, 2e18, 1e18);
        _cancel(alice, ask);

        uint256 bid = _place(bob, BUY, 3e18, 1e18);

        _assertStatus(bid, IOrderBook.Status.Open);
        assertEq(book.getOrder(ask).filled, 0);
        assertFalse(book.hasTradePrice());
        _assertChecks();
    }

    function test_cancel_keepsTimePriorityAtEqualPrice() public {
        uint256 first = _place(alice, SELL, 2e18, 1e18);
        uint256 second = _place(carol, SELL, 2e18, 1e18);
        uint256 third = _place(alice, SELL, 2e18, 1e18);
        _cancel(carol, second);

        _place(bob, BUY, 2e18, 1e18);
        _assertStatus(first, IOrderBook.Status.Filled);
        assertEq(book.bookHead(SELL), third);
        assertEq(book.getOrder(third).filled, 0);
        _assertChecks();
    }

    // Cancel interactions

    function test_cancel_sellTakerRemainderRefundsUnfilledBase() public {
        _place(bob, BUY, 3e18, 4e18);
        uint256 ask = _place(alice, SELL, 2e18, 10e18);
        assertEq(book.getOrder(ask).filled, 4e18);

        _cancel(alice, ask);

        _assertBalances(alice, -4e18, 12e18);
        _assertBalances(bob, 4e18, -12e18);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    function test_cancel_bothSidesOfCrossedBook() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        uint256 lastAsk;
        for (uint256 i = 0; i <= cap; i++) {
            lastAsk = _place(alice, SELL, 2e18, 1e18);
        }
        uint256 bid = _place(bob, BUY, 3e18, (cap + 1) * 1e18);
        (, uint256 bestBid) = book.getBestBid();
        (, uint256 bestAsk) = book.getBestAsk();
        assertGt(bestBid, bestAsk, "book should be crossed");

        _cancel(alice, lastAsk);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), bid);
        _assertChecks();

        _cancel(bob, bid);
        assertEq(book.bookHead(BUY), 0);
        _assertBalances(alice, -int256(cap * 1e18), int256(cap * 2e18));
        _assertBalances(bob, int256(cap * 1e18), -int256(cap * 2e18));
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _assertChecks();
    }

    // Logs: the event comes before the transfer, and only the refund token is touched

    function _assertRefundLogs(uint256 orderId, address trader, address refundToken, address otherToken) private {
        vm.recordLogs();
        _cancel(trader, orderId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 cancelledAt = type(uint256).max;
        uint256 refundAt = type(uint256).max;
        uint256 refundLogs = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].emitter != otherToken, "other token touched");
            if (logs[i].emitter == address(book) && logs[i].topics[0] == IOrderBook.OrderCancelled.selector) {
                cancelledAt = i;
            }
            if (logs[i].emitter == refundToken) {
                refundAt = i;
                refundLogs++;
            }
        }
        assertEq(refundLogs, 1, "one refund transfer");
        assertLt(cancelledAt, refundAt, "event before transfer");
        assertLt(refundAt, logs.length);
        _assertChecks();
    }

    function test_cancel_sellEmitsBeforeRefundAndTouchesOnlyBase() public {
        uint256 id = _place(alice, SELL, 2e18, 1e18);
        _assertRefundLogs(id, alice, address(base), address(quote));
    }

    function test_cancel_buyEmitsBeforeRefundAndTouchesOnlyQuote() public {
        uint256 id = _place(bob, BUY, 2e18, 1e18);
        _assertRefundLogs(id, bob, address(quote), address(base));
    }

    // Views

    function test_cancel_staysInUserOrdersAndLeavesBook() public {
        uint256 id = _place(alice, SELL, 2e18, 1e18);

        _cancel(alice, id);

        uint256[] memory ids = book.getUserOrderIds(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
        assertEq(book.getBook(SELL, 10).length, 0);
        _assertStatus(id, IOrderBook.Status.Cancelled);
        _assertChecks();
    }
}

/// @dev The malicious token is also the trader that owns the orders, so a re-entrant cancel passes the owner check.
/// Only the guard, and behind it the state already being final, can stop it.
contract OrderBookCancelReentrancyTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;
    uint256 private constant MINTED = 100e18;

    ReentrantERC20 private evil;

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

    function _evilPlace(IOrderBook.Side side, uint256 price, uint256 amount) private {
        evil.execute(address(book), abi.encodeCall(IOrderBook.placeLimitOrder, (side, price, amount)));
    }

    function _evilCancel(uint256 orderId) private {
        evil.execute(address(book), abi.encodeCall(IOrderBook.cancelOrder, (orderId)));
    }

    /// @dev Orders 1 and 2 belong to the token. Refunds are in the token, so the refund transfer fires the re-entry.
    function _evilOwnsTwoOrders(bool evilIsBase) private {
        _deployWithEvil(evilIsBase);
        IOrderBook.Side side = evilIsBase ? SELL : BUY;
        _evilPlace(side, 2e18, 1e18);
        _evilPlace(side, 2e18, 1e18);
    }

    function _payloads() private pure returns (bytes[] memory payloads) {
        payloads = new bytes[](5);
        payloads[0] = abi.encodeCall(IOrderBook.cancelOrder, (1));
        payloads[1] = abi.encodeCall(IOrderBook.cancelOrder, (2));
        payloads[2] = abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 5e18, 1e18));
        payloads[3] = abi.encodeCall(IOrderBook.matchOrders, (1));
        payloads[4] = abi.encodeCall(IOrderBook.triggerStopOrders, (1));
    }

    function _assertCancelRefundReentryBlocked() private {
        bytes[] memory payloads = _payloads();
        uint256 held = evil.balanceOf(address(book));
        uint256 owned = evil.balanceOf(address(evil));

        for (uint256 i = 0; i < payloads.length; i++) {
            evil.arm(address(book), payloads[i]);
            vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
            _evilCancel(1);
            evil.arm(address(0), "");

            assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
            assertEq(uint8(book.getOrder(2).status), uint8(IOrderBook.Status.Open));
            assertEq(evil.balanceOf(address(book)), held);
            assertEq(evil.balanceOf(address(evil)), owned);
            assertBookSorted();
            assertSolvent();
        }
    }

    function test_reentrancy_duringCancelRefundOfSell() public {
        _evilOwnsTwoOrders(true);
        _assertCancelRefundReentryBlocked();
    }

    function test_reentrancy_duringCancelRefundOfBuy() public {
        _evilOwnsTwoOrders(false);
        _assertCancelRefundReentryBlocked();
    }

    /// @dev Order 1 is alice's ask at 2e18. Order 2 is the token's buy at 3e18 for 2e18: the pull and the seller payout
    /// are the first two balance changes of the token, and the refund of 1e18 is the third.
    function _armedPriceImprovementFill(bytes memory payload, bool swallow) private {
        _deployWithEvil(false);
        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 1e18);
        evil.arm(address(book), payload, 2, swallow);
    }

    function _assertPriceImprovementReentryBlocked(bytes memory payload) private {
        _armedPriceImprovementFill(payload, false);
        uint256 owned = evil.balanceOf(address(evil));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _evilPlace(BUY, 3e18, 2e18);

        assertEq(book.nextOrderId(), 2);
        assertEq(evil.balanceOf(address(evil)), owned);
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
        assertFalse(book.hasTradePrice());
        assertBookSorted();
        assertSolvent();
    }

    function test_reentrancy_placeDuringPriceImprovementRefund() public {
        _assertPriceImprovementReentryBlocked(
            abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 5e18, 1e18))
        );
    }

    function test_reentrancy_cancelSameOrderDuringPriceImprovementRefund() public {
        _assertPriceImprovementReentryBlocked(abi.encodeCall(IOrderBook.cancelOrder, (2)));
    }

    /// @dev Under a missing guard, the first payload in the loop above would hide this one.
    function _assertCancelOtherOrderBlocked(bool evilIsBase) private {
        _evilOwnsTwoOrders(evilIsBase);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (2)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _evilCancel(1);

        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
        assertEq(uint8(book.getOrder(2).status), uint8(IOrderBook.Status.Open));
        assertBookSorted();
        assertSolvent();
    }

    function test_reentrancy_cancelOtherOrderDuringRefundOfSell() public {
        _assertCancelOtherOrderBlocked(true);
    }

    function test_reentrancy_cancelOtherOrderDuringRefundOfBuy() public {
        _assertCancelOtherOrderBlocked(false);
    }

    /// @dev The token owns the order being placed, which is recorded but not yet funded or in the book.
    function _assertOwnerCancelDuringPullBlocked(bool evilIsBase) private {
        _deployWithEvil(evilIsBase);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (1)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _evilPlace(evilIsBase ? SELL : BUY, 2e18, 1e18);

        assertEq(book.nextOrderId(), 1);
        assertEq(evil.balanceOf(address(evil)), MINTED);
        assertBookSorted();
        assertSolvent();
    }

    function test_reentrancy_ownerCancelDuringEscrowPullOfBase() public {
        _assertOwnerCancelDuringPullBlocked(true);
    }

    function test_reentrancy_ownerCancelDuringEscrowPullOfQuote() public {
        _assertOwnerCancelDuringPullBlocked(false);
    }

    /// @dev Order 1 is bob's bid. Order 2 is the token's sell, which crosses it. The seller payout is the first balance
    /// change of the token after arming, because the token's own escrow is in the other token.
    function test_reentrancy_ownerCancelDuringSellerPayout() public {
        _deployWithEvil(false);
        base.mint(address(evil), 10e18);
        evil.execute(address(base), abi.encodeCall(base.approve, (address(book), type(uint256).max)));
        vm.prank(bob);
        book.placeLimitOrder(BUY, 2e18, 1e18);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (2)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _evilPlace(SELL, 2e18, 2e18);

        assertEq(book.nextOrderId(), 2);
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
        assertEq(base.balanceOf(address(evil)), 10e18);
        assertBookSorted();
        assertSolvent();
    }

    /// @dev Order 1 is alice's ask. Order 2 is the token's buy, which crosses it. The buyer payout is the first balance
    /// change of the token after arming, because the token's own escrow is in the other token.
    function test_reentrancy_ownerCancelDuringBuyerPayout() public {
        _deployWithEvil(true);
        quote.mint(address(evil), 10e18);
        evil.execute(address(quote), abi.encodeCall(quote.approve, (address(book), type(uint256).max)));
        vm.prank(alice);
        book.placeLimitOrder(SELL, 2e18, 1e18);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (2)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _evilPlace(BUY, 2e18, 2e18);

        assertEq(book.nextOrderId(), 2);
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
        assertEq(quote.balanceOf(address(evil)), 10e18);
        assertBookSorted();
        assertSolvent();
    }

    // Swallow mode: the token ignores the failed inner call and carries on

    function _assertInnerFailedOnGuard() private view {
        assertTrue(evil.fired(), "re-entry fired");
        assertTrue(evil.innerCallFailed(), "inner call failed");
        assertEq(evil.innerRevertData(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }

    function test_swallow_cancelRefundOfSellPaidOnce() public {
        _evilOwnsTwoOrders(true);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (1)), 0, true);

        _evilCancel(1);

        _assertInnerFailedOnGuard();
        assertEq(evil.firedTo(), address(evil));
        assertEq(evil.firedValue(), 1e18);
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Cancelled));
        assertEq(evil.balanceOf(address(evil)), MINTED - 1e18);
        assertEq(evil.balanceOf(address(book)), 1e18);
        assertBookSorted();
        assertSolvent();
    }

    function test_swallow_cancelRefundOfBuyPaidOnce() public {
        _evilOwnsTwoOrders(false);
        evil.arm(address(book), abi.encodeCall(IOrderBook.cancelOrder, (1)), 0, true);

        _evilCancel(1);

        _assertInnerFailedOnGuard();
        assertEq(evil.firedTo(), address(evil));
        assertEq(evil.firedValue(), 2e18);
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Cancelled));
        assertEq(evil.balanceOf(address(evil)), MINTED - 2e18);
        assertEq(evil.balanceOf(address(book)), 2e18);
        assertBookSorted();
        assertSolvent();
    }

    function test_swallow_priceImprovementRefundPaidOnce() public {
        _armedPriceImprovementFill(abi.encodeCall(IOrderBook.cancelOrder, (2)), true);

        _evilPlace(BUY, 3e18, 2e18);

        _assertInnerFailedOnGuard();
        assertEq(evil.firedTo(), address(evil), "fired on the refund to the buyer");
        assertEq(evil.firedValue(), 1e18, "fired on the refund amount");

        IOrderBook.Order memory bid = book.getOrder(2);
        assertEq(uint8(bid.status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(bid.filled, 1e18);
        assertEq(bid.lockedQuote, 3e18);
        assertEq(book.bookHead(BUY), 2);
        assertEq(evil.balanceOf(address(evil)), MINTED - 5e18);
        assertEq(evil.balanceOf(address(book)), 3e18);
        assertEq(evil.balanceOf(alice), INITIAL_BALANCE + 2e18);
        assertBookSorted();
        assertSolvent();
    }
}

/// @dev Pins CEI in cancelOrder (SPEC section 5). The guard hides this ordering from writes, so only views can see it.
contract OrderBookCancelRefundViewsTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    function _assertViewsFinalDuringRefund(bool spyIsBase) private {
        ViewSpyERC20 spy = new ViewSpyERC20("Spy", "SPY");
        if (spyIsBase) {
            base = spy;
        } else {
            quote = spy;
        }
        book = new OrderBookHarness(address(base), address(quote));
        _fund(alice);

        IOrderBook.Side side = spyIsBase ? SELL : BUY;
        vm.startPrank(alice);
        uint256 id = book.placeLimitOrder(side, 2e18, 1e18);
        uint256 kept = book.placeLimitOrder(side, 2e18, 1e18);
        spy.arm(book, id, id);
        book.cancelOrder(id);
        vm.stopPrank();

        (bool taken,,, IOrderBook.Status status,,, uint256 sellHead, uint256 buyHead, uint256 lockedQuote) =
            spy.snapshot();

        assertTrue(taken);
        assertEq(uint8(status), uint8(IOrderBook.Status.Cancelled), "status final before the refund");
        assertEq(lockedQuote, 0, "lockedQuote zero before the refund");
        assertEq(spyIsBase ? sellHead : buyHead, kept, "unlinked before the refund");
        assertBookSorted();
        assertSolvent();
    }

    function test_cancelRefund_viewsFinalOnSell() public {
        _assertViewsFinalDuringRefund(true);
    }

    function test_cancelRefund_viewsFinalOnBuy() public {
        _assertViewsFinalDuringRefund(false);
    }
}
