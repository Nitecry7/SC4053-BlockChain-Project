// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";
import {IOrderBook} from "../../src/interfaces/IOrderBook.sol";
import {OrderBookHarness} from "../mocks/OrderBookHarness.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Stateful fuzzing handler (Phase 7).
///
/// Actors and prices: five actors trade on prices clustered on five ticks (1.8 to 2.2), so orders cross often.
/// A dedicated `duster` posts bursts of one-lot makers so that takers hit the fill cap and leave the book crossed for
/// matchOrders. A dedicated `flooder` rests MAX_INSERT_SCAN + 1 one-lot bids at 1.7, outside the cluster so that no
/// cluster order consumes them. Any buy stop limited at 1.7 therefore cannot enter the book on activation, which is
/// the issue 006 auto-cancel path.
///
/// Reference model: the handler records every order from its OWN inputs and replays every Trade and OrderCancelled
/// event with its own arithmetic (SPEC A2 to A7: escrow, cost at the maker price, buyer refund, remaining escrow,
/// cancel refund). That yields a per-address ledger, and the invariant test checks it against real balances. The model
/// never reads the engine's lockedQuote, filled or requiredQuote, so a payment of the right amount to the wrong address,
/// a wrong refund, or a wrong price is caught.
///
/// Reverts: each action tolerates only the reverts it can legitimately hit, and the handler checks that each one is
/// legitimate. A BookTooDeep on a limit order needs more than MAX_INSERT_SCAN orders ranked ahead, and so does an
/// auto-cancel. Anything else increments `violations` and fails an invariant.
contract Handler is Test {
    IOrderBook.Side private constant BUY = IOrderBook.Side.Buy;
    IOrderBook.Side private constant SELL = IOrderBook.Side.Sell;
    uint256 public constant FUNDS = 1e27;
    uint256 private constant TICK = 0.1e18;
    uint256 private constant FLOOD_PRICE = 1.7e18;

    bytes32 private constant TRADE = keccak256("Trade(uint256,uint256,address,address,uint256,uint256,uint256)");
    bytes32 private constant CANCELLED = keccak256("OrderCancelled(uint256,address,uint256,uint256)");
    bytes32 private constant TRIGGERED = keccak256("StopOrderTriggered(uint256,uint256)");

    OrderBookHarness public immutable book;
    MockERC20 public immutable base;
    MockERC20 public immutable quote;
    address[5] public actors;
    address public immutable duster;
    address public immutable flooder;

    // ---- reference model (independent of the engine's accounting)
    struct Ref {
        address trader;
        bool isBuy;
        uint256 price; // limit price
        uint256 amount;
        uint256 filled;
        uint256 escrowQuote; // buys: what the model says is still locked
        bool closed; // filled or cancelled
    }

    mapping(uint256 orderId => Ref) public refs;
    mapping(address who => int256) public netBase;
    mapping(address who => int256) public netQuote;

    // ---- violations (each fails an invariant)
    uint256 public violations;
    string public lastViolation;
    bool public priceMovedWithoutTrade;
    bool public triggeredBeforeTradePrice;
    uint256 public tradesSeen;

    // ---- call summary (per run)
    uint256 public placeCalls;
    uint256 public placeFills;
    uint256 public placeHitCap;
    uint256 public placeTooDeep;
    uint256 public cancelOpen;
    uint256 public cancelPartial;
    uint256 public cancelPending;
    uint256 public matchCalls;
    uint256 public matchFills;
    uint256 public matchCallsThatFilled;
    uint256 public stopsPlaced;
    uint256 public triggerCalls;
    uint256 public activations;
    uint256 public triggerFills;
    uint256 public triggerBudgetUsedUp;
    uint256 public autoCancels;
    uint256 public bursts;
    uint256 public crossedAfterCall;

    constructor(OrderBookHarness book_, MockERC20 base_, MockERC20 quote_) {
        book = book_;
        base = base_;
        quote = quote_;
        for (uint256 i = 0; i < 5; i++) {
            actors[i] = _fundNew(string.concat("actor", vm.toString(i)));
        }
        duster = _fundNew("duster");
        flooder = _fundNew("flooder");

        // The flood: MAX_INSERT_SCAN + 1 one-lot bids at 1.7 on an empty book (an insert at the tail of N equal orders
        // scans N steps, so this is the most a single price level can hold).
        uint256 n = book.MAX_INSERT_SCAN() + 1;
        for (uint256 i = 0; i < n; i++) {
            _placeLimitAs(flooder, BUY, FLOOD_PRICE, 1e9);
        }
    }

    function _fundNew(string memory name) private returns (address who) {
        who = makeAddr(name);
        base.mint(who, FUNDS);
        quote.mint(who, FUNDS);
        vm.startPrank(who);
        base.approve(address(book), type(uint256).max);
        quote.approve(address(book), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ actions

    function placeLimit(uint256 actorSeed, uint256 sideSeed, uint256 priceSeed, uint256 amountSeed) external {
        placeCalls++;
        IOrderBook.Side side = sideSeed % 2 == 0 ? BUY : SELL;
        _placeLimitAs(_actor(actorSeed), side, _clusterPrice(priceSeed), _amount(amountSeed));
    }

    /// @dev Ten to fourteen one-lot makers at one cluster price from the duster: the next sizeable taker hits the
    /// fill cap, and the remainder can rest crossed for matchOrders.
    function burst(uint256 sideSeed, uint256 priceSeed, uint256 countSeed) external {
        bursts++;
        IOrderBook.Side side = sideSeed % 2 == 0 ? BUY : SELL;
        uint256 price = _clusterPrice(priceSeed);
        uint256 count = 10 + countSeed % 5;
        for (uint256 i = 0; i < count; i++) {
            if (!_placeLimitAs(duster, side, price, 1e9)) return;
        }
    }

    function cancel(uint256 actorSeed, uint256 orderSeed) external {
        address actor = _actor(actorSeed);
        uint256[] memory ids = book.getUserOrderIds(actor);
        if (ids.length == 0) return;
        uint256 start = orderSeed % ids.length;
        for (uint256 i = 0; i < ids.length && i < 32; i++) {
            uint256 id = ids[(start + i) % ids.length];
            IOrderBook.Status status = book.getOrder(id).status;
            if (status == IOrderBook.Status.Filled || status == IOrderBook.Status.Cancelled) continue;

            uint256 priceBefore = _begin();
            vm.prank(actor);
            try book.cancelOrder(id) {
                _replay(priceBefore);
                if (status == IOrderBook.Status.Open) cancelOpen++;
                else if (status == IOrderBook.Status.PartiallyFilled) cancelPartial++;
                else cancelPending++;
            } catch (bytes memory err) {
                _abort();
                _violation("cancelOrder reverted on an active owned order", err);
            }
            return;
        }
    }

    function matchOrders(uint256 actorSeed, uint256 maxSeed) external {
        matchCalls++;
        uint256 maxMatches = 1 + maxSeed % book.MAX_MATCHES_PER_TX();
        uint256 priceBefore = _begin();
        vm.prank(_actor(actorSeed));
        try book.matchOrders(maxMatches) returns (uint256 done) {
            (uint256 fills,,) = _replay(priceBefore);
            if (fills != done) _violation("matchOrders return != Trade events", "");
            if (done > maxMatches) _violation("matchOrders exceeded maxMatches", "");
            matchFills += fills;
            if (fills > 0) matchCallsThatFilled++;
        } catch (bytes memory err) {
            _abort();
            _violation("matchOrders reverted", err);
        }
    }

    /// @dev Trigger within 0.2 of the current price. Limits are cluster ticks, or the flood price 1.7 one time in
    /// six (a buy stop at 1.7 is the issue 006 path).
    function placeStop(uint256 actorSeed, uint256 sideSeed, uint256 triggerSeed, uint256 limitSeed, uint256 amountSeed)
        external
    {
        address actor = _actor(actorSeed);
        IOrderBook.Side side = sideSeed % 2 == 0 ? BUY : SELL;
        uint256 ref = book.hasTradePrice() ? book.lastTradePrice() : 2e18;
        uint256 trigger = ref + (triggerSeed % 5) * TICK;
        trigger = trigger > 2 * TICK ? trigger - 2 * TICK : TICK;
        uint256 limit = limitSeed % 6 == 5 ? FLOOD_PRICE : _clusterPrice(limitSeed);
        uint256 amount = _amount(amountSeed);

        uint256 id = book.nextOrderId();
        _record(id, actor, side, limit, amount);
        uint256 priceBefore = _begin();
        vm.prank(actor);
        try book.placeStopLimitOrder(side, trigger, limit, amount) returns (uint256 got) {
            if (got != id) _violation("placeStopLimitOrder returned an unexpected ID", "");
            _replay(priceBefore);
            stopsPlaced++;
        } catch (bytes memory err) {
            _abort();
            delete refs[id];
            _undoEscrow(actor, side, limit, amount);
            // A stop list never comes near MAX_INSERT_SCAN entries here, so no revert is legitimate.
            _violation("placeStopLimitOrder reverted", err);
        }
    }

    function triggerStops(uint256 actorSeed, uint256 maxSeed) external {
        triggerCalls++;
        uint256 maxCount = 1 + maxSeed % book.MAX_MATCHES_PER_TX();
        bool hadPrice = book.hasTradePrice();
        uint256 priceBefore = _begin();
        vm.prank(_actor(actorSeed));
        try book.triggerStopOrders(maxCount) returns (uint256 triggered) {
            (uint256 fills, uint256 activated, uint256 cancelled) = _replay(priceBefore);
            if (activated != triggered) _violation("triggerStopOrders return != StopOrderTriggered events", "");
            if (triggered > maxCount) _violation("triggerStopOrders exceeded maxCount", "");
            if (fills > book.MAX_MATCHES_PER_TX()) _violation("trigger fills exceeded the shared budget", "");
            if (!hadPrice && activated > 0) triggeredBeforeTradePrice = true;
            activations += activated;
            triggerFills += fills;
            if (fills == book.MAX_MATCHES_PER_TX()) triggerBudgetUsedUp++;
            autoCancels += cancelled;
        } catch (bytes memory err) {
            _abort();
            _violation("triggerStopOrders reverted", err);
        }
    }

    // ------------------------------------------------------------------ views for the invariant test

    function participantCount() external pure returns (uint256) {
        return 7;
    }

    function participant(uint256 i) public view returns (address) {
        if (i < 5) return actors[i];
        return i == 5 ? duster : flooder;
    }

    function isCrossed() public view returns (bool) {
        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        (uint256 askId, uint256 askPrice) = book.getBestAsk();
        return bidId != 0 && askId != 0 && bidPrice >= askPrice;
    }

    /// @dev Orders on `side` that rank ahead of a new order at `price` (better price, or equal and already resting).
    function rankedAhead(IOrderBook.Side side, uint256 price) public view returns (uint256 n) {
        IOrderBook.Order[] memory orders = book.getBook(side, book.MAX_INSERT_SCAN() + 2);
        for (uint256 i = 0; i < orders.length; i++) {
            bool ahead = side == BUY ? orders[i].price >= price : orders[i].price <= price;
            if (ahead) n++;
        }
    }

    function logSummary() external view {
        console2.log("SUMMARY place calls fills hitCap", placeCalls, placeFills, placeHitCap);
        console2.log("SUMMARY bursts placeTooDeep crossedAfterCall", bursts, placeTooDeep, crossedAfterCall);
        console2.log("SUMMARY cancel open partial pending", cancelOpen, cancelPartial, cancelPending);
        console2.log("SUMMARY match calls callsThatFilled fills", matchCalls, matchCallsThatFilled, matchFills);
        console2.log("SUMMARY stopsPlaced triggerCalls activations", stopsPlaced, triggerCalls, activations);
        console2.log("SUMMARY triggerFills budgetUsedUp autoCancels", triggerFills, triggerBudgetUsedUp, autoCancels);
        console2.log("SUMMARY violations", violations);
    }

    // ------------------------------------------------------------------ placing

    /// @dev Places a limit order with the reference model updated. Returns false on a (legitimate) BookTooDeep.
    function _placeLimitAs(address who, IOrderBook.Side side, uint256 price, uint256 amount) private returns (bool) {
        uint256 id = book.nextOrderId();
        _record(id, who, side, price, amount);
        uint256 priceBefore = _begin();
        vm.prank(who);
        try book.placeLimitOrder(side, price, amount) returns (uint256 got) {
            if (got != id) _violation("placeLimitOrder returned an unexpected ID", "");
            (uint256 fills,,) = _replay(priceBefore);
            placeFills += fills;
            uint256 cap = book.MAX_MATCHES_PER_TX();
            if (fills > cap) _violation("placement exceeded the fill cap", "");
            if (fills == cap) placeHitCap++;
            // SPEC section 5 step 4: below the cap, matching only stops when the taker no longer crosses.
            if (fills < cap && !refs[id].closed && _crossesOppositeHead(side, price)) {
                _violation("taker rested below the cap while still crossing", "");
            }
            return true;
        } catch (bytes memory err) {
            _abort();
            delete refs[id];
            _undoEscrow(who, side, price, amount);
            if (bytes4(err) == IOrderBook.BookTooDeep.selector && rankedAhead(side, price) > book.MAX_INSERT_SCAN()) {
                placeTooDeep++;
            } else {
                _violation("placeLimitOrder reverted", err);
            }
            return false;
        }
    }

    function _crossesOppositeHead(IOrderBook.Side side, uint256 price) private view returns (bool) {
        if (side == BUY) {
            (uint256 askId, uint256 askPrice) = book.getBestAsk();
            return askId != 0 && price >= askPrice;
        }
        (uint256 bidId, uint256 bidPrice) = book.getBestBid();
        return bidId != 0 && price <= bidPrice;
    }

    /// @dev Records a new order in the model and debits its escrow from the trader's ledger (SPEC A2, A3), using the
    /// model's own ceiling division.
    function _record(uint256 id, address who, IOrderBook.Side side, uint256 price, uint256 amount) private {
        bool isBuy = side == BUY;
        uint256 escrow = isBuy ? _ceilCost(amount, price) : 0;
        refs[id] = Ref(who, isBuy, price, amount, 0, escrow, false);
        if (isBuy) netQuote[who] -= int256(escrow);
        else netBase[who] -= int256(amount);
    }

    function _undoEscrow(address who, IOrderBook.Side side, uint256 price, uint256 amount) private {
        if (side == BUY) netQuote[who] += int256(_ceilCost(amount, price));
        else netBase[who] += int256(amount);
    }

    // ------------------------------------------------------------------ replaying events through the model

    function _begin() private returns (uint256 priceBefore) {
        priceBefore = book.lastTradePrice();
        vm.recordLogs();
    }

    function _abort() private {
        vm.getRecordedLogs();
    }

    /// @dev Replays this call's engine events, in order, through the reference model, and checks each one.
    function _replay(uint256 priceBefore) private returns (uint256 fills, uint256 activated, uint256 cancelled) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 running = priceBefore;
        for (uint256 i = 0; i < logs.length; i++) {
            Vm.Log memory log = logs[i];
            if (log.emitter != address(book)) continue;
            bytes32 topic = log.topics[0];
            if (topic == TRADE) {
                running = _replayTrade(log);
                fills++;
            } else if (topic == CANCELLED) {
                _replayCancel(log);
                cancelled++;
            } else if (topic == TRIGGERED) {
                uint256 id = uint256(log.topics[1]);
                uint256 price = abi.decode(log.data, (uint256));
                if (price != running) _violation("StopOrderTriggered price != current lastTradePrice", "");
                activated++;
                // A remainder that cannot enter the book is cancelled in the same call: check it was legitimate.
                _checkAutoCancelLater(id);
            }
        }
        tradesSeen += fills;
        if (fills == 0 && book.lastTradePrice() != priceBefore) priceMovedWithoutTrade = true;
        if (book.lastTradePrice() != running) _violation("lastTradePrice != price of the last Trade", "");
        if (book.hasTradePrice() != (tradesSeen > 0)) _violation("hasTradePrice does not match trades seen", "");
        if (isCrossed()) crossedAfterCall++;
        _checkPendingAutoCancels();
    }

    /// @dev SPEC A4 and A5 in the model: the cost at the maker's price, the buyer's remaining escrow at its own
    /// limit, and the refund. Credits the buyer with base and refund, and the seller with quote.
    function _replayTrade(Vm.Log memory log) private returns (uint256 price) {
        uint256 makerId = uint256(log.topics[1]);
        uint256 takerId = uint256(log.topics[2]);
        (address maker, address taker, uint256 p, uint256 qty, uint256 cost) =
            abi.decode(log.data, (address, address, uint256, uint256, uint256));
        price = p;
        Ref storage m = refs[makerId];
        Ref storage t = refs[takerId];
        if (m.trader != maker || t.trader != taker) _violation("Trade maker or taker address wrong", "");
        if (m.isBuy == t.isBuy) _violation("Trade between two orders on the same side", "");
        if (p != m.price) _violation("Trade not at the maker's price", "");
        if (cost != qty * p / 1e18) _violation("Trade quote amount != qty * price / 1e18", "");
        if (qty == 0 || m.filled + qty > m.amount || t.filled + qty > t.amount) {
            _violation("Trade size impossible", "");
        }

        Ref storage buy = m.isBuy ? m : t;
        Ref storage sell = m.isBuy ? t : m;
        uint256 refCost = qty * p / 1e18;
        buy.filled += qty;
        sell.filled += qty;
        uint256 newEscrow = _ceilCost(buy.amount - buy.filled, buy.price);
        uint256 refund = buy.escrowQuote - refCost - newEscrow;
        buy.escrowQuote = newEscrow;
        if (buy.filled == buy.amount) buy.closed = true;
        if (sell.filled == sell.amount) sell.closed = true;

        netBase[buy.trader] += int256(qty);
        netQuote[buy.trader] += int256(refund);
        netQuote[sell.trader] += int256(refCost);
    }

    /// @dev SPEC A6 and A7 in the model: a sell gets its unfilled base back, a buy its remaining escrow.
    function _replayCancel(Vm.Log memory log) private {
        uint256 id = uint256(log.topics[1]);
        address trader = address(uint160(uint256(log.topics[2])));
        (uint256 refundBase, uint256 refundQuote) = abi.decode(log.data, (uint256, uint256));
        Ref storage r = refs[id];
        if (r.closed) _violation("OrderCancelled for a closed order", "");
        if (trader != r.trader) _violation("OrderCancelled names the wrong trader", "");
        uint256 expectBase = r.isBuy ? 0 : r.amount - r.filled;
        uint256 expectQuote = r.isBuy ? r.escrowQuote : 0;
        if (refundBase != expectBase || refundQuote != expectQuote) _violation("cancel refund != model", "");
        netBase[r.trader] += int256(expectBase);
        netQuote[r.trader] += int256(expectQuote);
        r.escrowQuote = 0;
        r.closed = true;
    }

    uint256[] private _activatedThisCall;

    function _checkAutoCancelLater(uint256 id) private {
        _activatedThisCall.push(id);
    }

    /// @dev An activated stop that ended Cancelled in the same call was auto-cancelled: it must have had more than
    /// MAX_INSERT_SCAN orders ranked ahead of its limit. Only checked when it was the call's only activation, so the
    /// book's state after the call is the state it faced.
    function _checkPendingAutoCancels() private {
        uint256 n = _activatedThisCall.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = _activatedThisCall[i];
            IOrderBook.Order memory o = book.getOrder(id);
            if (n == 1 && o.status == IOrderBook.Status.Cancelled) {
                if (rankedAhead(o.side, o.price) <= book.MAX_INSERT_SCAN()) {
                    _violation("auto-cancel without a too-deep book", "");
                }
            }
        }
        delete _activatedThisCall;
    }

    // ------------------------------------------------------------------ helpers

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % 5];
    }

    /// @dev Five ticks: 1.8, 1.9, 2.0, 2.1, 2.2.
    function _clusterPrice(uint256 seed) private pure returns (uint256) {
        return 1.8e18 + (seed % 5) * TICK;
    }

    /// @dev 1 in 8 is one lot (dust), the rest 0.5 to 7.5 whole tokens.
    function _amount(uint256 seed) private pure returns (uint256) {
        if (seed % 8 == 0) return 1e9;
        return (1 + (seed >> 3) % 15) * 0.5e18;
    }

    /// @dev Reference ceil(amount * price / 1e18), written without the engine or a library. Inputs here are bounded
    /// far below the overflow range.
    function _ceilCost(uint256 amount, uint256 price) private pure returns (uint256) {
        uint256 product = amount * price;
        return product / 1e18 + (product % 1e18 == 0 ? 0 : 1);
    }

    function _violation(string memory what, bytes memory err) private {
        violations++;
        lastViolation = what;
        if (err.length > 0) console2.logBytes(err);
    }
}
