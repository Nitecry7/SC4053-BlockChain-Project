# P2-8B.0 and P2-8B.1: integration preflight and scratch verification

**Date:** 2026-11-08. **Model:** Sonnet 5.5 (Medium requested; the session effort setting could not be read). **Scope:** verification only. No source file, test, ABI or deployment record was changed. No bonus UI was built. Nothing was staged, committed or pushed.

Everything below was run in this session on WSL against a scratch Anvil on port 8546 and a scratch frontend on port 3100, with the mock wallet. **None of it is a MetaMask result and none of it is a deployment check.** Raw outputs are in the session scratchpad, which is outside the repository and not kept.

## 1. Repository state (P2-8B.0)

| Check | Observed |
|---|---|
| `HEAD` | `924ba6f` ("Merge docs/wrapup (step 4: submission checklist)"), branch `faheem`, tracks `origin/faheem`, working tree clean |
| Contains P2-8A.1 / P2-8A.2 | `6800a75` is an ancestor; `dd60588` (liveness) is the last commit touching `web/lib/rpc-health.ts` |
| Relation to `main` | Local `main` is an ancestor of `HEAD`. `origin/main` (as last fetched, `e868f2a`) is **8 commits ahead** of `HEAD`; they are report and figure documentation commits. `git diff HEAD origin/main -- contracts/src web/lib` is empty. Not fetched or merged in this session |
| `OrderBook.sol` | `cancelOrder`, `matchOrders`, `placeStopLimitOrder`, `triggerStopOrders` are implemented (no bare `revert()` bodies) |
| Compiled sizes (`forge build --sizes`) | OrderBook 8,461 B runtime / 9,124 B initcode; MarketFactory 10,508 B / 10,537 B (limits 24,576 / 49,152) |
| Interface | Compiled ABI has the five events (`OrderPlaced`, `Trade`, `OrderCancelled`, `StopOrderPlaced`, `StopOrderTriggered`) and 12 errors including the two inherited ones; `Status` is `Open, PartiallyFilled, Filled, Cancelled, PendingTrigger`, matching `web/lib/order-status.ts` by index. The four functions have named parameters |
| Committed ABI vs a fresh export | A scratch export (below) is **byte-identical** to the committed `web/lib/contracts/abis.ts` and `deployments.ts`; `export-web.mjs --check` passes |

**The owner's main chain (8545) was only read** (`eth_chainId`, `eth_blockNumber`, `eth_getCode`, `eth_call`, `export-web.mjs --check`). It was at block 11 and already runs the new engine: market code is 8,461 B, `matchOrders(1)` simulates 0, `cancelOrder(9999)` from account 1 reverts `NotOrderOwner`, and `--check` reports it up to date. So the expected "old deployment is incompatible" case does **not** apply to 8545: it was redeployed on 2026-11-08 (its Anvil started at 03:18). No state was written to it.

## 2. Isolation

- Protected processes at the start: Anvil 8545 pid 151675, Next 3000 pid 146310 (cwd the repo's `web/`). Both were checked again at the end: same pids and start times, 8545 still at block 11, 3000 answers HTTP 200.
- SHA-256 of `web/lib/contracts/abis.ts`, `deployments.ts`, `web/next-env.d.ts`, everything under `contracts/broadcast/` and `contracts/cache/Deploy.s.sol/` was taken before any Foundry run and compared at the end: **identical**. `git status` is clean apart from the two documentation files added by this phase.
- Scratch deploys used `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` pointing into the scratchpad, and the exporter ran with `--broadcast-file` and `--out` pointing there. `forge test` used its own cache path.
- The scratch frontend was built from a **copy** of `web/` (so the dev server's `.next` was never touched) with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`, and served on 3100. Fresh-chain addresses are deterministic, so 8545 and 8546 have identical contract addresses; "a deployment was found" would prove nothing. Instead a Playwright capture loaded `/`, `/trade`, `/tokens` and `/markets` and counted requests by port: **30 POSTs to :8546, none to :8545** (repeated after the chain restart in section 5). The server process environment carries the 8546 URL.

## 3. Baseline results (first pass)

| Layer | Result |
|---|---|
| `forge test` | 335 passed, 0 failed (27 suites; it ran concurrently with other work in the first pass) |
| Exporter tests | 21 passed |
| `npm test` (web) | 410 passed, 48 skipped |
| `tsc --noEmit`, `eslint .` | clean |
| Production build (copy of `web/`, scratch RPC URL) | succeeded |
| Real chain (trading, creation, hardening), 8546 | 48 passed |
| Viem journey through the frontend's own ABI (simulate, send, receipt, decode), 8546 | **61 of 61 checks passed**, then reverted. Cancel (partial fill, non-owner and unknown id revert `NotOrderOwner`, double cancel and cancel of a filled order revert `OrderNotActive`, refunds decoded from `OrderCancelled` and matched against balances, buy-side refund of `lockedQuote`); batch (`matchOrders(0)` and `(11)` revert `InvalidMaxCount`, a no-op simulates 0, a book left crossed by the fill cap on two bids is cleared by a token-less keeper, 2 `Trade` logs, keeper balances unchanged, market escrow 0 afterwards); stop-limit (pending stop is `PendingTrigger`, absent from `getBook` and best ask, escrow at the limit price, trigger simulates 0 until eligible, `StopOrderTriggered.lastTradePrice` is the market price, the stop trades as taker at the maker's price, `triggerStopOrders(0\|11)` revert, cancelling a pending stop refunds in full, zero price, zero amount and off-tick trigger revert with the right names). Gas observed: `matchOrders` 224,189 for 2 fills |

The journey script was mine (not Person 1's). Its last check, "market escrow equals the sum of live-book obligations", compares two zeros at the end of the run, so it is weak evidence of solvency; the solvency evidence is the engine's own invariant suite, not this script.

## 4. Browser suites (mock wallet), first pass: the original result

All five suites ran sequentially on 3100 against 8546 (output kept):

| Suite | Result |
|---|---|
| `npm run e2e` (Trade) | **7 passed, 6 failed** |
| `npm run e2e:create` | 14 passed |
| `npm run e2e:dashboard` | 14 passed |
| `npm run e2e:hardening` | 9 passed |
| `npm run e2e:liveness` | 11 passed |

The six Trade failures, in order: "Alice sells 10 NTU @ 2" (`approval button states the exact collateral (got undefined)`), "SPEC example through the UI" (`an immediately crossing buy ends Filled`), "My orders and the transaction page show the same facts as the chain" (20 s locator timeout), "switching back to Alice shows her partly-filled order" (20 s locator timeout), "a double click sends exactly one wallet request" (`one approval transaction for a double click`), "account change while the wallet request is open" (30 s click timeout). Seven tests passed (the first three and the last three, plus account switch and rejection).

**This original 7 passed / 6 failed result is the result of record for that run. It was a failure, and it is not replaced by the later passing run.**

## 5. Diagnosis

**First failing assertion.** `approvedWith` is `undefined`: after Alice entered a sell of 10 NTU and pressed Review, the first button was not "Approve 10 NTU", so the UI considered her allowance already sufficient and went straight to "Place sell order". The remaining five failures follow from that one: later tests assume an approval was sent through the wallet (the double-click test counts approval transactions) or assume the orders created by the earlier test.

**Observations at post-run inspection** (read-only calls on the same chain): Alice's NTU allowance to the market was exactly 100e18; Bob's was 0. Block 12 on that chain was the only non-deployment transaction before the suites ran, and its decoded content was `approve(spender, 100e18)` on the NTU token **sent by Alice**. Blocks 13 and 14 held no transactions (their origin was not established; the browser suites mine blocks, which is the likely source, but I did not verify that).

**Where that transaction came from.** It came from my own first run of the journey script. That run threw a `ReferenceError` (a helper function was named `placeLimit` while the script called `placeLimitOrder`) on the line immediately after the first `approve(alice, NTU, 100)`, so it sent that approval and exited before reaching its `evm_revert`. I fixed the typo and re-ran. The second run took its snapshot **after** the leaked approval, so its `evm_revert` returned to a state that already contained it. My "balances restored" check compared token balances only, not allowances, so it did not notice. The Trade suite's own start-up check only asserts that Alice has no orders (`trade.e2e.mjs`, the `existing.length === 0` check), not that she has no allowance, so it did not notice either.

**Reproduction (controlled).** On a freshly restarted and redeployed chain (below), with nothing else running (no `forge`, no other browser suite):

1. Clean chain, `npm run e2e` alone: **13 passed, 0 failed.**
2. `evm_snapshot`, then one transaction: Alice `approve(market, 100e18)` on NTU (the same leak), then `npm run e2e` alone: **7 passed, 6 failed, with the same six failing tests and the same first assertion message** (`got undefined`, `an immediately crossing buy ends Filled`, `one approval transaction for a double click`, and the same three timeouts).
3. `evm_revert` to the snapshot; Alice's allowance read 0, her orders `[]`, head block 11 again.

**Confirmed root cause:** a test-isolation defect caused by my own aborted journey run, which left an Alice-to-market NTU allowance of 100e18 on the shared scratch chain. The Trade suite assumes zero allowances, so its approval step was skipped, and the following tests cascaded. This is supported by (a) the decoded block-12 transaction, (b) the allowance read after the run, and (c) the exact reproduction of the failure signature on a clean chain with the leak recreated and removed.

**Not caused by a defect in the application, the contracts or the merged engine,** as far as these runs show: with the leak absent the suite passes 13 of 13 against the merged engine.

**What is not established.**
- CPU contention from the concurrent `forge test` is excluded as the cause of the six failures (the reproduction ran with the machine otherwise idle and produced them), but whether load alone would make the suite fail was **not tested**.
- The allowance was not read at the moment the original run failed; the chain of evidence above is inferred from the state afterwards plus the reproduction.
- The `create`, `dashboard` and `hardening` suites passed with the leak present. I did not analyse why they were unaffected (they may simply not depend on Alice's NTU allowance), so they should not be read as proving independence from allowances.
- Mock wallet only: nothing here exercises MetaMask.

**Proposed minimal fix (not applied; the owner decides).** In `web/e2e/trade.e2e.mjs`, where it already asserts that Alice has no orders, also read the allowances of Alice, Bob and Carol for both tokens to the market and fail with a clear message ("the scratch chain has leftover approvals; restart and redeploy") if any is non-zero. This changes no assertion about application behaviour, and makes the same mistake fail fast with the right explanation instead of six confusing failures. Equivalent checks may be worth adding to the other suites' preconditions.

## 6. Clean-chain rerun procedure and results

1. Verified that pid 160647 was the scratch Anvil: its `/proc/<pid>/cmdline` was `anvil --port 8546 --host 127.0.0.1` and it was the listener on 8546. Only then was it stopped (by that pid, never by name).
2. Started a new Anvil on 8546 (pid 171544, block 0), redeployed with `Deploy.s.sol` with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected, exported to a scratch directory: byte-identical to the committed files; `--check` passes. Deploy block 1, head 11.
3. Verified before running: for Alice, Bob and Carol, NTU and SGDx allowance to the market all 0, orders `[]`, balances 10,000 of each.
4. Confirmed that the scratch frontend (pid 164830, cwd the scratch copy of `web/`) still carried the 8546 URL; the request capture again showed only port 8546. Next is stateless server-side, so no restart was needed; each suite opens a fresh browser.
5. `npm run e2e` alone: **13 passed, 0 failed** (this is a second, later run; it does not change the original result in section 4).
6. Leak reproduction as in section 5, then revert; the scratch chain was left clean (allowance 0, no orders, head 11).

## 7. Is the P2-8B baseline ready to approve?

**Yes, for the engine and ABI**; **yes for the frontend baseline, with one caveat.**
- Engine, ABI, factory deployment and the four bonus functions on a fresh chain behave as `docs/ENGINE_HANDOFF.md` describes (section 3), and the committed ABI matches the build.
- Frontend baseline: 410 unit tests, typecheck, lint, build, 48 real-chain tests and four of the five browser suites passed first time; the Trade suite passes 13 of 13 on a clean chain.
- Caveat: the Trade suite (and any suite that assumes an empty allowance table) does not detect a polluted chain; apply the precondition in section 5 or always restart and redeploy the scratch chain before a run. For the bonus work every suite should start from a freshly deployed scratch chain.

## 8. Findings for the integration phase (nothing changed)

- **No frontend code calls any bonus function or decodes any bonus event.** A grep of `web/` outside the generated ABI finds no use of `cancelOrder`, `matchOrders`, `placeStopLimitOrder`, `triggerStopOrders`, `OrderCancelled`, `StopOrderPlaced` or `StopOrderTriggered`.
- **Stale text and names** (grep for the strings, not line numbers from older documents): `components/trade/order-result.tsx` ("`matchOrders` is not available yet"), `components/trade/my-orders.tsx` (the comment and the note "Cancelling orders is not available in the deployed engine yet"), `components/dashboard/side-panels.tsx` ("Planned features"), `components/shell/app-shell.tsx` ("not available yet" navigation entries), `lib/order-plan.ts` and the test names in `lib/order-plan.test.ts`, `lib/trading.integration.test.ts`, `lib/tx-errors.test.ts`.
- **`lib/errors.ts`** has no text for `NotOrderOwner`, `OrderNotActive` or `InvalidMaxCount`.
- **Behaviour that will be wrong once stops exist:** `collateralHeld` in `lib/order-status.ts` returns `undefined` for a pending sell stop (its escrow is `amount - filled` base); `decodeOrderReceipt` requires `OrderPlaced` and would reject a stop placement (a stop emits `StopOrderPlaced` instead); `decodeTxEvents` does not recognise the three new events; `useMyOrders` finds an order's placement transaction only through `OrderPlaced`, so a stop would have no placement link.
- **Gating:** every new bonus control must use the P2-8A.2 verified-chain state, like the existing ticket, and the loose-limit warning for issue 007 is still to build.
- **Stale documentation (not edited here):** `docs/TESTING.md` and `docs/DEPLOYMENT.md` still quote 185 Foundry tests, OrderBook 6,325 B / MarketFactory 8,358 B, and "unnamed parameters" or "not implemented" for the four functions; `docs/BONUS_INTEGRATION.md` still says none of the bonus functions is implemented and its pre-integration checklist is unticked; the traceability table row for B1 to B3 in `prompt-log-person2.md` still says "Not implemented (Person 1's engine)". They should be updated in the phases that integrate the features, not rewritten now.

## 9. Recommended order and files for the integration (a plan, not done)

1. **Preparation:** error text in `lib/errors.ts` (with tests); remove stale text; the loose-limit warning in the ticket; trade-suite allowance precondition.
2. **Cancel:** `lib/order-runner.ts` (a runner beside `runOrder` reusing `waitBounded`), `lib/receipt.ts` (decode `OrderCancelled`), `hooks/use-tx-flow.ts`, `components/trade/my-orders.tsx`, `lib/order-status.ts`; for pending stops later.
3. **Match orders on a crossed book:** `components/trade/order-result.tsx`, `lib/order-plan.ts`, the book view in `components/dashboard/market-panels.tsx`; shown only when best bid is at least best ask.
4. **Stop-limit:** ticket in `components/trade/order-ticket.tsx`, pending list in `my-orders.tsx`, `hooks/use-dex-data.ts`, `lib/order-status.ts`, `lib/receipt.ts` (three new events), and the Trigger stops action.
5. **Docs and tests:** `README.md`, `PRODUCT.md`, `docs/FRONTEND.md`, `docs/TESTING.md`, `docs/BONUS_INTEGRATION.md`, the traceability table; real-chain tests per bonus; MetaMask procedures marked "procedure only".

Pending the owner's go-ahead for each step; nothing in this list was started.

## 10. End state

- Scratch Anvil 8546: pid 171544 (restarted), deploy state, allowances 0, no orders.
- Scratch frontend 3100: pid 164830, `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`.
- Owner's Anvil 8545 (pid 151675) and Next 3000 (pid 146310): untouched, same pids and start times.
- Tools used: `forge`, `anvil`, `cast`, `node` (exporter, viem journey), `vitest`, Playwright (`playwright-core`) with the mock wallet. No Slither, no Context7, no MCP design tools, no axe.
