# 6. Validation Process & Testing Strategy (engine)

Fits Person 2's draft section 6. All numbers are from committed evidence: [`docs/ai-audit/test-evidence/phase7/forge-test-default.txt`](../ai-audit/test-evidence/phase7/forge-test-default.txt) (Foundry 1.8.6, 7 Nov), [`MUTANTS.md`](../ai-audit/test-evidence/MUTANTS.md) and the prompt log.

## Layers
| Layer | What it proves | Where |
|---|---|---|
| Unit tests, per phase | Each function's behaviour against SPEC: exact balances to the wei, events, error selectors, list links after every change | `contracts/test/OrderBook.*.t.sol` |
| Shared assertions after almost every test | `assertSolvent` (SPEC A8: held balances equal unfilled sells plus `lockedQuote`, pending stops included). `assertBookSorted` (both book lists and both stop lists sorted and linked, no duplicates, list membership matches status) | `test/OrderBookBase.t.sol` |
| Adversarial tokens | Re-entry at every transfer point (escrow pull, base payout, quote payout, price-improvement refund, cancel refund, trigger fills) reverts with `ReentrancyGuardReentrantCall`. A "swallow" mode shows the outer call completes and pays exactly once. View spies pin what is visible mid-transfer (CEI) | `test/mocks/ReentrantERC20.sol`, `ViewSpyERC20.sol` |
| Property fuzzing | Random prices, sizes and sides for place, cancel, batch and stop triggers, with balances checked against reference arithmetic written in the test; `requiredQuote` differentials, including 512-bit precision via `mulmod` | `test/OrderBook.Fuzz.t.sol` plus fuzz tests in the phase suites |
| Stateful invariants | Random sequences of all six handler actions, with every invariant checked after every call | `test/invariant/` |
| Regression suite | One named test per engine issue (001 to 006), plus the brief's full journey on the factory stack | `test/OrderBook.Regression.t.sol` |
| Mutation testing | The tests catch real bugs: hand-written mutants of `OrderBook.sol`, one at a time | `docs/ai-audit/test-evidence/mutants.sh`, `MUTANTS.md` |
| Integration and real chain | TokenFactory, then MarketFactory, then OrderBook, in-process. Plus Person 2's deploy script on a scratch Anvil (port 8546), with `cast` journeys for cancel, batch and stop-limit; every balance check passed, and the transaction hashes are in the prompt log | `test/Integration.Factory.t.sol`; prompt log, 7 Nov |
| Independent AI review | A fresh read-only subagent per phase, with no session context. Findings were fixed with tests, and real bugs logged | Prompt-log entries |
| Frontend compatibility | Person 2's suites re-run after each engine change: `npm test` gave 410 passed and 48 skipped (gated); `tsc --noEmit` clean; exporter 21 passed; `export-web --check` up to date after the ABI regeneration | Prompt log, 7 Nov |

## Test counts (default profile, 7 Nov)
**334 passed, 0 failed, 0 skipped** across 26 suites: 244 engine tests and 90 of Person 2's. Phase 8 added one test (issue 007), giving **335 (245 engine) on `engine-final`**, the figure used in the assembled report.

| Engine suite | Tests |
|---|---|
| `OrderBook.Book` (lists, insert, unlink) | 23 |
| `OrderBook.Place` | 22 |
| `OrderBook.Match` (+ payout views, reentrancy) | 37 + 2 + 4 |
| `OrderBook.Cancel` (+ refund views, reentrancy) | 37 + 2 + 13 |
| `OrderBook.Batch` (+ payout views, reentrancy) | 24 + 1 + 6 |
| `OrderBook.Stop` (+ reentrancy) | 39 + 3 |
| `OrderBook.Fuzz` | 8 |
| `OrderBook.Regression` (issues, journey, and the issue 007 limitation, added in Phase 8) | 6 + 1 + 1 |
| `Integration.Factory` | 6 |
| Constructor (`OrderBookBase`) | 8 |
| Invariant suite and reach test | 1 + 1 |

## Invariants (checked after every handler call)
1. **Solvency, including pending stops (A8).**
2. **Conservation:** fixed total supply, fully accounted for across every holder.
3. **Independent ledger:** each participant's balance equals funding plus a reference model's ledger. The model replays every `Trade` and `OrderCancelled` with its own arithmetic (A2 to A7). It catches payouts of the right amount to the wrong address.
4. **Order fields:**
   - `filled <= amount`
   - status consistent with fills
   - closed orders hold no escrow and no links
   - live buys hold exactly `ceil(remaining × limit)`
5. **Lists:** sorted and linked; the book holds exactly the Open and PartiallyFilled orders, and the stop lists exactly the PendingTrigger orders.
6. **Handler checks, recorded during each call:**
   - **Reverts:** no revert an action cannot legitimately hit. `BookTooDeep` and auto-cancels are verified, with more than `MAX_INSERT_SCAN` orders ranked ahead.
   - **Events:** return values match events. `Trade` is at the maker's price with the reference cost. `StopOrderTriggered` carries the current price.
   - **Matching:** no taker rests while it still crosses below the cap.
   - **Trade price:** `lastTradePrice` changes only through a `Trade`, and nothing triggers before `hasTradePrice`.
7. **`afterInvariant`:** `matchOrders` until it returns 0 always leaves the book uncrossed.

**Default run:** 256 runs × depth 64 = 16,384 calls, 0 reverts, all invariants held. Calls per action were burst 2,737, cancel 2,717, matchOrders 2,756, and the rest similar.

**Reach:** Foundry resets state between runs, so path counts cannot be summed across runs. The deterministic reach test therefore drives the same handler for 600 uniform-weight steps, checking every invariant every 25 steps. It reached the following (`SUMMARY` lines of `OrderBookInvariantReachTest` in `phase7/forge-test-default.txt`; the test is deterministic, so every run gives the same counts):

| Path | Count |
|---|---|
| Crossing fills | 840 |
| Cap hits | 13 |
| Calls leaving the book crossed | 390 |
| Cancels (open / partial / pending) | 32 / 15 / 15 |
| `matchOrders` calls that filled | 32 |
| Stop activations | 69 |
| Shared trigger budget used up | 9 |
| Issue 006 auto-cancels | 6 |
| Violations | 0 |

**Deep profile** (1,000 runs × depth 128, plus fuzz at 10,000 runs):

- **Result: all 6 invariants plus `afterInvariant` held.** 1,000 runs × depth 128 = **128,000 calls, 0 reverts**, in 7,088 s, run in an isolated copy of `contracts/` with the engine at HEAD.
- **Calls per action:** burst 21,186, cancel 21,080, matchOrders 21,580, placeLimit 21,377, placeStop 21,278, triggerStops 21,499.
- **Last run's summary:** 3 cap hits, 47 crossed-book calls, 8 activations, 1 auto-cancel, 0 violations.
- **Deep fuzz:** 20/20 fuzz tests passed: 19 at 10,000 runs, and `testFuzz_coarsePlacementsKeepSolvencyAndBookOrder` at its own 200-run deep setting.
- **Evidence:** [`phase7/forge-test-deep.txt`](../ai-audit/test-evidence/phase7/forge-test-deep.txt).
- **A wrong status report along the way:** the run was at one point reported as dead, because a process listing missed it. It had kept running, and it completed.

## Mutation testing (summary)
- **Per-phase sets were all caught,** except provably equivalent mutants:
  - Phase 4: 16/17, where R4 is equivalent (lot and tick sizes make the recomputed refund equal to `lockedQuote`).
  - Phase 5: 19/20, where P5q is equivalent (an empty bid side reads as price 0).
  - Phase 6: 28/28.
  - Phase 7: unit suite 11/11.
- **The invariant suite alone** caught 15 of 17, including every wrong-recipient, matching-rule and auto-cancel mutant. The two survivors are caught by unit tests: S1 is a zero-value transfer, and R1 a 1-wei refund that the handler's sizes cannot produce.
- **Mutants were reviewed, not just counted.** Surviving mutants drove new tests: the Phase 4 status check and minimum refunds, the Phase 5 empty-ask break, and the Phase 6 event price and starvation.

## Gas and size
| Measurement | Value | Source |
|---|---|---|
| Worst placement built (10 fills with refunds, then a deep insert) | 1,778,221 gas | SPEC O2 |
| `matchOrders(10)`, 10 fills with refunds | 765,646 gas | SPEC O2 |
| `triggerStopOrders(10)`, 10 deep inserts / 10 fills with refunds | 1,998,765 / 1,482,995 gas | SPEC O2 |
| OrderBook runtime / initcode | 8,461 B / 9,124 B | `forge build --sizes`, after Phase 6 |
| MarketFactory runtime / initcode | 10,508 B / 10,537 B (limits 24,576 B / 49,152 B) | same |

Every loop is bounded: at most 10 fills per call, `MAX_INSERT_SCAN` = 100 insert steps, and at most 10 activations per trigger call.

## Static analysis (Slither)
- **Run:** Slither 0.11.6 (102 detectors) on `OrderBook.sol` and `IOrderBook.sol`.
- **Result: 27 results, 0 real.**
  - `uninitialized-state` ×2: **false positive.** The heads are written through the storage alias that `_heads()` returns, which Slither does not follow.
  - `incorrect-equality` ×5: **false positive.** These compare an enum and a price tie, so exact equality is intended.
  - `timestamp` ×6: **false positive.** No comparison reads `block.timestamp`. The taint comes from the stored `createdAt`.
  - `costly-loop` ×9: **accepted.** Storage writes in loops bounded at 10.
  - `naming-convention` ×5: **accepted.** The constant names come from the frozen interface.
- **No reentrancy, access-control, arbitrary-send or unchecked-transfer detector fired.**
- **Evidence:** [`phase8/slither.txt`](../ai-audit/test-evidence/phase8/slither.txt), [`phase8/slither-triage.md`](../ai-audit/test-evidence/phase8/slither-triage.md).

## Coverage
- **Run:** `forge coverage --report summary --no-match-path 'test/invariant/*'`. All 332 tests passed under coverage instrumentation.
- **Result: `OrderBook.sol` has 100% coverage on every measure:** lines 182/182, statements 246/246, branches 59/59, functions 25/25.
- **No uncovered branch was left, so no test was added for coverage.**
- **The lower repo-wide total comes from** the excluded invariant handler (not run here) and Person 2's deploy script.
- **Evidence:** [`phase8/coverage-summary.txt`](../ai-audit/test-evidence/phase8/coverage-summary.txt).
- **Gas and sizes** were saved alongside it: [`gas-report.txt`](../ai-audit/test-evidence/phase8/gas-report.txt) and [`sizes.txt`](../ai-audit/test-evidence/phase8/sizes.txt). Over the unit suites, the maximums were placement 1.81M, `matchOrders` 0.78M and `triggerStopOrders` 2.00M.

## Final independent audit
- **Run:** a fresh subagent, with no prior context, audited `OrderBook.sol` end to end, with proofs of concept in a scratch copy.
- **Result: no Critical or High finding.** Every class was clean (funds, access control, reentrancy, rounding, loops, permanent denial of service, priority, stops, lists, interface), and issues 001 to 006 still hold.
- **One Medium:** the dust sandwich of a limit order through the fill cap. **Accepted by human decision** as issue 007, documented in SPEC section 8, and pinned by a regression test reproduced to the wei.
- **Three Low documentation fixes** were applied. The Info notes went to the handoff.
- **Details:** [`ENGINE_SECURITY_SUMMARY.md`](../ai-audit/ENGINE_SECURITY_SUMMARY.md).

## What this does not prove
- Tests prove only the scenarios and properties they check. Invariants are checked on random sequences up to depth 64 (default), not exhaustively.
- Mutation results depend on which mutants were written.
- Gas figures are measured cases, not proven upper bounds.
- The cast journeys ran on a local Anvil, not a public testnet.
- No human security audit was done. The independent reviews were AI subagents.
