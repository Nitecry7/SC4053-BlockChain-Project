# Issue 003: A buy order could be accepted and then panic when filled

- **Date:** 2026-11-02
- **Phase:** 3a (matching and settlement)
- **Found by:** Independent subagent review (`/review-engine`, finding F4), reproduced by the main session.
- **Severity:** Low. It needs about 1e59 quote wei or more, so it is only reachable with tokens that have open minting.

## 1. Why the AI made the mistake
The same calculation was written two ways. `requiredQuote` used `Math.mulDiv`, which handles a 512-bit intermediate product. `_settleFill` used the plain `qty * price / PRICE_SCALE` from the prompt and from SPEC A4. The AI copied the formula and did not check that the two paths accept the same range of inputs. The lot and tick reasoning proves the division is exact, but it says nothing about overflow.

## 2. Why it is problematic
A very large order could pass placement, because `requiredQuote` fits in `uint256`, and rest as the book's head. Any crossing taker large enough to make `qty * price` overflow then reverts with an arithmetic panic, so that resting order cannot be filled at that size. With a real token supply this is unreachable, but the engine should not accept an order that it cannot settle.

## 3. How we fixed it
`_settleFill` in `contracts/src/OrderBook.sol` now uses the same arithmetic as the escrow:

```solidity
uint256 cost = Math.mulDiv(qty, price, PRICE_SCALE);
```

The result is unchanged for every input that did not overflow.

## 4. Evidence the fix works
Regression test: `test_match_settlesWhenQtyTimesPriceExceedsUint256` in `contracts/test/OrderBook.Match.t.sol`.

**Before the fix:**
```
[FAIL: panic: arithmetic underflow or overflow (0x11)] test_match_settlesWhenQtyTimesPriceExceedsUint256() (gas: 703951)
Ran 6 test suites in 130.01ms (548.74ms CPU time): 78 tests passed, 1 failed, 0 skipped (79 total tests)
```

**After the fix:**
```
[PASS] test_match_settlesWhenQtyTimesPriceExceedsUint256() (gas: 1039818)
Ran 6 test suites in 127.84ms (577.97ms CPU time): 79 tests passed, 0 failed, 0 skipped (79 total tests)
```
