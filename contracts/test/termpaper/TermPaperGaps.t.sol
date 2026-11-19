// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IOrderBook} from "../../src/interfaces/IOrderBook.sol";
import {OrderBook} from "../../src/OrderBook.sol";
import {OrderBookMitigated} from "./OrderBookMitigated.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Term paper gap experiments E8 to E10. They close evidence gaps listed in docs/term-paper/OPEN_QUESTIONS.md.
/// Helpers are copied from TermPaper.t.sol (private there) so that file stays identical to the inbox copy.
/// Run from contracts/:  forge test --match-path "test/termpaper/*" --isolate -vv
contract TermPaperGapExperiments is Test {
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
    address private keeper = makeAddr("keeper"); // an honest third party with no position

    function setUp() public {
        base = new MockERC20("Base", "BASE", 18);
        quote = new MockERC20("Quote", "QUOTE", 18);
    }

    // ---------------------------------------------------------------- helpers (copied from TermPaper.t.sol)

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

    // ------------------------------------------------- E8: stop hunt with a real minimum order size (M1)

    /// @dev Same scenario as TermPaper.t.sol _stopHunt(0), but on the mitigated engine with minOrder = 0.1 base,
    /// so the attacker's self-trade must be 0.1 base instead of one lot.
    function test_E8_stopHunt_withMinOrder() public {
        uint256 minOrder = 0.1e18;
        _newBook(true, minOrder);
        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // lastTradePrice = 2.0
        _place(alice, SELL, 2.1e18, 10e18);
        _stop(carol, SELL, 1.95e18, 1.5e18, 10e18);

        uint256 attackerGas;
        _place(mallory, BUY, 1.5e18, 10e18);
        attackerGas += lastGas;
        _place(mallory, SELL, 1.95e18, minOrder); // smallest allowed print, rests inside the spread
        attackerGas += lastGas;
        _place(mallory, BUY, 1.95e18, minOrder); // self-trade: prints 1.95
        attackerGas += lastGas;
        bool moved = book.lastTradePrice() == 1.95e18;
        uint256 activated = _trigger(mallory, 1);
        attackerGas += lastGas;

        emit log_string("E8 stop hunt on the mitigated engine, M1 minOrder = 0.1 base and M2 active");
        emit log_named_uint("  reference price moved to 1.95 (1 = yes)", moved ? 1 : 0);
        emit log_named_uint("  stops activated", activated);
        emit log_named_decimal_int("  victim base sold", -_dBase(carol), 18);
        emit log_named_decimal_int("  victim quote received", _dQuote(carol), 18);
        emit log_named_decimal_int("  victim shortfall vs 2.0 last honest price", 20e18 - _dQuote(carol), 18);
        emit log_named_decimal_uint("  attacker self-trade size (base)", minOrder, 18);
        emit log_named_decimal_int("  attacker base bought", _dBase(mallory), 18);
        emit log_named_decimal_int("  attacker paper gain, marked at 2.0", _dBase(mallory) * 0.5e18 / 1e18, 18);
        emit log_named_uint("  attacker gas, all transactions", attackerGas);

        assertTrue(moved, "a minimum-size self-trade still moves the reference price");
        assertEq(activated, 1, "the victim's stop still activates");
        assertEq(_dQuote(carol), 15e18, "same outcome as E2 depth 0 on the original engine");
    }

    // ------------------------------------------------- E9: does an honest keeper defeat the attacks?

    /// @dev E1 setup at limit 2.0 (issue 007 case). Between Carol's buy and Mallory's back-run, a keeper with no
    /// position calls matchOrders. Bob's ask entered first, so it is the maker (OrderBook.sol:115) and sets 1.5.
    function test_E9_keeperClearsBeforeBackrun_sandwich() public {
        _newBook(false, 0);
        _place(bob, SELL, 1.5e18, 10e18);
        uint256 attackerGas;
        for (uint256 i = 0; i < 10; i++) {
            _place(mallory, SELL, 1.499e18, LOT);
            attackerGas += lastGas;
        }
        _place(carol, BUY, 2e18, 10e18);
        bool crossedAfterVictim = _isCrossed();

        vm.prank(keeper);
        book.matchOrders(10);
        uint256 keeperGas = _lastCallGas();
        bool crossedAfterKeeper = _isCrossed();

        emit log_string("E9 sandwich (E1 at limit 2.0), honest keeper calls matchOrders before the back-run");
        emit log_named_uint("  book crossed after victim (1 = yes)", crossedAfterVictim ? 1 : 0);
        emit log_named_uint("  book crossed after keeper (1 = yes)", crossedAfterKeeper ? 1 : 0);
        emit log_named_decimal_int("  victim base received", _dBase(carol), 18);
        emit log_named_decimal_int("  victim quote paid", -_dQuote(carol), 18);
        emit log_named_decimal_int("  victim overpaid vs 15.0", -_dQuote(carol) - 15e18, 18);
        emit log_named_decimal_int("  attacker quote delta", _dQuote(mallory), 18);
        emit log_named_decimal_int("  attacker base delta", _dBase(mallory), 18);
        emit log_named_decimal_int(
            "  attacker net, marked at 1.5", _dQuote(mallory) + _dBase(mallory) * 1.5e18 / 1e18, 18
        );
        emit log_named_uint("  attacker gas, 10 dust placements", attackerGas);
        emit log_named_uint("  keeper gas, one matchOrders call", keeperGas);

        assertTrue(crossedAfterVictim, "the fill cap left the victim crossed");
        assertFalse(crossedAfterKeeper, "the keeper cleared the crossing");
        assertEq(_dBase(carol), 10e18);
        assertLe(-_dQuote(carol), 15e18, "victim paid no more than the honest price");
        assertLe(_dQuote(mallory) + _dBase(mallory) * 1.5e18 / 1e18, 0, "attacker made nothing");
    }

    /// @dev E3 setup. The attacker triggers, then a keeper calls matchOrders before the attacker's back-run.
    /// Bob's bid entered before the stop was activated, so Bob is the maker and the stop fills at 2.0.
    function test_E9_keeperClearsBeforeBackrun_snipe() public {
        _newBook(false, 0);
        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // lastTradePrice = 2.0
        _place(bob, BUY, 2e18, 10e18);
        _stop(carol, SELL, 2e18, 1e18, 10e18);
        uint256 attackerGas;
        for (uint256 i = 0; i < 10; i++) {
            _place(mallory, BUY, 2.1e18, LOT);
            attackerGas += lastGas;
        }
        _trigger(mallory, 1);
        attackerGas += lastGas;
        bool crossedAfterTrigger = _isCrossed();

        vm.prank(keeper);
        book.matchOrders(10);
        uint256 keeperGas = _lastCallGas();

        emit log_string("E9 snipe (E3), honest keeper calls matchOrders before the back-run");
        emit log_named_uint("  book crossed after attacker trigger (1 = yes)", crossedAfterTrigger ? 1 : 0);
        emit log_named_uint("  book crossed after keeper (1 = yes)", _isCrossed() ? 1 : 0);
        emit log_named_decimal_int("  victim base sold", -_dBase(carol), 18);
        emit log_named_decimal_int("  victim quote received", _dQuote(carol), 18);
        emit log_named_decimal_int("  attacker quote delta", _dQuote(mallory), 18);
        emit log_named_decimal_int("  attacker base delta", _dBase(mallory), 18);
        emit log_named_decimal_int(
            "  attacker net, marked at 2.0", _dQuote(mallory) + _dBase(mallory) * 2e18 / 1e18, 18
        );
        emit log_named_uint("  attacker gas, 10 dust bids and trigger", attackerGas);
        emit log_named_uint("  keeper gas, one matchOrders call", keeperGas);

        assertTrue(crossedAfterTrigger);
        assertFalse(_isCrossed());
        assertEq(-_dBase(carol), 10e18);
        assertGe(_dQuote(carol), 20e18 - 1e18, "victim sold the remainder to Bob at 2.0");
        assertLe(_dQuote(mallory) + _dBase(mallory) * 2e18 / 1e18, 0, "attacker made nothing");
    }

    /// @dev E3 setup, but the attacker packs dust, trigger and back-run into ONE transaction through a contract.
    /// No victim transaction sits in the middle, so no keeper can act between the steps.
    function test_E9_atomicSnipe_noOrderingNeeded() public {
        _newBook(false, 0);
        _place(alice, SELL, 2e18, 1e18);
        _place(bob, BUY, 2e18, 1e18); // lastTradePrice = 2.0
        _place(bob, BUY, 2e18, 10e18);
        _stop(carol, SELL, 2e18, 1e18, 10e18);

        SnipeBot bot = new SnipeBot(book, base, quote);
        deal(address(base), address(bot), START);
        deal(address(quote), address(bot), START);

        vm.prank(mallory);
        bot.run();
        uint256 botGas = _lastCallGas();

        int256 botBase = int256(base.balanceOf(address(bot))) - int256(START);
        int256 botQuote = int256(quote.balanceOf(address(bot))) - int256(START);
        emit log_string("E9 atomic snipe: dust, trigger and back-run in one transaction");
        emit log_named_decimal_int("  victim base sold", -_dBase(carol), 18);
        emit log_named_decimal_int("  victim quote received", _dQuote(carol), 18);
        emit log_named_decimal_int("  attacker quote profit", botQuote, 18);
        emit log_named_decimal_int("  attacker base delta", botBase, 18);
        emit log_named_uint("  attacker gas, one transaction", botGas);
        emit log_named_uint("  book crossed afterwards (1 = yes)", _isCrossed() ? 1 : 0);

        assertEq(-_dBase(carol), 10e18);
        assertLt(_dQuote(carol), 10.1e18, "victim sold at about her limit of 1.0");
        assertGt(botQuote, 9.9e18, "attacker realised about 10 quote in one transaction");
    }

    // ------------------------------------------------- E10: M2 under a repeated attack

    /// @dev E5 setup, but the attacker front-runs every resubmission with 10 asks of `dust` at 1.499. The victim
    /// resubmits whatever was refunded, with limit 2.0, until filled or `maxRounds` is reached.
    function _repeatedSandwich(uint256 minOrder, uint256 dust, uint256 maxRounds, string memory label)
        private
        returns (uint256 rounds)
    {
        _newBook(true, minOrder);
        _place(bob, SELL, 1.5e18, 10e18);
        uint256 remaining = 10e18;
        uint256 victimGas;
        uint256 attackerGas;
        emit log_string(label);
        while (remaining > 0 && rounds < maxRounds) {
            rounds++;
            for (uint256 i = 0; i < 10; i++) {
                _place(mallory, SELL, 1.499e18, dust);
                attackerGas += lastGas;
            }
            uint256 id = _place(carol, BUY, 2e18, remaining);
            victimGas += lastGas;
            IOrderBook.Order memory o = book.getOrder(id);
            remaining = o.status == IOrderBook.Status.Cancelled ? o.amount - o.filled : 0;
            if (o.status == IOrderBook.Status.Open) break; // rested uncrossed: not expected here

            emit log_named_uint("  round", rounds);
            emit log_named_decimal_int("    victim base received, cumulative", _dBase(carol), 18);
            emit log_named_uint("    victim gas, cumulative", victimGas);
            emit log_named_uint("    attacker gas, cumulative", attackerGas);
            emit log_named_decimal_int(
                "    attacker net, marked at 1.5", _dQuote(mallory) + _dBase(mallory) * 1.5e18 / 1e18, 18
            );
        }
        emit log_named_uint("  victim transactions", rounds);
        emit log_named_decimal_int("  victim quote paid", -_dQuote(carol), 18);
        emit log_named_decimal_uint("  victim base still unfilled", remaining, 18);
        emit log_named_uint("  rounds needed to fill 10 base at this dust size", 10e18 / (10 * dust));
    }

    function test_E10_mitigatedSandwich_repeated_M2only() public {
        uint256 rounds = _repeatedSandwich(0, LOT, 5, "E10 repeated front-run, M2 only (minOrder 0), dust 1 lot");
        assertEq(rounds, 5);
        assertEq(_dBase(carol), int256(50 * LOT), "five rounds deliver only 50 lots");
        assertLe(-_dQuote(carol), int256(50 * LOT * 1.499e18 / 1e18), "never overpays");
        assertLe(_dQuote(mallory) + _dBase(mallory) * 1.5e18 / 1e18, 0, "attacker never profits");
    }

    function test_E10_mitigatedSandwich_repeated_M1andM2() public {
        uint256 rounds =
            _repeatedSandwich(0.1e18, 0.1e18, 20, "E10 repeated front-run, M1 minOrder 0.1 and M2, dust 0.1");
        assertEq(rounds, 10, "each round fills 1 base, so 10 rounds");
        assertEq(_dBase(carol), 10e18, "victim is eventually filled");
        assertLe(-_dQuote(carol), 15e18, "never overpays");
        assertLe(_dQuote(mallory) + _dBase(mallory) * 1.5e18 / 1e18, 0, "attacker never profits");
    }
}

/// @dev Attacker contract for test_E9_atomicSnipe_noOrderingNeeded. Holds its own tokens.
contract SnipeBot {
    IOrderBook private immutable book;
    IERC20 private immutable base;
    IERC20 private immutable quote;

    constructor(IOrderBook book_, IERC20 base_, IERC20 quote_) {
        book = book_;
        base = base_;
        quote = quote_;
        base_.approve(address(book_), type(uint256).max);
        quote_.approve(address(book_), type(uint256).max);
    }

    function run() external {
        for (uint256 i = 0; i < 10; i++) {
            book.placeLimitOrder(IOrderBook.Side.Buy, 2.1e18, 1e9);
        }
        book.triggerStopOrders(1);
        book.placeLimitOrder(IOrderBook.Side.Buy, 1e18, 10e18 - 10 * 1e9); // the victim's crossed remainder at 1.0
        book.placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18); // to the honest bid at 2.0
    }
}
