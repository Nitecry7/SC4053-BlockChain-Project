# P2-8B.4: Bonus 3, stop-limit orders in the front end

**Date:** 2026-11-08. **Model:** Sonnet 5.5 (Medium requested; the session effort setting could not be read). **Scope:** placing, listing, cancelling and triggering stop-limit orders in the UI. No Solidity, interface, generated ABI or deployment record was changed, and no keeper, oracle or automation was added.

Four kinds of evidence are kept apart here, as elsewhere in this repository:
1. **Contract implementation** (Person 1's engine): `placeStopLimitOrder` and `triggerStopOrders` are implemented and their own tests passed (335 passed, re-run once in this phase as a regression check; section 3). Not re-proven here.
2. **New front-end integration** (this phase): the Stop-limit ticket mode, pending stops in My orders, the Trigger stops panel, their runners and receipt decoders (section 2).
3. **Automated evidence** (this phase): unit tests with a fake chain, a real-chain suite against the deployed contracts on a scratch Anvil, and a browser suite with a **mock wallet**.
4. **Manual MetaMask verification: none was performed for stop-limit orders.** Every browser result below used an injected stand-in wallet that forwards to Anvil's unlocked dev accounts. It is not MetaMask. The procedure is `docs/TESTING.md`, Test 14.

## 1. Environment and isolation

- **Git preflight:** branch `faheem`, HEAD `42a5acd` ("feat(web): match crossed orders from Trade (Bonus 2)"), working tree clean at the start: the Bonus 2 milestone was committed. No pull, merge, reset, clean, checkout, stage or commit.
- **Main environment (read-only):** Anvil 8545 (pid 151675, head 16) and Next 3000 (pid 146310, HTTP 200) were never written to or restarted.
- **The Bonus 2 scratch evidence was preserved:** Anvil 8546 (pid 171544, head 78, the owner's real-MetaMask Bonus 2 transaction) and Next 3100 (pid 264076) were not touched.
- **A new scratch pair was used for Bonus 3:** ports 8547 and 3101 were checked free; a new `anvil --port 8547` (pid 324125, chain id 31337, block 0) was deployed with `Deploy.s.sol` (head 11) with `FOUNDRY_BROADCAST`, `FOUNDRY_CACHE_PATH` and `FOUNDRY_OUT` redirected into the session scratchpad. `abis.ts`, `deployments.ts`, `next-env.d.ts` and the hash of `contracts/broadcast` were compared before and after (identical) and the exporter was not run (fresh-Anvil addresses equal the committed `deployments.ts`). A scratch Next (pid 339540) was built from a **copy** of `web/` with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8547`; the process on 3101 was only ever killed after its working directory was verified to be that copy.
- **State was checked, not assumed.** The real-chain and browser suites verify at start: no allowance for any test account, no orders, an empty book, **no trade price**, a keeper holding no tokens, and that `triggerStopOrders` exists and returns 0. After every real-chain test, even one that threw, the revert is verified from the node (uncached `eth_blockNumber`, allowances, order ids, book heads, "nothing to trigger"), never by balances alone. Every scenario ends with a solvency check: the market's NTU and SGDx equal what its orders still owe. The browser suite's `finally` triggers, matches and cancels whatever a case left and the whole run is reverted to its snapshot.

## 2. What the engine does (read from `OrderBook.sol`; the source of truth)

| Question | Answer in the code |
|---|---|
| Parameters | `placeStopLimitOrder(Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount)`; `triggerStopOrders(uint256 maxCount)` returns how many it activated |
| Validation at placement | `ZeroAmount`, `ZeroPrice` (limit **or** trigger 0), `InvalidLotSize`, `InvalidTickSize` (limit or trigger), in that order. **No** comparison of trigger with limit or with the last trade price: any positive tick-aligned pair is accepted, including an already-eligible stop |
| Escrow | At placement, at the **limit** price: buy `lockedQuote = requiredQuote(amount, limitPrice)` (ceiling), sell `amount` base |
| Where a pending stop lives | Status `PendingTrigger` (4), in its side's stop list, **outside** `getBook`, best bid/ask and depth. `BookTooDeep` at placement if more than 100 stops on that side rank ahead |
| Events | `StopOrderPlaced(orderId, trader, side, triggerPrice, limitPrice, amount)` (no `OrderPlaced`); `StopOrderTriggered(orderId, lastTradePrice)` per activation; `OrderCancelled` and `Trade` as usual |
| Which price | The market's own `lastTradePrice`, set by the last fill. Before the first trade (`hasTradePrice` false) `triggerStopOrders` returns 0 |
| Trigger rule | Buy stop: `lastTradePrice >= triggerPrice`. Sell stop: `lastTradePrice <= triggerPrice`. Equality triggers. Only the stop-list **heads** are tested (buy side first); the lists are ordered so the head is the first to become eligible. Checked only inside `triggerStopOrders`, which anyone may call (no tokens, no approval) |
| Activation | The stop is unlinked, set `Open`, stamped with a new priority number, `StopOrderTriggered` is emitted, and it is matched as a **taker** at the makers' prices with ONE shared budget of 10 fills per call. A remainder rests at the limit price. Fills move `lastTradePrice`, so later stops can become eligible in the same call, up to `maxCount` |
| Insertion failure | If the remainder cannot enter the book (more than 100 orders rank ahead), the engine **cancels and refunds it** (`OrderCancelled`, the same event as an owner cancel) and still counts it as triggered. The UI tells the two apart by a preceding `StopOrderTriggered` for the same order in the same transaction |
| Limits | `maxCount` 1 to 10 (`InvalidMaxCount`); `MAX_INSERT_SCAN` 100 |
| Visible market-wide | Nothing: there is **no view of the stop lists**. The only market-wide eligibility oracle is an `eth_call` of `triggerStopOrders(10)` |
| Cancelling | `cancelOrder` accepts `PendingTrigger` and refunds the full escrow; `getOrder.triggerPrice != 0` marks any stop, before and after activation |

## 3. What was built, and why

| File | Change |
|---|---|
| `web/lib/stop-orders.ts` (new) | `stopState(side, trigger, last, hasTrade)` returns `no-trade-price`, `eligible` or `waiting (fall or rise)`; `stopStateText` (the wording that tells *waiting for price* apart from *eligible now: needs a Trigger stops transaction*); `stopHints` (non-blocking warnings); `validateStopInput` (escrow strictly from the LIMIT price); `isStopOrder` |
| `web/lib/stop-runner.ts` (new) | `runStopOrder` beside `runOrder`, reusing `waitBounded`, `fail` and `runApproval`; `reconcileStop`; `StopOutcome`, `TicketOutcome`, `isStopOutcome` |
| `web/lib/trigger-runner.ts` (new) | `runTrigger` (re-simulate, refuse and spend no gas on 0, one wallet request, bounded wait, decode and reconcile each activated stop), `triggerDeps`, `previewTrigger`; per-stop outcomes `resting`, `partly-filled`, `filled`, `auto-cancelled` |
| `web/lib/receipt.ts` | `decodeStopReceipt`, `decodeTriggerReceipt` (auto-cancel recognised only after a trigger for the same order), and the transaction page now decodes `StopOrderPlaced` and `StopOrderTriggered` |
| `web/lib/order-input.ts`, `order-runner.ts` | Appended optional `kind` and `triggerPrice` on `ValidOrder` and a `trigger` field error; `runApproval` and `Dispatch` made generic over the outcome type (no behaviour change) |
| `web/hooks/use-order-flow.ts`, `use-trigger-flow.ts` (new) | The ticket's flow now ends in `TicketOutcome` and picks the stop runner by `order.kind`; `useTriggerFlow`, `useTriggerPreview` and `useTriggerableStops` (one `eth_call` per block, enabled once the market has a trade price) |
| `web/components/trade/order-ticket.tsx`, `stop-result.tsx` (new) | **Limit / Stop-limit** switch, trigger field, plain-language explainer, last trade hint, stop notes, review and pending result card |
| `web/components/trade/my-orders.tsx`, `hooks/use-dex-data.ts` | Trigger, limit and *waiting / eligible / activated* line for a stop; one extra `StopOrderPlaced` log read only when a stop is listed |
| `web/components/trade/trigger-panel.tsx` (new), `trade-view.tsx`, `tx-view.tsx` | The Trigger stops panel and its result; the two new event lines |
| `web/lib/errors.ts`, `wallet-prompt.ts` | `BookTooDeep` wording that covers stops; a `trigger` request kind |
| `web/lib/test-logs.ts`, `package.json`, `web/e2e/stop.e2e.mjs`, `web/lib/stop.integration.test.ts` and the unit tests | Test helpers and `npm run e2e:stop` |
| `scripts/seed-stop-orders.sh` (new) | Manual-test helper (section 6) |

### Decisions
- **Waiting versus eligible (owner refinement):** two distinct states everywhere. An eligible stop does not need another trade; it needs a Trigger stops transaction, and it stays `PendingTrigger` and escrowed until then.
- **Eligibility is detected by the contract, not by a client re-implementation:** the Trigger panel appears only while a simulated `triggerStopOrders(10)` returns more than 0, once per block. That follows the engine's own head-only rule and needs no log scan. My orders applies the engine's rule to the connected account's own stops for display only.
- **No parallel framework:** the placement result type is a union (`TicketOutcome`), the approval is the shared `runApproval`, cancelling is the unchanged Bonus 1 runner, and a crossed remainder is cleared by the unchanged Bonus 2 panel.
- **Nothing here is financial floating point:** an early draft of the trigger result text formatted amounts with JavaScript numbers; review caught it before it ran and it uses `formatExact`.

## 4. Results

| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .` | clean |
| `npm test` (unit) | **576 passed, 75 skipped** (before this phase: 497 and 64; 79 new) |
| New unit tests | `stop-orders.test.ts` 20, `stop-runner.test.ts` 19, `trigger-runner.test.ts` 28, `receipt.test.ts` +10, `errors.test.ts` +1, `wallet-prompt.test.ts` +1 |
| Real chain (scratch 8547), all suites, one at a time | **75 passed** (64 before + 11 new in `stop.integration.test.ts`) |
| Browser (mock wallet, scratch 8547 and 3101) | `e2e` 13, `e2e:create` 14, `e2e:dashboard` 14, `e2e:hardening` 9, `e2e:liveness` 11, `e2e:cancel` 13, `e2e:match` 15, **`e2e:stop` 17** (new): **106 passed, 0 failed**, each suite alone, in sequence, on the final code |
| Exporter tests | 21 passed; `abis.ts`, `deployments.ts` and `next-env.d.ts` sha256-identical before and after |
| `forge test` | **335 passed, 0 failed** (27 suites), run once with `FOUNDRY_OUT` and `FOUNDRY_CACHE_PATH` redirected; no Solidity changed; the deep invariant profile was not run |
| `next build` | succeeded on the scratch copy (repeated for each rebuild) |
| axe-core 4.14.0 | **0 violations** in 14 states: ticket in stop mode, review, My orders waiting, My orders eligible, Trigger panel eligible, trigger review, trigger result; each at 1586 px and 375 px. `color-contrast` is reported only as "needs review" |
| Contrast, read manually | Measured by sampling the rendered pixels behind each new text element: all at or above 4.5:1 (ratios 5.2 to 14.5) **except the ticket's primary button "Approve 1.9 SGDx" at about 4.4:1**, the shared white-on-purple CTA style that has been in the ticket since P2-5 (the new "Review trigger" and "Confirm trigger" buttons of the same style measure 5.1). Not changed; reported for the owner |

### What the real-chain suite checks (`lib/stop.integration.test.ts`, 11 tests)
Placement through the real runners (exact approval, then `runStopOrder`) of a sell stop (exact escrow, `PendingTrigger`, allowance consumed, **not in the book**) and a buy stop (escrow is `requiredQuote` at the **limit** price, rounded up, equal to the contract's own `requiredQuote`); **before the first trade** nothing can trigger and the runner refuses before the wallet; **not eligible** (last trade 2, sell trigger 1.8 waits for a fall, buy trigger 2.5 for a rise); the **exact boundary** (last trade 1.8 triggers a sell stop at 1.8 but not one at 1.799999999) with an activation **without a fill** that rests on the book at its limit price; an activation **with an immediate fill** (the stop is the taker at the bid's price 1.9, not its limit 1.7; exact balances; a **token-less keeper** sends it and its balances do not change; the events compared with an independent decode); a **partial fill**; a pending stop **cancelled** with the Bonus 1 runner (full refund, history kept, a second account cannot cancel it, nothing left to trigger); **several eligible stops in a bounded call** (`maxCount` 2 activates two, the next call the third); the engine's **auto-cancel** of a stop whose remainder cannot enter a book with 101 orders ahead (refunded in full, reported as the engine's cancel, never in the book); and activation hitting the shared **10-fill budget** and leaving a crossed book that Bonus 2's `matchOrders` clears. Solvency is asserted after every scenario.

### What the browser suite checks (`e2e/stop.e2e.mjs`, mock wallet, 17 cases)
The normal limit ticket unchanged and the mode switch (accessible names equal to the visible text); **placement with an allowance gap** (review, an `approve` of exactly 10 NTU, then the `placeStopLimitOrder` calldata, the result **pending**, nothing in the book) and **with an allowance already in place** (one request, buy stop escrow at the limit); **waiting for price versus eligible now** (the wording changes with the last trade price, the status stays Pending trigger and the escrow stays); **cancelling a pending stop**; **triggering as a token-less keeper** (review with estimate and gas, no wallet request until Confirm, one request from the keeper with calldata `triggerStopOrders(10)`, a result from the receipt: filled as a taker; resting without a fill; keeper balances unchanged); a stop triggered by someone else while the review is open (panel disappears, wallet never asked); rejection then Try again; an account switch while the request is open; a speed-up followed to its new hash; a wallet-cancelled request; an RPC outage (terminal replaced, action returns after verified recovery and works); a chain reset while the review is open; the 10-fill budget leaving a crossed book handed to the Match orders panel and cleared; mobile 375 px (no overflow, 36 px button); no unexpected console errors.

### Test history (nothing hidden)
1. **Unit tests:** written with the code; all passed on the first run (the helpers and runners were modelled on the Cancel and Match ones whose tests already existed). Five deliberate breakages each turned a test red (below).
2. **Real-chain suite:** passed 11 of 11 on its first run against 8547, including the 101-order auto-cancel case. Because that was fast and clean, vacuity was checked: the verbose run lists each test, and three breakages of the runners (below) made integration tests fail.
3. **Browser suite, first run: 16 passed, 1 failed.** My assertion matched "No trade has happened" with a capital N while the wording is "no trade has happened"; the assertion was corrected (case-insensitive). The failure was in the test, not the product.
4. **Browser suite, second run: 17 passed, 0 failed.** The final regression was then run on the final code.
5. **Five deliberate breakages** of the rule, the decoder and the runners each turned at least one test red, and the files were restored byte-identical (sha256 verified): sell eligibility `<=` to `<` (2 unit tests red); auto-cancel never recognised (2 unit + 1 real-chain); the trigger runner sending when the simulation says 0 (1 unit + 2 real-chain); the stop runner skipping the requested-order comparison (1 unit); the buy escrow reconciled against the trigger instead of the limit price (2 unit + 1 real-chain).
6. **No defect in earlier code and no new audit issue** was found in this phase (unlike P2-016 in Bonus 2).

## 5. Security and transaction-correctness checks
- Nothing is signed outside the wallet; no key is seen (the mock wallet and the scripts use Anvil's unlocked accounts).
- Approval is exact (the escrow computed from the **limit** price, never unlimited) and a separate wallet request from placement; if the allowance already covers it there is no approval request. Triggering and cancelling need no approval.
- **Never reports a stop as filled or activated because a transaction succeeded:** placement is verified as `PendingTrigger` with nothing filled and the right escrow; activation is verified from `StopOrderTriggered`, `Trade`, `OrderCancelled` and `getOrder` before and after the block, and each activated stop's line says what actually happened.
- The trigger runner refuses to send (and spends no gas) when the book has nothing eligible or the simulation returns 0; the count sent is the market's own limit; no loop, no timer, no keeper: each transaction is one deliberate click, and "Review another trigger" is offered only if more stops are still eligible.
- Receipts are attributed to the requested market; any disagreement (a trade whose taker was not activated here, an order with a different filled amount, a cancel without a preceding activation, payouts that do not add up) is shown in an alert instead of a clean success.
- The accepted engine limitations stay documented and are not claimed solved: the market's own last trade price can be moved by trading; a stop is not a guarantee of execution or price; the capped-placement limitation of issue 007.

## 6. Manual MetaMask support (prepared; performed on 2026-11-08, see section 9)
`scripts/seed-stop-orders.sh` and `docs/TESTING.md`, Test 14. The AI ran a full dry run of the helper on 8547 inside a reverted snapshot using Anvil accounts 5 (stop owner) and 6 (keeper): `prepare`, a sell stop (10 NTU, trigger 1.8, limit 1.7), a second stop cancelled, `move-price 1.9` (still waiting, 0 stops), `move-price 1.8` (1 stop eligible), `add-bid 1.9 4`, a keeper `triggerStopOrders(10)` sent with `cast` (203,299 gas, the order partly filled 4 of 10, the remaining 6 NTU resting), and `verify-after`: every check passed, including solvency (the market held exactly 6 NTU and 0 SGDx). The snapshot was reverted, then `prepare` was run for real: 8547 is at block 19 with a last trade price of 2, account 5 funded with 100 NTU and 100 SGDx, the book empty and no allowance; accounts 5 and 6 have nonce 0 on 8545, 8546 and 8547.
**Why accounts 5 and 6 and not 1 and 4:** every local Anvil has chain id 31337 and MetaMask caches nonces per chain id. Read-only nonce reads on 2026-11-08 showed account 1 at nonce 2 on 8545 and 25 on 8546, and account 4 (the Bonus 2 keeper) at nonce 1 on 8546 and 0 on 8547: using account 4 on 8547 would have made MetaMask submit nonce 1 where the chain expects 0, stranding the transaction (the same family of problem as after an Anvil restart). Accounts 5 and 6 are at 0 everywhere. This was caught by reading the nonces before writing the procedure, not by a test.

## 7. Limitations and what is not verified
- **MetaMask:** only the happy path was performed (owner, 2026-11-08; section 9). Rejection, account switch mid-request, outage, chain reset and the deep-book refund were not performed with MetaMask. Sections 1 to 8 are about the automated tests and make no claim about MetaMask.
- Only the connected account's stops are listed (the engine has no view of other traders' stops); eligibility market-wide is detected by simulation, once per block.
- A stop that looks eligible may not activate if the chain moved first; the review always re-simulates and the result comes only from the receipt.
- A reset or outage in the middle of an in-flight trigger transaction is covered by unit tests; the browser suite covers an outage and a reset while the review is open.
- The engine's auto-cancel at activation is exercised by the real-chain suite and the fake-chain tests, not by the browser suite or MetaMask.
- `PRODUCT.md` and `DESIGN.md` were not edited; proposed wording is in the completion report.
- The ticket's shared primary button measures about 4.4:1 (section 4); the new buttons measure 5.1.

## 8. Tools used
`vitest`, `tsc`, `eslint`, `next build`, `forge`/`anvil`/`cast`, `node` with viem and `playwright-core` (mock wallet), axe-core 4.14.0 (temporary, loaded from a CDN, not a dependency). `solidity-security`, Context7 and the shadcn MCP were not invoked (no Solidity change, no new library, no new component). The independent Opus review was not run (reserved for after the manual verification).

## 9. Real MetaMask verification, 2026-11-08 (owner-performed, AI cross-checked read-only)
**Who did what.** The owner performed the Bonus 3 happy path in real MetaMask on `http://localhost:3101` against the scratch Anvil `http://127.0.0.1:8547` (chain id 31337), stop owner Anvil account 5 `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`, keeper Anvil account 6 `0x976EA74026E726554dB657fA54763abd0C3a0aa9`. The AI did not operate MetaMask. The AI then re-read the chain with `cast` and viem (`eth_getBlockByNumber`, `eth_getTransactionReceipt`, `eth_call`, `getOrder` at historical blocks) and ran `scripts/seed-stop-orders.sh status` and `verify-after` (both read-only). **No transaction was sent, nothing was reset or restarted;** the heads before and after were 8545 = 16, 8546 = 78, 8547 = 35. Anvil keeps historical state, so `getOrder` and `triggerStopOrders` simulations could be read at earlier blocks.

**Transactions recovered from blocks 20 to 35 (the full hashes).**

| Block | Sender | Call / meaning | Full hash | Gas used |
|---|---|---|---|---|
| 20 | acct 5 | SGDx `approve(market, 17e18)` | `0x86c0b5c528a03ad30c9a667d98be5e36a97d70c48d5a2b8e440af7c6bea91bad` | 46,367 |
| 21 | acct 5 | `placeStopLimitOrder(buy, 1.8, 1.7, 10)` = order #3 | `0xf51f4e7a3e4870870d58d297ae59d71de16849d4cdd5f7ef32db961695a30de2` | 297,857 |
| 22 | acct 5 | `cancelOrder(3)`, refund 17 SGDx | `0xdbf85691ff7260907a4164459ef35457447fd44681ce975eb4551b518897a1f6` | 54,904 |
| 23 | acct 5 | NTU `approve(market, 10e18)` | `0xb7666c5afe438fd5f5cc373faf5003308215b1f2d5597fa6e601cecaed35834c` | 46,367 |
| 24 | acct 5 | `placeStopLimitOrder(sell, 1.8, 1.7, 10)` = order #4 | `0x0f1aa7c4d244331a62c39cbe4308ae6daa46bf2ed83d8e56b40737f88e471d77` | 260,203 |
| 25, 26 | acct 3 | NTU approve; ask 1 NTU at 1.9 (`move-price 1.9`) | `0x38a5d1ea5b277e76734d2da3e544f8124efa21ef9b7637706212a5ce1d011e79`, `0x358bae70f9df2f1dca34e5e82e76cee44bb20228a68523859c5f020ffd93455a` | 46,367 / 252,981 |
| 27, 28 | acct 2 | SGDx approve; buy 1 NTU at 1.9, `Trade` at 1.9 | `0x8b9d656cacbc6ba8f9b074532e02e30d357b8a6fd99a95caea3f60ab3c5abf8f`, `0x3482fe912cbd9e59d1546f2f6eeea68a2530fe7fc36ae3ef587c32e0af9bfa20` | 46,367 / 320,006 |
| 29, 30 | acct 3 | NTU approve; ask 1 NTU at 1.8 (`move-price 1.8`) | `0x0c404ffba7b0aa505c885ca0357cbdc331140bbdd148bba29d11002fb39ed50b`, `0xb0cc675fac49472a62cd777bf061b68177af71ac0e808054b07ba86b064f10fb` | 46,367 / 252,981 |
| 31, 32 | acct 2 | SGDx approve; buy 1 NTU at 1.8, `Trade` at 1.8 | `0x65345362343beb86e39c9d5a932e193402d3f00533b769df4e0081d3ba616aa2`, `0x62dca8410d399d4860b2d4d150b0cd884e718007520c43d2adb67ac954061be4` | 46,367 / 320,006 |
| 33, 34 | acct 2 | SGDx approve; `placeLimitOrder(buy, 1.9, 4)` = order #9 (`add-bid 1.9 4`) | `0xc7be07feb31523367410dcb28cd7a7ed868e6fd2d5d7ad331453c511b89bb1be`, `0x3beffc9b01b599db3e5b9817d7391cd7999a6f9d5ef88c5badf10ce922237762` | 46,367 / 290,626 |
| **35** | **acct 6 (keeper)** | **`triggerStopOrders(10)`** | `0x7f48fd6810b79c3cf76af3619b7e664bbd3e32a4d3dee512a549cebf00690a11` | **203,299** |

(Blocks 12 and 13 contain no transactions; the AI's earlier regression run left the head moving from 11 to 13 on this chain. Blocks 14 to 19 are the helper's `prepare`: funding account 5 and the first trade at 2.) Account 5 sent exactly five transactions (nonces 0 to 4, matching its chain nonce 5); account 6 sent one (nonce 0, chain nonce 1).

**Decoded events.** Block 21: SGDx `Transfer` acct 5 to market 17, `StopOrderPlaced(3, acct 5, side 0, trigger 1.8, limit 1.7, amount 10)` and no `OrderPlaced`. Block 22: `OrderCancelled(3, acct 5, refundBase 0, refundQuote 17)` and SGDx `Transfer` market to acct 5 17. Block 24: NTU `Transfer` acct 5 to market 10, `StopOrderPlaced(4, acct 5, side 1, 1.8, 1.7, 10)`. Block 35: `StopOrderTriggered(4, lastTradePrice 1.8)`, `Trade(maker #9 acct 2, taker #4 acct 5, price 1.9, base 4, quote 7.6)`, NTU `Transfer` market to acct 2 4, SGDx `Transfer` market to acct 5 7.6.

**Last-trade-price history (from `Trade` events):** 2.0 (block 19) → 1.9 (block 28) → 1.8 (block 32) → 1.9 (block 35). A simulated `triggerStopOrders(10)` from the keeper returned 0 at blocks 24, 28 and 31, **1 at blocks 32 and 34**, and 0 at block 35. That is exactly the owner's account: waiting at 2.0 and 1.9, eligible at 1.8 while the order stayed pending, then activated by the keeper's transaction. `getOrder(3)`: status 4 at block 21, 3 (Cancelled) from block 22, filled 0, locked 0. `getOrder(4)`: status 4 at blocks 24 and 34, status 1 (PartiallyFilled) at block 35 with filled 4e18 of 10e18.

**State at head (block 35).** Market 6 NTU and 0 SGDx; account 5 90 NTU and 107.6 SGDx (SGDx 100 − 17 + 17 refund + 7.6 proceeds; NTU 100 − 10 escrowed); keeper 0 NTU, 0 SGDx; last trade 1.9; best ask #4 at 1.7 with 6 NTU remaining; simulated trigger count 0. `verify-after`: PASS for the single `StopOrderTriggered`, the sender being the keeper, the call being `triggerStopOrders`, order #4 activated and partly filled, the keeper's balances unchanged and solvency (6 NTU, 0 SGDx).

**Claims by evidence level.**
| Level | Claims |
|---|---|
| Confirmed on-chain | Everything in the tables above: hashes, senders, nonces, calls, events, escrow and refund amounts, status changes by block, price history, eligibility by block, gas used 203,299, final balances, solvency, the fill at the maker's price 1.9 (not trigger 1.8, not limit 1.7), the resting remainder at 1.7, and that #3 was never triggered |
| Owner-reported only (consistent with the chain) | What MetaMask and the app displayed: "already eligible" warning on the buy stop, Pending trigger, Waiting for price and Eligible now labels, the review's gas estimate 227,434 and "about 1 stop", "cancellation confirmed in block 22" screen, "No additional eligible stops", "book no longer crossed", the My orders account-connection confusion (owner: resolved, the app was still connected to the owner; not an isolation bug) |
| Not establishable | Screenshots (not in the repository or accessible to the AI), exact clicks and wallet popups, whether any request was rejected and retried in the wallet |
| Not performed | MetaMask rejection, account switch during a request, RPC outage, chain reset, deep-book auto-cancel refund through the UI, another account cancelling a stop, `BookTooDeep` at placement, and test step 14e as written |

**Interpretation.** Activation and execution are separate: the keeper's call activated #4 (`StopOrderTriggered`) and in the same transaction it traded as a taker against the resting bid at that bid's price, 1.9. The trigger 1.8 was only the condition; the limit 1.7 only the lowest acceptable price. The remaining 6 NTU rest as an ordinary sell order at 1.7.

**UI wording defect (frontend correctness, low severity, no funds affected; not fixed in this phase).** After the owner cancelled stop #3, the app's My orders text for it says "Activated: it is now an ordinary order at its limit price (cancelled)". On-chain evidence contradicts it: no `StopOrderTriggered` exists for #3 and its status went 4 → 3 directly. Location `web/components/trade/my-orders.tsx` lines 130-131 (the branch for stops with status other than Pending). Why my tests missed it: the browser and unit tests asserted the Pending-trigger and activated-then-filled states and the cancel refund, but no test cancelled a pending stop and then asserted the wording of the history line; `getOrder` cannot distinguish the two cases, which the AI-written helper did not model. Recommended minimal fix for the UI follow-up: look up `StopOrderTriggered` for the order id (the app already reads `StopOrderPlaced` logs for stops) and show "Cancelled before activation" when none exists, plus a regression test that cancels a pending stop. Not recorded as a numbered audit issue: it is a label defect with no safety, fund or contract impact; it is recorded here and in the audit report as a limitation and lesson, and the owner can promote it to an issue entry if the course format requires.

