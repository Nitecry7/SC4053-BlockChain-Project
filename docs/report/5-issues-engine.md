# 5. Problems Discovered & Vulnerability Analysis (engine)

Fits Person 2's draft section 5.6. Six engine issues were logged in the brief's four-part format (section 2.2), each in its own file under [`docs/ai-audit/issues/`](../ai-audit/issues/), with the full before-and-after output. They are ranked here by severity. Every one is in AI-written code or AI-written tests; none was found in production. Each has a named regression test in [`contracts/test/OrderBook.Regression.t.sol`](../../contracts/test/OrderBook.Regression.t.sol) (Phase 7), as well as its original test.

## Inventory

| # | Issue | Class | Severity | Found by | Fixed in |
|---|---|---|---|---|---|
| 006 | One unplaceable stop blocked every stop activation, on both sides, for 102 wei | Unhandled gas bound, so a denial of service | **High** (availability) | Independent Phase 6 review, reproduced by running | Phase 6, `1adcc59` |
| 004 | Phase 3a tests passed with three serious matching bugs in the code | Test quality: overfill (fund loss), phantom fills, wrong Trade fields | **High** (tests) | Phase 3a review, by mutation | Phase 3a, `6d1d14c` |
| 002 | SPEC understated the CEI deviation in placement (payouts during the match loop) | Documentation of reentrancy reasoning | Medium | Phase 3a review (a reviewer token read views mid-payout) | Phase 3a |
| 003 | A buy could be accepted and then panic when filled (`qty * price` overflow) | Integer and math | Low | Phase 3a review, reproduced | Phase 3a |
| 005 | `cancelOrder` treated `address(0)` as the owner of unknown orders | Access control edge case | Low | Phase 4 review | Phase 4, `dab79f8` |
| 001 | `_unlink` could empty one side of the book | Data-structure integrity (latent) | Latent | AI flagged it; the human required a code guard | Phase 2a, `dfe7318` |

## Each issue in four parts (summary; full text in the issue files)

### 006: unplaceable stop blocks all triggers ([file](../ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md))
1. **Why the AI erred:** it reused the book's insert path, which reverts with `BookTooDeep` as a gas bound, for stop activation. It missed that in `triggerStopOrders` the revert rolls back a permissionless call that serves *every* stop, and that the failing stop stays at the head, so every later call hits it. It had noticed the revert, but described it as an accident.
2. **Impact:** an attacker holds a self-owned stop with the lowest trigger, plus 101 one-lot bids of 1 wei escrow each. Every trigger call then reverts, permanently, and no stop-loss on either side can ever fire.
3. **Fix:** a non-reverting `_tryInsert`. An activated remainder that cannot enter the book is cancelled and refunded through the existing `OrderCancelled` (shared `_closeAndRefund`). No ABI change. The human chose this option out of four.
4. **Evidence:** on the pre-fix line, 3 FAIL with `BookTooDeep()`; after the fix, 3 PASS. Mutant P6x (the pre-fix code) is caught by the unit suite and by the invariant suite alone.

### 004: matching test gaps ([file](../ai-audit/issues/004-matching-test-gaps.md))
1. **Why:** the tests were written from the prompt's list of shapes. The AI never asked what would still pass if the code were wrong.
2. **Impact:** three bugs would have shipped green:
   - overfilling a partly filled maker, paid from other traders' escrow
   - fills continuing after the taker was filled
   - `Trade` reporting buyer and seller instead of maker and taker
3. **Fix:** three targeted tests, and a stronger `assertBookSorted`.
4. **Evidence:** before, all three mutants SURVIVED (73 tests passing). After, each fails exactly one test. *Phase 7 note:* the first issue-004 regression test in the new suite could not reproduce bug (a), as the Phase 7 review found (M3). It was corrected and shown failing on the pre-fix line (`ERC20InsufficientBalance`).

### 002: CEI deviation understated ([file](../ai-audit/issues/002-undocumented-cei-deviation-in-matching.md))
1. **Why:** the rationale was written for the escrow pull before matching existed, reasoning about one external call. The AI did not ask what the loop's payouts would do.
2. **Impact:** the security reasoning was incomplete. A token callback during a payout sees a partly filled taker not yet in the book. The report would have under-claimed the deviations.
3. **Fix:** SPEC section 5 documents the second deviation and what views show. `ViewSpyERC20` tests pin it. The `CLAUDE.md` rule names both exceptions.
4. **Evidence:** documentation fix, so there is no failing-then-passing output by design. `test_payout_viewsShowFillSettledAndRemainderNotYetRested` and `test_issue002_viewsDuringAPayoutMatchTheDocumentedDeviation` pin the behaviour.

### 003: fill-cost overflow ([file](../ai-audit/issues/003-fill-cost-overflow.md))
1. **Why:** the same formula was written two ways. Escrow used `mulDiv`; settlement copied `q * p / PRICE_SCALE` from the spec. The AI did not check that the two accept the same input range.
2. **Impact:** an order accepted at placement could not be settled, so a huge resting order became unfillable. Only reachable with open-mint tokens.
3. **Fix:** settlement uses `Math.mulDiv`.
4. **Evidence:** `panic: arithmetic underflow or overflow (0x11)`, then PASS. In Phase 7, 512-bit differential fuzzing of `requiredQuote` confirms the ceiling is exact in the overflow region.

### 005: zero-address owner check ([file](../ai-audit/issues/005-cancel-zero-address-owner-check.md))
1. **Why:** `order.trader != msg.sender` was assumed to reject unknown IDs. That holds for every caller except `address(0)`. `Open` is the enum's zero value, so the status check passed too.
2. **Impact:** a wrong error for unknown IDs, and `cancelOrder(0)` succeeding from the zero address, which could mislead frontend or indexer simulations. No funds at risk.
3. **Fix:** `if (order.trader == address(0) || order.trader != msg.sender) revert NotOrderOwner();`
4. **Evidence:** `OrderNotActive() != NotOrderOwner()` FAIL, then PASS. Mutant Z is caught in every phase's smoke set.

### 001: `_unlink` could empty a side ([file](../ai-audit/issues/001-unlink-empties-book-side.md))
1. **Why:** `prev == 0` was taken to mean "head", but an order not in the book also has `prev == 0`. The AI documented the precondition in a comment rather than enforcing it.
2. **Impact:** one missed check in a later caller would hide every resting order on that side, with its escrow still held.
3. **Fix:** a link guard that reverts with the existing `OrderNotActive`. The interface was frozen, so no new error was added.
4. **Evidence:** 3 FAIL (`0 != 1`, no revert), then 3 PASS.

## Other review findings that were not logged as bugs
Each phase's independent review also found **test gaps**: tests that would still pass under a plausible bug. All of them were closed with tests and proved by mutants:
- **Phase 4:** a masked status check, and 1-wei and one-lot refunds.
- **Phase 5:** an untested empty-ask break.
- **Phase 6:** the event price, sell starvation by an ineligible buy head, and an untested partial activated buy.
- **Phase 7:** the invariant suite itself:
  - **tautological ghost flows:** a payout to the wrong address was undetectable, and is now caught by an independent ledger
  - **weak reach**
  - **unchecked tolerated reverts**

Details are in each phase's prompt-log entry and in [`MUTANTS.md`](../ai-audit/test-evidence/MUTANTS.md).

## Accepted limitations (design, documented in [SPEC section 8](../../SPEC.md))
These were reviewed and deliberately kept, not left unfixed:
- **Manipulable `lastTradePrice` for stops:** any single trade sets it.
- **Stop sniping** when a trigger call's shared budget runs out. Reproduced by the Phase 6 review; a fill is never worse than the stop's own limit.
- **Dust griefing** of the insert bound: it now cancels and refunds a stop rather than blocking anyone.
- **A crossed book after a capped placement**, until `matchOrders` runs.
- **No reward** for calling `matchOrders` or `triggerStopOrders`.
- **Push payouts:** a blocklisting token could block a maker.
- **18-decimal tokens only.**
- **Self-trades allowed.**

## Static analysis and final audit
> **PLACEHOLDER (Phase 8):** any real finding from Slither or the final independent audit, added to the inventory above in the four-part format, or "none" with a link to the triage. Slither 0.11.6 has not yet been run on `OrderBook.sol`.
