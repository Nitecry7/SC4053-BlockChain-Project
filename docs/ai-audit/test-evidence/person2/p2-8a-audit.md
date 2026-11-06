# P2-8A: pre-integration audit evidence (Person 2)

Date: 2026-11-06. Branch `faheem` at `c23c6a3`. Model: Sonnet 5.5 (Medium). Environment: WSL2, forge, anvil and cast 1.9.0, Slither 0.11.6, Node 26.13, Playwright Chromium 1252, and axe-core 4.14.0 (temporary and pinned, loaded from a CDN into throwaway scratch pages; not added to `package.json`, the lockfile or the repository).

**Scope.** Audit and evidence only. No Solidity, `web/` source, test, frozen interface, `SPEC.md`, `ENGINE_PHASES.md` or Person 1 file was changed. Defects are reported with evidence and a proposed fix; none was fixed. The brief's required report is drafted in [`ai-audit-report-draft.md`](../../ai-audit-report-draft.md); the bonus checklist is in [`BONUS_INTEGRATION.md`](../../../BONUS_INTEGRATION.md).

## 1. Isolation and method

| Item | Before | After |
|---|---|---|
| Owner's Anvil, 127.0.0.1:8545 | pid 4845, block 13 | pid 4845, block 13. Only read-only `cast` and `scripts/check-local.sh` calls were made against it |
| Owner's `next dev`, port 3000 | pid 11481 | pid 11481, HTTP 200. The scratch build writes `.next/build`; the dev server uses `.next/dev` |
| Scratch Anvil, 8546 | not running | pid 401935 during the audit, stopped by pid |
| Scratch app server, 3100 | not running | pid 404034 during the audit, stopped by pid |

- The scratch chain was deployed with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected into the session scratchpad, so the exporter's record for the owner's chain was not touched (issue [P2-005](../../issues/p2-005-scratch-deploy-overwrote-exporter-record.md)). Afterwards `scripts/check-local.sh` reported `Result: ready. 0 warning(s).`
- The browser suites write screenshots into tracked evidence folders by default. They were run with `SCREENSHOT_DIR` pointed at the scratchpad, so no existing evidence was overwritten.
- Slither runs `forge clean`, which removes `contracts/out`. `forge build` was run afterwards to restore it, and the export check still passed.
- `web/next-env.d.ts` was changed by the scratch build (Next switched its generated type imports) and restored from HEAD. `git status` was clean at the end of the run, before these documents were written.
- **The official brief** (`docs/Development_Project.pdf`) could not be rendered by the PDF tool (no `pdftoppm`). Its text was extracted with the Python standard library (zlib on the content streams). Spacing was lost, but the section titles and requirements were readable and are quoted here.

## 2. Requirements coverage

Statuses: **Verified** (a test or recorded run I can point to), **Partially verified**, **Not implemented**, **Not manually tested**. A row can carry two. Documentation alone was never taken as evidence.

| ID | Requirement (official brief) | Implementation and tests | Evidence | Status | Remaining |
|---|---|---|---|---|---|
| M1 | Asset Issuer: issue new tokens adhering strictly to ERC20 (5.1) | `DemoToken.sol` (OpenZeppelin `ERC20`, fixed supply, no owner, no mint or burn), `TokenFactory.createToken`. `DemoToken.t.sol` (11, includes transfer, approve, transferFrom, revert paths, no mint or burn, no owner), `TokenFactory.t.sol` (20), `TokenOrderBookIntegration.t.sol` (4), `creation.integration.test.ts`, `e2e:create` | [p2-1](p2-1-issuance.md), [p2-6](p2-6-issuance-listing.md) | **Verified** (Foundry, real chain, mock wallet). **Not manually tested** step by step: the owner reported creating DTT. ERC20 conformance rests on OpenZeppelin plus these tests; no third-party ERC20 compliance suite was run | MetaMask Test 8, steps 8a to 8d, with hashes and screenshots |
| M2 | Front end supports token listing (5.1) | `MarketFactory.sol`; List market page. `MarketFactory.t.sol` (25), `MarketFactoryIntegration.t.sol` (14), `e2e:create` | [p2-2](p2-2-listing.md), [p2-6](p2-6-issuance-listing.md), [MARKET_FACTORY.md](../../../MARKET_FACTORY.md) | **Verified** (automated). The owner's chain has a second market with base DTT and quote SGDx (read-only, section 5.5) | Test 8 steps 8f to 8l. No Person 1 review of the factory is recorded |
| M3 | Submit buy and sell orders; limit orders as baseline | `OrderBook.sol:52-86` `placeLimitOrder`; `web/lib/order-*.ts`, `web/components/trade/`. `OrderBook.Place.t.sol` (22), `trading.integration.test.ts`, `e2e` | [p2-5](p2-5-trading.md) | **Verified** (automated). Owner performed the SPEC example with MetaMask (Tests 1 to 4) | Tests 5 and 6 on-screen steps; Test 7 negative cases |
| M4 | Automatic execution of matched buy and sell orders | `_matchTaker` (`:142-156`), `_settleFill` (`:160-187`). `OrderBook.Match.t.sol` (42, includes `test_match_specWorkedExample`), `MarketFactoryIntegration` trade tests | [p2-3](p2-3-deployment.md) item 6, [p2-5](p2-5-trading.md); a `Trade` log on the owner's chain (section 5.5) | **Verified** | A capped placement leaves a crossed remainder until `matchOrders` exists (SPEC section 8) |
| M5 | Partial order fulfilment | same functions. `test_match_makerPartlyFilled`, `test_match_takerPartlyFilledRestsRemainder`, `e2e` partial-fill step | owner's chain: order 1 filled 4 of 10, status PartiallyFilled (section 5.5) | **Verified**. Manual: owner-reported | Test 5 and 6 screenshots |
| M6 | User self-custody; non-custodial exchange | No admin, owner or pause in `OrderBook` or the factories; escrow leaves only to the counterparty or the order's own trader (SPEC section 1); signing only in the wallet (`web/` holds no key). `assertSolvent` after tests; two solvency fuzz tests; `test_market_factoryIsNeverTraderOrHolder` | [p2-2](p2-2-listing.md), [p2-4](p2-4-frontend.md) | **Verified** by design review and tests. **Not a formal proof**: the stateful invariant suite does not exist (section 5.3) | Person 1 Phase 7 |
| M7 | Simple front-end web app: listing, order submission, execution, custody (5.1) | `web/` | `e2e` 13, `e2e:create` 14, `e2e:dashboard` 13, `e2e:hardening` 9 (section 5.1), accessibility measured (section 4) | **Partially verified.** Flows verified with a mock wallet and, for the SPEC example, by the owner with MetaMask. Two confirmed accessibility violation types; colour contrast not determined | Owner decision on accessibility fixes; screenshot walkthrough |
| B1 | Bonus 1: cancel remaining unfulfilled amounts | `cancelOrder` is a bare `revert()` (`OrderBook.sol:88-90`). Designed in SPEC section 5. The UI has no control for it | `OrderBook.sol`; the local `origin/engine/phase-4` ref has the same stub | **Not implemented** | Person 1 Phase 4 |
| B2 | Bonus 2: batched multi-party matching | `matchOrders` is a stub (`:92-94`). SPEC open item O3: confirm the interpretation with the TA | same | **Not implemented** | Person 1 Phase 5; TA confirmation |
| B3 | Bonus 3: conditional orders | `placeStopLimitOrder` (`:96-98`) and `triggerStopOrders` (`:100-102`) are stubs | same | **Not implemented** | Person 1 Phases 6a and 6b |
| T1 | Tricky point: who and how often triggers execution | SPEC section 6. Matching runs inside the taker's `placeLimitOrder`; the taker pays gas; at most `MAX_MATCHES_PER_TX` (10) fills. `test_match_capLeavesRemainderRestingCrossed`; issue [P2-002](../../issues/p2-002-fill-cap-hides-crossed-remainder.md) | [p2-5](p2-5-trading.md) | **Partially verified.** The placement path is verified; the explicit `matchOrders` and `triggerStopOrders` paths do not exist yet | Person 1 Phases 5 and 6 |
| T2 | Tricky point: priority of older orders at identical conditions | `_ranksAhead` (`:238-244`), internal `bookSeq`. `test_fifo_askMakersFillInEntryOrder`, `test_fifo_bidMakersFillInEntryOrder`, `MarketFactoryIntegration.test_trade_fifoAtEqualPrice`. The SPEC section 8 limitation (priority does not hold across a crossed book) is pinned by `test_match_crossedBookNewTakerFillsOppositeHeadAheadOfOlderOrder` | Foundry suite | **Verified**, with the documented limitation | none |
| D1 | AI Audit Report, eight required sections | [`ai-audit-report-draft.md`](../../ai-audit-report-draft.md) | draft | **Partially drafted** | owner and Person 1 evidence (section 6) |
| D2 | Major-issue breakdown in four parts | Issues `p2-001` to `p2-012` use the four parts. Person 1's `001` to `004` exist | `docs/ai-audit/issues/` | **Partially verified.** The two Medium P2-3 findings have no issue file (finding I-5) | create the entries (owner approval) |
| D3 | Validation evidence: tests and static analysis | `forge test` 185; Slither on Person 2 files; `forge lint` | section 5 | **Partially verified.** No Slither on `OrderBook.sol` by Person 2; no invariant suite | Person 1 Phases 7 and 8 |
| D4 | Manual tests and a screenshot walkthrough | [TESTING.md](../../../TESTING.md) Sections C, D, F | Section F | **Not manually tested**: Tests 5 and 6 not separately reported, Tests 7, 9, 10 not performed, Test 8 partial | owner |
| D5 | Peer evaluation (mandatory, brief section 7) | not in the repository | none | **Not verified** (team process) | owner and team |
| D6 | Final demonstration with the bonus functions | not possible yet | | **Not implemented** | Person 1 |

## 3. Architecture and integration

### 3.1 MarketFactory with the current OrderBook

| Check | Evidence | Result |
|---|---|---|
| A factory-created market has identical runtime bytecode to a direct deployment | `MarketFactoryIntegration.test_market_runtimeBytecodeIdenticalToADirectDeployment` | pass (`forge test`: 185 passed, 0 failed) |
| Same constants and immutables; same state after a replayed trade sequence | `test_market_constantsAndImmutablesMatchADirectDeployment`, `test_market_tradeSequenceMatchesADirectDeployment` | pass |
| Every write function, including the four bonus stubs, behaves like a direct deployment | `test_market_everyWriteBehavesLikeADirectDeployment` | pass. It stays valid when the bonuses are implemented |
| The factory is never a trader or token holder | `test_market_factoryIsNeverTraderOrHolder` | pass |
| Compiled sizes at HEAD | `forge build --root . --sizes` | `MarketFactory` 8,358 B runtime and 8,387 B initcode; `OrderBook` 6,325 B and 6,974 B; limits 24,576 B and 49,152 B. Identical to the values recorded in P2-3 |
| Deployment on a fresh scratch chain | `Deploy.s.sol` on 8546 | same deterministic addresses as the exported deployment; the generated files did not change |

### 3.2 Behaviours requested for the audit

| Behaviour | Automated evidence | Manual status |
|---|---|---|
| Approvals (exact amount, not unlimited) | `order-plan` tests; `e2e` "Alice sells 10 NTU @ 2: exact approval" | Owner performed it (Tests 2 and 4); wallet text not recorded |
| Escrow | `OrderBook.Place.t.sol`; `assertSolvent`; real-chain suites | Owner chain: order 1 sell of 10 with 6 still resting (5.5) |
| Execution, partial fills, refunds | SPEC example in unit, `TokenOrderBookIntegration`, `Deploy.t.sol`, `e2e`, real chain; refund 0.8 SGDx | Owner performed the SPEC example; the DTT trade is reported and the chain agrees (5.5) |
| Token decimals | constructor guard `UnsupportedDecimals`; `creation.integration.test.ts` refuses a 6-decimal-style token and a non-token address | not tested manually |
| Multiple markets | `test_trade_marketsAreIndependent`; `e2e:dashboard` trades on DTT/SGDx; hardening real-chain test checks `allowance(DTT, NTU book) == 0` | Owner has two markets on the chain; Test 9 not performed |
| Account switching | `e2e` (fix for issue [P2-003](../../issues/p2-003-review-step-survived-account-switch.md)); `e2e:dashboard` | Test 3 reported by the owner; negative cases not performed |
| Transaction replacement | hardening unit, real-chain and browser tests ([p2-7](p2-7-hardening.md), issue P2-012) | **Not tested with MetaMask** (Test 10) |
| Chain-reset recovery | `chain-reset.test.ts`, hardening browser test | **Not tested with MetaMask** (Test 10) |

### 3.3 Findings (reported, not fixed)

| ID | Severity | Finding | Evidence | Proposed action |
|---|---|---|---|---|
| I-1 | Medium (process) | `SPEC.md` and `CLAUDE.md` call the brief `docs/project.pdf` and say it is intentionally untracked, so course material is not published. The repository tracks it as `docs/Development_Project.pdf` since commit `9d147d4` | `git log`; `SPEC.md` lines 3 to 8 | Owner decides whether the PDF stays tracked. If it does, Person 1 and the owner should update the SPEC and CLAUDE wording. Not edited here (protected files) |
| I-2 | Medium (schedule) | Person 1's log ends on 2026-11-02 (Phase 3b; the Phase 4 prompt only drafted). The local `origin/engine/phase-4` ref is a merge of 3b and has the same stubs. Phases 4 to 8 are outstanding. The team plan names 8 November; the brief states no date | `prompt-log.md`; `git log origin/engine/phase-4`; `docs/DEX_Trading_Engine_Plan.md` header | Confirm Person 1's real status and the deadline. The remote refs here may be stale (not fetched) |
| I-3 | Info | Slither on `Deploy.s.sol` now reports 11 results: the 6 `calls-loop` notes recorded in P2-3 plus the 5 `IOrderBook` naming notes also recorded for `MarketFactory`. The P2-3 record lists only the 6 | section 5.2 | None needed; the cause (different options or the compile unit) is not recorded |
| I-4 | Info | `forge lint` (not used in earlier phases) reports 7 warnings, 4 of them in Person 1's `OrderBook.sol` | section 5.2 | Person 1 to triage in Phase 8 |
| I-5 | Medium (evidence) | The two Medium defects found by the P2-3 reviewer (chain-id guard bypass, partial broadcast exported as complete) are recorded in the prompt log and `p2-3-deployment.md` but have no `docs/ai-audit/issues/` entry, which `CLAUDE.md` asks for. They are the highest-severity findings in Person 2's work | `docs/ai-audit/issues/` listing | Write the entries (the draft report already has their four-part analysis, section 5) |

## 4. React, Next.js and accessibility review

Method: the `react-best-practices` skill was invoked (discoverable at `~/.claude/skills/react-best-practices`). Its rules are mostly server-component and bundle oriented, so the bundle, re-render and client-data-fetching categories were applied to this client-side wallet app. Measurements used the production build on the scratch server (3100) and chain (8546) with Playwright Chromium and the mock wallet. Headless local numbers show counts and sizes, not user-perceived speed.

### 4.1 Findings

| ID | Severity | Finding | Evidence | Recommendation (effort) |
|---|---|---|---|---|
| R1 | Medium | Every new block invalidates every query except `blockNumber`, so immutable data is re-read each block. About 61% of the block-driven calls on the overview (35 of 57) and 63% on Trade (22 of 35) are token name, symbol, decimals and total supply, the OrderBook constants, `isFactoryToken`, `baseToken`, `quoteToken` and the five `eth_getCode` checks | `web/hooks/use-dex-data.ts:26`; measured per-call breakdown in 4.3 | Exclude immutable query keys from the invalidation predicate or give them `staleTime: Infinity` (S) |
| R2 | Medium | No JSON-RPC batching: each read is its own HTTP request (HTTP requests equal calls in every measurement). A cold load makes 29 to 52 requests; one mined block makes 65 on the overview and 43 on Trade. Anvil has no Multicall3, so wagmi cannot batch contract reads either | `web/lib/wagmi.ts:23` (`http(RPC_URL)`); `web/lib/chains.ts:7`; section 4.3 | Try `http(RPC_URL, { batch: true })` and re-measure (S) |
| R3 | Low | Idle polling: a connected page makes about 56 RPC calls per minute with nothing happening (`eth_getBlockByNumber` 10 and `eth_blockNumber` 4 per 15 s) | `web/hooks/use-chain-watch.ts` (two reads every 3 s); section 4.3 | Read the anchor block only when the head moved (S) |
| R4 | Low | Each block triggers one `eth_getLogs` from the deploy block (`fromBlock=0x1`), re-scanning all history. Already a documented limit | `use-dex-data.ts:193-197, 313-315`; [FRONTEND.md](../../../FRONTEND.md) known limits | Incremental cursor before any long-lived chain (M) |
| R5 | Low (Medium on a slow network) | First-load JavaScript is 304 to 448 KB gzip (1.0 to 1.4 MB raw) per route, with no `dynamic()` or `lazy()` anywhere; after idle prefetch every route has loaded 523 KB gzip in 26 files. The largest chunk is 396 KB raw (135 KB gzip). Attribution to libraries was not done (no bundle analyzer was run) | section 4.2; `grep` for `dynamic(` finds none | Run a bundle analyzer, then consider `dynamic()` for the connect modal and rarely used routes (M) |
| R6 | Medium | **Accessibility.** `aria-label` on a plain `<span>` is a prohibited ARIA use (axe `aria-prohibited-attr`, serious). `Amount` puts the exact value in `aria-label` while the visible digits are `aria-hidden`. If a screen reader ignores the label, the amount may be announced as nothing. PRODUCT.md says exact amounts are available to assistive technology | `web/components/data/amount.tsx:27`; `address-chip.tsx:25`; axe on 12 of the 18 page views; section 4.4 | Replace with visually hidden text carrying the full value (S). **Real screen-reader behaviour is unverified**; escalate to High if NVDA or VoiceOver stay silent |
| R7 | Low to Medium | **Accessibility.** WCAG 2.5.3 Label in Name (axe `label-content-name-mismatch`, serious): the connected wallet button's accessible name is `Wallet 0x…, open account menu` while the visible text is the shortened address, and the "Copy wallet address" button's name does not contain its visible text | `web/components/wallet/connect-control.tsx:49`; `web/components/dashboard/wallet-panels.tsx:139`; 6 page views | Start the `aria-label` with the visible text, or drop it (S) |
| R8 | Not determined | **Contrast.** axe marked 22 to 141 nodes per page "needs review" for colour contrast, because it cannot resolve translucent glass over gradients. No contrast result exists | section 4.4 | Measure the key text and background pairs by hand (M). Do not claim contrast compliance |
| R9 | Info | Structure: 44 `"use client"` files; no `React.memo`, 12 `useMemo`, 6 `useCallback`; no profiler run, so no measured re-render problem. Reads form a dependent chain (code check, then registry count, lists and pair details), which costs one network round trip per step on a remote RPC | greps; `use-dex-data.ts` `enabled:` chain | No change without a profile (none) |
| R10 | Info (positive) | Present and verified in source: skip link (`app-shell.tsx:105`), `:focus-visible` (`globals.css:148`), `prefers-reduced-motion` (`globals.css:202`), `lang="en"`, `next/font`, no `<img>`; keyboard operation covered by `e2e:dashboard`. `impeccable detect` over `web/components` and `web/app`: 0 findings (regex rules only; understates) | files and lines as cited | none |

### 4.2 JavaScript and RPC per route (cold load, disconnected)

| Route | JS at load (files, raw, gzip) | JS after idle prefetch (raw, gzip) | RPC requests at load |
|---|---|---|---|
| `/` | 17 files, 1,441 KB, 448 KB | 1,679 KB, 523 KB | 52 |
| `/markets` | 15, 1,368 KB, 425 KB | same | 50 |
| `/tokens` | 15, 1,367 KB, 425 KB | same | 39 |
| `/trade` | 15, 1,034 KB, 309 KB | same | 39 |
| `/create-token` | 16, 1,406 KB, 438 KB | same | 29 |
| `/list-market` | 14, 1,016 KB, 304 KB | same | 29 |

### 4.3 RPC cost of one mined block, connected as Alice (three repeats, identical)

| Route | Block-driven calls | Breakdown |
|---|---|---|
| `/` | 57 (65 requests with background polling) | `eth_call` 50, `eth_getCode` 5, `eth_getLogs` 1, `eth_getBalance` 1. Immutable reads: `Token.name`, `symbol`, `decimals` (12), `isFactoryToken` (4), OrderBook constants (10), `baseToken`, `quoteToken` (2), `Token.totalSupply` (2), `eth_getCode` (5) = 35 |
| `/trade` | 35 (43 with background polling) | `eth_call` 28, `eth_getCode` 5, `eth_getLogs` 1, `eth_getBalance` 1. Immutable: 22 |

Idle, connected, 15 s: 14 calls on each of `/` and `/trade` (about 56 per minute).

### 4.4 axe-core 4.14.0 (7 routes; desktop 1586 px and mobile 375 px; disconnected, and connected on `/` and `/trade`)

- **Violations (distinct):** `aria-prohibited-attr` (serious) on 12 page views, and `label-content-name-mismatch` (serious) on 6. No critical violation. `/create-token`, `/list-market` and `/tx/<hash>` had 0 violations.
- **Needs review:** `color-contrast` on 22 to 141 nodes per page, `aria-prohibited-attr` on 1 to 3 nodes, and `link-in-text-block` on 1 node of the transaction page. axe could not decide these.
- **Limits:** axe finds roughly the machine-checkable subset of WCAG. It cannot judge reading order, announced text or contrast over gradients. No screen reader was run.

## 5. Security and test baseline

### 5.1 Baseline (all outside 8545 and 3000)

| Check | Command (directory) | Result | Recorded before |
|---|---|---|---|
| Contract tests | `forge test` (`contracts/`) | 185 passed, 0 failed, 12 suites | 185 |
| Exporter | `node --test contracts/script/export-web.test.mjs` (repo root) | 21 passed | 21 |
| Unit tests | `npm test` (`web/`) | 368 passed, 48 gated skipped (27 files passed, 3 skipped) | 368 / 48 |
| Types and lint | `npm run typecheck`, `npm run lint` (`web/`) | both clean | clean |
| Production build | `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build` (`web/`) | succeeded, 8 routes (7 static, `/tx/[hash]` dynamic) | succeeded |
| Real chain (scratch 8546) | `E2E_RPC_URL=… E2E_ALLOW_MUTATE=1 npx vitest run --no-file-parallelism lib/trading.integration.test.ts lib/creation.integration.test.ts lib/hardening.integration.test.ts` | 48 passed | 48 |
| Browser, mock wallet (scratch 3100) | `npm run e2e`, `e2e:create`, `e2e:dashboard`, `e2e:hardening` | 13, 14, 13 and 9 passed, 0 failed | 13 / 14 / 13 / 9 |

Every number matches the earlier record. The browser and real-chain rows are **mock-wallet and scratch-chain results, not MetaMask**.

### 5.2 Static analysis

**Slither 0.11.6 at HEAD `c23c6a3`** (the command from the P2-1 to P2-3 evidence, with a `forge-std` remap added for all four targets):

| Target | Result now | Recorded earlier |
|---|---|---|
| `src/DemoToken.sol` | 0 results | 0 ([p2-1](p2-1-issuance.md)) |
| `src/TokenFactory.sol` | 0 results | 0 |
| `src/MarketFactory.sol` | 5 `naming-convention` notes on `IOrderBook.PRICE_SCALE`, `LOT_SIZE`, `TICK_SIZE`, `MAX_MATCHES_PER_TX`, `MAX_INSERT_SCAN` | same 5 ([p2-2](p2-2-listing.md)), accepted: Person 1's frozen getter names |
| `script/Deploy.s.sol` | 11 results: 6 `calls-loop` (`Deploy.s.sol:95, 96, 144`, demo-wallet loops in a local script) plus the same 5 `IOrderBook` naming notes | 6 `calls-loop` ([p2-3](p2-3-deployment.md)); finding I-3 |

Slither was **not** run on `OrderBook.sol`: that analysis belongs to Person 1's Phase 8 and is not claimed here. The `IOrderBook` notes above appear only because `MarketFactory` and the script import it.

**`forge lint` (Foundry 1.9.0, first used in P2-8A): 7 warnings.**

| Rule | Location | Owner |
|---|---|---|
| `reentrancy-events` | `src/TokenFactory.sol:38`, `src/MarketFactory.sol:37` (event after `new`) | Person 2: `DemoToken`'s constructor makes no external call, and `MarketFactory` relies on the static-call argument pinned by `test_createMarket_tokenCannotReenterFromDecimals` (P2-2). Informational |
| `reentrancy-events` | `src/OrderBook.sol:82`, `:182` | Person 1. Related to SPEC section 5's documented escrow-before-matching and payouts-during-matching deviations, protected by `nonReentrant`. Not triaged here |
| `require-revert-in-loop` | `src/OrderBook.sol:202` (`BookTooDeep`), `:225` | Person 1. `:202` is the deliberate gas bound (SPEC section 2) |
| `unsafe-typecast` | `src/OrderBook.sol:70` (`uint64(block.timestamp)`) | Person 1 |

**Solidity Security skill:** invoked once (a generic checklist, as in P2-3). Applied to the bonus review points in [`BONUS_INTEGRATION.md`](../../../BONUS_INTEGRATION.md): reentrancy and checks-effects-interactions on cancel refunds, owner-only access, bounded loops, input validation, and front-running of stop triggers. Not applicable and rejected for this design: pull payments, a circuit breaker, upgradeability (the engine is non-custodial by design, with no admin; SPEC section 8 lists push payouts as a known limitation). The skill produced no finding of its own.

### 5.3 Fuzz tests versus the planned invariant suite

| Kind | Tests | Settings |
|---|---|---|
| **Existing fuzz** (stateless: each test body is one call or one in-test loop) | `DemoToken.t.sol:testFuzz_supplyIsFixedAcrossTransfers`; `TokenFactory.t.sol:testFuzz_createToken_supplyInBounds`, `testFuzz_createToken_supplyAboveMaxReverts`, `testFuzz_getTokens_matchesRegistry`; `MarketFactory.t.sol:testFuzz_getMarkets_matchesRegistry`; `OrderBook.Place.t.sol:testFuzz_requiredQuote_exactForAlignedInputs`; `OrderBook.Match.t.sol:testFuzz_randomPlacementsKeepSolvencyAndBookOrder`, `testFuzz_coarsePlacementsKeepSolvencyAndBookOrder` | `[fuzz] runs = 1000`; `[profile.deep.fuzz] runs = 10000` (the deep profile is not recorded as run) |
| **Closest to an invariant** | the two `OrderBook.Match` tests run a seeded 30-step sequence of placements across three traders and assert solvency and book order after every step (`_assertChecks`) | placements only: no cancel, batch or stop paths, no handler, no ghost state, no Foundry `invariant_` runs |
| **Stateful invariant suite** (Engine Phase 7: `test/invariant/{Handler.sol, OrderBookInvariant.t.sol}`) | **does not exist**: `contracts/test/invariant/` is absent | `[invariant] runs = 256, depth = 64` is configured with nothing to run |

### 5.4 Existing security findings

Summarised, not repeated: [`tooling-and-methodology.md`](../../tooling-and-methodology.md) lists the Slither triage and every independent-review finding by phase, and the issue files hold the four-part analysis. This audit adds the Slither re-run at HEAD, `forge lint`, the accessibility findings R6 and R7, and findings I-1 to I-5.

### 5.5 The owner's manual MetaMask records, and read-only chain observations

**Owner-reported manual actions** ([TESTING.md](../../../TESTING.md) Section F): Tests 1 to 4 (connect, Alice sells 10 NTU at 2, switch to Bob, Bob buys 4 NTU at 2.2) reported as performed; Tests 5 and 6 not separately reported; Test 8 partly (DTT created and DTT/SGDx listed, steps not confirmed one by one); Tests 7, 9 and 10 not performed. The DTT trade is reported as a partial fill at the maker's price.

**Read-only observations of the owner's chain (8545, 2026-11-06, by `cast`; nothing was sent):**

| Item | Value read |
|---|---|
| Registered markets / tokens | 2 / 3 |
| Second market | base DTT (`0xeEBe…8883`), quote SGDx (`0xB7A5…d968`), at `0x9f1a…3a8e` |
| Order 1 | trader `0x7099…79C8` (Anvil account 1), side Sell, price 2e18, amount 10e18, filled 4e18, locked quote 0, status 1 (PartiallyFilled) |
| Order 2 | trader `0xf39F…2266` (Anvil account 0), side Buy, price 2.2e18, amount 4e18, filled 4e18, locked quote 0, status 2 (Filled) |
| `Trade` log (block 13, transaction `0x4110c488…c1d2`) | maker order 1, taker order 2, price 2e18, base 4e18, quote 8e18 |
| Best ask / best bid / last trade price | order 1 at 2e18 / none / 2e18 |

These values match the reported DTT trade (the SPEC worked example on DTT/SGDx: 4 units filled at the maker's price 2, 8 SGDx paid, 6 units resting). They are chain observations. The steps the owner took in MetaMask, and any approval prompts, are not recorded anywhere, and no screenshot exists.

## 6. Evidence still required

**From the owner (Person 2):**
- MetaMask manual tests: Test 5 and 6 on-screen steps; Test 7 negative and recovery cases (7a to 7h); Test 8 steps 8a to 8l, with hashes and screenshots; Test 9 (selector, holdings); Test 10 (speed up, cancel, restart).
- The screenshot walkthrough listed in TESTING.md Section D (none is in the repository).
- A screen-reader check (NVDA or VoiceOver) of amounts and the two flagged buttons, and a hand measurement of the key text contrast pairs.
- Decisions: the tracked brief PDF (I-1); whether to write the missing issue entries (I-5); whether to apply the accessibility and performance recommendations.
- What existed before AI tools were used (report Section 1), the team's lessons learned (Section 8), and the peer evaluation (brief section 7).

**From Person 1 (engine, not done or not recorded):**
- `cancelOrder` (Phase 4), `matchOrders` (Phase 5), `placeStopLimitOrder` and `triggerStopOrders` (Phases 6a and 6b), with tests, and the TA decision on the Bonus 2 interpretation (O3).
- The stateful invariant suite and fuzz hardening (Phase 7); Slither and `forge lint` triage of `OrderBook.sol`, with the solidity-security review (Phase 8).
- Prompt-log entries after 2026-11-02, issue entries for any bugs found, and independent-review evidence for Phases 4 to 8; the model used per phase.
- After the bonuses land: the pre-integration checklist in `BONUS_INTEGRATION.md`.

## 7. Update (P2-8A.1, 2026-11-06)
This file records the P2-8A audit as it stood and is not rewritten. Later status, with evidence, is in [`p2-8a1-fixes.md`](p2-8a1-fixes.md): R6 and R7 fixed (axe violations on the 18 views: 12 and 6 before, 0 after); R1 and R2 fixed and measured (overview per block 65 to 45 operations and 9 HTTP requests with batching); R3 to R5 unchanged; R8 partly measured by sampling rendered pixels; I-5 done ([p2-013](../../issues/p2-013-chain-id-guard-bypassed-by-forge-chain-override.md), [p2-014](../../issues/p2-014-exporter-accepted-a-partial-broadcast.md)); I-1 recorded with proposed wording. New findings: R6b (four role-less labelled containers) and R9 (the page keeps showing stale data as live after the RPC dies). The baseline in section 5.1 is now unit 383, browser 13 / 14 / 14 / 9; the other rows are unchanged.
