# Video script: SC4053 DEX demo (word for word)

Companion to [`VIDEO_PLAN.md`](VIDEO_PLAN.md), which has the setup, the recording instructions and the fallbacks. To read along while recording, use [`VIDEO_CUE_SHEET.md`](VIDEO_CUE_SHEET.md): the same words, interleaved step by step with the actions. **Person 2 operates the screen, MetaMask and the terminal for the whole video. Person 1 only speaks.** Read the quoted sentences aloud as written; the text outside the quotes is for the person who needs it.

**Requirements (NTULearn):** a short demo video of at most **10 minutes** and **300 MB**, named **`GroupName.mp4`**. It must start with a quick introduction to the architecture (Segments 1 and 2) and contain a detailed hands-on demo of the locally deployed solution (Segments 3 to 6), with a README that lets the markers reproduce it (`README.md`, "Reproduce the demo"). The 7:30 plan leaves about two minutes of margin for MetaMask waits. Nothing in this file says the video has been recorded.

**Rehearsed on chain (8 Nov).** Segments 3 to 6 were replayed with `cast` and the two helper scripts on a fresh scratch Anvil deployed exactly as in `VIDEO_PLAN.md` Step 2. Every balance, order number and status in the "Expected on screen" lines below matched, including order #27 and the Bonus 3 amounts. MetaMask and the app's screens were not part of that rehearsal.

**Placeholders.** `[Person 1's name]` and `[Person 2's name]` are for each speaker to say their own name; they are the only blanks.

## 1. Timing table

| # | Start | End | Segment | Speaker(s) | Words | Seconds | Words per second |
|---|---|---|---|---|---|---|---|
| 1 | 0:00 | 0:30 | Introduction and motivation | P1 and P2 (P1 30, P2 38) | 68 | 30 | 2.27 |
| 2 | 0:30 | 1:15 | Architecture | P1 and P2 (P1 41, P2 48) | 89 | 45 | 1.98 |
| 3 | 1:15 | 2:00 | ERC20 issuance and market listing (live) | P1 and P2 (P1 18, P2 51) | 69 | 45 | 1.53 |
| 4 | 2:00 | 3:40 | Limit orders, escrow, partial fill, maker price and cancel (live) | P1 and P2 (P1 64, P2 87) | 151 | 100 | 1.51 |
| 5 | 3:40 | 4:25 | Bonus 2: batch matching by a keeper | P1 and P2 (P1 56, P2 24) | 80 | 45 | 1.78 |
| 6 | 4:25 | 5:40 | Bonus 3: stop-limit order, trigger and execution | P1 and P2 (P1 66, P2 72) | 138 | 75 | 1.84 |
| 7 | 5:40 | 6:30 | Solidity security, testing and audit evidence | P1 (P1 101, P2 0) | 101 | 50 | 2.02 |
| 8 | 6:30 | 7:10 | AI-assisted methodology and lessons | P1 and P2 (P1 49, P2 34) | 83 | 40 | 2.08 |
| 9 | 7:10 | 7:30 | Limitations and conclusion | P1 and P2 (P1 21, P2 17) | 38 | 20 | 1.90 |
| | 0:00 | 7:30 | **Total** | P1 446 (54%), P2 371 (45%) | **817** | 450 | 1.82 |

**How the time is used.** About 817 spoken words in 450 seconds is 1.8 words per second (roughly 108 words per minute), slower than normal speech on purpose: the rest is time for clicks, MetaMask confirmations and block times. Person 2 also operates every action, so the word split understates Person 2's share of the work. Rehearse with a stopwatch: if a segment runs more than 5 seconds long twice in a row, shorten its first sentence, not the demonstration.

**Counts are estimates, not measurements.** The words were counted by script from the quoted text; the seconds are the plan. The real timing is the rehearsal's.

**Conventions.** P1 = Person 1 (trading engine, security, audit). P2 = Person 2 (front end, factories, deployment, integration). Account names: Alice = Anvil account 1, Bob = account 2, Keeper = account 4 (holds no trading tokens). Numbers in the quotes are spelled as they are spoken.

## 2. The segments

### Segment 1: Introduction and motivation (0:00 to 0:30)

- **Show:** The app's Overview page at `http://localhost:3103`, Alice connected, the NTU / SGDx market visible.
- **Person 2 does:** Nothing to do. Make sure the header shows Alice's shortened address and the block number.
- **Expected on screen:** A glass dashboard with the market board, the balances (Alice holds 10,000 NTU and 10,000 SGDx) and no orders yet.

**Say:**

**P2:** "Hello, I'm [Person 2's name]. Most exchanges are custodial: they hold your keys, so one hack can take your funds. We built a decentralized exchange where your tokens stay in your own wallet until you place an order."

**P1:** "I'm [Person 1's name]. I wrote the on-chain trading engine. We'll run every core feature and all three bonuses live, then show how we tested it and how AI helped."

- **Handoff cue:** P1 finishes with "…how AI helped." P2 immediately opens the Figure 3 tab.
- **If it does not work:** If the page does not load, show the README's top section instead and say nothing about the app until it is fixed; do not apologise on camera, re-record the segment.

### Segment 2: Architecture (0:30 to 1:15)

- **Show:** `docs/report/diagrams/03-system-architecture.png` (Figure 3 of the report, section 4.1) open in a browser tab or an editor preview, zoomed so the trust-boundary box is readable.
- **Person 2 does:** Switch to the Figure 3 tab as P2 starts speaking; point the mouse at MetaMask, the app, then the box.
- **Expected on screen:** The diagram with the on-chain box (TokenFactory, MarketFactory, OrderBook) and the owner labels.

**Say:**

**P2:** "MetaMask holds the keys and signs. Our Next.js app reads the chain directly, using wagmi and viem. TokenFactory issues ERC20 tokens, MarketFactory lists one market per token pair, and each market is an OrderBook contract that holds the escrow. There is no backend and no admin key."

**P1:** "The engine is a price-time order book. Better prices fill first, and at equal prices the older order wins. Trades happen at the resting order's price, partial fills are supported, and every loop is bounded: at most ten fills per transaction."

- **Handoff cue:** P1 finishes with "…at most ten fills per transaction." P2 switches to the app tab and opens Create Token.
- **If it does not work:** If the PNG will not open, show the architecture diagram in the README (section "Architecture") and keep talking.

### Segment 3: ERC20 issuance and market listing (live) (1:15 to 2:00)

- **Show:** The app, page `/create-token`, then the result card, then `/list-market`, then the Tokens and Markets pages.
- **Person 2 does:** Alice is the active MetaMask account. 1) Name `Fizz Coin`, symbol `FIZZ`, supply `1000000`, press **Review token**, then **Create token**, then **Confirm** in MetaMask. 2) On the result card press **List a market for this token**, choose SGDx as quote, tick the orientation checkbox, press **List market**, **Confirm** in MetaMask. 3) Click **Tokens**, then **Markets**.
- **Expected on screen:** Result card: token address, 18 decimals, total supply 1,000,000, your balance 1,000,000, "Issued by TokenFactory". Market result: the market address with base FIZZ and quote SGDx. Markets lists two markets: NTU / SGDx and FIZZ / SGDx.

**Say:**

**P2:** "First, issuance. On Create Token I enter a name, a symbol and a supply, review, and confirm in MetaMask. TokenFactory deploys a standard ERC20: eighteen decimals, fixed supply, no owner. Now I list a market with SGDx as the quote token, and confirm again."

**P1:** "MarketFactory creates one order-book contract for that pair, so each market's escrow is isolated from every other market."

**P2:** "Both now appear in Tokens and Markets."

- **Handoff cue:** After "…Tokens and Markets." P2 clicks **Trade**, picks NTU / SGDx in the market selector and starts Segment 4 as soon as the order ticket is on screen.
- **If it does not work:** If MetaMask is slow, P1 says one bridge line from section 5 of this file. If token creation fails twice, skip the live listing: open Markets, then say "listing is covered by our integration tests" (do not claim it was done live) and move on. Never stop the take for a 10-second delay.

### Segment 4: Limit orders, escrow, partial fill, maker price and cancel (live) (2:00 to 3:40)

- **Show:** The Trade page for NTU / SGDx: the order ticket, the Order Book and Market Depth panels, the result card, and My Orders.
- **Person 2 does:** 1) Alice: **Limit** tab, **Sell NTU**, Limit Price `2`, Amount `100`, **Review order**, **Approve 100 NTU** (Confirm), then **Place sell order** (Confirm). 2) In MetaMask switch to Bob and check that the site header shows Bob. **Buy NTU**, Limit Price `2.2`, Amount `40`, **Review order**, **Approve 88 SGDx** (Confirm), **Place buy order** (Confirm). 3) Switch back to Alice, open My Orders, press **Cancel** on order #1, **Confirm cancel**, Confirm in MetaMask.
- **Expected on screen:** After 1: Order Book ask 100 at 2.0000; Alice 9,900 NTU. After 2: one trade, 40 NTU at 2; result card shows quote paid at maker prices 80 SGDx and refunded (price improvement) 8 SGDx; Bob 10,040 NTU and 9,920 SGDx; Alice 10,080 SGDx; order #1 Partially Filled, 40 of 100, 60 left. After 3: "Order #1 cancelled", refund 60 NTU, Alice 9,960 NTU, row reads Cancelled, the book is empty.

**Say:**

**P2:** "Back to NTU and SGDx. As Alice I sell one hundred NTU at a price of two. First an exact approval for one hundred NTU, then the order itself. The tokens move into escrow."

**P1:** "That escrow is what makes the exchange non-custodial: the contract holds exactly what the order needs, and nothing else. Alice's sell now rests in the book."

**P2:** "Now Bob buys forty NTU with a limit of two point two. He approves eighty-eight SGDx, the most he could pay, and places the order."

**P1:** "It matches at once, at Alice's price of two, not Bob's limit. Forty NTU for eighty SGDx, and the eight SGDx of price improvement come straight back to Bob. Alice's order is partially filled: sixty NTU still rest."

**P2:** "That is Bonus one. Alice cancels the unfilled remainder, confirms once, and exactly sixty NTU return to her wallet. The order reads Cancelled and has left the book."

- **Handoff cue:** P2's last line ends the segment. P2 then pauses the Zoom recording and opens Terminal B (Segment 5). P1 speaks first after the recording resumes.
- **If it does not work:** If a MetaMask prompt does not appear, open the extension from the toolbar (the app says so). If a transaction is stuck pending, stop the take and use the reset procedure in `docs/VIDEO_PLAN.md`. If the Cancel button misbehaves, run in the terminal: `cast send 0xCafac3dD18aC6c6e92c921884f9E4176737C052c "cancelOrder(uint256)" 1 --from 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --unlocked --rpc-url http://127.0.0.1:8549` and say that it is a terminal action.

### Segment 5: Bonus 2: batch matching by a keeper (3:40 to 4:25)

- **Show:** Terminal B (the demo terminal), then the Trade page showing the Match Orders panel, then the Keeper's result card, then the terminal again.
- **Person 2 does:** **Pause the Zoom recording.** In Terminal B run `scripts/seed-crossed-book.sh seed --rpc-url http://127.0.0.1:8549`, wait for its final line "Result: the book is crossed and ready", run `scripts/seed-crossed-book.sh status --rpc-url http://127.0.0.1:8549` and check that it says the book is CROSSED, then **resume the recording**. P1 starts speaking as soon as recording resumes. In MetaMask switch to **Keeper**; on Trade press **Review match**, then **Confirm match**, Confirm in MetaMask. Then run `scripts/seed-crossed-book.sh verify-after --rpc-url http://127.0.0.1:8549` while P1 speaks the last line.
- **Expected on screen:** The Match Orders panel appears (best bid at or above best ask). The review shows `matchOrders(10)`, about 2 fills, a gas estimate and "no token approval is needed". After the block: "Matched: 2 fills settled", 2 NTU and 4 SGDx, price improvement returned 1.5 SGDx, orders #23 to #26 Filled, "Still Crossed Afterwards: No". `verify-after` ends with "Result: every check passed".

**Say:**

**P1:** "A single placement makes at most ten fills, so a large order can leave the book crossed. Bonus two: anyone can call matchOrders, pays only gas, and gains nothing. We prepared this crossed book off camera, because building it takes twenty-four orders."

**P2:** "The Match Orders panel has appeared. As a keeper with no trading tokens I review, then confirm, and one transaction settles four traders' orders."

**P1:** "Two fills, two NTU, four SGDx, and the keeper's token balances did not change."

- **Handoff cue:** After "…did not change." P2 clicks back to Alice and opens Trade. P1 pauses one beat, then P2 starts Segment 6.
- **If it does not work:** If the panel does not show, run `status`; if the book is not crossed, the seed did not finish, so re-run it (it refuses unless the chain is ready and says why). If the live match fails, say so and play the backup clip, clearly introduced as a clip (see `docs/VIDEO_PLAN.md`, section 9). Never present the clip as live.

### Segment 6: Bonus 3: stop-limit order, trigger and execution (4:25 to 5:40)

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

### Segment 7: Solidity security, testing and audit evidence (5:40 to 6:30)

- **Show:** First `docs/report/diagrams/10-evidence-map.png` (Figure 10), then `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md` scrolled to the "Verification evidence" table. Optional if time allows: `docs/ai-audit/test-evidence/phase7/forge-test-deep.txt` at the line `runs: 1000, calls: 128000`.
- **Person 2 does:** Switch to Figure 10 on "Now the evidence…", scroll the table to the Foundry, invariants, coverage, Slither and mutation rows as they are named, then to the "Final independent audit" heading.
- **Expected on screen:** The evidence map with four kinds of evidence; the table rows 335 tests, 1,000 x 128 = 128,000 invariant calls, 100% coverage, Slither 27 results 0 real, mutation testing.

**Say:**

**P1:** "Now the evidence behind the engine. We ran three hundred thirty-five Foundry tests, with full line and branch coverage of the order book. A stateful invariant suite replayed one hundred twenty-eight thousand random calls against an independent reference ledger, with no violations. Slither reported twenty-seven results, none real. Of sixty-seven deliberate mutants, sixty-five were caught, and the other two are documented as equivalent. A final AI audit found no critical or high issue. The one accepted medium issue, a dust sandwich through the fill cap, is documented and pinned by a test. It was an AI audit, not a human one."

- **Handoff cue:** After "…not a human one." P2 switches to the AI-methodology tabs.
- **If it does not work:** If a file will not open, stay on Figure 10 and the summary table; every number is on one of them.

### Segment 8: AI-assisted methodology and lessons (6:30 to 7:10)

- **Show:** `CLAUDE.md` (top), `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` (section 4, Evidence), the `docs/ai-audit/issues/` folder listing (24 files), then `docs/ai-audit/issues/p2-017-cancelled-stop-labelled-activated.md` (title and section 1).
- **Person 2 does:** Open the four tabs in this order as the sentences come; keep each on screen for the length of its sentence.
- **Expected on screen:** A specification file, an issue with a failing-then-passing record, the folder of 24 issue files, and the P2-017 issue.

**Say:**

**P1:** "We set the rules in specification files; the AI coded inside them. A fresh AI reviewer checked each phase, and we decided every fix. It found issue six: about one hundred two wei could block every trigger, and we chose auto-cancel. We logged twenty-four issues, each with its evidence."

**P2:** "On the front end, mock-wallet tests passed while real MetaMask exposed a stale-nonce problem and a misleading label on a cancelled stop. Different kinds of evidence prove different things, so we kept them apart."

- **Handoff cue:** After "…so we kept them apart." P2 switches back to the app's Overview page.
- **If it does not work:** If time is short, drop the folder listing and keep issue 006 and issue P2-017.

### Segment 9: Limitations and conclusion (7:10 to 7:30)

- **Show:** The app's Overview page, or the report's executive summary, whichever is already open.
- **Person 2 does:** Stay on one screen. At the end say nothing more, wait two seconds, then stop the Zoom recording.
- **Expected on screen:** A calm closing frame.

**Say:**

**P2:** "In summary, ERC20 issuance, listing, limit orders, partial fills and all three bonuses work end to end."

**P1:** "The limits: a local chain only, an AI audit only, and we did not run the MetaMask failure cases. Thank you."

- **Handoff cue:** End of video.
- **If it does not work:** If the take overran, trim the introduction of Segment 1 in the next take, not the demonstrations.

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

Use these only if a wait is longer than about five seconds. They are not counted in the timing table.

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
