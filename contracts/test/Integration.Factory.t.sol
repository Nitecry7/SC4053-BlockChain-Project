// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

/// @dev Full stack, as deployed: NTU and SGDx issued by TokenFactory, the NTU/SGDx market listed through MarketFactory,
/// then the engine's bonus features (cancel, batch matching) exercised on that factory-deployed OrderBook with real
/// DemoTokens and per-order approvals, as a wallet would do it.
contract IntegrationFactoryTest is Test {
    uint256 private constant SUPPLY = 1_000_000e18;
    uint256 private constant FUNDING = 10_000e18;

    TokenFactory private tokenFactory;
    MarketFactory private marketFactory;
    IERC20 private ntu;
    IERC20 private sgdx;
    OrderBook private book;

    address private issuer = makeAddr("issuer");
    address private lister = makeAddr("lister");
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private keeper = makeAddr("keeper");

    uint256 private lastOrderId;

    function setUp() public {
        tokenFactory = new TokenFactory();
        marketFactory = new MarketFactory();

        vm.startPrank(issuer);
        ntu = IERC20(tokenFactory.createToken("NTU Token", "NTU", SUPPLY));
        sgdx = IERC20(tokenFactory.createToken("Singapore Dollar X", "SGDx", SUPPLY));
        vm.stopPrank();

        vm.prank(lister);
        book = OrderBook(marketFactory.createMarket(address(ntu), address(sgdx)));

        _fund(alice);
        _fund(bob);
    }

    function _fund(address trader) private {
        vm.startPrank(issuer);
        ntu.transfer(trader, FUNDING);
        sgdx.transfer(trader, FUNDING);
        vm.stopPrank();
    }

    /// @dev Approves exactly what the order escrows, then places it: the wallet flow the frontend uses.
    function _approveAndPlace(address trader, IOrderBook.Side side, uint256 price, uint256 amount)
        private
        returns (uint256 id)
    {
        vm.startPrank(trader);
        if (side == IOrderBook.Side.Sell) {
            ntu.approve(address(book), amount);
        } else {
            sgdx.approve(address(book), book.requiredQuote(amount, price));
        }
        id = book.placeLimitOrder(side, price, amount);
        vm.stopPrank();
        lastOrderId = id;
    }

    function _assertBalances(address trader, uint256 ntuBalance, uint256 sgdxBalance) private view {
        assertEq(ntu.balanceOf(trader), ntuBalance, "NTU balance");
        assertEq(sgdx.balanceOf(trader), sgdxBalance, "SGDx balance");
    }

    function _assertStatus(uint256 id, IOrderBook.Status status) private view {
        assertEq(uint8(book.getOrder(id).status), uint8(status), "status");
    }

    /// @dev SPEC A8 on the factory market: balances held equal unfilled sells and lockedQuote on active buys.
    function _assertSolvent() private view {
        uint256 sumBase = 0;
        uint256 sumQuote = 0;
        for (uint256 id = 1; id <= lastOrderId; id++) {
            IOrderBook.Order memory o = book.getOrder(id);
            if (o.status == IOrderBook.Status.Filled || o.status == IOrderBook.Status.Cancelled) continue;
            if (o.side == IOrderBook.Side.Sell) sumBase += o.amount - o.filled;
            else sumQuote += o.lockedQuote;
        }
        assertEq(ntu.balanceOf(address(book)), sumBase, "NTU held != unfilled sells");
        assertEq(sgdx.balanceOf(address(book)), sumQuote, "SGDx held != lockedQuote on buys");
    }

    /// @dev Bids best first (price descending), asks best first (ascending), and no terminal order listed.
    function _assertBookSorted() private view {
        for (uint8 s = 0; s < 2; s++) {
            IOrderBook.Side side = IOrderBook.Side(s);
            IOrderBook.Order[] memory orders = book.getBook(side, 200);
            for (uint256 i = 0; i < orders.length; i++) {
                assertTrue(
                    orders[i].status == IOrderBook.Status.Open || orders[i].status == IOrderBook.Status.PartiallyFilled,
                    "only live orders in the book"
                );
                if (i == 0) continue;
                if (side == IOrderBook.Side.Buy) assertGe(orders[i - 1].price, orders[i].price, "bids sorted");
                else assertLe(orders[i - 1].price, orders[i].price, "asks sorted");
            }
        }
    }

    function _assertChecks() private view {
        _assertSolvent();
        _assertBookSorted();
    }

    // The stack

    function test_stack_marketIsTheFactoryListingOfFactoryTokens() public view {
        assertTrue(tokenFactory.isFactoryToken(address(ntu)));
        assertTrue(tokenFactory.isFactoryToken(address(sgdx)));
        assertTrue(marketFactory.isMarket(address(book)));
        assertEq(marketFactory.getMarket(address(ntu), address(sgdx)), address(book));
        assertEq(book.baseToken(), address(ntu));
        assertEq(book.quoteToken(), address(sgdx));
        _assertBalances(alice, FUNDING, FUNDING);
    }

    // The brief's journey, with cancel

    /// @dev Alice sells 100 NTU at 2, Bob buys 40, settlement at the maker price, Alice cancels and gets exactly 60.
    function test_journey_sell100Buy40CancelReturnsExactly60() public {
        uint256 ask = _approveAndPlace(alice, IOrderBook.Side.Sell, 2e18, 100e18);
        _assertBalances(alice, FUNDING - 100e18, FUNDING);
        assertEq(ntu.balanceOf(address(book)), 100e18);
        _assertChecks();

        uint256 bid = _approveAndPlace(bob, IOrderBook.Side.Buy, 2e18, 40e18);
        _assertStatus(bid, IOrderBook.Status.Filled);
        _assertStatus(ask, IOrderBook.Status.PartiallyFilled);
        assertEq(book.getOrder(ask).filled, 40e18);
        assertEq(book.lastTradePrice(), 2e18);
        _assertBalances(alice, FUNDING - 100e18, FUNDING + 80e18);
        _assertBalances(bob, FUNDING + 40e18, FUNDING - 80e18);
        assertEq(ntu.balanceOf(address(book)), 60e18);
        assertEq(sgdx.balanceOf(address(book)), 0);
        assertEq(sgdx.allowance(bob, address(book)), 0, "exact approval fully used");
        _assertChecks();

        vm.expectEmit(address(book));
        emit IOrderBook.OrderCancelled(ask, alice, 60e18, 0);
        vm.prank(alice);
        book.cancelOrder(ask);

        _assertStatus(ask, IOrderBook.Status.Cancelled);
        _assertBalances(alice, FUNDING - 40e18, FUNDING + 80e18);
        _assertBalances(bob, FUNDING + 40e18, FUNDING - 80e18);
        assertEq(ntu.balanceOf(address(book)), 0);
        assertEq(sgdx.balanceOf(address(book)), 0);
        assertEq(book.getBook(IOrderBook.Side.Sell, 1).length, 0);
        _assertChecks();
    }

    function test_journey_cancelByAnotherTraderOrTwiceIsRefused() public {
        uint256 ask = _approveAndPlace(alice, IOrderBook.Side.Sell, 2e18, 100e18);

        vm.prank(bob);
        vm.expectRevert(IOrderBook.NotOrderOwner.selector);
        book.cancelOrder(ask);

        vm.startPrank(alice);
        book.cancelOrder(ask);
        vm.expectRevert(IOrderBook.OrderNotActive.selector);
        book.cancelOrder(ask);
        vm.stopPrank();

        _assertBalances(alice, FUNDING, FUNDING);
        _assertChecks();
    }

    // Multi-party batch on the factory market

    /// @dev Four sellers each post 11 asks of 1 NTU at 2; four buyers each bid 11 NTU at their own limit. Each buyer
    /// fills the per-transaction cap and rests 1 NTU crossed. One matchOrders call from a keeper settles all eight.
    function test_batch_fourBuyersFourSellersSettledInOneMatchOrders() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        address[4] memory sellers = [makeAddr("s1"), makeAddr("s2"), makeAddr("s3"), makeAddr("s4")];
        address[4] memory buyers = [makeAddr("b1"), makeAddr("b2"), makeAddr("b3"), makeAddr("b4")];
        uint256[4] memory limits = [uint256(3e18), 2.75e18, 2.5e18, 2.25e18];
        for (uint256 i = 0; i < 4; i++) {
            _fund(sellers[i]);
            _fund(buyers[i]);
        }

        for (uint256 r = 0; r <= cap; r++) {
            for (uint256 s = 0; s < 4; s++) {
                _approveAndPlace(sellers[s], IOrderBook.Side.Sell, 2e18, 1e18);
            }
        }
        uint256[4] memory bids;
        for (uint256 b = 0; b < 4; b++) {
            bids[b] = _approveAndPlace(buyers[b], IOrderBook.Side.Buy, limits[b], (cap + 1) * 1e18);
            _assertStatus(bids[b], IOrderBook.Status.PartiallyFilled);
        }
        (, uint256 bestBid) = book.getBestBid();
        (, uint256 bestAsk) = book.getBestAsk();
        assertGe(bestBid, bestAsk, "book left crossed by the cap");
        _assertChecks();

        vm.prank(keeper);
        assertEq(book.matchOrders(cap), 4);

        for (uint256 i = 0; i < 4; i++) {
            _assertStatus(bids[i], IOrderBook.Status.Filled);
            // Every fill was at the asks' price of 2; price improvement was refunded on each fill.
            _assertBalances(sellers[i], FUNDING - (cap + 1) * 1e18, FUNDING + (cap + 1) * 2e18);
            _assertBalances(buyers[i], FUNDING + (cap + 1) * 1e18, FUNDING - (cap + 1) * 2e18);
        }
        _assertBalances(keeper, 0, 0);
        assertEq(book.getBook(IOrderBook.Side.Buy, 1).length, 0);
        assertEq(book.getBook(IOrderBook.Side.Sell, 1).length, 0);
        assertEq(ntu.balanceOf(address(book)), 0);
        assertEq(sgdx.balanceOf(address(book)), 0);
        _assertChecks();

        vm.prank(keeper);
        assertEq(book.matchOrders(1), 0, "nothing left to match");
    }

    // Stop-limit on the factory market

    /// @dev Alice protects 10 NTU with a sell stop (trigger 1.8, limit 1.7). A trade at 1.8 moves the price down to
    /// the trigger; a keeper's triggerStopOrders activates the stop, and it fills against Bob's resting bid at 1.75.
    function test_stop_tradeMovesPriceKeeperTriggersSellStopAndItFills() public {
        _approveAndPlace(alice, IOrderBook.Side.Sell, 2e18, 1e18);
        _approveAndPlace(bob, IOrderBook.Side.Buy, 2e18, 1e18); // last trade 2
        assertEq(book.lastTradePrice(), 2e18);

        vm.startPrank(alice);
        ntu.approve(address(book), 10e18);
        uint256 stop = book.placeStopLimitOrder(IOrderBook.Side.Sell, 1.8e18, 1.7e18, 10e18);
        vm.stopPrank();
        lastOrderId = stop;
        _assertStatus(stop, IOrderBook.Status.PendingTrigger);
        assertEq(book.getBook(IOrderBook.Side.Sell, 1).length, 0, "pending stop is not an ask");
        _assertChecks();

        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 0, "not eligible at 2");

        uint256 bid = _approveAndPlace(bob, IOrderBook.Side.Buy, 1.75e18, 10e18);
        _approveAndPlace(bob, IOrderBook.Side.Buy, 1.8e18, 1e18);
        _approveAndPlace(alice, IOrderBook.Side.Sell, 1.8e18, 1e18); // trade at 1.8: the price falls to the trigger
        assertEq(book.lastTradePrice(), 1.8e18);

        uint256 aliceNtu = ntu.balanceOf(alice);
        uint256 aliceSgdx = sgdx.balanceOf(alice);
        vm.expectEmit(address(book));
        emit IOrderBook.StopOrderTriggered(stop, 1.8e18);
        vm.prank(keeper);
        assertEq(book.triggerStopOrders(1), 1);

        _assertStatus(stop, IOrderBook.Status.Filled);
        _assertStatus(bid, IOrderBook.Status.Filled);
        assertEq(book.lastTradePrice(), 1.75e18, "filled at the bid's price, above the stop's limit");
        assertEq(ntu.balanceOf(alice), aliceNtu, "the stop's NTU was escrowed at placement");
        assertEq(sgdx.balanceOf(alice) - aliceSgdx, 17.5e18, "10 NTU at 1.75");
        _assertBalances(keeper, 0, 0);
        assertEq(ntu.balanceOf(address(book)), 0);
        assertEq(sgdx.balanceOf(address(book)), 0);
        _assertChecks();
    }

    // Listing

    function test_listing_samePairAndReversedPairAreRefused() public {
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketExists.selector, address(book)));
        marketFactory.createMarket(address(ntu), address(sgdx));

        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketExists.selector, address(book)));
        marketFactory.createMarket(address(sgdx), address(ntu));

        assertEq(marketFactory.marketCount(), 1);
    }
}
