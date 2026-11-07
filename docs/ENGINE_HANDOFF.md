# Engine handoff (Person 1 → Person 2)

What the frontend needs to use the engine's bonus features. Behaviour is defined in [SPEC.md](../SPEC.md). The
interface ([CONTRACT_INTERFACE.md](../CONTRACT_INTERFACE.md), `contracts/src/interfaces/IOrderBook.sol`) is frozen and
**did not change**: every function, event and error below was already in the ABI. Only the bodies of `cancelOrder` and
`matchOrders` went from `revert()` stubs to real code.

- Part 1: cancel (Bonus 1) and batch matching (Bonus 2). **Ready.**
- Part 2: stop-limit (Bonus 3). **Ready.**

## Part 1: cancel and batch matching

**On main:** commit `d2b2ba3` (merge of Phase 5). Phase 4 (cancel) was merged in `dab79f8`.
This handoff and the full-stack factory test were added later, on top of that.

**Verified end to end**, on a scratch Anvil (port 8546) deployed with `contracts/script/Deploy.s.sol` exactly as
[docs/DEPLOYMENT.md](DEPLOYMENT.md) describes. The addresses were the documented fresh-chain values. The journey
below then ran with `cast`, and every balance check passed. Results are in the prompt log (2026-11-07, Stage 3). The same
journey is an automated test: `contracts/test/Integration.Factory.t.sol` (TokenFactory → MarketFactory → OrderBook).

### What you must re-run (the deployed engine is out of date)
`MarketFactory` embeds OrderBook's creation code, so **markets on an existing chain still have the stub
`cancelOrder` and `matchOrders`**, which revert with empty data. Nothing migrates.

```bash
# 1. Fresh chain (restart Anvil), then deploy as usual
export RPC_URL=http://127.0.0.1:8545
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cd contracts && forge build --sizes   # MarketFactory must stay < 24,576 B runtime and < 49,152 B initcode
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"
cd ..
# 2. Regenerate web/lib/contracts/abis.ts and deployments.ts (needs Node 22.18+)
node contracts/script/export-web.mjs --rpc-url "$RPC_URL"
node contracts/script/export-web.mjs --check --rpc-url "$RPC_URL"
node --test contracts/script/export-web.test.mjs
```
- On the current chain, the exporter's bytecode check (DEPLOYMENT.md, "How it stays honest" item 4) should refuse
  the old deployment once `contracts/out` holds the new build. That refusal is the signal to redeploy. I have not run
  the exporter: Node is not installed on Person 1's machine.
- On a fresh Anvil the addresses are the same as before (checked on the scratch deploy), so `deployments.ts` should not
  change. `abis.ts` will change: the `cancelOrder` input is named `orderId`, and the `matchOrders` input and output are
  named `maxMatches` and `matchesDone`. Selectors are unchanged.
- MetaMask may need "Clear activity tab data" after the Anvil restart (see DEPLOYMENT.md).
- Sizes after Part 1: OrderBook 7,239 B runtime and 7,902 B initcode; MarketFactory 9,286 B runtime and 9,315 B initcode. (Part 2 has the sizes after stop-limit.)

### Functions

| Signature | Who may call | Returns | Reverts with |
|---|---|---|---|
| `cancelOrder(uint256 orderId)` | Only the order's trader | nothing | `NotOrderOwner()` if the caller is not the trader, **including any unknown or never-used ID**. `OrderNotActive()` if the order is Filled or Cancelled. Owner is checked before status |
| `matchOrders(uint256 maxMatches) returns (uint256 matchesDone)` | Anyone. The caller sends and receives no tokens and needs no approval | the number of fills made, `0..maxMatches` | `InvalidMaxCount()` if `maxMatches == 0` or `maxMatches > MAX_MATCHES_PER_TX()` (10). **Never reverts just because there is nothing to match**: returns 0 |

Both are `nonReentrant`. A token that calls back into the book gets `ReentrancyGuardReentrantCall()`.

### Events, and when they fire

| Event | Fires when |
|---|---|
| `OrderCancelled(uint256 indexed orderId, address indexed trader, uint256 refundBase, uint256 refundQuote)` | Once per successful `cancelOrder`, **before** the refund transfer. Sell: `refundBase = amount - filled`, `refundQuote = 0`. Buy: `refundBase = 0`, `refundQuote = lockedQuote` (the remaining escrow). The token only moves if the amount is non-zero |
| `Trade(uint256 indexed makerOrderId, uint256 indexed takerOrderId, address maker, address taker, uint256 price, uint256 baseAmount, uint256 quoteAmount)` | Once per fill, from `placeLimitOrder` **or** `matchOrders`. In `matchOrders` both orders were already resting, and the **maker is the one that entered the book first**: it can be the bid or the ask. `price` is always the maker's price |

`matchOrders` emits **no** event of its own. Count its `Trade` logs, or use the return value from simulation. A no-op
emits nothing at all.

### Errors to add to `CONTRACT_ERROR_TEXT` (`web/lib/errors.ts`)
These three have no entry today, so they show the generic "The contract rejected this transaction".

| Error | Suggested title | Suggested detail |
|---|---|---|
| `NotOrderOwner` | "This is not your order" | "Only the account that placed an order can cancel it. Check the connected account." |
| `OrderNotActive` | "This order can no longer be cancelled" | "It is already filled or cancelled. Refresh your orders." |
| `InvalidMaxCount` | "Invalid match count" | "Choose between 1 and the engine's per-transaction limit (MAX_MATCHES_PER_TX, 10)." |

### Call flows

**Cancel** (an order in My orders with status Open (0) or PartiallyFilled (1)):
1. Show the button only when `order.trader == account` and the status is 0 or 1. The engine enforces both, but this
   avoids a failed transaction.
2. Show the expected refund from `getOrder(id)`: a sell gets `amount - filled` base, a buy gets `lockedQuote` quote.
   No approval is needed.
3. Simulate, then send `cancelOrder(id)`.
4. From the receipt, decode `OrderCancelled` and show the exact refund. The order now reads status Cancelled (3), and
   it has left `getBook`. It stays in `getUserOrderIds`.

The brief's journey, as verified on the scratch chain:

| Step | Call | Result |
|---|---|---|
| 1 | Alice `approve(market, 100 NTU)`; `placeLimitOrder(1 /*Sell*/, 2e18, 100e18)` | order 1 Open; the market holds 100 NTU |
| 2 | Bob `approve(market, requiredQuote(40e18, 2e18))` (= 80 SGDx); `placeLimitOrder(0 /*Buy*/, 2e18, 40e18)` | 1 `Trade`; order 2 Filled, order 1 PartiallyFilled; the market holds 60 NTU |
| 3 | Bob `cancelOrder(1)` | reverts `NotOrderOwner` (`0xf6412b5a`) |
| 4 | Alice `cancelOrder(1)` | `OrderCancelled(1, alice, 60e18, 0)`; Alice +60 NTU; the market holds 0 |
| 5 | Alice `cancelOrder(1)` again | reverts `OrderNotActive` (`0x1d4ecc5b`) |

**Batch match** (`matchOrders`):
- When it is needed: only when the book is **crossed**, meaning `getBestBid().price >= getBestAsk().price` with both
  IDs non-zero. That happens when a placement hit the 10-fill cap while it still crossed (the `crossedRemainder` /
  `hitCap` case you already detect in `order-plan.ts` and `order-result.tsx`).
- Suggested UI: when the book is crossed, show "The book is crossed: N orders can match" and a **Match orders** button
  that anyone can press.
  1. Simulate `matchOrders(10)` from the connected account. The return value is the number of fills.
  2. Send it.
  3. Decode the `Trade` logs.
  4. Repeat while it returns 10 and the book is still crossed.
- The caller's own balances never change, apart from gas. Settled traders receive their tokens directly in that
  transaction. One call can settle many different buyers and sellers at once (Bonus 2, "multi-party").
- Verified on the scratch chain:
  - Alice and Carol posted 22 asks of 1 NTU at 2.
  - Bob bid 11 at 3, and account 0 bid 11 at 2.5. Each bid hit the cap and rested 1 NTU crossed.
  - `matchOrders(0)` and `matchOrders(11)` reverted with `InvalidMaxCount` (`0xac38930b`).
  - From account 4, which holds no tokens, a simulated `matchOrders(10)` returned 2. The sent transaction made
    2 `Trade` logs and used 223,001 gas.
  - Orders 23 to 26 were Filled, and Alice, Carol, Bob and account 0 were all settled in that one transaction.
  - Account 4 still held 0 NTU and 0 SGDx, and the market held 0 of each.
  - A second `matchOrders(1)` simulated as 0.

### Stale frontend files (only Person 2 edits these)

| File | What is stale |
|---|---|
| `web/lib/contracts/abis.ts` | **Regenerated on 7 Nov** with your exporter, after Phase 6 (see "ABI regenerated" below). Nothing to do unless the engine changes again |
| `web/components/trade/my-orders.tsx:15-17` | The comment says there is no cancel control because `cancelOrder` "is not implemented yet". It is now: add the cancel button (flow above) |
| `web/components/trade/order-result.tsx:121-126` | The `hitCap` notice says "`matchOrders` is not available yet". It is available: point to the Match orders action instead |
| `web/lib/errors.ts` | No entries for `NotOrderOwner`, `OrderNotActive`, `InvalidMaxCount` (table above) |
| `web/lib/order-plan.ts:39`, `web/lib/order-plan.test.ts:76`, `web/lib/trading.integration.test.ts:258` | Comments and test names say `matchOrders` is a stub or not available. The assertions themselves are still correct: placement is still capped at 10 fills and still leaves the remainder crossed. Only the wording is stale |
| `web/lib/tx-errors.test.ts:45` | Test name says "a stub like cancelOrder". No engine function reverts with empty data any more (Phase 6 implemented the last two stubs). The test still checks a valid decoder path, but its name is stale |
| `docs/DEPLOYMENT.md` | "Size check" quotes OrderBook 6,325 B and MarketFactory 8,358 B. The last bullet says four functions have unnamed parameters. After Phase 6 none do, once the ABI is regenerated |

### Notes for Person 2 (nothing of yours was edited)
- `Deploy.s.sol` and the factories needed **no** change: the deploy worked unchanged on the scratch chain.
- A scratch deploy should keep using `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` (your P2-005 fix). I did, and the repo's
  `contracts/broadcast/` and `contracts/cache/` were not written.

## ABI regenerated (7 Nov, after Phase 6)
`web/lib/contracts/abis.ts` was regenerated by `contracts/script/export-web.mjs` itself, unmodified, **without touching your local chain or its deployment record**:
1. A fresh scratch Anvil on port 8546 (chain 31337, block 0) was deployed with `Deploy.s.sol`, with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected to a scratch folder. The repo's `contracts/broadcast/` and `contracts/cache/` were never written.
2. `node contracts/script/export-web.mjs --rpc-url http://127.0.0.1:8546 --broadcast-file <scratch>/Deploy.s.sol/31337/run-latest.json --out <scratch>/export`
3. The generated `deployments.ts` was **byte-identical** to the committed one, compared against the committed git blob. Only `abis.ts` was copied into `web/lib/contracts/`.
4. `abis.ts` differs from the previous version only in 10 parameter and return **names**. Types and selectors are unchanged:
   - `cancelOrder(orderId)`
   - `matchOrders(maxMatches) returns (matchesDone)`
   - `placeStopLimitOrder(side, triggerPrice, limitPrice, amount) returns (orderId)`
   - `triggerStopOrders(maxCount) returns (triggered)`
5. `export-web.mjs --check` against those files: `abis.ts, deployments.ts are up to date for chain 31337` (exit 0). As a control, the old `abis.ts` gave `out of date: abis.ts` (exit 1).
6. `npm test`: 410 passed, 48 skipped, the same as before. `npx tsc --noEmit`: exit 0. `node --test contracts/script/export-web.test.mjs`: 21 passed. The scratch Anvil was then stopped.

**Windows note:** on a Windows checkout with `core.autocrlf=true`, `export-web.mjs --check` reports `out of date: deployments.ts`, even when the content is identical. The working copy has CRLF line endings, the exporter writes LF, and the check compares bytes. Two possible fixes: a `.gitattributes` rule `web/lib/contracts/*.ts text eol=lf`, or normalising line endings in the check. Both are your call, since these are your files. On WSL or Linux this does not happen.

**What you still need to do:** redeploy your own chain (fresh Anvil, deploy, then `node contracts/script/export-web.mjs --rpc-url "$RPC_URL"` and `--check`). Your markets run the old engine until then. On a fresh Anvil, the export should leave both files unchanged.

## Part 2: stop-limit (Bonus 3)

**On main:** the merge commit titled "Merge engine/phase-6 (Phase 6) into main". `git log --oneline -1 main` shows it.

Phase 6 changes OrderBook bytecode again, so **the re-run steps in Part 1 apply again**: fresh Anvil, deploy, export, `--check`. If you have not redeployed since Part 1, do it once now and you get cancel, batch matching and stop-limit together. No function, event or error was added: the stop-limit pieces were already in the frozen interface. Only the named parameters in `abis.ts` change, because the stubs are now implemented. **`abis.ts` is already regenerated** (next section). You still need the redeploy, because your chain runs the old bytecode.

### Functions

| Signature | Who may call | Returns | Reverts with |
|---|---|---|---|
| `placeStopLimitOrder(uint8 side, uint256 triggerPrice, uint256 limitPrice, uint256 amount) returns (uint256 orderId)` | Anyone, for themselves | the new order ID (IDs are shared with limit orders) | `ZeroAmount`, `ZeroPrice` (limit **or** trigger is 0), `InvalidLotSize`, `InvalidTickSize` (limit **or** trigger off the 1e9 tick), checked in that order. `BookTooDeep` if more than 100 stops on that side rank ahead of it. ERC20 errors if the escrow approval or balance is short |
| `triggerStopOrders(uint256 maxCount) returns (uint256 triggered)` | Anyone. The caller sends and receives no tokens | the number of stops activated, `0..maxCount` | `InvalidMaxCount` if `maxCount == 0` or `> MAX_MATCHES_PER_TX()` (10). **Returns 0, no revert**, before the first trade or when nothing is eligible |
| `cancelOrder(uint256 orderId)` | Owner | — | Now also accepts **PendingTrigger (4)** orders and refunds the full escrow |

**Escrow and approval:** the escrow is taken at placement, at the **limit** price, exactly like a limit order. Approve:
- for a buy stop, `requiredQuote(amount, limitPrice)` quote
- for a sell stop, `amount` base

The same `order-plan.ts` helpers apply, using `limitPrice`.

**Eligibility,** checked only inside `triggerStopOrders`:
- a **buy** stop when `lastTradePrice() >= triggerPrice`
- a **sell** stop when `lastTradePrice() <= triggerPrice`

A stop that is already eligible when placed still waits for the next `triggerStopOrders` call.

### Events, and when they fire

| Event | Fires when |
|---|---|
| `StopOrderPlaced(uint256 indexed orderId, address indexed trader, uint8 side, uint256 triggerPrice, uint256 limitPrice, uint256 amount)` | Once per successful `placeStopLimitOrder`, after the escrow pull. **There is no `OrderPlaced` for a stop** |
| `StopOrderTriggered(uint256 indexed orderId, uint256 lastTradePrice)` | Once per activation inside `triggerStopOrders`. The second field is the price that made it eligible, **not** the trigger price. Any `Trade` events for that order follow it in the same transaction |
| `OrderCancelled(...)` | As in Part 1, and also for a pending stop (full refund). **Also emitted inside `triggerStopOrders`** when an activated stop cannot enter the book, because more than 100 orders rank ahead of its limit price: the engine cancels it and refunds the remainder instead of failing the call (issue 006). The order's trader is in the event; the caller of the trigger is not |
| `Trade(...)` | Fills made by activated stops. The stop is always the **taker**, and the price is the resting maker's price |

### Order status for stops

| `status` | Meaning for the UI |
|---|---|
| 4 PendingTrigger | Waiting. Its escrow is held, it is **not** in `getBook` / best bid or ask, and it cannot fill |
| 0 Open / 1 PartiallyFilled | Activated, and now an ordinary resting limit order at `price` (the limit price) |
| 2 Filled | Activated and fully filled |
| 3 Cancelled | Cancelled by the owner, or by the engine at activation if the book was too deep. Tell these apart from the transaction that emitted `OrderCancelled`: `cancelOrder` versus `triggerStopOrders` |

`order.triggerPrice` is non-zero for every stop, before and after activation, so it marks an order as a stop.

### UI suggestions

**Placing.** Add a "Stop-limit" order type to the ticket with two prices.
- Explain it in one line: "When the last trade reaches the trigger, this becomes a limit order at your limit price."
- For a sell stop-loss, usually trigger ≤ last and limit ≤ trigger. For a buy stop, usually trigger ≥ last and limit ≥ trigger. The engine does not enforce either, so warn instead of blocking.
- Show the escrow (as for a limit order) and that it is taken now.

**Showing pending stops.**
- They are not in the book views. List them in **My orders** with status "Waiting for trigger", showing the trigger, limit, size and escrow, and a **Cancel** button, which refunds in full.
- `getUserOrderIds` + `getOrder` already return them. For a market-wide list, read `StopOrderPlaced` logs and keep the IDs whose `getOrder(id).status == 4`.
- Optionally mark a pending stop "eligible now" when `hasTradePrice()` and the eligibility rule above hold. Then it fires on the next trigger call.

**Trigger button.** Show a **Trigger stops** action whenever at least one pending stop is eligible.
1. Simulate `triggerStopOrders(10)` from the connected account. The return value is the number that would activate, and 0 means hide or disable the button.
2. Send it.
3. Decode `StopOrderTriggered`, `Trade` and any `OrderCancelled` logs.
4. Repeat while it returns 10.

Anyone can press it, and the caller's balances never change apart from gas. After triggering, the book can be **left crossed**: all activations in one call share 10 fills. If so, show the Part 1 **Match orders** action.

**Errors to add** to `web/lib/errors.ts`, beyond Part 1: none new. `InvalidMaxCount` (Part 1) covers `triggerStopOrders`, and `BookTooDeep` already has text. Consider a stop-specific wording for `BookTooDeep` from `placeStopLimitOrder`: "Too many stop orders on this side rank ahead of this trigger."

### Notes from the final engine audit (8 Nov) for the frontend and the factory
- **Auto-cancel versus owner cancel:** `OrderCancelled` names the order's owner as `trader` in both cases. To tell them apart, check the transaction: a `StopOrderTriggered` for the same order earlier in that transaction means an auto-cancel.
- **Price-improvement refunds have no event of their own.** Work them out per fill as the buyer's escrow before the fill, minus the cost, minus the escrow after (SPEC A5). Or compare `lockedQuote` before and after.
- **`createdAt` is the placement time**, even for an activated stop. Book priority uses an internal sequence stamped at activation, so do not sort the book by `createdAt`; `getBook` already returns it in priority order.
- **Factory, for Person 2:** `createMarket` is permissionless and rejects the reversed pair. Anyone who creates (SGDx, NTU) first would make `Deploy.s.sol`'s `createMarket(NTU, SGDx)` revert with `MarketExists`, leaving the market with inverted prices. This is only possible on a chain where someone acted before the deploy; a fresh Anvil is unaffected. Any 18-decimal token can be listed, which puts only that market's traders at risk.

### Known limitations to show or mention (SPEC section 8)
- `lastTradePrice` is set by any single trade, even 1 lot. An attacker can move it to set off stops, so they are for teaching purposes only.
- If a trigger call's shared 10-fill budget runs out, an activated stop can rest crossed. A fast trader can then fill it at its **limit** price before anyone presses Match orders. It never trades worse than its limit.
- An activated stop behind more than 100 better-priced orders is cancelled and refunded rather than resting.
- **Any limit order** can be sandwiched through the 10-fill cap ([issue 007](ai-audit/issues/007-dust-sandwich-of-capped-limit-order.md), accepted). An attacker who front-runs with 10 one-lot orders can make it pay up to its own limit price. **The ticket should encourage a tight limit**, for example by warning when the limit is far from the best opposite price, since the limit is the most a buyer can pay.

### Verified on a scratch chain
Run on Anvil port 8546. The Phase 6 build was deployed with `Deploy.s.sol`, unchanged, and the addresses were the usual fresh-chain values. The flow then ran with `cast`, and every check passed:

| Step | Result |
|---|---|
| Simulated `triggerStopOrders(10)` before any trade | returns 0 |
| Alice sells 1@2, Bob buys 1@2 | 1 `Trade`; last price 2 |
| Alice `placeStopLimitOrder(1 /*Sell*/, 1.8e18, 1.7e18, 10e18)` | `StopOrderPlaced`; status 4; the market holds her 10 NTU; `getBestAsk()` is `(0, 0)` |
| Carol `placeStopLimitOrder(0 /*Buy*/, 5e18, 2.5e18, 1e18)` | pending, with 2.5 SGDx escrowed |
| Keeper `triggerStopOrders(10)` at price 2 | success, 0 triggered (37,277 gas) |
| Bob bids 10@1.75 and 1@1.8; Alice sells 1@1.8 | last price falls to 1.8 |
| Keeper (account 4, no tokens): simulated return 1, then sent | 1 `StopOrderTriggered`, 1 `Trade` (182,193 gas). The stop sold 10 NTU into Bob's 1.75 bid: Alice +17.5 SGDx, last price 1.75 |
| Simulated trigger again | 0 |
| Bob `cancelOrder(4)` | reverts `NotOrderOwner` |
| Carol `cancelOrder(4)`, her pending buy stop | `OrderCancelled`, full 2.5 SGDx refunded (54,904 gas) |

Final balances:
- Alice: 9,988 NTU and 10,021.3 SGDx
- Bob: 10,012 NTU and 9,978.7 SGDx
- Carol: 10,000 SGDx
- the keeper: 0 and 0
- the market: 0 and 0

The same flow is an automated test: `test_stop_tradeMovesPriceKeeperTriggersSellStopAndItFills` in `contracts/test/Integration.Factory.t.sol`.

**Sizes now:** OrderBook 8,461 B runtime and 9,124 B initcode; MarketFactory 10,508 B runtime and 10,537 B initcode. That leaves 14,068 B under the 24,576 B limit.
