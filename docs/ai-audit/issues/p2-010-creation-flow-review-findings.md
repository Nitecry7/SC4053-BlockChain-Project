# Issue P2-010: Invisible-character gaps, a stale hash, a silent deep link and a squeezed layout in the P2-6 creation flows

- **Date:** 2026-11-06
- **Phase:** P2-6, token issuance and market listing
- **Found by:** items 1 to 4 by an independent read-only Sonnet reviewer (confirmed by reading the code); item 5 by looking at the browser screenshot; item 6 by a failing run. Severity: Low for 1 to 4, Low (UX) for 5, process for 6.

## 1. Why the AI made the mistake
1. **Invisible characters.** I listed the zero-width and bidirectional ranges I knew by code point instead of using Unicode categories, so soft hyphen, no-break space, line/paragraph separators, Hangul filler U+3164, Braille blank U+2800, U+034F and tag characters were missed. The comment claimed all invisible characters were stripped.
2. **Lone surrogate.** I validated the text the user typed but did not think about how the ABI encoder rewrites a lone surrogate (to U+FFFD), so a correctly created token failed the "matches the request" check.
3. **Stale hash.** The runner kept its local `hash` from submission; the re-price event only updated the flow state.
4. **Silent deep link.** I handled "the chain says it is not a market" and "still checking" but not "the check itself failed".
5. **Squeezed layout.** I reused a full-width registry panel (`FactoryFacts`, a two-column grid) inside a 22.5rem sidebar column; the unit tests and the overflow check could not see it.
6. **Parallel suites.** Two real-chain files run in parallel share one chain and its `evm_snapshot`/`evm_revert`, so their reverts interleaved and 2 integration tests plus 6 browser steps failed.

## 2. Why it is problematic
1. A symbol like `USDC` followed by U+3164 looks identical to an existing symbol, and the same-symbol warning would not fire; an external token whose symbol is only U+3164 rendered as a blank label.
2. A successful issuance would have been reported as "not the token you requested".
3. After a speed-up, a later failure notice linked the replaced transaction.
4. `/trade?market=<real market beyond page 1>` with a failing RPC read silently showed a different market. (No funds at risk: orders go only to the displayed market.)
5. The "What you are issuing" facts were unreadable at desktop width.
6. Misleading red results that look like product bugs.

## 3. How we fixed it
1. `BAD_CHARS` and `INVISIBLE` now use `\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}` (plus `\p{Zs}` for input, where only the ordinary space is allowed) and the blank fillers.
2. Lone surrogates are rejected by the same class (`\p{Cs}`).
3. `runCreate` wraps `dispatch` so `HASH_REPLACED` updates its local hash. (The P2-5 `runOrder` and `runApproval` use the same pattern and were not changed in this phase; recorded as a follow-up.)
4. `trade-view.tsx` shows "Could not check <address> on-chain" when `isMarket` errors.
5. The forms stack the facts panel below the form, as the Tokens and Markets pages do.
6. Real-chain suites are run with `--no-file-parallelism`; the command in `docs/FRONTEND.md` says so. After restarting the scratch chain, all suites passed.
Also: the placeholder colour in the new fields was raised from 3.2:1 to about 5:1 after the impeccable detector flagged it.

## 4. Evidence the fix works
- **Before (red, real output):** after adding 9 tests, `npx vitest run lib/create-input.test.ts lib/safe-text.test.ts lib/create-runner.test.ts` reported `9 failed | 69 passed (78)`: seven new `validateTokenInput` cases (soft hyphen, interior no-break space, Hangul filler, Braille blank, line separator, tag character, lone surrogate), one `displayText` case and the re-priced hash case.
- **After (green):** `npx vitest run` -> `22 passed | 2 skipped` files, `319 passed | 39 skipped` tests; `tsc --noEmit` and `eslint .` clean.
- Items 4 and 5 have no automated unit test: item 4 is component logic (the unit suite has no DOM), item 5 was verified by the screenshot `p2-6-screens/list-market-review-desktop.jpg` after the fix.
