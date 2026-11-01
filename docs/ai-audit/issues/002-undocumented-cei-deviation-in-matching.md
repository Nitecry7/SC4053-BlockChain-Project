# Issue 002: SPEC.md understated the CEI deviation in `placeLimitOrder`

- **Date:** 2026-11-02
- **Phase:** 3a (matching and settlement)
- **Found by:** Independent subagent review (`/review-engine`, finding F1). The reviewer confirmed it by running a token that read views during a payout.
- **Severity:** Medium, documentation. No funds at risk. `nonReentrant` blocks every write during the gap.

## 1. Why the AI made the mistake
On 1 Nov the AI wrote the SPEC.md rationale for pulling escrow before matching, and described that pull as the one CEI exception. It reasoned about the single external call under discussion, and wrote this before matching existed. It did not ask what the rest of the function would do once fills, which also make external calls, ran in a loop. It treated `_settleFill` following CEI as if the whole function did.

## 2. Why it is problematic
The security reasoning in the spec was incomplete. In the code, fill N's payouts come before fill N+1's state changes, and before any remainder rests. Anyone relying on the spec would miss that:
- A token callback reading views during a payout sees an unfinished order. For example, a taker can show PartiallyFilled while it is not yet in the book.
- The report would have made a false claim to the graders about how many deviations exist.

## 3. How we fixed it
Spec update only; the code did not change:
- SPEC.md section 5 now documents the second deviation, and lists what views can show during the pull and during a payout.
- The SPEC.md section 2 rule now refers to the exceptions in section 5, not one exception.
- New test and mock (`test/mocks/ViewSpyERC20.sol`) pin what views show during a payout.

The human then changed the CLAUDE.md engine rule to name both exceptions, on 2 Nov.

## 4. Evidence the fix works
This is a documentation fix, so there is no failing-then-passing output for the deviation itself. The new tests describe the existing behaviour, and they passed when first run.

Regression tests in `contracts/test/OrderBook.Match.t.sol`:
- `test_payout_viewsShowFillSettledAndRemainderNotYetRested`
- `test_payout_tradeEmittedBeforeTransfers`

They do catch a change of order. Moving these statements after the transfers in a temporary mutant failed the tests:
```
F8 lastTradePrice after transfers: ... 78 tests passed, 1 failed, 0 skipped (79 total tests)
    test_payout_viewsShowFillSettledAndRemainderNotYetRested
F8 _unlink after transfers: ... 78 tests passed, 1 failed, 0 skipped (79 total tests)
    test_payout_viewsShowFillSettledAndRemainderNotYetRested
F8 emit Trade after transfers: ... 78 tests passed, 1 failed, 0 skipped (79 total tests)
    test_payout_tradeEmittedBeforeTransfers
```
Before these tests existed, the same three mutants passed the whole suite:
```
F8 lastTradePrice after transfers: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
F8 _unlink after transfers: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
F8 emit Trade after transfers: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
```
