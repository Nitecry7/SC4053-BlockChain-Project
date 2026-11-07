# P2-6.1 evidence: Dashboard market selector and all-token wallet overview

Date: 2026-11-06. Branch `faheem` at `e4927c6` (P2-6 committed) plus uncommitted P2-6.1 files. Model: Sonnet 5.5 (Medium) planned and implemented. No reviewer was spawned (no new signing, allowance or contract path; the state-management risks were covered by tests). No Opus, no Haiku.
Environment: WSL2, Foundry 1.9.0, Chromium 1252 via `playwright-core`. Scratch Anvil 8546, scratch build on 3100; the owner's chain (8545) and dev server (3000) were not written to or restarted.

## What was verified, and by what
| Layer | Verified | NOT verified |
|---|---|---|
| Unit (node) | market-request parsing and resolution (valid, lower-case, bad checksum, symbol, zero, registry vs on-chain, not registered, checking, check failed, fallback), registry page ranges and cap, token deduplication, nonzero/zero filtering, provenance, no cross-token sums, unread balances, details matched by address, per-account cache key | any DOM; there is no DOM test harness (none added: no new dependency) |
| Real chain (existing suites, scratch Anvil) | trading and issuance suites still pass | the new hooks directly (they are React hooks) |
| Browser, mock wallet, scratch chain (`npm run e2e:dashboard`, 13 steps) | default and fallback market; selection updates URL and every market panel; selecting sends nothing to the wallet; reload keeps the selection; invalid, non-market and unregistered requests fall back with a notice; Dashboard and Trade keep the market; a real trade through the dashboard ticket hits the DTT/SGDx OrderBook (target checked, Bob receives 4 DTT, 6 rest at 2); the overview updates without a reload after the trade and after creating a token in the app; account switch shows no previous-account balances; zero toggle; 56+ factory tokens (registry beyond one page) discovered; keyboard operation; 3 widths with no horizontal overflow and no console errors | **MetaMask** (injected stand-in wallet) |
| Manual MetaMask | **nothing yet**: procedure only, `docs/TESTING.md` Test 9 | everything |

## Results (observed this session)
| Check | Result |
|---|---|
| `npx vitest run` | 25 files passed, 2 skipped; **345 passed**, 39 skipped (26 new) |
| `tsc --noEmit`, `eslint .`, `npm run build` | clean |
| Real chain, `trading` + `creation` suites, `--no-file-parallelism` | 39 passed |
| Browser `npm run e2e:dashboard` | **13 passed, 0 failed** (mock wallet) |
| Browser `npm run e2e` (P2-5) / `npm run e2e:create` (P2-6) | 13 passed / 14 passed |
| `forge test` | 185 passed |
| Exporter `node --test contracts/script/export-web.test.mjs` | 21 passed |
| `scripts/check-local.sh` | ready, 0 warnings |
| Mutation checks (dedupe, nonzero filter, resolver fallback, invalid-format fallback, registry cap) | 5 of 5 mutants killed |
| `git diff --stat -- contracts CONTRACT_INTERFACE.md SPEC.md` | empty |
| `impeccable detect` on the three new components | no findings (regex only; the rules that need a rendered page did not run) |

## Defect found
[P2-011](../../issues/p2-011-duplicate-key-ghost-row-on-market-switch.md): a stale supply-share row on a non-seed market (red then green in the browser run).

## Screenshots
`p2-6-1-screens/` (mock wallet): default disconnected, Alice's holdings, Bob with zero balances, DTT selected, invalid market, trade result, and overview/trade at desktop, tablet and mobile. These are mock-wallet renders, not MetaMask, and not the final screenshot walkthrough.

## Follow-up, 2026-11-06 (documentation alignment, Haiku 5.5)
The sections above are the historical record of the P2-6.1 session and are unchanged. The owner reported a manual DTT / SGDx creation, listing and trade after this session. That is recorded in `docs/TESTING.md` Section F as an owner report. The dashboard's Test 9 steps (market selector, holdings, account switch) were not reported as performed, and no screenshots from that run are in this repository. The "Manual MetaMask: nothing yet" row above is correct for the P2-6.1 session.
