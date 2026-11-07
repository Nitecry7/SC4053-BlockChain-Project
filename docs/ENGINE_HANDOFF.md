# Engine handoff (Person 1 → Person 2)

What the frontend needs to use the engine's bonus features. Behaviour is defined in [SPEC.md](../SPEC.md). The
interface ([CONTRACT_INTERFACE.md](../CONTRACT_INTERFACE.md), `contracts/src/interfaces/IOrderBook.sol`) is frozen and
**did not change**: every function, event and error below was already in the ABI. Only the bodies of `cancelOrder` and
`matchOrders` went from `revert()` stubs to real code.

- Part 1: cancel (Bonus 1) and batch matching (Bonus 2). **Ready.**
- Part 2: stop-limit (Bonus 3). Placeholder, coming in Phase 6.

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
- Sizes on main now: OrderBook 7,239 B runtime and 7,902 B initcode; MarketFactory 9,286 B runtime and 9,315 B initcode.

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
| `web/lib/contracts/abis.ts` | Generated before Phase 4. Unnamed `cancelOrder` and `matchOrders` parameters. Regenerate with the exporter (above). Do not hand-edit |
| `web/components/trade/my-orders.tsx:15-17` | The comment says there is no cancel control because `cancelOrder` "is not implemented yet". It is now: add the cancel button (flow above) |
| `web/components/trade/order-result.tsx:121-126` | The `hitCap` notice says "`matchOrders` is not available yet". It is available: point to the Match orders action instead |
| `web/lib/errors.ts` | No entries for `NotOrderOwner`, `OrderNotActive`, `InvalidMaxCount` (table above) |
| `web/lib/order-plan.ts:39`, `web/lib/order-plan.test.ts:76`, `web/lib/trading.integration.test.ts:258` | Comments and test names say `matchOrders` is a stub or not available. The assertions themselves are still correct: placement is still capped at 10 fills and still leaves the remainder crossed. Only the wording is stale |
| `web/lib/tx-errors.test.ts:45` | Test name says "a stub like cancelOrder". The empty-revert case is still valid for `placeStopLimitOrder` and `triggerStopOrders` until Phase 6 |
| `docs/DEPLOYMENT.md` | "Size check" quotes OrderBook 6,325 B and MarketFactory 8,358 B. The last bullet says four functions have unnamed parameters, but now only the two stop-limit stubs do |

### Notes for Person 2 (nothing of yours was edited)
- `Deploy.s.sol` and the factories needed **no** change: the deploy worked unchanged on the scratch chain.
- A scratch deploy should keep using `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` (your P2-005 fix). I did, and the repo's
  `contracts/broadcast/` and `contracts/cache/` were not written.

## Part 2: stop-limit (Bonus 3)

_Placeholder. Phase 6 will fill this in:_
- `placeStopLimitOrder` and `triggerStopOrders`
- the `StopOrderPlaced` and `StopOrderTriggered` events
- `cancelOrder` on PendingTrigger (4) orders
- how to show pending stops (they are not in `getBook`)
- the trigger button
- the re-run steps
