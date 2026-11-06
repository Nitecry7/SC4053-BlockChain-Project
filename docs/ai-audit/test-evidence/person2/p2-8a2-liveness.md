# P2-8A.2: RPC liveness, recovery verification, R6b and R8

Date: 2026-11-06. Model: Claude Sonnet 5.5 (Medium requested; the session's effort setting could not be read from inside the session). Baseline: branch `faheem`, HEAD `6800a75` (P2-8A.1 committed), tree clean at the start. Nothing was staged, committed or pushed.

Status words: **verified** = observed in this session; **inferred** = read from code, not run; **unverified** = not established.

## 1. Environment and isolation
| Item | State |
|---|---|
| Owner's Anvil 8545 | pid 4845, listening before and after; never written to |
| Owner's `next dev` 3000 | pid 11481, HTTP 200 before and after; never touched |
| Scratch Anvil 8546 | started with `--state` (so a restart can reload the same chain); stopped and restarted only by the recorded pid (`SIGINT`, never `pkill`); both scratch listeners are stopped and checked at the end (section 9) |
| Scratch app 3100 | built and served from a copy of the source in the session scratchpad (`rsync` of `web/`, own `node_modules` hard-linked copy), so `web/.next` (used by the owner's dev server) was not rebuilt; restarted by recorded pid |
| Contracts | deployed with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected into the scratchpad; the repository's broadcast records were not touched |

One stray file, `anvil.pid` in the repository root, was created by my own shell command and removed (it was untracked and mine).

## 2. R9 reproduced first (before any code change)
Method: the **HEAD build** (`git archive HEAD web`, built in the scratchpad, served on 3100) against the scratch Anvil, mock wallet connected as Alice on `/`. Script `r9.mjs` (scratchpad).
1. Load and connect: balances, "Read from chain, refreshed every block", block 11 shown. No alert, no status region.
2. Stop the scratch Anvil by its recorded pid (`SIGINT`).
3. Wait 22 s. **Result: no alert and no status region; the page still says "Read from chain, refreshed every block", still shows block 11 and the same balances.** 46 JSON-RPC requests failed in those 22 s (browser-level `requestfailed`), none reached the user.
4. Restart the node with `--state` (same chain, block `0xb` again). The page still showed nothing about the interruption, and was in fact correct, by luck rather than by checking.

**Cause (inferred from the code, then consistent with the observation):** every refresh is triggered by a new block (`useLiveBlock`) or a user action. A dead node produces neither. `useChainWatch` polls every 3 s but deliberately swallows its errors ("no evidence, so no claim"). `useDeploymentCheck`'s `getCode` query is only refetched by those triggers, so `codes.isError` never becomes true and `classifyDeployment` never returns `unreachable`.

**Pre-existing or regression?** The code path is unchanged by P2-8A.1 (the per-block predicate only skips static reads). The reproduction above is on the HEAD build, which contains P2-8A.1, so it shows the behaviour **after** P2-8A.1. Running the parent commit `b95ec8c` was not done, so "it predates P2-8A.1" remains **inferred from the code**, not demonstrated.

## 3. What was built (minimal)
| File | Role |
|---|---|
| `web/lib/rpc-health.ts` | The state machine and probe scheduler (pure, no React). States `unknown`, `online`, `offline`, `verifying`, `refreshing`, `unverified`. `dataReadsAllowed` and `transactionsAllowed` are the two gates (`transactionsAllowed` is `online` only, see section 13) |
| `web/hooks/use-rpc-health.tsx` | The provider (mounted once, in `providers.tsx`), the real probe, the real recovery verification, the settle check, `useRpcHealth()` |
| `web/lib/deployment-targets.ts` | The five deployment contracts and the code-query key, shared by the deployment check and the recovery verification |
| `web/lib/network-status.ts` | `classifyDeployment` gets an optional trailing `rpcOffline`; true gives the existing `unreachable` status, so every `live` gate keeps working |
| `web/hooks/use-dex-data.ts` | `useDeploymentCheck` reads the health state; it also returns `settling` |
| `web/components/shell/rpc-health-banner.tsx` | The outage alert (`role="alert"`) and the verification status (`role="status"`) |
| `web/components/dashboard/panel.tsx` | A "Last known, not current" chip on every panel while the node is unreachable and data was read before |
| `web/components/shell/chain-reset-notice.tsx` | One notice, from the watcher's evidence or the health check's, one dismiss for both |
| `web/components/trade/order-ticket.tsx`, `create/use-create-context.ts` | Ticket and create forms disabled while `settling`; the label says "Node unreachable" or "Verifying chain…" |
| `web/components/trade/trade-view.tsx`, `dashboard/status-banners.tsx` | The "No live deployment" empty state no longer claims that during an outage; the old unreachable banner no longer duplicates the global one |

**Probe.** `eth_getBlockByNumber("latest", false)` through `client.request(..., { retryCount: 0 })`: one request returns the head's number and hash (the hash keeps the recovery anchor current at no extra cost), it bypasses viem's block-number cache, and a failing probe is not retried by the transport (viem's default is three retries, which would multiply requests during an outage). Deadline 3 s. One probe in flight at a time; the next is scheduled after the previous one finishes.

**Hysteresis.** Two consecutive failed probes before `online` becomes `offline`; one success never makes a verified `online` page offline; alternating success and failure never reaches `offline` (unit tests). If nothing has ever been read, one failed probe is enough, because there is no data to flicker.

**Interval: 5 s, backing off to 10 s while unhealthy.** Measured cost and latency are in section 6; the alternative (10 s) would halve the cost and double detection latency.

**Recovery (the owner's refinement).** A successful probe after an outage never re-enables anything by itself:
1. `verifying`: read the genesis block and the block at the anchor height and call the existing `assessChain` (P2-7; no new detection rule), then freshly read the contract code at all five deployment addresses and, if present, the market's `baseToken()` and `quoteToken()`. Any failed read, an `unknown` verdict or the 10 s deadline gives `unverified` (truthful, retried with back-off).
2. The caches are invalidated for the verdict: everything on a reset, the per-block set (static reads excluded) otherwise. Then `refreshing`: data reads are allowed again, transactions are not.
3. `online` only when every **active** query is idle, not invalidated and in `success` status on two consecutive checks (250 ms apart, 9 s deadline). Invalidation is not treated as proof of a fresh read; a failed, pending or still-invalidated active query keeps the page out of `online`.

**Coordination with the P2-7 watcher (second refinement).** `use-chain-watch.ts` is unchanged. Both detectors call the same pure `assessChain`, so they cannot disagree about the verdict. They can both act on one reset, so: (a) one notice component shows the watcher's evidence or the health check's, and one dismissal clears both; (b) the health state converges on the cache's real state (the settle check reads the cache, so a late watcher invalidation simply delays `online`); (c) request counts after a recovered reset were measured (section 6) and stay bounded.

## 4. Tests added and results (all red-first or mutation-checked)
| Layer | Tests | Result |
|---|---|---|
| `lib/rpc-health.test.ts` (fake timers, scripted node) | 17: healthy node with no block, no flicker, alternating probes, initial-load failure, hung probe, back-off cap, unchanged chain, fresh chain, same height with another hash, failed verification, reads that never settle, recovery from `unverified`, node dying during verification, never-read page, dismissal | 17 pass |
| `lib/network-status.test.ts` | `rpcOffline` gives `unreachable` | pass |
| `components/shell/rpc-health-banner.test.ts` | banner roles and wording, silent when healthy, no "last known" claim when nothing was read, panel chip | 7 pass |
| `components/trade/tx-status.test.ts` | the name is on the `<ol>`, not a `<div>` | 2 pass |
| `e2e/liveness.e2e.mjs` (mock wallet, scratch chain, outage by blocking browser requests) | 11 (section 5) | 11 pass |

**Unit suite after the change: 410 passed, 48 gated skipped (383 before; 408 before the final review in section 13).**

**Mutation checks on `rpc-health.ts`** (each reverted afterwards; the file was restored and diffed clean): M1 go `online` without waiting for the reads to settle: 1 test fails. M2 allow transactions while `refreshing`: 1 fails. M3 one failed probe is enough for `offline`: 2 fail. M4 treat a reset as a non-reset for invalidation: 2 fail.

## 5. Browser suite `e2e:liveness` (11 passed; mock wallet, not MetaMask)
Healthy node with no new block (no banner, no chips, no reset notice, 16 s); brief failure under one probe cycle (no banner); persistent outage (alert, "last known" wording, chips, no usable ticket, a truthful empty state); account and network switch while offline (still blocked); unchanged-chain recovery (a block mined meanwhile; no reset claimed; usable only after verification); same height with a different hash (one notice after settling, exactly one 6 s later, one dismissal clears it); head below the earlier block; initial load with the node unreachable ("Nothing has been read from the chain yet", no chips) then recovery; market pair after recovery; console errors. A `MutationObserver` recorded every DOM change: **no ticket button that could start a transaction was ever enabled while an outage or verification banner was present.**

**Real stop and restart of the scratch Anvil** (script `lat.mjs`, `fresh.mjs`, `r9.mjs`, scratchpad):
- Same chain (`--state` reload): outage banner **9.8 s** after the node stopped; verification shown 7.1 s after the node answered again (probe back-off), verified and cleared 0.8 s later; no reset notice, block `0xb` before and after.
- Fresh chain (state deleted, new Anvil, nothing deployed): outage banner; the chain watcher's notice ("the chain head (block 0) is below block 15") and the health check's verification overlapped; the observed sequence was `offline`, `offline + reset notice`, `verifying + reset notice`, `reset notice` only: **one notice**, the old "No SC4053 DEX deployment on this chain" banner (contracts gone) was shown, 53 JSON-RPC operations in the 16 s after recovery. After `forge script` redeployed, the page showed live data again with the one notice still dismissible.
- Not done as a real restart: same height with a different hash (covered by the blocked-request test using `evm_revert` and `evm_mine`).

## 6. RPC traffic (same method as P2-8A.1: Chromium, mock wallet, requests counted by Playwright)
| Scenario | Before (HEAD build) | After |
|---|---|---|
| Idle 60 s, overview, wallet connected | 55 HTTP / 55 ops (`eth_getBlockByNumber` 40, `eth_blockNumber` 15) | **67 HTTP / 67 ops** (`eth_getBlockByNumber` 52, `eth_blockNumber` 15): **+12 per minute** |
| Idle 60 s, `/trade` | 55 / 55 | 67 / 67 |
| Node stopped, 22 s | 46 failed requests (nothing shown) | 49 failed requests (alert shown); about 2 per second in both |
| 55 s outage in `e2e:liveness` | not measured | 121 operations |
| ~50 s after a recovered reset | not measured | 83 operations |

The probe adds exactly the 12 requests per minute expected from a 5 s interval; they are single requests (the idle ones do not batch because nothing else is in the same tick). The static-read skip and batching from P2-8A.1 are unchanged: the per-block and load measurements were not repeated in this phase, so those P2-8A.1 numbers are not re-confirmed here beyond the unchanged code and the passing `query-scope.test.ts`. During an outage, request rate is no higher than before (back-off to 10 s and `retryCount: 0` on the probe); the existing readers still fail at their own pace.

**Failed batches.** The probe is one request; a transport failure, a JSON-RPC error object or a null result all reject. A batch that partly succeeded is never treated as proof of freshness: liveness comes only from the probe, and every data read keeps its own `isError` handling (`rpc-batching.test.ts` from P2-8A.1 still passes).

## 7. R6b: the four containers
**Reproduction before any fix** (axe-core 4.14.0, loaded transiently from jsDelivr, not a dependency; script `r6b.mjs`): eight states (order review box, approval progress, token review box, market review box, each at 1586 and 375 px), each driven through the real UI with the mock wallet. In all eight, axe reported **no violation** but one **needs review** (`aria-prohibited-attr`): *"aria-label attribute is not well supported on 'div' elements with no valid role attribute."* The approval-progress state had two (the progress `<div>` and the review box still on screen). I treat that as a confirmed defect, because ARIA gives a generic `div` no naming role, so the name may not be announced; axe cannot call it a hard violation only because the elements contain text.

**Fix (native, no visual change):**
- `tx-status.tsx`: the `aria-label` moved from the wrapping `<div>` to the `<ol>` (a list can be named). No new role.
- Three review boxes (`order-ticket.tsx`, `token-form.tsx`, `market-form.tsx`): `role="group"` with `aria-labelledby` pointing at the visible heading line "Review before you sign". A labelled group is the semantic for a named set of related items; the name now comes from visible text. The `data-testid="review"` hooks are unchanged. The old per-box names ("Review order", "Review token", "Review market") are replaced by that visible heading; if a more specific name is wanted, that is an owner decision.

**After:** the same eight states: **no violation and no needs-review for `aria-prohibited-attr`**. Rules run on those states: `aria-allowed-attr`, `aria-allowed-role`, `aria-prohibited-attr`, `aria-required-attr`, `aria-valid-attr`, `aria-valid-attr-value`, `label`, `label-content-name-mismatch`, `region` (9 to 11 depending on the state). Full default ruleset on the 18 P2-8A.1 views again: **0 violations on all 18**. Not claimed: any screen-reader behaviour (none was used). `<dl aria-label="Order summary">` (order ticket) was **not** flagged by axe and was left alone; whether a screen reader exposes that name is unverified.

## 8. R8: contrast (method: rendered pixels, 18 views)
Method (unchanged from P2-8A.1, `contrast.mjs`): for each visible text run take its computed colour and opacity, render the same page with all text transparent, sample the real pixels behind the run, and compute the WCAG ratio of the text colour (composited at its alpha) against each pixel. A run is below AA if its 5th-percentile ratio is under 4.5 (3 for text of 24 px or larger, or 18.66 px bold or larger). Disabled controls are excluded. This time **every** failing run was kept (P2-8A.1 kept only the worst six) and the sample is the **18 views** (7 routes at 1586 and 375 px disconnected, plus `/` and `/trade` connected), which are the same views as the axe run.

| Finding | Measured before | Action | Measured after |
|---|---|---|---|
| Token badge letters (white on gradient discs) | S 2.34 to 2.47, N 3.67 to 3.99, A 2.03 to 2.39 (the "A" marks are tokens created by my own R6b script) | Letter colour is now part of each palette: dark navy `#0a0f24` on the three light palettes (computed ratio 5.7 to 9.5 across the letter), white kept on the purple whose start stop was darkened (`#a07bff` to `#8860f2`, computed 4.85) | 0 failing runs |
| "Connect wallet" buttons (white 13 px on the violet gradient, five identical class strings) | 3.67 at 1586 px, 3.65 at 375 px | The gradient's light middle stop darkened (`152 128 246` to `118 96 228`, alpha kept); the end stops are unchanged | 0 failing runs |
| 11 px hint text (`text-subtle`) | 4.09 to 4.4 (borderline) | `--subtle` `#8a94b3` to `#96a0be` | 0 failing runs |
| `--muted-foreground` | below 4.5 on a few 11 px runs | `#a8b0cb` to `#b6bed8` (one token) | 0 failing runs |
| Dimmed disconnected-state placeholders: the large dash and the symbol beside it (`text-white/25`, `aria-hidden`) | 1.11 (1586 px), 1.15 (375 px) | **Not changed.** They are deliberately dimmed, `aria-hidden` placeholders for a value that does not exist yet; raising them to 4.5 would mean about 62 % white and would remove the "empty" look. Whether this counts as an inactive component is for the owner to judge | still 1.11 and 1.15 |
| "Open Trade view" link at 375 px, connected | 1.15 at the 5th percentile, median 7.28 | **Not changed, treated as a measurement artifact**: after scrolling the link lies under the sticky header in the full-page screenshot used for sampling. Unverified; needs a DevTools check | still reported by the script |
| 11 px "SGDx" / "per" spans at 375 px | 4.38 to 4.46 | **Not changed by a separate fix**; they use `--muted-foreground`, whose lift above lowered the count but the script still lists 2 runs at 4.38 on `/trade` at 375 px | 2 runs at 4.38 (median passes) |

The token changes are global (every muted and subtle caption is slightly lighter). Screenshots of the markets page and the overview were inspected after the change: the layout, glass surfaces and gradients are the same; only the badge letters and the lightness of captions differ.

**Not established, owner's manual check:** contrast over the remaining gradient-and-glow areas that the sampling cannot reach (hover and focus states, the open wallet dialog, tooltips, the RainbowKit modal, chart-like areas, any state not listed above); the "Open Trade view" artifact; screen-reader behaviour. **No claim of overall WCAG compliance is made.** Procedure: Chrome DevTools, inspect the element, open the colour picker in the Styles pane and read the contrast ratio, for each remaining case; test at 375 and 1586 px with the wallet connected and not connected.

## 9. Regression results (all against scratch 8546 and 3100)
| Check | Result |
|---|---|
| Unit tests | **410 passed, 48 skipped** |
| `tsc --noEmit`, `eslint .` | clean |
| Production build (scratch copy, `next build`) | succeeded (built four times; the last build contains every change) |
| Real chain (trading, creation, hardening), `--no-file-parallelism` | **48 passed** |
| Browser, mock wallet: `e2e`, `e2e:create`, `e2e:dashboard`, `e2e:hardening` | **13, 14, 14, 9 passed** |
| Browser, mock wallet: `e2e:liveness` (new) | **11 passed** (run twice: before and after the contrast changes) |
| axe 4.14.0, 18 views | **0 violations** |
| `forge test` | **185 passed**, 0 failed |
| Exporter tests | **21 passed** |
| Generated ABI and deployment files, Solidity, SPEC.md, CONTRACT_INTERFACE.md, CLAUDE.md, ENGINE_PHASES.md | no diff (see the final `git status` in the report) |

## 10. Limits and risks
- A successful probe proves reachability only. It does not prove that blocks are being produced or that any contract other than the five checked is valid.
- A hosted RPC provider may rate-limit a 5 s probe, may not accept `eth_getBlockByNumber("latest")` the same way, or may cap batch sizes; only a local Anvil was tested.
- After a recovery, `online` waits for all **active** reads to succeed. A read that fails permanently (for example a registry log scan that always errors) would leave the page in `unverified` instead of `online`; that is intentional (truthful), but it was not observed with a real permanent failure.
- A page that was never connected (`everRead` false) shows no "last known" labels, by design.
- The wallet's own chain (MetaMask on another network) is a separate, existing state (wrong network banner) and is not part of this mechanism.
- Outages in the browser suite are simulated by failing the browser's requests; the real stop and restart runs above covered the same-chain and fresh-chain cases once each, by script, not as a repeatable suite.
- Mock wallet only; no MetaMask run.

## 11. Skills and tools actually used
`react-best-practices` (loaded earlier in the session; rules applied: narrow effect dependencies, one provider and a derived `settling` flag instead of duplicated state, a single timer chain per effect with cleanup, no `useEffect` polling per component; rejected: bundle and memoisation rules, as out of scope). Context7 and Playwright MCP were **not** invoked; viem's `request` option `retryCount` and TanStack's `QueryCache.findAll` filters were used from the installed packages and verified only by running the tests and the browser runs, not by reading the official documentation. axe-core 4.14.0 (transient). Not used: `solidity-security`, Slither (no Solidity changed), the design skills (no redesign).

## 12. Manual steps still needed from the owner
1. Run the app against your own Anvil, stop Anvil with Ctrl+C, and confirm the red banner appears within about 10 s and the ticket is unavailable; restart Anvil (a fresh `anvil` is a different chain) and confirm the page verifies, shows the chain-changed notice and only then allows orders. If you restart with `anvil --state`, no notice is expected.
2. Check contrast of the cases in section 8 under "Not established" with DevTools, and decide on the dimmed placeholders.
3. A screen-reader pass (NVDA or VoiceOver) over the review boxes, the progress list and the outage alert.
4. Decide whether the review boxes should keep the shared name "Review before you sign" or get a specific accessible name.

## 13. Final review addendum (2026-11-06, before the commit decision)
**Question 1: does `unknown` allow transactions?** It did: `transactionsAllowed("unknown")` was true. Trace: at first load the cache is empty, so the ticket and create forms are gated only by `deployment.status.kind === "ok"` (contract code at five addresses plus the market's `baseToken()` and `quoteToken()` all read successfully on this load) and `!settling`. That is a real deployment check, so a normal first load is not unsafe. **But the identity anchor is set only after the first probe and a genesis read.** Reproduced on the scratch build (script `gap.mjs`, scratchpad): block only the genesis read (`eth_getBlockByNumber` with `0x0`) in the browser. Result: the monitor stayed `unknown` (8 probes succeeded, the genesis read failed every time, no anchor, no alert) while the ticket was fully usable ("Review order" enabled). Cached data cannot cause this on its own, because the query cache starts empty on every page load and the state never returns to `unknown` once left.
**Fix (smallest):** `transactionsAllowed` is now `online` only (so `unknown` shows "Verifying chain…" on the ticket and disables the create forms until the first probe and anchor succeed, typically a fraction of a second; data reads still run), and two failed anchoring attempts in a row move the state to `unverified` (alert "The node answers, but the chain could not be verified"), so the wait is not silent. Banner wording for an unverified first load no longer says nothing was read.
**Regression tests:** `rpc-health.test.ts` first-load test (genesis unreadable gives `unknown`, then `unverified` after two tries, never `online`, then `online` when it works), `transactionsAllowed("unknown")` false, and a banner test. Mutation check: allowing `unknown` again fails 2 tests. After the fix, the same browser reproduction shows `["Verifying chain…", disabled]` straight after connect and then the unverified alert with no ticket.
**Re-run after the change:** unit 410 passed; `tsc` and `eslint` clean; browser `e2e` 13, `e2e:create` 14, `e2e:dashboard` 14, `e2e:hardening` 9, `e2e:liveness` 11 (all mock wallet, scratch chain, rebuilt scratch app). Not re-run (unchanged code paths): real-chain suites, `forge test`, exporter.
**Question 2: duplicate loops, notices, races.** One provider (mounted once in `providers.tsx`), one `useChainWatch` caller (`chain-reset-notice.tsx`); idle traffic is exactly +12 requests per minute (55 to 67), which one 5 s loop explains and two loops would not; the effect cleanup stops the monitor and a stopped monitor's in-flight tick returns without acting. Reset notices: the liveness suite asserts exactly one notice after a recovered reset and none after one dismissal; the real fresh-chain run showed one. Residual races (not fixed, documented): after the node dies, transactions stay enabled until two probes fail (about 10 s); a chain replaced so fast that no probe fails is caught by the P2-7 watcher's 3 s poll, not by this monitor.
**Question 3: `web/package.json`.** The diff is one added line, `"e2e:liveness": "node e2e/liveness.e2e.mjs"` (and the comma on the line above). No dependency or lock-file change (`git status` shows no `package-lock.json` change).
**Question 4: global contrast changes.** `app/globals.css` changed two lines only: `--muted-foreground` and `--subtle`. The status tokens (`--buy`, `--sell`, `--warn`, `--destructive`) are untouched. No `disabled:` class uses either token; `--muted-foreground` also colours input placeholders (slightly lighter, intended) and `--subtle` the not-yet-reached progress steps (still clearly different from done steps, which also carry an icon and hidden text). The dimmed digit tail (`text-subtle/60`) becomes slightly lighter; not measured separately.
