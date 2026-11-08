# Video script: SC4053 DEX demo (word for word)

Companion to [`VIDEO_PLAN.md`](VIDEO_PLAN.md), which has the setup, the recording instructions and the fallbacks.

**How we record: two Zoom calls.** In **Call 1** Person 2 shares the screen and performs every action in silence while Zoom records; Person 1 keeps the stopwatch. In **Call 2** one of us plays that silent recording through Zoom and both read the quoted lines over it while Zoom records again; that second recording is the video. The cue sheet [`VIDEO_CUE_SHEET.md`](VIDEO_CUE_SHEET.md) splits this file into the two calls: Part A has the actions with how long to hold each screen, and Part B has the lines with the on-screen cue that starts each one. This file keeps both together and adds the expected values and fallbacks. Read the quoted sentences aloud as written; the text outside the quotes is for the person who needs it.

**Requirements (NTULearn):** a short demo video of at most **10 minutes** and **300 MB**, named **`GroupName.mp4`**. It must start with a quick introduction to the architecture (Segments 1 and 2) and contain a detailed hands-on demo of the locally deployed solution (Segments 3 to 6), with a README that lets the markers reproduce it (`README.md`, "Reproduce the demo"). The silent recording of Call 1 aims at **9:00** and must not pass **9:30**, which keeps at least 30 seconds of safety under the limit; the voice-over adds only a second or two. The cue sheet maps each requirement of the brief (issuance, listing, limit orders, automatic matching with partial fills, Bonuses 1 to 3) to the segment that shows it. Nothing in this file says the video has been recorded.

**Rehearsed on chain (8 Nov).** Segments 3 to 6 were replayed with `cast` and the two helper scripts on a fresh scratch Anvil deployed exactly as in `VIDEO_PLAN.md` Step 2. Every balance, order number and status in the "Expected on screen" lines below matched, including order #27 and the Bonus 3 amounts. MetaMask and the app's screens were not part of that rehearsal.

**Placeholders.** `[Person 1's name]` and `[Person 2's name]` are for each speaker to say their own name; they are the only blanks.

## 1. Timing table

| # | Start | End | Segment | Speaker(s) | Words | Speaking seconds at 2.1 words/s (about) | Footage seconds (Call 1 target) |
|---|---|---|---|---|---|---|---|
| 1 | 0:00 | 0:35 | Introduction and motivation | P1 and P2 (P1 30, P2 38) | 68 | 32 | 35 |
| 2 | 0:35 | 1:20 | Architecture | P1 and P2 (P1 41, P2 48) | 89 | 42 | 45 |
| 3 | 1:20 | 2:26 | ERC20 issuance and market listing (live) | P1 and P2 (P1 18, P2 51) | 69 | 33 | 66 |
| 4 | 2:26 | 4:20 | Limit orders, escrow, partial fill, maker price and cancel (live) | P1 and P2 (P1 64, P2 87) | 151 | 72 | 114 |
| 5 | 4:20 | 5:29 | Bonus 2: batch matching by a keeper | P1 and P2 (P1 56, P2 24) | 80 | 38 | 69 |
| 6 | 5:29 | 6:59 | Bonus 3: stop-limit order, trigger and execution | P1 and P2 (P1 66, P2 72) | 138 | 66 | 90 |
| 7 | 6:59 | 7:51 | Solidity security, testing and audit evidence | P1 (P1 101, P2 0) | 101 | 48 | 52 |
| 8 | 7:51 | 8:37 | AI-assisted methodology and lessons | P1 and P2 (P1 49, P2 34) | 83 | 40 | 46 |
| 9 | 8:37 | 8:58 | Limitations and conclusion | P1 and P2 (P1 21, P2 17) | 38 | 18 | 21 |
| | 0:00 | 8:58 | **Total** | P1 446 (54%), P2 371 (45%) | **817** | 389 | 538 |

**How the time is used.** The start and end times are the Call 1 footage plan, the same as the cue sheet's checkpoints (Part A): about 8:58 in total, and never more than 9:30. The voice-over is spoken over that footage. The 817 words take about 6 minutes 29 seconds at a calm 2.1 words per second (126 words per minute, slower than conversation). Every hold in the cue sheet gives its line that time plus a two-second breath. The rest is clicks, MetaMask confirmations shown long enough to read, and account switches. Person 2 also performs every action, so the word split understates Person 2's share of the work.

**Counts are estimates, not measurements.** The words were counted by script from the quoted text; the seconds are the plan. The real timing is Call 1's.

**Handoff cues and "Person 2 does".** In Call 1 nobody speaks: Person 2 does the actions and holds each result on screen for the time given in the cue sheet. In Call 2 each speaker starts their line when the screen shows the cue. The handoff cues below describe that order.

**Conventions.** P1 = Person 1 (trading engine, security, audit). P2 = Person 2 (front end, factories, deployment, integration). Account names: Alice = Anvil account 1, Bob = account 2, Keeper = account 4 (holds no trading tokens). Numbers in the quotes are spelled as they are spoken.

## 2. The segments

### Segment 1: Introduction and motivation (0:00 to 0:35)

- **Show:** The app's Overview page at `http://localhost:3103`, Alice connected, the NTU / SGDx market visible.
- **Person 2 does:** Nothing to do. Make sure the header shows Alice's shortened address and the block number.
- **Expected on screen:** A glass dashboard with the market board, the balances (Alice holds 10,000 NTU and 10,000 SGDx) and no orders yet.

**Say:**

**P2:** "Hello, I'm [Person 2's name]. Most exchanges are custodial: they hold your keys, so one hack can take your funds. We built a decentralized exchange where your tokens stay in your own wallet until you place an order."

**P1:** "I'm [Person 1's name]. I wrote the on-chain trading engine. We'll run every core feature and all three bonuses live, then show how we tested it and how AI helped."

- **Handoff cue:** P1 finishes with "…how AI helped." P2 immediately opens the Figure 3 tab.
- **If it does not work:** If the page does not load, pause the Call 1 recording, fix it, and resume on the Overview page. Nothing about it is said in the voice-over.

### Segment 2: Architecture (0:35 to 1:20)

- **Show:** `docs/report/diagrams/03-system-architecture.png` (Figure 3 of the report, section 4.1) open in a browser tab or an editor preview, zoomed so the trust-boundary box is readable.
- **Person 2 does:** Switch to the Figure 3 tab as P2 starts speaking; point the mouse at MetaMask, the app, then the box.
- **Expected on screen:** The diagram with the on-chain box (TokenFactory, MarketFactory, OrderBook) and the owner labels.

**Say:**

**P2:** "MetaMask holds the keys and signs. Our Next.js app reads the chain directly, using wagmi and viem. TokenFactory issues ERC20 tokens, MarketFactory lists one market per token pair, and each market is an OrderBook contract that holds the escrow. There is no backend and no admin key."

**P1:** "The engine is a price-time order book. Better prices fill first, and at equal prices the older order wins. Trades happen at the resting order's price, partial fills are supported, and every loop is bounded: at most ten fills per transaction."

- **Handoff cue:** P1 finishes with "…at most ten fills per transaction." P2 switches to the app tab and opens Create Token.
- **If it does not work:** If the PNG will not open, show the architecture diagram in the README (section "Architecture") and keep talking.

### Segment 3: ERC20 issuance and market listing (live) (1:20 to 2:26)

- **Show:** The app, page `/create-token`, then the result card, then `/list-market`, then the Tokens and Markets pages.
- **Person 2 does:** Alice is the active MetaMask account. 1) Name `Fizz Coin`, symbol `FIZZ`, supply `1000000`, press **Review token**, then **Create token**, then **Confirm** in MetaMask. 2) On the result card press **List a market for this token**, choose SGDx as quote, tick the orientation checkbox, press **List market**, **Confirm** in MetaMask. 3) Click **Tokens**, then **Markets**.
- **Expected on screen:** Result card: token address, 18 decimals, total supply 1,000,000, your balance 1,000,000, "Issued by TokenFactory". Market result: the market address with base FIZZ and quote SGDx. Markets lists two markets: NTU / SGDx and FIZZ / SGDx.

**Say:**

**P2:** "First, issuance. On Create Token I enter a name, a symbol and a supply, review, and confirm in MetaMask. TokenFactory deploys a standard ERC20: eighteen decimals, fixed supply, no owner. Now I list a market with SGDx as the quote token, and confirm again."

**P1:** "MarketFactory creates one order-book contract for that pair, so each market's escrow is isolated from every other market."

**P2:** "Both now appear in Tokens and Markets."

- **Handoff cue:** After "…Tokens and Markets." P2 clicks **Trade**, picks NTU / SGDx in the market selector and starts Segment 4 as soon as the order ticket is on screen.
- **If it does not work:** If MetaMask is slow, wait; in the voice-over P1 can say a bridge line from section 5 over the wait. If token creation fails twice, skip the live listing: open the Markets page and hold it for 8 seconds; in the voice-over P2 says instead: "Token issuance and market listing work in the app the same way, and our integration tests cover them. Here are the markets." Do not claim it was done live.

### Segment 4: Limit orders, escrow, partial fill, maker price and cancel (live) (2:26 to 4:20)

- **Show:** The Trade page for NTU / SGDx: the order ticket, the Order Book and Market Depth panels, the result card, and My Orders.
- **Person 2 does:** 1) Alice: **Limit** tab, **Sell NTU**, Limit Price `2`, Amount `100`, **Review order**, **Approve 100 NTU** (Confirm), then **Place sell order** (Confirm). 2) In MetaMask switch to Bob and check that the site header shows Bob. **Buy NTU**, Limit Price `2.2`, Amount `40`, **Review order**, **Approve 88 SGDx** (Confirm), **Place buy order** (Confirm). 3) Switch back to Alice, open My Orders, press **Cancel** on order #1, **Confirm cancel**, Confirm in MetaMask.
- **Expected on screen:** After 1: Order Book ask 100 at 2.0000; Alice 9,900 NTU. After 2: one trade, 40 NTU at 2; result card shows quote paid at maker prices 80 SGDx and refunded (price improvement) 8 SGDx; Bob 10,040 NTU and 9,920 SGDx; Alice 10,080 SGDx; order #1 Partially Filled, 40 of 100, 60 left. After 3: "Order #1 cancelled", refund 60 NTU, Alice 9,960 NTU, row reads Cancelled, the book is empty.

**Say:**

**P2:** "Back to NTU and SGDx. As Alice I sell one hundred NTU at a price of two. First an exact approval for one hundred NTU, then the order itself. The tokens move into escrow."

**P1:** "That escrow is what makes the exchange non-custodial: the contract holds exactly what the order needs, and nothing else. Alice's sell now rests in the book."

**P2:** "Now Bob buys forty NTU with a limit of two point two. He approves eighty-eight SGDx, the most he could pay, and places the order."

**P1:** "It matches at once, at Alice's price of two, not Bob's limit. Forty NTU for eighty SGDx, and the eight SGDx of price improvement come straight back to Bob. Alice's order is partially filled: sixty NTU still rest."

**P2:** "That is Bonus one. Alice cancels the unfilled remainder, confirms once, and exactly sixty NTU return to her wallet. The order reads Cancelled and has left the book."

- **Handoff cue:** P2's last line ends the segment. In Call 1, P2 then pauses the recording and opens Terminal B (Segment 5). In Call 2, P1 starts Segment 5 at the cut to the Trade page.
- **If it does not work:** If a MetaMask prompt does not appear, open the extension from the toolbar (the app says so). If a transaction is stuck pending, stop the take and use the reset procedure in `docs/VIDEO_PLAN.md`. If the Cancel button misbehaves, run in the terminal: `cast send 0xCafac3dD18aC6c6e92c921884f9E4176737C052c "cancelOrder(uint256)" 1 --from 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --unlocked --rpc-url http://127.0.0.1:8549` and say that it is a terminal action.

### Segment 5: Bonus 2: batch matching by a keeper (4:20 to 5:29)

- **Show:** Terminal B (the demo terminal), then the Trade page showing the Match Orders panel, then the Keeper's result card, then the terminal again.
- **Person 2 does:** **Pause the Zoom recording.** In Terminal B run `scripts/seed-crossed-book.sh seed --rpc-url http://127.0.0.1:8549`, wait for its final line "Result: the book is crossed and ready", run `scripts/seed-crossed-book.sh status --rpc-url http://127.0.0.1:8549` and check that it says the book is CROSSED, then **resume the recording** and hold the Trade page with the Match Orders panel for 22 seconds (P1's first line is spoken over it). In MetaMask switch to **Keeper**; on Trade press **Review match**, then **Confirm match**, Confirm in MetaMask. Then run `scripts/seed-crossed-book.sh verify-after --rpc-url http://127.0.0.1:8549` and hold its result for 7 seconds.
- **Expected on screen:** The Match Orders panel appears (best bid at or above best ask). The review shows `matchOrders(10)`, about 2 fills, a gas estimate and "no token approval is needed". After the block: "Matched: 2 fills settled", 2 NTU and 4 SGDx, price improvement returned 1.5 SGDx, orders #23 to #26 Filled, "Still Crossed Afterwards: No". `verify-after` ends with "Result: every check passed".

**Say:**

**P1:** "A single placement makes at most ten fills, so a large order can leave the book crossed. Bonus two: anyone can call matchOrders, pays only gas, and gains nothing. We prepared this crossed book off camera, because building it takes twenty-four orders."

**P2:** "The Match Orders panel has appeared. As a keeper with no trading tokens I review, then confirm, and one transaction settles four traders' orders."

**P1:** "Two fills, two NTU, four SGDx, and the keeper's token balances did not change."

- **Handoff cue:** After "…did not change." P2 clicks back to Alice and opens Trade. In Call 2, P2 starts Segment 6 when the Stop-Limit form is on screen.
- **If it does not work:** If the panel does not show, run `status`; if the book is not crossed, the seed did not finish, so re-run it (it refuses unless the chain is ready and says why). If the live match fails, say so and play the backup clip, clearly introduced as a clip (see `docs/VIDEO_PLAN.md`, section 9). Never present the clip as live.

### Segment 6: Bonus 3: stop-limit order, trigger and execution (5:29 to 6:59)

- **Show:** The Trade page: the Stop-Limit tab, the result card, My Orders, then Terminal B, then the Trigger Stops panel and its result card.
- **Person 2 does:** 1) Alice active. **Stop-Limit** tab, **Sell NTU**, Trigger Price `1.8`, Limit Price `1.7`, Amount `10`, **Review stop-limit order**, **Approve 10 NTU** (Confirm), **Place sell stop-limit order** (Confirm). Point at My Orders. 2) Terminal B: `scripts/seed-stop-orders.sh move-price 1.8 --rpc-url http://127.0.0.1:8549`, then `scripts/seed-stop-orders.sh add-bid 1.9 4 --rpc-url http://127.0.0.1:8549`. 3) Back in the browser point at the **Eligible Now** chip. Switch MetaMask to Keeper, press **Review trigger**, **Confirm trigger**, Confirm in MetaMask.
- **Expected on screen:** After 1: "Stop-limit order #27 placed and pending", status Pending Trigger, "Waiting for price", not in the Order Book; My Orders shows Trigger Price 1.8000 and Limit Price 1.7000. After 2: the script prints that the last trade price is 1.8 and that a trigger call would now activate 1 stop; then a resting buy of 4 NTU at 1.9. Then: Eligible Now chip beside the amber Pending Trigger badge, and a Trigger Stops panel. After 3: "Triggered: 1 stop order activated", order #27 Partially Filled, 4 NTU and 7.6 SGDx exchanged (Alice 10,109.6 SGDx), last trade price 1.9; 6 NTU rest at 1.7.

**Say:**

**P2:** "Bonus three, a stop-limit order. As Alice I sell ten NTU with a trigger price of one point eight and a limit price of one point seven. Approve, then place. The order is Pending Trigger, escrowed, and not in the order book."

**P1:** "The trigger price is only a condition: once the last trade price reaches one point eight, the stop becomes eligible. Eligible is not activated, and activation does not guarantee a trade."

**P2:** "Now two other traders trade at one point eight, and a bid for four NTU at one point nine rests. The stop shows Eligible Now. The keeper reviews and triggers."

**P1:** "The stop activated and filled four NTU at one point nine, the resting bid's price, not the trigger and not the limit. Six NTU rest at the limit, and Alice received seven point six SGDx."

- **Handoff cue:** After "…Alice received seven point six SGDx." P2 opens the VS Code window with the evidence tabs.
- **If it does not work:** If the Trigger Stops panel does not appear, run `scripts/seed-stop-orders.sh status --rpc-url http://127.0.0.1:8549`: it prints how many stops a trigger would activate (it must say 1). If the UI trigger fails, run in the terminal `cast send 0xCafac3dD18aC6c6e92c921884f9E4176737C052c "triggerStopOrders(uint256)" 10 --from 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 --unlocked --rpc-url http://127.0.0.1:8549` and narrate it as a terminal action.

### Segment 7: Solidity security, testing and audit evidence (6:59 to 7:51)

- **Show:** First `docs/report/diagrams/10-evidence-map.png` (Figure 10), then `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md` scrolled to the "Verification evidence" table. Optional if time allows: `docs/ai-audit/test-evidence/phase7/forge-test-deep.txt` at the line `runs: 1000, calls: 128000`.
- **Person 2 does:** Switch to Figure 10 on "Now the evidence…", scroll the table to the Foundry, invariants, coverage, Slither and mutation rows as they are named, then to the "Final independent audit" heading.
- **Expected on screen:** The evidence map with four kinds of evidence; the table rows 335 tests, 1,000 x 128 = 128,000 invariant calls, 100% coverage, Slither 27 results 0 real, mutation testing.

**Say:**

**P1:** "Now the evidence behind the engine. We ran three hundred thirty-five Foundry tests, with full line and branch coverage of the order book. A stateful invariant suite replayed one hundred twenty-eight thousand random calls against an independent reference ledger, with no violations. Slither reported twenty-seven results, none real. Of sixty-seven deliberate mutants, sixty-five were caught, and the other two are documented as equivalent. A final AI audit found no critical or high issue. The one accepted medium issue, a dust sandwich through the fill cap, is documented and pinned by a test. It was an AI audit, not a human one."

- **Handoff cue:** After "…not a human one." P2 switches to the AI-methodology tabs.
- **If it does not work:** If a file will not open, stay on Figure 10 and the summary table; every number is on one of them.

### Segment 8: AI-assisted methodology and lessons (7:51 to 8:37)

- **Show:** `CLAUDE.md` (top), `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` (section 4, Evidence), the `docs/ai-audit/issues/` folder listing (24 files), then `docs/ai-audit/issues/p2-017-cancelled-stop-labelled-activated.md` (title and section 1).
- **Person 2 does:** Open the four tabs in this order as the sentences come; keep each on screen for the length of its sentence.
- **Expected on screen:** A specification file, an issue with a failing-then-passing record, the folder of 24 issue files, and the P2-017 issue.

**Say:**

**P1:** "We set the rules in specification files; the AI coded inside them. A fresh AI reviewer checked each phase, and we decided every fix. It found issue six: about one hundred two wei could block every trigger, and we chose auto-cancel. We logged twenty-four issues, each with its evidence."

**P2:** "On the front end, mock-wallet tests passed while real MetaMask exposed a stale-nonce problem and a misleading label on a cancelled stop. Different kinds of evidence prove different things, so we kept them apart."

- **Handoff cue:** After "…so we kept them apart." P2 switches back to the app's Overview page.
- **If it does not work:** If time is short, drop the folder listing and keep issue 006 and issue P2-017.

### Segment 9: Limitations and conclusion (8:37 to 8:58)

- **Show:** The app's Overview page, or the report's executive summary, whichever is already open.
- **Person 2 does:** Stay on one screen for 21 seconds, then stop the Call 1 recording. In Call 2 the host stops the recording when the silent video ends.
- **Expected on screen:** A calm closing frame.

**Say:**

**P2:** "In summary, ERC20 issuance, listing, limit orders, partial fills and all three bonuses work end to end."

**P1:** "The limits: a local chain only, an AI audit only, and we did not run the MetaMask failure cases. Thank you."

- **Handoff cue:** End of video.
- **If it does not work:** If Call 1 ran over 9:30, take it again as the cue sheet says (Part A, "If the take runs long"): pause during waits; never shorten the lines or the holds, and never cut a feature.

## 3. What is live and what is prepared off camera

| Scene | Status in the video |
|---|---|
| Segments 3, 4 and 6 (issuance, listing, orders, cancel, stop-limit placement and trigger) | **Live**: every MetaMask transaction is performed on camera |
| Segment 5, building the crossed book | **Prepared off camera** (24 orders, run with the recording paused) and **said so aloud**; the matching transaction itself is live |
| Segment 6 price moves (`move-price`, `add-bid`) | Live terminal commands from the project's helper script; they are trades by two other accounts, not a staged result |
| Segments 7 and 8 | Files shown, not executed. No test is run on camera |

If a clip of any earlier run is ever played in place of a live action, say "this is a recording of the same step" in the sentence. Do not edit a clip in as if it were live.

## 4. Claims in the script and where each comes from

| Spoken claim | Source |
|---|---|
| No backend, no admin key, one OrderBook per pair, 18-decimal ERC20 without owner or minting | `docs/report/AI_AUDIT_REPORT.md` section 4.1 and Figure 3; `docs/DEPLOYMENT.md`; `PRODUCT.md` |
| Price-time priority, maker price, at most ten fills per transaction | `SPEC.md`; report section 1.3 |
| Buyer's price improvement returned; 40 NTU at 2 = 80 SGDx, 8 SGDx back | `contracts/script/demo-journey.sh` step 1 (balances checked by the script); `docs/TESTING.md` Test 4 |
| Cancel returns exactly the unfilled remainder | `docs/TESTING.md` Test 12; `demo-journey.sh` step 2 |
| `matchOrders` is permissionless, the caller gains nothing, 2 fills, 2 NTU, 4 SGDx, keeper unchanged | `SPEC.md` section 6; `docs/TESTING.md` Test 13 (owner-run in MetaMask on a scratch chain); `scripts/seed-crossed-book.sh` |
| Stop-limit: eligible is not activated, activation does not guarantee a fill, fill at the bid's price 1.9, 4 NTU, 7.6 SGDx | `docs/TESTING.md` Test 14 and section 14-4 (owner-run, read back from the chain); report section 6.9 |
| 335 Foundry tests, 100% coverage, 128,000 invariant calls, Slither 27 results 0 real, 65 of 67 mutants caught | `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md`; report section 6.1 and Figure 10 |
| Final audit: no critical or high, AI not human, one accepted medium (issue 007) | `ENGINE_SECURITY_SUMMARY.md`; report sections 5.4 and 6.4 |
| Issue six: about 102 wei blocked every trigger | `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` |
| 24 issues logged | `docs/ai-audit/issues/` (7 engine, 17 Person 2) |
| MetaMask exposed a stale nonce and a misleading cancelled-stop label | report section 8.5; issue `p2-017`; `docs/TESTING.md` section 14-4 |
| MetaMask failure cases were not run | report section 6.1 and `docs/SUBMISSION_CHECKLIST.md` |

Nothing in the script claims that a MetaMask rejection, an account switch during a request, an outage or a chain reset was tested in MetaMask: they were not.

## 5. Bridge lines for delays

Use these in the voice-over (Call 2) only if the silent recording shows a wait of more than about five seconds after your line has ended. They are not counted in the timing table.

- If a MetaMask confirmation is slow (P1): "While that confirms: every order here is validated on-chain, so nothing is trusted to the browser."
- If the block is slow (P1): "Anvil mines a block per transaction, so this takes a second or two on a real node."
- If P2 must switch account (P1): "The wallet's selected account and the account the site is connected to are different things, so P2 checks the address in the header."
- If a result card is slow (P2): "The app only reports success from the confirmed receipt, so it waits for the block."

## 6. Values that can differ when you record

- **Market address** in the terminal fallbacks is `0xCafac3dD18aC6c6e92c921884f9E4176737C052c`, the NTU / SGDx market on a fresh Anvil deployed by Step 2 (the same as `web/lib/contracts/deployments.ts`).
- **Order numbers** (#1, #2, #23 to #26, #27) follow from the order of actions on a fresh chain: the journey uses #1 and #2, the crossed-book seed #3 to #26, the stop #27. A different order of actions changes them; read them off the screen.
- **Gas estimates and gas used** differ from run to run and between machines. Do not read them aloud.
- **Transaction hashes** are different on every chain and are not read aloud.
- **Bonus 3 amounts** (4 NTU, 7.6 SGDx, last price 1.9) are the tested values of `docs/TESTING.md` Test 14; this video uses Alice as the stop owner and Anvil account 4 as the keeper instead of accounts 5 and 6, and the chain rehearsal of 8 Nov confirmed the same values with these accounts (order #27, 4 NTU at 1.9, 7.6 SGDx to Alice, 6 NTU resting at 1.7).
- **Balances after the crossed-book seed** follow `contracts/script/demo-journey.sh` step 3 (for example Alice 9,949 NTU and 10,102 SGDx), which that script checks.
