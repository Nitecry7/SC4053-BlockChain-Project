# P2-8B.2: Bonus 1, order cancellation in the front end

**Date:** 2026-11-08. **Model:** Sonnet 5.5 (Medium requested; the session effort setting could not be read). **Scope:** the Cancel Order workflow only. Batch matching and stop-limit placement and triggering were not started. No Solidity file, frozen interface, generated ABI or deployment record was changed (`git diff` over `contracts/`, `web/lib/contracts/`, `SPEC.md`, `CONTRACT_INTERFACE.md`, `CLAUDE.md` and `docs/ENGINE_PHASES.md` is empty). Nothing was staged, committed or pushed.

Three kinds of evidence are kept apart here, as elsewhere in this repository:
1. **Contract implementation** (Person 1's engine): `cancelOrder` is implemented, and the engine's own tests passed (335, recorded in [`p2-8b01-preflight.md`](p2-8b01-preflight.md)). Not re-proven by this phase.
2. **Automated front-end tests** (this phase): unit tests with a fake chain, a real-chain suite against the deployed contracts on a scratch Anvil, and a browser suite with a **mock wallet**.
3. **Manual MetaMask verification: none was performed.** Every browser result below used an injected stand-in wallet that forwards to Anvil's unlocked dev accounts. It is not MetaMask and proves nothing about MetaMask.

## 1. Environment and isolation

- Scratch Anvil on 8546 (pid 171544, restarted and redeployed in P2-8B.1, deploy state), scratch Next on 3100 built from a **copy** of `web/` in the session scratchpad with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`. The copy was rebuilt twice during this phase from the current sources (the previous server was stopped by its verified pid: listener and working directory both checked first). The owner's Anvil (8545, pid 151675) and Next (3000, pid 146310) were not touched.
- **Initial state was checked, not assumed.** Because a leftover allowance broke a suite in P2-8B.1, the new real-chain suite and the new browser suite both verify at start that Alice, Bob and Carol have no allowance for the market in either token and no orders, and refuse to run otherwise. Before every run the scratch chain was a freshly deployed one (or had been reverted to its deploy state); allowances were read as 0 after the final run.
- No generated ABI or deployment file was written: the scratch export done in P2-8B.1 was byte-identical to the committed files and nothing was exported again in this phase.

## 2. What was built, and why

| File | Change |
|---|---|
| `web/lib/cancel-runner.ts` (new) | `runCancel`: simulate `cancelOrder(orderId)`, wallet request, bounded receipt wait (reusing `waitBounded`: speed-ups followed, replacements and chain resets detected), decode, reconcile. No approval step. Success needs a successful receipt, an `OrderCancelled` for this order, market and trader, and `getOrder` reading Cancelled at the receipt block. Refund is checked against the order in the block **before** the cancellation and against the tokens' own `Transfer` events |
| `web/lib/receipt.ts` | `decodeCancelReceipt`; `decodeTxEvents` now recognises `OrderCancelled`, so a cancel transaction's page no longer counts it as an unrecognised log |
| `web/lib/order-status.ts` | `isCancellableStatus` (Open, PartiallyFilled, PendingTrigger), `canCancel` (own trader + status), `expectedRefund` (sell: `amount - filled` base; buy: `lockedQuote` quote); `collateralHeld` now states a pending sell stop's escrow |
| `web/lib/errors.ts` | Plain-language text for `NotOrderOwner` and `OrderNotActive` (they were reported as the generic "The contract rejected this transaction") |
| `web/lib/wallet-prompt.ts` | A `cancel` request kind for the pending-wallet, rejection and success copy |
| `web/hooks/use-cancel-flow.ts` (new) | `useTxFlow` bound to `cancelOrder` (same one-request-at-a-time, account/network/market guard and post-transaction re-read as the ticket) |
| `web/components/trade/cancel-panel.tsx` (new), `my-orders.tsx` | A **Cancel** action on eligible rows; a confirmation that states the refund first; the ticket's lifecycle notices; a result shown only after confirmation. The stale "Cancelling orders is not available" text was replaced. A cancelled row now shows 0 remaining |
| `web/components/trade/tx-view.tsx` | Renders the `OrderCancelled` event on the transaction page |
| `web/components/shell/rpc-health-banner.tsx` | One wording change: "Placing or cancelling orders and creating tokens or markets stay off" |
| `web/lib/test-logs.ts` | A synthetic `orderCancelled` log helper for tests |
| `web/e2e/trade.e2e.mjs` | **Separately identified test-isolation change:** the suite now reads Alice's, Bob's and Carol's allowances for both tokens before it starts and fails with a clear message if any is non-zero, instead of silently skipping its approval steps |
| `web/e2e/cancel.e2e.mjs` (new), `web/package.json` | Browser suite and the `e2e:cancel` script |

### Decisions

1. **Reuse, not a new lifecycle.** The flow reducer's `START_ORDER`/`SIMULATION_OK`/`ORDER_SUBMITTED`/`ORDER_MINED`/`RECONCILED` events and `TxStatus` fit a single-transaction cancel as they are, the way the token and market flows already reuse them. The only new wording is for failure kinds whose existing text talks about *placing* an order (replaced, cancelled, chain reset); those are overridden in the cancel runner.
2. **Where the confirmation lives.** One panel under the My orders table, not inline in a row: it keeps the table layout, and the same block works at 375 px.
3. **Gating** uses the existing verified-chain state (`state.live` and the wallet's network, which already include the P2-8A.2 outage and recovery-verification states). During an outage the whole terminal is replaced by "Node unreachable", so no Cancel control exists then.
4. **Refund shown before sending** is what the order holds now (`getOrder`); the figure that counts is the one the confirmed `OrderCancelled` reports, and the panel says so.
5. **Pending stops** are cancellable at the contract-workflow level. The My orders table still shows only their limit price (the trigger price column belongs to the later stop-limit UI).
6. **Not done on purpose:** no cancel-all, no distinction between an owner cancel and the engine's auto-cancel at activation (stop work, later), no batch or stop functionality.
7. **A test assertion changed, with the reason.** `order-status.test.ts` had "states no collateral for a pending stop order", written while the stop functions were stubs. The engine now escrows a stop at placement, so a pending sell stop holds `amount - filled` base. The old assertion was replaced by three narrower ones (pending sell stop, pending buy stop, cancelled sell and buy), not removed; the unknown-order case is kept.

## 3. Results

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **447 passed, 59 skipped** (before: 410 and 48; +23 runner, +6 receipt, +8 order-status, the 11 new real-chain tests are in the skipped count unless a scratch chain is given) |
| `tsc --noEmit`, `eslint .` | clean |
| Real chain (`cancel`, `trading`, `creation`, `hardening`), scratch 8546, `--no-file-parallelism` | **59 passed** (48 before + 11 new cancel tests) |
| Browser, mock wallet, scratch 3100: `e2e:cancel` | **13 passed** (final run; see the history below) |
| `e2e` (Trade) | **13 passed** on a clean chain |
| `e2e:create` / `e2e:dashboard` / `e2e:hardening` / `e2e:liveness` | **14 / 14 / 9 / 11 passed** |
| Exporter tests | 21 passed |
| `forge test` | not re-run in this phase (no Solidity change); 335 passed was recorded in P2-8B.1 on the same contracts |
| axe-core 4.14.0 (loaded temporarily from jsDelivr, not a dependency) on `/trade`, connected: My orders with Cancel buttons, confirmation open, result after a confirmed cancel; 1586 and 375 px | **0 violations in all 6 states** (rules: wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice). `color-contrast` is reported as "needs review" (115 to 170 nodes) because axe cannot resolve text over translucent glass, as in earlier phases; no contrast compliance is claimed. No screen reader was used |

### What the real-chain tests (`cancel.integration.test.ts`) check
- Open sell: refund 100 NTU, Alice's balance back to exactly what it was before placing, market escrow gone, order Cancelled, absent from `getBook`, still in `getUserOrderIds`.
- Partly filled sell (40 of 100 filled): refund exactly 60; the 40 sold and their 80 SGDx untouched.
- Open buy: refund exactly `lockedQuote` (the engine's ceiling), in quote, every quote token back.
- Partly filled buy: the refund is the **remaining** `lockedQuote` for the unfilled 6, not the original escrow; only the 4 bought were paid for.
- Pending sell stop and pending buy stop (placed directly, since the stop UI does not exist yet): full escrow back, never in `getBook`.
- Non-owner and an order number never used: `NotOrderOwner` by name, nothing sent, nothing moved. Filled order (both sides) and an already cancelled order: `OrderNotActive`.
- A transaction that cancels a **different** order than the one requested is reported as unverified, and the requested order stays open.
- For four shapes (open sell, open buy, sell stop, buy stop) the refund the UI expects equals what the chain pays.
- The initial-state check (no allowance, no orders) was shown to fail on purpose: with a deliberate 1-token leftover allowance the suite reports "The scratch chain is not freshly deployed: Alice has a leftover NTU allowance" and skips all 11 tests; the leak was then reverted.

### What the browser tests check (mock wallet)
Cancel is offered only on open, partly filled and pending orders (not on a filled one, and not while disconnected), with an accessible name that contains its visible text; cancelling a partly filled sell shows the 60 NTU expectation first, asks the wallet once with the delay guidance, sends **one** transaction to the order book (no approval), shows the result only after confirmation (refund from the event 60 NTU, the transaction linked), and on-chain the order is Cancelled, Alice +60 NTU, market escrow −60, off the book, still listed as history; an open buy refunds 7.5 SGDx; a pending stop says it has not triggered and refunds 10 NTU; a wallet rejection sends nothing and Try again recovers; an order cancelled elsewhere while its confirmation is open turns into "can no longer be cancelled"; an account switch during the wallet request drops the request with nothing attributed to the new account and Bob sees no Cancel for Alice's orders; a speed-up is followed to the new hash and refunded once; a request the wallet itself cancels is reported as cancelled with the order still open; an RPC outage removes every Cancel control, and after recovery and verification Cancel returns and a cancellation works; a chain reset while the confirmation is open shows the reset notice and leaves nothing sendable for the vanished order; at 375 px the Cancel button and the confirmation fit with no horizontal overflow and the Confirm button is fully on screen.
The transaction page for a cancel transaction was also loaded once in the browser and showed "Order #1 cancelled by 0x7099…79C8: refund 10 NTU" with no "not decoded" notice (one-off check, not part of a suite).

### Test history (nothing hidden)
`e2e:cancel` did **not** pass first time:
1. **First run: 2 passed, 11 failed.** The first failure was my assertion `/cancelled/` against the UI's "Cancelled" (case). It left the result panel open, so every later test failed in its shadow. The screenshot of that run, however, showed two genuine UI problems (below).
2. **Second run: 10 passed, 3 failed.** The outage test asserted that the My orders panel stays visible with a "last known" label; in fact the P2-8A.2 behaviour replaces the whole terminal with "Node unreachable" (stricter than my assertion). The failing test also left the request blocker on, so the next two tests failed as a cascade. I corrected the assertion to what the product does and put the unblock in a `finally`.
3. **Third run: 13 passed.** Nothing in the application changed between the second and third runs except what is listed under "Found by looking at the screenshot".

### Found by looking at the screenshot (real, small UI defects fixed)
- The result heading read "Order #3 cancelled: Cancelled" (redundant). Now "Order #3 cancelled" with "Status on-chain now: Cancelled" below.
- A cancelled order's **Remaining** column still showed the unfilled amount (60) although it had been released and refunded. It now shows 0 for a cancelled order.

## 4. AI mistakes and corrections in this phase
1. Case-sensitive assertion (see history 1), and a test that assumed a "last known" panel the product does not show (history 2). Both were mine, found by running the suite, corrected without weakening what is asserted.
2. A test whose failure left shared state (a request blocker) set: now released in `finally`.
3. The first draft of the result heading and the cancelled row's remaining quantity were misleading (above).
4. The initial `collateralHeld` test pinned stub-era behaviour (decision 7).
5. No defect was found in the application, contracts or the merged engine, and **no AI audit issue was created**: nothing here is a reproduced defect with a before and after in the sense of the brief.

Mutation checks (kept in this phase's session, not committed): seven deliberate breakages of the runner, decoder and helpers (dropping the transfer check, the refund-versus-expected check, the Cancelled-state check, the trader check, the order-id check, the owner check, and allowing a Filled order) each turned at least one test red; the files were restored byte-identical afterwards.

## 5. Limitations and what is not verified
- **No MetaMask test.** Rejection, replacement and speed-up used the mock wallet and same-nonce transactions sent straight to Anvil; the wallet's own Speed up and Cancel buttons were not exercised.
- **A chain reset or an RPC outage *while a cancel is in flight* is covered by unit tests (fake chain: reset ends the wait with cancel-specific wording, timeout never claims success) but not by a browser run.** The browser tests cover a reset and an outage while the panel is idle or open, and recovery afterwards.
- The named `OrderNotActive` and `NotOrderOwner` errors are shown in unit and real-chain tests; in the browser the "already cancelled" case is shown through the refreshed status message, not through a simulation revert.
- `Remaining`, `Locked collateral` and statuses come from `getOrder`; **My orders lists the latest 50 orders** (`MY_ORDERS_LIMIT`), so an older cancellable order may not appear.
- A pending stop's trigger price is not shown yet (stop UI is a later phase). The engine's auto-cancel of an activated stop (`OrderCancelled` inside `triggerStopOrders`) is not specially labelled.
- Color contrast is not verified for the new text; it uses the existing lilac link colour.
- `docs/SUBMISSION_CHECKLIST.md`, `PRODUCT.md` and `DESIGN.md` still describe cancellation as pending or forbid a cancel control. `PRODUCT.md` and `DESIGN.md` were **not edited** (approved files; see section 7). `SUBMISSION_CHECKLIST.md` B1 was corrected in the follow-up (section 9).

## 6. What to check manually on localhost (with MetaMask, on the owner's chain)
The owner's chain on 8545 already runs the new engine (checked read-only in P2-8B.1), but the app on 3000 must be restarted or rebuilt to pick up these changes. Procedure; the happy path was later performed by the owner (section 9), the rejection and account-switch steps were not:
1. Place a sell of 10 NTU at 2 as account A, and a buy of 4 NTU at 2.2 as account B (a partial fill, as in Test 4).
2. As A, open `/trade`: A's order shows **Partly filled** with 6 NTU and a **Cancel** link; B's filled order shows none.
3. Press **Cancel**: the panel says you get back 6 NTU, that no approval is needed, and offers **Confirm cancel** / **Keep order**.
4. Confirm: MetaMask shows **one** transaction to the order book (no approval). After it is mined the result says "Order #… cancelled", refund 6 NTU, links the transaction; A's NTU balance rose by exactly 6; the row reads Cancelled with no Cancel link and 0 remaining; the order is gone from the Order book.
5. Reject a cancel in MetaMask: "You rejected the cancel request", nothing sent. Switch account in MetaMask mid-request: "Your account or network changed".
6. Open the cancel transaction's page: it shows "Order #… cancelled by …: refund 6 NTU".
Screenshots still needed for the report (not recorded here): the confirmation, MetaMask's single prompt, and the result.

## 7. Documentation inconsistencies found (not silently rewritten)
- `PRODUCT.md` (lines about "cannot yet cancel", the engine stubs) and `DESIGN.md` ("do not add a cancel control while the engine's `cancelOrder` reverts") are now out of date for cancellation. Proposed wording is for the owner to approve.
- `docs/SUBMISSION_CHECKLIST.md` item B1 was corrected in the follow-up (section 9).
- `docs/ENGINE_HANDOFF.md` ("Stale frontend files") is Person 1's file and was not edited; the cancel items in it are now addressed here.

## 8. Tools used
`vitest`, `tsc`, `eslint`, `next build`, `forge`/`anvil`/`cast`, `node` with viem and `playwright-core` (mock wallet), axe-core 4.14.0 (temporary). The independent Opus review was not run (reserved for the completed integration).

## 9. Follow-up, 2026-11-08: owner-run MetaMask verification, nonce incident, label fixes
Three kinds of statement are kept apart: **owner-reported** (what the owner saw in the UI and MetaMask), **cross-checked** (read by the AI from the owner's chain on 8545 with `cast call` and `cast logs` only, no transaction sent), and **pending**.

### 9.1 Owner-reported journey (real MetaMask, chain 31337, localhost:3000)
Alice (account 0) sold 5 NTU at 2 SGDx. Bob (account 1) bought 2 NTU at a limit of 2.2. It executed at the maker's price of 2: 2 NTU filled, 4 SGDx paid, 0.4 SGDx returned, Bob's order Filled, Alice's order PartiallyFilled with 3 NTU locked. Alice then used **Cancel**: the confirmation expected a 3 NTU refund; after the MetaMask transaction confirmed the app showed order #1 Cancelled, expected refund 3 NTU, `OrderCancelled` refund 3 NTU, token transfer to Alice 3 NTU, escrow remaining 0, unfilled quantity remaining 0, the order gone from the active book but kept in My orders. The final dashboard showed Alice with 969,998 NTU and 970,004 SGDx.

### 9.2 Cross-check against the chain (read-only, 8545, head block 16)
| Claim | Chain reading | Result |
|---|---|---|
| Order 1: Alice's sell of 5 at 2, filled 2, cancelled | `getOrder(1)`: trader `0xf39F…2266` (account 0), side Sell, price 2e18, amount 5e18, filled 2e18, lockedQuote 0, status 3 (Cancelled) | Consistent |
| Order 2: Bob's buy of 2 at 2.2, Filled | `getOrder(2)`: trader `0x7099…79C8` (account 1), side Buy, price 2.2e18, amount 2e18, filled 2e18, lockedQuote 0, status 2 (Filled) | Consistent |
| Trade at the maker price | `Trade` log in block 15: maker order 1, taker order 2, price 2e18, base 2e18, quote 4e18 | Consistent |
| Cancel refund 3 NTU | `OrderCancelled` log in block 16: refundBase 3e18, refundQuote 0 | Consistent |
| Escrow remaining 0 | NTU and SGDx balance of the market: 0 and 0 | Consistent |
| Alice's wallet | NTU 969,998 and SGDx 970,004 (exact) | Consistent |
| Bob's wallet | NTU 10,002 and SGDx 9,996; allowance to the market 0 | Consistent with paying 4 and getting 0.4 of a 4.4 escrow back |
| Event sequence | Logs: `OrderPlaced` block 13; `OrderPlaced` and `Trade` in block 15 (same transaction); `OrderCancelled` block 16 | Consistent |

The 0.4 SGDx price improvement is **inferred** (Bob's net change is exactly 4 SGDx, the escrow for 2 at 2.2 is 4.4, and the market holds nothing). It was not read from a refund event. What the chain cannot show: the MetaMask prompts, what the UI displayed, and any timings. **No full transaction hashes or screenshots are recorded here;** the owner can supply them.

### 9.3 Still not manually verified
MetaMask rejection of a cancel, an account switch during an in-flight cancel, cancelling a buy order, an RPC outage and a chain reset during a cancel. These remain covered by mock-wallet and unit tests only.

### 9.4 MetaMask nonce incident (development environment, not a contract defect)
After Anvil was restarted the chain was at block 0 with no contracts or earlier custom market. The owner rebuilt, redeployed, exported and got `scripts/check-local.sh` ready, but MetaMask kept nonces from the earlier session: for account 0 Anvil expected nonce 11 while MetaMask used 15 (and 16 for another transaction); for account 1 Anvil expected 0 while MetaMask used 8. The transactions were known to Anvil but stayed pending because the earlier nonces were never filled. The owner inspected them with `eth_getTransactionByHash` and `eth_getTransactionCount`, removed the identified stuck transactions from Anvil's pool, cleared the relevant MetaMask activity and nonce data, and the approvals and trades then succeeded. (Owner-reported; the nonce numbers and the removal were not re-observed by the AI, and the pool is empty now.)
- **Cause:** wallet and node nonce state out of sync after a local restart. Not Solidity, not the engine, not the front end.
- **Distinct from** the P2-8B preflight contamination (`p2-8b01-preflight.md`), where a leftover ERC20 allowance on a scratch chain broke the Trade browser test. Different cause, different layer, different fix.
- **Action taken:** documentation only (`README.md` troubleshooting, `docs/DEPLOYMENT.md` "Troubleshooting a local chain"). No application code was changed to compensate for stale wallet state, and no audit issue was filed because no defect in the project's code was found.
- `anvil_dropTransaction` was checked on a scratch Anvil (8546) with a hash not in the pool: it answered `null` and changed nothing. Dropping a real pending transaction was not repeated by the AI.

### 9.5 Label fixes made in the follow-up
- The Dashboard book panel was titled "Buyers / sellers (NTU / SGDx)"; it shows resting orders, so it is now **Order book (NTU / SGDx)**, and the side pills read **Buy (bid)** and **Sell (ask)**. Rows, amounts, prices, data source and the Market Depth chart are unchanged.
- The Dashboard strip said "Cancelling orders is not available yet: the engine does not implement it" and listed "Cancel orders" as a planned feature. It now says to use Cancel in My orders and links to Trade (keeping the selected market). No cancel flow was duplicated on the Dashboard.
- A source comment in `lib/order-plan.ts` called `matchOrders` a stub; it now says it is implemented on-chain but has no UI control yet. `order-result.tsx` still says `matchOrders` is "not available yet", which is true of the UI and was left alone.
- **Applied after the owner's explicit approval (2026-11-08):** `PRODUCT.md` (the bonus-features bullet, the "cannot yet" paragraph, the engine-status line and the manual-MetaMask line) now says all three bonus features are implemented in the engine, only cancellation has a UI and was manually verified on its happy path, Bonus 2 and 3 have no frontend controls, and the negative and recovery scenarios are untested; `DESIGN.md` replaces "do not add a cancel control" with: show Cancel only for eligible orders on a verified chain using the existing design system. The Market Depth legend wording ("Buyers (bids)" / "Sellers (asks)", `DESIGN.md` lines 164, 183, 288) was deliberately left unchanged.
