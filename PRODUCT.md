# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary users (intended product):**
- **Token creators** who issue a new ERC20 token and need to see it exist, with the right supply and decimals.
- **Market creators** who list a token pair so it can be traded.
- **Traders** who place buy and sell limit orders against a non-custodial order book and need to know exactly what was escrowed, filled, refunded or left resting.

All three act from their own self-custodial wallet (MetaMask or another browser wallet). Nobody else holds their keys or funds.

**Demonstration and evaluation stakeholders (this academic project):** SC4053 students, teaching assistants and graders inspect the same screens to verify on-chain behaviour on a local Anvil chain. They matter for how the product is shown and judged, but they are not a separate product with separate features.

## Product Purpose

A minimal decentralized exchange for the NTU SC4053 blockchain course. It is a **limit order book, not an AMM**: there are no liquidity pools, no swaps against a curve and no pooled pricing. Buyers and sellers post limit orders, the contract matches them on-chain at the maker's price with price-time priority, and partial fills are supported.

Success means a person can issue a token, list a market, place an order and see the true on-chain outcome (what moved, what is escrowed, what was refunded) without trusting the interface. Matching, escrow and settlement live in the smart contracts; the web app reads and presents them and never takes custody.

## Positioning

An exchange whose interface shows only what the chain says. Every figure is read from a contract call or a decoded event, exact to the base unit. No USD value, 24h change or other number appears unless the contracts can produce it. A neighbouring AMM front end cannot truthfully copy this: it has pool prices and quotes, and this product has an order book and escrow.

## Operating Context

- **Environment:** a local Anvil chain (chain ID 31337, RPC `http://127.0.0.1:8545`) for development and demonstration. No public testnet or mainnet deployment is in scope. Hosted or deployed state beyond local Anvil is unverified and must not be claimed.
- **Wallet flow:** the user connects a browser wallet, approves a token for the order book, then places an order. The order book pulls the approved tokens into escrow while the order is outstanding. Matched trades settle on-chain, and unused escrow is refunded.
- **Deployment:** `contracts/script/Deploy.s.sol` deploys TokenFactory and MarketFactory, issues two demo tokens (NTU as base, SGDx as quote), creates the NTU/SGDx market through MarketFactory and funds demo wallets. `contracts/script/export-web.mjs` exports ABIs and addresses to `web/lib/contracts/`.
- **Assessment:** the course brief requires an AI Audit Report, so decisions, mistakes and test evidence are logged under `docs/ai-audit/`.

## Capabilities and Constraints

### Intended product (the complete target)

- **Token issuance:** create an ERC20 with a name, symbol and fixed supply through TokenFactory (18 decimals, supply minted once to the creator, no owner, no further minting, supply capped at 1e27).
- **Token listing:** permissionless MarketFactory creates one OrderBook per unordered token pair and keeps an on-chain registry. A duplicate or reversed pair is rejected. Both tokens must have 18 decimals.
- **Order book trading:** limit orders for both sides, automatic matching, partial fills, execution at the maker's price, price-time priority (the earlier order at an equal price fills first).
- **Order lifecycle visibility:** distinguish wallet authorization, a submitted transaction, receipt confirmation and success, decoded trade execution and the current order status. A confirmed order may already be filled or partly filled.
- **Balances:** show wallet balance and escrowed amount as different quantities.
- **Bonus engine features named in the brief** (cancelling the remainder of an order, batched multi-party matching, conditional stop-limit orders) are part of the course scope. All three are implemented in the Solidity engine (Person 1). In the web app Bonus 1 (cancellation) and Bonus 2 (batch matching) have a UI; stop-limit orders have no frontend control yet (see below).

### Implemented today (through P2-7)

The web app can: connect a browser wallet through RainbowKit; show the connected account, network and live block; show wrong-network, no-deployment and node-unreachable states; list issued tokens and listed markets from the on-chain registries; show token balances; show a market's best bid and ask, last trade price, spread, live order book, a depth chart, and trade count and volume derived from `Trade` events; and format and validate amounts with bigint-exact helpers that mirror the engine.

Since P2-5 it can also **place limit orders** on any market in the MarketFactory registry: validate the price and amount against the contract's lot and tick sizes, approve exactly the collateral for the order book when the allowance is short, simulate, sign through the wallet, and follow the transaction through the receipt to the decoded order id, fills, refund and remaining escrow. It lists the connected account's orders per market and decodes any transaction on a transaction page. While a wallet request is pending it explains where to look and how to recover.

Since P2-6 it can also **issue a token** (name, symbol, fixed supply through TokenFactory) and **list a market** (any two distinct 18-decimal tokens through MarketFactory, with duplicate and reversed-pair detection and a permanent-orientation acknowledgement), verify each result on-chain, and trade a newly listed market through registry discovery.

Since P2-6.1 the Dashboard also has a **market selector** (any market in the MarketFactory registry, carried in `?market=`; the seed NTU/SGDx market is the fallback for a missing or invalid value) that switches the pair panels, depth, book, summary, ticket and Trade link together, and an **All token holdings** panel: the connected wallet's balance in every token found through the TokenFactory registry and the tokens of every listed market (deduplicated, nonzero by default, labelled issued by TokenFactory or listed externally, never added together, no prices). Registry reads now cover every page up to 500 entries.

Since P2-8B.3 it can also **match crossed orders**: when the market itself reports a crossed book (the best bid at or above the best ask, which only a placement that stopped at the engine's 10-fill cap can leave), a **Match orders** panel on Trade lets any connected wallet send `matchOrders`. It is reviewed and simulated first (the simulation is labelled an estimate), needs no token approval, asks the wallet once, never repeats by itself, and shows its result only from the confirmed receipt's `Trade` events, cross-checked against the chain. A crossed book's spread reads "Crossed".

Since P2-7 the order runner, and the token and market flows that share it, follow a **sped-up, cancelled or replaced transaction** to what was actually mined (viem is given the sender and nonce, so the wait can see a replacement). A cancelled or replaced transaction is reported as a failure under the hash that was mined, never as a placed order. A **local chain reset** (Anvil restarted or a snapshot reverted) is detected from block identity, not from a missing transaction alone; the app then re-reads every query and shows the evidence. Narrow layout fixes keep the connected-wallet header usable at 375 and 390 px.

**Bonus 1, cancellation, is built in the web app:** Trade, My orders offers **Cancel** on the connected account's own Open, PartiallyFilled and PendingTrigger orders (P2-8B.2); the Dashboard links to it. Its happy path was performed by the owner with real MetaMask on 2026-11-08 (a partly filled sell, then a cancel with a 3 NTU refund; `docs/TESTING.md` Test 12). **Bonus 2, batch matching, is built in the web app** (P2-8B.3): a Match orders panel on Trade, shown only while the book is crossed; verified with unit tests, a real scratch chain and a mock wallet, and its happy path was performed by the owner with MetaMask on a scratch Anvil on 2026-11-08 and independently verified against the confirmed transaction `0x52162ab7d8b916a6aba588cbc940e30a2cebfe2e620f597cf63c072a111ec779` (block 78: 2 fills, 2 NTU and 4 SGDx settled, 1.5 SGDx price improvement returned, orders #45 to #48 Filled, no change to the keeper's trading-token balances; `docs/TESTING.md` Test 13). The web app **cannot yet** place or trigger stop-limit orders (Bonus 3, `placeStopLimitOrder` and `triggerStopOrders`: no frontend controls), although the engine implements them. Do not describe Bonus 3 as available in the UI until it is built and verified. Wallet behaviour is verified against a mock wallet and a scratch chain. The project owner has performed the SPEC worked example with real MetaMask accounts (`docs/TESTING.md`), and has reported creating DTT, listing DTT/SGDx and a trade on that market, which the owner's chain state supports; the remaining manual cases, including the cancel rejection, account-switch, outage and chain-reset scenarios and the Match orders rejection, account-switch, two-call remainder, outage and chain-reset scenarios, are procedures not yet performed.

### Contract facts the interface must respect

- Units: `amount` in base-token base units (18 decimals), a multiple of `LOT_SIZE`; prices in quote base units per whole base token, scaled by `PRICE_SCALE` (1e18), a multiple of `TICK_SIZE`. `LOT_SIZE` and `TICK_SIZE` are both 1e9. Read the constants from the contract rather than assuming.
- Buy orders escrow `requiredQuote(amount, limitPrice)` (rounded up). Sell orders escrow the base `amount`. Remaining sell collateral is `amount - filled`; for a buy it is `lockedQuote`.
- One OrderBook is one immutable pair. There is no admin, owner or pause on the order book.
- The frozen interface in `CONTRACT_INTERFACE.md` is the integration contract. TypeScript ABIs come from compiled artifacts, never from hand-written calls.
- A pending stop-limit order is not part of the live book.

### Current engine status (verified in `contracts/src/OrderBook.sol`)

`placeLimitOrder`, matching, partial fills, refunds and all view functions are implemented. `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` are implemented as well (Person 1; `docs/ENGINE_HANDOFF.md`). The front end uses `cancelOrder` and `matchOrders`; it must not present `placeStopLimitOrder` or `triggerStopOrders` as available until their controls are built.

### Architecture constraints

- Next.js (App Router), TypeScript, Tailwind v4, shadcn/ui, RainbowKit 2, wagmi 2, viem 2 and TanStack Query, under `web/`.
- No backend, API route, database, indexer or oracle. All data comes from browser reads of the chain. Signing stays in the user's wallet; no key or secret reaches a server or a `NEXT_PUBLIC_` variable.
- Financial values use `bigint` only, never floating point.
- All reads are pinned to chain 31337 so market data shows even when the wallet is disconnected or on another network.
- WalletConnect is available only if a valid public project ID is configured; otherwise only the browser wallet is offered.

### Explicitly open

- Person 1 was notified of the MarketFactory architecture. No separate review or signed approval is recorded.
- Manual MetaMask: the SPEC worked example (NTU/SGDx) was performed by the project owner. The DTT/SGDx creation, listing and trade were reported by the owner; their transaction hashes are not recorded in this repository. The cancel-order happy path (Test 12) was performed by the owner on 2026-11-08, cross-checked read-only against the chain; its transaction hashes are not recorded here. The negative, recovery and speed-up/cancel-of-a-transaction cases in `docs/TESTING.md`, and the cancel rejection, account-switch, outage and chain-reset cases, have not been performed manually. The Match orders happy path (Test 13) was performed by the owner with MetaMask on a scratch Anvil on 2026-11-08 and independently verified against transaction `0x52162ab7d8b916a6aba588cbc940e30a2cebfe2e620f597cf63c072a111ec779` (block 78: 2 fills, 2 NTU and 4 SGDx settled, 1.5 SGDx returned, orders #45 to #48 Filled, keeper balances unchanged). Still not performed manually: transaction rejection, account switching, the two-call remainder, an RPC outage and a chain reset.

## Verification status

| Layer | What it covers | What it does not cover |
|---|---|---|
| Automated unit and contract tests | validation, runners, decoding, `forge test` (185) | a real wallet |
| Real chain (scratch Anvil, unlocked dev accounts) | issuance, listing, trading, hardening scenarios | MetaMask |
| Browser with a mock wallet | the UI flows on a scratch chain | MetaMask (a stand-in wallet) |
| Manual MetaMask (owner) | SPEC worked example; DTT/SGDx creation, listing and trade (reported) | every other manual case |
- The course brief does not state a deadline or a testnet requirement; the team's 8 November date is an internal plan.
- Which team member leads each AI Audit Report section is not confirmed.

## Brand Commitments

- Name: **SC4053 DEX**, shown as "SC4053" with "DEX" in lilac.
- The approved P2-4 interface (described in `DESIGN.md`) is binding for P2-5 and later phases. Preserve it; do not redesign it.
- Buy and sell are never conveyed by colour alone; they always carry a text label.

## Evidence on Hand

- A passing contract suite and a working local deployment with seeded market data used for the P2-4 renders (`docs/ai-audit/test-evidence/person2/`).
- Approved Playwright renders of Overview, Markets and Tokens at desktop, tablet and mobile in `docs/ai-audit/test-evidence/person2/p2-4-screens/`. These are renders of the interface, not proof of a MetaMask approval or a trade.
- Real-chain integration tests and a mock-wallet browser run for the trading flow, with evidence in `docs/ai-audit/test-evidence/person2/p2-5-trading.md`. These are not MetaMask results.
- **Absent, and not to be fabricated:** real MetaMask transaction hashes from the UI, any public-network deployment, USD pricing, historical price data, user testimonials or usage statistics.

## Product Principles

1. **Transparency over polish.** Show the real state and say plainly when something is unavailable, empty or not built yet. Never fake a value, a transaction or a feature.
2. **Accurate chain state.** The chain is authoritative. Reconcile what the interface shows with reads and events after every block, account change and network change; never show a previous account's data.
3. **Self-custody.** Keys and signing stay in the wallet. Escrow is explicit, temporary and visible, and the user can always see what is locked and what is theirs.
4. **Clear transaction feedback.** Each step (authorization, submission, confirmation, execution, resulting order status, refund) is reported distinctly and in plain language, including failures and rejections.
5. **Security and usability together.** Validate inputs against the contract's lot and tick rules before signing, name errors the contract can return, and keep the safe path the easy path.

## Accessibility & Inclusion

- Keyboard-operable controls with a visible focus ring, a skip link, readable text on dark backgrounds and `prefers-reduced-motion` respected (already implemented).
- Exact amounts are available to assistive technology as full values, and meaning is never carried by colour alone.
- The interface is dark-only by approved design; there is no light theme.
