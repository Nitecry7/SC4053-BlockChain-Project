# Slither triage: `OrderBook.sol` (Phase 8)

- **Tool:** Slither 0.11.6, 102 detectors, on solc 0.8.24 via Foundry. The raw output is [`slither.txt`](slither.txt).
- **Command** (from `contracts/`): `slither . --filter-paths "(lib/|test/|script/|src/MarketFactory|src/TokenFactory|src/DemoToken)"`.
  - Scope: `OrderBook.sol` and `IOrderBook.sol`. Person 2's contracts have their own Slither record (README, AI tooling table), so they are filtered out here.
  - The engine source was unchanged since the Phase 6 merge (`1adcc59`); it is identical on `main` (`5f2e860`) and on `engine/phase-8`.
- **Result:** 27 results from 5 detectors.
  - **0 real issues.**
  - 13 false positives (uninitialized-state, incorrect-equality, timestamp).
  - 14 accepted (costly-loop, naming-convention).
  - **No reentrancy, access-control, arbitrary-send, unchecked-transfer, divide-before-multiply or locked-ether detector fired.**

| Detector | Results | Verdict | Reason |
|---|---|---|---|
| `uninitialized-state` (`_bookHead`, `_stopHead`) | 2 | **False positive** | Both mappings are written, but only through the storage reference that `_heads(orderId)` returns: `mapping(Side => uint256) storage heads = _heads(orderId); heads[side] = ...` (`_tryInsert` line 337, `_unlink` line 357). Slither does not follow writes through storage-pointer aliases. Insertion and removal are covered by 23 Book tests, every `assertBookSorted` call, and 100% branch coverage of `OrderBook.sol` ([coverage](coverage-summary.txt)) |
| `incorrect-equality` | 5 | **False positive** | The detector targets strict equality on balances or timestamps that an attacker can nudge. These compare an enum (`status == PendingTrigger`, `side == Side.Buy`) and two limit prices (`priceA == priceB`, the equal-price tie that `bookSeq` breaks). Exact equality is the intended semantics in every case |
| `timestamp` | 6 | **False positive** | None of the flagged comparisons reads `block.timestamp`. Slither's taint comes from the `Order` struct, whose `createdAt` field stores `uint64(block.timestamp)` (line 207). The flagged comparisons read *other* fields of the same struct (`status`, `price`, `triggerPrice`). `createdAt` is never compared or used in any logic |
| `costly-loop` | 9 | **Accepted (by design)** | Storage writes inside the bounded match and trigger loops: `delete` of list links when an order leaves a list, `lastTradePrice` and `hasTradePrice` per fill, and `_bookSeq` per activation. Every loop is bounded (at most `MAX_MATCHES_PER_TX` = 10 fills per call, at most 10 activations per trigger call), and gas is measured in SPEC O2 and [gas-report.txt](gas-report.txt). `lastTradePrice` must be written per fill: within one trigger call, a fill can make the next stop eligible (the cascade, SPEC section 5), and `StopOrderTriggered` reports the current price |
| `naming-convention` | 5 | **Accepted (frozen interface)** | `PRICE_SCALE()`, `LOT_SIZE()`, `TICK_SIZE()`, `MAX_MATCHES_PER_TX()` and `MAX_INSERT_SCAN()` are public constants whose names are part of the frozen `CONTRACT_INTERFACE.md`, and the frontend calls them by these names |

**Interpretation.** Slither found nothing the engine's tests had not already covered. The detectors for the classes that matter most in this design all stayed silent, consistent with `nonReentrant` on every external write, owner checks in `cancelOrder`, `SafeERC20` everywhere, and `mulDiv` for every `qty × price`. Slither does not reason about economic or ordering properties (price-time priority, solvency, stop-trigger griefing). Those are covered by the invariant suite, the mutation tests and the independent reviews.
