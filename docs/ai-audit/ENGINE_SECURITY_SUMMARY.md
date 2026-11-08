# Engine security summary (`OrderBook.sol`)

The trading engine's security case in one place: what it protects, how, what is accepted, and where the evidence is. Behaviour is defined in [SPEC.md](../../SPEC.md). Every claim below links to committed evidence.

## Threat model
**Assets:** traders' escrowed tokens. These are base for resting and pending sells, and quote (`lockedQuote`) for resting and pending buys. The contract holds no other funds and has no owner, admin, pause or upgrade path.

**Actors:** any address, acting as a trader, a caller of the permissionless `matchOrders` and `triggerStopOrders`, or a hostile ERC20 listed as a market token (`MarketFactory` is permissionless).

**Goals the engine must meet:**
1. **No loss:** nobody can take another trader's escrow, and a trader never pays more than their limit.
2. **No stuck funds:** every unfilled amount can be refunded by its owner.
3. **Exact accounting:** balances held equal the escrow owed (SPEC A8).
4. **Fair execution:** price-time priority, at the maker's price.
5. **Bounded gas:** no function's cost grows with the size of the book.
6. **Liveness:** no actor can permanently block placement, cancel, matching or triggering.

## Defences
| Defence | Protects against | Evidence |
|---|---|---|
| **Escrow at placement**: a sell pulls `amount` base; a buy pulls `ceil(amount × limit)` quote; pending stops escrow at the limit price | Unfunded orders and fills paid from other traders' escrow | `assertSolvent` after almost every test; `invariant_solvency` over 128,000 deep-run calls |
| **A5 refund rule**: after each fill, `lockedQuote = requiredQuote(remaining, limit)`, and the excess is refunded at once | Over-paying on price improvement; an underfunded remainder | Fuzz tests with reference arithmetic; `invariant_orderFields` (escrow == reference ceiling) |
| **Lot and tick sizes (1e9)** make every `qty × price / 1e18` exact (A1) | Rounding dust and zero-cost fills | `testFuzz_requiredQuote_*` differentials, including 512-bit precision |
| **`Math.mulDiv`** for every `qty × price` | Overflow panics in settlement (issue 003) | `test_issue003_*`; the 512-bit differential fuzz |
| **`nonReentrant` on every external write**; `SafeERC20`; CEI per fill, with the two documented placement deviations (SPEC section 5) | Re-entry through a hostile token at any transfer | Reentrancy tests at every transfer point (escrow pull, payouts, refunds, cancel, trigger), with swallow-mode tests showing single payment; `ViewSpyERC20` pins mid-transfer views; Slither: no reentrancy detector fired |
| **Owner-only cancel**, with the owner checked before status and the zero address rejected | Cancelling someone else's order; unknown-ID edge cases (issue 005) | Cancel tests; `test_issue005_*`; mutant Z in every smoke set |
| **Guarded linked lists**: `_unlink` reverts unless the order is in its list; the order's status selects the list | Book corruption that hides resting orders (issue 001) | `assertBookSorted` (sorted, linked, no duplicates, membership matches status); `invariant_lists` |
| **Bounded loops**: at most 10 fills per call, at most 100 insert steps, at most 10 activations per trigger call, one shared fill budget per trigger call | Gas exhaustion as the book grows | [gas-report.txt](test-evidence/phase8/gas-report.txt): placement max 1.81M, `matchOrders` 0.78M, trigger 2.00M; SPEC O2 |
| **`hasTradePrice` guard**: no stop triggers before the first trade | Triggering on a default price of 0 | `test_trigger_nothingBeforeTheFirstTrade`; `invariant_handlerChecks` |
| **Auto-cancel at activation**: a stop that cannot enter the book is refunded instead of reverting the call | A 102-wei denial of service that blocked every stop (issue 006) | `test_issue006_*`; mutants P6x and P6y |
| **No admin surface**: no owner, pause, fee or upgrade | Privileged theft or freeze | Code inspection; the interface |

## Verification evidence
| What | Result | Where |
|---|---|---|
| Unit, fuzz and regression tests | 334 passed (244 engine) in the Phase 7 run; 335 once the issue 007 test was added in Phase 8 | [phase7/forge-test-default.txt](test-evidence/phase7/forge-test-default.txt); the Phase 8 log |
| Invariants, default profile (256 × 64) | All held, 0 reverts | same |
| Invariants, deep profile (1,000 × 128 = 128,000 calls) | All held, 0 reverts, about 2 h; fuzz 19 tests at 10,000 runs plus 1 at its 200-run setting | [phase7/forge-test-deep.txt](test-evidence/phase7/forge-test-deep.txt) |
| Coverage, `OrderBook.sol` | 100% lines (182/182), statements (246/246), branches (59/59) and functions (25/25) | [phase8/coverage-summary.txt](test-evidence/phase8/coverage-summary.txt) |
| Slither 0.11.6 | 27 results, 0 real (13 false positives, 14 accepted) | [phase8/slither-triage.md](test-evidence/phase8/slither-triage.md) |
| Mutation testing | The full set of 67 hand-written mutants, run once on 8 Nov: 65 caught, the 2 survivors (R4, P5q) documented as equivalent; every phase's own set was caught; the invariant suite alone caught 15 of 17 | [MUTANTS.md](test-evidence/MUTANTS.md); [full-set run](test-evidence/wrapup/verification/mutants-full-set.txt) |
| Independent AI reviews | One per phase, plus a final end-to-end audit | Prompt log; final audit below |
| Real chain | Person 2's deploy script on a scratch Anvil, plus cast journeys for cancel, batch and stop-limit; all balance checks passed | Prompt log (7 Nov); [ENGINE_HANDOFF.md](../ENGINE_HANDOFF.md) |
| Issues found | 7: six fixed, each with failing-then-passing evidence, and one accepted and pinned (007) | [issues/](issues/) |

## Final independent audit (8 Nov)
A fresh subagent with no session context audited `OrderBook.sol` and `IOrderBook.sol` end to end. It ran the suite (332 passing) and proofs of concept in a scratch copy, and edited no repo file.

**Result: no Critical or High finding.**

**Checked and found clean:**
- **Funds:** escrow leaves only to a counterparty or as the owner's refund.
- **Access control.**
- **Reentrancy and CEI.**
- **Rounding:** exactness (A1) cannot be broken by any input.
- **Bounded loops.**
- **Permanent denial of service:** none possible.
- **Price-time priority and `bookSeq`.**
- **Stop-trigger logic.**
- **List integrity:** the status-selected heads are correct on every path.
- **Interface drift:** none.
- **Issues 001 to 006:** all still hold.

| Finding | Severity | Outcome |
|---|---|---|
| **M-1:** a dust front-run sandwiches an honest limit order through the fill cap, so the victim pays up to their limit | Medium | **Accepted by human decision.** Documented in SPEC section 8, logged as [issue 007](issues/007-dust-sandwich-of-capped-limit-order.md), and pinned by `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` (reproduced in the repo to the wei) |
| L-1: SPEC section 2 "Insertion" row out of date after issue 006 | Low (docs) | Fixed |
| L-2: SPEC understated dust griefing (equal-price orders are blocked too) | Low (docs) | Fixed |
| L-3: views during `triggerStopOrders` payouts not documented | Low (docs) | Documented in SPEC section 5 |
| I-1: auto-cancel `OrderCancelled` looks like an owner cancel; no refund event; `createdAt` not updated on activation | Info | In `ENGINE_HANDOFF.md` for the frontend |
| I-2: reversed-pair listing can pre-empt the seed market; any 18-decimal token can be listed | Info | In `ENGINE_HANDOFF.md` for Person 2 (factory) |
| I-3: Slither results | Info | Agrees with the triage: no real finding |

## Known limitations (accepted; SPEC section 8)
- **`lastTradePrice` is manipulable:** any single trade, even 1 lot, sets it, so an attacker can move it to set off stops. A fill is never worse than the stop's own limit.
- **Stop sniping through the shared trigger budget:** an activated stop can rest crossed, and be filled at its limit before `matchOrders` runs.
- **Limit-order sandwich through the fill cap** ([issue 007](issues/007-dust-sandwich-of-capped-limit-order.md)): dust front-running can make an honest order pay up to its own limit. The loss is bounded by that limit, and no escrow is stolen.
- **Dust griefing of `MAX_INSERT_SCAN`:** placements behind more than 100 better-or-equal orders revert, and such an activated stop is cancelled and refunded.
- **A capped placement can leave the book crossed** until anyone calls `matchOrders`, and there is no reward for calling it.
- **Push payouts:** a token that refuses transfers to an address could block fills against that address's orders. Plain ERC20s, such as the factory's `DemoToken`, cannot.
- **Unsupported tokens:** only 18-decimal tokens are supported; fee-on-transfer and rebasing tokens are not. Tokens sent directly to the contract are stranded.
- **Not covered:** no human security audit was done. Testing used a local Anvil only, not a public network.
