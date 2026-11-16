# Phase 0: diff of OrderBookMitigated.sol against src/OrderBook.sol

Command: `diff contracts/src/OrderBook.sol contracts/test/termpaper/OrderBookMitigated.sol` (run 2026-11-17, branch
`term-paper/research`, base commit 96107ad).

## Result: the only behavioural changes are M1 and M2

| Hunk | Mitigated file line | Kind | Note |
|---|---|---|---|
| Import path `./interfaces/IOrderBook.sol` to `../../src/interfaces/IOrderBook.sol` | 9 | Non-behavioural | Needed because the file lives in `test/termpaper/` |
| Contract renamed `OrderBook` to `OrderBookMitigated`, doc comment added | 14 to 18 | Non-behavioural | |
| `uint256 public immutable minOrder` | 29 | M1 support | New public getter `minOrder()` (not in CONTRACT_INTERFACE.md; acceptable for a research copy) |
| Constructor takes a third argument `minOrder_` | 52 to 53 | M1 support | Constructor signature differs from the engine; `MarketFactory` cannot deploy this copy unchanged |
| `if (amount < minOrder) revert ZeroAmount();` in `placeLimitOrder` | 66 | M1 | |
| `if (amount < minOrder) revert ZeroAmount();` in `placeStopLimitOrder` | 98 | M1 | M1 also covers stop placement, not only limit placement |
| Remainder: `if (_stillCrossed(orderId)) _closeAndRefund(orderId); else _insert(orderId);` | 75 to 78 | M2 | |
| New `_stillCrossed` view | 81 to 88 | M2 | Compares against the opposite **head** only |
| `triggerStopOrders`: `(_stillCrossed(orderId) \|\| !_tryInsert(orderId))` then `_closeAndRefund` | 162 to 164 | M2 | M2 also covers activated stops |

No other hunks. Matching, settlement, `matchOrders`, cancel, views and the list code are byte-identical.

## Things to report (not extra changes, but worth knowing)

1. **M1 reuses the `ZeroAmount` error** (lines 66, 98). An order of 1 lot that is below `minOrder` reverts with
   `ZeroAmount`, which is misleading. A real implementation would need a new error, which CONTRACT_INTERFACE.md
   does not have. `test_E5_dustBelowMinimumIsRejected` expects `ZeroAmount` for this reason.
2. **M2 reuses `_closeAndRefund`**, so the victim's remainder emits `OrderCancelled` and ends in status
   `Cancelled` even if it was partly filled. Off-chain consumers cannot tell an M2 auto-cancel from an owner cancel
   (same issue as audit finding I-1 in `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md`).
3. **M2 changes the user-visible contract of a limit order.** On the engine an unfilled remainder always rests
   (SPEC O4). On the mitigated copy a capped, still-crossed remainder is refunded and must be resubmitted.
4. **M2 on stops cancels the stop.** In `triggerStopOrders` a sniped stop is refunded, so the owner's stop-loss
   protection is gone, not just delayed (see E7 in `README.md`).
5. All experiment runs use `minOrder = 0` except `test_E5_dustBelowMinimumIsRejected` (`minOrder = 0.1e18`). So E5
   (sandwich), E6, E7 measure **M2 alone**; M1 is only shown to reject one dust order.
