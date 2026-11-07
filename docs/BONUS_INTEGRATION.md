# Bonus-feature integration readiness (Person 2)

Status: **Bonus 1 (cancel) is integrated; Bonus 2 (batch matching) and Bonus 3 (stop-limit) are not.** Update, 2026-11-08 (P2-8B.2): the shared engine now implements all four functions (Person 1; `ENGINE_HANDOFF.md`), and the web app has a Cancel action in My orders, verified with a **mock wallet** on a scratch chain; **MetaMask was not tested** (procedure: `TESTING.md`, Test 12). There is still no control for batch matching or stop-limit orders. The rest of this file is the original planning text (written while the functions were stubs) and is kept as the record of the plan; it changes no contract, ABI or interface.

## What the deployed engine does today

Verified by reading `contracts/src/OrderBook.sol` on branch `faheem` (P2-7 session): `placeLimitOrder` and `getOrder`/`getBook`/`getUserOrderIds` work. `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` are bodies that only `revert()`. `docs/ENGINE_PHASES.md` assigns them to Person 1: Phase 4 (cancel), Phase 5 (batch matching), Phase 6 (stop-limit). The front end must therefore keep showing no cancel, batch or stop control. The My orders table already says "Cancelling orders is not available in the deployed engine yet."

> **Update, 2026-11-08.** The paragraph above describes the engine as it was when it was written (P2-7). The engine has since implemented `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` (`ENGINE_HANDOFF.md`), the compiled ABI and `CONTRACT_INTERFACE.md` agree, and the committed `web/lib/contracts/abis.ts` is byte-identical to a fresh export (P2-8B.1). Only cancel is wired into the UI so far.

## Activation rule

A bonus control is enabled only when **both** hold:

1. the function is verified by a **real call on a scratch chain** (a green Foundry test for it is not enough; it must succeed through the front end's own simulate, send, receipt path), and
2. the compiled ABI exported to `web/lib/contracts/abis.ts` and `CONTRACT_INTERFACE.md` agree on its signature, events, errors and any new `Status` value.

Until then the control is **absent**, not disabled-looking-functional.

## Per bonus

### Phase 4: cancel (`cancelOrder(orderId)`)
| Need from Person 1 | Front-end work after verified delivery | Tests |
|---|---|---|
| `cancelOrder` live; `OrderCancelled(orderId, trader, refundBase, refundQuote)`; a cancelled `Status` value in the compiled ABI; owner-only (`NotOrderOwner`), active-only (`OrderNotActive`) | "Cancel" per row of My orders, shown only for the user's own open or partly filled orders. Plan: simulate, one wallet request, decode `OrderCancelled`, compare the refund with `getOrder` (`amount - filled`, or `lockedQuote` for a buy) and with the balance change, show the exact refund. Name both errors in plain words. Reuse `useTxFlow` and `waitBounded` (replacement, reset and stale handling come for free). | runner unit tests with fakes; real-chain: cancel open, partial, filled (reverts), twice (reverts), non-owner (reverts); browser: cancel, refund, balances, account switch mid-flight |

**Integrated in P2-8B.2 (2026-11-08).** Cancel is offered in My orders on the connected account's own Open, PartiallyFilled and PendingTrigger orders. It states the refund first (sell: `amount - filled` base; buy: `lockedQuote` quote), simulates, asks the wallet once (no approval), follows speed-ups, replacements and chain resets through `waitBounded`, and reports success only from the confirmed receipt: an `OrderCancelled` for that order, market and trader, `getOrder` reading Cancelled at the receipt block, the refund matching both the order in the block before and the tokens' own `Transfer` events. `NotOrderOwner` and `OrderNotActive` have plain-language text. Activation rule: satisfied through the front end's own simulate, send and receipt path on a scratch chain (`cancel.integration.test.ts`, `e2e/cancel.e2e.mjs`). Evidence and limits: [`p2-8b2-cancellation.md`](ai-audit/test-evidence/person2/p2-8b2-cancellation.md). Not verified: MetaMask.

### Phase 5: batch matching (`matchOrders(maxMatches)`)
| Need | Front-end work | Tests |
|---|---|---|
| `matchOrders` live; `InvalidMaxCount`; a decision on the semantics (`ENGINE_PHASES.md` lists the Bonus 2 interpretation as a question for the TA) | A "Clear crossed book" action shown **only** when `getBestBid >= getBestAsk` (a crossed book is already detectable; P2-002 documents how the 10-fill cap can leave one). Decode `Trade` events and show actual amounts. Never shown on an uncrossed book. | real-chain: build a crossed book via the cap, clear it, assert escrow and balances; assert no control on an uncrossed book |

### Phase 6: stop-limit (`placeStopLimitOrder`, `triggerStopOrders`)
| Need | Front-end work | Tests |
|---|---|---|
| Both functions live; `StopOrderPlaced`, `StopOrderTriggered`; a pending status in the compiled ABI; `getBook` excludes pending stops (already stated in `CONTRACT_INTERFACE.md`) | A separate "Pending stop orders" list. **A pending stop is never part of the live book, depth, or "resting" liquidity.** A stop ticket with trigger and limit prices (both tick-aligned), escrow shown. A trigger action only where `triggerStopOrders` is verified. | real-chain: place, not in `getBook`, trigger, becomes an ordinary order; browser: never drawn in depth |

## Rebuild and redeploy plan (when Person 1 merges a bonus)

1. Update the branch with their work; `cd contracts && forge build && forge test`.
2. Regenerate the web ABIs with the existing exporter (`contracts/script/export-web.mjs`), then review the diff: only the intended signatures and events should change.
3. Deploy to a **scratch** chain first: `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected (see `FRONTEND.md`, "Scratch deployments"), so the exporter record for your own chain is not overwritten (issue p2-005).
4. Run the real-chain suites, then the browser suites, against the scratch chain.
5. Only then **ask the project owner** before redeploying on the main Anvil (8545). Redeploying replaces the contracts, so existing balances, orders and the recorded deployment evidence on that chain are lost. Archive the current evidence by date first; do not overwrite it.

> **P2-8B.2 update (2026-11-08):** the cancel parts of section B (steps 1 to 5 as they apply to cancel, and the cancel row of section C) were carried out; the boxes below are left as written on 2026-11-06 and were not ticked retroactively. Which of them were done, with evidence, is in [`p2-8b2-cancellation.md`](ai-audit/test-evidence/person2/p2-8b2-cancellation.md). Batch and stop-limit items are untouched.

## Pre-integration checklist (written in P2-8A, 2026-11-06)

**Every box below is unchecked: none of these checks has been performed, because none of the bonus functions is implemented.** Baseline recorded at commit `c23c6a3`: `forge test` 185 passed; `MarketFactory` 8,358 B runtime and 8,387 B initcode; `OrderBook` 6,325 B and 6,974 B; `contracts/test/invariant/` does not exist. See [`p2-8a-audit.md`](ai-audit/test-evidence/person2/p2-8a-audit.md).

### A. Gate: what Person 1 must hand over first
- [ ] The function is implemented with Foundry tests, using only the frozen signatures, events, errors and `Status` order in `CONTRACT_INTERFACE.md`. A needed interface change is agreed by both people first, not made in code.
- [ ] **Cancel (Phase 4).** Owner-only (`NotOrderOwner`) and active-only (`OrderNotActive`). Checks-effects-interactions order: unlink, set `Cancelled`, zero `lockedQuote`, then refund. Refund is `amount - filled` base for a sell and `lockedQuote` quote for a buy (SPEC A7). Tests: open, partly filled, already filled, twice, non-owner, a token that re-enters during the refund, and solvency after a cancel.
- [ ] **Batch (Phase 5).** `matchOrders` rejects 0 and anything above `MAX_MATCHES_PER_TX` with `InvalidMaxCount`; returns 0 without reverting on an uncrossed book; the maker is the head with the lower `bookSeq`; a gas figure is recorded like O2; the TA has confirmed what "multi-party" means (SPEC O3).
- [ ] **Stop-limit (Phases 6a and 6b).** Escrow is pulled at placement; `PendingTrigger` orders never appear in `getBook`; one shared fill budget across a trigger call; solvency includes pending stops; `StopOrderPlaced` and `StopOrderTriggered` match the interface, with no `OrderPlaced` on activation. The SPEC limit on `lastTradePrice` manipulation stays documented.
- [ ] Slither on the new `OrderBook.sol`, with each result triaged; the stateful invariant suite (Phase 7) and fuzz tests green, including a deep-profile run; a targeted independent review of the changed functions, with findings logged. (The Solidity Security checklist items that apply: reentrancy, access control, bounded loops, input validation, front-running. Not applicable to this non-custodial design: pull payments, a circuit breaker, upgradeability.)
- [ ] `forge test` green on the merged branch, including `MarketFactoryIntegration.t.sol` (its differential test already calls all four functions), and `cd contracts && forge build --root . --sizes` shows the factory still well below 24,576 B runtime and 49,152 B initcode.

### B. Person 2 steps after the gate
1. [ ] Pull, `forge build`, `forge test`.
2. [ ] Regenerate the web ABIs with `contracts/script/export-web.mjs` and review the `abis.ts` diff. Expected: named parameters appear on the four functions (same types), nothing else.
3. [ ] Deploy to a **scratch** chain with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected, and run the real-chain suites first.
4. [ ] Front-end changes, only for a bonus that passes the activation rule above:
   - **Cancel:** replace the "Cancelling orders is not available" notes (`web/components/trade/my-orders.tsx:17`, `:114`) with a per-row Cancel for the user's own open or partly filled orders; add a runner beside `runOrder` in `web/lib/order-runner.ts` that reuses `waitBounded` and `useTxFlow`; decode `OrderCancelled` in `web/lib/receipt.ts`; check the refund against `getOrder` and the balance change; name `NotOrderOwner` and `OrderNotActive` in `web/lib/errors.ts`. `ORDER_STATUS_NAMES` in `web/lib/order-status.ts` already includes `Cancelled` and `PendingTrigger`.
   - **Batch:** replace the "`matchOrders` is not available yet" text (`web/components/trade/order-result.tsx:125`) and the stub note in `web/lib/order-plan.ts:39`; show "Clear crossed book" only when `getBestBid` price is at least `getBestAsk` price; never on an uncrossed book.
   - **Stop-limit:** a pending-stops list apart from the book and depth (both use `getBook`, which excludes pending stops); a stop ticket with trigger and limit prices; a trigger action; decode both stop events. Update the "Planned features" list (`web/components/dashboard/side-panels.tsx`) and the "not available yet" navigation entries (`web/components/shell/app-shell.tsx:181`) only for features that now work.
5. [ ] Tests: runner unit tests with fakes; real-chain tests (cancel open, partial, filled, twice, non-owner; clear a crossed book; place, trigger and exclude stops); mock-wallet browser tests; new MetaMask procedures in `docs/TESTING.md`, marked "procedure only" until the owner performs them.
6. [ ] Update README (the feature table), `PRODUCT.md`, `docs/FRONTEND.md`, the traceability table and the prompt log in the same change.
7. [ ] **Redeploy decision (ask the owner first).** The factory's bytecode changes when `OrderBook` changes, so `export-web.mjs --check` will refuse the owner's current chain until it is redeployed. Either (a) start a fresh Anvil, which loses all chain state but keeps the deterministic addresses and the tracked files, or (b) redeploy on the same chain, which gives new addresses and changes `web/lib/contracts/deployments.ts`, and does not migrate old markets or orders. Archive the current evidence by date before either.

### C. Evidence to record when each bonus lands
- [ ] A real call on a scratch chain through the front end's own simulate, send and receipt path (a Foundry test alone does not activate a control).
- [ ] `forge test` totals, factory sizes, Slither triage, invariant and fuzz results, and the independent review, each linked from the prompt log.
- [ ] Manual MetaMask results, only for steps the owner actually performed.

## Open questions for Person 1

- Which `Status` values will the bonuses add, and in what order (the front end maps the enum by index)?
- Final semantics of `matchOrders` (which orders cross, who pays gas, what it returns).
- Whether `cancelOrder` on a pending stop shares the same event.
