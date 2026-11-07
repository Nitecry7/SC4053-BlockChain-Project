# Issue P2-006: "Try again" during a wallet wait could lose a transaction that was signed anyway

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** Independent read-only review (a fresh-context Sonnet reviewer), finding 2. Verified by a red reducer test.
- **Severity:** Medium. A user could end up with two escrowed orders and a UI that knew about one.

## 1. Why the AI made the mistake
The pending-wallet notice offers "Try again" after 20 seconds, and its text says to reject the request in MetaMask first. The AI made the reset unconditional and relied on that wording. The reducer ignores events from an older attempt, so if the wallet was still open and the user signed it after pressing Try again, the late transaction hash was discarded.

## 2. Why it is problematic
Pressing Try again with the popup still open returns the form to idle and allows a second request. Signing both escrows the collateral twice, and the first transaction would not appear anywhere in the app. A sentence of instructions is not a guard.

## 3. How we fixed it
`web/lib/order-flow.ts` now remembers an attempt that was abandoned while a request or confirmation was open (`abandoned`). If that attempt's request is signed later, the hash is recorded against it, and the ticket shows "A request you retried may still complete" with the hash until the user dismisses it. The abandoned attempt also stops: it sends no further wallet request.

## 4. Evidence the fix works
Red first, then green (`web/lib/order-flow.test.ts`).

**Before the fix:**
```
 × a reset during order-wallet remembers the abandoned attempt and records its hash if the wallet signs anyway
 × the same for an approval, and a clean reset (nothing in flight) leaves no abandoned record
 × a new attempt keeps the warning, and only an explicit dismissal clears it
```
**After the fix:** `Test Files 4 passed (4)   Tests 71 passed (71)` for the files touched by the review fixes, and the full run `Tests 207 passed | 18 skipped`. A mutation that removes the abandoned-hash recording is caught (see the P2-5 evidence file).
