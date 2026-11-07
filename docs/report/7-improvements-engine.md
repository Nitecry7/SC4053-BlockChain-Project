# 7. Improvements & Refinements (engine)

Fits Person 2's draft section 7. These are changes beyond the AI's first output, each with its source in the prompt log or SPEC.

## Functional additions (the three bonuses)
| Bonus | Function | Design highlights |
|---|---|---|
| 1. Cancellation of unfilled amounts | `cancelOrder(orderId)` | Owner first, then status, so an unknown ID gives `NotOrderOwner`. Refunds exactly the remainder: `amount - filled` base for a sell, `lockedQuote` for a buy. Also cancels pending stops with a full refund. Strict CEI, with the event before the transfers |
| 2. Batched multi-party matching | `matchOrders(maxMatches)` | Anyone may call it, and the caller sends and receives nothing. It fills crossed heads through the same `_settleFill`, with the maker chosen by `bookSeq`. One call can settle many traders on both sides: 4 buyers and 4 sellers in one transaction in the tests and on the scratch chain |
| 3. Conditional orders | `placeStopLimitOrder`, `triggerStopOrders(maxCount)` | Escrow is taken at placement at the limit price. Sorted stop lists, so eligibility is O(1). One shared fill budget per call. A fresh `bookSeq` at activation, so a stop queues behind earlier orders. Cascades are bounded by `maxCount`. An activated stop that cannot enter the book is auto-cancelled and refunded (issue 006) |

## Architectural refinements over the AI's proposal
- **Exact arithmetic by construction:** lot and tick sizes of 1e9, instead of `AmountTooSmall`. With them, no fill can round. The ceiling on escrow and the refund rule stay only as a safety net.
- **`bookSeq` priority:** the order an order *entered the book* in, not its ID, so stop activation is fair.
- **One settlement path:** `_settleFill` serves placement, batch and stops. Phase 5 added one flag (`takerInBook`), so a filled taker that is already resting is unlinked *before* the transfers. That keeps CEI per fill without a second routine.
- **One list implementation:** in Phase 6 the stop lists reuse the book's `_insert` and `_unlink`, with the status choosing the list, instead of separate code.
- **Shared helpers instead of duplication:**
  - `_validate`, `_record` and `_pullEscrow` serve both kinds of placement.
  - `_closeAndRefund` serves both owner cancel and trigger auto-cancel.
- **Guards the AI first left as comments:** the `_unlink` membership check (issue 001), and the zero-address owner check (issue 005).
- **`mulDiv` everywhere `qty × price` is computed** (issue 003).

## Specification refinements
- **SPEC section 5:** both CEI deviations in placement, with exactly what views show during each (issue 002).
- **SPEC section 6:** who triggers execution, how, and how often. This answers the brief's tricky point 1:
  - the taker, inside `placeLimitOrder`
  - anyone, through `matchOrders` and `triggerStopOrders`
  - bounded work per call, a caller who gains nothing, and no keeper reward
- **SPEC section 8:** every accepted limitation, written out with its attack cost, after two independent reviews corrected the AI's first, softer wording (stop griefing, stop sniping).
- **Brief tricky point 2, the priority of older orders:** answered by price-time priority with `bookSeq` (SPEC section 2, O1).

## Verification refinements
- A **re-runnable mutation script**: 67 mutants, matched on code text, with a configurable target suite.
- An **invariant suite with an independent reference ledger**, which replaced a first version whose ghost variables could not fail (Phase 7 review).
- A **regression test per issue**, each shown to fail on the original bug where the issue had a code fix.
- **Real-chain verification** with Person 2's own deploy script and `cast`, without touching anyone's local chain records (redirected broadcast output).

## Optimisations
- **Gas bounded by constants:** `MAX_MATCHES_PER_TX = 10` and `MAX_INSERT_SCAN = 100`, kept after gas measurement (O2). The worst measured placement is 1.78M gas.
- **No unbounded loops.**
- **No storage for stop eligibility scans:** heads only.
- **Size:** OrderBook grew from 6,812 B (Phase 4) to 8,461 B (Phase 6) for all three bonuses, well under the 24,576 B limit, so the factory needs no split.
