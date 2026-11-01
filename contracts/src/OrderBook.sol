// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "./interfaces/IOrderBook.sol";

/// @notice Limit order book for one base/quote pair. Behaviour is defined in SPEC.md.
/// @dev Phase 1 skeleton: function bodies are stubs until their phase in docs/ENGINE_PHASES.md.
contract OrderBook is IOrderBook, ReentrancyGuard {
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

    constructor(address base, address quote) {
        if (base == address(0) || quote == address(0) || base == quote) revert InvalidTokens();
        if (IERC20Metadata(base).decimals() != 18 || IERC20Metadata(quote).decimals() != 18) {
            revert UnsupportedDecimals();
        }
        baseToken = base;
        quoteToken = quote;
    }

    function placeLimitOrder(Side, uint256, uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function cancelOrder(uint256) external nonReentrant {
        revert();
    }

    function matchOrders(uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function placeStopLimitOrder(Side, uint256, uint256, uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function triggerStopOrders(uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function getOrder(uint256) external view returns (Order memory) {
        revert();
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

    function getUserOrderIds(address) external view returns (uint256[] memory) {
        revert();
    }

    function requiredQuote(uint256, uint256) external pure returns (uint256) {
        revert();
    }

    function _stampBookSeq(uint256 orderId) internal {
        _bookSeq[orderId] = ++_lastBookSeq;
    }

    /// @dev The order must be stamped and not already in a list. Walks from the head, and allows at most
    /// MAX_INSERT_SCAN steps past orders that rank ahead of it.
    function _insert(uint256 orderId) internal {
        Side side = _orders[orderId].side;
        uint256 prev = 0;
        uint256 next = _bookHead[side];
        uint256 steps = 0;

        while (next != 0 && !_ranksAhead(orderId, next, side)) {
            if (steps == MAX_INSERT_SCAN) revert BookTooDeep();
            steps++;
            prev = next;
            next = _bookNext[next];
        }

        _bookPrev[orderId] = prev;
        _bookNext[orderId] = next;
        if (prev == 0) {
            _bookHead[side] = orderId;
        } else {
            _bookNext[prev] = orderId;
        }
        if (next != 0) _bookPrev[next] = orderId;
    }

    /// @dev Reverts if the order is not in the book. An order is in the book only if it has a predecessor or is
    /// the head. Without this check it would look like a head with no successor, and unlinking would empty the side.
    function _unlink(uint256 orderId) internal {
        Side side = _orders[orderId].side;
        uint256 prev = _bookPrev[orderId];
        uint256 next = _bookNext[orderId];

        if (prev == 0 && _bookHead[side] != orderId) revert OrderNotActive();

        if (prev == 0) {
            _bookHead[side] = next;
        } else {
            _bookNext[prev] = next;
        }
        if (next != 0) _bookPrev[next] = prev;

        delete _bookPrev[orderId];
        delete _bookNext[orderId];
    }

    /// @dev True if order `a` has priority over order `b`, both on `side`: better price, then lower bookSeq.
    function _ranksAhead(uint256 a, uint256 b, Side side) internal view returns (bool) {
        uint256 priceA = _orders[a].price;
        uint256 priceB = _orders[b].price;
        if (priceA == priceB) return _bookSeq[a] < _bookSeq[b];
        return side == Side.Buy ? priceA > priceB : priceA < priceB;
    }
}
