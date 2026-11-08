# Call 1: what to click (Person 2)

Mics muted. Start the stopwatch when you press Record.
**Go slowly.** "Hold" means keep the screen still and count the seconds.
Aim to finish at about **9:00**, and never later than **9:30**.

---

## 0:00 · Intro
1. The app's **Overview** page is already open → press **Record**
2. **Hold 35 s.** Slowly move the mouse over the market board, then Alice's balances

## 0:35 · Architecture
3. Open the **Figure 3** tab (architecture diagram)
4. **Hold 45 s.** Point at MetaMask → the app → TokenFactory → MarketFactory → OrderBook, then rest on OrderBook

## 1:20 · Create a token and list a market (Alice)
5. **Create Token** → Name `Fizz Coin`, Symbol `FIZZ`, Supply `1000000`
6. **Review token** → **Create token** → **Confirm** in MetaMask → **hold 8 s** on the result
7. **List a market for this token** → quote **SGDx** → tick the box → **List market** → **Confirm** → **hold 11 s**
8. Click **Tokens** (hold 3 s), then **Markets** (hold 5 s)
9. Click **Trade** → choose **NTU / SGDx**

## 2:26 · Sell, buy, partial fill, cancel
10. **Alice:** Limit → **Sell NTU** → price `2`, amount `100` → **Review order** → hold 5 s
11. **Approve 100 NTU** → Confirm → **Place sell order** → Confirm → **hold 14 s** on the order book
12. MetaMask → switch to **Bob** (check the header) → **Buy NTU** → price `2.2`, amount `40` → **Review order** → hold 5 s
13. **Approve 88 SGDx** → Confirm → **Place buy order** → Confirm → **hold 20 s** (point at 80 paid, 8 refunded)
14. MetaMask → switch to **Alice** → **My Orders** → **Cancel** order #1 → **Confirm cancel** → Confirm → **hold 12 s**

## 4:20 · Bonus 2: keeper matches the book
15. **⏸ Pause the recording.** In the terminal:
    `scripts/seed-crossed-book.sh seed --rpc-url http://127.0.0.1:8549`
    `scripts/seed-crossed-book.sh status --rpc-url http://127.0.0.1:8549` (must say CROSSED)
16. Show the **Trade** page with the Match Orders panel → **▶ Resume** → **hold 22 s**
17. MetaMask → switch to **Keeper** → **hold 12 s** (point at the Match Orders panel)
18. **Review match** → **Confirm match** → Confirm → hold 4 s on "Matched: 2 fills settled"
19. Terminal: `scripts/seed-crossed-book.sh verify-after --rpc-url http://127.0.0.1:8549` → **hold 7 s**
20. MetaMask → switch to **Alice** → **Trade**

## 5:29 · Bonus 3: stop-limit order
21. **Stop-Limit** → **Sell NTU** → trigger `1.8`, limit `1.7`, amount `10` → **Review stop-limit order** → hold 5 s
22. **Approve 10 NTU** → Confirm → **Place sell stop-limit order** → Confirm → **hold 8 s**
23. Point at **My Orders**: #27 Pending Trigger → **hold 17 s**
24. Terminal:
    `scripts/seed-stop-orders.sh move-price 1.8 --rpc-url http://127.0.0.1:8549`
    `scripts/seed-stop-orders.sh add-bid 1.9 4 --rpc-url http://127.0.0.1:8549`
25. Browser → point at **Eligible Now** → **hold 8 s**
26. MetaMask → switch to **Keeper** → **Review trigger** → **Confirm trigger** → Confirm → **hold 19 s** (point at 4 NTU, 1.9, 7.6 SGDx)

## 6:59 · Security evidence
27. VS Code → **Figure 10** (evidence map) → **hold 22 s**
28. **ENGINE_SECURITY_SUMMARY.md** → scroll slowly through the table → **hold 30 s**

## 7:51 · AI methodology
29. **CLAUDE.md** → **hold 13 s**
30. **Issue 006** (section 4) → after 7 s show the **issues folder** → **hold 14 s** in total
31. **Issue p2-017** → **hold 19 s**

## 8:37 · Ending
32. Back to the app's **Overview** page → **hold 21 s** → **⏹ Stop recording**

---

**If a step fails:** ⏸ pause → fix it → put the screen back as it was → ▶ resume.
**Before every Confirm:** leave the MetaMask popup on screen for about 2 seconds.
