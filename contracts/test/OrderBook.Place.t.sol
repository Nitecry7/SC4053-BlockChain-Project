// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";

contract OrderBookPlaceTest is OrderBookBase {
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

    /// @dev The whole contract state a failed placement could have touched, plus the trader's balances.
    function _assertNothingPlaced(address trader, uint256 baseBefore, uint256 quoteBefore) private view {
        assertEq(book.nextOrderId(), 1, "order ID consumed");
        assertEq(book.getOrder(1).id, 0, "order created");
        assertEq(book.getUserOrderIds(trader).length, 0, "order recorded for trader");
        assertEq(book.bookHead(BUY), 0, "bid side changed");
        assertEq(book.bookHead(SELL), 0, "ask side changed");
        assertEq(book.bookSeq(1), 0, "bookSeq stamped");
        assertEq(base.balanceOf(trader), baseBefore, "trader base changed");
        assertEq(quote.balanceOf(trader), quoteBefore, "trader quote changed");
        assertEq(base.balanceOf(address(book)), 0, "book holds base");
        assertEq(quote.balanceOf(address(book)), 0, "book holds quote");
        _assertChecks();
    }

    function _assertRevertsLeavingNoState(IOrderBook.Side side, uint256 price, uint256 amount, bytes memory reason)
        private
    {
        vm.expectRevert(reason);
        vm.prank(alice);
        book.placeLimitOrder(side, price, amount);
        _assertNothingPlaced(alice, INITIAL_BALANCE, INITIAL_BALANCE);
    }

    function _selector(bytes4 selector) private pure returns (bytes memory) {
        return abi.encodeWithSelector(selector);
    }

    // Validation reverts

    function test_place_revertsZeroAmount() public {
        _assertRevertsLeavingNoState(BUY, 1e18, 0, _selector(IOrderBook.ZeroAmount.selector));
        _assertRevertsLeavingNoState(SELL, 1e18, 0, _selector(IOrderBook.ZeroAmount.selector));
    }

    function test_place_revertsZeroPrice() public {
        _assertRevertsLeavingNoState(BUY, 0, 1e18, _selector(IOrderBook.ZeroPrice.selector));
        _assertRevertsLeavingNoState(SELL, 0, 1e18, _selector(IOrderBook.ZeroPrice.selector));
    }

    function test_place_revertsBadLot() public {
        _assertRevertsLeavingNoState(BUY, 1e18, 1e18 + 1, _selector(IOrderBook.InvalidLotSize.selector));
        _assertRevertsLeavingNoState(SELL, 1e18, 1e9 - 1, _selector(IOrderBook.InvalidLotSize.selector));
    }

    function test_place_revertsBadTick() public {
        _assertRevertsLeavingNoState(BUY, 1e18 + 1, 1e18, _selector(IOrderBook.InvalidTickSize.selector));
        _assertRevertsLeavingNoState(SELL, 1e9 - 1, 1e18, _selector(IOrderBook.InvalidTickSize.selector));
    }

    function test_place_validationOrder() public {
        _assertRevertsLeavingNoState(BUY, 0, 0, _selector(IOrderBook.ZeroAmount.selector));
        _assertRevertsLeavingNoState(BUY, 0, 1, _selector(IOrderBook.ZeroPrice.selector));
        _assertRevertsLeavingNoState(BUY, 1, 1, _selector(IOrderBook.InvalidLotSize.selector));
    }

    // Token reverts

    function test_place_revertsNoAllowance() public {
        address dave = makeAddr("dave");
        base.mint(dave, 10e18);
        quote.mint(dave, 10e18);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(book), 0, 2e18)
        );
        vm.prank(dave);
        book.placeLimitOrder(BUY, 2e18, 1e18);
        _assertNothingPlaced(dave, 10e18, 10e18);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(book), 0, 1e18)
        );
        vm.prank(dave);
        book.placeLimitOrder(SELL, 2e18, 1e18);
        _assertNothingPlaced(dave, 10e18, 10e18);
    }

    function test_place_revertsInsufficientBalance() public {
        uint256 tooMuch = 2 * INITIAL_BALANCE;
        bytes memory reason =
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, INITIAL_BALANCE, tooMuch);

        _assertRevertsLeavingNoState(BUY, 1e18, tooMuch, reason);
        _assertRevertsLeavingNoState(SELL, 1e18, tooMuch, reason);
    }

    function test_place_bookTooDeepRevertRollsBackEscrowPull() public {
        uint256 ahead = book.MAX_INSERT_SCAN() + 1;
        for (uint256 i = 0; i < ahead; i++) {
            _place(alice, SELL, (ahead - i) * 1e18, 1e18);
        }
        uint256 baseBefore = base.balanceOf(bob);

        vm.expectRevert(IOrderBook.BookTooDeep.selector);
        _place(bob, SELL, 1_000e18, 1e18);

        assertEq(base.balanceOf(bob), baseBefore);
        assertEq(book.getUserOrderIds(bob).length, 0);
        assertEq(book.nextOrderId(), ahead + 1);
        _assertChecks();
    }

    function test_place_failedAttemptDoesNotConsumeId() public {
        vm.expectRevert(IOrderBook.ZeroAmount.selector);
        _place(alice, BUY, 1e18, 0);

        assertEq(_place(alice, BUY, 1e18, 1e18), 1);
        _assertChecks();
    }

    // Escrow

    function test_place_sellPullsExactBase() public {
        _place(alice, SELL, 2e18, 10e18);

        assertEq(base.balanceOf(address(book)), 10e18);
        assertEq(base.balanceOf(alice), INITIAL_BALANCE - 10e18);
        assertEq(quote.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(alice), INITIAL_BALANCE);
        assertEq(book.getOrder(1).lockedQuote, 0);
        _assertChecks();
    }

    function test_place_buyPullsExactQuote() public {
        uint256 cost = book.requiredQuote(4e18, 2.2e18);
        assertEq(cost, 8.8e18);

        _place(bob, BUY, 2.2e18, 4e18);

        assertEq(quote.balanceOf(address(book)), cost);
        assertEq(quote.balanceOf(bob), INITIAL_BALANCE - cost);
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(base.balanceOf(bob), INITIAL_BALANCE);
        assertEq(book.getOrder(1).lockedQuote, cost);
        _assertChecks();
    }

    function test_place_smallestAlignedOrderEscrowsExactly() public {
        _place(bob, BUY, 1e9, 1e9);

        assertEq(book.getOrder(1).lockedQuote, 1);
        assertEq(quote.balanceOf(address(book)), 1);
        _assertChecks();
    }

    function test_place_escrowAccumulatesAcrossOrders() public {
        _place(alice, SELL, 3e18, 1e18);
        _place(bob, SELL, 4e18, 2e18);
        _place(carol, BUY, 1e18, 5e18);
        _place(alice, BUY, 2e18, 1e18);

        assertEq(base.balanceOf(address(book)), 3e18);
        assertEq(quote.balanceOf(address(book)), 7e18);
        _assertChecks();
    }

    function testFuzz_requiredQuote_exactForAlignedInputs(uint256 lots, uint256 ticks) public view {
        uint256 amount = bound(lots, 1, 1e24) * 1e9;
        uint256 price = bound(ticks, 1, 1e24) * 1e9;

        uint256 cost = book.requiredQuote(amount, price);

        assertEq(cost, amount * price / 1e18);
        assertEq(amount * price % 1e18, 0);
    }

    function test_requiredQuote_roundsUpForUnalignedInputs() public view {
        assertEq(book.requiredQuote(1, 1), 1);
        assertEq(book.requiredQuote(1e18, 1), 1);
        assertEq(book.requiredQuote(1e18 + 1, 1e18), 1e18 + 1);
        assertEq(book.requiredQuote(1e18 + 1, 1), 2);
        assertEq(book.requiredQuote(0, 1e18), 0);
    }

    // Stored state

    function test_place_storesOrderFields() public {
        vm.warp(1_000_000);

        uint256 buyId = _place(bob, BUY, 2.5e18, 4e18);
        IOrderBook.Order memory buy = book.getOrder(buyId);
        assertEq(buy.id, buyId);
        assertEq(buy.trader, bob);
        assertEq(uint8(buy.side), uint8(BUY));
        assertEq(buy.price, 2.5e18);
        assertEq(buy.triggerPrice, 0);
        assertEq(buy.amount, 4e18);
        assertEq(buy.filled, 0);
        assertEq(buy.lockedQuote, 10e18);
        assertEq(buy.createdAt, 1_000_000);
        assertEq(uint8(buy.status), uint8(IOrderBook.Status.Open));

        uint256 sellId = _place(alice, SELL, 3e18, 7e18);
        IOrderBook.Order memory sell = book.getOrder(sellId);
        assertEq(sell.trader, alice);
        assertEq(uint8(sell.side), uint8(SELL));
        assertEq(sell.price, 3e18);
        assertEq(sell.amount, 7e18);
        assertEq(sell.lockedQuote, 0);
        assertEq(uint8(sell.status), uint8(IOrderBook.Status.Open));
        _assertChecks();
    }

    function test_getOrder_unknownIdReturnsZeroOrder() public view {
        assertEq(book.getOrder(0).id, 0);
        assertEq(book.getOrder(99).trader, address(0));
        _assertChecks();
    }

    function test_place_idsIncreaseFromOne() public {
        assertEq(_place(alice, BUY, 1e18, 1e18), 1);
        assertEq(_place(bob, SELL, 2e18, 1e18), 2);
        assertEq(_place(alice, SELL, 3e18, 1e18), 3);
        _assertChecks();
    }

    function test_getUserOrderIds_perTrader() public {
        _place(alice, BUY, 1e18, 1e18);
        _place(bob, SELL, 2e18, 1e18);
        _place(alice, SELL, 3e18, 1e18);

        uint256[] memory aliceIds = book.getUserOrderIds(alice);
        uint256[] memory bobIds = book.getUserOrderIds(bob);

        assertEq(aliceIds.length, 2);
        assertEq(aliceIds[0], 1);
        assertEq(aliceIds[1], 3);
        assertEq(bobIds.length, 1);
        assertEq(bobIds[0], 2);
        assertEq(book.getUserOrderIds(carol).length, 0);
        _assertChecks();
    }

    // Events

    function test_place_emitsOrderPlaced() public {
        vm.expectEmit(address(book));
        emit IOrderBook.OrderPlaced(1, alice, SELL, 2e18, 10e18);
        _place(alice, SELL, 2e18, 10e18);

        vm.expectEmit(address(book));
        emit IOrderBook.OrderPlaced(2, bob, BUY, 1.5e18, 4e18);
        _place(bob, BUY, 1.5e18, 4e18);
        _assertChecks();
    }

    // Book order

    function test_place_ordersRestInPriorityOrder() public {
        uint256 bidMid1 = _place(alice, BUY, 2e18, 1e18);
        uint256 bidLow = _place(bob, BUY, 1e18, 1e18);
        uint256 bidHigh = _place(carol, BUY, 3e18, 1e18);
        uint256 bidMid2 = _place(bob, BUY, 2e18, 1e18);
        uint256 askMid1 = _place(alice, SELL, 6e18, 1e18);
        uint256 askHigh = _place(bob, SELL, 7e18, 1e18);
        uint256 askLow = _place(carol, SELL, 5e18, 1e18);
        uint256 askMid2 = _place(bob, SELL, 6e18, 1e18);

        IOrderBook.Order[] memory bids = book.getBook(BUY, 10);
        assertEq(bids.length, 4);
        assertEq(bids[0].id, bidHigh);
        assertEq(bids[1].id, bidMid1);
        assertEq(bids[2].id, bidMid2);
        assertEq(bids[3].id, bidLow);

        IOrderBook.Order[] memory asks = book.getBook(SELL, 10);
        assertEq(asks.length, 4);
        assertEq(asks[0].id, askLow);
        assertEq(asks[1].id, askMid1);
        assertEq(asks[2].id, askMid2);
        assertEq(asks[3].id, askHigh);

        (uint256 bestBidId, uint256 bestBidPrice) = book.getBestBid();
        (uint256 bestAskId, uint256 bestAskPrice) = book.getBestAsk();
        assertEq(bestBidId, bidHigh);
        assertEq(bestBidPrice, 3e18);
        assertEq(bestAskId, askLow);
        assertEq(bestAskPrice, 5e18);
        _assertChecks();
    }

    function test_place_crossingOrderTradesInsteadOfResting() public {
        uint256 ask = _place(alice, SELL, 2e18, 1e18);
        uint256 bid = _place(bob, BUY, 3e18, 1e18);

        assertEq(book.getOrder(ask).filled, 1e18);
        assertEq(book.getOrder(bid).filled, 1e18);
        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), 0);
        assertTrue(book.hasTradePrice());
        assertEq(book.lastTradePrice(), 2e18);
        _assertChecks();
    }
}
