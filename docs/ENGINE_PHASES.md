# Engine build phases (Person 1)

Approved 28 Oct. Each phase ends with:
- a green `forge test`
- Person 1's own diff review
- a commit
- a `docs/ai-audit/prompt-log.md` entry

From Phase 3a onward, each phase also gets a review by a separate subagent (the plan's section 11, Phase 7 prompt).
Real findings become `docs/ai-audit/issues/` entries, each with a regression test.

Paths are relative to `contracts/` unless they start at the repo root.

| Phase | Goal | Files | Functions | Tests | Accept when | Est. |
|---|---|---|---|---|---|---|
| **0 Setup** (done 28 Oct) | Repo scaffold and spec docs | `CLAUDE.md`, `SPEC.md`, `CONTRACT_INTERFACE.md`, `docs/ENGINE_PHASES.md`, `.gitignore`, `docs/ai-audit/`, `contracts/foundry.toml`, `contracts/lib/{forge-std v1.17.0, openzeppelin-contracts v5.7.0}` (submodules), `contracts/test/Toolchain.t.sol` (smoke test, deleted in Phase 1), `.claude/commands/{review-engine,log-issue,explain-diff}.md` | none | none | `forge build` passes on the empty project; pushed to main so Person 2 can branch | 1.5h |
| **1 Skeleton** | Compiling interface and test base | `src/interfaces/IOrderBook.sol`, `src/OrderBook.sol`, `test/mocks/MockERC20.sol` (configurable decimals), `test/OrderBookBase.t.sol` | constructor (`InvalidTokens`, `UnsupportedDecimals`), immutables, constants (`PRICE_SCALE`, `LOT_SIZE`, `TICK_SIZE`, `MAX_*`), storage, stub functions that revert | constructor reverts: non-18 decimals, same token, zero address; setUp deploys, mints and approves for alice, bob and carol | Interface matches CONTRACT_INTERFACE.md exactly; ABI handed to Person 2 | 1.5h |
| **2a Book structure** | Sorted linked lists | `src/OrderBook.sol` (internal `_insert` and `_unlink`), `test/OrderBook.Book.t.sol` (harness) | internal `bookSeq` counter and stamp; `_insert` (price, then `bookSeq`; bounded by `MAX_INSERT_SCAN`), `_unlink`, `getBestBid`, `getBestAsk`, `getBook` | ordering across prices, equal-price FIFO **by `bookSeq`, including a case where a higher order ID has a lower `bookSeq`** and must rank first (harness stamps it directly), unlinking the head, middle, tail and only element, `BookTooDeep`, empty side returns (0, 0) | List invariants hold in every test | 2h |
| **2b Place and rest** | Escrow and resting, no matching | `src/OrderBook.sol`, `test/OrderBook.Place.t.sol` | `placeLimitOrder` (validation order, SafeERC20 pull, A2 and A3 escrow), `requiredQuote`, `getOrder`, `getUserOrderIds`, `OrderPlaced` event | `ZeroAmount`, `ZeroPrice`, `InvalidLotSize`, `InvalidTickSize`, no allowance or balance (no state change), exact escrow, `requiredQuote` equals the exact cost for aligned inputs, events | Contract balance equals the sum of open escrow | 1.5h |
| **3a Single fill and settlement** | One `_settleFill` used everywhere | `src/OrderBook.sol`, `test/OrderBook.Match.t.sol`, `assertSolvent()` in the base test | `_settleFill` (A4 and A5, maker price, price-improvement refund), `lastTradePrice`, `hasTradePrice`, `Trade` event | exact match, maker partial fill, taker partial fill, price-improvement refund, the SPEC.md worked example to the wei | Worked example exact; `assertSolvent` passes | 2h |
| **3b Sweep and cap** | Multi-level matching | same files | match loop capped at `MAX_MATCHES_PER_TX`; remainder rests | sweep several price levels, FIFO at equal price, non-crossing order rests, cap leaves a crossed remainder, self-trade settles correctly | `assertSolvent` after every test. **Person 2 can integrate on Anvil** | 1.5h |
| **4 Cancel** (bonus 1) | Refund only the unfilled part | `src/OrderBook.sol`, `test/OrderBook.Cancel.t.sol` | `cancelOrder` (owner only, active statuses only, CEI order, `OrderCancelled` event) | cancel open, cancel partial, cancel filled reverts, cancel twice reverts, non-owner reverts, cancel head, middle and tail | Every refund exact; links stay valid | 1.5h |
| **5 Batch** (bonus 2) | Clear crossed books | `src/OrderBook.sol`, `test/OrderBook.Batch.t.sol` | `matchOrders(maxMatches)`, reusing `_settleFill`; the head with the lower `bookSeq` is the maker | clears a book left crossed by the cap, cap respected, 3+ traders settled, no-op when not crossed, `InvalidMaxCount` for 0 and for more than the cap | No duplicated settlement code | 1.5h |
| **Freeze ABI** | Signatures final | `CONTRACT_INTERFACE.md` (banner changes to FROZEN) | none | none | Person 2 confirms. **Done 1 Nov** (target was Mon 2 Nov, revised from 31 Oct) | — |
| **6a Stop placement** (bonus 3) | Funded pending stops | `src/OrderBook.sol`, `test/OrderBook.Stop.t.sol` | `placeStopLimitOrder` (escrow at placement, sorted stop lists); `cancelOrder` handles PendingTrigger | escrow on placement, `StopOrderPlaced` event, tick checks on both prices, cancel pending stop, not shown by `getBook` | Solvency includes pending stops | 1.5h |
| **6b Triggering** | Activate and match | same files | `triggerStopOrders(maxCount)`: checks `hasTradePrice`, activates from the heads of the stop lists, stamps a fresh `bookSeq` on activation, **one shared `MAX_MATCHES_PER_TX` fill budget per call** | no trigger before the first trade, an activated stop queues behind equal-price orders that entered the book earlier, wrong side of the price, triggers and fills, triggers but rests, `maxCount` respected, shared budget (activated orders rest once the budget runs out, then `matchOrders` clears them), cascade within one call | All earlier tests still green | 2h |
| **7 Fuzz and invariants** | Accounting proven | `test/OrderBook.Fuzz.t.sol`, `test/invariant/{Handler.sol,OrderBookInvariant.t.sol}` | none | SPEC A8 solvency (pending stops included), `filled <= amount`, lists sorted, no terminal-status order in any list | Invariants pass at a sensible depth (runs and depth set in foundry.toml) | 3h |
| **8 Static analysis and coverage** | Evidence for the report | `docs/ai-audit/test-evidence/` | fixes as found | regression test per real finding | Slither findings triaged (real, false positive or accepted); `forge coverage` recorded | 2h |

As of 1 Nov, Phases 1 to 8 remain, about 20h by the table above. Phase 7 now runs before Phase 6, because invariant tests rank above stop-limit.

## Schedule (revised 1 Nov)
| Date | Work | Est. | Done when |
|---|---|---|---|
| Sun 1 Nov | Chase Person 2; Phases 1, 2a and 2b | 5h | ABI handed over; orders place and rest |
| Mon 2 Nov | Phases 3a, 3b and 4 | 5h | Person 2 can integrate on Anvil; `MAX_*` tuned; ABI frozen |
| Tue 3 Nov | Phases 5 and 7 | 4.5h | Two bonuses done; solvency invariants pass |
| Tue 3 Nov, night | **Stop-limit decision** | — | Go only if everything above is green and reviewed |
| Wed 4 Nov | Phases 6a and 6b; extend the invariant handler to stops | 4.5h | Solvency includes pending stops |
| Thu 5 Nov | Phase 8; integration on Anvil with Person 2 | 2h + integration | Slither findings triaged on final code; coverage recorded |
| Fri 6 Nov | Integration fixes; report sections 2, 4 and 6, plus my parts of 5 and 8 | — | End-to-end trade on Anvil |
| Sat 7 Nov | Finish the report; clean deploy and demo rehearsal | — | |
| Sun 8 Nov | Submit (confirm the date on NTULearn) | — | |

## Phase prompts
Prompts live here from now on. The prompts in section 11 of `docs/DEX_Trading_Engine_Plan.md` predate the 28 Oct decisions, so update each one against SPEC.md before adding it here.

### Phase 1
```text
Phase 1 of docs/ENGINE_PHASES.md. Read CLAUDE.md, SPEC.md and CONTRACT_INTERFACE.md first.
Create contracts/src/interfaces/IOrderBook.sol exactly from CONTRACT_INTERFACE.md.
Create contracts/test/mocks/MockERC20.sol (configurable decimals, public mint for tests).
Create contracts/src/OrderBook.sol implementing IOrderBook: constructor(base, quote) that
reverts with InvalidTokens (zero address, or base == quote) and UnsupportedDecimals
(not 18 decimals), immutables, the constants PRICE_SCALE, LOT_SIZE, TICK_SIZE,
MAX_MATCHES_PER_TX and MAX_INSERT_SCAN, order storage, and stub function bodies that use a
bare revert(). Do not add any error, event or function that is not in the interface.
Create contracts/test/OrderBookBase.t.sol: an abstract base whose setUp deploys the mocks
and the OrderBook, then mints to and approves for alice, bob and carol. Add a concrete test
contract covering the constructor reverts: non-18 decimals on each token, same token, and
zero address on each side. Delete contracts/test/Toolchain.t.sol.
Run forge build and forge test and show the real output. Check IOrderBook.sol against
CONTRACT_INTERFACE.md line by line and report any mismatch. Log the session in
docs/ai-audit/prompt-log.md. Do not commit.
```

### Phase 2a
```text
Read CLAUDE.md and SPEC.md. Implement the two sorted doubly linked lists in OrderBook.sol:
bids descending by price, asks ascending, ties broken by the internal bookSeq (stamped
when an order enters the book), not by order ID. Internal _insert(orderId), bounded by
MAX_INSERT_SCAN (revert BookTooDeep past it), and _unlink(orderId), which handles head,
tail, middle and the only element. Implement getBestBid, getBestAsk and
getBook(side, maxOrders) (bounded by maxOrders). Do not implement placeLimitOrder yet.
Tests in contracts/test/OrderBook.Book.t.sol, using a harness contract that exposes
_insert and _unlink and can write orders directly:
- ordering across several prices on both sides, and FIFO at equal price
- the bookSeq case: a higher order ID with a lower bookSeq ranks first
- unlinking the head, middle, tail and only element, with links checked afterwards
- BookTooDeep when the scan limit is exceeded
- getBook respects maxOrders and returns orders in priority order; empty book views
  return zero
Add an assertBookSorted helper to the base test that walks both lists, checks
prev/next consistency and the sort order, and call it in every test.
Run forge build and forge test, show the real output, log the session, do not commit.
```

### Phase 2b
```text
Read CLAUDE.md and SPEC.md. Implement placeLimitOrder WITHOUT matching: checks
(ZeroAmount, ZeroPrice, InvalidLotSize, InvalidTickSize), then create the order (IDs from
1, status Open, createdAt), stamp bookSeq, insert into the book, record it in the
trader's order list, emit OrderPlaced, and pull escrow last with SafeERC20 (sell: amount
of base; buy: requiredQuote(amount, price) of quote, stored in lockedQuote). Follow
checks-effects-interactions and use nonReentrant. Implement getOrder, getUserOrderIds and
requiredQuote. Crossing orders simply rest for now; matching comes in Phase 3a.
Add assertSolvent() to the base test: the contract's base balance equals the sum of
unfilled base on open sell orders, and its quote balance equals the sum of lockedQuote on
open buy orders. Call it in every placement test.
Tests in contracts/test/OrderBook.Place.t.sol:
- each revert (zero amount, zero price, bad lot, bad tick, no allowance, insufficient
  balance) leaves no state change and no order created
- exact escrow pulled for buys and sells, and requiredQuote matches it
- the stored Order fields are correct; IDs increase from 1; getUserOrderIds per trader
- OrderPlaced event fields
- several orders on each side end up in the correct book order (assertBookSorted)
Run forge build, forge test and forge fmt --check, show the real output, log the
session, do not commit.
```

### Phase 3a
```text
Read CLAUDE.md and SPEC.md. In placeLimitOrder, after pulling escrow, match the incoming
order against the head of the opposite side while it crosses and fewer than
MAX_MATCHES_PER_TX fills have happened, then rest any remainder. All settlement goes
through one internal _settleFill(makerId, takerId, qty):
- execution at the maker's price; cost = qty * price / PRICE_SCALE (exact, thanks to
  lot and tick sizes)
- the buyer receives qty base and the seller receives cost quote
- the buy order's lockedQuote is reset to requiredQuote(remaining, its limit price),
  and any excess is refunded to the buyer (price improvement), so lockedQuote is 0 when
  the order is filled
- update filled and status (PartiallyFilled or Filled), unlink filled makers, set
  lastTradePrice and hasTradePrice, and emit Trade
Tests in contracts/test/OrderBook.Match.t.sol, calling assertSolvent and
assertBookSorted in each one:
- exact match, maker partly filled, taker partly filled
- buyer price-improvement refund
- the SPEC.md worked example, with every balance exact to the wei
- a non-crossing order rests
- lastTradePrice and hasTradePrice update, and the Trade event fields
- a reentrancy test: a malicious mock token that re-enters placeLimitOrder or
  cancelOrder during transfer must revert with ReentrancyGuardReentrantCall
Then run /review-engine as a separate subagent review. Log real findings with
/log-issue, fix them with regression tests, and run forge build, forge test and
forge fmt --check. Show the real output, log the session, do not commit.
```

## Agree with Person 2 before coding
1. **Layout:** one shared `contracts/` Foundry project (Person 1 scaffolds it and pushes to main first), with `web/` for the frontend.
2. **Toolchain:** solc 0.8.24 pinned in foundry.toml; OZ v5.x as a git submodule; `engine/*` and `web/*` branches merged into main by PR.
3. **Units:** both tokens use 18 decimals; prices are quote per whole base × 1e18; amounts in base units; lot and tick size 1e9.
4. **CONTRACT_INTERFACE.md:** the DRAFT, including the additions listed in its "Changes" table.
5. **Handoff:** ABI and addresses go to `web/lib/contracts/`, copied by Person 2's deploy flow.

**Can wait:**
- the numeric values of `MAX_*` (before the freeze)
- the stop-list internals (Phase 6)
- Anvil or testnet (by 3 Nov)
- `Deploy.s.sol` details (Person 1 reviews)
- the Bonus 2 interpretation (ask the TA)

## Risks
- **The interface agreement slips** (Person 2 has pushed nothing yet). Mitigation: send the DRAFT today and push `IOrderBook.sol` at the end of Phase 1.
- **The 31 Oct target was missed** (only Phase 0 was done by 1 Nov). The revised schedule leaves only Thu 5 and Fri 6 Nov for integration, and the estimates are untested.
- **Linked-list or accounting bugs.** Mitigation: `assertSolvent` from Phase 3a, the Phase 2a harness, then invariants.
- **Gas in trigger plus matching.** Mitigation: one shared fill budget per call.
- **Windows tooling.** Slither needs `pip install slither-analyzer` and solc-select. Node is not installed on this machine; it is needed only if I run the frontend for integration.
- **Deadline.** Confirm 8 Nov on NTULearn.

## Cut order (first cut first)
1. Stop-limit extras (sorted stop lists; fall back to a scan bounded by `maxCount`)
2. Stop-limit entirely
3. Coverage polish
4. Batch matching
5. Slither
6. Cancel (cut last)

Invariant tests (Phase 7) rank above stop-limit.
