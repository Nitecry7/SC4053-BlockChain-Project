// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ABI between the engine and the frontend. Must match CONTRACT_INTERFACE.md exactly.
interface IOrderBook {
    enum Side {
        Buy,
        Sell
    }

    enum Status {
        Open,
        PartiallyFilled,
        Filled,
        Cancelled,
        PendingTrigger
    }

    struct Order {
        uint256 id;
        address trader;
        Side side;
        uint256 price; // limit price, PRICE_SCALE units
        uint256 triggerPrice; // 0 for plain limit orders
        uint256 amount; // original base amount
        uint256 filled; // base amount filled so far
        uint256 lockedQuote; // remaining quote escrow (buy orders only, 0 for sells)
        uint64 createdAt; // block.timestamp at placement
        Status status;
    }

    // Constants
    function PRICE_SCALE() external view returns (uint256); // 1e18
    function LOT_SIZE() external view returns (uint256); // 1e9
    function TICK_SIZE() external view returns (uint256); // 1e9
    function MAX_MATCHES_PER_TX() external view returns (uint256); // 10
    function MAX_INSERT_SCAN() external view returns (uint256); // 100

    // Writes
    function placeLimitOrder(Side side, uint256 price, uint256 amount) external returns (uint256 orderId);
    function cancelOrder(uint256 orderId) external;
    function matchOrders(uint256 maxMatches) external returns (uint256 matchesDone);
    function placeStopLimitOrder(Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount)
        external
        returns (uint256 orderId);
    function triggerStopOrders(uint256 maxCount) external returns (uint256 triggered);

    // Views (for the frontend)
    function getOrder(uint256 orderId) external view returns (Order memory);
    function getBestBid() external view returns (uint256 orderId, uint256 price); // (0, 0) if empty
    function getBestAsk() external view returns (uint256 orderId, uint256 price); // (0, 0) if empty
    function getBook(Side side, uint256 maxOrders) external view returns (Order[] memory); // best first, live book only
    function getUserOrderIds(address trader) external view returns (uint256[] memory); // all statuses
    function requiredQuote(uint256 amount, uint256 price) external pure returns (uint256); // buy escrow
    function lastTradePrice() external view returns (uint256);
    function hasTradePrice() external view returns (bool);
    function baseToken() external view returns (address);
    function quoteToken() external view returns (address);

    // Events (frontend listens to these)
    event OrderPlaced(uint256 indexed orderId, address indexed trader, Side side, uint256 price, uint256 amount);
    event Trade(
        uint256 indexed makerOrderId,
        uint256 indexed takerOrderId,
        address maker,
        address taker,
        uint256 price,
        uint256 baseAmount,
        uint256 quoteAmount
    );
    event OrderCancelled(uint256 indexed orderId, address indexed trader, uint256 refundBase, uint256 refundQuote);
    event StopOrderPlaced(
        uint256 indexed orderId,
        address indexed trader,
        Side side,
        uint256 triggerPrice,
        uint256 limitPrice,
        uint256 amount
    );
    event StopOrderTriggered(uint256 indexed orderId, uint256 lastTradePrice);

    // Errors
    error ZeroAmount();
    error ZeroPrice();
    error InvalidLotSize(); // amount % LOT_SIZE != 0
    error InvalidTickSize(); // price, limitPrice or triggerPrice % TICK_SIZE != 0
    error NotOrderOwner();
    error OrderNotActive();
    error BookTooDeep();
    error InvalidMaxCount();
    error UnsupportedDecimals(); // constructor: a token does not have 18 decimals
    error InvalidTokens(); // constructor: zero address, or base == quote
}
