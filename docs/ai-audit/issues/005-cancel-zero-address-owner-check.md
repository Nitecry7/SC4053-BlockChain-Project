# Issue 005: `cancelOrder` treated the zero address as the owner of unknown orders

- **Date:** 2026-11-02
- **Phase:** 4 (cancel)
- **Found by:** Independent subagent review (`/review-engine`), reproduced by the main session.
- **Severity:** Low. No real transaction can come from `address(0)`, and no funds were at risk. A simulated call with a default zero `from` might have reached it; that route was not tested.

## 1. Why the AI made the mistake
The AI wrote the owner check as `order.trader != msg.sender`, and reasoned that an unknown order fails it, because its trader is `address(0)`. That holds for every caller except `address(0)`. The AI's own test for unknown IDs only called from a normal trader, so the case stayed hidden. An unset `Order` also reads as a valid status, because `Open` is the enum's zero value, so the status check did not catch it either.

## 2. Why it is problematic
- The agreed Phase 4 rule is that an unknown ID reverts with `NotOrderOwner`. From `address(0)`, `cancelOrder(99)` reverted with `OrderNotActive` instead.
- `cancelOrder(0)` on an empty buy side succeeded. It wrote status Cancelled to order 0, although SPEC section 2 says ID 0 means "none", and it would have emitted `OrderCancelled` for an order that never existed.
- A frontend or indexer simulating a call from the default zero address could have been told that a cancel of a nonexistent order works.

## 3. How we fixed it
The owner check in `contracts/src/OrderBook.sol` now rejects an unset trader explicitly:

```solidity
if (order.trader == address(0) || order.trader != msg.sender) revert NotOrderOwner();
```

## 4. Evidence the fix works
Regression test: `test_cancel_zeroAddressCallerOnUnknownIdRevertsNotOrderOwner` in `contracts/test/OrderBook.Cancel.t.sol`.

**Before the fix:**
```
[FAIL: Error != expected error: OrderNotActive() != NotOrderOwner()] test_cancel_zeroAddressCallerOnUnknownIdRevertsNotOrderOwner() (gas: 48738)
Ran 9 test suites in 217.79ms (1.19s CPU time): 138 tests passed, 1 failed, 0 skipped (139 total tests)
```

**After the fix (fuzz tests excluded from this run):**
```
[PASS] test_cancel_zeroAddressCallerOnUnknownIdRevertsNotOrderOwner() (gas: 137279)
Ran 9 test suites in 217.41ms (1.00s CPU time): 139 tests passed, 0 failed, 0 skipped (139 total tests)
```

Removing the new check as a temporary mutant failed exactly this one test:
```
Z zero-address check removed: CAUGHT (1 failed)
```
