# Video cue sheet: two Zoom calls

> **Recording? Use the short versions:** [`VIDEO_CALL1_CLICKS.md`](VIDEO_CALL1_CLICKS.md) (Call 1: what to click, step by step) and [`VIDEO_CALL2_VOICEOVER.md`](VIDEO_CALL2_VOICEOVER.md) (Call 2: what to say, cue by cue). This sheet is the full version, with the checkpoints, the requirements table and the rules.

We make the video in two calls:

| Call | Who does what | Output |
|---|---|---|
| **Call 1: silent screen capture** | Person 2 shares the screen and does every click in **Part A**. Nobody speaks; both microphones stay muted. Person 1 watches and keeps the stopwatch. | A silent recording of the demo, about **7:30** (slower is fine, up to 9:00; never past 9:30) |
| **Between the calls** | Both watch the silent recording once and write the time of each cue into **Part B** | Part B with its "At" column filled in |
| **Call 2: voice-over** | One of us shares and plays the silent recording; both read their lines from **Part B** as the cues appear; Zoom records the call | The final video, saved as **`GroupName.mp4`** |

The words are the same as in [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md) (if the two ever differ, the script wins). Setup, Zoom settings, fallbacks and the reset are in [`VIDEO_PLAN.md`](VIDEO_PLAN.md).

**Requirements (NTULearn):** at most **10 minutes** and **300 MB**, file named **`GroupName.mp4`**, starting with the architecture and showing a hands-on demo of the locally deployed system. The silent recording aims at about **7:30**. Going slower is fine up to **9:00**, and it must never pass **9:30**, which keeps at least 30 seconds of safety under the 10-minute limit. The video shows the features only; our testing and AI audit are in the report, and the closing line says so.

**What the video must show (the brief's DEX requirements):**

| Requirement | Where it is shown |
|---|---|
| ERC20 token issuance | Segment 3: Create Token, result card, Tokens page |
| Token listing (a market for the new token) | Segment 3: List Market, Markets page |
| Buy and sell limit orders | Segment 4: Alice's sell, Bob's buy |
| Automatic execution of matched orders, with partial fulfilment | Segment 4: Bob's buy matches at once; Alice's order is Partially Filled |
| Self-custody (MetaMask signs; exact approvals; escrow) | Segments 1, 2 and 4 |
| Bonus 1: cancel the unfilled remainder | Segment 4: Alice cancels, 60 NTU return |
| Bonus 2: batched multi-party matching | Segment 5: one keeper transaction settles four traders' orders |
| Bonus 3: conditional (stop-limit) order | Segment 6: placement, eligibility, keeper trigger, fill |
| Architecture first | Segment 2, from 0:35 |

None of these may be cut to save time.

**Accounts:** Alice = Anvil account 1, Bob = account 2, Keeper = account 4 (holds no trading tokens). After every account switch, check the address in the app's header.

---

# Part A. Call 1: silent screen capture (Person 2 does, Person 1 times)

**Before you press Record:**
- Steps 0 to 6 of `VIDEO_PLAN.md` are done on a fresh chain (8549, with the app on 3103).
- Alice is the active MetaMask account and is connected.
- The Figure 3 tab is open (plan, section 8).
- Terminal B is cleared with `PS1='$ '`.
- The browser zoom is 125% and the terminal font is 18 points or larger. The video is encoded twice, so text must be big.
- Both microphones are muted.
- Zoom is set up as in `VIDEO_PLAN.md`, section 5.

**How to use this part**
- **Do** is the action. **Hold** is how long the screen must stay still after the action finishes (once the result is on screen), so the voice-over has time to say its line. Count it on the stopwatch or in your head. Holding a little longer is fine; cutting it short is not. Every hold is sized for a calm voice-over of about 2.1 words per second (126 words per minute) plus a two-second breath.
- **Go slowly.** This recording is for explaining, not for speed:
  - Before each click, move the pointer to the button and rest it there for a moment.
  - Type at an easy pace.
  - When a MetaMask popup opens, leave it on screen for about two seconds before pressing Confirm, so viewers can read what is being signed.
  - After every account switch, rest the pointer on the address in the header for a moment.
- **Person 1** starts a stopwatch the moment Zoom starts recording, and pauses it whenever the recording is paused. They write down the stopwatch time when each segment starts. That gives the first draft of Part B's "At" column.
- **Checkpoints:** at the end of each segment, compare the stopwatch with the table. Past "latest" means the take will run over 9:00 (see "If the take runs long" after Segment 9).
- **If something goes wrong mid-take:**
  1. **Pause** the recording.
  2. Fix it, using the "If it does not work" line of that segment in `VIDEO_SCRIPT.md`.
  3. Put the screen back as it was just before the failed step, and **resume**.

  The paused part is not in the file. A failed transaction changes nothing on the chain, so you can simply do the step again. Only a transaction stuck pending needs the full reset (`VIDEO_PLAN.md`, section 6), and that means starting the take again.
- Move the mouse slowly, and do not scroll while a result is being held.

| Segment ends | Target | Latest |
|---|---|---|
| 1. Introduction | 0:35 | 0:42 |
| 2. Architecture | 1:20 | 1:37 |
| 3. Issuance and listing | 2:26 | 2:57 |
| 4. Orders, partial fill, cancel | 4:20 | 5:15 |
| 5. Bonus 2 | 5:29 | 6:39 |
| 6. Bonus 3 | 6:59 | 8:27 |
| 7. Conclusion (stop recording) | **7:27** | **9:00** |

### Segment 1. Introduction: the app's Overview page

| # | Do | Hold |
|---|---|---|
| A1.1 | Start the recording with the Overview page already on screen (Alice connected, NTU / SGDx visible, no orders yet). | **35 s**: move the mouse slowly over the market board, then Alice's balances (10,000 NTU, 10,000 SGDx) |

### Segment 2. Architecture: Figure 3

| # | Do | Hold |
|---|---|---|
| A2.1 | Open the Figure 3 tab (`docs/report/diagrams/03-system-architecture.png`), zoomed so the trust-boundary box is readable. | **45 s**. For the first 20 s, point at MetaMask, then the app, then TokenFactory, MarketFactory and the OrderBook box, about 4 s each. For the last 25 s, rest the pointer on the OrderBook box |

### Segment 3. Token issuance and market listing (Alice)

| # | Do | Hold |
|---|---|---|
| A3.1 | Open **Create Token**. Type Name `Fizz Coin`, Symbol `FIZZ`, Supply `1000000`. | 3 s |
| A3.2 | **Review token**, **Create token**, **Confirm** in MetaMask. Wait for the result card (18 decimals, supply 1,000,000, "Issued by TokenFactory"). | **8 s** |
| A3.3 | **List a market for this token**, choose **SGDx** as the quote, tick the orientation box, **List market**, **Confirm** in MetaMask. Wait for the market result (base FIZZ, quote SGDx). | **11 s** |
| A3.4 | Click **Tokens** (hold 3 s), then **Markets** (two markets: NTU / SGDx and FIZZ / SGDx). | **5 s** |
| A3.5 | Click **Trade** and choose **NTU / SGDx**. | 2 s |

### Segment 4. Limit orders, partial fill, maker price and cancel

| # | Do | Hold |
|---|---|---|
| A4.1 | Alice: **Limit** tab, **Sell NTU**, Limit Price `2`, Amount `100`, **Review order**. | 5 s |
| A4.2 | **Approve 100 NTU**, Confirm; **Place sell order**, Confirm. Wait until the Order Book shows an ask of 100 at 2.0000. | **14 s** |
| A4.3 | In MetaMask switch to **Bob**; check the header shows Bob. **Buy NTU**, Limit Price `2.2`, Amount `40`, **Review order**. | 5 s |
| A4.4 | **Approve 88 SGDx**, Confirm; **Place buy order**, Confirm. Wait for the result card (paid 80 SGDx, refunded 8 SGDx). | **20 s**: point at the 80 and the 8, then at order #1 Partially Filled in the book or My Orders |
| A4.5 | Switch MetaMask back to **Alice** (check the header). Open **My Orders**, press **Cancel** on order #1, **Confirm cancel**, Confirm in MetaMask. Wait for "Order #1 cancelled", refund 60 NTU. | **12 s** |

### Segment 5. Bonus 2: batch matching by a keeper

| # | Do | Hold |
|---|---|---|
| A5.1 | **Pause** the recording (Person 1 pauses the stopwatch). In Terminal B, run `scripts/seed-crossed-book.sh seed --rpc-url http://127.0.0.1:8549` and wait for "Result: the book is crossed and ready". Then run `scripts/seed-crossed-book.sh status --rpc-url http://127.0.0.1:8549`; it must say "PASS the book is CROSSED" and "2 fills". Show the Trade page with the **Match Orders** panel, then **resume** the recording. | **22 s** on the Trade page with the Match Orders panel |
| A5.2 | In MetaMask switch to **Keeper** (check the header). | **12 s**: point at the Match Orders panel |
| A5.3 | **Review match** (shows `matchOrders(10)`, about 2 fills, no approval), **Confirm match**, Confirm in MetaMask. Wait for "Matched: 2 fills settled", orders #23 to #26 Filled, Still Crossed Afterwards: No. | 4 s |
| A5.4 | Terminal B: `scripts/seed-crossed-book.sh verify-after --rpc-url http://127.0.0.1:8549` (ends "Result: every check passed"). | **7 s** |
| A5.5 | Switch MetaMask back to **Alice** (check the header) and open **Trade**. | 2 s |

### Segment 6. Bonus 3: stop-limit order, trigger and execution

| # | Do | Hold |
|---|---|---|
| A6.1 | Alice: **Stop-Limit** tab, **Sell NTU**, Trigger Price `1.8`, Limit Price `1.7`, Amount `10`, **Review stop-limit order**. | 5 s |
| A6.2 | **Approve 10 NTU**, Confirm; **Place sell stop-limit order**, Confirm. | **8 s** on the result ("Stop-limit order #27 placed and pending") |
| A6.3 | Point at My Orders: order #27, Pending Trigger, Waiting for price, not in the Order Book. | **17 s** |
| A6.4 | In Terminal B, run `scripts/seed-stop-orders.sh move-price 1.8 --rpc-url http://127.0.0.1:8549`. It prints "last trade price is now 1.8" and "would now activate: 1 stop". Then run `scripts/seed-stop-orders.sh add-bid 1.9 4 --rpc-url http://127.0.0.1:8549`, which rests a buy of 4 NTU at 1.9. Back in the browser, point at the **Eligible Now** chip. | **8 s** on the Eligible Now chip |
| A6.5 | Switch MetaMask to **Keeper** (check the header). **Review trigger**, **Confirm trigger**, Confirm in MetaMask. Wait for "Triggered: 1 stop order activated", #27 Partially Filled, 4 NTU and 7.6 SGDx, last trade 1.9. | **19 s**: point at the 4 NTU, the 1.9 and the 7.6 SGDx |

### Segment 7. Limitations and conclusion

| # | Do | Hold |
|---|---|---|
| A7.1 | Switch back to the app's Overview page. | **28 s**, then **Stop recording** |

**After Call 1:** Zoom converts the recording when the meeting ends (`VIDEO_PLAN.md`, section 5). Play it once from start to finish and check:
- The length is about 7:30, and no more than 9:00 (9:30 at the very most).
- There is no sound, or only silence.
- Every MetaMask popup and result is readable.
- No key or recovery phrase is visible.

Keep this silent file; Call 2 plays it.

**If the take runs long** (past "latest" at a checkpoint, or over 9:00 at the end), take it again after the reset in `VIDEO_PLAN.md`, section 6. This time, pause the recording while a MetaMask popup is loading, a block is mining or the MetaMask account menu is open, and resume when the next screen is ready. Never pause while a result is on screen.

Never shorten a **Hold**, and never cut a feature in the requirements table above: a shorter hold means the voice-over cannot fit, and a cut feature is a missing requirement.

---

# Part B. Call 2: voice-over (both speak)

**Between the calls (about 15 minutes):** both of you watch the silent recording once. In the **At** column below, write the time (minutes and seconds) at which each cue appears, starting from Person 1's stopwatch notes. If a hold turned out short, mark that line so its speaker starts a moment early.

**How to use this part**
- Read your lines word for word, starting when the cue in **Start when you see** appears. The **At** time is a backup.
- Speak calmly, at about two words per second: slower than conversation, with a short pause at each full stop. The holds in Part A were sized for that pace. A small slip is fine: carry on. For a bad mistake, stop and redo the whole voice-over (`VIDEO_PLAN.md`, section 5). A redo costs only about 8 minutes.
- If the screen is still waiting (a spinner or a MetaMask popup) and you have finished your line, stay silent or use a bridge line (`VIDEO_SCRIPT.md`, section 5).
- `[Person 1's name]` and `[Person 2's name]`: say your own name.

## 1. Introduction

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 1.1 | 0:00 | P2 | The video starts (the Overview page) | "Hello, I'm [Person 2's name]. Most exchanges are custodial: they hold your keys, so one hack can take your funds. We built a decentralized exchange where your tokens stay in your own wallet until you place an order." |
| 1.2 | | P1 | Right after 1.1 | "I'm [Person 1's name]. I wrote the on-chain trading engine. We'll run every core feature and all three bonuses live." |

## 2. Architecture

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 2.1 | | P2 | Figure 3 (the architecture diagram) appears | "MetaMask holds the keys and signs. Our Next.js app reads the chain directly, using wagmi and viem. TokenFactory issues ERC20 tokens, MarketFactory lists one market per token pair, and each market is an OrderBook contract that holds the escrow. There is no backend and no admin key." |
| 2.2 | | P1 | Right after 2.1 (the pointer rests on the OrderBook box) | "The engine is a price-time order book. Better prices fill first, and at equal prices the older order wins. Trades happen at the resting order's price, partial fills are supported, and every loop is bounded: at most ten fills per transaction." |

## 3. Token issuance and market listing

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 3.1 | | P2 | The Create Token form | "First, issuance. On Create Token I enter a name, a symbol and a supply, review, and confirm in MetaMask." |
| 3.2 | | P2 | The token result card | "TokenFactory deploys a standard ERC20: eighteen decimals, fixed supply, no owner." |
| 3.3 | | P2 | The List Market form | "Now I list a market with SGDx as the quote token, and confirm again." |
| 3.4 | | P1 | The market result (base FIZZ, quote SGDx) | "MarketFactory creates one order-book contract for that pair, so each market's escrow is isolated from every other market." |
| 3.5 | | P2 | The Tokens page | "Both now appear in Tokens and Markets." |

**Only if token creation failed twice in Call 1** and Person 2 showed the Markets page instead (`VIDEO_SCRIPT.md`, Segment 3 fallback), P2 says this instead, over the Markets page: "Token issuance and market listing work in the app the same way, and our integration tests cover them. Here are the markets."

## 4. Limit orders, partial fill, maker price and cancel

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 4.1 | | P2 | The Trade page with the Sell form filled in | "Back to NTU and SGDx. As Alice I sell one hundred NTU at a price of two. First an exact approval for one hundred NTU, then the order itself. The tokens move into escrow." |
| 4.2 | | P1 | The ask of 100 at 2 in the Order Book | "That escrow is what makes the exchange non-custodial: the contract holds exactly what the order needs, and nothing else. Alice's sell now rests in the book." |
| 4.3 | | P2 | The header shows Bob, the Buy form | "Now Bob buys forty NTU with a limit of two point two. He approves eighty-eight SGDx, the most he could pay, and places the order." |
| 4.4 | | P1 | Bob's result card (paid 80, refunded 8) | "It matches at once, at Alice's price of two, not Bob's limit. Forty NTU for eighty SGDx, and the eight SGDx of price improvement come straight back to Bob. Alice's order is partially filled: sixty NTU still rest." |
| 4.5 | | P2 | The header shows Alice again, My Orders | "That is Bonus one. Alice cancels the unfilled remainder, confirms once, and exactly sixty NTU return to her wallet. The order reads Cancelled and has left the book." |

## 5. Bonus 2: batch matching by a keeper

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 5.1 | | P1 | The cut to the Trade page with the Match Orders panel | "A single placement makes at most ten fills, so a large order can leave the book crossed. Bonus two: anyone can call matchOrders, pays only gas, and gains nothing. We prepared this crossed book off camera, because building it takes twenty-four orders." |
| 5.2 | | P2 | The header shows Keeper | "The Match Orders panel has appeared. As a keeper with no trading tokens I review, then confirm, and one transaction settles four traders' orders." |
| 5.3 | | P1 | "Matched: 2 fills settled" | "Two fills, two NTU, four SGDx, and the keeper's token balances did not change." |

## 6. Bonus 3: stop-limit order, trigger and execution

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 6.1 | | P2 | The Stop-Limit form filled in | "Bonus three, a stop-limit order. As Alice I sell ten NTU with a trigger price of one point eight and a limit price of one point seven. Approve, then place. The order is Pending Trigger, escrowed, and not in the order book." |
| 6.2 | | P1 | My Orders: #27 Pending Trigger, Waiting for price | "The trigger price is only a condition: once the last trade price reaches one point eight, the stop becomes eligible. Eligible is not activated, and activation does not guarantee a trade." |
| 6.3 | | P2 | Terminal B (the move-price command) | "Now two other traders trade at one point eight, and a bid for four NTU at one point nine rests. The stop shows Eligible Now. The keeper reviews and triggers." |
| 6.4 | | P1 | "Triggered: 1 stop order activated" | "The stop activated and filled four NTU at one point nine, the resting bid's price, not the trigger and not the limit. Six NTU rest at the limit, and Alice received seven point six SGDx." |

## 7. Limitations and conclusion

| # | At | Who | Start when you see | Say |
|---|---|---|---|---|
| 7.1 | | P2 | The Overview page again | "In summary, ERC20 issuance, listing, limit orders, partial fills and all three bonuses work end to end." |
| 7.2 | | P1 | Right after 7.1 | "Our tests, security checks and AI audit are documented in the AI Audit Report. The limits: a local chain only, an AI audit only, and we did not run the MetaMask failure cases. Thank you." |

The host stops the recording when the silent video ends.

## After Call 2

Rename the file to **`GroupName.mp4`** (your group's name). Check that it is at most **10 minutes** and **300 MB**, and play it once from start to finish (`VIDEO_PLAN.md`, section 11).
