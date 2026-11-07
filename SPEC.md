# OrderBook engine specification

Owner: Person 1. Derived from docs/DEX_Trading_Engine_Plan.md sections 4 and 6, with the
28 Oct planning decisions applied (see docs/ai-audit/prompt-log.md). The interface is in
CONTRACT_INTERFACE.md. The brief (`docs/Development_Project.pdf`, Section 5.1) overrides this file.

> The brief is tracked as `docs/Development_Project.pdf` (the repository is private). A local copy named
> `docs/project.pdf` stays gitignored. Both are the same course brief. (Person 2's audit, finding I-1.)

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
| Book storage | One sorted doubly linked list of order IDs per side; the best order is the head. Pending stop orders are in a separate sorted stop list per side (section 5), which shares the same link storage and code; an order is in at most one list |
| Insertion | Walk from the head; after `MAX_INSERT_SCAN` steps past orders that rank ahead, placement (limit or stop) reverts with `BookTooDeep`. An activated stop that hits the same bound is cancelled and refunded instead of reverting (section 5, `triggerStopOrders`; issue 006) |
| Matching on placement | Up to `MAX_MATCHES_PER_TX` fills, then the remainder rests (even if still crossed) |
| Self-trade | Allowed. A trader's order can fill against their own order; settlement is still correct. Documented, not prevented |
| Token transfers | OpenZeppelin `SafeERC20`; `ReentrancyGuard` on every state-changing external; CEI, with the exceptions in `placeLimitOrder` documented in section 5 |
| Fee-on-transfer / rebasing tokens | Unsupported (documented limitation) |
| Errors | Custom errors only |
| Fees | None |
| Constants | `MAX_MATCHES_PER_TX = 10`, `MAX_INSERT_SCAN = 100` (kept after the gas report; see O2 in section 7) |

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
  - These equalities cover tokens that reach the contract through orders. Tokens sent to it directly are out of scope, and then the balance can exceed the sum (section 8).

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
| Open / PartiallyFilled (just activated) | its remainder cannot enter the book (`MAX_INSERT_SCAN` exceeded) | Cancelled, remainder refunded (section 5, `triggerStopOrders`) |
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

**Second deviation: payouts during matching (documented 2 Nov).** `_settleFill` itself follows CEI: each fill's state changes come before that fill's transfers. But `placeLimitOrder` as a whole does not. Fill N's payouts come before fill N+1's state changes, and before any remainder rests. The same `nonReentrant` reasoning applies, and writes cannot observe the gap.

Known limit: the guard does not cover view functions. A token callback can read intermediate state:
- during the pull: an order that is recorded but not yet funded, matched or rested
- during a payout: the current fill already settled, but a partly filled taker not yet in the book and later fills not yet made

`test_payout_viewsShowFillSettledAndRemainderNotYetRested` pins what views show during a payout. Nothing should treat views read during a token callback as final.

The same applies during the payouts inside `triggerStopOrders`, which matches activated stops in a loop. A callback can see an activated stop that shows Open or PartiallyFilled but is in no list yet, or a stop about to be auto-cancelled that still shows PartiallyFilled. Writes are blocked by `nonReentrant`, as everywhere else (final audit, L-3).

### cancelOrder(orderId)
- Caller must be the order's trader, else `NotOrderOwner`.
- Status must be Open, PartiallyFilled or PendingTrigger, else `OrderNotActive`.
- Steps: unlink the order from its list (book or stop list), set Cancelled, zero `lockedQuote`, emit `OrderCancelled`, then refund (A7). All state changes come before the transfer, so CEI holds here.

### matchOrders(maxMatches)
- `maxMatches` must be between 1 and `MAX_MATCHES_PER_TX`, else `InvalidMaxCount`.
- While best bid price >= best ask price and the fill count is below the cap, fill the two heads.
- The maker is the head with the lower `bookSeq` (it entered the book first), and execution is at the maker's price. Settlement uses the same internal `_settleFill` as placement, applying A4 and A5.
- Both orders are in the book, so whichever is filled leaves it. `_settleFill` unlinks a filled maker, and, when called from `matchOrders`, a filled taker too, before that fill's transfers (CEI per fill; `test_matchPayout_viewsShowBothFilledOrdersAlreadyUnlinked`). A partly filled order keeps its place.
- Returns the number of fills. Returns 0 when the book is not crossed or a side is empty (no revert, no events).
- Anyone can call it. The caller pays gas only: it sends and receives no tokens, and no order is recorded for it.
- The same payouts-during-the-loop deviation as placement applies (section 5, placeLimitOrder): fill N's transfers come before fill N+1's state changes, under `nonReentrant`.

### placeStopLimitOrder(side, triggerPrice, limitPrice, amount)
- Validates like a limit order, with `triggerPrice` also non-zero and tick-aligned.
- Escrow is pulled now (A2 or A3, using `limitPrice`). Status is PendingTrigger.
- The order is stored in that side's stop list, not in the book, and emits `StopOrderPlaced`. It is listed in `getUserOrderIds`, not in `getBook`, and is neither matched nor matchable while pending.
- Validation order follows section 2: `ZeroAmount`, then `ZeroPrice` (limit or trigger), then `InvalidLotSize`, then `InvalidTickSize` (limit or trigger).
- All state changes (record, insert into the stop list) come before the escrow pull, its only external call. The event is emitted after the pull, as in `placeLimitOrder`. Under `nonReentrant` this is safe; it is not strict CEI only in that the event follows the call.
- Inserting into a stop list is bounded like the book: `BookTooDeep` after `MAX_INSERT_SCAN` steps.
- There is no constraint between `triggerPrice` and `limitPrice`. A stop that is already eligible when placed stays pending until the next `triggerStopOrders` call.
- `bookSeq` is not stamped at placement. It is stamped at activation.

### triggerStopOrders(maxCount)
- `maxCount` must be between 1 and `MAX_MATCHES_PER_TX`, else `InvalidMaxCount`.
- If `!hasTradePrice`, returns 0. Nothing ever triggers before the first trade.
- Eligibility: a buy stop when `lastTradePrice >= triggerPrice`; a sell stop when `lastTradePrice <= triggerPrice`.
- Stop lists (gap f):
  - buy stops are sorted by `triggerPrice` ascending
  - sell stops are sorted by `triggerPrice` descending
  - equal triggers stay in placement order. A new stop queues behind existing stops with the same trigger, which is the same as "lower ID first" because stops enter a stop list only when placed
  - eligible orders are therefore always at the heads, and each check is O(1)
  - the stop lists reuse the book's linked-list code: an order's status selects the list (PendingTrigger means its stop list, otherwise the book), and an order is in at most one list
- When both heads are eligible, the buy stop is activated first. The sell stop follows within the same call if `maxCount` allows, or on the next call.
- **One shared fill budget:** at most `MAX_MATCHES_PER_TX` fills in total across the whole call.
  1. Repeatedly take an eligible head, up to `maxCount` activations.
  2. Set its status to Open, stamp a fresh `bookSeq`, emit `StopOrderTriggered`, and run normal matching with whatever budget is left.
  3. Rest any remainder. If it cannot enter the book because more than `MAX_INSERT_SCAN` orders rank ahead of it, cancel it instead: refund the remainder (A6 and A7) and emit `OrderCancelled`. The call does not revert, and the order still counts as triggered (decided 7 Nov after the Phase 6 review, finding H1).
  4. Once the budget is used up, further activated orders rest without matching. `matchOrders` clears any crossing they leave.
- Fills made during the call update `lastTradePrice`, which may make more stops eligible within the same call. This is still bounded by `maxCount`.
- Anyone can call it. Returns the number of orders activated.

### Views
- `getBook(side, maxOrders)`: the live book only, best first, at most `maxOrders` entries. It never includes PendingTrigger orders.
- `getUserOrderIds(trader)`: every order the trader has placed, in any status.
- `getBestBid` and `getBestAsk`: return `(0, 0)` when that side is empty.

## 6. Who triggers execution (brief's tricky point 1)
A contract cannot run by itself: nothing executes unless someone sends a transaction, and that sender pays the gas. So every match happens inside one of three calls.

| Who | How | How often |
|---|---|---|
| The taker | `placeLimitOrder` matches the new order against the opposite side straight away (section 5), up to `MAX_MATCHES_PER_TX` fills | Every placement that crosses. This is the normal path, and most orders never need anything else |
| Anyone (a trader, the frontend, a keeper bot) | `matchOrders(maxMatches)` fills the two heads while the book is crossed, up to `maxMatches` fills (at most `MAX_MATCHES_PER_TX`) | Only when the book is left crossed: after a placement hit the cap, or (Phase 6) after triggered stops ran out of fill budget. Call it repeatedly until it returns 0. It is a cheap no-op otherwise |
| Anyone | `triggerStopOrders(maxCount)` activates eligible stop orders and matches them (Phase 6) | After trades move `lastTradePrice` across a trigger price |

Design points:
- **Bounded work per call.** Every path shares the `MAX_MATCHES_PER_TX` cap, so no call's gas grows with the size of the book. Large crossings are cleared over several calls.
- **Permissionless and harmless to call.** Callers of `matchOrders` cannot choose prices, pick orders or skip the queue: fills follow price-time priority (bookSeq), at the maker's price. The caller sends and receives no tokens (`test_batch_thirdPartyCallerGainsAndLosesNothing`).
- **No caller reward.** There is no fee or keeper incentive, so clearing relies on someone who benefits: usually a trader whose order is crossed, or the frontend offering a "match" button when best bid >= best ask. This is listed in section 8.
- **Multi-party batching (Bonus 2).** One `matchOrders` call can settle many different traders on both sides in a single transaction; `test_batch_multiPartySettlesFourBuyersAndFourSellersInOneCall` settles four buyers and four sellers at once.

There is no background execution on-chain.

## 7. Open items
- **O1 (resolved 28 Oct).** Ties at equal price, and the maker rule in `matchOrders`, use the internal
  `bookSeq`, not the order ID. So a stop order that was placed early but triggered late queues
  behind orders that entered the book before it activated. The interface is unchanged.
- **O2 (resolved 2 Nov).** `MAX_MATCHES_PER_TX = 10` and `MAX_INSERT_SCAN = 100` stay. Gas for one `placeLimitOrder`, from
  `forge test --gas-report --isolate` on the test harness, which only adds test accessors:

  | Scenario | Gas | Test |
  |---|---|---|
  | Insert at full scan depth, distinct prices | 795,030 | `test_gas_insertAtMaxScanDepth` |
  | 10 fills with refunds, nothing rests | 1,007,730 | `test_gas_fullCapSweepWithRefunds` |
  | Worst built: 10 fills with refunds, zero-to-nonzero balances, then a rest behind 100 equal-price orders | 1,778,221 at Phase 3b; 1,808,075 at `engine-final` (later phases added work to placement; same command, 8 Nov) | `test_gas_worstCasePlacement` |

  The worst figure is the worst placement built so far, not a proven upper bound. It is well below Anvil's default 30M block gas limit.

  Phase 5 added `matchOrders(10)`: 10 fills with price-improvement refunds use 765,646 gas, measured with `gasleft()` inside `test_gas_matchOrdersFullCapWithRefunds` (not `--isolate`). This is a typical case, not a worst case: one seller and one buyer who already hold balances, so storage is warm. Ten distinct sellers receiving quote for the first time cost more (each first write to a zero balance is a cold, zero-to-nonzero store). Like placement, it is bounded by `MAX_MATCHES_PER_TX`, with constant work per fill and no escrow pull or insert.

  Phase 6 added `triggerStopOrders(10)`, also measured with `gasleft()`, not `--isolate`:
  - 10 activations, each inserted behind 90 better-priced bids, with no fills: 1,998,765 gas (`test_gas_triggerTenActivationsDeepInserts`)
  - 10 activations sharing 10 fills with refunds: 1,482,995 gas (`test_gas_triggerTenActivationsTenFillsWithRefunds`)

  The worst case is bounded by 10 activations, 10 fills in total, and at most `MAX_INSERT_SCAN` steps for each insert, which is well under 30M. These are cases built so far, not a proven upper bound.
- **O3.** The Bonus 2 "multi-party" interpretation: confirm with the TA.
- **O4 (resolved 2 Nov).** On a crossed book, section 5 step 4 (match the opposite head) takes precedence over section 2 (Priority). The behaviour is kept and listed in section 8.

## 8. Known limitations (for the report)
- **Stop orders trigger on `lastTradePrice`, which is easy to manipulate.** It is the price of the most recent fill on this book, and any single trade sets it, whatever its size.
  - **Attack:** in a thin market, an attacker can trade 1 lot against themselves (self-trades are allowed), or against a stray order, at any price the book allows. That moves `lastTradePrice` across other traders' triggers, then they call `triggerStopOrders`. The victims' stops activate and sell into, or buy from, liquidity the attacker placed at their limit prices, then the price snaps back.
  - **Cost:** gas plus one minimum-size fill.
  - **What limits the damage:** stops are stop-*limit* orders, so an activated stop never trades worse than its own `limitPrice`, and anything unfilled rests as a normal limit order the owner can cancel. Funds are never lost beyond what the owner's limit price accepts.
  - **Not provided:** no time-weighted or volume-weighted reference price, no minimum trade size for moving the trigger price, and no delay between a trade and triggering. The trigger also uses the price of a single book, with no external oracle. Stop orders here are for teaching purposes only.
  - **Execution needs a caller:** `triggerStopOrders` is permissionless and pays no reward (section 6), so an eligible stop can sit unactivated until someone calls it, possibly long after the price moved.
  - **The buy side goes first:** when buy and sell stops are both eligible, buy stops activate first.
  - **A deep book cancels an activated stop:** if an activated stop's remainder cannot enter the book (more than `MAX_INSERT_SCAN` orders rank ahead of its limit price), it is cancelled and refunded instead of resting.
    - **History:** the first Phase 6 design reverted the whole call here, and the independent review (H1, issue 006) showed that a self-owned stop plus 101 dust bids, 102 wei in all, then blocked every stop activation on both sides permanently.
    - **The trade-off:** an honest stop behind a deep book now loses its place, and its owner gets the escrow back, rather than it blocking everyone. Someone who floods the book with dust can therefore cancel other traders' activated stops, but cannot take their funds.
    - **Tests:** `test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers` and `test_trigger_honestStopBehindTooDeepBookIsRefundedExactly`.
- A deep book can make placement revert (`BookTooDeep`), which is a deliberate gas bound.
- Only 18-decimal tokens are supported; fee-on-transfer and rebasing tokens are not.
- A token without a `decimals()` function is rejected with an empty revert, not `UnsupportedDecimals`.
- The minimum order size and price granularity are 1e-9 of a whole token.
- Self-trades are allowed.
- A capped placement can leave the book crossed, and `matchOrders` clears it. Until then, price-time priority does not hold across the crossing: a new sell can fill at once against a resting bid, ahead of an older, better-priced ask. `test_match_crossedBookNewTakerFillsOppositeHeadAheadOfOlderOrder` pins this.
- **Plain limit orders can be sandwiched through the fill cap** (final audit M-1, accepted 8 Nov, issue 007). This combines two limitations above: the crossed book (O4) and dust using up a taker's fills.
  - **Example:**
    1. Bob rests an ask of 10 at 1.5.
    2. Carol sends a buy of 10 at limit 2.0, expecting to fill against Bob at 1.5.
    3. An attacker front-runs her with `MAX_MATCHES_PER_TX` one-lot asks at 1.499.
    4. Carol's 10 fills are spent on the dust, and her remainder rests as a bid at 2.0, crossed with Bob's ask.
    5. The attacker sells into Carol at 2.0 (she is now the maker, so her price applies), then buys Bob's ask at 1.5.
  - **Result:** Carol pays 20e18 - 5.01e9 for 10 base instead of 15e18, and the attacker makes 5e18 - 5.01e9.
  - **Bound:** the victim's own limit price. Solvency and list integrity hold.
  - **Cost:** gas plus 10 lots (about 1.5e-8 quote).
  - **Mitigations not built:** clear any crossing before a new order matches; do not rest a remainder that still crosses after the cap; a minimum fill size. All three change O4 or the dust rules and were judged too risky to change at the end of the project.
  - **Test:** `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` pins this behaviour.
  - **Advice for users:** use a tight limit price.
- **Stops can be sniped through the shared fill budget.** `triggerStopOrders` can leave the book crossed in the same way, and the caller chooses when that happens.
  - **Example:** the last trade was at 2. Bob has a bid of 10 at 2.0, and Carol has a sell stop with trigger 2, limit 1.0 and size 10.
    1. An attacker places 10 dust bids at 2.1 and calls `triggerStopOrders(1)`.
    2. Carol's stop spends the whole budget filling the dust, then rests as an ask at 1.0, crossed with Bob's bid.
    3. In the attacker's next transaction, a buy at 1.0 fills against Carol at her limit price of 1.0, ahead of `matchOrders`, which would have filled her at Bob's 2.0.
  - **Bound:** the fill can never be worse than her `limitPrice`, which is what a stop-limit promises, but a wide limit can lose much more than she expected. The independent Phase 6 review reproduced this.
  - **Mitigations not built:** clearing crossings inside `placeLimitOrder` before the new order takes, a minimum fill size, or not activating once the budget is used up (which would only limit later stops).
- **Stop-list insertion can be griefed.** 101 stops at trigger T (1 wei of escrow each for a buy stop at a 1-tick limit) make every later buy stop with a trigger at or above T revert with `BookTooDeep` until those stops activate. Sell stops can be griefed the same way. This is the dust-griefing limitation above, applied to the stop lists.
- Dust griefing is cheap. `MAX_INSERT_SCAN` + 1 minimum-size orders at price P make any new order at P or worse revert with `BookTooDeep` (equal-priced orders rank behind earlier ones), and `MAX_MATCHES_PER_TX` minimum-size orders use up a taker's fills. The cost is gas plus almost no capital. Tuning the constants does not remove this.
- Payouts are pushed, so a token that can refuse a transfer to one address (a blocklist or a hook) would let a maker block every taker that crosses it. Plain demo tokens are not affected.
- Tokens sent directly to the contract are stranded, because no function can recover them. Trader escrow is not affected.
- `matchOrders` pays no reward to its caller, so a crossed book stays crossed until someone chooses to pay the gas to clear it (section 6).
