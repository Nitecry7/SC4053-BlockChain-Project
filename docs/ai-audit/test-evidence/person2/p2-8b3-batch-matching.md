# P2-8B.3: Bonus 2, multi-party batch matching in the front end

**Date:** 2026-11-08. **Model:** Sonnet 5.5 (Medium requested; the session effort setting could not be read). **Scope:** the Match orders workflow only. Bonus 3 (stop-limit placement and triggering) was not touched. No Solidity, interface, generated ABI or deployment record was changed.

Four kinds of evidence are kept apart here, as elsewhere in this repository:
1. **Contract implementation** (Person 1's engine): `matchOrders(uint256 maxMatches)` is implemented and its own tests passed (recorded in [`p2-8b01-preflight.md`](p2-8b01-preflight.md) and `docs/ENGINE_HANDOFF.md`). Not re-proven here; `forge test` was run once as a regression check (section 3).
2. **New front-end integration** (this phase): the Match orders panel, the crossed-book detection, the runner and the receipt decoding (section 2).
3. **Automated evidence** (this phase): unit tests with a fake chain, a real-chain suite against the deployed contracts on a scratch Anvil, and a browser suite with a **mock wallet**.
4. **Manual MetaMask verification: the happy path only, reported by the owner (section 9).** Every *browser-suite* result in sections 3 to 7 used an injected stand-in wallet that forwards to Anvil's unlocked dev accounts. That is not MetaMask. The owner's own MetaMask run (2026-11-08, after those sections were written) is kept separate in section 9; its rejection and account-switch cases were not run. Procedure: `docs/TESTING.md`, Test 13.

## 1. Environment and isolation

- **Git preflight:** branch `faheem`, HEAD `efb231e` ("fix(web,docs): finalize cancellation UX and MetaMask evidence"), working tree clean at the start, no newer remote commits (`git fetch --dry-run` printed nothing). No pull, merge, reset, clean, checkout, stage or commit.
- **Engine and ABI:** `OrderBook.sol` `matchOrders` read directly (`OrderBook.sol:103-119`: reverts `InvalidMaxCount` unless `1 <= maxMatches <= MAX_MATCHES_PER_TX`; loops while both heads exist and `bid.price >= ask.price`; the lower `bookSeq` is the maker; returns the fills made). `CONTRACT_INTERFACE.md` and the committed `abis.ts` agree (no change needed). The owner's chain on 8545 was read-only (chain id 31337, head 16, `marketCount` 1); nothing was sent to it. Its Anvil (pid 151675) and Next (pid 146310, HTTP 200) were not touched.
- **Scratch:** Anvil 8546 (pid 171544, `anvil --port 8546`, verified by its command line before use; deploy state, head 13 before and after every suite) and a scratch Next on 3100 rebuilt from a **copy** of `web/` in the session scratchpad with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546` (the process on 3100 was killed only after its working directory was verified to be that copy). No Foundry output was redirected because no deployment was made.
- **State was checked, not assumed (section 12 of the brief).** The real-chain suite and the browser suite both verify at start that no test account (including the keeper) has an allowance, that no account has an order, that the book is empty, that the keeper holds no NTU or SGDx, that `MAX_MATCHES_PER_TX` is 10 and that `matchOrders` exists in the deployed code. After **every** test, including one that threw, the real-chain suite verifies the snapshot revert by head block, allowances, order ids and book heads, not by balances. The browser suite's `finally` clears the book between cases (match what crosses, then cancel what rests) and the whole run is reverted to its snapshot.

## 2. What was built, and why

| File | Change |
|---|---|
| `web/lib/crossed-book.ts` (new) | `crossedBook(bestBid, bestAsk)`: crossed means both ids non-zero and `bid.price >= ask.price` (equal prices cross, as in the engine's loop). `validateMatchCount`, `matchCountToSend` (the market's own limit), `bookSpread` |
| `web/lib/match-runner.ts` (new) | `runMatch`: re-read best bid and ask, refuse if not crossed, simulate `matchOrders(10)` from the caller (refuse and spend no gas if it returns 0), one wallet request, bounded receipt wait (reusing `waitBounded`), decode, reconcile. `matchDeps` (extra reads `readBestPrices` and `simulateMatches` beside the shared `viemDeps`), `previewMatch` for the read-only review |
| `web/lib/receipt.ts` | `decodeMatchReceipt`: the market's own `Trade` logs and what the market paid out per token and per recipient. Zero `Trade` logs is a no-op, never invented fills |
| `web/hooks/use-match-flow.ts` (new) | `useTxFlow` bound to `matchOrders` (same one-request-at-a-time, account/network/market guard and post-transaction re-read as the ticket and Cancel) and `useMatchPreview` (read-only look when the review opens) |
| `web/components/trade/match-panel.tsx` (new), `trade-view.tsx` | The **Match orders** panel under the depth and order-book panels: crossed notice, review, lifecycle notices, result with a fills table |
| `web/lib/errors.ts`, `wallet-prompt.ts` | Plain text for `InvalidMaxCount`; a `match` request kind |
| `web/lib/order-runner.ts` | One word: `ERROR_DEFINITIONS` is now exported so the match simulation decodes the same custom errors |
| `web/components/dashboard/market-panels.tsx` | **Bug fix (P2-016):** a crossed book made the spread display throw; it now says "Crossed" (via `bookSpread`) |
| `web/components/trade/order-result.tsx`, `order-ticket.tsx`, `web/lib/order-plan.ts` | The notices that said `matchOrders` was "not available yet" now point to the Match orders panel; a stale comment fixed |
| `web/lib/order-plan.test.ts`, `trading.integration.test.ts`, `tx-errors.test.ts` | **Wording only:** three test names that called `matchOrders` or `cancelOrder` a stub (listed as stale in `ENGINE_HANDOFF.md`). Assertions untouched |
| `web/package.json`, `web/e2e/match.e2e.mjs` (new) | `npm run e2e:match` |

### Decisions
- **Where:** directly under the Market depth and Order book panels, because it acts on what they show and a trader looking at a crossed book sees it next to the problem. It renders nothing when the book is not crossed (no misleading button) and while a flow or result is on screen.
- **One definition of "crossed" for the live book** (`crossedBook`), used by the panel and by the spread display. `order-plan.ts` keeps its separate pre-placement estimate (a prediction for a different moment); no competing detection was added.
- **The count sent is the market's own `MAX_MATCHES_PER_TX`** (10). A smaller count would only force more transactions, and the engine stops by itself when the book no longer crosses. `InvalidMaxCount` therefore should not occur in the UI; it still has a plain message.
- **Review before the wallet:** opening the review runs a read-only simulation and gas estimate; the wallet is asked only after **Confirm match**, which re-reads the book and re-simulates. The simulated count is labelled an estimate and never promised as the result.
- **No loop, no keeper:** a result that is still crossed offers **Review another match**; each transaction is one click.
- **A review belongs to the pair of orders at the top of the book it was opened for;** if that pair changes (another match, a cancel, a new top order) the review closes.

## 3. Results

| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .` | clean |
| `npm test` (unit) | **497 passed, 64 skipped** (before this phase: 447 and 59; the 5 new skipped tests are the real-chain suite) |
| New unit tests | `crossed-book.test.ts` 13, `match-runner.test.ts` 32, `receipt.test.ts` +3, `errors.test.ts` +1, `wallet-prompt.test.ts` +1 |
| Real chain (scratch 8546), all suites, one at a time | **64 passed** (59 before + 5 new in `match.integration.test.ts`) |
| Browser (mock wallet) | `e2e` 13, `e2e:create` 14, `e2e:dashboard` 14, `e2e:hardening` 9, `e2e:liveness` 11, `e2e:cancel` 13, **`e2e:match` 15** (new): **89 passed, 0 failed**, each suite run alone, in sequence, on the same scratch chain (the final regression ran after the last code change; head 15 before, 17 after only because the existing liveness suite mines blocks on purpose; state re-verified by each suite's own guard). Outages are simulated by blocking browser requests |
| `forge test` | **335 passed, 0 failed** (27 suites, 455 s), run once as a regression check with `FOUNDRY_OUT` and `FOUNDRY_CACHE_PATH` redirected into the scratchpad so `contracts/out` and `contracts/cache` were not rewritten. No Solidity changed in this phase; the deep invariant profile was not run |
| Exporter tests | 21 passed (`node --test contracts/script/export-web.test.mjs`); `abis.ts`, `deployments.ts` and `next-env.d.ts` sha256-identical before and after |
| axe-core 4.14.0 on the new states (desktop 1586 px and mobile 375 px) | **0 violations** in six states (crossed notice, review open, result; at 1586 px and 375 px). `color-contrast` is reported only as "needs review" on the glass surfaces, so no contrast claim is made. The **first** axe run found 1 moderate violation (`landmark-unique`, plus `duplicate-id-aria` as incomplete) in the crossed notice: my inner heading reused the id `match-title` that the shared `Panel` already gives its own heading. Fixed by renaming it; a browser assertion that no element id appears twice was added, and restoring the duplicate made that case fail |

### What the real-chain suite checks (`lib/match.integration.test.ts`)
- **The engine hand-off's four-trader scenario with the real ABI:** Alice and Carol alternate 22 asks of 1 NTU at 2; Bob bids 11 at 3 and the deployer bids 11 at 2.5; each bid fills 10 and rests 1 NTU crossed. A **keeper (Anvil account 4, holding no NTU and no SGDx)** runs the same `runMatch` the UI runs. One transaction settles four traders: makers are the two older asks (orders 21 and 22 of the sequence), takers are Bob's and the deployer's remainders, both at price 2. The suite compares the result with an **independent decode** of the same logs (viem `parseEventLogs`) and asserts the exact token movements: Alice +2 SGDx, Carol +2 SGDx, Bob +1 NTU and +1 SGDx (price improvement), the deployer +1 NTU and +0.5 SGDx, the **keeper unchanged** in NTU and SGDx (its ETH fell by gas), the market −2 NTU and −5.5 SGDx and holding **0 of each** afterwards, the four orders Filled, the book empty. A second call is refused before the wallet ("The book is no longer crossed") and the contract simulates 0.
- **Repeated matching:** one bid of 22 against 22 asks leaves 12 crossed; the first call settles exactly 10 and reports the book still crossed, the second settles 2.
- **`matchOrders(0)` and `matchOrders(11)`** revert `InvalidMaxCount` and are shown as "Invalid match count".
- **A real no-op receipt:** a `matchOrders` transaction on an uncrossed book mines with zero `Trade` logs and decodes to no fills.
- **Permissionless:** a funded trader (Carol) can call it, and a seller whose ask was settled by someone else is paid exactly what the trade says.

### What the browser suite checks (`e2e/match.e2e.mjs`, mock wallet, 15 cases)
No panel on an empty or one-sided book, with or without a wallet; the disconnected view (explanation, disabled action); the review (estimate, gas, no approval, **nothing sent to the wallet** by opening it or pressing "Not now", opened with the keyboard, accessible names equal to the visible text); one wallet request from the keeper with calldata `matchOrders(10)`, no success claimed while the wallet is pending, result from the receipt and exact on-chain movements; the four-trader scenario with a table of the real `Trade` events; **repeated matching** (10 fills, still crossed, nothing sent by itself in 4 seconds, then 2); wallet rejection then Try again; a book settled by someone else while the review is open (panel disappears, wallet never asked); an account switch while the wallet request is open; a pending speed-up followed to its new hash and settled once; a wallet-cancelled request; an RPC outage (the whole terminal is replaced by "Node unreachable", the action returns after verified recovery and works); a chain reset while the review is open; mobile 375 px with no overflow in the notice, review or result; no unexpected console errors.

### Test history (nothing hidden)
1. **`crossed-book`, `receipt` and `match-runner` unit tests:** written with the code. One test of a deliberately corrupted receipt (a seller's payment removed) **failed against my first version** of the reconciliation, which compared only the *total* quote paid out; price-improvement refunds can mask a missing payment. The check was strengthened (each pure buyer's base and each pure seller's quote must equal their own trades), not the test loosened.
2. **Real-chain suite, first run: 3 passed, 2 failed.** Both failures were in my new `afterEach` that proves the revert: it reported the head block as 60 when the snapshot was 13. The chain was fine (`cast block-number` read 13 before and after). Root cause: viem's `getBlockNumber` is cached for the polling interval, so the check read a stale value. The check now reads `eth_blockNumber` straight from the node; the second run passed 5 of 5 and the node head was 13 before and after. A test-harness mistake of mine, not a product or engine defect.
3. **Browser suite, first run: 1 passed, 14 failed.** Real defect: the page crashed on a crossed book (`splitAmount expects an unsigned value`); see [issue P2-016](../issues/p2-016-crossed-book-crashed-the-spread-display.md). Fixed, scratch build refreshed.
4. **Second run: 4 passed, 11 failed.** My test design: each case's `finally` clears the book, but two cases assumed the previous case's book still existed, and cases that reload the page forgot the mock wallet's connection. Fixed in the suite (each case seeds its own book; `openTrade()` reconnects).
5. **Third run: 14 passed, 1 failed.** My assertion matched "at most 10 fills" in text where the label and value are separate cells ("Settles at most10 fills" once whitespace is collapsed). The assertion was corrected to the rendered text.
6. **Fourth run: 15 passed, 0 failed.** Two more changes followed: the order status line was made less redundant ("Filled" instead of "Filled (all filled)"), and the axe finding below was fixed. The full regression in section 3 was then run on the final code.
   - **axe, first run (my own defect):** a duplicate element id (`match-title`) made two regions share an accessible name. Fixed, with a regression assertion in the suite.
7. **Five deliberate breakages** of the runner, the decoder and the detection each turned at least one test red, and the files were restored byte-identical (sha256 verified): skipping the crossed re-read (1 test red), ignoring the base paid out (1), treating equal prices as uncrossed (2), counting another market's trades (2), skipping the zero-fills guard (1).

## 4. Security and transaction-correctness checks
- Nothing is signed outside the wallet; the keeper account's key is never seen (Anvil's accounts are unlocked and the mock wallet forwards to them).
- No approval step exists and the suite asserts the wallet received exactly one request, to the market, with calldata `matchOrders(10)`.
- No uncontrolled loop: a still-crossed result only offers a button; the browser suite waits 4 seconds and asserts nothing was sent.
- Receipts are attributed to the requested market (a `Trade` from another contract or market is ignored; unit-tested) and the reconciliation is by order id and token transfers, not by the simulation. A disagreement is shown in an alert instead of a clean success.
- Matching is refused while the chain is not verified (the P2-8A.2 gate: during an outage the whole terminal is replaced), when the wallet is on the wrong network, and when the book is no longer crossed or the simulation returns 0.
- The accepted engine limitation in issue 007 (a dust front-run through the fill cap) is not changed or claimed solved by the UI.

## 5. Limitations and what is not verified
- **MetaMask:** sections 3 to 5 are mock-wallet and real-chain evidence only. The owner's later MetaMask happy path is in section 9; the MetaMask rejection and account-switch cases, an outage and a reset are still not run manually.
- **A crossed book needs more than ten resting orders to create** (the cap), so the manual procedure is long (`TESTING.md`, Test 13).
- **The panel acts on one market at a time**, the one the page shows. A crossed book on another market is not announced elsewhere.
- **The number of crossed pairs is not shown** before sending: the contract exposes no count, and a client count would be an estimate; the review shows the contract's own simulated result, labelled an estimate.
- **A chain reset or outage in the middle of an in-flight matching transaction** is covered by unit tests; the browser suite covers an outage and a reset while the review is open, not during the receipt wait.
- **Contrast** is not verified (axe reports colour contrast as "needs review" on the glass surfaces).
- `PRODUCT.md` and `DESIGN.md` were not edited; proposed wording is in the completion report.

## 6. Manual MetaMask procedure (happy path since performed, section 9)
`docs/TESTING.md`, Test 13: the `cast` setup of the four-trader crossed book on the owner's disposable chain, the keeper account (Anvil account 4, no tokens), the expected balances and events, and the cases still to run by hand. Screenshots and transaction hashes are still to be supplied.

## 7. Tools used
`vitest`, `tsc`, `eslint`, `next build`, `forge`/`anvil`/`cast`, `node` with viem and `playwright-core` (mock wallet), axe-core 4.14.0 (temporary, loaded from a CDN, not a dependency). `solidity-security`, Context7 and the shadcn MCP were not invoked (no Solidity change, no new library, no new UI component). The independent Opus review was not run (reserved for after Bonus 3).

## 8. Follow-up, 2026-11-08: manual MetaMask preparation and the approved PRODUCT.md and DESIGN.md corrections
- **Owner approval:** the owner approved the narrow `PRODUCT.md` and `DESIGN.md` corrections proposed in the completion report. Applied: `PRODUCT.md` (the bonus-features bullet, a new "Since P2-8B.3" paragraph, the "cannot yet" paragraph, the engine-status line and the manual-MetaMask line) and `DESIGN.md` (the "don't make an unbuilt control look functional" rule and the depth-chart line: a crossed book's spread reads "Crossed"). Nothing else in those files changed.
- **`scripts/seed-crossed-book.sh` (new):** builds the engine hand-off's crossed book on a scratch chain with Anvil's unlocked accounts (no key used or printed), `status` and `verify-after` are read-only, and it **never sends `matchOrders`** (it only simulates it with `eth_call`). It refuses port 8545, a non-local host and any chain id other than 31337; it checks the chain (code, empty book, zero allowances, no stuck transactions, keeper holding nothing, balances sufficient, `matchOrders` simulating 0) and changes nothing if any check fails; it verifies the result independently (crossed heads, two resting buys and two resting sells, each buy filled 10 of 11, 20 `Trade` events and none from matching, a simulated 2 fills, the keeper empty, no leftover allowance). It reads the addresses from `deployments.ts` and writes only a record of public balances outside the repository.
- **What was run on the scratch chain (8546, pid 171544):**
  1. `status` with `--rpc-url` 8545: **refused, nothing queried or sent.** `status` on 8546: head 17, empty book, keeper 0/0.
  2. First `seed`: all checks passed (orders #21 to #24).
  3. A second `seed` on the crossed chain: **refused**, nothing changed (head unchanged).
  4. `verify-after` before any match: failed as it should. In a first test **inside an `evm_snapshot` (then reverted)** the AI sent one `matchOrders` from the keeper with `cast` to test `verify-after`. **That exposed two bugs in the script, both fixed:** the saved balances were from before the seed, not just before the match (so every change read as 10 times too large), and the formatting helper passed negative numbers to `node` as options. The four resting orders of that first seed were then cancelled by their owners, and the corrected script was **re-run from scratch**: all seed checks passed again (orders #45 to #48; the order ids are not fixed and the documentation says so).
  5. `verify-after` after a keeper `matchOrders` inside a second snapshot (reverted afterwards): **every check passed**: account 1 +2 SGDx, account 3 +2 SGDx, account 2 +1 NTU +1 SGDx, account 0 +1 NTU +0.5 SGDx, keeper unchanged, market −2 NTU −5.5 SGDx, orders #45 to #48 Filled, 22 `Trade` events, the last two from a transaction sent by the keeper to the market calling `matchOrders`.
  6. After the revert the chain is crossed again, the keeper's nonce is 0, and the scratch app on 3100 shows the Match orders notice with a disabled Review button and a **Crossed** spread (checked in a headless browser without a wallet).
- **State left for the owner:** scratch Anvil 8546 seeded and crossed (head 77, orders #45 to #48 resting, keeper never used by MetaMask); scratch app on http://localhost:3100 (pid 264076) built from the final code. The main chain (8545, pid 151675, head 16) and its app on 3000 (pid 146310) were not touched; no deployment, ABI or protected file was written (sha256 checked).
- **Honest limits:** the two reverted snapshots contained AI-sent `matchOrders` transactions on the scratch chain, so the keeper's nonce was briefly 1 and is 0 again; MetaMask has not seen this account. The expected MetaMask wording and gas figure are from the mock-wallet run, not from MetaMask. **No MetaMask testing of matching has been performed.**

*Update:* the statements "No MetaMask testing of matching has been performed" and "The expected MetaMask wording and gas figure are from the mock-wallet run" in this section were true when written. They are superseded by section 9 for the happy path.

## 9. Manual MetaMask verification of Bonus 2 (owner-run, 2026-11-08)
Three kinds of statement are kept apart: **owner-reported** (what the owner saw in MetaMask and the app), **independently verified** (re-read by the AI from scratch Anvil 8546 with read-only calls after the owner's run, nothing sent, reset or redeployed) and **not performed**.

### 9.1 Owner-reported
The owner connected the **Tester Keeper** account `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` (Anvil account 4, holding no NTU or SGDx) through MetaMask to the scratch app at `http://localhost:3100`, with MetaMask's RPC set to `127.0.0.1:8546`. In **Review match** the owner saw: calldata `matchOrders(10)`, a simulated result of about 2 fills, a gas estimate of **277124**, and no ERC20 approval required. The owner confirmed the transaction in MetaMask. The app then reported: confirmed in **block 78**; **2 actual fills**; order #45 matched with #47 (1 NTU at 2 SGDx) and #46 matched with #48 (1 NTU at 2 SGDx); total settled 2 NTU and 4 SGDx; price improvement returned to buyers 1.5 SGDx; orders #45, #46, #47 and #48 all Filled; the book no longer crossed; actual gas used **224189**. The owner then ran `bash scripts/seed-crossed-book.sh verify-after` and reported that every check passed.

### 9.2 Independently verified by the AI (read-only, 8546)
| Item | What the chain says |
|---|---|
| Transaction hash | `0x52162ab7d8b916a6aba588cbc940e30a2cebfe2e620f597cf63c072a111ec779` |
| Block | 78, hash `0x5cd96dbefdaf3674b31ebcd2f7d2eebe7457c96a286f9442802a213bde3d1fd5`, timestamp 1794097251 (2026-11-08 00:20:51 UTC); the only transaction in the block |
| Sender and nonce | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` (the keeper), nonce 0; the keeper's latest and pending nonce are both 1 now |
| Recipient and calldata | the market `0xCafac3dD18aC6c6e92c921884f9E4176737C052c`; input `0x5a449d1e000000000000000000000000000000000000000000000000000000000000000a` = selector of `matchOrders(uint256)` with argument 10 |
| Receipt | status 1 (success), type 2, gas used **224189**, effective gas price 1,000,044,099 wei |
| Logs (8) | two market `Trade` events (topic `0x09a78699…`), and six ERC20 `Transfer` events |
| Trade 1 | maker order 45 (`0x7099…79C8`, account 1), taker order 47 (`0x3C44…93BC`, account 2): price 2e18, base 1e18, quote 2e18 |
| Trade 2 | maker order 46 (`0x90F7…b906`, account 3), taker order 48 (`0xf39F…2266`, account 0): price 2e18, base 1e18, quote 2e18 |
| Transfers from the market | NTU 1 to account 2, SGDx 2 to account 1, SGDx 1 to account 2 (price improvement); NTU 1 to account 0, SGDx 2 to account 3, SGDx 0.5 to account 0 (price improvement). Total 1.5 SGDx returned to buyers |
| Orders now | #45, #46, #47 and #48 each read status 2 (Filled) with filled equal to amount and nothing locked |
| Book | best bid and best ask are both 0 (empty); a `matchOrders(10)` simulation from the keeper returns 0 |
| Keeper's ETH | 10000 minus 0.000224198886510711, exactly 224189 gas times 1,000,044,099 wei: it paid gas and nothing else |
| `verify-after` re-run by the AI | **every check passed** (account 1 +2 SGDx, account 3 +2 SGDx, account 2 +1 NTU +1 SGDx, account 0 +1 NTU +0.5 SGDx, keeper unchanged, market −2 NTU −5.5 SGDx, 22 `Trade` events since the seed, the last two from a keeper-sent `matchOrders`) |

This agrees with what the owner reported, field by field, including the actual gas (224189, the same figure as the AI's mock-wallet snapshot run, as expected for the same transaction). The gas **estimate** of 277124 is the pre-send estimate the owner read in the review; it was not independently re-measured (an estimate is not a chain fact; the 224,189 actually used is).

### 9.3 What was and was not performed manually
- **Performed by the owner:** the connection, the review (calldata, simulated count, gas estimate, no approval), the single confirmation in MetaMask, the result screen, and `verify-after`. These correspond to `TESTING.md` Test 13 steps 13b, 13d and 13e.
- **Not performed (no owner report, no independent evidence):** 13a (the view without a wallet connected; the AI saw it in a headless browser only), **13c (a MetaMask rejection)**, 13f (the transaction page), **13g (an account switch while a request is open)**, 13h (a remainder that needs two calls), an RPC outage and a chain reset. These remain covered by the mock-wallet and real-chain suites only.
- **Screenshots** have not been supplied.

### 9.4 What this does and does not show
It shows that, with a real MetaMask, the Match orders flow sends exactly one transaction with the expected calldata, needs no approval, is confirmed by the chain and is reported by the app consistently with the receipt, and that a keeper holding no trading tokens settles orders of four traders. It does not show anything about the rejection, account-switch, outage or reset cases in MetaMask, nor about a different wallet or browser.

### 9.5 State after the owner's run
Scratch Anvil 8546 (pid 171544) at head 78; the book is empty; the scratch app on 3100 (pid 264076) is unchanged. Nothing was mutated, reset or redeployed by the AI during this verification. The owner's main chain (8545) and app (3000) were not touched.

