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
| **Freeze ABI** | Signatures final | `CONTRACT_INTERFACE.md` (banner changes to FROZEN) | none | none | Person 2 confirms. **Target 31 Oct** | — |
| **6a Stop placement** (bonus 3) | Funded pending stops | `src/OrderBook.sol`, `test/OrderBook.Stop.t.sol` | `placeStopLimitOrder` (escrow at placement, sorted stop lists); `cancelOrder` handles PendingTrigger | escrow on placement, `StopOrderPlaced` event, tick checks on both prices, cancel pending stop, not shown by `getBook` | Solvency includes pending stops | 1.5h |
| **6b Triggering** | Activate and match | same files | `triggerStopOrders(maxCount)`: checks `hasTradePrice`, activates from the heads of the stop lists, stamps a fresh `bookSeq` on activation, **one shared `MAX_MATCHES_PER_TX` fill budget per call** | no trigger before the first trade, an activated stop queues behind equal-price orders that entered the book earlier, wrong side of the price, triggers and fills, triggers but rests, `maxCount` respected, shared budget (activated orders rest once the budget runs out, then `matchOrders` clears them), cascade within one call | All earlier tests still green | 2h |
| **7 Fuzz and invariants** | Accounting proven | `test/OrderBook.Fuzz.t.sol`, `test/invariant/{Handler.sol,OrderBookInvariant.t.sol}` | none | SPEC A8 solvency (pending stops included), `filled <= amount`, lists sorted, no terminal-status order in any list | Invariants pass at a sensible depth (runs and depth set in foundry.toml) | 3h |
| **8 Static analysis and coverage** | Evidence for the report | `docs/ai-audit/test-evidence/` | fixes as found | regression test per real finding | Slither findings triaged (real, false positive or accepted); `forge coverage` recorded | 2h |

Total is about 23h. Phases 0–5 (about 13h) are realistic by 31 Oct. Phase 6 is a stretch for 31 Oct.

## Schedule
| Date | Work |
|---|---|
| Wed 28 Oct | Agree the interface with Person 2; Phase 0 and Phase 1 |
| Thu 29 Oct | Phases 2a, 2b, 3a and 3b |
| Fri 30 Oct | Phases 4 and 5, review pass |
| Sat 31 Oct | Phase 6, ABI freeze (internal feature-complete target) |
| Sun 1 – Mon 2 Nov | Phases 7 and 8, fix findings |
| Tue 3 – Wed 4 Nov | Integration on Anvil with Person 2 |
| Thu 5 – Fri 6 Nov | Report sections 2, 4 and 6, plus my parts of 5 and 8 |
| Sat 7 Nov | Clean deploy and demo rehearsal |
| Sun 8 Nov | Submit (confirm the date on NTULearn) |

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
- **The 31 Oct target is tight:** about 13h for Phases 0–5, with stop orders on 31 Oct.
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
