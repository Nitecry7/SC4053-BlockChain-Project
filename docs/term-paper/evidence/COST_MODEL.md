# E11: break-even gas price for each attack (closes C1b, C3b, C4b "profit after gas")

Inputs are measured numbers only: attacker profit and attacker gas from `experiments.txt` (E1 to E4) and
`experiments-gaps.txt` (E8, E9). Forge 1.8.6. No ETH price and no gas price is assumed here.

## Formula
- Attack is profitable when `profit_quote * Q > gas * gasPrice_gwei * 1e-9 * ETH_usd`, with `Q` = USD per quote token.
- Break-even gas price (gwei) = `K * Q / ETH_usd`, where `K = profit_quote * 1e9 / gas` (table below).
- Example of use (writer supplies the prices and cites them): if `Q = 1` and ETH is `X` USD, the attack pays while
  the gas price is below `K / X` gwei.

## Table
| Scenario | Attacker profit (quote) | Attacker gas | K = profit x 1e9 / gas | Source |
|---|---|---|---|---|
| E1 sandwich, 0.1% slack (12 tx) | 0.014999999975 | 3910616 | 3.84 | `test_E1_sandwich_limitSlackSweep` |
| E1 sandwich, 1% slack | 0.14999999984 | 3910616 | 38.36 | same |
| E1 sandwich, 5% slack | 0.74999999924 | 3910616 | 191.79 | same |
| E1 sandwich, 33% slack (issue 007) | 4.99999999499 | 3910616 | 1278.57 | same |
| E2 stop hunt, depth 0 (paper gain at 2.0, 4 tx) | 5.0 | 1158241 | 4316.89 | `test_E2_stopHunt_depthSweep` |
| E2 stop hunt, depth 5 (paper gain) | 2.5 | 1233135 | 2027.35 | same |
| E2 stop hunt, depth 10 | 0 | 1173905 | 0 (never pays) | same |
| E3 stop snipe (13 tx) | 9.999999989 | 4942713 | 2023.18 | `test_E3_stopSnipe_originalEngine` |
| E8 stop hunt with minOrder 0.1 (paper gain) | 5.0 | 1160501 | 4308.48 | `test_E8_stopHunt_withMinOrder` |
| E9 atomic snipe (1 tx) | 9.999999989 | 3588665 | 2786.55 | `test_E9_atomicSnipe_noOrderingNeeded` |

## Griefing (no profit, cost only)
| Scenario | Attacker gas | Defender or victim gas | Ratio | Source |
|---|---|---|---|---|
| E4 dust wall, 101 bids vs clearing (11 tx) | 67436118 | 8056221 | attacker pays 8.4x | `test_E4_dustGrief_blocksBidSide` |
| E10 repeated front-run under M2, per round | about 3.21M (10 dust asks) | about 0.97M (1 resubmission) | attacker pays about 3.3x | `test_E10_*`, round deltas |

## Reading notes (facts, not prose)
- Gas per attack is roughly fixed by the number of transactions, while profit scales with the victim's order size and
  limit slack (E1 closed form, `TermPaper.t.sol:146`). So K scales linearly with victim size: a 10x larger victim
  order at the same slack gives about 10x K.
- E2 and E8 "profit" is a paper gain marked at the last honest price 2.0; the attacker still holds base.
- Gas is `_lastCallGas()` per call in a Foundry test. It is not an on-chain receipt and does not include the 21000
  intrinsic transaction cost per tx unless forge counts it; not verified. Treat K as an order of magnitude.
- All numbers are on a local chain; L2 fee structure (L1 data cost) is not modelled.
