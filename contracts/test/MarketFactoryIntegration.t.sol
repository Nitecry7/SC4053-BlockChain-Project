// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Behaviour preservation: a market created by the factory must trade exactly like a directly deployed OrderBook.
/// Scenarios follow SPEC section 3 and the engine's own tests. The factory never takes part in a trade.
contract MarketFactoryIntegrationTest is Test {
    uint256 internal constant START = 1_000e18;

    MarketFactory internal factory;
    MockERC20 internal base;
    MockERC20 internal quote;
    OrderBook internal book; // created through the factory by `creator`, who never trades

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    function setUp() public {
        factory = new MarketFactory();
        base = new MockERC20("Base", "BASE", 18);
        quote = new MockERC20("Quote", "QUOTE", 18);

        vm.prank(creator);
        book = OrderBook(factory.createMarket(address(base), address(quote)));

        _fund(alice, book);
        _fund(bob, book);
        _fund(carol, book);
        _fund(dave, book);
    }

    function _fund(address trader, OrderBook target) internal {
        base.mint(trader, START);
        quote.mint(trader, START);
        vm.startPrank(trader);
        base.approve(address(target), type(uint256).max);
        quote.approve(address(target), type(uint256).max);
        vm.stopPrank();
    }

    function _place(address trader, IOrderBook.Side side, uint256 price, uint256 amount) internal returns (uint256 id) {
        vm.prank(trader);
        id = book.placeLimitOrder(side, price, amount);
    }

    /// @dev SPEC A8 over orders 1..lastId: held balances equal unfilled sells and locked buys.
    function _assertSolvent(uint256 lastId) internal view {
        uint256 sumBase = 0;
        uint256 sumQuote = 0;
        for (uint256 id = 1; id <= lastId; id++) {
            IOrderBook.Order memory order = book.getOrder(id);
            if (order.status == IOrderBook.Status.Filled || order.status == IOrderBook.Status.Cancelled) continue;
            if (order.side == IOrderBook.Side.Sell) sumBase += order.amount - order.filled;
            else sumQuote += order.lockedQuote;
        }
        assertEq(base.balanceOf(address(book)), sumBase, "base held != unfilled base on active sells");
        assertEq(quote.balanceOf(address(book)), sumQuote, "quote held != lockedQuote on active buys");
    }

    // ------------------------------------------------------------- the market itself

    function test_market_constantsAndImmutablesMatchADirectDeployment() public {
        OrderBook direct = new OrderBook(address(base), address(quote));

        assertEq(book.baseToken(), direct.baseToken());
        assertEq(book.quoteToken(), direct.quoteToken());
        assertEq(book.PRICE_SCALE(), direct.PRICE_SCALE());
        assertEq(book.LOT_SIZE(), direct.LOT_SIZE());
        assertEq(book.TICK_SIZE(), direct.TICK_SIZE());
        assertEq(book.MAX_MATCHES_PER_TX(), direct.MAX_MATCHES_PER_TX());
        assertEq(book.MAX_INSERT_SCAN(), direct.MAX_INSERT_SCAN());
        assertEq(book.PRICE_SCALE(), 1e18);
        assertEq(book.LOT_SIZE(), 1e9);
    }

    function test_market_runtimeBytecodeIdenticalToADirectDeployment() public {
        OrderBook direct = new OrderBook(address(base), address(quote));

        assertGt(address(book).code.length, 0);
        assertEq(keccak256(address(book).code), keccak256(address(direct).code));
    }

    /// @dev Differential check that stays valid when the bonus functions are implemented: the factory market and a
    /// direct deployment must give the same success flag and the same return or revert data for the same call.
    function test_market_everyWriteBehavesLikeADirectDeployment() public {
        OrderBook direct = new OrderBook(address(base), address(quote));
        _fund(alice, direct);

        bytes[5] memory calls = [
            abi.encodeCall(IOrderBook.cancelOrder, (1)),
            abi.encodeCall(IOrderBook.matchOrders, (1)),
            abi.encodeCall(IOrderBook.placeStopLimitOrder, (IOrderBook.Side.Buy, 1e18, 1e18, 1e18)),
            abi.encodeCall(IOrderBook.triggerStopOrders, (1)),
            abi.encodeCall(IOrderBook.placeLimitOrder, (IOrderBook.Side.Sell, 2e18, 3e18))
        ];

        for (uint256 i = 0; i < calls.length; i++) {
            vm.prank(alice);
            (bool okFactory, bytes memory dataFactory) = address(book).call(calls[i]);
            vm.prank(alice);
            (bool okDirect, bytes memory dataDirect) = address(direct).call(calls[i]);

            assertEq(okFactory, okDirect, "success flag differs");
            assertEq(dataFactory, dataDirect, "return or revert data differs");
        }
    }

    /// @dev Replays one real trade sequence on the factory market and on a direct deployment and compares the full
    /// resulting state, so the equivalence does not rest on the bytecode check alone.
    function test_market_tradeSequenceMatchesADirectDeployment() public {
        OrderBook direct = new OrderBook(address(base), address(quote));
        _fund(alice, direct);
        _fund(bob, direct);

        OrderBook[2] memory books = [book, direct];
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(alice);
            books[i].placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18);
            vm.prank(bob);
            books[i].placeLimitOrder(IOrderBook.Side.Buy, 2.2e18, 4e18);
        }

        for (uint256 id = 1; id <= 2; id++) {
            assertEq(
                keccak256(abi.encode(book.getOrder(id))), keccak256(abi.encode(direct.getOrder(id))), "order differs"
            );
        }
        assertEq(book.lastTradePrice(), direct.lastTradePrice());
        assertEq(book.hasTradePrice(), direct.hasTradePrice());
        assertEq(base.balanceOf(address(book)), base.balanceOf(address(direct)));
        assertEq(quote.balanceOf(address(book)), quote.balanceOf(address(direct)));
        (uint256 askFactory, uint256 askPriceFactory) = book.getBestAsk();
        (uint256 askDirect, uint256 askPriceDirect) = direct.getBestAsk();
        assertEq(askFactory, askDirect);
        assertEq(askPriceFactory, askPriceDirect);
    }

    /// @dev Documents the orientation limit described in docs/MARKET_FACTORY.md. Prices move in steps of TICK_SIZE =
    /// 1e9 scaled units (1e-9 quote per base), so a pair whose real price is below that cannot trade in that
    /// orientation. The first creator of a pair fixes the orientation, and the reversed pair cannot be listed.
    function test_market_orientationFixesTheSmallestTradablePrice() public {
        vm.prank(alice);
        vm.expectRevert(IOrderBook.InvalidTickSize.selector);
        book.placeLimitOrder(IOrderBook.Side.Sell, 1e6, 1e18); // 1e-12 quote per base: below one tick

        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketExists.selector, address(book)));
        factory.createMarket(address(quote), address(base)); // no way to list the inverted orientation
    }

    function test_market_factoryIsNeverTraderOrHolder() public {
        uint256 sellId = _place(alice, IOrderBook.Side.Sell, 2e18, 10e18);
        uint256 buyId = _place(bob, IOrderBook.Side.Buy, 2e18, 4e18);

        assertEq(book.getOrder(sellId).trader, alice);
        assertEq(book.getOrder(buyId).trader, bob);
        assertEq(book.getUserOrderIds(address(factory)).length, 0);
        assertEq(book.getUserOrderIds(creator).length, 0, "the creator has no special standing");
        assertEq(base.balanceOf(address(factory)) + quote.balanceOf(address(factory)), 0);
    }

    // ------------------------------------------------------------- trading behaviour

    /// @dev SPEC section 3. Alice sells 10 at 2.0; Bob buys 4 at limit 2.2 (escrow 8.8); fill 4 at the maker price 2.0
    /// (cost 8); Bob is refunded 0.8; the book holds 6 base and 0 quote.
    function test_trade_specWorkedExample() public {
        uint256 sellId = _place(alice, IOrderBook.Side.Sell, 2e18, 10e18);
        assertEq(book.requiredQuote(4e18, 2.2e18), 8.8e18);
        uint256 buyId = _place(bob, IOrderBook.Side.Buy, 2.2e18, 4e18);

        assertEq(quote.balanceOf(bob), START - 8e18);
        assertEq(base.balanceOf(bob), START + 4e18);
        assertEq(base.balanceOf(alice), START - 10e18);
        assertEq(quote.balanceOf(alice), START + 8e18);
        assertEq(base.balanceOf(address(book)), 6e18);
        assertEq(quote.balanceOf(address(book)), 0);

        IOrderBook.Order memory buy = book.getOrder(buyId);
        assertEq(uint8(buy.status), uint8(IOrderBook.Status.Filled));
        assertEq(buy.lockedQuote, 0);
        IOrderBook.Order memory sell = book.getOrder(sellId);
        assertEq(uint8(sell.status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(sell.filled, 4e18);

        assertEq(book.lastTradePrice(), 2e18);
        _assertSolvent(2);
    }

    function test_trade_partialFillExecutesAtMakerPriceWithRefund() public {
        uint256 sellId = _place(alice, IOrderBook.Side.Sell, 2e18, 10e18);

        vm.expectEmit(true, true, false, true, address(book));
        emit IOrderBook.Trade(sellId, 2, alice, bob, 2e18, 3e18, 6e18);
        uint256 buyId = _place(bob, IOrderBook.Side.Buy, 3e18, 3e18);

        // Bob limit 3.0 but pays the maker price 2.0: 6 spent, and 3 of the 9 escrowed is refunded.
        assertEq(quote.balanceOf(bob), START - 6e18);
        assertEq(base.balanceOf(bob), START + 3e18);
        assertEq(quote.balanceOf(alice), START + 6e18);
        assertEq(uint8(book.getOrder(buyId).status), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(book.getOrder(sellId).status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(book.getOrder(sellId).filled, 3e18);
        _assertSolvent(2);
    }

    function test_trade_takerPartiallyFilledRestsRemainderFunded() public {
        _place(alice, IOrderBook.Side.Sell, 2e18, 2e18);
        uint256 buyId = _place(bob, IOrderBook.Side.Buy, 2.5e18, 5e18);

        IOrderBook.Order memory buy = book.getOrder(buyId);
        assertEq(uint8(buy.status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(buy.filled, 2e18);
        assertEq(buy.lockedQuote, book.requiredQuote(3e18, 2.5e18));
        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        assertEq(bidId, buyId);
        assertEq(bidPrice, 2.5e18);
        _assertSolvent(2);
    }

    /// @dev Asks 1.5, 1.8 and 2.0 were placed in the order 1.5, 1.8, 2.0 by three makers. A buy of 5 at 2.0 sweeps them
    /// best price first, each at its own maker price, and the buyer's price improvement is refunded.
    function test_trade_pricePriorityAcrossLevels() public {
        _place(carol, IOrderBook.Side.Sell, 1.5e18, 2e18); // id 1
        _place(bob, IOrderBook.Side.Sell, 1.8e18, 2e18); // id 2
        _place(alice, IOrderBook.Side.Sell, 2e18, 2e18); // id 3

        vm.expectEmit(true, true, false, true, address(book));
        emit IOrderBook.Trade(1, 4, carol, dave, 1.5e18, 2e18, 3e18);
        vm.expectEmit(true, true, false, true, address(book));
        emit IOrderBook.Trade(2, 4, bob, dave, 1.8e18, 2e18, 3.6e18);
        vm.expectEmit(true, true, false, true, address(book));
        emit IOrderBook.Trade(3, 4, alice, dave, 2e18, 1e18, 2e18);
        uint256 buyId = _place(dave, IOrderBook.Side.Buy, 2e18, 5e18);

        // 10 escrowed, 3 + 3.6 + 2 = 8.6 spent, 1.4 refunded.
        assertEq(quote.balanceOf(dave), START - 8.6e18);
        assertEq(base.balanceOf(dave), START + 5e18);
        assertEq(quote.balanceOf(carol), START + 3e18);
        assertEq(quote.balanceOf(bob), START + 3.6e18);
        assertEq(quote.balanceOf(alice), START + 2e18);
        assertEq(uint8(book.getOrder(buyId).status), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(book.getOrder(3).status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(book.lastTradePrice(), 2e18);
        _assertSolvent(4);
    }

    /// @dev Two makers at one price: the one that entered the book first fills first.
    function test_trade_fifoAtEqualPrice() public {
        uint256 first = _place(alice, IOrderBook.Side.Sell, 2e18, 1e18);
        uint256 second = _place(bob, IOrderBook.Side.Sell, 2e18, 1e18);

        _place(carol, IOrderBook.Side.Buy, 2e18, 1e18);

        assertEq(uint8(book.getOrder(first).status), uint8(IOrderBook.Status.Filled));
        assertEq(uint8(book.getOrder(second).status), uint8(IOrderBook.Status.Open));
        assertEq(quote.balanceOf(alice), START + 2e18);
        assertEq(quote.balanceOf(bob), START);
        (uint256 askId,) = book.getBestAsk();
        assertEq(askId, second);
        _assertSolvent(3);
    }

    /// @dev MAX_MATCHES_PER_TX = 10. Eleven makers at one price: the taker gets exactly ten fills, then rests
    /// PartiallyFilled and fully funded while the book stays crossed.
    function test_trade_capLeavesFundedCrossedRemainder() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        assertEq(cap, 10);
        for (uint256 i = 0; i < cap + 1; i++) {
            _place(alice, IOrderBook.Side.Sell, 1e18, 1e18);
        }

        uint256 buyId = _place(bob, IOrderBook.Side.Buy, 1e18, (cap + 1) * 1e18);

        IOrderBook.Order memory buy = book.getOrder(buyId);
        assertEq(uint8(buy.status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(buy.filled, cap * 1e18);
        assertEq(buy.lockedQuote, book.requiredQuote(1e18, 1e18));
        (, uint256 bestBid) = book.getBestBid();
        (, uint256 bestAsk) = book.getBestAsk();
        assertGe(bestBid, bestAsk, "the book is left crossed");
        _assertSolvent(cap + 2);
    }

    function test_trade_aSecondTraderCanUseAMarketSomeoneElseCreated() public {
        // `creator` created the market, and four unrelated traders use it with no setup beyond approvals.
        _place(alice, IOrderBook.Side.Sell, 2e18, 4e18);
        _place(bob, IOrderBook.Side.Sell, 2e18, 4e18);
        _place(carol, IOrderBook.Side.Buy, 2e18, 6e18);

        assertEq(base.balanceOf(carol), START + 6e18);
        assertEq(quote.balanceOf(alice), START + 8e18);
        assertEq(quote.balanceOf(bob), START + 4e18);
        _assertSolvent(3);
    }

    /// @dev Two markets from the same factory are independent: an order on one never touches the other.
    function test_trade_marketsAreIndependent() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(creator);
        OrderBook second = OrderBook(factory.createMarket(address(base), address(other)));
        _fund(alice, second);
        other.mint(bob, START);
        vm.prank(bob);
        other.approve(address(second), type(uint256).max);

        _place(alice, IOrderBook.Side.Sell, 2e18, 5e18);

        vm.prank(bob);
        second.placeLimitOrder(IOrderBook.Side.Buy, 2e18, 1e18);

        assertEq(base.balanceOf(address(book)), 5e18, "first market untouched by the second");
        assertEq(uint8(book.getOrder(1).status), uint8(IOrderBook.Status.Open));
        assertEq(second.getOrder(1).trader, bob);
        assertEq(base.balanceOf(address(second)), 0);
        assertEq(other.balanceOf(address(second)), 2e18);
    }
}
