# Call 2: what to say (both)

Play the silent video. Start each line when you see its **▶ cue**.
Speak **slowly**, about two words a second, with a short pause at each full stop.
If you slip, carry on.

---

## 1 · Intro

▶ **The video starts**
**P2:** "Hello, I'm [Person 2's name]. Most exchanges are custodial: they hold your keys, so one hack can take your funds. We built a decentralized exchange where your tokens stay in your own wallet until you place an order."

▶ **Right after**
**P1:** "I'm [Person 1's name]. I wrote the on-chain trading engine. We'll run every core feature and all three bonuses live, then show how we tested it and how AI helped."

## 2 · Architecture

▶ **The architecture diagram appears**
**P2:** "MetaMask holds the keys and signs. Our Next.js app reads the chain directly, using wagmi and viem. TokenFactory issues ERC20 tokens, MarketFactory lists one market per token pair, and each market is an OrderBook contract that holds the escrow. There is no backend and no admin key."

▶ **Right after**
**P1:** "The engine is a price-time order book. Better prices fill first, and at equal prices the older order wins. Trades happen at the resting order's price, partial fills are supported, and every loop is bounded: at most ten fills per transaction."

## 3 · Create a token and list a market

▶ **The Create Token form**
**P2:** "First, issuance. On Create Token I enter a name, a symbol and a supply, review, and confirm in MetaMask."

▶ **The token result card**
**P2:** "TokenFactory deploys a standard ERC20: eighteen decimals, fixed supply, no owner."

▶ **The List Market form**
**P2:** "Now I list a market with SGDx as the quote token, and confirm again."

▶ **The market result (FIZZ / SGDx)**
**P1:** "MarketFactory creates one order-book contract for that pair, so each market's escrow is isolated from every other market."

▶ **The Tokens page**
**P2:** "Both now appear in Tokens and Markets."

## 4 · Sell, buy, partial fill, cancel

▶ **The Sell form filled in**
**P2:** "Back to NTU and SGDx. As Alice I sell one hundred NTU at a price of two. First an exact approval for one hundred NTU, then the order itself. The tokens move into escrow."

▶ **The ask of 100 at 2 in the order book**
**P1:** "That escrow is what makes the exchange non-custodial: the contract holds exactly what the order needs, and nothing else. Alice's sell now rests in the book."

▶ **The header shows Bob**
**P2:** "Now Bob buys forty NTU with a limit of two point two. He approves eighty-eight SGDx, the most he could pay, and places the order."

▶ **Bob's result card (80 paid, 8 refunded)**
**P1:** "It matches at once, at Alice's price of two, not Bob's limit. Forty NTU for eighty SGDx, and the eight SGDx of price improvement come straight back to Bob. Alice's order is partially filled: sixty NTU still rest."

▶ **The header shows Alice, My Orders**
**P2:** "That is Bonus one. Alice cancels the unfilled remainder, confirms once, and exactly sixty NTU return to her wallet. The order reads Cancelled and has left the book."

## 5 · Bonus 2: keeper matches the book

▶ **The cut to the Match Orders panel**
**P1:** "A single placement makes at most ten fills, so a large order can leave the book crossed. Bonus two: anyone can call matchOrders, pays only gas, and gains nothing. We prepared this crossed book off camera, because building it takes twenty-four orders."

▶ **The header shows Keeper**
**P2:** "The Match Orders panel has appeared. As a keeper with no trading tokens I review, then confirm, and one transaction settles four traders' orders."

▶ **"Matched: 2 fills settled"**
**P1:** "Two fills, two NTU, four SGDx, and the keeper's token balances did not change."

## 6 · Bonus 3: stop-limit order

▶ **The Stop-Limit form filled in**
**P2:** "Bonus three, a stop-limit order. As Alice I sell ten NTU with a trigger price of one point eight and a limit price of one point seven. Approve, then place. The order is Pending Trigger, escrowed, and not in the order book."

▶ **My Orders: #27 Pending Trigger**
**P1:** "The trigger price is only a condition: once the last trade price reaches one point eight, the stop becomes eligible. Eligible is not activated, and activation does not guarantee a trade."

▶ **The terminal (move-price)**
**P2:** "Now two other traders trade at one point eight, and a bid for four NTU at one point nine rests. The stop shows Eligible Now. The keeper reviews and triggers."

▶ **"Triggered: 1 stop order activated"**
**P1:** "The stop activated and filled four NTU at one point nine, the resting bid's price, not the trigger and not the limit. Six NTU rest at the limit, and Alice received seven point six SGDx."

## 7 · Security evidence

▶ **The evidence map (Figure 10)**
**P1:** "Now the evidence behind the engine. We ran three hundred thirty-five Foundry tests, with full line and branch coverage of the order book. A stateful invariant suite replayed one hundred twenty-eight thousand random calls against an independent reference ledger, with no violations."

▶ **The security summary table**
**P1:** "Slither reported twenty-seven results, none real. Of sixty-seven deliberate mutants, sixty-five were caught, and the other two are documented as equivalent. A final AI audit found no critical or high issue. The one accepted medium issue, a dust sandwich through the fill cap, is documented and pinned by a test. It was an AI audit, not a human one."

## 8 · AI methodology

▶ **CLAUDE.md**
**P1:** "We set the rules in specification files; the AI coded inside them. A fresh AI reviewer checked each phase, and we decided every fix."

▶ **Issue 006**
**P1:** "It found issue six: about one hundred two wei could block every trigger, and we chose auto-cancel. We logged twenty-four issues, each with its evidence."

▶ **Issue p2-017**
**P2:** "On the front end, mock-wallet tests passed while real MetaMask exposed a stale-nonce problem and a misleading label on a cancelled stop. Different kinds of evidence prove different things, so we kept them apart."

## 9 · Ending

▶ **The Overview page again**
**P2:** "In summary, ERC20 issuance, listing, limit orders, partial fills and all three bonuses work end to end."

▶ **Right after**
**P1:** "The limits: a local chain only, an AI audit only, and we did not run the MetaMask failure cases. Thank you."

⏹ **Stop recording when the video ends.**
