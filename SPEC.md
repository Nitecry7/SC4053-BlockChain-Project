# OrderBook engine specification

Owner: Person 1. Derived from docs/DEX_Trading_Engine_Plan.md sections 4 and 6, with the
28 Oct planning decisions applied (see docs/ai-audit/prompt-log.md). The interface is in
CONTRACT_INTERFACE.md. The brief (docs/project.pdf, Section 5.1) overrides this file.

> The brief is kept locally at `docs/project.pdf` and is **intentionally untracked** (listed in
> `.gitignore`), so the course material is not published. Each teammate keeps their own copy there.

## 1. Scope
One `OrderBook` contract per trading pair. `baseToken` and `quoteToken` are set in the constructor and are immutable.
- **In scope:**
  - limit orders with full escrow
  - automatic matching on placement (price-time priority)
  - partial fills, settlement and refunds
  - views
  - cancellation (bonus 1)
  - bounded batch matching (bonus 2)
  - stop-limit orders (bonus 3)
- **Out of scope:** AMMs, multiple pairs per contract, fees, market orders, oracles, upgradeability, off-chain matching, admin roles.

Non-custodial: no admin or owner role exists. Escrowed tokens leave the contract only:
- to the counterparty of a fill, or
- back to the order's own trader, as a refund.

## 2. Design decisions
| Decision | Rule |
|---|---|
| Decimals | Both tokens must report 18 decimals, or the constructor reverts with `UnsupportedDecimals` |
| Tokens | The constructor reverts with `InvalidTokens` if either address is zero or base == quote |
| Price unit | Quote base units per 1 whole base token × `PRICE_SCALE` (1e18) |
| Amount unit | Base token base units |
| Lot size | `amount % LOT_SIZE == 0`, `LOT_SIZE = 1e9`, else `InvalidLotSize` |
| Tick size | Every price field `% TICK_SIZE == 0`, `TICK_SIZE = 1e9`, else `InvalidTickSize` |
| Validation order | `ZeroAmount`, `ZeroPrice`, `InvalidLotSize`, `InvalidTickSize` |
| Order IDs | Sequential from 1; 0 means "none" |
| Execution price | The maker's (resting) price |
| Priority | Bids by price descending, asks by price ascending; ties go to the lower `bookSeq` (the order that entered the book first) |
| Book sequence | Internal `bookSeq` per order, from a counter that only increases. It is stamped when the order enters the book: at placement for limit orders, at activation for stop orders. It is not in the interface or the `Order` struct. For plain limit orders it gives the same order as the order ID |
| Book storage | One sorted doubly linked list of order IDs per side; the best order is the head |
| Insertion | Walk from the head; revert with `BookTooDeep` after `MAX_INSERT_SCAN` steps |
| Matching on placement | Up to `MAX_MATCHES_PER_TX` fills, then the remainder rests (even if still crossed) |
| Self-trade | Allowed. A trader's order can fill against their own order; settlement is still correct. Documented, not prevented |
| Token transfers | OpenZeppelin `SafeERC20`; `ReentrancyGuard` on every state-changing external; CEI, with one documented exception for the escrow pull in `placeLimitOrder` (section 5) |
| Fee-on-transfer / rebasing tokens | Unsupported (documented limitation) |
| Errors | Custom errors only |
| Fees | None |
| Constants | `MAX_MATCHES_PER_TX = 10`, `MAX_INSERT_SCAN = 100` (proposed; tuned with `forge test --gas-report` before the ABI freeze) |

## 3. Accounting rules
Notation: `cost(q, p) = q * p / PRICE_SCALE`.

- **A1. Exactness.** `amount` is a multiple of 1e9 and every price is a multiple of 1e9, so
  `q * p` is a multiple of 1e18 for every lot-sized `q`. Fill sizes are always lot-sized,
  because they are the minimum of two lot-sized remainders. So `cost(q, p)` never rounds.
  This means no dust, and a seller can never give base for 0 quote.
- **A2. Sell escrow.** Placing a sell order pulls `amount` base.
- **A3. Buy escrow.** Placing a buy order pulls `requiredQuote(amount, limitPrice)` quote and
  stores it in `lockedQuote`. `requiredQuote` is `ceil(amount * price / PRICE_SCALE)`.
  Under A1 this equals the exact cost. The rounding up stays as a safety net.
- **A4. Fill.** A fill of size `q = min(takerRemaining, makerRemaining)` at maker price `p`:
  - the seller receives `cost(q, p)` quote
  - the buyer receives `q` base
  - both orders' `filled` increases by `q`
- **A5. Buyer escrow after a fill (gap c).** Let `remaining = amount - filled` after the fill. Then:
  - `newLocked = requiredQuote(remaining, buyLimitPrice)`
  - `refund = lockedQuote - cost(q, p) - newLocked`, paid to the buyer
  - `lockedQuote = newLocked`

  This refunds price improvement on every fill, and by construction an open buy order is
  always fully funded. If the subtraction would underflow, that is a bug, and checked arithmetic reverts.
- **A6. Close.** When a buy order becomes Filled or Cancelled, any remaining `lockedQuote` is refunded.
  Under A1 this is 0 after a full fill.
- **A7. Cancel refund.** A sell order is refunded `amount - filled` base. A buy order is refunded `lockedQuote` quote.
- **A8. Solvency invariant** (checked after every test via `assertSolvent`):
  - base held by the contract == sum of `amount - filled` over sell orders that are Open, PartiallyFilled or PendingTrigger
  - quote held by the contract == sum of `lockedQuote` over buy orders in those statuses

### Worked example (whole tokens for readability; all values are lot- and tick-aligned)
1. Alice sells 10 NTU at 2.0. Escrow: 10 NTU.
2. Bob buys 4 NTU at limit 2.2. Escrow: `requiredQuote(4, 2.2)` = 8.8 SGDx.
3. They cross. Fill 4 NTU at the maker price 2.0, so cost is 8 SGDx.
4. Bob receives 4 NTU, Alice receives 8 SGDx, and Bob is refunded 8.8 − 8 − 0 = 0.8 SGDx. Bob's order is Filled.
5. Alice's order: 4 of 10 filled, PartiallyFilled, 6 NTU still escrowed.
6. The contract holds exactly 6 NTU and 0 SGDx.

## 4. Order lifecycle
| From | Event | To |
|---|---|---|
| (new limit order) | placed, not fully matched, no fills | Open |
| (new limit order) | placed, some fills | PartiallyFilled |
| (new limit order) | placed, fully matched | Filled (never enters the book) |
| (new stop order) | placed | PendingTrigger |
| PendingTrigger | triggered | Open, then normal matching (and possibly PartiallyFilled or Filled) |
| Open / PartiallyFilled | further fills | PartiallyFilled or Filled |
| Open / PartiallyFilled / PendingTrigger | owner cancels | Cancelled |

Filled and Cancelled are terminal. Orders in a terminal state are never in any list.

## 5. Functions
### placeLimitOrder(side, price, amount)
Steps, in order:
1. Validate in the order of section 2.
2. Record the order and stamp `bookSeq`, then pull escrow (A2 or A3).
3. Emit `OrderPlaced`.
4. Match against the opposite head while crossed (buy: `price >= bestAsk`; sell: `price <= bestBid`), up to `MAX_MATCHES_PER_TX` fills.
5. Rest any remainder in the book.
6. Update `lastTradePrice` and `hasTradePrice` on each fill.

Escrow is pulled before any matching. It is the order's own funding, and the fills then pay out of the contract's balance.

**Deviation from strict CEI (decided 1 Nov).** The escrow pull is an external call, and matching changes state after it. Strict CEI would pull escrow last, but then the fills would pay out before the order was funded: a fill would either revert or spend other traders' escrow. This is safe because:
- `nonReentrant` is on every state-changing external, so a token that calls back during the pull cannot reach placement, cancellation, matching or triggering. The call reverts with `ReentrancyGuardReentrantCall`.
- The order is recorded before the pull, so the contract's state already describes it during the call.
- A failed pull reverts the whole transaction, so no fill can happen without the escrow.

Known limit: the guard does not cover view functions. During the pull, a token callback could read an order that is recorded but not yet funded, matched or rested.

### cancelOrder(orderId)
- Caller must be the order's trader, else `NotOrderOwner`.
- Status must be Open, PartiallyFilled or PendingTrigger, else `OrderNotActive`.
- Steps: unlink the order from its list (book or stop list), set Cancelled, zero `lockedQuote`, then refund (A7) and emit `OrderCancelled`.

### matchOrders(maxMatches)
- `maxMatches` must be between 1 and `MAX_MATCHES_PER_TX`, else `InvalidMaxCount`.
- While best bid price >= best ask price and the fill count is below the cap, fill the two heads.
- The maker is the head with the lower `bookSeq` (it entered the book first), and execution is at the maker's price. Settlement uses the same internal `_settleFill` as placement, applying A4 and A5.
- Returns the number of fills. Returns 0 when the book is not crossed (no revert).
- Anyone can call it.

### placeStopLimitOrder(side, triggerPrice, limitPrice, amount)
- Validates like a limit order, with `triggerPrice` also non-zero and tick-aligned.
- Escrow is pulled now (A2 or A3, using `limitPrice`). Status is PendingTrigger.
- The order is stored in that side's stop list, not in the book, and emits `StopOrderPlaced`.
- There is no constraint between `triggerPrice` and `limitPrice`.

### triggerStopOrders(maxCount)
- `maxCount` must be between 1 and `MAX_MATCHES_PER_TX`, else `InvalidMaxCount`.
- If `!hasTradePrice`, returns 0. Nothing ever triggers before the first trade.
- Eligibility: a buy stop when `lastTradePrice >= triggerPrice`; a sell stop when `lastTradePrice <= triggerPrice`.
- Stop lists (gap f):
  - buy stops are sorted by `triggerPrice` ascending
  - sell stops are sorted by `triggerPrice` descending
  - ties go to the lower ID
  - eligible orders are therefore always at the heads, and each check is O(1)
- **One shared fill budget:** at most `MAX_MATCHES_PER_TX` fills in total across the whole call.
  1. Repeatedly take an eligible head, up to `maxCount` activations.
  2. Set its status to Open, stamp a fresh `bookSeq`, emit `StopOrderTriggered`, and run normal matching with whatever budget is left.
  3. Rest any remainder.
  4. Once the budget is used up, further activated orders rest without matching. `matchOrders` clears any crossing they leave.
- Fills made during the call update `lastTradePrice`, which may make more stops eligible within the same call. This is still bounded by `maxCount`.
- Anyone can call it. Returns the number of orders activated.

### Views
- `getBook(side, maxOrders)`: the live book only, best first, at most `maxOrders` entries. It never includes PendingTrigger orders.
- `getUserOrderIds(trader)`: every order the trader has placed, in any status.
- `getBestBid` and `getBestAsk`: return `(0, 0)` when that side is empty.

## 6. Who triggers execution (brief's tricky point 1)
Execution only happens inside a transaction:
- the taker's own `placeLimitOrder`, where the taker pays the gas
- anyone's `matchOrders`, to clear crossings left by the cap or by triggered stops
- anyone's `triggerStopOrders`

There is no background execution on-chain.

## 7. Open items
- **O1 (resolved 28 Oct).** Ties at equal price, and the maker rule in `matchOrders`, use the internal
  `bookSeq`, not the order ID. So a stop order that was placed early but triggered late queues
  behind orders that entered the book before it activated. The interface is unchanged.
- **O2.** The numeric values of `MAX_MATCHES_PER_TX` and `MAX_INSERT_SCAN`, from the gas report.
- **O3.** The Bonus 2 "multi-party" interpretation: confirm with the TA.

## 8. Known limitations (for the report)
- `lastTradePrice` is easy to manipulate in a thin market, so stop orders are for teaching purposes only.
- A deep book can make placement revert (`BookTooDeep`), which is a deliberate gas bound.
- Only 18-decimal tokens are supported; fee-on-transfer and rebasing tokens are not.
- A token without a `decimals()` function is rejected with an empty revert, not `UnsupportedDecimals`.
- The minimum order size and price granularity are 1e-9 of a whole token.
- Self-trades are allowed.
