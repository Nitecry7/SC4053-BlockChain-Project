# P2-6 evidence: token issuance and market listing

Date: 2026-11-06. Branch `faheem` at `3b4c8cc` plus uncommitted P2-6 files. Model: Sonnet 5.5 (Medium) planned and implemented; one fresh-context Sonnet reviewer (read-only). No Opus, no Haiku.
Environment: WSL2, Node 26, Foundry 1.9.0, Chromium 1252 via `playwright-core`.

## What was verified, and by what
| Layer | Verified | NOT verified |
|---|---|---|
| Unit (node) | input validation, supply parsing, pair classification, receipt decoding with synthetic logs, outcome binding, runner with fake deps, error text | a real chain |
| Real chain, scratch Anvil 8546 (viem, unlocked dev accounts) | issuance, every named revert, listing, duplicate and reversed pairs, 6-decimal and non-token addresses, external 18-decimal token, real trading on a newly listed market | MetaMask, a browser |
| Browser, mock wallet, build on 3100 | forms, review, rejection, double click, wrong network, stale account change, registry refresh, Trade hand-off, 3 widths | **MetaMask** (the wallet is an injected stand-in) |
| Manual MetaMask | **nothing yet**: procedure only, `docs/TESTING.md` Test 8 | everything |

## Results (observed this session)
| Check | Result |
|---|---|
| `npx vitest run` | 22 files passed, 2 skipped; **319 passed**, 39 skipped (the gated suites) |
| `tsc --noEmit`, `eslint .`, `npm run build` | clean |
| Real chain: `creation.integration.test.ts` + `trading.integration.test.ts`, `--no-file-parallelism`, fresh scratch chain | **39 passed** (21 new, 18 P2-5) |
| Browser `npm run e2e:create` | **14 passed, 0 failed** (mock wallet) |
| Browser `npm run e2e` (P2-5 regression, after the hook extraction) | **13 passed, 0 failed** (mock wallet) |
| `forge test` | 185 passed |
| Exporter `node --test contracts/script/export-web.test.mjs` | 21 passed |
| `scripts/check-local.sh` | ready, 0 warnings, against the owner's chain |
| Mutation checks (binding, duplicate, decimals) | 5 of 5 mutants killed: dropped base-decimals check, reversed reported as same, dropped supply binding, dropped creator filter, dropped balance check. Source restored and re-verified |
| `impeccable detect` on `/create-token` and `/list-market` | same finding classes as the existing `/trade` page (Inter, glow, 11px floor, nested cards); placeholder contrast fixed |

Owner's Anvil (8545, block 7, pid 4845) and `next dev` (3000, pid 11481) were not written to or restarted. The scratch chain and server were used for everything else.

## Review
One read-only Sonnet reviewer: no high or medium defects; four low findings, all confirmed and fixed red-first (issue P2-010). Items found by me: squeezed layout (screenshot), parallel-suite interference.

## Limits
Names and symbols are not unique; anyone can list any 18-decimal token (labelled, not blocked); orientation is permanent; registries are read one page (50) at a time; the P2-5 `runOrder`/`runApproval` still keep the original hash after a speed-up; screenshots in `p2-6-screens/` are mock-wallet renders, and nine `FAIL-*.jpg` files from an early failed run remain there and should be deleted by hand.
