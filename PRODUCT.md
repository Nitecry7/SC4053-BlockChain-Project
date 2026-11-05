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
- **Bonus engine features named in the brief** (cancelling the remainder of an order, batched multi-party matching, conditional stop-limit orders) are part of the course scope but are Person 1's engine work and are not yet working (see below).

### Implemented today (through P2-5)

The web app can: connect a browser wallet through RainbowKit; show the connected account, network and live block; show wrong-network, no-deployment and node-unreachable states; list issued tokens and listed markets from the on-chain registries; show token balances; show a market's best bid and ask, last trade price, spread, live order book, a depth chart, and trade count and volume derived from `Trade` events; and format and validate amounts with bigint-exact helpers that mirror the engine.

Since P2-5 it can also **place limit orders** on any market in the MarketFactory registry: validate the price and amount against the contract's lot and tick sizes, approve exactly the collateral for the order book when the allowance is short, simulate, sign through the wallet, and follow the transaction through the receipt to the decoded order id, fills, refund and remaining escrow. It lists the connected account's orders per market and decodes any transaction on a transaction page. While a wallet request is pending it explains where to look and how to recover.

The web app **cannot yet**: cancel or match orders, place stop-limit orders, issue a token, or list a market. The deployed engine's `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` revert, so the UI offers none of them. "Create token" and "List market" are visible but disabled and labelled as arriving in a later phase (P2-6). Do not describe any of these as functional until they are built and verified. Wallet behaviour is verified against a mock wallet and a scratch chain, and the SPEC worked example has been performed by the project owner with real MetaMask accounts (`docs/TESTING.md`); the other manual cases there are procedures not yet performed.

### Contract facts the interface must respect

- Units: `amount` in base-token base units (18 decimals), a multiple of `LOT_SIZE`; prices in quote base units per whole base token, scaled by `PRICE_SCALE` (1e18), a multiple of `TICK_SIZE`. `LOT_SIZE` and `TICK_SIZE` are both 1e9. Read the constants from the contract rather than assuming.
- Buy orders escrow `requiredQuote(amount, limitPrice)` (rounded up). Sell orders escrow the base `amount`. Remaining sell collateral is `amount - filled`; for a buy it is `lockedQuote`.
- One OrderBook is one immutable pair. There is no admin, owner or pause on the order book.
- The frozen interface in `CONTRACT_INTERFACE.md` is the integration contract. TypeScript ABIs come from compiled artifacts, never from hand-written calls.
- A pending stop-limit order is not part of the live book.

### Current engine status (verified in `contracts/src/OrderBook.sol`)

`placeLimitOrder`, matching, partial fills, refunds and all view functions are implemented. `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` currently contain a bare `revert()` (stubs). The front end must not present them as working.

### Architecture constraints

- Next.js (App Router), TypeScript, Tailwind v4, shadcn/ui, RainbowKit 2, wagmi 2, viem 2 and TanStack Query, under `web/`.
- No backend, API route, database, indexer or oracle. All data comes from browser reads of the chain. Signing stays in the user's wallet; no key or secret reaches a server or a `NEXT_PUBLIC_` variable.
- Financial values use `bigint` only, never floating point.
- All reads are pinned to chain 31337 so market data shows even when the wallet is disconnected or on another network.
- WalletConnect is available only if a valid public project ID is configured; otherwise only the browser wallet is offered.

### Explicitly open

- Person 1 has not reviewed the factory-created NTU/SGDx market that the app reads.
- Only the SPEC worked example has been performed with real MetaMask accounts (by the project owner). The negative and recovery cases in `docs/TESTING.md` have not been performed manually.
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
