# OrderBook contract interface

> **STATUS: FROZEN (1 Nov). Person 2 approved it verbally.** Any change to this interface
> needs both teammates' agreement.

Behaviour is defined in SPEC.md. This file is the ABI contract between the engine
(Person 1) and the frontend (Person 2). `contracts/src/interfaces/IOrderBook.sol` must match it exactly.

## Units (frontend must encode exactly this)
- `amount`: base token base units (18 decimals). Must be a multiple of `LOT_SIZE` (1e9).
- `price`, `limitPrice`, `triggerPrice`: quote base units per 1 whole base token, scaled by
  `PRICE_SCALE` (1e18). A price of 2.5 SGDx per NTU is `2.5e18`. Must be a multiple of `TICK_SIZE` (1e9).
- Buy orders: approve the quote token for at least `requiredQuote(amount, limitPrice)`.
- Sell orders: approve the base token for at least `amount`.
- Order IDs start at 1. An ID of 0 means "none" (for example, an empty book side).
- `getOrder` returns an all-zero `Order` for an unknown ID. The frontend should treat `id == 0` as "not found".

## Solidity

```solidity
enum Side { Buy, Sell }
enum Status { Open, PartiallyFilled, Filled, Cancelled, PendingTrigger }

struct Order {
    uint256 id;
    address trader;
    Side side;
    uint256 price;          // limit price, PRICE_SCALE units
    uint256 triggerPrice;   // 0 for plain limit orders
    uint256 amount;         // original base amount
    uint256 filled;         // base amount filled so far
    uint256 lockedQuote;    // remaining quote escrow (buy orders only, 0 for sells)
    uint64  createdAt;      // block.timestamp at placement
    Status  status;
}

// Constants
function PRICE_SCALE() external view returns (uint256);        // 1e18
function LOT_SIZE() external view returns (uint256);           // 1e9
function TICK_SIZE() external view returns (uint256);          // 1e9
function MAX_MATCHES_PER_TX() external view returns (uint256); // proposed 10, tuned by gas report
function MAX_INSERT_SCAN() external view returns (uint256);    // proposed 100, tuned by gas report

// Writes
function placeLimitOrder(Side side, uint256 price, uint256 amount) external returns (uint256 orderId);
function cancelOrder(uint256 orderId) external;
function matchOrders(uint256 maxMatches) external returns (uint256 matchesDone);
function placeStopLimitOrder(Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount) external returns (uint256 orderId);
function triggerStopOrders(uint256 maxCount) external returns (uint256 triggered);

// Views (for the frontend)
function getOrder(uint256 orderId) external view returns (Order memory);
function getBestBid() external view returns (uint256 orderId, uint256 price);   // (0, 0) if empty
function getBestAsk() external view returns (uint256 orderId, uint256 price);   // (0, 0) if empty
function getBook(Side side, uint256 maxOrders) external view returns (Order[] memory); // best first, live book only
function getUserOrderIds(address trader) external view returns (uint256[] memory);    // all statuses
function requiredQuote(uint256 amount, uint256 price) external pure returns (uint256); // buy escrow
function lastTradePrice() external view returns (uint256);
function hasTradePrice() external view returns (bool);
function baseToken() external view returns (address);
function quoteToken() external view returns (address);

// Events (frontend listens to these)
event OrderPlaced(uint256 indexed orderId, address indexed trader, Side side, uint256 price, uint256 amount);
event Trade(uint256 indexed makerOrderId, uint256 indexed takerOrderId, address maker, address taker, uint256 price, uint256 baseAmount, uint256 quoteAmount);
event OrderCancelled(uint256 indexed orderId, address indexed trader, uint256 refundBase, uint256 refundQuote);
event StopOrderPlaced(uint256 indexed orderId, address indexed trader, Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount);
event StopOrderTriggered(uint256 indexed orderId, uint256 lastTradePrice);

// Errors
error ZeroAmount();
error ZeroPrice();
error InvalidLotSize();      // amount % LOT_SIZE != 0
error InvalidTickSize();     // price, limitPrice or triggerPrice % TICK_SIZE != 0
error NotOrderOwner();
error OrderNotActive();
error BookTooDeep();
error InvalidMaxCount();
error UnsupportedDecimals(); // constructor: a token does not have 18 decimals
error InvalidTokens();       // constructor: zero address, or base == quote
```

## Inherited errors
`OrderBook` inherits this error from OpenZeppelin `ReentrancyGuard`, so it is in the compiled ABI. It is **not**
declared in `IOrderBook.sol`, because declaring it in both would not compile.

```solidity
error ReentrancyGuardReentrantCall(); // a write was re-entered during a token transfer
```

## Event semantics
- `OrderPlaced` is emitted for plain limit orders, before any `Trade` from that order.
- `StopOrderPlaced` is emitted when a stop-limit order is placed. `OrderPlaced` is **not** emitted for it.
- `StopOrderTriggered` is emitted when a stop order activates (status becomes `Open`). It is
  followed by any `Trade` events from its matching. No `OrderPlaced` is emitted on activation.
- `Trade.price` is the maker's price. `Trade.quoteAmount = baseAmount * price / PRICE_SCALE`.
- Order status changes have no event of their own. Read them with `getOrder`.

## Changes from the plan's section 5 (confirmed by Person 2)
| Change | Reason |
|---|---|
| Added `LOT_SIZE`, `TICK_SIZE`, `InvalidLotSize`, `InvalidTickSize` | Dust prevention: every fill cost is exact (SPEC.md A1) |
| Added `InvalidTokens` | Constructor rejects zero or identical token addresses |
| Added `requiredQuote` | Frontend approval uses the engine's own escrow formula |
| Exposed constants as public getters | Frontend validation and display |
| Fixed event semantics for stop orders | Frontend knows which events to listen for |
| Documented inherited `ReentrancyGuardReentrantCall` | It is in the compiled ABI, so the frontend can decode it |

## Deployment handoff (agree with Person 2)
- `contracts/script/Deploy.s.sol` (Person 2) deploys the tokens, then `OrderBook(base, quote)`. Person 1 reviews the OrderBook part.
- The ABI and addresses go to `web/lib/contracts/`. The deploy flow copies them from `contracts/out/`.
