// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "./interfaces/IOrderBook.sol";

/// @notice Limit order book for one base/quote pair. Behaviour is defined in SPEC.md.
/// @dev Every interface function is implemented (Phases 1 to 6 in docs/ENGINE_PHASES.md). Book and stop lists share
/// one set of linked-list code; an order's status selects its list (see `_heads`).
contract OrderBook is IOrderBook, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant LOT_SIZE = 1e9;
    uint256 public constant TICK_SIZE = 1e9;
    uint256 public constant MAX_MATCHES_PER_TX = 10;
    uint256 public constant MAX_INSERT_SCAN = 100;

    address public immutable baseToken;
    address public immutable quoteToken;

    uint256 public lastTradePrice;
    bool public hasTradePrice;

    uint256 internal _nextOrderId = 1;
    mapping(uint256 orderId => Order) internal _orders;
    mapping(address trader => uint256[] orderIds) internal _userOrderIds;

    // Book: one sorted doubly linked list of order IDs per side. The best order is the head; 0 means "none".
    mapping(Side side => uint256 orderId) internal _bookHead;
    mapping(uint256 orderId => uint256 nextId) internal _bookNext;
    mapping(uint256 orderId => uint256 prevId) internal _bookPrev;

    // Time priority: stamped when an order enters the book. Never use the order ID for priority.
    uint256 internal _lastBookSeq;
    mapping(uint256 orderId => uint256 seq) internal _bookSeq;

    // Stop lists: one sorted list of PendingTrigger orders per side, sharing the book's next/prev links (an order is in
    // at most one list). Buy stops by triggerPrice ascending, sell stops descending, ties in placement order, so the
    // head is always the first to become eligible.
    mapping(Side side => uint256 orderId) internal _stopHead;

    constructor(address base, address quote) {
        if (base == address(0) || quote == address(0) || base == quote) revert InvalidTokens();
        if (IERC20Metadata(base).decimals() != 18 || IERC20Metadata(quote).decimals() != 18) {
            revert UnsupportedDecimals();
        }
        baseToken = base;
        quoteToken = quote;
    }

    /// @dev Escrow is pulled before matching because fills pay out of the contract's balance. SPEC section 5 explains
    /// why this deviation from strict CEI is safe under nonReentrant.
    function placeLimitOrder(Side side, uint256 price, uint256 amount) external nonReentrant returns (uint256 orderId) {
        _validate(amount, price, 0, false);

        orderId = _record(side, price, 0, amount, Status.Open);
        _stampBookSeq(orderId);
        _pullEscrow(orderId);

        emit OrderPlaced(orderId, msg.sender, side, price, amount);

        _matchTaker(orderId, MAX_MATCHES_PER_TX);
        if (_orders[orderId].status != Status.Filled) _insert(orderId);
    }

    /// @dev SPEC section 5. Escrow is taken now, at `limitPrice`. The order waits in its side's stop list, outside the
    /// book, until triggerStopOrders activates it. Strict CEI: every state change comes before the escrow pull.
    function placeStopLimitOrder(Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        _validate(amount, limitPrice, triggerPrice, true);

        orderId = _record(side, limitPrice, triggerPrice, amount, Status.PendingTrigger);
        _insert(orderId);
        _pullEscrow(orderId);

        emit StopOrderPlaced(orderId, msg.sender, side, triggerPrice, limitPrice, amount);
    }

    /// @dev SPEC section 5. Owner first, so an unknown ID reverts with NotOrderOwner. A PendingTrigger order leaves its
    /// stop list and gets its full escrow back.
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.trader == address(0) || order.trader != msg.sender) revert NotOrderOwner();
        if (
            order.status != Status.Open && order.status != Status.PartiallyFilled
                && order.status != Status.PendingTrigger
        ) revert OrderNotActive();

        _unlink(orderId);
        _closeAndRefund(orderId);
    }

    /// @dev SPEC section 5. Clears a crossed book, e.g. one left by a placement that hit MAX_MATCHES_PER_TX. Both heads
    /// are in the book, so the one that entered first (lower bookSeq) is the maker and sets the price.
    function matchOrders(uint256 maxMatches) external nonReentrant returns (uint256 matchesDone) {
        if (maxMatches == 0 || maxMatches > MAX_MATCHES_PER_TX) revert InvalidMaxCount();

        while (matchesDone < maxMatches) {
            uint256 bidId = _bookHead[Side.Buy];
            uint256 askId = _bookHead[Side.Sell];
            if (bidId == 0 || askId == 0) break;

            Order storage bid = _orders[bidId];
            Order storage ask = _orders[askId];
            if (bid.price < ask.price) break;

            (uint256 makerId, uint256 takerId) = _bookSeq[bidId] < _bookSeq[askId] ? (bidId, askId) : (askId, bidId);
            _settleFill(makerId, takerId, Math.min(bid.amount - bid.filled, ask.amount - ask.filled), true);
            matchesDone++;
        }
    }

    /// @dev SPEC section 5. Activates eligible stops from the stop-list heads, up to `maxCount`. All matching in the
    /// call shares ONE budget of MAX_MATCHES_PER_TX fills; once it is spent, activated orders rest without matching and
    /// matchOrders clears any crossing they leave. Fills move lastTradePrice, so later stops may become eligible within
    /// the same call (still bounded by `maxCount`). An activated remainder that cannot enter the book (more than
    /// MAX_INSERT_SCAN orders rank ahead of it) is cancelled and refunded instead of reverting the call, so no stop can
    /// block the stop lists (Phase 6 review H1). It still counts as triggered.
    function triggerStopOrders(uint256 maxCount) external nonReentrant returns (uint256 triggered) {
        if (maxCount == 0 || maxCount > MAX_MATCHES_PER_TX) revert InvalidMaxCount();
        if (!hasTradePrice) return 0;

        uint256 budget = MAX_MATCHES_PER_TX;
        while (triggered < maxCount) {
            uint256 orderId = _eligibleStop();
            if (orderId == 0) break;

            _unlink(orderId);
            _orders[orderId].status = Status.Open;
            _stampBookSeq(orderId);
            emit StopOrderTriggered(orderId, lastTradePrice);

            budget -= _matchTaker(orderId, budget);
            if (_orders[orderId].status != Status.Filled && !_tryInsert(orderId)) _closeAndRefund(orderId);
            triggered++;
        }
    }

    /// @dev An unknown ID returns an all-zero order.
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getBestBid() external view returns (uint256 orderId, uint256 price) {
        orderId = _bookHead[Side.Buy];
        price = _orders[orderId].price;
    }

    function getBestAsk() external view returns (uint256 orderId, uint256 price) {
        orderId = _bookHead[Side.Sell];
        price = _orders[orderId].price;
    }

    function getBook(Side side, uint256 maxOrders) external view returns (Order[] memory orders) {
        uint256 count = 0;
        for (uint256 id = _bookHead[side]; id != 0 && count < maxOrders; id = _bookNext[id]) {
            count++;
        }

        orders = new Order[](count);
        uint256 current = _bookHead[side];
        for (uint256 i = 0; i < count; i++) {
            orders[i] = _orders[current];
            current = _bookNext[current];
        }
    }

    function getUserOrderIds(address trader) external view returns (uint256[] memory) {
        return _userOrderIds[trader];
    }

    function requiredQuote(uint256 amount, uint256 price) public pure returns (uint256) {
        return Math.mulDiv(amount, price, PRICE_SCALE, Math.Rounding.Ceil);
    }

    /// @dev SPEC section 2 validation order. `triggerPrice` is 0 for limit orders, which passes the tick check.
    function _validate(uint256 amount, uint256 price, uint256 triggerPrice, bool isStop) private pure {
        if (amount == 0) revert ZeroAmount();
        if (price == 0 || (isStop && triggerPrice == 0)) revert ZeroPrice();
        if (amount % LOT_SIZE != 0) revert InvalidLotSize();
        if (price % TICK_SIZE != 0 || triggerPrice % TICK_SIZE != 0) revert InvalidTickSize();
    }

    /// @dev Records a new order for msg.sender. A buy's escrow is `requiredQuote(amount, price)` (SPEC A3).
    function _record(Side side, uint256 price, uint256 triggerPrice, uint256 amount, Status status)
        private
        returns (uint256 orderId)
    {
        orderId = _nextOrderId++;
        _orders[orderId] = Order({
            id: orderId,
            trader: msg.sender,
            side: side,
            price: price,
            triggerPrice: triggerPrice,
            amount: amount,
            filled: 0,
            lockedQuote: side == Side.Buy ? requiredQuote(amount, price) : 0,
            createdAt: uint64(block.timestamp),
            status: status
        });
        _userOrderIds[msg.sender].push(orderId);
    }

    /// @dev SPEC A2 and A3: a sell escrows its base amount, a buy its lockedQuote.
    function _pullEscrow(uint256 orderId) private {
        Order storage order = _orders[orderId];
        if (order.side == Side.Buy) {
            IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), order.lockedQuote);
        } else {
            IERC20(baseToken).safeTransferFrom(msg.sender, address(this), order.amount);
        }
    }

    /// @dev Closes an order that is in no list and refunds what it still holds (SPEC A6 and A7): a sell gets
    /// `amount - filled` base, a buy its `lockedQuote`. State and event before the transfers. Used by cancelOrder after
    /// unlinking, and by triggerStopOrders for an activated remainder that cannot enter the book.
    function _closeAndRefund(uint256 orderId) private {
        Order storage order = _orders[orderId];
        address trader = order.trader;
        uint256 refundBase = order.side == Side.Sell ? order.amount - order.filled : 0;
        uint256 refundQuote = order.lockedQuote;

        order.status = Status.Cancelled;
        order.lockedQuote = 0;

        emit OrderCancelled(orderId, trader, refundBase, refundQuote);

        if (refundBase != 0) IERC20(baseToken).safeTransfer(trader, refundBase);
        if (refundQuote != 0) IERC20(quoteToken).safeTransfer(trader, refundQuote);
    }

    /// @dev The stop-list head that is eligible at the current lastTradePrice, buy side first; 0 if neither is.
    function _eligibleStop() private view returns (uint256) {
        uint256 buyId = _stopHead[Side.Buy];
        if (buyId != 0 && lastTradePrice >= _orders[buyId].triggerPrice) return buyId;
        uint256 sellId = _stopHead[Side.Sell];
        if (sellId != 0 && lastTradePrice <= _orders[sellId].triggerPrice) return sellId;
        return 0;
    }

    /// @dev Fills the taker against the opposite head while crossed, up to `maxFills` fills. Returns the fills made.
    function _matchTaker(uint256 takerId, uint256 maxFills) internal returns (uint256 fills) {
        Order storage taker = _orders[takerId];
        Side makerSide = taker.side == Side.Buy ? Side.Sell : Side.Buy;

        for (; fills < maxFills && taker.filled < taker.amount; fills++) {
            uint256 makerId = _bookHead[makerSide];
            if (makerId == 0) break;

            Order storage maker = _orders[makerId];
            bool crossed = taker.side == Side.Buy ? taker.price >= maker.price : taker.price <= maker.price;
            if (!crossed) break;

            _settleFill(makerId, takerId, Math.min(taker.amount - taker.filled, maker.amount - maker.filled), false);
        }
    }

    /// @dev The only settlement path (SPEC A4 to A6). Executes at the maker's price. All state changes come before
    /// the transfers. A filled maker is always unlinked here. A filled taker is unlinked here only when it is already
    /// in the book (`takerInBook`, matchOrders); a placement taker is not in the book yet, and its caller decides
    /// whether it rests.
    function _settleFill(uint256 makerId, uint256 takerId, uint256 qty, bool takerInBook) internal {
        Order storage maker = _orders[makerId];
        Order storage taker = _orders[takerId];
        (Order storage buyOrder, Order storage sellOrder) = maker.side == Side.Buy ? (maker, taker) : (taker, maker);

        uint256 price = maker.price;
        uint256 cost = Math.mulDiv(qty, price, PRICE_SCALE);

        maker.filled += qty;
        taker.filled += qty;

        uint256 newLocked = requiredQuote(buyOrder.amount - buyOrder.filled, buyOrder.price);
        uint256 refund = buyOrder.lockedQuote - cost - newLocked;
        buyOrder.lockedQuote = newLocked;

        maker.status = maker.filled == maker.amount ? Status.Filled : Status.PartiallyFilled;
        taker.status = taker.filled == taker.amount ? Status.Filled : Status.PartiallyFilled;
        if (maker.status == Status.Filled) _unlink(makerId);
        if (takerInBook && taker.status == Status.Filled) _unlink(takerId);

        lastTradePrice = price;
        hasTradePrice = true;

        emit Trade(makerId, takerId, maker.trader, taker.trader, price, qty, cost);

        IERC20(baseToken).safeTransfer(buyOrder.trader, qty);
        IERC20(quoteToken).safeTransfer(sellOrder.trader, cost);
        if (refund != 0) IERC20(quoteToken).safeTransfer(buyOrder.trader, refund);
    }

    function _stampBookSeq(uint256 orderId) internal {
        _bookSeq[orderId] = ++_lastBookSeq;
    }

    /// @dev The list an order belongs to follows its status: PendingTrigger orders are in their side's stop list, every
    /// other status means the book. (A maker is marked Filled just before `_unlink` removes it from the book.)
    function _heads(uint256 orderId) private view returns (mapping(Side => uint256) storage) {
        if (_orders[orderId].status == Status.PendingTrigger) return _stopHead;
        return _bookHead;
    }

    /// @dev Inserts into the list for the order's status, or reverts with BookTooDeep.
    function _insert(uint256 orderId) internal {
        if (!_tryInsert(orderId)) revert BookTooDeep();
    }

    /// @dev Inserts into the list for the order's status. A book order must be stamped first. The order must not
    /// already be in a list. Walks from the head, and allows at most MAX_INSERT_SCAN steps past orders that rank
    /// ahead of it. Returns false, having changed nothing, if the scan limit is reached.
    function _tryInsert(uint256 orderId) internal returns (bool) {
        mapping(Side => uint256) storage heads = _heads(orderId);
        Side side = _orders[orderId].side;
        uint256 prev = 0;
        uint256 next = heads[side];
        uint256 steps = 0;

        while (next != 0 && !_ranksAhead(orderId, next, side)) {
            if (steps == MAX_INSERT_SCAN) return false;
            steps++;
            prev = next;
            next = _bookNext[next];
        }

        _bookPrev[orderId] = prev;
        _bookNext[orderId] = next;
        if (prev == 0) {
            heads[side] = orderId;
        } else {
            _bookNext[prev] = orderId;
        }
        if (next != 0) _bookPrev[next] = orderId;
        return true;
    }

    /// @dev Removes the order from the list for its status, and reverts if it is not in it. An order is in a list
    /// only if it has a predecessor or is the head. Without this check it would look like a head with no successor,
    /// and unlinking would empty the side.
    function _unlink(uint256 orderId) internal {
        mapping(Side => uint256) storage heads = _heads(orderId);
        Side side = _orders[orderId].side;
        uint256 prev = _bookPrev[orderId];
        uint256 next = _bookNext[orderId];

        if (prev == 0 && heads[side] != orderId) revert OrderNotActive();

        if (prev == 0) {
            heads[side] = next;
        } else {
            _bookNext[prev] = next;
        }
        if (next != 0) _bookPrev[next] = prev;

        delete _bookPrev[orderId];
        delete _bookNext[orderId];
    }

    /// @dev True if order `a` has priority over order `b`, both in the same list on `side`.
    /// Stop lists: earlier trigger first (buy: lower triggerPrice; sell: higher). Equal triggers return false, so a new
    /// stop queues behind existing ones at the same trigger (placement order).
    /// Book: better price, then lower bookSeq.
    function _ranksAhead(uint256 a, uint256 b, Side side) internal view returns (bool) {
        if (_orders[a].status == Status.PendingTrigger) {
            uint256 triggerA = _orders[a].triggerPrice;
            uint256 triggerB = _orders[b].triggerPrice;
            return side == Side.Buy ? triggerA < triggerB : triggerA > triggerB;
        }
        uint256 priceA = _orders[a].price;
        uint256 priceB = _orders[b].price;
        if (priceA == priceB) return _bookSeq[a] < _bookSeq[b];
        return side == Side.Buy ? priceA > priceB : priceA < priceB;
    }
}
