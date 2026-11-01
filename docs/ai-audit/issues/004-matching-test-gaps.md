# Issue 004: The Phase 3a tests passed with serious matching bugs in the code

- **Date:** 2026-11-02
- **Phase:** 3a (matching and settlement)
- **Found by:** Independent subagent review (`/review-engine`, finding F7), by mutation testing. Reproduced by the main session.
- **Severity:** High for test quality. The engine code itself was correct, so no bug shipped.

## 1. Why the AI made the mistake
The AI wrote tests from the prompt's list of shapes: exact match, maker partly filled, taker partly filled. Each test used a maker for one fill only, and the Trade event test covered only a sell maker. The AI did not ask what would still pass if the code were wrong, so three cases went uncovered:
- a maker that is filled a second time
- a taker that is exactly filled while more crossing liquidity remains
- a buy maker with a sell taker, where "maker and taker" and "seller and buyer" differ

A green suite with 73 tests made the coverage look better than it was.

## 2. Why it is problematic
These bugs would all have passed the suite:
- **Fill size ignoring `maker.filled`:** a partly filled maker would be overfilled, paying out of other traders' escrow. This is a direct loss of funds.
- **Match loop not stopping at a filled taker:** zero-quantity fills, false `Trade` events, a wrong `lastTradePrice`, and a wrong status on the next maker. The stop-limit phase depends on `lastTradePrice`.
- **`Trade` reporting seller and buyer as maker and taker:** wrong data in the frontend's trade history for every sell taker.

## 3. How we fixed it
Added regression tests; the engine code did not change for this issue:
- `test_match_partlyFilledMakerFilledAgain`
- `test_match_stopsWhenTakerExactlyFilled`
- `test_match_emitsTradeWithBuyMakerAndSellTaker`

`assertBookSorted` also got stronger, from review finding F10. Every order in a list must be live, and every placed order's book membership must match its status.

## 4. Evidence the fix works
**Before, all three mutants passed the whole suite:**
```
F7 min ignores maker.filled: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
F7 loop ignores taker filled: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
F7 Trade uses sell/buy addresses: SURVIVED | ... 73 tests passed, 0 failed, 0 skipped (73 total tests)
```

**After, each mutant fails exactly one test:**
```
[FAIL: ERC20InsufficientBalance(0xF62849F9A0B5Bf2913b396098F7c7019b51A820a, 6000000000000000000 [6e18], 10000000000000000000 [1e19])] test_match_partlyFilledMakerFilledAgain() (gas: 1072480)
Ran 6 test suites in 86.77ms (321.73ms CPU time): 78 tests passed, 1 failed, 0 skipped (79 total tests)

F7 loop ignores taker filled: CAUGHT | ... 78 tests passed, 1 failed, 0 skipped (79 total tests)
    test_match_stopsWhenTakerExactlyFilled
F7 Trade uses sell/buy addresses: CAUGHT | ... 78 tests passed, 1 failed, 0 skipped (79 total tests)
    test_match_emitsTradeWithBuyMakerAndSellTaker
```

The first line came from a direct run. The mutation script labelled that mutant SURVIVED in its final run, even though its summary showed 1 failed. The cause was the script's failure-name filter, which did not match that failure message.

**The unmutated code passes all 79 tests.**
