# Issue P2-003: The ticket's review step stayed open after switching account

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** The browser test (mock wallet, scratch chain), step "account switch: Bob sees none of Alice's orders and the ticket is reset".
- **Severity:** Medium for correctness of what the user sees, not for funds: nothing was sent from the wrong account.

## 1. Why the AI made the mistake
The AI put account, network and market changes into the lifecycle reducer (`CONTEXT_CHANGED`), where they are well tested, and assumed that covered the ticket. The ticket also keeps its own local state (`reviewing`, the typed price and amount). After switching account, the reducer reset, but `reviewing` stayed true, so the ticket kept showing "Review before you sign" and the approve/place buttons that were computed for the previous account.

## 2. Why it is problematic
The review step states an approval ("approve exactly 10 NTU") and an allowance that were read for one account. Showing them for another account presents information from a previously connected wallet as if it belonged to the new one, which the product rules forbid.

## 3. How we fixed it
`web/components/trade/order-ticket.tsx` now ends the review step whenever the account, chain or market changes. The typed price and amount are deliberately kept (they are the visitor's draft, not account data); the visitor presses Review order again for the new account.

## 4. Evidence the fix works
**Before the fix** (browser run, mock wallet):
```
  FAIL  account switch: Bob sees none of Alice's orders and the ticket is reset
        page.waitForFunction: Timeout 30000ms exceeded.
```
**After the fix:** the same step passes in the 13-step run (`13 passed, 0 failed (mock wallet, scratch chain)`). This is a mock-wallet result, not a MetaMask result.
