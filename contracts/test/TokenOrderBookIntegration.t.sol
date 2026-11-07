// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

/// @dev Factory-issued tokens traded on an unmodified OrderBook. Numbers follow the SPEC section 3 worked example.
contract TokenOrderBookIntegrationTest is Test {
    TokenFactory internal factory;
    IERC20 internal ntu; // base, issued by alice
    IERC20 internal sgdx; // quote, issued by bob
    OrderBook internal book;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new TokenFactory();

        vm.prank(alice);
        ntu = IERC20(factory.createToken("NTU Token", "NTU", 1_000e18));
        vm.prank(bob);
        sgdx = IERC20(factory.createToken("Singapore Dollar X", "SGDx", 1_000e18));

        book = new OrderBook(address(ntu), address(sgdx));

        vm.prank(alice);
        ntu.approve(address(book), type(uint256).max);
        vm.prank(bob);
        sgdx.approve(address(book), type(uint256).max);
    }

    function test_factoryTokensAreAcceptedByTheOrderBook() public view {
        assertEq(book.baseToken(), address(ntu));
        assertEq(book.quoteToken(), address(sgdx));
        assertTrue(factory.isFactoryToken(book.baseToken()));
        assertTrue(factory.isFactoryToken(book.quoteToken()));
    }

    /// @dev SPEC section 3: Alice sells 10 NTU at 2.0; Bob buys 4 NTU at limit 2.2, escrow 8.8 SGDx; the fill is 4 NTU at
    /// the maker price 2.0 (cost 8 SGDx); Bob is refunded 0.8 SGDx; the book holds 6 NTU and 0 SGDx.
    function test_specWorkedExample_withFactoryTokens() public {
        vm.prank(alice);
        uint256 sellId = book.placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18);

        assertEq(ntu.balanceOf(alice), 990e18);
        assertEq(ntu.balanceOf(address(book)), 10e18);

        uint256 expectedEscrow = book.requiredQuote(4e18, 2.2e18);
        assertEq(expectedEscrow, 8.8e18);

        vm.prank(bob);
        uint256 buyId = book.placeLimitOrder(IOrderBook.Side.Buy, 2.2e18, 4e18);

        // Bob: paid 8 net, received 4 NTU, and the 0.8 improvement came back.
        assertEq(sgdx.balanceOf(bob), 1_000e18 - 8e18);
        assertEq(ntu.balanceOf(bob), 4e18);
        // Alice: 10 NTU escrowed, 8 SGDx received.
        assertEq(ntu.balanceOf(alice), 990e18);
        assertEq(sgdx.balanceOf(alice), 8e18);
        // The book keeps exactly the unfilled 6 NTU and no quote.
        assertEq(ntu.balanceOf(address(book)), 6e18);
        assertEq(sgdx.balanceOf(address(book)), 0);

        IOrderBook.Order memory buy = book.getOrder(buyId);
        assertEq(uint8(buy.status), uint8(IOrderBook.Status.Filled));
        assertEq(buy.filled, 4e18);
        assertEq(buy.lockedQuote, 0);

        IOrderBook.Order memory sell = book.getOrder(sellId);
        assertEq(uint8(sell.status), uint8(IOrderBook.Status.PartiallyFilled));
        assertEq(sell.filled, 4e18);

        assertEq(book.lastTradePrice(), 2e18);
        assertTrue(book.hasTradePrice());
        _assertSolvent(sellId, buyId);
    }

    function test_tradeEventCarriesFactoryTokenAmounts() public {
        vm.prank(alice);
        book.placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18);

        vm.expectEmit(true, true, false, true, address(book));
        emit IOrderBook.Trade(1, 2, alice, bob, 2e18, 4e18, 8e18);
        vm.prank(bob);
        book.placeLimitOrder(IOrderBook.Side.Buy, 2.2e18, 4e18);
    }

    function test_noAllowance_leavesFactoryTokenBalancesUntouched() public {
        address carol = makeAddr("carol");
        vm.prank(alice);
        ntu.transfer(carol, 10e18);

        vm.prank(carol); // never approved the book
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(book), 0, 10e18)
        );
        book.placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18);

        assertEq(ntu.balanceOf(carol), 10e18);
        assertEq(ntu.balanceOf(address(book)), 0);
    }

    function _assertSolvent(uint256 sellId, uint256 buyId) internal view {
        IOrderBook.Order memory sell = book.getOrder(sellId);
        IOrderBook.Order memory buy = book.getOrder(buyId);
        uint256 baseHeld = sell.status == IOrderBook.Status.Filled ? 0 : sell.amount - sell.filled;
        uint256 quoteHeld = buy.status == IOrderBook.Status.Filled ? 0 : buy.lockedQuote;
        assertEq(ntu.balanceOf(address(book)), baseHeld, "base held != unfilled base");
        assertEq(sgdx.balanceOf(address(book)), quoteHeld, "quote held != locked quote");
    }
}
