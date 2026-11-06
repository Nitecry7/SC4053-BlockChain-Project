# Bonus-feature integration readiness (Person 2)

Status: **planning document.** None of the bonus functions are implemented in the shared engine, and the web app offers no control for any of them. This file lists what the front end needs from Person 1 and how it will be verified when each bonus is delivered. It changes no contract, ABI or interface.

## What the deployed engine does today

Verified by reading `contracts/src/OrderBook.sol` on branch `faheem` (P2-7 session): `placeLimitOrder` and `getOrder`/`getBook`/`getUserOrderIds` work. `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` are bodies that only `revert()`. `docs/ENGINE_PHASES.md` assigns them to Person 1: Phase 4 (cancel), Phase 5 (batch matching), Phase 6 (stop-limit). The front end must therefore keep showing no cancel, batch or stop control. The My orders table already says "Cancelling orders is not available in the deployed engine yet."

## Activation rule

A bonus control is enabled only when **both** hold:

1. the function is verified by a **real call on a scratch chain** (a green Foundry test for it is not enough; it must succeed through the front end's own simulate, send, receipt path), and
2. the compiled ABI exported to `web/lib/contracts/abis.ts` and `CONTRACT_INTERFACE.md` agree on its signature, events, errors and any new `Status` value.

Until then the control is **absent**, not disabled-looking-functional.

## Per bonus

### Phase 4: cancel (`cancelOrder(orderId)`)
| Need from Person 1 | Front-end work after verified delivery | Tests |
|---|---|---|
| `cancelOrder` live; `OrderCancelled(orderId, trader, refundBase, refundQuote)`; a cancelled `Status` value in the compiled ABI; owner-only (`NotOrderOwner`), active-only (`OrderNotActive`) | "Cancel" per row of My orders, shown only for the user's own open or partly filled orders. Plan: simulate, one wallet request, decode `OrderCancelled`, compare the refund with `getOrder` (`amount - filled`, or `lockedQuote` for a buy) and with the balance change, show the exact refund. Name both errors in plain words. Reuse `useTxFlow` and `waitBounded` (replacement, reset and stale handling come for free). | runner unit tests with fakes; real-chain: cancel open, partial, filled (reverts), twice (reverts), non-owner (reverts); browser: cancel, refund, balances, account switch mid-flight |

### Phase 5: batch matching (`matchOrders(maxMatches)`)
| Need | Front-end work | Tests |
|---|---|---|
| `matchOrders` live; `InvalidMaxCount`; a decision on the semantics (`ENGINE_PHASES.md` lists the Bonus 2 interpretation as a question for the TA) | A "Clear crossed book" action shown **only** when `getBestBid >= getBestAsk` (a crossed book is already detectable; P2-002 documents how the 10-fill cap can leave one). Decode `Trade` events and show actual amounts. Never shown on an uncrossed book. | real-chain: build a crossed book via the cap, clear it, assert escrow and balances; assert no control on an uncrossed book |

### Phase 6: stop-limit (`placeStopLimitOrder`, `triggerStopOrders`)
| Need | Front-end work | Tests |
|---|---|---|
| Both functions live; `StopOrderPlaced`, `StopOrderTriggered`; a pending status in the compiled ABI; `getBook` excludes pending stops (already stated in `CONTRACT_INTERFACE.md`) | A separate "Pending stop orders" list. **A pending stop is never part of the live book, depth, or "resting" liquidity.** A stop ticket with trigger and limit prices (both tick-aligned), escrow shown. A trigger action only where `triggerStopOrders` is verified. | real-chain: place, not in `getBook`, trigger, becomes an ordinary order; browser: never drawn in depth |

## Rebuild and redeploy plan (when Person 1 merges a bonus)

1. Update the branch with their work; `cd contracts && forge build && forge test`.
2. Regenerate the web ABIs with the existing exporter (`contracts/script/export-web.mjs`), then review the diff: only the intended signatures and events should change.
3. Deploy to a **scratch** chain first: `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected (see `FRONTEND.md`, "Scratch deployments"), so the exporter record for your own chain is not overwritten (issue p2-005).
4. Run the real-chain suites, then the browser suites, against the scratch chain.
5. Only then **ask the project owner** before redeploying on the main Anvil (8545). Redeploying replaces the contracts, so existing balances, orders and the recorded deployment evidence on that chain are lost. Archive the current evidence by date first; do not overwrite it.

## Open questions for Person 1

- Which `Status` values will the bonuses add, and in what order (the front end maps the enum by index)?
- Final semantics of `matchOrders` (which orders cross, who pays gas, what it returns).
- Whether `cancelOrder` on a pending stop shares the same event.
