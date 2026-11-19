# Experiment evidence (Phase 1)

Source of every number below: `experiments.txt` (this folder), produced on 2026-11-17 by
`forge test --match-path "test/termpaper/*" --isolate -vv` from `contracts/`, Foundry `forge 1.8.6`
(commit 6bad0a6), repo commit 96107ad (branch `term-paper/research`). Test file:
`contracts/test/termpaper/TermPaper.t.sol`. Mitigated engine: `contracts/test/termpaper/OrderBookMitigated.sol`.

Units: token amounts are whole tokens (18 decimals, printed by `log_named_decimal_int`). Gas is the per-call value
returned by `_lastCallGas()` (`TermPaper.t.sol:52`), summed over the listed transactions. Gas is not converted to
money anywhere in the tests, so no profit figure below is net of gas.

## Run status
- Experiments: `10 passed; 0 failed; 0 skipped`.
- Gas helper: `_lastCallGas()` worked on forge 1.8.6 without changes. Forge printed a deprecation warning only:
  `lastCallGas(): replaced by lastFrameGas`. It was not modified.
- `--isolate` check: the same command without `--isolate` gave identical numbers in this session (spot-checked every
  gas line). So `--isolate` has no effect on these figures on this Foundry build.
- Full existing suite (`forge test`, same commit): `Ran 28 test suites in 623.36s (689.44s CPU time): 345 tests passed,
  0 failed, 0 skipped (345 total tests)`. The 345 includes the 10 term-paper tests, so the existing 335 still pass.

## E1: fill-cap sandwich of a limit order (C1), original engine

Setup (`TermPaper.t.sol:97`): Bob asks 10 at 1.5. Mallory front-runs with 10 one-lot asks at 1.499. Carol buys 10 at
`limit`. If the book is crossed, Mallory sells the remainder into Carol at her limit and buys Bob's ask at 1.5.

| Case | Carol limit | Carol base received | Carol quote paid | Overpaid vs 15.0 | Mallory quote profit | Mallory base delta | Mallory gas (12 tx) | Carol gas |
|---|---|---|---|---|---|---|---|---|
| Baseline, no attack (`test_E1_baseline_noAttack`) | 2.0 | n/a (not logged) | 15.000000000000000000 | 0 | n/a | n/a | n/a | 426821 |
| 0.1% slack | 1.5015 | 10.0 | 15.014999999975000000 | 0.014999999975000000 | 0.014999999975000000 | 0 | 3910616 | 1047302 |
| 1% slack | 1.515 | 10.0 | 15.149999999840000000 | 0.149999999840000000 | 0.149999999840000000 | 0 | 3910616 | 1047302 |
| 5% slack | 1.575 | 10.0 | 15.749999999240000000 | 0.749999999240000000 | 0.749999999240000000 | 0 | 3910616 | 1047302 |
| 33% slack (issue 007) | 2.0 | 10.0 | 19.999999994990000000 | 4.999999994990000000 | 4.999999994990000000 | 0 | 3910616 | 1047290 |

Asserted (passes): overpay equals the closed form `(limit - 1.5) * (10 - 10 lots) - 0.001 * 10 lots`, and attacker
profit equals victim overpay exactly (`TermPaper.t.sol:146-148`).

## E2: stop hunt by a one-lot self-trade (C2), original engine

Setup (`TermPaper.t.sol:166`): last honest trade 2.0; honest ask 10 at 2.10; optional honest bid of `depth` at 1.90.
Carol: sell stop, trigger 1.95, limit 1.50, size 10. Mallory bids 10 at 1.50, self-trades one lot at 1.95, calls
`triggerStopOrders(1)`.

| Honest bid depth at 1.90 | Carol base sold | Carol quote received | Carol shortfall vs 2.0 | Mallory base bought | Mallory quote paid (at 1.5) | Mallory paper gain marked at 2.0 | Mallory gas (4 tx) |
|---|---|---|---|---|---|---|---|
| 0 | 10.0 | 15.0 | 5.0 | 10.0 | 15.0 | 5.0 | 1158241 |
| 5 | 10.0 | 17.0 | 3.0 | 5.0 | 7.5 | 2.5 | 1233135 |
| 10 | 10.0 | 19.0 | 1.0 | 0 | 0 | 0 | 1173905 |

Asserted (passes): `lastTradePrice` became 1.95 after one lot (`TermPaper.t.sol:179`), the stop activated (`:180`).

## E3: stop snipe through the shared fill budget (C3), original engine

Setup (`TermPaper.t.sol:213`): last trade 2.0; Bob bids 10 at 2.0; Carol sell stop trigger 2.0, limit 1.0, size 10.
Attack: 10 one-lot bids at 2.1, `triggerStopOrders(1)`, buy Carol's crossed remainder at 1.0, sell 10 to Bob at 2.0.

| Case | Carol base sold | Carol quote received | Mallory quote profit | Mallory base delta | Mallory gas |
|---|---|---|---|---|---|
| Baseline, honest trigger | 10.0 | 20.0 | 0 | 0 | 0 |
| Snipe | 10.0 | 10.000000011000000000 | 9.999999989000000000 | 0 | 4942713 (13 tx) |

## E4: dust wall on the bid side (C4), original engine

Setup (`TermPaper.t.sol:261`): best ask 10 at 1.5. Mallory places 101 one-lot bids at 1.5 minus one tick.

| Metric | Value |
|---|---|
| Attacker gas, 101 placements | 67436118 |
| Attacker quote locked (refundable) | 0.000000151499999899 |
| New bid at the grief price | reverts `BookTooDeep` (asserted, `:278-279`) |
| New bid far below (1.0) | reverts `BookTooDeep` (asserted, `:281-282`) |
| Defender gas to clear (one sell + `matchOrders(10)` calls) | 8056221 |
| Defender transactions to clear | 11 (asserted, `:298`) |

## E5: mitigated engine (M2 alone, and M1 rejection)

`test_E5_sandwich_onMitigatedEngine` (`minOrder = 0`, so only M2 is active), same setup as E1 at limit 2.0, Carol
resubmits the refunded remainder once:

| Carol base received | Carol quote paid | Overpaid vs 15.0 | Mallory quote profit | Mallory base delta | Mallory gas | Carol gas (2 tx) |
|---|---|---|---|---|---|---|
| 10.0 | 14.999999999990000000 | -0.000000000010000000 | 0.000000014990000000 | -0.000000010000000000 | 3228671 | 1393517 |

Asserted (passes): Mallory's position marked at 1.5 is not positive (`:309`).

`test_E5_dustBelowMinimumIsRejected` (`minOrder = 0.1e18`): a one-lot sell reverts with `ZeroAmount`. PASS, no logs.

## E6: gas overhead of the mitigation (M2 check)

`test_E6_gasOverheadOfMitigation` (`minOrder = 0`):

| Call | Original | Mitigated | Overhead |
|---|---|---|---|
| First resting ask | 308644 | 309250 | +606 |
| One full fill as taker (buy 4 of Bob's 10) | 414506 | 414532 | +26 |
| Resting bid, opposite side non-empty | 297492 | 298563 | +1071 |

## E7: what the mitigated engine does and does not fix

| Test | Result |
|---|---|
| `test_E7_stopSnipe_onMitigatedEngine` | Carol base sold 0.000000010000000000, quote received 0.000000021000000000; Mallory quote profit -0.000000021000000000, base delta +0.000000010000000000; Mallory gas 4254010. Book not crossed (asserted). Carol's remaining 9.99999999 base was refunded, so her stop did not execute. |
| `test_E7_stopHunt_stillWorksOnMitigatedEngine` | Carol quote received 15.0 (same as E2 depth 0). `minOrder = 0`. |

## Differences from `reference-run.txt`

All token amounts, counts and pass/fail results are **identical** to the reference run. **Every gas figure differs.**
Per-transaction gas from `_lastCallGas()` is higher in this run by a fixed amount per scenario; forge's whole-test
`(gas: N)` figures differ in both directions.

| Line | Reference | This run | Delta |
|---|---|---|---|
| E1 baseline, victim gas | 374621 | 426821 | +52200 |
| E1 attacker gas (each of 4 cases) | 3810416 | 3910616 | +100200 |
| E1 victim gas (cases 1 to 3) | 948502 | 1047302 | +98800 |
| E1 victim gas (case 4) | 948490 | 1047290 | +98800 |
| E2 attacker gas, depth 0 / 5 / 10 | 1092741 / 1167635 / 1108405 | 1158241 / 1233135 / 1173905 | +65500 each |
| E3 attacker gas | 4690913 | 4942713 | +251800 |
| E4 attacker gas, 101 placements | 67153318 | 67436118 | +282800 |
| E4 defender gas to clear | 6561421 | 8056221 | +1494800 |
| E5 attacker gas | 3200671 | 3228671 | +28000 |
| E5 victim gas | 1212317 | 1393517 | +181200 |
| E6 original: rest / fill / rest behind | 305844 / 371906 / 294692 | 308644 / 414506 / 297492 | +2800 / +42600 / +2800 |
| E6 mitigated: rest / fill / rest behind | 306450 / 371932 / 295763 | 309250 / 414532 / 298563 | +2800 / +42600 / +2800 |
| E7 snipe attacker gas | 4069610 | 4254010 | +184400 |
| Test totals `(gas: N)`: E1 baseline, E1 sweep, E2, E3, E4, E5 sandwich, E6, E7 hunt, E7 snipe | 4821983, 33280855, 17737013, 14312736, 79093165, 8962975, 9094925, 6505869, 9497814 | 2905823, 26204224, 12207725, 10770427, 78906900, 9175096, 7220194, 6632041, 9742953 | all differ |
| `test_E5_dustBelowMinimumIsRejected` total | 4272013 | 4272013 | same |

Cause: **not determined.** Observations only: the reference output compiled 1 file with no deprecation warning,
this run compiled 47 files and warned that `lastCallGas()` is deprecated, so the Foundry builds very likely differ;
the reference does not record its forge version. The E6 mitigation overhead (+606, +26, +1071) is identical in
both runs, so relative comparisons are stable even though absolute gas is not. Absolute gas figures should be cited
with the forge version.

## Per-test review (independent read of `TermPaper.t.sol`)

| Test | What it proves | Assumptions that fail or need care on a public chain |
|---|---|---|
| `test_E1_baseline_noAttack` | Without dust, a limit-2.0 buy against an ask at 1.5 pays 15.0 (maker price). | None material. |
| `test_E1_sandwich_limitSlackSweep` | On the engine, attacker profit equals victim overpay and scales linearly with the victim's limit slack, at a fixed attacker gas of 3.9M over 12 transactions. | (1) The attacker must see Carol's transaction before inclusion (public mempool) and order 10 dust txs before it and 2 txs after it. (2) No one calls `matchOrders` between Carol and the back-run: `matchOrders` would fill Carol against Bob at Bob's 1.5 (`OrderBook.sol:115`, lower `bookSeq` is maker), so the back-run must land first. (3) Profit is not net of gas; at 0.1% slack the profit is 0.015 quote against 3.9M gas, so viability depends on gas price and token value, which the test does not model. (4) One taker only; no competing searchers. |
| `test_E2_stopHunt_depthSweep` | One lot traded against oneself moves `lastTradePrice` across a trigger, and the victim's loss is set by book depth between trigger and limit. | (1) "Paper gain marked at 2.0" assumes the price returns to 2.0; it is not realised. (2) Mallory's bid at 1.5 is a public resting order that others could also fill. (3) Shortfall is measured against 2.0, so part of it (depth 10 case: 1.0) is ordinary stop slippage, not attack profit. (4) Self-trade is allowed by the engine (SPEC section 8); a venue that blocks self-trades would force a two-account wash trade, which still works. |
| `test_E3_stopSnipe_originalEngine` | The shared fill budget lets a caller spend a stop's fills on dust so the remainder rests crossed at its limit, then buy it there: profit about 10 quote on a 10-base stop. | (1) The attacker must be the one who calls `triggerStopOrders` once the stop is eligible, before any honest keeper. (2) Same back-run race as E1: an honest `matchOrders` would fill Carol at Bob's 2.0. (3) Attacker's 10 dust bids at 2.1 must not be taken by others first. |
| `test_E4_dustGrief_blocksBidSide` | 101 one-lot bids make every non-crossing bid revert `BookTooDeep`, and clearing them takes 11 transactions. | (1) Attacker gas (67.4M) exceeds the defender's clearing gas (8.1M), so in gas terms the attack costs more than the cure; the test does not show it is cheap in money. (2) 67.4M gas cannot fit in one Ethereum block; it is 101 separate transactions over several blocks. (3) Crossing bids still work (not tested here). (4) The defender is a seller who also gets the dust's quote, so clearing is not a pure cost. |
| `test_E5_sandwich_onMitigatedEngine` | With M2, the issue 007 sandwich no longer profits; the victim pays at most 15.0 after one resubmission. | (1) The resubmission is not attacked again. On a public chain the attacker can repeat the 10-lot front-run each time for gas only, so M2 turns the theft into a delay or denial of execution. (2) M1 is off (`minOrder = 0`). |
| `test_E5_dustBelowMinimumIsRejected` | With M1 at 0.1, a one-lot order is rejected. | Shows only that the check fires; it does not show that 0.1 is enough to make E1 to E4 unprofitable. Error reused is `ZeroAmount`. Stop placement path (`OrderBookMitigated.sol:98`) not tested. |
| `test_E6_gasOverheadOfMitigation` | The M2 check costs at most about 1.1k gas on these three calls. | Measures one book shape only (one order on the opposite side). |
| `test_E7_stopSnipe_onMitigatedEngine` | With M2, the snipe makes no money and the book is not left crossed. | The victim's stop is cancelled and refunded, so she keeps 9.99999999 base with no protection while the price falls. M2 converts the snipe into a cheap way to cancel someone's stop-loss. |
| `test_E7_stopHunt_stillWorksOnMitigatedEngine` | M2 does not stop the stop hunt. | The assertion message says "M1 and M2 do not fix" it, but the test runs with `minOrder = 0`, so **M1 is not exercised**. The claim about M1 is not shown by this test (an M1 floor only raises the self-trade size, which nets to zero for a self-trade, but that is reasoning, not a test result). |

# Gap experiments E8 to E10 (Part A of the writing plan)

Source of every number below: `experiments-gaps.txt` (this folder), produced on 2026-11-19 by
`forge test --match-path "test/termpaper/*" --isolate -vv` from `contracts/`, forge 1.8.6, repo commit 2bf8816.
Test file: `contracts/test/termpaper/TermPaperGaps.t.sol` (new; helpers copied from `TermPaper.t.sol` so that file
stays identical to the inbox copy).

Run status: 16 term-paper tests passed (6 new, 10 original). Full suite: `351 tests passed, 0 failed, 0 skipped` (345 before plus 6 new). The E1 to E7 log lines in this rerun are identical to
`experiments.txt` (checked by diff of every log line). The forge deprecation warning (`lastCallGas(): replaced by
lastFrameGas`) is printed before the results and is not in the saved file.

## E8: stop hunt with a real minimum order (M1 exercised), `test_E8_stopHunt_withMinOrder`
Mitigated engine, `minOrder = 0.1e18`, M2 active. Same scenario as E2 depth 0, self-trade of 0.1 base at 1.95.

| Metric | Value |
|---|---|
| Reference price moved to 1.95 | yes |
| Stops activated | 1 |
| Victim base sold / quote received | 10.0 / 15.0 |
| Victim shortfall vs 2.0 | 5.0 (same as E2 depth 0) |
| Attacker base bought / paper gain at 2.0 | 10.0 / 5.0 |
| Attacker gas, 4 tx | 1160501 |

Proves: M1 at 0.1 base does not stop the stop hunt; the self-trade nets to zero, so the minimum only changes the
capital briefly posted (0.1 base and 0.195 quote).

## E9: does an honest keeper defeat the attacks?
| Test | Crossed before keeper | Crossed after | Victim result | Attacker net | Gas |
|---|---|---|---|---|---|
| `test_E9_keeperClearsBeforeBackrun_sandwich` (E1 at limit 2.0) | yes | no | received 10.0, paid 14.99999999999 (overpaid -1e-11) | quote +1.499e-8, base -1e-8; -1e-11 marked at 1.5 | attacker 3222611 (10 tx); keeper 153587 (1 tx) |
| `test_E9_keeperClearsBeforeBackrun_snipe` (E3) | yes | no | sold 10.0, received 20.000000001 | quote -2.1e-8, base +1e-8; -1e-9 marked at 2.0 | attacker 4254708 (11 tx); keeper 145023 (1 tx) |
| `test_E9_atomicSnipe_noOrderingNeeded` (E3 via one contract call) | n/a | no | sold 10.0, received 10.000000011 | quote profit 9.999999989, base 0 | attacker 3588665 (1 tx) |

Proves:
- C1 sandwich needs the back-run to land before any `matchOrders` call. One keeper call (153587 gas, about 4.8%
  of the attacker's dust cost) removes the profit, because the earlier `bookSeq` is maker (`OrderBook.sol:115`).
- C3 snipe does NOT need ordering control around a victim transaction. Dust, trigger and back-run fit in one
  transaction, so no keeper can step in. The only race is to call `triggerStopOrders` before an honest keeper does,
  and the attack with a contract costs less gas (3588665) than the 13-tx version (4942713).
- Fails on a public chain: keeper timing is assumed, not measured; a builder could still order the keeper after
  the back-run.

## E10: M2 under a repeated attack
Attacker front-runs every resubmission with 10 dust asks at 1.499; victim resubmits the refunded remainder with
limit 2.0.

| Config | Rounds run | Victim base received | Victim quote paid | Victim gas (cumulative) | Attacker gas (cumulative) | Attacker net marked at 1.5 | Rounds to fill 10 base |
|---|---|---|---|---|---|---|---|
| `test_E10_..._M2only` (minOrder 0, dust 1 lot) | 5 (cap) | 0.00000005 | 0.00000007495 | 4919053 | 16074955 | -5e-11 | 1,000,000,000 |
| `test_E10_..._M1andM2` (minOrder 0.1, dust 0.1) | 10 (filled) | 10.0 | 14.99 | 9771458 | 32136410 | -0.010 | 10 |

Per round: victim about 0.97M gas (first round 1029321), attacker about 3.21M gas.

Proves:
- M2 alone turns theft into an indefinite delay: with one-lot dust the victim gains 1e-8 base per round and would
  need 1e9 rounds.
- M1 plus M2 bounds the delay: each round forces at least 1 base of real fills (10 x minOrder), so 10 rounds here;
  the attacker loses 0.001 quote per round plus about 3.3x the victim's gas.
- Never overpays in either config (asserted). Assumes the attacker sees every resubmission in time.

## E11: break-even gas price
See `COST_MODEL.md`.
