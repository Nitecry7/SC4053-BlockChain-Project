# Issue P2-009: Five places where the trading UI could mislead or fail open

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** Independent read-only review (findings 1, 4, 5, 8, 9). Verified by reading the code; fixed.
- **Severity:** Medium for 1, 4 and 5; Low for 8 and 9.
- **Evidence limit, stated plainly:** these are component-level behaviours. The unit suite runs in a node environment without a DOM, so there is **no automated "before" failure** for them. The "after" evidence is the type check, lint, a production build and, for finding 1, a browser assertion.

## 1. Why the AI made the mistake
Each was a case of reasoning about the happy path of one component:
1. **Unmount orphans a request.** The flow hook had no cleanup, and switching market remounts the ticket, so an open wallet request outlived its UI.
2. **Stale approval notice.** The "approval confirmed" banner printed a stored amount with whatever token was selected now.
3. **Unreadable token metadata removed a warning.** The token details are read as one batch that fails as a whole. When a token's `symbol()` or `name()` reverts, the data was simply absent, so the "not issued by TokenFactory" warning vanished and trading stayed enabled.
4. **Green header despite a failed cross-check.** The result card said "confirmed" in green and put the "logs and chain disagree" alert underneath.
5. **"No events" before the registries loaded.** The transaction page decoded against empty registries and reported that the transaction had no events from this app's contracts.

## 2. Why it is problematic
They are all places where the UI states something it does not know: that a request is tracked, what was approved, that a token was vetted, that an order was verified, that a transaction had no events.

## 3. How we fixed it
1. The flow hook abandons its attempt on unmount, and the market picker is disabled while a request is open (`web/lib/busy-store.ts`).
2. The notice now reads the current allowance and the current collateral token.
3. Unreadable token details disable trading with an explicit message; the review shows the market and token contract addresses, since symbols are chosen by the issuer.
4. A failed cross-check shows an amber "mined, but the checks disagree" header instead of the green one.
5. The transaction page shows a loading state until both registries are known, and says so when they cannot be read.

## 4. Evidence the fix works
`tsc --noEmit` and `eslint .` clean; `npm run build` succeeds; the browser run asserts that the market picker is disabled while a wallet request is open. Findings 2 to 5 have no automated after-test (see the evidence limit above); they are on the manual checklist.
