# Issue 006: one unplaceable stop blocked every stop activation, on both sides, for 102 wei

- **Date:** 2026-11-07
- **Phase:** 6b (triggerStopOrders)
- **Found by:** Independent subagent review of Phase 6 (finding H1). The reviewer reproduced it in a scratch copy of `contracts/`. The main session reproduced it again in the repo with the regression tests below.
- **Severity:** High for availability. No funds could be taken, and every owner could still cancel, but the attacker could switch off the stop-limit feature (Bonus 3) for everyone, permanently, almost for free.

## 1. Why the AI made the mistake
The AI reused the book's insert path for an activated stop: `triggerStopOrders` called `_insert`, which reverts with `BookTooDeep` after `MAX_INSERT_SCAN` steps. It treated that revert as a gas bound, as it is for `placeLimitOrder`.

It missed that the two cases differ in **who pays for the revert**:
- In placement, the revert hits only the trader who chose the bad price.
- In triggering, the revert rolls back a permissionless call that serves every stop. The failing stop also stays at the head of its stop list, so every later call hits it again.

When the AI noticed the problem itself, it documented it in SPEC section 8 as a deep-book accident that lasts "until the book thins out or the owner cancels the stop". It did not see that the owner can be the attacker, or that the dust can be topped up. It also missed that because buy stops are checked first, a blocked buy stop starves sell stops too. It flagged the issue as a design question but underrated it, and the review corrected the severity.

## 2. Why it is problematic
**The attack:**
- Mallory places a buy stop with trigger 1e9 and limit 1e9. That is the lowest possible trigger, so it heads the buy-stop list and is eligible after any trade.
- She adds 101 bids of 1e9 at price 1e9. Each one escrows `requiredQuote(1e9, 1e9) = 1` wei, so the attack locks 102 wei in all.
- On activation her stop matches nothing, and 101 orders rank ahead of it, so `_insert` reverts with `BookTooDeep`.

**The effect:**
- `triggerStopOrders(m)` reverted for every `m` from 1 to 10, forever.
- No honest stop-loss on either side could ever activate. Stop orders exist to fire when the price moves, so the feature silently stopped protecting anyone.
- A book with more than 100 honest bids would also block any low-limit buy stop, without any attacker.

## 3. How we fixed it
The human chose option (a) from the review: auto-cancel and refund. Other options were also considered: document only, or park blocked stops in a third list. Changes in `contracts/src/OrderBook.sol`:
- `_insert` is split. `_tryInsert` returns `false`, having written nothing, when the scan limit is reached. `_insert` keeps the old revert for placement and stop placement.
- The refund half of `cancelOrder` moves into a shared `_closeAndRefund`. It sets Cancelled, zeroes `lockedQuote`, emits `OrderCancelled`, then transfers the refund, so there is no duplicated refund code.
- In `triggerStopOrders`:
  ```solidity
  if (_orders[orderId].status != Status.Filled && !_tryInsert(orderId)) _closeAndRefund(orderId);
  ```
  An activated remainder that cannot enter the book is cancelled and refunded (A6 and A7), the call continues, and the order still counts as triggered.

There is no ABI change: `OrderCancelled` already existed. SPEC.md was updated in three places: the section 4 lifecycle row, the section 5 `triggerStopOrders` step 3, and the section 8 entry, which now records the history and the trade-off. **The trade-off:** an honest stop behind a deep book is now refunded instead of resting, and someone who floods the book with dust can cancel other traders' activated stops, but cannot take their funds.

## 4. Evidence the fix works
Regression tests in `contracts/test/OrderBook.Stop.t.sol`:
- `test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers`: the attack above, plus an honest sell stop that must still activate in the same call.
- `test_trigger_honestStopBehindTooDeepBookIsRefundedExactly`: a buy stop behind 101 bids gets its exact 6e18 escrow back.
- `test_trigger_unplaceableSellStopRefundsBase`: the same for a sell stop, with 5e18 base refunded.

**Before the fix.** The old line `if (_orders[orderId].status != Status.Filled) _insert(orderId);` was put back temporarily from a backup, the tests were run, and the file was then restored:
```
[FAIL: BookTooDeep()] test_trigger_honestStopBehindTooDeepBookIsRefundedExactly() (gas: 69213565)
[FAIL: BookTooDeep()] test_trigger_unplaceableSellStopRefundsBase() (gas: 67095408)
[FAIL: BookTooDeep()] test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers() (gas: 69689955)
Ran 1 test suite in 64.60ms (62.83ms CPU time): 0 tests passed, 3 failed, 0 skipped (3 total tests)
```

**After the fix:**
```
[PASS] test_trigger_honestStopBehindTooDeepBookIsRefundedExactly() (gas: 84616177)
[PASS] test_trigger_unplaceableSellStopRefundsBase() (gas: 80197574)
[PASS] test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers() (gas: 83014005)
Ran 1 test suite in 82.70ms (80.16ms CPU time): 3 tests passed, 0 failed, 0 skipped (3 total tests)
```

**Mutants** in `docs/ai-audit/test-evidence/mutants.sh`:
- P6x restores the pre-fix line.
- P6y drops the refund.

Their results are in the Phase 6 mutant run (see `MUTANTS.md`).
