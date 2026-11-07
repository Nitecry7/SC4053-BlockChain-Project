# Issue P2-011: a stale "ghost" supply-share row appeared when the Dashboard switched to a market whose tokens were still loading

- **Date:** 2026-11-06
- **Phase:** P2-6.1, Dashboard market selector
- **Found by:** looking at the Playwright screenshot of the DTT / SGDx dashboard (the pair panel showed three supply-share bars, one labelled `0x0000…0000`). Severity: Low (display only; no funds or order routing involved).

## 1. Why the AI made the mistake
The P2-4 panel keyed its rows by `t.symbol`. That was safe while the Dashboard only ever showed the seed pair, whose tokens are known from the exported deployment. I reused the panel for any market without re-checking that assumption: for a market that is not the seed, both pair tokens fall back to the zero address (and the same short-address label) until their metadata is read, so two rows share one key. React does not reliably remove a stale node when keys are duplicated, so a third row stayed after the data arrived. The unit tests cannot see this (no DOM), and the first browser run did not look at it.

## 2. Why it is problematic
The pair panel briefly or permanently showed an extra row with a zero-address label for the selected market. It was misleading rather than dangerous, but it contradicted "Do not show stale data" and made a valid market look broken.

## 3. How we fixed it
`wallet-panels.tsx`: the two rows are keyed by position (`key={i}`), which is stable because the panel always renders exactly base then quote. The browser test now asserts that the pair panel has exactly two share rows after selecting DTT / SGDx.

## 4. Evidence the fix works
- **Before (red, real output):** with the old key restored and the app rebuilt, `npm run e2e:dashboard` -> `FAIL selecting DTT / SGDx switches every market-specific panel ... assertion failed: the pair panel has exactly two supply-share rows (no stale row left from the loading state)` and `12 passed, 1 failed (mock wallet, scratch chain)`.
- **After (green):** same run with `key={i}` -> `13 passed, 0 failed (mock wallet, scratch chain)`.
- Mock wallet, not MetaMask. Screenshot taken by the red run: `p2-6-1-screens/RED-p2-011-ghost-supply-row-before-fix.jpg` (the other screenshots are from the fixed build).
