# Video cue sheet: read along while recording

The same words as [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md), in the order they happen. Each row is one step: **DO** is a screen action by Person 2 (P2), **SAY** is a line read aloud word for word by the named speaker. Wait for a DO to finish (the MetaMask popup confirmed, the result card on screen) before reading the next SAY. Setup, fallbacks and the reset procedure are in [`VIDEO_PLAN.md`](VIDEO_PLAN.md); if this sheet and the script ever differ, the script wins.

**Requirements (NTULearn):** at most **10 minutes** and **300 MB**, file named **`GroupName.mp4`**, starting with the architecture and showing a hands-on demo of the locally deployed system. The plan aims at about 7:30, which leaves time for MetaMask waits; never rush a confirmation to save seconds.

**Before you press Record:** Steps 0 to 6 of `VIDEO_PLAN.md` are done on a fresh chain (8549, app on 3103); Alice is the active MetaMask account and is connected; the evidence tabs are open (plan, section 8); Terminal B is cleared with `PS1='$ '`.

**Accounts:** Alice = Anvil account 1, Bob = account 2, Keeper = account 4 (no trading tokens). After every account switch, check the address in the app's header.

---

## 1. Introduction (0:00 to 0:30) — the app's Overview page

| # | Who | DO or SAY |
|---|---|---|
| 1.1 | P2 SAY | "Hello, I'm [Person 2's name]. Most exchanges are custodial: they hold your keys, so one hack can take your funds. We built a decentralized exchange where your tokens stay in your own wallet until you place an order." |
| 1.2 | P1 SAY | "I'm [Person 1's name]. I wrote the on-chain trading engine. We'll run every core feature and all three bonuses live, then show how we tested it and how AI helped." |
| 1.3 | P2 DO | Open the Figure 3 tab (`docs/report/diagrams/03-system-architecture.png`). |

## 2. Architecture (0:30 to 1:15) — Figure 3

| # | Who | DO or SAY |
|---|---|---|
| 2.1 | P2 SAY | "MetaMask holds the keys and signs. Our Next.js app reads the chain directly, using wagmi and viem. TokenFactory issues ERC20 tokens, MarketFactory lists one market per token pair, and each market is an OrderBook contract that holds the escrow. There is no backend and no admin key." (Point the mouse at MetaMask, the app, then the on-chain box as you name them.) |
| 2.2 | P1 SAY | "The engine is a price-time order book. Better prices fill first, and at equal prices the older order wins. Trades happen at the resting order's price, partial fills are supported, and every loop is bounded: at most ten fills per transaction." |
| 2.3 | P2 DO | Switch to the app tab and open **Create Token**. |

## 3. Token issuance and market listing (1:15 to 2:00) — Alice

| # | Who | DO or SAY |
|---|---|---|
| 3.1 | P2 DO | Type Name `Fizz Coin`, Symbol `FIZZ`, Supply `1000000`. |
| 3.2 | P2 SAY | "First, issuance. On Create Token I enter a name, a symbol and a supply, review, and confirm in MetaMask." |
| 3.3 | P2 DO | **Review token**, **Create token**, **Confirm** in MetaMask. Wait for the result card (18 decimals, supply 1,000,000, "Issued by TokenFactory"). |
| 3.4 | P2 SAY | "TokenFactory deploys a standard ERC20: eighteen decimals, fixed supply, no owner." |
| 3.5 | P2 DO | **List a market for this token**, choose **SGDx** as the quote, tick the orientation box, **List market**. |
| 3.6 | P2 SAY | "Now I list a market with SGDx as the quote token, and confirm again." |
| 3.7 | P2 DO | **Confirm** in MetaMask. Wait for the market result (base FIZZ, quote SGDx). |
| 3.8 | P1 SAY | "MarketFactory creates one order-book contract for that pair, so each market's escrow is isolated from every other market." |
| 3.9 | P2 DO | Click **Tokens**, then **Markets** (two markets: NTU / SGDx and FIZZ / SGDx). |
| 3.10 | P2 SAY | "Both now appear in Tokens and Markets." |
| 3.11 | P2 DO | Click **Trade** and choose **NTU / SGDx**. |

## 4. Limit orders, partial fill, maker price and cancel (2:00 to 3:40)

| # | Who | DO or SAY |
|---|---|---|
| 4.1 | P2 DO | Alice: **Limit** tab, **Sell NTU**, Limit Price `2`, Amount `100`, **Review order**. |
| 4.2 | P2 SAY | "Back to NTU and SGDx. As Alice I sell one hundred NTU at a price of two. First an exact approval for one hundred NTU, then the order itself. The tokens move into escrow." |
| 4.3 | P2 DO | **Approve 100 NTU**, Confirm; **Place sell order**, Confirm. Wait until the Order Book shows an ask of 100 at 2.0000. |
| 4.4 | P1 SAY | "That escrow is what makes the exchange non-custodial: the contract holds exactly what the order needs, and nothing else. Alice's sell now rests in the book." |
| 4.5 | P2 DO | In MetaMask switch to **Bob**; check the header shows Bob. **Buy NTU**, Limit Price `2.2`, Amount `40`, **Review order**. |
| 4.6 | P2 SAY | "Now Bob buys forty NTU with a limit of two point two. He approves eighty-eight SGDx, the most he could pay, and places the order." |
| 4.7 | P2 DO | **Approve 88 SGDx**, Confirm; **Place buy order**, Confirm. Wait for the result card (paid 80 SGDx, refunded 8 SGDx). |
| 4.8 | P1 SAY | "It matches at once, at Alice's price of two, not Bob's limit. Forty NTU for eighty SGDx, and the eight SGDx of price improvement come straight back to Bob. Alice's order is partially filled: sixty NTU still rest." |
| 4.9 | P2 DO | Switch MetaMask back to **Alice** (check the header). Open **My Orders**, press **Cancel** on order #1, **Confirm cancel**, Confirm in MetaMask. Wait for "Order #1 cancelled", refund 60 NTU. |
| 4.10 | P2 SAY | "That is Bonus one. Alice cancels the unfilled remainder, confirms once, and exactly sixty NTU return to her wallet. The order reads Cancelled and has left the book." |

## 5. Bonus 2: batch matching by a keeper (3:40 to 4:25)

| # | Who | DO or SAY |
|---|---|---|
| 5.1 | P2 DO | **Pause** the Zoom recording. In Terminal B: `scripts/seed-crossed-book.sh seed --rpc-url http://127.0.0.1:8549`, wait for "Result: the book is crossed and ready", then `scripts/seed-crossed-book.sh status --rpc-url http://127.0.0.1:8549` must say "PASS the book is CROSSED" and "2 fills". Show the Trade page. **Resume** the recording. |
| 5.2 | P1 SAY | "A single placement makes at most ten fills, so a large order can leave the book crossed. Bonus two: anyone can call matchOrders, pays only gas, and gains nothing. We prepared this crossed book off camera, because building it takes twenty-four orders." |
| 5.3 | P2 DO | In MetaMask switch to **Keeper** (check the header). The **Match Orders** panel is visible. |
| 5.4 | P2 SAY | "The Match Orders panel has appeared. As a keeper with no trading tokens I review, then confirm, and one transaction settles four traders' orders." |
| 5.5 | P2 DO | **Review match** (shows `matchOrders(10)`, about 2 fills, no approval), **Confirm match**, Confirm in MetaMask. Wait for "Matched: 2 fills settled", orders #23 to #26 Filled, Still Crossed Afterwards: No. Then in Terminal B: `scripts/seed-crossed-book.sh verify-after --rpc-url http://127.0.0.1:8549` (ends "Result: every check passed"). |
| 5.6 | P1 SAY | "Two fills, two NTU, four SGDx, and the keeper's token balances did not change." |
| 5.7 | P2 DO | Switch MetaMask back to **Alice** (check the header) and open **Trade**. |

## 6. Bonus 3: stop-limit order, trigger and execution (4:25 to 5:40)

| # | Who | DO or SAY |
|---|---|---|
| 6.1 | P2 DO | Alice: **Stop-Limit** tab, **Sell NTU**, Trigger Price `1.8`, Limit Price `1.7`, Amount `10`, **Review stop-limit order**. |
| 6.2 | P2 SAY | "Bonus three, a stop-limit order. As Alice I sell ten NTU with a trigger price of one point eight and a limit price of one point seven. Approve, then place. The order is Pending Trigger, escrowed, and not in the order book." |
| 6.3 | P2 DO | **Approve 10 NTU**, Confirm; **Place sell stop-limit order**, Confirm. Point at My Orders: order #27, Pending Trigger, Waiting for price. |
| 6.4 | P1 SAY | "The trigger price is only a condition: once the last trade price reaches one point eight, the stop becomes eligible. Eligible is not activated, and activation does not guarantee a trade." |
| 6.5 | P2 DO | Terminal B: `scripts/seed-stop-orders.sh move-price 1.8 --rpc-url http://127.0.0.1:8549` (prints "last trade price is now 1.8" and "would now activate: 1 stop"), then `scripts/seed-stop-orders.sh add-bid 1.9 4 --rpc-url http://127.0.0.1:8549` (a resting buy of 4 NTU at 1.9). Back in the browser, point at the **Eligible Now** chip. |
| 6.6 | P2 SAY | "Now two other traders trade at one point eight, and a bid for four NTU at one point nine rests. The stop shows Eligible Now. The keeper reviews and triggers." |
| 6.7 | P2 DO | Switch MetaMask to **Keeper** (check the header). **Review trigger**, **Confirm trigger**, Confirm in MetaMask. Wait for "Triggered: 1 stop order activated", #27 Partially Filled, 4 NTU and 7.6 SGDx, last trade 1.9. |
| 6.8 | P1 SAY | "The stop activated and filled four NTU at one point nine, the resting bid's price, not the trigger and not the limit. Six NTU rest at the limit, and Alice received seven point six SGDx." |
| 6.9 | P2 DO | Switch to VS Code and open Figure 10 (`docs/report/diagrams/10-evidence-map.png`). |

## 7. Security, testing and audit evidence (5:40 to 6:30)

| # | Who | DO or SAY |
|---|---|---|
| 7.1 | P1 SAY | "Now the evidence behind the engine. We ran three hundred thirty-five Foundry tests, with full line and branch coverage of the order book. A stateful invariant suite replayed one hundred twenty-eight thousand random calls against an independent reference ledger, with no violations." |
| 7.2 | P2 DO | Switch to `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md`, "Verification evidence" table; scroll to each row as it is named. |
| 7.3 | P1 SAY | "Slither reported twenty-seven results, none real. Of sixty-seven deliberate mutants, sixty-five were caught, and the other two are documented as equivalent. A final AI audit found no critical or high issue. The one accepted medium issue, a dust sandwich through the fill cap, is documented and pinned by a test. It was an AI audit, not a human one." |
| 7.4 | P2 DO | Open `CLAUDE.md` (top). |

## 8. AI-assisted methodology and lessons (6:30 to 7:10)

| # | Who | DO or SAY |
|---|---|---|
| 8.1 | P1 SAY | "We set the rules in specification files; the AI coded inside them. A fresh AI reviewer checked each phase, and we decided every fix." |
| 8.2 | P2 DO | Open `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md`, section 4. |
| 8.3 | P1 SAY | "It found issue six: about one hundred two wei could block every trigger, and we chose auto-cancel. We logged twenty-four issues, each with its evidence." (P2 shows the `docs/ai-audit/issues/` folder on the last sentence.) |
| 8.4 | P2 DO | Open `docs/ai-audit/issues/p2-017-cancelled-stop-labelled-activated.md`. |
| 8.5 | P2 SAY | "On the front end, mock-wallet tests passed while real MetaMask exposed a stale-nonce problem and a misleading label on a cancelled stop. Different kinds of evidence prove different things, so we kept them apart." |
| 8.6 | P2 DO | Switch back to the app's Overview page. |

## 9. Limitations and conclusion (7:10 to 7:30)

| # | Who | DO or SAY |
|---|---|---|
| 9.1 | P2 SAY | "In summary, ERC20 issuance, listing, limit orders, partial fills and all three bonuses work end to end." |
| 9.2 | P1 SAY | "The limits: a local chain only, an AI audit only, and we did not run the MetaMask failure cases. Thank you." |
| 9.3 | P2 DO | Wait two seconds, then **Stop recording**. |

## After recording

Rename the file to **`GroupName.mp4`** (your group's name), check that it is at most **10 minutes** and **300 MB**, and play it once from the start (`VIDEO_PLAN.md`, section 11).

**If something goes wrong:** the fallback for every step is in the "If it does not work" line of the same segment in `VIDEO_SCRIPT.md`. A slow confirmation can be covered with a bridge line (script, section 5).
