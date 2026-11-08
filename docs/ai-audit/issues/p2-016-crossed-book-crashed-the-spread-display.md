# Issue P2-016: a crossed book crashed the whole Trade and Dashboard page (negative spread)

- **Date found:** 2026-11-08 (P2-8B.3, the first browser run of the Match orders suite). Fixed the same day.
- **Phase:** introduced in the P2-4/P2-6 dashboard (commit `09b4e25`, 2026-11-05, "build DEX Next.js frontend"); exposed by P2-8B.3. **Model that wrote the original code:** the model of that session is not individually recorded.
- **Found by:** the new browser suite (`web/e2e/match.e2e.mjs`), not by a unit test and not by a human. Severity: **Medium**. The engine and its funds were never at risk; the page that exists to let a user fix a crossed book could not be drawn while the book was crossed.

## 1. Why the AI made the mistake
`spreadOf` in `web/components/dashboard/market-panels.tsx` computed `bestAsk.price - bestBid.price` whenever both prices were non-zero. It assumed the book is never crossed, which is true of the normal case the dashboard was built around: the engine matches an incoming order against the other side immediately, so best bid is below best ask. The one case where that does not hold was already known and documented (a placement that reaches the 10-fill cap leaves a crossed remainder, issue P2-002), but when P2-002 was fixed only the *order ticket's warning* was updated. Nobody asked what every other component does with a crossed book. The amount formatter `splitAmount` deliberately refuses negative values ("Negative values are not part of this app"), so a negative spread did not render as a wrong number: it threw.

## 2. Why it is problematic
Any crossed book, which only the cap can produce and which only Match orders can clear, made `Amount` throw during render. React unmounts the tree on an uncaught render error, so the whole Trade page failed (reproduced in a browser). The Dashboard renders the same two components, so it has the same fault by reading the code; that was not separately reproduced before the fix. The user with the most reason to open the page (a crossed book needs a settlement transaction) saw an error instead of the book and the new Match orders action. It also showed the wrong thing in principle: a crossed book has no spread to state.

## 3. How we fixed it
- `bookSpread(bestBid, bestAsk)` in `web/lib/crossed-book.ts` returns `none` (a side is empty), `crossed` (the same definition the Match orders panel uses, equal prices included) or `spread` with an unsigned value. It is the only place a spread is computed.
- `spreadOf` in `market-panels.tsx` now delegates to it. The board shows **Crossed** instead of a number and the depth panel shows "Crossed: best bid is at or above best ask". Nothing else about the panels changed.
- Unit tests for the four cases (`web/lib/crossed-book.test.ts`), and the browser suite now fails if the page throws while the book is crossed (its "no unexpected console errors" case and every case that opens a crossed book).

## 4. Evidence the fix works
**Before the fix** (first run of `npm run e2e:match` against a scratch Anvil and a scratch build of the pre-fix code; the seeded book was crossed):
```
  PASS  an uncrossed book (empty, then asks only): no Match orders panel, with or without a wallet
  FAIL  a crossed book while DISCONNECTED: the panel explains matching, the action is disabled and asks for a wallet
        locator.waitFor: Timeout 30000ms exceeded.
  ... (the same timeout in every case that needs the crossed book)
  FAIL  no unexpected console errors
        assertion failed: console errors: pageerror: splitAmount expects an unsigned value | pageerror: splitAmount expects an unsigned value | pageerror: splitAmount expects an unsigned value

1 passed, 14 failed (mock wallet, scratch chain)
```
**After the fix:** `lib/crossed-book.test.ts` 13 passed; the same suite, once the test-harness mistakes listed in `p2-8b3-batch-matching.md` were corrected, `15 passed, 0 failed`. The pre-fix first run's file is kept in the session scratchpad; the numbers above are copied from it.

**What this does not show:** the reproduction used a scratch chain and a mock wallet. It was never seen on the owner's chain, because the owner's chain has not had a crossed book.
