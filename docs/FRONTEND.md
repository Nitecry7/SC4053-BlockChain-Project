# Front end (Person 2): wallet, on-chain data and limit-order trading

Status: **P2-8C** (the three bonus interfaces plus a usability polish). The app connects a wallet, reads the local deployment, places **limit orders** (with the ERC20 approval they need) on any market listed through MarketFactory, issues new tokens through TokenFactory and lists new markets through MarketFactory. **Order cancellation is built** (P2-8B.2; its happy path was run with MetaMask by the owner) and **batch matching is built** (P2-8B.3, a Match Orders panel on Trade; mock-wallet and real-chain verified; its happy path was confirmed with MetaMask by the owner on a scratch chain). **Stop-limit orders are built** (P2-8B.4: a Stop-Limit mode in the ticket, pending stops in My Orders, and a Trigger Stops panel; mock-wallet and real-chain verified; its happy path was run with MetaMask by the owner on a scratch chain). **P2-8C** added one Title Case label convention, information tips, coloured status badges, the Trigger Price in My Orders and an evidence-based stop history (section "Usability and consistency"). The MetaMask rejection, account-switch, outage and chain-reset cases have not been run.

## Run it
```bash
cd web
npm ci                       # exact versions from package-lock.json
cp .env.example .env.local   # optional; the defaults target http://127.0.0.1:8545
npm run dev                  # http://localhost:3000
```
The app expects the deployment from `docs/DEPLOYMENT.md` on the RPC it points at. Without it, the dashboard says so ("No SC4053 DEX deployment on this chain") instead of showing data.

Checks: `npm run typecheck`, `npm run lint`, `npm test` (vitest), `npm run build`. The real-chain and browser suites are described under "Testing" below.

## Environment (public values only)
| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | `http://127.0.0.1:8545` | Local Anvil JSON-RPC. Must be http(s). Shipped to the browser, so it must never contain a key or credential |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty | Optional WalletConnect Cloud project id (32 hex characters, a public identifier) |

**WalletConnect project id.** Without one, the connect dialog offers the injected browser wallet only, which is how desktop MetaMask connects. To enable WalletConnect (mobile and QR), create a project at WalletConnect Cloud (`https://cloud.walletconnect.com`, the address RainbowKit's docs give; it may now redirect to Reown), copy its project id into `.env.local` as `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, and restart the dev server. No placeholder id is ever used:
- RainbowKit throws on an empty id, and silently substitutes its own example project for `YOUR_PROJECT_ID`.
- `lib/config.ts` therefore treats both as "not configured", and rejects anything that is not a 32-character id.

## Versions (decision record)
Verified against the npm registry, Context7 and the installed sources on 2026-11-05.

| Package | Version | Why |
|---|---|---|
| next | 16.4.5 | App Router, Turbopack; peers `react ^19` |
| react / react-dom | 19.3.1 | |
| @rainbow-me/rainbowkit | 2.2.11 | Your choice. Peers `wagmi ^2.9.0` |
| wagmi | ^2.19.5 | RainbowKit 2 needs wagmi 2. wagmi 3 is excluded by the caret |
| viem / @tanstack/react-query | ^2.57.16 / ^5.106.0 | Peer-compatible with all of the above |
| tailwindcss / @tailwindcss/postcss | 4.3.4 | CSS-first configuration |
| shadcn CLI | 4.23.0 | `base-nova` style on Base UI; components added through the shadcn MCP's add command |
| typescript | ~5.9.3 | 7.0.2 is the latest, but it is a new major and untested with this stack |
| eslint | ^9.39.5 | ESLint 10 would break: `eslint-config-next` pulls in `eslint-plugin-react`, whose peer range stops at `^9.7`. ESLint 9 is reported as out of support; that is the trade-off |
| vitest + vite | 5.1.0 + ^8.3.5 | Node environment for pure logic; no React plugin needed yet |
| playwright-core | 1.64.1 (dev only) | Library only, installed with `--ignore-scripts`, so no browser download. It drives a Chromium chosen by `executablePath`; 1.64.1 expects revision 1248, and it was verified against the installed revision 1252 (Chromium 157) |

## Architecture
```
web/
  app/            layout (fonts, providers, shell), page (overview), markets/, tokens/, trade/, tx/[hash]/, create-token/,
                  list-market/, globals.css
  components/     providers, shell/ (top bar, sidebar, mobile sheet, search, brand), wallet/ (connect control, pending-wallet
                  notices), dashboard/ (hero, banners, panels), registry/ (markets and tokens pages), trade/ (order ticket,
                  result, step list, market picker, My Orders, transaction page), data/ (Amount, AddressChip, TokenMark,
                  AccountAvatar, states), ui/ (shadcn)
  hooks/          use-dex-data.ts (every on-chain read), use-order-flow.ts and use-tx-flow.ts (the shared lifecycle),
                  use-create-flow.ts (token and market flows), use-chain-watch.ts (local chain-reset check),
                  use-holdings.ts and use-market-choice.ts (holdings panel and the `?market=` selection)
  lib/            units, config, chains, wagmi, deployment, network-status, errors, depth,
                  order-input (validation), order-plan (allowance step + execution estimate), order-flow (lifecycle reducer),
                  order-runner (simulate, sign, wait, decode, reconcile; `waitBounded` with replacement tracking),
                  create-runner, create-input, create-plan, receipt (log decoding), order-status, flow-steps,
                  chain-reset (block-identity verdict), holdings, market-select, registry-pages, safe-text,
                  wallet-prompt (guidance copy) (+ tests);
                  contracts/ (GENERATED by contracts/script/export-web.mjs; never edited by hand)
  e2e/            mock-wallet.mjs and the browser suites: trade, create, dashboard, hardening and liveness (mock wallet, scratch chain)
```
- **No backend, database or API route.** The browser reads the chain through viem, and signing stays in the wallet.
- **Reads are pinned to chain 31337.** Public data loads without a wallet and while the wallet is on another network. Wallet balances need the right network. Every account-scoped query is keyed by the account, so a previous account's data is never shown.
- **Deployment check.** The export carries no block hash, so the app checks for contract code at each exported address and checks that the market's own `baseToken()`/`quoteToken()` match. The states are: checking, node unreachable, no deployment, the market is not an OrderBook, ok. The trust model is in the limits below.
- **Live updates.** One block watcher refreshes the reads on every new block. Because viem's watcher is silent when the head drops below the last block (a restarted Anvil), `use-chain-watch.ts` also polls every 3 s and re-reads the block it last saw (see "Transaction lifecycle hardening").
- **Bigint only.** `lib/units.ts` parses and formats exactly, with no floating point. Display truncates and never rounds up; the dimmed tail shows the remaining exact digits. `requiredQuote` and `quoteCost` mirror the engine, including its revert when a result exceeds uint256.

### The `@x402` build stub
- **Why it exists:** wagmi's connectors pull in `@coinbase/cdp-sdk` (wagmi → @wagmi/connectors → @base-org/account), whose x402 payment code references optional `@x402/*` peers. Turbopack fails to build when they are absent.
- **What it does:** `next.config.ts` aliases exactly the five failing specifiers to `lib/stubs/x402-unavailable.ts`. That module exports the referenced names, which throw if ever called and never on load.
- **Scope:** this app never uses x402 or the Base Account connector. The alias is Turbopack-only, so a `--webpack` build would need the same alias.

## Trading workflow (P2-5)
**Where.** `/trade` (market picker from the on-chain registry, ticket, depth, book, My Orders), the ticket on the dashboard (primary market), and `/tx/[hash]`. A market in `?market=` is accepted when the MarketFactory confirms `isMarket(address)` on-chain, so a market beyond the first registry page still opens.

**What you do.** Choose a market, Buy or Sell, type a limit price and an amount, and press **Review order**. The review states the market, side, price, amount, the collateral the order book will escrow, and whether an approval is needed. Then:
1. If the order book's allowance is short: **Approve exactly the collateral** (a buy approves `requiredQuote(amount, price)` of the quote token; a sell approves `amount` of the base token). The spender is the market (the OrderBook), never MarketFactory, and there is no unlimited option. If the allowance already covers it, no approval is requested.
2. Press **Place order** (a separate wallet request; it never fires automatically after the approval).

**Checks before the wallet is asked** (`lib/order-input.ts`): malformed text (no sign, exponent, separator or whitespace), zero, more than 18 decimals, price not a multiple of `TICK_SIZE`, amount not a multiple of `LOT_SIZE` (both read from the contract), amount times price beyond uint256, and a wallet balance below the collateral. Then a contract **simulation** runs; a revert is named (for example `InvalidLotSize`, `BookTooDeep`, `ERC20InsufficientAllowance`) and the wallet is not asked.

**States** (`lib/order-flow.ts`, one pure reducer):
| Phase | Meaning | Shown as |
|---|---|---|
| idle | editing, or between steps | the form, review, Approve or Place button |
| approve-wallet / order-wallet | waiting for the wallet to answer | the "Waiting for MetaMask confirmation" notice |
| approve-confirming / order-confirming | hash received, waiting for a block | step list with the hash (links to `/tx/[hash]`); "not confirmed yet" after 60 s |
| simulating | checking against the contract | a short status line |
| reconciling | receipt read, reading `getOrder` | step list |
| done | **receipt status success**, `OrderPlaced` decoded, `getOrder` read | the result card |
| failed | rejected, reverted, replaced/cancelled, timeout, local chain reset, RPC error | a distinct notice with Try again |
| stale | account, network or market changed mid-flight | a dismissable notice; the old result is never applied to the new account |
A transaction hash is shown as "submitted", never as success. The order id comes from the confirmed `OrderPlaced` event, not from the simulation. A second click while anything is in flight is ignored.

**The result card** keeps four quantities apart: what executed in this transaction (filled, quote exchanged at the makers' prices, refund, remaining), what is still locked in escrow, what is in the wallet now, and the allowance left. Fills, the refund and the escrow come from the decoded `Trade` and token `Transfer` logs and are cross-checked against `getOrder` at the receipt block; a disagreement is shown, not hidden.

**What the engine does that the UI says plainly.** Fills run at the resting order's price. At most `MAX_MATCHES_PER_TX` (10) orders are matched per transaction; if more would still cross, the remainder is placed on the book and **can stay crossed**, because nothing matches in the background and `matchOrders` is not implemented. The ticket's "estimate against the current book" mirrors the engine's arithmetic but is an estimate: the contract decides when the transaction is mined.

**My Orders** lists the account's orders on the selected market (`getUserOrderIds`, `getOrder`, `OrderPlaced`/`Trade` logs): id, market, side, limit price, amount, filled, remaining, locked collateral, status, the placing transaction and each fill's transaction. It shows the latest 50 orders and is keyed by account. Eligible rows have a **Cancel** action (see "Cancelling orders" below); cancelled orders stay listed as history and show 0 remaining.

**Waiting for the wallet.** While a connect, approval, order or network-switch request is pending, the app shows: "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request." After 20 seconds it adds recovery steps and Try again. A web page cannot see whether the extension popup is open, so the notice only says where to look and never claims otherwise. Try again resets this app's pending state; a request that is still open inside MetaMask must be rejected there first. The connect notice floats above RainbowKit's dialog, which would otherwise cover it. Network switches made from the header's chain dialog are handled by RainbowKit itself and are not observable here.

## Token issuance and market listing (P2-6)
**Where.** `/create-token` and `/list-market` (nav entries "Create token" and "List market"; the dashboard's Create & list rows link to them). Both reuse the P2-5 lifecycle: validation, simulation, review, one wallet request, bounded receipt wait, event decoding, on-chain verification, stale/rejected/reverted handling and busy guards (`hooks/use-tx-flow.ts`, `lib/create-runner.ts`, the `lib/order-flow.ts` reducer). No contract, exporter or ABI change was needed.

**Create token.** Name, symbol, total supply in whole tokens (parsed with bigint; decimals are fixed at 18). The review shows exactly what will be minted. The contract's rules are enforced on-chain (`EmptyName`, `EmptySymbol`, `ZeroSupply`, `SupplyTooLarge` at 1e27 raw = 1,000,000,000 tokens, read from the factory). The UI adds stricter, labelled guard rails: name up to 64 and symbol up to 16 characters, no control, bidirectional or zero-width characters, no leading or trailing spaces. A supply that is not a whole number of lots (1e-9) is allowed but flagged, because the remainder can never be sold. Success is shown only after the `TokenCreated` event (emitted by the factory, for the sending account) matches the request **and** independent reads agree: `isFactoryToken`, the token's own `name`/`symbol`/`decimals`/`totalSupply`, the creator's balance, `tokenCount` and registry membership. The card links to **List a market for this token** and **View on Tokens**. Names and symbols are not unique; the address is the identity.

**List market.** Pick a base and a quote from the registry or paste an address. Base is the asset traded; quote is the asset prices are quoted in (NTU/SGDx means SGDx per NTU). Before any signature the form reads the chain: both tokens answer `decimals()` and have exactly 18, the tokens differ, and `getMarket(a, b)` (which the contract treats as unordered) finds no existing market. A duplicate in **either** orientation is shown as "This pair already has a market" with the existing base/quote and a link to Trade, and no transaction is offered. The contract also accepts external 18-decimal ERC-20s, so those are allowed and labelled "not issued by this app's TokenFactory"; "Issued by TokenFactory" means provenance, not safety. Orientation is permanent, so the review states both addresses, the price units and a warning, with a **Swap** control and an acknowledgement checkbox that gates the button. Success requires a matching `MarketCreated` event plus `getMarket` in both orders, `isMarket`, the market's own `baseToken`/`quoteToken` and `marketCount`. A new market starts with an honest empty book and no trades.

**Failure handling.** Rejected, reverted (named by the contract: `MarketExists`, `InvalidTokens`, `UnsupportedDecimals`, the four token errors; a no-data revert is explained as "not an ERC-20"), replaced, timed out, RPC errors, wrong network, account or network change mid-request (stale, dismissable) and double clicks.

## Dashboard market selector and wallet overview (P2-6.1)
**Market selector.** The Dashboard shows one market at a time: the pair holdings, depth, book, summary, limit-order ticket, "Open Trade view" and "Place Order" all follow it. The market is `?market=<address>` in the URL (no storage); the address is the identity, never a symbol. `lib/market-select.ts` resolves it for both Dashboard and Trade (`hooks/use-market-choice.ts`): a value on the loaded registry is accepted, any other valid address is accepted only if `MarketFactory.isMarket` says so, and anything else falls back to the seed NTU/SGDx market with a plain notice (invalid address, not a registered market, could not check). Nothing is claimed while the check runs. Choosing a market only changes the URL: it sends no transaction and asks the wallet for nothing. The ticket is keyed by market, so a form or flow never carries over. The Dashboard and Trade link to each other with the market kept; the sidebar links are unchanged (they would need a Suspense boundary around the whole shell).

**All token holdings.** A token inventory for the connected account, separate from the pair panels. Discovery: TokenFactory registry, base and quote of every listed market and the seed pair, deduplicated by address (`lib/holdings.ts`). One `balanceOf` per token with each read allowed to fail on its own (a token that reverts is counted and left out, it does not blank the panel); names, symbols, decimals and `isFactoryToken` are read only for tokens with a balance, or for all when "Show zero balances" is on. Rows are sorted by symbol, labelled "Issued by TokenFactory" or "Listed externally", shown in the token's own units, and never added together: there are no totals, prices or USD values. Results are tied to the account and chain in the query key, so a switched account never sees the previous one's balances.

**Registry paging.** `useTokenRegistry` and `useMarketRegistry` read every page of 50 up to `REGISTRY_CAP` (500 entries, `lib/registry-pages.ts`); beyond that the pages say "Showing the first N of M".

## Transaction lifecycle hardening (P2-7)
One `waitBounded` (`lib/order-runner.ts`) serves orders, approvals, token creation and market listing.
- **Speed-ups, cancels and replacements.** viem can only follow a replaced transaction if it is told the sender and nonce, so the runner reads the submitted transaction once (`readTransaction`) and hands those fields to every receipt window. A re-priced transaction (same target, data and value) is followed to its new hash and reconciled like any other receipt (the mined `OrderPlaced` must match the requested side, price and amount; an approval is re-read from the chain). A transaction **cancelled** or **replaced by a different action** is a failure, shown under the hash that was mined ("Cancelled by" / "Replaced by" with a link), and never as a placed order.
- **Local chain reset.** After a timed-out receipt window the runner compares the chain's identity with the one seen at submission (`lib/chain-reset.ts`): a different genesis hash, a different hash at the block seen earlier, or a head below that block ends the wait with "The local chain was reset" and the evidence. **A transaction the node no longer lists is not treated as a reset** (it can be dropped or replaced on an intact chain); it ends as "not confirmed yet", says the node no longer lists it, and sends the user to My Orders. The whole app also watches the chain (`hooks/use-chain-watch.ts`, every 3 s): on a proven reset it re-reads every query and shows a dismissible notice, because viem's block watcher is silent when the new head is below the old one.
- **After any failure that has a hash** every on-chain read is refreshed, so My Orders shows what is really on the chain.
- **All three bonus features now have a UI.** Cancellation, matching and stop-limit orders are described in the next sections. See [BONUS_INTEGRATION.md](BONUS_INTEGRATION.md) for the planning record.

## Query refresh and RPC cost (P2-8A.1)
- **Static reads are not re-read every block.** Reads that can never change for their query key (token name, symbol, decimals and `isFactoryToken`; an OrderBook's constants and its two token addresses; each registered market's token pair) carry `staleTime: Infinity` and `meta: { scope: "static" }` (`lib/query-scope.ts`). The per-block refresh (`useLiveBlock`) skips them; everything else (balances, allowances, total supply, books, my orders, trade logs, contract code, registry counts and lists) is still refreshed on every new block.
- **Static reads are still refreshed** after a confirmed transaction or approval (`use-tx-flow.ts`) and on a proven chain reset (`use-chain-watch.ts`), because both call a full invalidation. A different contract address or chain is a different query key, so a new token or market is fetched on its own.
- **Requests are batched** (`http(RPC_URL, { batch: true })` in `lib/wagmi.ts`): the same JSON-RPC operations are sent, packed into fewer HTTP requests. Batching does not reduce the work the node does. `lib/rpc-batching.test.ts` pins that a failing call inside a batch fails only its own caller, and that a missing receipt behaves the same, with and without batching.
- Measured numbers, before and after, are in [`p2-8a1-fixes.md`](ai-audit/test-evidence/person2/p2-8a1-fixes.md).

## RPC health and recovery (P2-8A.2)
- **What it does.** `RpcHealthProvider` (`hooks/use-rpc-health.tsx`, mounted in `components/providers.tsx`) probes the node every 5 s (backing off to 10 s while unhealthy) with one `eth_getBlockByNumber("latest")` request, a 3 s deadline, no transport retries and never two probes at once. Two failed probes in a row make the page `offline` (one is enough if nothing was ever read). Transactions are allowed only in `online`: on first load the ticket shows "Verifying chain…" until the first probe and the genesis read have succeeded, and two failed anchoring attempts show the `unverified` alert. The state machine is `lib/rpc-health.ts`.
- **While offline or unverified:** a `role="alert"` banner, a "Last known, not current" chip on every panel that had data, the order ticket and the create forms disabled ("Node unreachable"), and the trade area says the node is unreachable instead of "No live deployment". Nothing is hidden: last-known values stay visible but are labelled.
- **Recovery is verified, not assumed.** A successful probe moves the page to `verifying`: chain identity is checked with the P2-7 `assessChain` (genesis, the block at the last seen height, head below that block), the contract code at the five deployment addresses and the market's token addresses are re-read, then the caches are invalidated (everything after a reset, the per-block set otherwise), then `refreshing` until every active read is idle, valid and successful on two consecutive checks. Only then does the page return to `online` and transactions come back. A failed check or a 10 s timeout leaves it in `unverified`.
- **The chain watcher is unchanged** and keeps running. Both use the same `assessChain`; the notice component shows one notice for one reset and one dismissal clears both.
- **A successful probe proves reachability only**, not that blocks are produced or that other contracts are valid. Cost: +12 JSON-RPC requests per minute (55 to 67 idle).
- **Tests:** `lib/rpc-health.test.ts`, `components/shell/rpc-health-banner.test.ts`, `e2e/liveness.e2e.mjs` (`npm run e2e:liveness`, scratch chain and server, mock wallet). Evidence: [`p2-8a2-liveness.md`](ai-audit/test-evidence/person2/p2-8a2-liveness.md).
- **Contrast tokens changed in P2-8A.2:** `--muted-foreground` `#a8b0cb` to `#b6bed8`, `--subtle` `#8a94b3` to `#96a0be`, the primary gradient's light middle stop, and the token badge letter colour per palette (`components/data/token-mark.tsx`). Reasons and measurements are in the same evidence file.

## Cancelling orders (P2-8B.2)

**Where:** My Orders (`components/trade/my-orders.tsx`, `cancel-panel.tsx`), logic in `lib/cancel-runner.ts`, `lib/order-status.ts` (`canCancel`, `expectedRefund`), `lib/receipt.ts` (`decodeCancelReceipt`), flow hook `hooks/use-cancel-flow.ts`. It reuses `useTxFlow` and `waitBounded`, so speed-ups are followed, replacements and chain resets are detected, and an account, network or market change drops the request, exactly as for orders.

- **Who and what:** a **Cancel** action appears only on the connected account's own orders whose status is Open, PartiallyFilled or PendingTrigger, and only while the chain is verified and the wallet is on Anvil (the P2-8A.2 gate). Filled and Cancelled orders have none. The button's accessible name ("Cancel order #N") contains its visible text.
- **Confirmation first:** it states the refund before anything is sent: a sell gets `amount - filled` in base tokens, a buy gets its remaining `lockedQuote` in quote tokens, a pending stop gets its whole escrow. It says no token approval is needed and that only gas is spent.
- **Lifecycle:** simulate `cancelOrder(orderId)` (a failed simulation never reaches the wallet), one wallet request, bounded receipt wait. **Success is claimed only after** a successful receipt contains an `OrderCancelled` for that order, market and trader and `getOrder` reads Cancelled at the receipt block. The refund from the event is compared with the order in the block before and with the tokens' own `Transfer` events; any mismatch is shown, not hidden. A transaction that cancelled a different order is reported as unverified.
- **After:** every query is re-read (balances, escrow, books, My Orders). The cancelled order leaves the book and stays in My Orders as history with 0 remaining; the transaction page decodes the event.
- **Failures** have their own wording: `NotOrderOwner` ("This is not your order"), `OrderNotActive` ("This order can no longer be cancelled"), wallet rejection, a reverted transaction (the order was not cancelled), a replaced or wallet-cancelled request (this cancellation did not happen; check My Orders), a chain reset, a timeout ("not confirmed yet").
- **Tests:** `lib/cancel-runner.test.ts` (fake chain), `lib/cancel.integration.test.ts` (real scratch chain; checks that no test account has an allowance or an order first), `e2e/cancel.e2e.mjs` (mock wallet). Evidence and limits: [`p2-8b2-cancellation.md`](ai-audit/test-evidence/person2/p2-8b2-cancellation.md). **MetaMask was not tested** (procedure: `TESTING.md`, Test 12).
- **Dashboard vs Trade (follow-up, 2026-11-08):** cancelling lives only in Trade, under My Orders. The Dashboard's bottom strip says so and links to Trade with the selected market kept (`?market=`); it duplicates no part of the cancel flow. The Dashboard book panel is titled **Order Book (BASE / QUOTE)** (it lists resting orders, not people) and its side pills read **Buy (bid)** and **Sell (ask)**; the Market Depth chart and its legend are unchanged.
- **Real MetaMask:** the happy path (partly filled sell, cancel, 3 NTU refund) was run by the owner on 2026-11-08; see `TESTING.md` Test 12 and `p2-8b2-cancellation.md` section 9. Rejection, account switch, outage and chain reset were not run manually.
- **Not built:** cancel-all, any special label for the engine's own auto-cancel of an activated stop, batch matching, stop-limit placement or triggering.

## Matching orders (P2-8B.3)

**Where:** a **Match Orders** panel on the Trade page, directly under the Market Depth and Order book panels (`components/trade/match-panel.tsx`), because it acts on what those two panels show. Logic: `lib/crossed-book.ts` (detection), `lib/match-runner.ts` (the flow), `lib/receipt.ts` (`decodeMatchReceipt`), hook `hooks/use-match-flow.ts`. It reuses `useTxFlow`, the `lib/order-flow.ts` reducer, `waitBounded` and the wallet-prompt components that the order ticket and Cancel use; there is no approval step.

- **When it appears:** only while the market itself reports a crossed book (`getBestBid` price at or above `getBestAsk` price, both orders present; equal prices count), or while a matching request is in flight or has a result on screen. Not crossed: no panel and no Match button. Disconnected: the panel and its explanation are shown, the action is disabled and asks for a wallet. The book comes from the same per-block market snapshot as the Order book panel, so it follows new orders, fills, cancels, market switches, an outage with its verified recovery, and a detected chain reset. `crossedBook` is the one definition for the live book; `order-plan.ts` keeps its separate *pre-placement estimate* (a prediction for a different moment).
- **What it says before anything is sent:** buy and sell orders can be matched, anyone can send the transaction, the sender pays gas and neither sends nor receives trading tokens (no approval), each transaction settles at most `MAX_MATCHES_PER_TX` (10) fills, and the book may need another call. It never promises how many fills there will be.
- **Review, then confirm:** **Review match** opens a read-only review: the call (`matchOrders(10)`), the per-transaction limit, the contract's simulated result as "Simulated now (an estimate)" and a gas estimate when the node gives one. The wallet is not asked yet. **Confirm match** re-reads the book, re-simulates, and only then asks the wallet, once. If the book is no longer crossed, or the simulation says nothing would settle, nothing is sent and no gas is spent. The review closes if the pair of orders at the top of the book changes under it.
- **Lifecycle:** the same states as an order or a cancel: simulating, wallet waiting (with the extension guidance), confirming, verifying, and the failures (rejected, reverted with the reason replayed from the block before, replaced, cancelled by the wallet, timed out, chain reset, account or network change, "Try again" with the abandoned-request notice). The wording is specific to matching. `InvalidMaxCount` has a plain message; the app always sends the market's own limit, so it should not occur.
- **Result (only after the confirmed receipt):** the fills are the market's own `Trade` events from that receipt (maker and taker order, amount, price, total), plus totals, the price improvement returned to buyers, and each touched order as `getOrder` reads it (before and after the block). The reconciliation checks that the base paid out equals the trades, that no seller or buyer received a different amount than their trades add up to, that each fill is at the maker order's price and that each order's filled amount changed by exactly its trades. Any disagreement is shown in an alert instead of a clean success. Zero `Trade` events is reported as "Confirmed: no eligible orders were settled" (only gas was spent), never as fills. Another market's trades in the same transaction are not counted.
- **Repeating:** if the book is still crossed, the result says so and offers **Review another match**. Nothing is sent by itself: each transaction is one deliberate click, there is no loop, no timer and no keeper.
- **A crossed book also changed the spread display** (issue P2-016): the Spread figure now says **Crossed** instead of a number, because a negative spread used to crash the page.
- **Real MetaMask (2026-11-08, owner-reported, scratch chain, keeper account):** Review match showed `matchOrders(10)`, about 2 fills and a gas estimate of 277,124; the confirmed transaction (block 78, 224,189 gas) settled 2 fills and the app reported them as the receipt shows; `scripts/seed-crossed-book.sh verify-after` passed. Not run manually: rejection, account switch, outage, chain reset. See `TESTING.md` Test 13 and `p2-8b3-batch-matching.md` section 9.
- **Not built:** automatic or scheduled matching, a count of crossed pairs before sending, stop activation, stop-limit placement. The engine's economic limit on capped placements (issue 007) is unchanged and not addressed by the UI.
- **Tests:** `lib/crossed-book.test.ts`, `lib/match-runner.test.ts` (fake chain), `lib/receipt.test.ts` (`decodeMatchReceipt`), `lib/match.integration.test.ts` (real scratch chain: the four-trader scenario with a token-less keeper, repeated matching, `InvalidMaxCount`, a real no-op receipt), `e2e/match.e2e.mjs` (mock wallet). Evidence and limits: [`p2-8b3-batch-matching.md`](ai-audit/test-evidence/person2/p2-8b3-batch-matching.md).

## Stop-limit orders (P2-8B.4)

**Where:** a **Limit | Stop-limit** switch at the top of the ticket (`components/trade/order-ticket.tsx`; the plain limit path is unchanged), the pending stop in **My Orders**, and a **Trigger Stops** panel under the Market Depth and Order book panels (`components/trade/trigger-panel.tsx`). Logic: `lib/stop-orders.ts` (rules, validation, wording), `lib/stop-runner.ts` (placement), `lib/trigger-runner.ts` (trigger), `lib/receipt.ts` (`decodeStopReceipt`, `decodeTriggerReceipt`), hooks `use-order-flow.ts` (generalised) and `use-trigger-flow.ts`. It reuses `useTxFlow`, the `lib/order-flow.ts` reducer, `waitBounded`, `runApproval` and the wallet-prompt components; there is no parallel framework. Cancelling a pending stop is the unchanged Bonus 1 flow.

**What the engine does** (read from `OrderBook.sol`, not assumed from other exchanges): a **buy** stop is eligible when the market's last trade price is **at or above** its trigger, a **sell** stop when it is **at or below** (equality counts), and only once the market has had a trade. The price is the market's own `lastTradePrice`; there is no outside price feed, and trading can move it. Eligibility is only checked inside `triggerStopOrders`, which anyone can call. The escrow is taken at placement at the **limit** price (sell: the base amount; buy: `requiredQuote(amount, limit)` rounded up). The engine accepts any positive, tick-aligned trigger and limit: it does not compare them with each other or with the last trade price, so the UI warns instead of blocking.

- **Two prices, in plain words** (stated in the ticket): the *trigger price* is the market condition that makes the pending order eligible; the *limit price* is the price boundary at which it may trade once it is activated.
- **Placement:** validate (positive, tick and lot aligned, the wallet covers the escrow computed from the LIMIT price, never the trigger), review (side, trigger, limit, amount, escrow, contracts, approval step, "pending, not on the book"), an **exact** approval only when the allowance is short (never unlimited), then one `placeStopLimitOrder` request. The result is read from the receipt's `StopOrderPlaced` (a stop has no `OrderPlaced`) and `getOrder` at the receipt block: it must be the order that was requested and read `PendingTrigger` with nothing filled and the right escrow. The card says **pending**; it never says filled or activated.
- **Waiting for price versus eligible now** (two different states, shown in My Orders, the review and the result): *Waiting for price* means the engine's rule is false at the current last trade price ("it needs the last trade price to fall to or below 1.8"). *Eligible now* means the rule is true: the stop does **not** need another trade, it needs someone to send a **Trigger stops** transaction, and until then it stays `PendingTrigger` with its collateral escrowed and cannot fill. Before the first trade nothing can trigger ("no trade has happened on this market yet").
- **Pending stops in My Orders:** the status stays "Pending Trigger"; a second line gives the trigger, the limit and the state above; the locked collateral is the existing column. A pending stop is never in the Order book or depth panels (the engine keeps stops outside `getBook`). An activated stop is described from its `StopOrderTriggered` record (see "My Orders: stop history" below), never from its status alone. Only the connected account's own orders are listed (latest 50), as before; the engine has no view of other traders' stops.
- **Trigger Stops panel:** appears only while the contract itself says a trigger call would activate at least one stop (one `eth_call` of `triggerStopOrders(10)` per block, enabled once the market has a trade price), or while a request is in flight or has a result. Review (read-only): `triggerStopOrders(10)`, last trade price, the simulated count labelled an estimate, a gas estimate, "no approval; you pay gas". Confirm re-simulates (0 sends nothing and spends no gas), asks the wallet once, and the result comes from the receipt: for each activated stop a line saying what actually happened: **resting** (nothing filled), **partly filled** (the rest rests at its limit), **filled**, or **cancelled and refunded by the engine** because more than 100 orders ranked ahead of its limit price (`OrderCancelled` after its `StopOrderTriggered` in the same transaction; the same event an owner cancel emits, told apart by that order). **Activation is never reported as execution.** It also shows whether more stops are still eligible (another deliberate click) and whether the book is now crossed (the Match Orders panel then appears by its own detection). Zero activations is a clean no-op report.
- **Failures and recovery:** the same states as the other flows (rejection, revert with the reason replayed, replaced, wallet-cancelled, timeout, chain reset, outage, account or network change, duplicate clicks). `BookTooDeep` has wording that covers stops.
- **What it does not do:** no keeper, no scheduler, no automatic signing, no price oracle. It cannot enumerate other traders' stops, so eligibility is detected by simulation, and only the connected account's stops are listed.
- **Accepted limitations shown or documented:** a stop is not a guarantee of execution or of price; the trigger price is the market's own last trade, which trading can move; a triggered stop can be refunded by the engine without trading; the capped-placement limitation of issue 007 is unchanged.
- **Tests:** `lib/stop-orders.test.ts`, `lib/stop-runner.test.ts` and `lib/trigger-runner.test.ts` (fake chain), `lib/receipt.test.ts` (new decoders), `lib/stop.integration.test.ts` (real scratch chain), `e2e/stop.e2e.mjs` (mock wallet). Evidence and limits: [`p2-8b4-stop-limit.md`](ai-audit/test-evidence/person2/p2-8b4-stop-limit.md).

## Usability and consistency (P2-8C)

A polish phase on top of the three bonus UIs; the design language (Liquid Glass) and every transaction flow are unchanged.

- **Label convention** (`lib/labels.ts`, enforced by `lib/labels.test.ts`, which scans the source): page titles, panel headings, segment labels, table column headers, stat labels, status badges and short field labels are in **Title Case** ("Market Board", "Order Book", "Stop-Limit Order", "Pending Trigger", "Partially Filled"); sentences, buttons, help text and warnings keep sentence case. No CSS `capitalize` is used: the text on screen is the text in the DOM. The feature is always spelled "stop-limit" (hyphenated).
- **Information tips** (`components/ui/info-tip.tsx`, copy in `lib/glossary.ts`, pinned by `lib/glossary.test.ts`): a small "i" button beside the concepts that need it (Limit Order, Stop-Limit Order, Trigger Price, Limit Price, Escrow, Pending Trigger, Eligible Now, Trigger Stops, Match Orders, Order Book, Market Depth, Last Trade Price, Spread, Crossed Book, Market Board, Gas, ERC20 Allowance, Connected Account). Built on the base-ui `Popover`, glass-styled, rendered in a portal with collision handling so no card clips it. Hover opens it after a short delay; keyboard focus opens it; Enter or Space toggles; Escape, a click or tap outside, or moving focus away closes it; a tap opens it on touch devices; reduced motion removes the fade. The button is named "About <term>"; the popup is labelled by the term and described by its text. Buy, Sell and Amount deliberately have no icon. Each tip ends with a plain-text pointer to the Beginner's Guide where useful (not a link: the app does not serve the repository).
- **Status badges** (`components/data/order-status-badge.tsx`, `statusTone` in `lib/order-status.ts`): Pending Trigger amber, Resting blue, Partially Filled violet, Filled green, Cancelled grey, each with an icon and its text. The same badge is used in My Orders and in the order, stop, cancel, match and trigger result cards. **Eligible Now** is a separate dashed chip beside the badge, never a status: an eligible stop is still Pending Trigger on-chain. The label "Resting" was kept (it tells a beginner the order sits on the book, and a pending stop does not).
- **My Orders** (`components/trade/my-orders.tsx`): a type tag under the order number (Limit Order or Stop-Limit Order), and a **Price** cell that shows only the Limit Price for a limit order and both the **Trigger Price** and the **Limit Price** for a stop, for the whole life of the order (they come from `getOrder`, so they survive activation, fills and cancellation). The header shows "Orders for <connected account>" with a tip that explains the difference between the account selected in MetaMask and the account connected to this site; every review card has a "Sending From" row.
- **My Orders: stop history** (`lib/stop-history.ts`): what a stop did is told from evidence, never from its status. `getOrder` cannot tell "cancelled while pending" from "activated, then cancelled", so the page reads the order's `StopOrderTriggered` and `OrderCancelled` records. Wording: *Cancelled before activation* (no trigger record), *Activated, then filled / partly filled / resting*, *Activated, then you cancelled* (cancel in a later transaction), *the engine cancelled and refunded it at activation* (cancel in the same transaction as the trigger), and neutral text ("could not be read, so no claim is made") when the records are unavailable. **Request economy:** one `eth_getLogs` (both events, filtered on the indexed order ids, bounded from the stops' placement block), only when a non-pending stop is listed, never for pending stops, cached per set of (order, status) and skipped by the per-block refresh, at most one retry, a failure degrades the line and never the list.
- **Contrast:** the shared primary button measured 5.2:1 at rest and about 4.5:1 while hovered; the hover lift was reduced (`hover:brightness-110` to `105`), giving 4.8:1.

## Design system
**Source of truth:** the approved Liquid Glass reference screenshot, which is dark-only.
- **Ground and accents:** deep navy with layered radial lighting; violet accent `#7c5cf2` and lilac `#b49cff`, plus azure `#6aa4ff`.
- **Semantic colours:** buy `#3ddc9e`, sell `#f37aa3`, warning `#f2c14e`. Buy and sell always carry a label, never colour alone.
- **Glass:** the `glass`, `glass-raised`, `glass-active` and `glass-inset` utilities in `app/globals.css`. Each is a translucent gradient fill with a top-left light, a light 1px border, an inner top highlight, a long soft shadow and a backdrop blur.
- **Type:** Inter for text, with tabular figures for numbers; IBM Plex Mono for addresses.
- **Accessibility:** a visible focus ring, an 11px text floor, a skip link, and `prefers-reduced-motion` respected.
- **Honest adaptations of the reference:**
  - Holdings are shown in token units with share-of-supply bars, because there is no USD oracle.
  - The swap panel becomes a disabled limit-order ticket, because the exchange is an order book, not an AMM.
  - Market metrics come only from view calls and `Trade` logs, with no 24h change.
  - Create token and List market (P2-6) are working pages; the dashboard's Create & list panel links to them.

## Testing
| Layer | Command | What it proves | What it does not |
|---|---|---|---|
| Unit (node) | `npm test` | validation, allowance step, execution estimate, lifecycle reducer, runner with a fake chain, receipt decoding with synthetic logs, error mapping, wallet copy | anything on a real chain |
| Real chain | `E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run --no-file-parallelism lib/trading.integration.test.ts lib/creation.integration.test.ts lib/hardening.integration.test.ts` (sequential: the files share one chain and its snapshots) | the same code against the deployed contracts on a scratch Anvil: SPEC example to the wei, resting, partial and immediate fills, multi-maker sweep, the fill cap, self trade, exact approvals, named reverts, estimate-vs-chain parity | MetaMask or any browser |
| Browser (mock wallet) | see `web/e2e/ux.e2e.mjs` (labels, information tips, status badges, My Orders and stop history, account switching, contrast, overflow, axe: `npm run e2e:ux`), `web/e2e/stop.e2e.mjs` (stop-limit orders, `npm run e2e:stop`), `web/e2e/match.e2e.mjs` (matching crossed orders, `npm run e2e:match`), `web/e2e/trade.e2e.mjs` (trading, `npm run e2e`) `web/e2e/create.e2e.mjs` (issuance and listing, `npm run e2e:create`) `web/e2e/dashboard.e2e.mjs` (market selector and holdings, `npm run e2e:dashboard`) and `web/e2e/hardening.e2e.mjs` (speed-up, cancel, replace and chain reset of a *transaction*, `npm run e2e:hardening`), `web/e2e/liveness.e2e.mjs` (`npm run e2e:liveness`) and `web/e2e/cancel.e2e.mjs` (cancelling *orders*, `npm run e2e:cancel`) | the UI drives the whole flow in Chromium against the scratch chain, including pending-wallet guidance, rejection, double click, account switch and wrong network | **MetaMask.** The wallet is an injected stand-in |
| Manual MetaMask | the checklist below, run by the owner | the real wallet prompts (the owner ran the happy paths; `docs/TESTING.md`, Section F) | the negative cases (rejection, account switch during a request, outage, chain reset) were not run |

The real-chain suites also cover issuance and listing (`lib/creation.integration.test.ts`: exact supply and balances, every named revert, duplicate and reversed pairs, a 6-decimal and a non-token address, an external 18-decimal token, and real trading on a newly listed market).

The real-chain suite refuses to run unless `E2E_RPC_URL` is set explicitly, refuses port 8545 (the developer's own chain) and a missing `E2E_ALLOW_MUTATE=1`, and wraps each test in `evm_snapshot`/`evm_revert`. Use a scratch chain:
```bash
anvil --port 8546
# deploy to it WITHOUT overwriting the exporter's records for your own chain (see "Scratch deployments" below)
cd contracts && FOUNDRY_BROADCAST=/tmp/scratch-broadcast FOUNDRY_CACHE_PATH=/tmp/scratch-cache \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8546 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```
A fresh chain gives the same deterministic addresses as the exported deployment, so the generated files stay unchanged.

**Browser run.** The app must be a build that points at the scratch chain, served on another port (a second `next dev` in the same folder is refused):
```bash
cd web
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 BASE_URL=http://localhost:3100 \
  CHROMIUM_PATH=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome npm run e2e
```
`playwright-core` is a dev dependency (library only, no browser download). Chromium needs `libnss3` and `libnspr4` on the system; installing them needs `sudo apt-get install libnss3 libnspr4`, which this repo's tooling does not do for you. Screenshots and `results.json` go to `docs/ai-audit/test-evidence/person2/p2-5-screens/`.

### Scratch deployments
`forge script --broadcast` overwrites `contracts/broadcast/Deploy.s.sol/31337/run-latest.json`, which `export-web.mjs` compares with your chain's block hash. Deploying to a scratch chain without redirecting the output made `export-web.mjs --check` report your own chain as stale (found during P2-5, repaired by restoring the matching timestamped run). Setting `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` as above avoids it.

## Manual MetaMask checklist
The project owner has performed the SPEC worked example (steps 6 to 10 below) with real MetaMask accounts in Windows Brave. The owner has also reported creating DTT, listing DTT/SGDx and a trade on that market (partial fill and maker-price settlement); those transaction hashes and screenshots are not recorded here, and the DTT steps were not checked against this checklist one by one. The rest of this checklist, including the rejection, wrong-network, account-switch and speed-up/cancel cases, has not been performed manually. A fuller illustrated version, with expected values and a status table, is in [`TESTING.md`](TESTING.md).

Playwright's Chromium has no wallet extension, so none of this is covered by the automated runs. Use **two MetaMask development accounts** in Windows Brave (import Anvil accounts 1 and 2 locally; never paste keys into chat, files or this repo). Account A sells, account B buys.

**Setup and network**
1. Anvil running on `http://127.0.0.1:8545`, deployed (`docs/DEPLOYMENT.md`), `npm run dev` on port 3000.
2. In MetaMask: network "Anvil (local)", chain ID 31337, RPC `http://127.0.0.1:8545`, ETH. Account A and B each hold 10,000 NTU and 10,000 SGDx (import the tokens if MetaMask hides them).
3. Open `http://localhost:3000/trade`. The market picker shows NTU / SGDx.

**Connect and pending-request guidance**
4. With account A selected, press **Connect wallet**, choose the browser wallet. If MetaMask does not pop up, check the guidance card ("Waiting for MetaMask confirmation...") and use the toolbar icon or the Extensions menu; the card should stay above the connect dialog. After 20 seconds it should add recovery steps. Approve the connection: the card disappears and your address shows.
5. Switch MetaMask to another network (for example Ethereum Mainnet): the app shows "Wrong network" and the ticket offers **Switch to Anvil**. Press it; while MetaMask is open the guidance card shows. Reject once (expect the rejected notice and Try again), then switch successfully.

**Account A: sell**
6. Sell NTU: price 2, amount 10. **Review order**: it should say it will approve exactly 10 NTU for the order book (note the address; compare it with the market address on the Markets page). Press **Approve 10 NTU**, confirm in MetaMask, wait for "Approval confirmed on-chain".
7. Press **Place sell order**, confirm. The result card should say "Order #1 confirmed: Resting", with 10 NTU escrowed. My Orders shows #1. In MetaMask, A's NTU dropped by 10.

**Account B: buy (the SPEC worked example)**
8. Switch MetaMask to account B. The page should show B's address, no orders for B, and no result card from A.
9. Buy NTU: price 2.2, amount 4. **Review order**: it should approve exactly **8.8 SGDx**. Approve, then **Place buy order**.
10. The result should say Filled, trade against order #1 at **2** for 4 NTU, **0.8 SGDx refunded**. In MetaMask: B gained 4 NTU and spent a net 8 SGDx; switch to A: +8 SGDx; A's order #1 is Partially Filled with 6 NTU still locked.
11. Open the transaction links from My Orders: the page shows Succeeded and decodes the order, trade and transfer events.

**Rejections and recovery**
12. Start another order, and press Reject in MetaMask on the order signature: the app shows "You rejected the order request", nothing is sent; **Try again** returns to the review.
13. Start an order and, while MetaMask is waiting, switch account inside MetaMask: the app should say the account changed and not show a result for it.
14. Restart Anvil without redeploying: the dashboard should say there is no deployment. MetaMask may need Settings, Advanced, Clear activity tab data (standard behaviour; not tested here).

## Known limits
- **Hosted RPC providers are untested for the liveness probe.** Only a local Anvil was used; a provider may rate-limit a 5 s probe. The probe cannot tell a node that is up but stalled (no new blocks) from a healthy idle chain, and does not try to.
- **Stop-limit orders:** only the connected account's stops are listed (the engine has no view of other traders' stops), and a stop's eligibility market-wide is detected by simulating `triggerStopOrders`, once per block. The trigger price is the market's own last trade, which trading can move; a stop is not a guarantee of execution or price. A remainder left crossed after the 10-fill cap is cleared with the Match Orders panel (mock wallet and real-chain verified; happy path confirmed with MetaMask by the owner). A pending stop can be cancelled (Bonus 1). Stop-limit orders have been verified with a mock wallet and a real scratch chain, and the happy path was run by the owner with MetaMask on 2026-11-08 (`TESTING.md`, Test 14). The wording defect found by that run (a stop cancelled before it activated was shown as "Activated … (cancelled)") was fixed in P2-8C.
- **Orders are per market** (each OrderBook has its own ids). My Orders shows the selected market, the latest 50 orders.
- **Leaving the page mid-signature is not blocked.** The market picker is disabled while a request is open, and an abandoned attempt sends no further request, but following another link while MetaMask is open leaves that request untracked. If you sign it, find it in the transaction list of the account.
- **Registries are read up to 500 entries (10 pages of 50, oldest first) per refresh.** Tokens, Markets, the market picker and the holdings panel say "Showing the first N of M" when there are more. The Trade page still opens any registered market given in `?market=` (checked with `isMarket`).
- **Listing and issuing are permissionless and permanent.** Anyone can issue a token with any name or symbol and list any 18-decimal token; the UI labels provenance but cannot judge safety. A market's base/quote orientation can never be changed or undone with the current contracts.
- **The wallet and the app can use different nodes.** Both must be the same chain-31337 node. If your wallet points at another 31337 node, the transaction goes there and this app, which reads its own RPC, will report it as not confirmed.
- **Token movements are token-reported.** The escrow, refund and received amounts come from the tokens' own `Transfer` events (cross-checked with `getOrder`); a hostile token could emit consistent logs. Wallet balances on the result card are read from the chain separately. Symbols are chosen by whoever issues a token, so the review shows the contract addresses.
- **A speed-up that lands before the app's first lookup of the transaction** (milliseconds after the wallet returns the hash) cannot be followed, because the node no longer returns the original and its nonce is unknown. The app then says "not confirmed yet" and that the node no longer lists the transaction; the order may well exist, so check My Orders before placing it again.
- **Chain-reset detection compares block identity, so it cannot see a reset before the app has seen a block.** Reload after restarting Anvil, and redeploy if the contracts are gone.
- **MetaMask not exercised by automation.** The browser run uses a mock wallet; wallet behaviour is on the manual checklist (the owner has verified the SPEC example by hand).
- **Deployment check is not a bytecode check.** It establishes code presence and the market's token addresses. A different deployment that reuses the same deterministic addresses and tokens would pass. The exporter's bytecode check is the stronger guard.
- **If the RPC dies after a page has loaded, the page keeps showing its last data without saying so** (found in P2-8A.1; the "Read from chain, refreshed every block" label and the block number stay on screen). Refreshes are triggered by new blocks and by user actions, and a dead node produces neither; the head watcher swallows its own errors. Not fixed in P2-8A.1 (proposal in the evidence file).
- **Reads are not atomic.** There is no Multicall3 on Anvil, so a snapshot's reads can come from adjacent blocks for a moment.
- **Trade-log rescan.** Trade stats rescan the market's `Trade` logs from the deploy block on each new block. That is fine locally, but it needs an incremental cache before any long-lived chain.
- **No strict CSP:** a Content-Security-Policy is deferred. Safe headers are set: nosniff, frame denial, referrer policy and permissions policy.
- **`npm audit`:** 42 advisories (0 critical, 17 high), all transitive under the wallet stack (WalletConnect/Reown, MetaMask SDK, Coinbase SDK, `ws`, `zod`, `decode-uri-component`) or dev tooling. `npm audit fix` without `--force` changes nothing. Every fix needs wagmi 3, which RainbowKit 2 does not support. They are accepted for a local-only demo and should be revisited when RainbowKit supports wagmi 3.
- **`next-env.d.ts`:** regenerated by Next. Consider adding it to the shared `.gitignore` (team decision).
