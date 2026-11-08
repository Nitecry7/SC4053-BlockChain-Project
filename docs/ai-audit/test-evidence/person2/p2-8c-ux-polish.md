# P2-8C: frontend usability, visual consistency and UX polish (2026-11-08)

Model: Claude Sonnet 5.5 (Medium effort requested; the session setting could not be read). Scope: `web/` display strings, two small UI primitives, My Orders and its stop-history wording, tests and documentation. No Solidity, ABI, deployment record, interface, `PRODUCT.md`, `DESIGN.md`, `CLAUDE*.md`, Person 1 file or report figure was changed.

## 1. Environment and isolation
- Branch `faheem`, HEAD `9e879e5` equal to `origin/faheem`, tree clean at the start.
- Existing environments were **not** mutated: main Anvil 8545 (head 16), Bonus 2 scratch 8546 (head 78), Bonus 3 scratch 8547 (head 35, account 5 nonce 5), and the apps on 3000, 3100 and 3101 (pids 146310, 264076, 339540) kept running unchanged.
- Everything mutable ran on a **new** pair: Anvil **8548** (started on a verified-free port, contracts deployed with `Deploy.s.sol` and the Foundry output redirected into `/tmp/sc4053-scratch-8c`, no export) and a scratch copy of `web/` built with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8548` served on **3102**. The scratch Anvil was restarted and redeployed once, because a mistake of mine (running the unit tests with the chain variables exported, so the gated real-chain suites ran in parallel) left it dirty; that was my own chain.
- Protected files: `abis.ts`, `deployments.ts`, `next-env.d.ts` and the hash of `contracts/broadcast` were compared before and after (see section 9).

## 2. The user-observed problems, and what was found
| Observation | Finding |
|---|---|
| Inconsistent capitalisation ("Market board", "Order book", "Pending trigger", "Partly filled") | Confirmed: panel titles, column headers, stat labels, status labels and nav entries used sentence case. Fixed by convention (section 3) |
| Beginners lack explanations of the concepts | No information affordance existed (the only tooltip was an opaque, hover-only nav tooltip). Added (section 4) |
| Statuses are hard to tell apart | Every status was the same grey outline. Added semantic badges (section 5) |
| Trigger Price not prominent in My Orders | Confirmed: the trigger appeared only in a small sentence under the status. Now in its own Price cell for the whole life of the order (section 6) |
| "Activated" shown for a cancelled stop | **Confirmed defect**, issue `p2-017` (section 7) |
| Keeper appeared to show the owner's orders | The owner established the cause (the app was still connected to the owner). Investigated (section 8): not a vulnerability |
| Shared Approve button about 4.4:1 | Not reproduced at rest (5.23:1 measured); reproduced as borderline **while hovered** (4.51:1, within measuring error of the earlier reading). Hover lift reduced; 4.80:1 after (section 10) |

## 3. Title Case and terminology
- Convention (`lib/labels.ts`): Title Case for page titles, panel headings, segment labels, table column headers, stat labels, status badges and short field labels; sentence case for buttons, help text, empty states, results and warnings. Small words stay lower case; hyphenated terms capitalise both parts. No CSS `capitalize`.
- Changed (examples): Market Board, Market Depth, Order Book, My Orders, Quick Actions, Create & List, Create Token, List Market, All Markets, All Tokens, All Token Holdings, Token Details, Your New Token/Market, Choose the Pair, How Tokens Are Issued, How Markets Are Listed, How Listing Works, What You Are Issuing, Decoded Events, Review Before You Sign, Limit Order, Stop-Limit Order, Trigger Stops, Match Orders; column headers (Locked Collateral, Total Supply, Your Wallet, Market Contract, Last Trade, Best Bid, Best Ask, Base Volume, Maker → Taker); the Row labels of three words or fewer (Trigger Price, Limit Price, Lot Size, Gas Estimate, Will Be Sent, ...); status labels Pending Trigger and Partially Filled.
- Kept (decision): **"Resting"** for the engine's `Open` status, because it tells a beginner the order sits on the book; the tip explains it. Buttons stay sentence case ("Review stop-limit order", "Create token").
- Enforcement: `lib/labels.test.ts` scans the source for literal panel/page titles, `<th>` text, short Row labels, nav labels, page metadata, status labels and glossary terms and asserts Title Case (a deliberate lower-casing of "Market Board" and "Total Supply" turned it red, restored after), and that "stop limit" is never spelled unhyphenated. The browser suite reads every page's headings and column headers from the DOM (7 pages) and asserts Title Case and `text-transform: none`.

## 4. Information tips
`components/ui/info-tip.tsx` (base-ui Popover, glass styling, portal with collision handling), copy in `lib/glossary.ts` (22 entries, each verified against `OrderBook.sol`/SPEC wording and pinned by `lib/glossary.test.ts`: eligibility is not activation is not execution; sell stop at or below, buy stop at or above; the caller of Trigger Stops pays gas and needs no tokens; Match Orders needs a crossed book and the 10-fill limit; escrow at the limit price; a pending stop is not on the book).
- Placed: Panel headings (Limit Order / Stop-Limit Order, Market Board, Market Depth, Order Book, Match Orders, Trigger Stops), field labels (Trigger Price, Limit Price), review rows (Escrow, Gas Estimate, Sending From), the approval step (ERC20 Allowance), the depth panel (Last Trade Price, Spread, Crossed Book) and My Orders (Pending Trigger, Eligible Now, Connected Account). Not placed: Buy, Sell, Amount.
- Behaviour tested in a real browser (mock wallet): hover opens and leaving closes; the popup is labelled by its title and described by the glossary text; keyboard Tab reaches the button, focus opens it with a visible focus ring, Escape closes, Enter reopens, Tab away closes; a click outside closes; on a 375 px touch device a tap opens and a tap outside closes, the popup stays inside the viewport for every tip tested; under `prefers-reduced-motion: reduce` the transition is shortened to ~0.
- Not done: a link to the Beginner's Guide (the app does not serve the repository; a plain-text pointer is used instead).

## 5. Status badges
`components/data/order-status-badge.tsx` and `statusTone`: Pending Trigger amber (`--warn`), Resting azure, Partially Filled violet, Filled green, Cancelled grey; each has an icon and its text. "Eligible Now" is a separate dashed chip beside the badge, never a status value (browser test: an eligible stop's badge still reads Pending Trigger and `getOrder.status` is still 4). The same badge is used in My Orders and in the order, stop, cancel, match and trigger result cards. The buy and sell chips are unchanged; they are borderless, the status ovals are bordered and carry icons, so the green Filled badge and the green Buy chip are not confused. Failed transactions keep the existing red alert styling of the transaction page.
Measured contrast (rendered pixels, most common colour as background, farthest colour as text): Resting 5.63:1, Partially Filled 5.94:1, Filled 7.69:1, Cancelled 8.01:1, Pending Trigger 7.64:1, Eligible Now 7.49:1.

## 6. My Orders layout
Type tag under the order number (Limit Order / Stop-Limit Order). The "Limit price" column became **Price**: a limit order shows only `Limit Price`, a stop shows `Trigger Price` and `Limit Price`, in every state (pending, eligible, activated, partly filled, cancelled): the values come from `getOrder`, so no log scan is needed to show them. At widths below `lg` the existing two-column grid shows the same labelled lines. A first screenshot showed the Price and Amount columns running together; left padding was added to the numeric columns and the two price lines were laid out label-left, value-right. Bounded data loading, the 50-order cap, ordering and per-account keys are unchanged.

## 7. The cancelled-stop wording defect (issue p2-017)
- Original text on order #3: *"Activated: it is now an ordinary order at its limit price (cancelled)."* Captured read-only from the pre-fix build on 3101 (`p2-8c-screens/my-orders-cancelled-stop-BEFORE.jpg`).
- On-chain (read-only, 8547): `StopOrderPlaced` block 21, `OrderCancelled` block 22 with a 17 SGDx refund, **no `StopOrderTriggered` for #3**; the only one in the chain's history is block 35 for #4.
- Root cause and fix: see `issues/p2-017-cancelled-stop-labelled-activated.md` (status was used to infer a past activation). `lib/stop-history.ts`: `classifyStop` (kinds: pending-waiting, pending-eligible, pending-no-price, activated-resting/partly-filled/filled, cancelled-before-activation, activated-then-cancelled, engine-cancelled-at-activation, activated-cancelled-unknown-actor, cancelled-unknown, history-unread, history-inconsistent), `readStopHistory` (one `eth_getLogs`, both events, indexed order ids as topic 1, from the stops' placement block; never throws; a malformed answer or more than 100 ids is "unavailable"), `useStopHistory` (separate query, so the list never waits for it).
- **Request economy and failure behaviour (owner requirement):** (a) none for pending stops; (b) exactly one request for a stable set, measured in the browser: 1 request after load, **0 more over 4 mined blocks**, **0** when switching to an account whose stops are all pending, **exactly +1** when a stop's status changes; (c) the query has the `static` scope so the per-block refresh skips it, no refetch on focus or reconnect, one retry after 2 s at most; (d) an RPC error is thrown inside the query (retried once, then the rows show neutral text), never cached as an empty history; (e) a malformed response is "unavailable"; (f) the unit test counts calls (one request, no hidden retry loop, zero requests for an empty list, a refusal above 100 ids); (g) the browser test makes the history request fail and checks the neutral wording, an intact list, and recovery on the next mount. Not a chain-wide scan: a topic-filtered read bounded from the earliest placement block of the listed stops, the same pattern the page already uses for `Trade` logs.
- One flake of my own test, recorded: the first version of the economy test counted requests from the previous test's page and from the mobile page, which stay open and keep reading history while the chain is cleaned up; it failed with "saw 2". The product behaviour was correct; the test now closes the old page and counts only the desktop page's requests (stable over repeated runs).

## 8. Account switching
- Investigation: queries are keyed by account (`my-orders`, `stop-history`), so another wallet's orders are never shown for the current one; an in-flight review, approval, cancel, match or trigger is ended by the existing flow when the account or network changes (`use-tx-flow`, covered by older suites). The browser cannot see an account selected in MetaMask that was never connected to the site (no `accountsChanged` event is sent for it), which is exactly what the owner met; the app cannot detect it, only explain it.
- Changes (minimal): "Orders for 0x7099…79C8" and a "Connected Account" tip in the My Orders header; a "Sending From" row in the order, cancel, match and trigger reviews. No vulnerability was invented.
- Browser test: the chip shows the connected account; Bob's order is absent for Alice; a review names Alice; after the wallet switches to Bob the chip changes, Bob's order appears, Alice's disappears and the open review does not carry over.

## 9. Test results (actual, this session; baseline from P2-8B.4 in brackets)
| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .` | clean |
| `npm test` (no chain variables) | **604 passed, 76 skipped** [576, 75]; new: `stop-history` 15, `glossary` 6, `labels` 6, status badge 1 |
| Real chain, each file alone, scratch 8548 | cancel 11, creation 21, hardening 9, match 5, stop 12 (new: 1), trading 18 = **76 passed** [75]; the chain head was back at 11 after each file |
| Browser, mock wallet, scratch 8548/3102 | trade 13, create 14, dashboard 14, hardening 9, liveness 11, cancel 13, match 15, stop 17, **ux 19 (new)** = **125 passed** [106] |
| Exporter | 21 passed |
| `next build` | succeeded (scratch copy) |
| `forge test` | not run: no Solidity changed (335 passed in P2-8B.4) |
| `git diff --check` | clean |
Strings quoted by the older suites changed with the labels; each failure was a test asserting the old text, was diagnosed, and the assertion was updated (`Limit price` field lookups now use `#order-price` because the information button's name "About Limit Price" also matches a label search; `Pending Trigger`, `Partially Filled`, `Stop-Limit Order`, `Settles at Most`, `Gas Estimate`, the new My Orders test ids). No assertion was loosened.

## 10. Accessibility and layout
- axe-core 4.14.0 (transient): **0 violations** in My Orders with stops (pending, eligible, cancelled), the stop-limit ticket review, and the five other pages, at 1586 px and 375 px. `color-contrast` is only "needs review" for axe, so contrast was measured from pixels (section 5).
- No horizontal overflow on `/`, `/markets`, `/tokens`, `/trade`, `/create-token`, `/list-market` at 375, 768 and 1280 px.
- No console errors, page errors or HTTP errors in the whole suite.
- Primary button: 5.23:1 at rest, 4.51:1 hovered (`hover:brightness-110`), 4.80:1 after reducing the lift to `105` (nine files share the class). The earlier 4.4:1 reading is consistent with the hover state; at rest it was not reproduced.
- Not claimed: axe does not prove accessibility; no screen reader was run, only accessible names and descriptions were checked; no real touch hardware was used (emulated touch at 375 px).

## 11. Screenshots (mock wallet or read-only renders, **not** MetaMask)
`p2-8c-screens/`: `my-orders-cancelled-stop-BEFORE.jpg` (pre-fix build, read-only, the real defect), `my-orders-cancelled-before-activation-after.jpg`, `my-orders-pending-after.jpg`, `my-orders-eligible-after.jpg`, `my-orders-badges-after.jpg`, `my-orders-activated-after.jpg`, `dashboard-after.jpg`, `trade-stop-review-desktop-after.jpg`, `trade-stop-review-mobile-after.jpg`, and `results-ux.json` (the suite's results and measured contrasts). Full-page captures show the fixed header in the middle of the page: that is how a full-page screenshot of a sticky header renders, not a layout fault.

## 12. Limitations and follow-up
- The fix and the new wording were verified with a mock wallet and a scratch chain; they have **not** been seen in real MetaMask.
- The engine's auto-cancel at activation is verified by the real-chain suite and the unit tests, not by the browser suite (it needs a 101-order book).
- The information tips were checked in Chromium only (hover, keyboard, emulated touch).
- "Resting" and Title Case Row labels longer than three words were left as they are (sentence-like labels).
- Proposed `PRODUCT.md`/`DESIGN.md` wording is in the completion report, not applied.

## 13. Tools used
`vitest`, `tsc`, `eslint`, `next build`, `forge`/`anvil`/`cast`, `node` with viem, `playwright-core` (mock wallet), `pngjs` (pixel contrast), axe-core 4.14.0 (transient). Context7, the shadcn MCP and the solidity-security skill were not invoked (no new library, no new shadcn component, no Solidity change). No independent Opus review was run (reserved for the owner).
