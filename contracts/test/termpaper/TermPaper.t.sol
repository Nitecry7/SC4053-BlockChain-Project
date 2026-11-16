// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IOrderBook} from "../../src/interfaces/IOrderBook.sol";
import {OrderBook} from "../../src/OrderBook.sol";
import {OrderBookMitigated} from "./OrderBookMitigated.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Term paper experiments. Not part of the submitted engine or its test suite.
/// Run from contracts/:  forge test --match-path "test/termpaper/*" --isolate -vv
/// Gas figures are _lastCallGas() per call under --isolate (each call is its own transaction).
contract TermPaperExperiments is Test {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;
    uint256 private constant LOT = 1e9;
    uint256 private constant START = 1_000_000e18;

    MockERC20 private base;
    MockERC20 private quote;
    IOrderBook private book;
    uint256 private lastGas;

    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private carol = makeAddr("carol"); // the victim
    address private mallory = makeAddr("mallory"); // the attacker

    function setUp() public {
        base = new MockERC20("Base", "BASE", 18);
        quote = new MockERC20("Quote", "QUOTE", 18);
    }

    // ---------------------------------------------------------------- helpers

    function _newBook(bool mitigated, uint256 minOrder) private {
        book = mitigated
            ? IOrderBook(address(new OrderBookMitigated(address(base), address(quote), minOrder)))
            : IOrderBook(address(new OrderBook(address(base), address(quote))));
        address[4] memory traders = [alice, bob, carol, mallory];
        for (uint256 i = 0; i < traders.length; i++) {
            deal(address(base), traders[i], START);
            deal(address(quote), traders[i], START);
            vm.startPrank(traders[i]);
            base.approve(address(book), type(uint256).max);
            quote.approve(address(book), type(uint256).max);
            vm.stopPrank();
        }
    }

    /// @dev Decoded by hand: the pinned forge-std Gas struct does not match this Foundry build's five-field return.
    function _lastCallGas() private view returns (uint256 used) {
        (bool ok, bytes memory ret) = address(vm).staticcall(abi.encodeWithSignature("lastCallGas()"));
        require(ok, "lastCallGas failed");
        (, used,,,) = abi.decode(ret, (uint256, uint256, uint256, int256, uint256));
    }

    function _place(address who, IOrderBook.Side side, uint256 price, uint256 amount) private returns (uint256 id) {
        vm.prank(who);
        id = book.placeLimitOrder(side, price, amount);
        lastGas = _lastCallGas();
    }

    function _stop(address who, IOrderBook.Side side, uint256 trigger, uint256 limit, uint256 amount)
        private
        returns (uint256 id)
    {
        vm.prank(who);
        id = book.placeStopLimitOrder(side, trigger, limit, amount);
        lastGas = _lastCallGas();
    }

    function _trigger(address who, uint256 n) private returns (uint256 done) {
        vm.prank(who);
        done = book.triggerStopOrders(n);
        lastGas = _lastCallGas();
    }

    function _dBase(address who) private view returns (int256) {
        return int256(base.balanceOf(who)) - int256(START);
    }

    function _dQuote(address who) private view returns (int256) {
        return int256(quote.balanceOf(who)) - int256(START);
    }

    function _isCrossed() private view returns (bool) {
        (uint256 bidId, uint256 bid) = book.getBestBid();
        (uint256 askId, uint256 ask) = book.getBestAsk();
        return bidId != 0 && askId != 0 && bid >= ask;
    }

    // ------------------------------------------------- E1: fill-cap sandwich

    /// @dev Bob rests an ask of 10 at 1.5. Carol buys 10 with limit `limit`. Mallory front-runs with 10 one-lot asks
    /// at 1.499, then (if the remainder rests crossed) sells into Carol at her limit and buys Bob's ask.
    function _sandwich(uint256 limit, bool resubmit) private returns (uint256 attackerGas, uint256 victimGas) {
        _place(bob, SELL, 1.5e18, 10e18);
        for (uint256 i = 0; i < 10; i++) {
            _place(mallory, SELL, 1.499e18, LOT);
            attackerGas += lastGas;
        }
        uint256 victim = _place(carol, BUY, limit, 10e18);
        victimGas = lastGas;
        IOrderBook.Order memory o = book.getOrder(victim);
        uint256 remaining = o.amount - o.filled;

        if (_isCrossed()) {
            _place(mallory, SELL, 1.5e18, remaining);
            attackerGas += lastGas;
            _place(mallory, BUY, 1.5e18, 10e18);
            attackerGas += lastGas;
        } else if (resubmit && o.status == IOrderBook.Status.Cancelled) {
            // Mitigated engine: the remainder was refunded, so Carol simply sends it again.
            _place(carol, BUY, limit, remaining);
            victimGas += lastGas;
        }
    }

    function _logSandwich(string memory label, uint256 attackerGas, uint256 victimGas) private {
        emit log_string(label);
        emit log_named_decimal_int("  victim base received", _dBase(carol), 18);
        emit log_named_decimal_int("  victim quote paid", -_dQuote(carol), 18);
        emit log_named_decimal_int("  victim overpaid vs 15.0", -_dQuote(carol) - 15e18, 18);
        emit log_named_decimal_int("  attacker quote profit", _dQuote(mallory), 18);
        emit log_named_decimal_int("  attacker base delta", _dBase(mallory), 18);
        emit log_named_uint("  attacker gas, all transactions", attackerGas);
        emit log_named_uint("  victim gas", victimGas);
    }

    function test_E1_sandwich_limitSlackSweep() public {
        uint256[4] memory limits = [uint256(1.5015e18), 1.515e18, 1.575e18, 2e18];
        string[4] memory labels = [
            "E1 original engine, limit 0.1% above best ask (1.5015)",
            "E1 original engine, limit 1% above best ask (1.515)",
            "E1 original engine, limit 5% above best ask (1.575)",
            "E1 original engine, limit 33% above best ask (2.0), issue 007 case"
        ];
        for (uint256 i = 0; i < limits.length; i++) {
            _newBook(false, 0);
            (uint256 ag, uint256 vg) = _sandwich(limits[i], false);
            _logSandwich(labels[i], ag, vg);
            assertEq(_dBase(carol), 10e18);
            assertEq(_dBase(mallory), 0);
            // Closed form: overpay = (limit - 1.5) * (10 - 10 lots) - 0.001 * 10 lots
            int256 expected = int256((limits[i] - 1.5e18) * (10e18 - 10 * LOT) / 1e18) - int256(0.001e18 * 10 * LOT / 1e18);
            assertEq(-_dQuote(carol) - 15e18, expected, "overpay matches the closed form");
            assertEq(_dQuote(mallory), expected, "attacker profit equals victim overpay");
        }
    }

    function test_E1_baseline_noAttack() public {
        _newBook(false, 0);
        _place(bob, SELL, 1.5e18, 10e18);
        _place(carol, BUY, 2e18, 10e18);
        emit log_named_decimal_int("E1 baseline, victim quote paid", -_dQuote(carol), 18);
        emit log_named_uint("E1 baseline, victim gas", lastGas);
        assertEq(-_dQuote(carol), 15e18);
    }

    // ------------------------------------------------- E2: stop hunt by wash trade

    /// @dev Last honest trade at 2.0. Honest bid of `depth` at 1.90, honest ask at 2.10. Carol has a sell stop:
    /// trigger 1.95, limit 1.50, size 10. Mallory bids 10 at 1.50, prints one lot at 1.95 against herself, then
    /// calls triggerStopOrders.
    function _stopHunt(uint256 depth) private returns (uint256 attackerGas) {
        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // lastTradePrice = 2.0
        if (depth != 0) _place(bob, BUY, 1.9e18, depth);
        _place(alice, SELL, 2.1e18, 10e18);
        _stop(carol, SELL, 1.95e18, 1.5e18, 10e18);

        _place(mallory, BUY, 1.5e18, 10e18);
        attackerGas += lastGas;
        _place(mallory, SELL, 1.95e18, LOT); // rests inside the spread
        attackerGas += lastGas;
        _place(mallory, BUY, 1.95e18, LOT); // self-trade: prints 1.95
        attackerGas += lastGas;
        assertEq(book.lastTradePrice(), 1.95e18, "one lot moved the reference price");
        assertEq(_trigger(mallory, 1), 1, "the victim's stop activated");
        attackerGas += lastGas;
    }

    function test_E2_stopHunt_depthSweep() public {
        uint256[3] memory depths = [uint256(0), 5e18, 10e18];
        string[3] memory labels = [
            "E2 stop hunt, no honest bid above the attacker",
            "E2 stop hunt, honest bid of 5 at 1.90",
            "E2 stop hunt, honest bid of 10 at 1.90"
        ];
        for (uint256 i = 0; i < depths.length; i++) {
            _newBook(false, 0);
            uint256 ag = _stopHunt(depths[i]);
            emit log_string(labels[i]);
            emit log_named_decimal_int("  victim base sold", -_dBase(carol), 18);
            emit log_named_decimal_int("  victim quote received", _dQuote(carol), 18);
            emit log_named_decimal_int("  victim shortfall vs 2.0 last honest price", 20e18 - _dQuote(carol), 18);
            emit log_named_decimal_int("  attacker base bought", _dBase(mallory), 18);
            emit log_named_decimal_int("  attacker quote paid for fills (at 1.5)", _dBase(mallory) * 1.5e18 / 1e18, 18);
            emit log_named_decimal_int("  attacker paper gain, marked at 2.0", _dBase(mallory) * 0.5e18 / 1e18, 18);
            emit log_named_uint("  attacker gas, all transactions", ag);
            assertEq(-_dBase(carol), 10e18, "the stop sold in full");
            assertEq(_dQuote(carol), int256(depths[i] * 1.9e18 / 1e18 + (10e18 - depths[i]) * 1.5e18 / 1e18));
            assertEq(_dBase(mallory), int256(10e18 - depths[i]));
        }
    }

    // ------------------------------------------------- E3: stop snipe through the shared fill budget

    /// @dev Last trade 2.0, Bob bids 10 at 2.0, Carol has a sell stop (trigger 2.0, limit 1.0, size 10) that is
    /// honestly eligible. Mallory places 10 dust bids at 2.1 and triggers. The stop spends its fills on dust and
    /// rests crossed at 1.0. Mallory buys it at 1.0 and sells to Bob at 2.0.
    function _stopSnipe(bool attack) private returns (uint256 attackerGas) {
        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // lastTradePrice = 2.0
        _place(bob, BUY, 2e18, 10e18);
        _stop(carol, SELL, 2e18, 1e18, 10e18);
        if (!attack) {
            _trigger(alice, 1);
            return 0;
        }
        for (uint256 i = 0; i < 10; i++) {
            _place(mallory, BUY, 2.1e18, LOT);
            attackerGas += lastGas;
        }
        _trigger(mallory, 1);
        attackerGas += lastGas;
        if (_isCrossed()) {
            _place(mallory, BUY, 1e18, 10e18 - 10 * LOT); // fills Carol's resting ask at her limit, 1.0
            attackerGas += lastGas;
            _place(mallory, SELL, 2e18, 10e18); // sells to Bob's bid at 2.0
            attackerGas += lastGas;
        }
    }

    function _logSnipe(string memory label, uint256 attackerGas) private {
        emit log_string(label);
        emit log_named_decimal_int("  victim base sold", -_dBase(carol), 18);
        emit log_named_decimal_int("  victim quote received", _dQuote(carol), 18);
        emit log_named_decimal_int("  attacker quote profit", _dQuote(mallory), 18);
        emit log_named_decimal_int("  attacker base delta", _dBase(mallory), 18);
        emit log_named_uint("  attacker gas, all transactions", attackerGas);
    }

    function test_E3_stopSnipe_originalEngine() public {
        _newBook(false, 0);
        _stopSnipe(false);
        _logSnipe("E3 baseline, honest trigger, no attacker", 0);
        assertEq(_dQuote(carol), 20e18, "honest outcome: 10 sold to Bob at 2.0");

        _newBook(false, 0);
        uint256 ag = _stopSnipe(true);
        _logSnipe("E3 stop snipe on the original engine", ag);
        assertEq(-_dBase(carol), 10e18);
        assertLt(_dQuote(carol), 10.1e18, "victim sold at about her limit of 1.0");
        assertGt(_dQuote(mallory), 9.9e18, "attacker realised about 10 quote");
    }

    // ------------------------------------------------- E4: dust griefing of one side of the book

    function test_E4_dustGrief_blocksBidSide() public {
        _newBook(false, 0);
        _place(alice, SELL, 1.5e18, 10e18); // best ask 1.5
        uint256 tick = 1e9;
        uint256 griefPrice = 1.5e18 - tick; // one tick below the best ask

        uint256 attackerGas;
        for (uint256 i = 0; i < 101; i++) {
            _place(mallory, BUY, griefPrice, LOT);
            attackerGas += lastGas;
        }
        emit log_string("E4 dust griefing, 101 one-lot bids one tick below the best ask");
        emit log_named_uint("  attacker gas, 101 placements", attackerGas);
        emit log_named_decimal_int("  attacker quote locked (refundable)", -_dQuote(mallory), 18);

        // Every non-crossing bid now reverts: at the grief price, and anywhere below it.
        vm.prank(bob);
        vm.expectRevert(IOrderBook.BookTooDeep.selector);
        book.placeLimitOrder(BUY, griefPrice, 5e18);
        vm.prank(bob);
        vm.expectRevert(IOrderBook.BookTooDeep.selector);
        book.placeLimitOrder(BUY, 1e18, 5e18);

        // Clearing the dust: a seller must hit all 101 lots. The fill cap spreads this over 11 calls.
        uint256 clearGas;
        _place(carol, SELL, griefPrice, 101 * LOT);
        clearGas += lastGas;
        uint256 calls = 1;
        while (_isCrossed()) {
            vm.prank(carol);
            book.matchOrders(10);
            clearGas += _lastCallGas();
            calls++;
        }
        emit log_named_uint("  defender gas to clear the dust", clearGas);
        emit log_named_uint("  defender transactions to clear", calls);
        _place(bob, BUY, 1e18, 5e18); // bids work again
        assertEq(calls, 11);
    }

    // ------------------------------------------------- E5 to E7: the mitigated prototype

    function test_E5_sandwich_onMitigatedEngine() public {
        _newBook(true, 0);
        (uint256 ag, uint256 vg) = _sandwich(2e18, true);
        _logSandwich("E5 mitigated engine, M2 only (no crossed rest), limit 2.0", ag, vg);
        assertEq(_dBase(carol), 10e18, "victim still gets her 10 after one resubmission");
        assertLe(-_dQuote(carol), 15e18, "victim never pays more than the honest price");
        assertLe(_dQuote(mallory) * 1e18 + _dBase(mallory) * 1.5e18, 0, "attacker makes nothing, marked at 1.5");
    }

    function test_E5_dustBelowMinimumIsRejected() public {
        _newBook(true, 0.1e18);
        vm.prank(mallory);
        vm.expectRevert(IOrderBook.ZeroAmount.selector);
        book.placeLimitOrder(SELL, 1.499e18, LOT);
    }

    function test_E6_gasOverheadOfMitigation() public {
        for (uint256 m = 0; m < 2; m++) {
            _newBook(m == 1, 0);
            _place(bob, SELL, 1.5e18, 10e18);
            uint256 restGas = lastGas;
            _place(carol, BUY, 1.5e18, 4e18);
            uint256 fillGas = lastGas;
            _place(carol, BUY, 1.4e18, 4e18);
            uint256 restBehindGas = lastGas;
            emit log_string(m == 0 ? "E6 original engine" : "E6 mitigated engine");
            emit log_named_uint("  first resting ask", restGas);
            emit log_named_uint("  one full fill as taker", fillGas);
            emit log_named_uint("  resting bid, opposite side non-empty", restBehindGas);
        }
    }

    function test_E7_stopSnipe_onMitigatedEngine() public {
        _newBook(true, 0);
        uint256 ag = _stopSnipe(true);
        _logSnipe("E7 stop snipe on the mitigated engine (M2)", ag);
        assertFalse(_isCrossed(), "nothing rests crossed");
        assertEq(-_dBase(carol), int256(10 * LOT), "only the dust filled; the remainder was refunded");
        assertLe(_dQuote(mallory) * 1e18 + _dBase(mallory) * 2e18, 0, "attacker makes nothing, marked at 2.0");
    }

    function test_E7_stopHunt_stillWorksOnMitigatedEngine() public {
        _newBook(true, 0);
        _stopHunt(0);
        emit log_named_decimal_int("E7 stop hunt on the mitigated engine, victim quote received", _dQuote(carol), 18);
        assertEq(_dQuote(carol), 15e18, "M1 and M2 do not fix the trigger reference price");
    }
}
