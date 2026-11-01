# Issue 001: `_unlink` could empty one side of the book

- **Date:** 2026-11-01
- **Phase:** 2a (book structure)
- **Found by:** The AI noted the risk in its Phase 2a report and in a code comment. The human reviewed it and decided it needed a guard in code.
- **Severity:** Latent. `_unlink` had no production caller yet, so the flaw could only be reached through the test harness. It would have become reachable from `cancelOrder` in Phase 4.

## 1. Why the AI made the mistake
The AI wrote `_unlink` for the four cases in the prompt: head, tail, middle and only element. It treated "the order is in the book" as something every caller would guarantee, and did not check it. It used `prev == 0` to mean "this order is the head", but an order that is not in the book also has `prev == 0`.

The AI saw the risk, but only documented it in a comment and asked Phase 4 to check status first. A comment is not enforced, and a single missed check in a later caller would have corrupted the book.

## 2. Why it is problematic
Unlinking an order that is not in the book, or unlinking the same order twice, set that side's head to the order's empty `next` link, which is 0. There was no revert. The effect on a live book would be:
- Every resting order on that side disappears from `getBestBid`, `getBestAsk` and `getBook`, and can no longer be matched. Their status would still be Open, and their escrow would still be held.
- The market on that side looks empty, so takers cannot trade against that liquidity.
- Later unlinks of those orphaned orders hit the same flaw, so the list stays corrupted.

No tokens could be taken directly by this flaw, but escrowed orders would be stranded outside the book.

## 3. How we fixed it
`_unlink` in `contracts/src/OrderBook.sol` now reverts before changing anything:

```solidity
if (prev == 0 && _bookHead[side] != orderId) revert OrderNotActive();
```

An order is in the book only if it has a predecessor or is the head, so the check needs no new storage. The human allowed either an `inBook` flag or status plus link checks; the AI chose the link check. It reuses the existing `OrderNotActive` error, because CONTRACT_INTERFACE.md is frozen and no new error can be added.

Limit: `_unlink(0)` on an empty side passes the check and changes nothing. Order ID 0 means "none" and is never in the book.

## 4. Evidence the fix works
Regression tests in `contracts/test/OrderBook.Book.t.sol`:
- `test_unlink_orderNotInBookDoesNotEmptySide`
- `test_unlink_revertsWhenOrderNotInBook`
- `test_unlink_revertsWhenAlreadyUnlinked`

**Before the fix.** `0 != 1` is the head after the call against the expected best order, so the side was emptied:
```
Ran 3 tests for test/OrderBook.Book.t.sol:OrderBookBookTest
[FAIL: assertion failed: 0 != 1] test_unlink_orderNotInBookDoesNotEmptySide() (gas: 743229)
[FAIL: next call did not revert as expected] test_unlink_revertsWhenAlreadyUnlinked() (gas: 631404)
[FAIL: next call did not revert as expected] test_unlink_revertsWhenOrderNotInBook() (gas: 469545)
Suite result: FAILED. 0 passed; 3 failed; 0 skipped; finished in 30.53ms (15.64ms CPU time)
```

**After the fix:**
```
Ran 3 tests for test/OrderBook.Book.t.sol:OrderBookBookTest
[PASS] test_unlink_orderNotInBookDoesNotEmptySide() (gas: 909545)
[PASS] test_unlink_revertsWhenAlreadyUnlinked() (gas: 704984)
[PASS] test_unlink_revertsWhenOrderNotInBook() (gas: 517074)
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 4.51ms (5.02ms CPU time)
```

**Full suite after the fix:**
```
Suite result: ok. 8 passed; 0 failed; 0 skipped; finished in 38.76ms (26.03ms CPU time)
Suite result: ok. 23 passed; 0 failed; 0 skipped; finished in 88.45ms (292.06ms CPU time)
Ran 2 test suites in 90.31ms (127.21ms CPU time): 31 tests passed, 0 failed, 0 skipped (31 total tests)
```
