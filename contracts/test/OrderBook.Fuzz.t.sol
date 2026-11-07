// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "./OrderBookBase.t.sol";

/// @dev Phase 7 property fuzz tests with exact balance checks against independent reference arithmetic. Prices and
/// amounts are random multiples of the tick and lot; balances are checked to the wei for both traders and the book.
contract OrderBookFuzzTest is OrderBookBase {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;
    uint256 private constant MAX_TICKS = 1e11; // prices up to 100 quote per base: escrow stays far below funding
    uint256 private constant MAX_LOTS = 1e12; // amounts up to 1,000 base

    address private keeper = makeAddr("keeper");

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256) {
        vm.prank(trader);
        return book.placeLimitOrder(side, price, amount);
    }

    function _delta(address trader) private view returns (int256 b, int256 q) {
        b = int256(base.balanceOf(trader)) - int256(INITIAL_BALANCE);
        q = int256(quote.balanceOf(trader)) - int256(INITIAL_BALANCE);
    }

    /// @dev Reference cost, independent of the engine: exact for aligned inputs (SPEC A1).
    function _cost(uint256 qty, uint256 price) private pure returns (uint256) {
        return qty * price / 1e18;
    }

    function _checks() private view {
        assertBookSorted();
        assertSolvent();
    }

    /// @dev A resting maker and a crossing taker with a better limit: the fill is min(sizes) at the MAKER price, the
    /// buyer is refunded any price improvement, and the taker's remainder rests with exact escrow.
    function testFuzz_place_crossingFillSettlesExactlyAtMakerPrice(
        bool makerSells,
        uint256 makerTicks,
        uint256 improveTicks,
        uint256 makerLots,
        uint256 takerLots
    ) public {
        uint256 makerPrice = bound(makerTicks, 2, MAX_TICKS) * 1e9;
        uint256 takerPrice = makerSells
            ? makerPrice + bound(improveTicks, 0, MAX_TICKS) * 1e9
            : makerPrice - bound(improveTicks, 0, makerPrice / 1e9 - 1) * 1e9;
        uint256 makerAmount = bound(makerLots, 1, MAX_LOTS) * 1e9;
        uint256 takerAmount = bound(takerLots, 1, MAX_LOTS) * 1e9;
        Cross memory c = Cross(makerSells, makerPrice, takerPrice, makerAmount, takerAmount, 0, 0);
        c.qty = makerAmount < takerAmount ? makerAmount : takerAmount;
        c.cost = _cost(c.qty, makerPrice);

        uint256 makerId = _place(alice, makerSells ? SELL : BUY, makerPrice, makerAmount);
        uint256 takerId = _place(bob, makerSells ? BUY : SELL, takerPrice, takerAmount);

        assertEq(book.getOrder(makerId).filled, c.qty);
        assertEq(book.getOrder(takerId).filled, c.qty);
        assertEq(book.lastTradePrice(), makerPrice);
        _assertCrossBalances(c);
        _checks();
    }

    struct Cross {
        bool makerSells;
        uint256 makerPrice;
        uint256 takerPrice;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 qty;
        uint256 cost;
    }

    /// @dev The seller escrowed their whole amount; the buyer paid the cost at the maker price and still has exactly
    /// the remainder's escrow (at their own limit) locked.
    function _assertCrossBalances(Cross memory c) private view {
        (int256 aliceBase, int256 aliceQuote) = _delta(alice);
        (int256 bobBase, int256 bobQuote) = _delta(bob);
        if (c.makerSells) {
            assertEq(aliceBase, -int256(c.makerAmount));
            assertEq(aliceQuote, int256(c.cost));
            assertEq(bobBase, int256(c.qty));
            assertEq(bobQuote, -int256(c.cost + _cost(c.takerAmount - c.qty, c.takerPrice)));
        } else {
            assertEq(aliceBase, int256(c.qty));
            assertEq(aliceQuote, -int256(c.cost + _cost(c.makerAmount - c.qty, c.makerPrice)));
            assertEq(bobBase, -int256(c.takerAmount));
            assertEq(bobQuote, int256(c.cost));
        }
    }

    /// @dev After any partial fill, cancelling either order refunds exactly what it still holds (SPEC A7).
    function testFuzz_cancel_eitherSideAfterPartialFillRefundsExactly(
        bool makerSells,
        bool cancelMaker,
        uint256 priceTicks,
        uint256 makerLots,
        uint256 takerLots
    ) public {
        uint256 price = bound(priceTicks, 1, MAX_TICKS) * 1e9;
        uint256 makerAmount = bound(makerLots, 2, MAX_LOTS) * 1e9;
        uint256 takerAmount = bound(takerLots, 1, makerAmount / 1e9 - 1) * 1e9; // the maker keeps a remainder
        uint256 makerId = _place(alice, makerSells ? SELL : BUY, price, makerAmount);
        uint256 takerId = _place(bob, makerSells ? BUY : SELL, price, takerAmount);
        assertEq(uint8(book.getOrder(takerId).status), uint8(IOrderBook.Status.Filled));

        if (cancelMaker) {
            _cancelAndCheckRefund(
                makerId,
                alice,
                makerSells ? makerAmount - takerAmount : 0,
                makerSells ? 0 : _cost(makerAmount - takerAmount, price)
            );
        } else {
            vm.prank(bob);
            vm.expectRevert(IOrderBook.OrderNotActive.selector); // the taker is already Filled
            book.cancelOrder(takerId);
            vm.prank(alice);
            book.cancelOrder(makerId); // clean up so the book must end empty
        }
        assertEq(base.balanceOf(address(book)), 0);
        assertEq(quote.balanceOf(address(book)), 0);
        _checks();
    }

    /// @dev Cancels and checks the owner received exactly the reference refund (computed by the caller without the
    /// engine), and that the engine's own lockedQuote agreed with it.
    function _cancelAndCheckRefund(uint256 id, address owner, uint256 expectedBase, uint256 expectedQuote) private {
        assertEq(book.getOrder(id).lockedQuote, expectedQuote, "escrow != reference");
        uint256 baseBefore = base.balanceOf(owner);
        uint256 quoteBefore = quote.balanceOf(owner);
        vm.prank(owner);
        book.cancelOrder(id);
        assertEq(base.balanceOf(owner) - baseBefore, expectedBase, "base refund");
        assertEq(quote.balanceOf(owner) - quoteBefore, expectedQuote, "quote refund");
    }

    /// @dev Random-size asks and a capped bid at a random premium: batch matching clears the crossing and every
    /// balance equals the reference sum of maker-price costs.
    function testFuzz_batch_randomAskSizesClearExactly(uint256 seed, uint256 askCount, uint256 premiumTicks) public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        askCount = bound(askCount, cap + 1, 3 * cap);
        uint256 bidPrice = 2e18 + bound(premiumTicks, 0, 1e9) * 1e9;
        uint256 totalBase = 0;
        uint256 totalCost = 0;
        for (uint256 i = 0; i < askCount; i++) {
            uint256 h = uint256(keccak256(abi.encode(seed, i)));
            uint256 size = (1 + h % 3_000) * 1e15;
            uint256 price = 1e18 + ((h >> 16) % 1000) * 1e15; // 1.000 to 1.999
            _place(alice, SELL, price, size);
            totalBase += size;
            totalCost += _cost(size, price);
        }
        _place(bob, BUY, bidPrice, totalBase);

        for (uint256 calls = 0; calls < 4; calls++) {
            vm.prank(keeper);
            if (book.matchOrders(cap) == 0) break;
            _checks();
        }

        assertEq(book.bookHead(SELL), 0, "every ask filled");
        assertEq(book.bookHead(BUY), 0, "the bid filled");
        (int256 aliceBase, int256 aliceQuote) = _delta(alice);
        (int256 bobBase, int256 bobQuote) = _delta(bob);
        assertEq(aliceBase, -int256(totalBase));
        assertEq(aliceQuote, int256(totalCost));
        assertEq(bobBase, int256(totalBase));
        assertEq(bobQuote, -int256(totalCost), "every fill at the ask's price, improvement refunded");
        assertEq(quote.balanceOf(address(book)), 0);
        _checks();
    }

    /// @dev A random eligible sell stop activates and fills against a random bid at or above its limit: it sells
    /// min(sizes) at the BID's price, and any unfilled part rests at its limit.
    function testFuzz_trigger_sellStopFillsAtTheBidPrice(
        uint256 lastTicks,
        uint256 triggerTicks,
        uint256 limitTicks,
        uint256 bidPremiumTicks,
        uint256 stopLots,
        uint256 bidLots
    ) public {
        uint256 last = bound(lastTicks, 2, MAX_TICKS) * 1e9;
        uint256 trigger = last + bound(triggerTicks, 0, MAX_TICKS) * 1e9; // sell stop: eligible when last <= trigger
        uint256 limit = bound(limitTicks, 1, MAX_TICKS) * 1e9;
        uint256 bidPrice = limit + bound(bidPremiumTicks, 0, MAX_TICKS) * 1e9;
        uint256 stopAmount = bound(stopLots, 1, MAX_LOTS) * 1e9;
        uint256 bidAmount = bound(bidLots, 1, MAX_LOTS) * 1e9;

        _place(alice, SELL, last, 1e9);
        _place(bob, BUY, last, 1e9); // last trade at `last`, nothing resting
        uint256 bid = _place(bob, BUY, bidPrice, bidAmount);
        vm.prank(carol);
        uint256 stop = book.placeStopLimitOrder(SELL, trigger, limit, stopAmount);
        (int256 carolBase0, int256 carolQuote0) = _delta(carol);
        assertEq(carolBase0, -int256(stopAmount), "escrowed at placement");

        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 1);

        uint256 qty = stopAmount < bidAmount ? stopAmount : bidAmount;
        (int256 carolBase, int256 carolQuote) = _delta(carol);
        assertEq(carolBase, -int256(stopAmount));
        assertEq(carolQuote - carolQuote0, int256(_cost(qty, bidPrice)));
        assertEq(book.getOrder(stop).filled, qty);
        assertEq(book.getOrder(bid).filled, qty);
        assertEq(book.lastTradePrice(), bidPrice);
        assertEq(base.balanceOf(keeper), 0);
        assertEq(quote.balanceOf(keeper), 0);
        _checks();
    }

    /// @dev Review M4: a buy TAKER partly fills at the maker's better price and rests its remainder, whose escrow is
    /// recomputed at the taker's OWN limit (SPEC A5). Cancelling it refunds exactly remaining * limit.
    function testFuzz_cancel_partlyFilledTakerRemainderAfterPriceImprovement(
        uint256 askTicks,
        uint256 improveTicks,
        uint256 askLots,
        uint256 extraLots
    ) public {
        uint256 askPrice = bound(askTicks, 1, MAX_TICKS) * 1e9;
        uint256 limit = askPrice + bound(improveTicks, 1, MAX_TICKS) * 1e9;
        uint256 askAmount = bound(askLots, 1, MAX_LOTS) * 1e9;
        uint256 remaining = bound(extraLots, 1, MAX_LOTS) * 1e9;
        _place(alice, SELL, askPrice, askAmount);
        uint256 bid = _place(bob, BUY, limit, askAmount + remaining);

        assertEq(uint8(book.getOrder(bid).status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(book.getOrder(bid).lockedQuote, _cost(remaining, limit), "remainder escrow at the taker's own limit");
        (int256 b0, int256 q0) = _delta(bob);
        assertEq(b0, int256(askAmount));
        assertEq(q0, -int256(_cost(askAmount, askPrice) + _cost(remaining, limit)), "improvement refunded at fill");

        _cancelAndCheckRefund(bid, bob, 0, _cost(remaining, limit));
        (int256 b1, int256 q1) = _delta(bob);
        assertEq(b1, int256(askAmount));
        assertEq(q1, -int256(_cost(askAmount, askPrice)), "net: paid only for what was filled, at the ask's price");
        _checks();
    }

    /// @dev Review M4: a buy stop activates against two asks. If its limit reaches the asks it fills across both at
    /// each ask's price, with the improvement refunded; otherwise it rests at its limit with full escrow.
    function testFuzz_trigger_buyStopFillsAcrossMakersOrRests(
        uint256 askTicks,
        uint256 limitTicks,
        uint256 lotsA,
        uint256 lotsB,
        uint256 stopLots
    ) public {
        uint256 askPrice = bound(askTicks, 2, MAX_TICKS / 2) * 1e9;
        uint256 limit = bound(limitTicks, 1, MAX_TICKS) * 1e9;
        uint256 a = bound(lotsA, 1, MAX_LOTS / 4) * 1e9;
        uint256 b = bound(lotsB, 1, MAX_LOTS / 4) * 1e9;
        uint256 stopAmount = bound(stopLots, 1, MAX_LOTS / 2) * 1e9;

        _place(alice, SELL, askPrice, 1e9);
        _place(bob, BUY, askPrice, 1e9); // last trade at askPrice
        _place(alice, SELL, askPrice, a);
        _place(alice, SELL, askPrice + 1e9, b); // a second, worse ask
        vm.prank(carol);
        uint256 stop = book.placeStopLimitOrder(BUY, askPrice, limit, stopAmount); // eligible: last >= trigger

        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 1);

        uint256 fromA = limit >= askPrice ? (stopAmount < a ? stopAmount : a) : 0;
        uint256 left = stopAmount - fromA;
        uint256 fromB = limit >= askPrice + 1e9 ? (left < b ? left : b) : 0;
        uint256 filled = fromA + fromB;
        uint256 paid = _cost(fromA, askPrice) + _cost(fromB, askPrice + 1e9);
        uint256 stillLocked = _cost(stopAmount - filled, limit);

        assertEq(book.getOrder(stop).filled, filled);
        assertEq(book.getOrder(stop).lockedQuote, stillLocked, "remainder escrow at the stop's limit");
        (int256 cb, int256 cq) = _delta(carol);
        assertEq(cb, int256(filled));
        assertEq(cq, -int256(paid + stillLocked), "paid each ask's price; improvement refunded; remainder escrowed");
        _checks();
    }

    /// @dev Differential: requiredQuote(a, p) == ceil(a * p / 1e18) for ANY inputs whose product fits in 256 bits,
    /// aligned or not, against a reference written without the library.
    function testFuzz_requiredQuote_matchesCeilReference(uint128 amount, uint128 price) public view {
        uint256 product = uint256(amount) * uint256(price);
        uint256 reference_ = product / 1e18 + (product % 1e18 == 0 ? 0 : 1);
        assertEq(book.requiredQuote(amount, price), reference_);
    }

    /// @dev Differential in the 512-bit range: for huge inputs, requiredQuote is the smallest q with q * 1e18 >= a*p,
    /// checked with a 512-bit comparison built from mulmod, independent of OpenZeppelin's mulDiv.
    function testFuzz_requiredQuote_ceilInFullPrecision(uint256 amount, uint256 price, bool swap) public view {
        // One factor below 1e18 keeps a*p < 1e18 * 2^256, so the result fits in 256 bits, while the product itself
        // still ranges far beyond 2^256 (the issue 003 region).
        amount = bound(amount, 1, type(uint256).max);
        price = bound(price, 1, 1e18 - 1);
        if (swap) (amount, price) = (price, amount);
        (uint256 hi, uint256 lo) = _mul512(amount, price);

        uint256 q = book.requiredQuote(amount, price);
        (uint256 qhi, uint256 qlo) = _mul512(q, 1e18);
        assertTrue(_ge512(qhi, qlo, hi, lo), "q * 1e18 < a * p: not a ceiling");
        if (q > 0) {
            (uint256 phi, uint256 plo) = _mul512(q - 1, 1e18);
            assertFalse(_ge512(phi, plo, hi, lo), "(q - 1) * 1e18 >= a * p: not the smallest ceiling");
        }
    }

    function _mul512(uint256 a, uint256 b) private pure returns (uint256 hi, uint256 lo) {
        unchecked {
            uint256 mm = mulmod(a, b, type(uint256).max);
            lo = a * b;
            hi = mm - lo - (mm < lo ? 1 : 0);
        }
    }

    function _ge512(uint256 ahi, uint256 alo, uint256 bhi, uint256 blo) private pure returns (bool) {
        return ahi > bhi || (ahi == bhi && alo >= blo);
    }
}
