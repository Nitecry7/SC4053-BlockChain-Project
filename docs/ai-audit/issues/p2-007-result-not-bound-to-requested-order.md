# Issue P2-007: A confirmed order was not checked against the order that was requested

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** Independent read-only review, finding 3, then confirmed in viem's source and with red tests.
- **Severity:** Medium. The UI could say "Order #N confirmed" for a transaction that was not the one the user signed.

## 1. Why the AI made the mistake
The runner treated "a successful receipt that contains one `OrderPlaced` by this user" as the answer. viem's `waitForTransactionReceipt` resolves with the **replacement** transaction's receipt when a transaction is replaced or cancelled (and calls `onReplaced`); the AI handled only the `repriced` case and never compared the mined order with the requested one. The outcome also carried the first hash, not the hash that mined.

## 2. Why it is problematic
- A replaced transaction (a different order from the same nonce, for example from another tab) could be reported as this order.
- A cancelled transaction (empty logs) produced a misleading "could not be verified".
- After a wallet speed-up, the result linked to the dropped original hash and its page said "Transaction not found".

## 3. How we fixed it
`web/lib/order-runner.ts` now: reports a cancelled or replaced transaction as a failure of that kind; compares the mined order's side, price and amount with the requested order and fails with "Confirmed, but it is not the order you requested" on any difference; and uses the mined receipt's own transaction hash for the outcome.

## 4. Evidence the fix works
Red first (`web/lib/order-runner.test.ts`), then green.

**Before the fix:**
```
 × uses the hash of the receipt that actually mined, not the first hash
 × refuses a receipt whose OrderPlaced is not the order that was requested (a different price)
 × refuses a different side or amount too
 × a cancelled or replaced transaction is a failure even though viem resolves with the replacement's receipt
```
**After the fix:** all pass (`Tests 71 passed (71)`); mutations that drop the binding check or the mined-hash use are caught.
