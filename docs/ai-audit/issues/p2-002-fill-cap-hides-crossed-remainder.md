# Issue P2-002: The order estimate could not see a remainder that stays crossed

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** The real-chain integration test (12 crossing makers, taker buys 12), not by a unit test.
- **Severity:** Low to Medium. The engine behaved correctly. The ticket's preview, and the warning it shows, were wrong in exactly the case the warning exists for.

## 1. Why the AI made the mistake
The plan said to read "at least `MAX_MATCHES_PER_TX` orders" of the opposite side, and the code read exactly 10 (the same as the engine's cap of 10 fills). To tell that a remainder still crosses, the estimator must see the 11th maker. With a snapshot of exactly 10 it never can, so `crossedRemainder` was always false at the cap. The AI wrote the off-by-one into the plan and then tested the estimator with a book of 12 orders it had passed in directly, which hid it.

## 2. Why it is problematic
In this engine a remainder left after the fill cap is placed on the book and can stay crossed, and `matchOrders` is not implemented, so nothing clears it. The ticket exists to say so before the user signs. It said nothing.

## 3. How we fixed it
- `TICKET_BOOK_DEPTH = 11` in `web/lib/order-plan.ts` is now the number of orders read (cap plus one); the market snapshot uses it.
- `estimateExecution` also reports `bookSnapshotExhausted` whenever the snapshot ended while the order still had base left, whether or not the cap was reached, so an under-read book is flagged even if the cap changes later.

## 4. Evidence the fix works
Regression test `REGRESSION: the fill cap equals the snapshot depth...` in `web/lib/order-plan.test.ts`, written first.

**Before the fix:**
```
 FAIL  lib/order-plan.test.ts > estimateExecution (mirrors OrderBook._matchTaker/_settleFill) > REGRESSION: the fill cap equals the snapshot depth, so the 11th maker is invisible...
AssertionError: expected false to be true // Object.is equality
```
and on the real chain: `expect(run.estimate.crossedRemainder).toBe(true)` received `false`.

**After the fix:** the regression test passes, and the real-chain test "the fill cap: 12 crossing makers, only 10 are matched and the remainder rests crossed" passes with the on-chain check `bestBid >= bestAsk`.
