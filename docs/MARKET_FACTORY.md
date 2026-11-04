# MarketFactory (Person 2)

**Status: DRAFT, pending Person 1's review.** It is not part of the frozen `CONTRACT_INTERFACE.md`, which is unchanged. Nothing is wired into a deploy script or the UI until Person 1 agrees (see "Review request for Person 1").

Brief reference: section 5.1 asks for a front end that supports *token listing*, order submission and execution, and self-custody. Token **issuance** (TokenFactory) and token **listing** (this contract) are separate steps: an issued token is not tradable until a market exists for it.

## What it does
`contracts/src/MarketFactory.sol` deploys `new OrderBook(base, quote)` for a token pair and records it in an on-chain registry. It does nothing else.

```
anyone ──createMarket(base, quote)──► MarketFactory ──new OrderBook(base, quote)──► market
traders ──approve + placeLimitOrder──► market   (never through the factory)
```

- **Permissionless.** No owner, no admin function, no pause. Anyone can list any pair of valid tokens.
- **Non-custodial.** The factory holds no tokens and has no trading function, so it is never `msg.sender` of an order and has no standing in any market.
- **OrderBook is untouched.** `OrderBook.sol`, `IOrderBook.sol`, the frozen interface and SPEC.md are not modified. The factory only calls the existing constructor.

## Interface
```solidity
event MarketCreated(address indexed market, address indexed base, address indexed quote, address creator);
error MarketExists(address market);

function createMarket(address base, address quote) external returns (address market);
function marketCount() external view returns (uint256);
function getMarket(address tokenA, address tokenB) external view returns (address); // order-insensitive, 0 if none
function isMarket(address market) external view returns (bool);
function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory); // oldest first
```
Errors from the OrderBook constructor pass through unchanged: `InvalidTokens` (zero address or `base == quote`), `UnsupportedDecimals` (a token is not 18-decimal), and an empty revert for a token without `decimals()` (SPEC section 8).

## Design rules and why
| Rule | Reason |
|---|---|
| One market per **unordered** pair. `createMarket(B, A)` after `(A, B)` reverts `MarketExists(market)` | The reverse is the same market with inverted prices and would split liquidity. Key is `keccak256(abi.encode(min, max))` |
| Duplicate check first, then deploy, then register | A failed deployment reverts the whole call, so no registry entry or orphan market can exist |
| `getMarkets` returns at most `limit` entries and never reverts | Bounded loop; empty past the end; safe for any `offset` and `limit` |
| Constructor validation is not duplicated in the factory | The engine owns its own token rules (SPEC section 2). One source of truth |
| No `ReentrancyGuard` | The only external calls during creation are the constructor's `decimals()` reads. They go through a `view` interface, so they are STATICCALLs, and a token cannot re-enter a state-changing function. Pinned by `test_createMarket_tokenCannotReenterFromDecimals` and its control `test_control_reenteringTokenSucceedsOutsideStaticContext` |

## Limitations (for the report)
- **Orientation is first-come, and it is permanent.** Whoever creates the pair first fixes which token is base and which is quote, and the reversed pair can never be listed. Usually that only inverts prices. In an extreme case it can make the market unusable: prices move in steps of `TICK_SIZE` (1e-9 quote per base), so if the first creator makes a very low-value token the base, its real price can fall below one tick and cannot be placed. `test_market_orientationFixesTheSmallestTradablePrice` shows a price of 1e-12 quote per base reverting `InvalidTickSize` while the reversed pair is rejected with `MarketExists`. With the 18-decimal demo tokens at similar values this does not bite. Mitigation: the deploy script creates the seed markets before the factory address is published, and the UI catches `MarketExists`, then reads `baseToken()` and `quoteToken()` from the existing market.
- **Anyone can list any valid token pair**, including tokens made to look like others (names and symbols are not unique). `isMarket` proves a market came from this factory, not that its tokens are trustworthy. SPEC section 8 limits apply (for example, a token that can refuse transfers to one address can block takers).
- **Registry spam** is possible and costs only gas. Reads are paginated, so it cannot block anyone on-chain, but a UI that lists everything will show it.
- **A token can burn the gas of its own listing.** A token that makes its `decimals()` call fail inside a static context makes that single `createMarket` consume the gas forwarded to it. Only the caller of that transaction pays.
- **Embedded engine bytecode.** The factory contains OrderBook's creation code (about 7 KB). If Person 1 changes OrderBook after deployment, markets created by an already-deployed factory keep the old code, so redeploy the factory with the engine.
- **Factory size tracks OrderBook size.** The factory's runtime code embeds OrderBook's creation code, so it reaches the 24,576-byte limit before OrderBook does. Measured: factory runtime 8,358 B against OrderBook initcode 6,974 B. If the stop-order bonus makes OrderBook's initcode much larger, re-run `forge build --sizes` after every engine change.
- The factory is a **second deployment entry point**: `Deploy.s.sol` could create the seed market through it, which changes the deployment handoff in `CONTRACT_INTERFACE.md` ("deploys the tokens, then `OrderBook(base, quote)`").

## Notes for the UI
- Read `baseToken()` and `quoteToken()` from a market before pricing anything. `getMarket(a, b)` ignores argument order, so it says nothing about orientation.
- Identify tokens by address, never by name or symbol. Treat `isMarket` as provenance, not trust.
- Page `getMarkets` with a fixed limit (for example 50), because a spammed registry could make one huge read hit the RPC's call gas cap.
- `creator` in `MarketCreated` is `msg.sender`, which can be a contract.

## Review request for Person 1
Please confirm, or ask for changes to, each of the following before this is wired into deployment or the UI.

1. **Approach.** A separate, permissionless Person 2 contract that instantiates your `OrderBook` unmodified, plus a registry. Alternative if you prefer: no factory, and listing stays a script-only step (this would leave "token listing" as a display feature only).
2. **How it uses OrderBook.** Only `new OrderBook(base, quote)`. Your constructor reads no `msg.sender`, `tx.origin` or owner, so a factory-created market is identical to a directly deployed one. Evidence: runtime bytecode equality, a replay of one trade sequence on both a factory market and a direct deployment with full state compared, and a differential check of every write function (`MarketFactoryIntegration.t.sol`).
3. **Your review should cover:** (a) that the constructor's only external calls are the `decimals()` reads, which is what the no-reentrancy-guard argument rests on; (b) that the unordered-pair rule and "first creator fixes the orientation" are acceptable for your engine, including the tick-size consequence described under Limitations; (c) that the factory size stays under the limit as OrderBook grows; (d) that the tests do not duplicate or contradict your engine tests (they re-use public API only, and none of your files are changed).
4. **Where the API is documented.** This file (`docs/MARKET_FACTORY.md`, Person 2). Say if you would rather have an appendix in `CONTRACT_INTERFACE.md`, which needs both of us to agree.
5. **Deployment handoff.** Are you happy for `Deploy.s.sol` to create the seed market through the factory, with you reviewing that part?
6. **Compatibility.** The differential test calls `cancelOrder`, `matchOrders`, `placeStopLimitOrder`, `triggerStopOrders` and `placeLimitOrder` on a factory market and a direct deployment, and compares results. It stays valid when you implement the bonus functions.

Please record your decision as a PR comment so it is written down.
