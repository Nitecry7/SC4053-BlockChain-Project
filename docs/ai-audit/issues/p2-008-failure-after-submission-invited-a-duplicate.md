# Issue P2-008: Some failures after signing invited a second order, and a mined revert said "Nothing was sent"

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** Independent read-only review, findings 2b and 7, confirmed with red tests.
- **Severity:** Medium (duplicate escrow risk) and Low (wrong wording).

## 1. Why the AI made the mistake
Every non-timeout error after the wallet returned a hash was turned into a generic failure with a "Try again" button, with no hint that the transaction might still be mined (an RPC drop while waiting for the receipt says nothing about the transaction itself). Separately, `describeTxError` tested the words "user rejected" over every link of the error chain, including the text of a contract revert, and the on-chain-revert path kept the "Nothing was sent" detail while overriding only the title.

## 2. Why it is problematic
After a dropped connection the user was offered a one-click resubmit while the first order might confirm. And a transaction that had been mined, had spent gas and had reverted told the user "Nothing was sent".

## 3. How we fixed it
- After a hash exists, any failure that is not a revert, cancel, replace or timeout now adds: "The transaction may still be mined: check its page, and My orders, before sending another."
- A mined revert says: "The transaction was mined and reverted, so no order was placed. Only gas was spent."
- `describeTxError` classifies contract reverts first, then checks for a wallet rejection.

## 4. Evidence the fix works
Red first, then green (`web/lib/order-runner.test.ts`, `web/lib/tx-errors.test.ts`).

**Before the fix:**
```
 × an RPC error while waiting says the transaction may still be mined
 × a mined revert says gas was spent and no order was placed, never 'Nothing was sent'
 × a contract revert whose message mentions 'user rejected' stays a revert
```
A control test, "a failure BEFORE anything was signed keeps the plain 'nothing was sent' wording", passed before and after, so the new warning is not applied where it would be false.

**After the fix:** all pass (`Tests 71 passed (71)`).
