// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {IOrderBook} from "../../src/interfaces/IOrderBook.sol";
import {OrderBookBase} from "../OrderBookBase.t.sol";
import {Handler} from "./Handler.sol";

/// @dev Shared invariant checks, used by the fuzzed invariant test and by the deterministic reach test.
abstract contract InvariantChecks is OrderBookBase {
    Handler internal handler;
    uint256 internal baseSupply;
    uint256 internal quoteSupply;

    function _deployHandler() internal {
        handler = new Handler(book, base, quote);
        baseSupply = base.totalSupply();
        quoteSupply = quote.totalSupply();
    }

    /// @dev Tokens are only moved: everyone who can hold them, plus the book, adds up to the fixed total supply.
    function _checkConservation() internal view {
        assertEq(base.totalSupply(), baseSupply, "base supply changed");
        assertEq(quote.totalSupply(), quoteSupply, "quote supply changed");
        uint256 sumBase = base.balanceOf(address(book)) + base.balanceOf(alice) + base.balanceOf(bob)
            + base.balanceOf(carol) + base.balanceOf(address(handler));
        uint256 sumQuote = quote.balanceOf(address(book)) + quote.balanceOf(alice) + quote.balanceOf(bob)
            + quote.balanceOf(carol) + quote.balanceOf(address(handler));
        for (uint256 i = 0; i < handler.participantCount(); i++) {
            sumBase += base.balanceOf(handler.participant(i));
            sumQuote += quote.balanceOf(handler.participant(i));
        }
        assertEq(sumBase, baseSupply, "base not conserved");
        assertEq(sumQuote, quoteSupply, "quote not conserved");
    }

    /// @dev Every participant's real balance equals its funding plus the reference model's ledger, which is built
    /// from the handler's own inputs and arithmetic. This catches payments of the right amount to the wrong address.
    function _checkLedger() internal view {
        uint256 funds = handler.FUNDS();
        for (uint256 i = 0; i < handler.participantCount(); i++) {
            address who = handler.participant(i);
            assertEq(int256(base.balanceOf(who)), int256(funds) + handler.netBase(who), "base ledger mismatch");
            assertEq(int256(quote.balanceOf(who)), int256(funds) + handler.netQuote(who), "quote ledger mismatch");
        }
    }

    /// @dev Per order, with reference arithmetic (exact under SPEC A1): filled <= amount; Open and pending orders have
    /// no fills; PartiallyFilled has some but not all; Filled is complete; Filled and Cancelled orders hold no escrow and
    /// no links; a live or pending buy holds exactly ceil(remaining * limit); sells never hold quote; only stops are
    /// ever pending.
    function _checkOrderFields() internal view {
        uint256 nextId = book.nextOrderId();
        for (uint256 id = 1; id < nextId; id++) {
            IOrderBook.Order memory o = book.readOrder(id);
            assertLe(o.filled, o.amount, "overfilled");
            if (o.status == IOrderBook.Status.Open || o.status == IOrderBook.Status.PendingTrigger) {
                assertEq(o.filled, 0, "Open or pending with fills");
            } else if (o.status == IOrderBook.Status.PartiallyFilled) {
                assertGt(o.filled, 0, "PartiallyFilled without fills");
                assertLt(o.filled, o.amount, "PartiallyFilled but complete");
            } else if (o.status == IOrderBook.Status.Filled) {
                assertEq(o.filled, o.amount, "Filled but not complete");
            }
            bool closed = o.status == IOrderBook.Status.Filled || o.status == IOrderBook.Status.Cancelled;
            if (closed) {
                assertEq(o.lockedQuote, 0, "closed order holds quote");
                assertEq(book.bookPrev(id), 0, "closed order keeps a prev link");
                assertEq(book.bookNext(id), 0, "closed order keeps a next link");
            } else if (o.side == IOrderBook.Side.Buy) {
                uint256 product = (o.amount - o.filled) * o.price;
                uint256 expected = product / 1e18 + (product % 1e18 == 0 ? 0 : 1);
                assertEq(o.lockedQuote, expected, "buy escrow != ceil(remaining * limit)");
            }
            if (o.side == IOrderBook.Side.Sell) assertEq(o.lockedQuote, 0, "sell holds quote");
            if (o.triggerPrice == 0) assertTrue(o.status != IOrderBook.Status.PendingTrigger, "limit order pending");
        }
    }

    function _checkHandlerFlags() internal view {
        assertFalse(handler.priceMovedWithoutTrade(), "lastTradePrice moved without a Trade");
        assertFalse(handler.triggeredBeforeTradePrice(), "a stop triggered before hasTradePrice");
        if (handler.violations() != 0) console2.log("violation:", handler.lastViolation());
        assertEq(handler.violations(), 0, "handler recorded a violation");
    }

    function _checkAll() internal view {
        assertSolvent();
        assertBookSorted();
        _checkConservation();
        _checkLedger();
        _checkOrderFields();
        _checkHandlerFlags();
    }
}

/// @dev Phase 7 invariant suite. The handler is the only target, and each invariant is checked after every call.
/// Deeper run: `FOUNDRY_PROFILE=deep forge test --match-contract OrderBookInvariantTest`.
contract OrderBookInvariantTest is InvariantChecks {
    function setUp() public override {
        super.setUp();
        _deployHandler();

        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = Handler.placeLimit.selector;
        selectors[1] = Handler.cancel.selector;
        selectors[2] = Handler.matchOrders.selector;
        selectors[3] = Handler.placeStop.selector;
        selectors[4] = Handler.triggerStops.selector;
        selectors[5] = Handler.burst.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev SPEC A8 including pending stops: base held == unfilled base on live sells and pending sell stops; quote
    /// held == lockedQuote on live buys and pending buy stops.
    function invariant_solvency() public view {
        assertSolvent();
    }

    function invariant_conservation() public view {
        _checkConservation();
    }

    function invariant_ledgerMatchesBalances() public view {
        _checkLedger();
    }

    function invariant_orderFields() public view {
        _checkOrderFields();
    }

    /// @dev Book and stop lists sorted and linked, no duplicates, book == Open/PartiallyFilled, stops == pending.
    function invariant_lists() public view {
        assertBookSorted();
    }

    /// @dev lastTradePrice moves only with a Trade and equals the last Trade's price; StopOrderTriggered carries the
    /// current price; nothing triggers before hasTradePrice; no unexpected revert, return mismatch, wrong payout or
    /// illegitimate BookTooDeep or auto-cancel (all recorded by the handler during the call).
    function invariant_handlerChecks() public view {
        _checkHandlerFlags();
    }

    /// @dev After each run: matchOrders until it returns 0 leaves the book uncrossed, and everything still holds.
    function afterInvariant() public {
        uint256 cap = book.MAX_MATCHES_PER_TX();
        for (uint256 i = 0; i < 1000 && handler.isCrossed(); i++) {
            book.matchOrders(cap);
        }
        assertFalse(handler.isCrossed(), "matchOrders did not uncross the book");
        assertSolvent();
        assertBookSorted();
        handler.logSummary();
    }
}

/// @dev Proof of reach. Foundry resets state between invariant runs, so per-run counters cannot be summed across
/// runs. This test drives the SAME handler actions with a seeded pseudo-random sequence (uniform weights, like the
/// fuzzer), checks every invariant every 25 steps, and asserts that every path the invariants should cover is
/// reached.
contract OrderBookInvariantReachTest is InvariantChecks {
    function setUp() public override {
        super.setUp();
        _deployHandler();
    }

    /// @dev Chunks and checks run as external self-calls so that memory is released between them (one long call
    /// would run out of memory: Solidity never frees memory within a call).
    function runChunk(uint256 seed, uint256 from, uint256 to) external returns (uint256) {
        for (uint256 step = from; step < to; step++) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 a = seed >> 8;
            uint256 b = seed >> 40;
            uint256 c = seed >> 72;
            uint256 d = seed >> 104;
            uint256 e = seed >> 136;
            uint256 action = seed % 6; // uniform, as the fuzzer picks selectors
            if (action == 0) handler.placeLimit(a, b, c, d);
            else if (action == 1) handler.cancel(a, b);
            else if (action == 2) handler.matchOrders(a, b);
            else if (action == 3) handler.placeStop(a, b, c, d, e);
            else if (action == 4) handler.triggerStops(a, b);
            else handler.burst(a, b, c);
        }
        return seed;
    }

    function checkAllExternal() external view {
        _checkAll();
    }

    function test_handlerReachesEveryPath() public {
        vm.pauseGasMetering(); // a reach proof, not a gas measurement: 600 steps over a book of 1,000+ orders
        uint256 seed = 4053;
        for (uint256 from = 0; from < 600; from += 25) {
            seed = this.runChunk(seed, from, from + 25);
            this.checkAllExternal();
        }
        _checkAll();
        handler.logSummary();

        assertGt(handler.placeFills(), 0, "no crossing fills");
        assertGt(handler.placeHitCap(), 0, "the fill cap was never hit");
        assertGt(handler.crossedAfterCall(), 0, "the book was never left crossed");
        assertGt(handler.cancelOpen(), 0, "no Open cancel");
        assertGt(handler.cancelPartial(), 0, "no PartiallyFilled cancel");
        assertGt(handler.cancelPending(), 0, "no pending-stop cancel");
        assertGt(handler.matchCallsThatFilled(), 0, "matchOrders never filled");
        assertGt(handler.activations(), 0, "no stop activations");
        assertGt(handler.triggerFills(), 0, "activated stops never filled");
        assertGt(handler.triggerBudgetUsedUp(), 0, "the shared trigger budget was never used up");
        assertGt(handler.autoCancels(), 0, "the issue 006 auto-cancel path was never reached");
    }
}
