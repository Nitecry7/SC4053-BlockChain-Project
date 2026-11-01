// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";

contract OrderBookBookTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;

    uint256 private lastId;

    function _write(IOrderBook.Side side, uint256 price) private returns (uint256 id) {
        id = ++lastId;
        book.writeOrder(
            IOrderBook.Order({
                id: id,
                trader: alice,
                side: side,
                price: price,
                triggerPrice: 0,
                amount: 1e18,
                filled: 0,
                lockedQuote: 0,
                createdAt: uint64(block.timestamp),
                status: IOrderBook.Status.Open
            })
        );
    }

    function _rest(IOrderBook.Side side, uint256 price) private returns (uint256 id) {
        id = _write(side, price);
        book.exposedStampBookSeq(id);
        book.exposedInsert(id);
    }

    function _assertOrder(IOrderBook.Side side, uint256[] memory expected) private view {
        IOrderBook.Order[] memory orders = book.getBook(side, expected.length + 1);
        assertEq(orders.length, expected.length, "book length");
        for (uint256 i = 0; i < expected.length; i++) {
            assertEq(orders[i].id, expected[i], "book order");
        }
    }

    function _ids(uint256 a) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _ids(uint256 a, uint256 b) private pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _ids(uint256 a, uint256 b, uint256 c) private pure returns (uint256[] memory ids) {
        ids = new uint256[](3);
        ids[0] = a;
        ids[1] = b;
        ids[2] = c;
    }

    function _assertUnlinked(uint256 id) private view {
        assertEq(book.bookNext(id), 0, "next link not cleared");
        assertEq(book.bookPrev(id), 0, "prev link not cleared");
    }

    /// @dev Each new order takes the head, so the book deepens without hitting the scan limit.
    function _fillDeep(IOrderBook.Side side, uint256 count) private {
        for (uint256 i = 0; i < count; i++) {
            _rest(side, side == BUY ? (i + 1) * 1e18 : (count - i) * 1e18);
        }
    }

    function _worstPrice(IOrderBook.Side side) private pure returns (uint256) {
        return side == BUY ? 1e17 : 1_000e18;
    }

    // Ordering

    function test_insert_bidsDescendingAcrossPrices() public {
        uint256 mid = _rest(BUY, 2e18);
        uint256 low = _rest(BUY, 1e18);
        uint256 high = _rest(BUY, 3e18);

        _assertOrder(BUY, _ids(high, mid, low));
        assertBookSorted();
    }

    function test_insert_asksAscendingAcrossPrices() public {
        uint256 mid = _rest(SELL, 2e18);
        uint256 high = _rest(SELL, 3e18);
        uint256 low = _rest(SELL, 1e18);

        _assertOrder(SELL, _ids(low, mid, high));
        assertBookSorted();
    }

    function test_insert_fifoAtEqualPrice() public {
        uint256 bid1 = _rest(BUY, 2e18);
        uint256 bid2 = _rest(BUY, 2e18);
        uint256 bid3 = _rest(BUY, 2e18);
        uint256 ask1 = _rest(SELL, 2e18);
        uint256 ask2 = _rest(SELL, 2e18);
        uint256 ask3 = _rest(SELL, 2e18);

        _assertOrder(BUY, _ids(bid1, bid2, bid3));
        _assertOrder(SELL, _ids(ask1, ask2, ask3));
        assertBookSorted();
    }

    function test_insert_priceBeatsBookSeq() public {
        uint256 earlierWorse = _rest(BUY, 1e18);
        uint256 laterBetter = _rest(BUY, 2e18);

        _assertOrder(BUY, _ids(laterBetter, earlierWorse));
        assertBookSorted();
    }

    function test_insert_sidesAreIndependent() public {
        uint256 bid = _rest(BUY, 1e18);
        uint256 ask = _rest(SELL, 2e18);

        _assertOrder(BUY, _ids(bid));
        _assertOrder(SELL, _ids(ask));
        assertBookSorted();
    }

    function test_insert_higherIdWithLowerBookSeqRanksFirst() public {
        IOrderBook.Side[2] memory sides = [BUY, SELL];
        for (uint256 i = 0; i < sides.length; i++) {
            uint256 lowerId = _write(sides[i], 2e18);
            uint256 higherId = _write(sides[i], 2e18);
            book.writeBookSeq(higherId, 100 + i * 10);
            book.writeBookSeq(lowerId, 101 + i * 10);

            book.exposedInsert(lowerId);
            book.exposedInsert(higherId);

            assertGt(higherId, lowerId);
            _assertOrder(sides[i], _ids(higherId, lowerId));
        }
        assertBookSorted();
    }

    function test_insert_lowerBookSeqRanksFirstWhicheverIsInsertedFirst() public {
        uint256 lowerId = _write(SELL, 2e18);
        uint256 higherId = _write(SELL, 2e18);
        book.writeBookSeq(higherId, 100);
        book.writeBookSeq(lowerId, 101);

        book.exposedInsert(higherId);
        book.exposedInsert(lowerId);

        _assertOrder(SELL, _ids(higherId, lowerId));
        assertBookSorted();
    }

    function test_stampBookSeq_increasesAndIsNotTheOrderId() public {
        uint256 first = _write(BUY, 1e18);
        uint256 second = _write(BUY, 1e18);

        book.exposedStampBookSeq(second);
        book.exposedStampBookSeq(first);

        assertEq(book.bookSeq(second), 1);
        assertEq(book.bookSeq(first), 2);
        assertBookSorted();
    }

    // Unlinking

    function test_unlink_head() public {
        uint256 a = _rest(BUY, 3e18);
        uint256 b = _rest(BUY, 2e18);
        uint256 c = _rest(BUY, 1e18);

        book.exposedUnlink(a);

        assertEq(book.bookHead(BUY), b);
        assertEq(book.bookPrev(b), 0);
        assertEq(book.bookNext(b), c);
        _assertUnlinked(a);
        _assertOrder(BUY, _ids(b, c));
        assertBookSorted();
    }

    function test_unlink_middle() public {
        uint256 a = _rest(SELL, 1e18);
        uint256 b = _rest(SELL, 2e18);
        uint256 c = _rest(SELL, 3e18);

        book.exposedUnlink(b);

        assertEq(book.bookHead(SELL), a);
        assertEq(book.bookNext(a), c);
        assertEq(book.bookPrev(c), a);
        _assertUnlinked(b);
        _assertOrder(SELL, _ids(a, c));
        assertBookSorted();
    }

    function test_unlink_tail() public {
        uint256 a = _rest(BUY, 3e18);
        uint256 b = _rest(BUY, 2e18);
        uint256 c = _rest(BUY, 1e18);

        book.exposedUnlink(c);

        assertEq(book.bookHead(BUY), a);
        assertEq(book.bookNext(b), 0);
        assertEq(book.bookPrev(b), a);
        _assertUnlinked(c);
        _assertOrder(BUY, _ids(a, b));
        assertBookSorted();
    }

    function test_unlink_onlyElement() public {
        uint256 only = _rest(SELL, 1e18);

        book.exposedUnlink(only);

        assertEq(book.bookHead(SELL), 0);
        _assertUnlinked(only);
        assertEq(book.getBook(SELL, 10).length, 0);
        assertBookSorted();
    }

    function test_unlink_leavesOtherSideAlone() public {
        uint256 bid = _rest(BUY, 1e18);
        uint256 ask = _rest(SELL, 2e18);

        book.exposedUnlink(ask);

        assertEq(book.bookHead(SELL), 0);
        assertEq(book.bookHead(BUY), bid);
        assertBookSorted();
    }

    function test_unlink_thenInsertAgain() public {
        uint256 a = _rest(BUY, 3e18);
        uint256 b = _rest(BUY, 2e18);

        book.exposedUnlink(a);
        book.exposedInsert(a);

        _assertOrder(BUY, _ids(a, b));
        assertBookSorted();
    }

    function test_unlink_orderNotInBookDoesNotEmptySide() public {
        uint256 best = _rest(BUY, 2e18);
        uint256 worst = _rest(BUY, 1e18);
        uint256 outsider = _write(BUY, 3e18);

        try book.exposedUnlink(outsider) {} catch {}

        assertEq(book.bookHead(BUY), best);
        _assertOrder(BUY, _ids(best, worst));
        assertBookSorted();
    }

    function test_unlink_revertsWhenOrderNotInBook() public {
        _rest(SELL, 1e18);
        uint256 outsider = _write(SELL, 3e18);

        vm.expectRevert(IOrderBook.OrderNotActive.selector);
        book.exposedUnlink(outsider);
        assertBookSorted();
    }

    function test_unlink_revertsWhenAlreadyUnlinked() public {
        uint256 a = _rest(BUY, 2e18);
        uint256 b = _rest(BUY, 1e18);
        book.exposedUnlink(b);

        vm.expectRevert(IOrderBook.OrderNotActive.selector);
        book.exposedUnlink(b);

        _assertOrder(BUY, _ids(a));
        assertBookSorted();
    }

    // Scan limit

    function test_insert_succeedsWithExactlyMaxScanOrdersAhead() public {
        IOrderBook.Side[2] memory sides = [BUY, SELL];
        for (uint256 i = 0; i < sides.length; i++) {
            _fillDeep(sides[i], book.MAX_INSERT_SCAN());

            uint256 last = _rest(sides[i], _worstPrice(sides[i]));

            assertEq(book.bookNext(last), 0);
            assertEq(book.getBook(sides[i], type(uint256).max).length, book.MAX_INSERT_SCAN() + 1);
        }
        assertBookSorted();
    }

    function test_insert_revertsBookTooDeepPastMaxScan() public {
        IOrderBook.Side[2] memory sides = [BUY, SELL];
        for (uint256 i = 0; i < sides.length; i++) {
            _fillDeep(sides[i], book.MAX_INSERT_SCAN() + 1);
            uint256 last = _write(sides[i], _worstPrice(sides[i]));
            book.exposedStampBookSeq(last);

            vm.expectRevert(IOrderBook.BookTooDeep.selector);
            book.exposedInsert(last);

            _assertUnlinked(last);
            assertEq(book.getBook(sides[i], type(uint256).max).length, book.MAX_INSERT_SCAN() + 1);
        }
        assertBookSorted();
    }

    function test_insert_deepBookStillAcceptsNewBest() public {
        _fillDeep(SELL, book.MAX_INSERT_SCAN() + 1);

        uint256 best = _rest(SELL, 1e17);

        assertEq(book.bookHead(SELL), best);
        assertBookSorted();
    }

    // Views

    function test_views_emptyBookReturnsZero() public view {
        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        (uint256 askId, uint256 askPrice) = book.getBestAsk();

        assertEq(bidId, 0);
        assertEq(bidPrice, 0);
        assertEq(askId, 0);
        assertEq(askPrice, 0);
        assertEq(book.getBook(BUY, 10).length, 0);
        assertEq(book.getBook(SELL, 10).length, 0);
        assertBookSorted();
    }

    function test_getBestBidAndAsk_returnHeads() public {
        _rest(BUY, 1e18);
        uint256 bestBid = _rest(BUY, 2e18);
        _rest(SELL, 4e18);
        uint256 bestAsk = _rest(SELL, 3e18);

        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        (uint256 askId, uint256 askPrice) = book.getBestAsk();

        assertEq(bidId, bestBid);
        assertEq(bidPrice, 2e18);
        assertEq(askId, bestAsk);
        assertEq(askPrice, 3e18);
        assertBookSorted();
    }

    function test_getBook_respectsMaxOrdersInPriorityOrder() public {
        uint256 c = _rest(BUY, 1e18);
        uint256 a = _rest(BUY, 3e18);
        uint256 b = _rest(BUY, 2e18);

        IOrderBook.Order[] memory two = book.getBook(BUY, 2);
        assertEq(two.length, 2);
        assertEq(two[0].id, a);
        assertEq(two[1].id, b);
        assertEq(two[0].price, 3e18);

        assertEq(book.getBook(BUY, 0).length, 0);
        assertEq(book.getBook(BUY, 3).length, 3);

        IOrderBook.Order[] memory all = book.getBook(BUY, type(uint256).max);
        assertEq(all.length, 3);
        assertEq(all[2].id, c);
        assertBookSorted();
    }
}
