# Open questions (Phase 5)

Claims with weak or no evidence, and what would close each one. Row IDs refer to `EVIDENCE_MAP.md`.

## No evidence
| Claim | Map row | Why it is open | What would close it |
|---|---|---|---|
| A trigger-to-limit band (M7) reduces stop-hunt loss | M7 | No source, no experiment | Add M7 to `OrderBookMitigated.sol` (reject or cap activation when limit is more than X% from trigger) and rerun E2; report victim shortfall at depth 0 / 5 / 10 |
| Clearing crossings before taking (M3) stops C1/C3 | M3 | Not implemented; only analogous sources ([01] F3, [21] F7) | Implement M3 in the research copy (call the `matchOrders` loop before `_matchTaker`), rerun E1 and E3 |
| Batch auctions measurably reduce MEV in production | M5d | Phase 4 gap d: none found; [30] measures price improvement, [27] simulates spread | A peer-reviewed measurement of sandwich/MEV exposure on CoW Protocol or Penumbra; otherwise state the gap |
| Stop-loss hunting via reference-price manipulation is documented in crypto | C2, M6 | Phase 4 gap b: no credible source; [13] is FX lore only; MITRE AADAPT page unreadable (JS shell) | Open the MITRE AADAPT page in a browser; library search (NTU) for stop hunting in crypto futures; otherwise rely on E2 and say the literature gap |
| TWAP manipulation cost (M6 design input) | C2h | [14] not read: ePrint 403 | Download ePrint 2022/445 manually in a browser, or via IEEE Xplore with NTU access, then write the note |
| Cryptographic front-running defence survey (M4, M11) | (none) | [17] not read: ePrint 403, Springer paywall | Manual ePrint download or NTU library access to the FC 2022 workshops chapter |
| Look-alike token symbols mislead users (C5) | C5e | No source; no UI test | Find an incident report or paper on token impersonation on DEXs; or cite only `TokenFactory.sol:25` and say it is a design inference |
| Front-running measured on a smart-contract limit order book | C1d | Phase 4 gap a | No fix available from literature; our E1 and E3 are the evidence. Say so |

## Weak evidence
| Claim | Map row | Weakness | What would close it |
|---|---|---|---|
| What minimum size is enough | M1a | Only shows a one-lot order is rejected | Sweep `minOrder` and recompute E1 attacker profit and gas, with gas priced at a stated gwei and token value |
| Push-payout DoS by a hostile token | C5b | No test; reasoning plus SPEC | Add a mock token with a blocklist and show a taker reverts when crossing that maker |
| Keepers will not clear crossings in time | C6b | Argued in [07], [09]; no timing data | No measurement possible on a local chain; state as design risk |
| Public stops and limits make attacks targetable | S6 | Inference from public views; [13] argues the opposite setting (private stops) | Accept as design reasoning; cite `IOrderBook.sol:49, 52` |
| Hardened reference price (TWAP, minimum trade size) | M6 | Only indirect sources ([09] F10, [06] F4, [07] F5); [14] unread | Implement a minimum size for trades that move `lastTradePrice` in the research copy and rerun E2 |
| L2 spam and MEV numbers | S4, M11e | [24] and [31] are grey; [24] "under a tenth of fees" holds only for OP Mainnet | Cite [23] (peer-reviewed) as the main L2 source; quote [24] per chain |
| Price-level book makes gas constant | M8b | [33] estimates only | Prototype a price-level book or cite [09] measurements only |
| Frontend guards help | M12 | Advice, no user study | E1 slack sweep is the only evidence that tighter limits cut loss |

## Closed by the gap experiments (2026-11-19)
| Former open claim | Closed by | Result |
|---|---|---|
| M1 does not fix the stop hunt | `test_E8_stopHunt_withMinOrder` | Confirmed with minOrder 0.1: stop fires, victim receives 15.0 |
| M2 turns theft into delay, which the attacker can repeat | `test_E10_mitigatedSandwich_repeated_*` | M2 alone: 1e-8 base per round (1e9 rounds); M1 plus M2: 10 rounds, attacker loses 0.010 quote |
| C1 to C3 are profitable after gas | `evidence/COST_MODEL.md` | Break-even constant K per scenario; writer must state gas and token prices with a source to turn K into a yes or no |
| The attacks need ordering control on a public chain | `test_E9_*` | C1: yes, one keeper `matchOrders` defeats it. C3: no, the atomic 1-tx version works |
| Dust wall is "cheap" | `evidence/COST_MODEL.md` | Capital-cheap, gas-expensive: attacker 8.4x defender gas |

Still open after the gap experiments:
- What minimum size is enough (M1a): only 0.1 tested. A sweep remains open.
- Keeper timing on a real chain (C6b): not measurable locally.

## Citation and reproduction issues
| Issue | Effect | What would close it |
|---|---|---|
| DBLP blocked (bot challenge, HTTP 429) for every source | No entry is DBLP-verified; some page ranges come from search snippets (see `references.bib` UNVERIFIED FIELDS) | Check DBLP in a browser for 01, 02, 04, 05, 06, 07, 09, 17, 19, 22, 27 |
| [07] venue AFT 2022 not verified | Cite as arXiv only until checked | ACM DL in a browser |
| [11] read as 2013 draft; QJE version not opened (OUP 403) | Page pointers are draft pages | NTU library copy of QJE 130(4) |
| [22] copy is probably the preprint, not the LNCS chapter | Page pointers are preprint pages | Springer chapter via NTU |
| All gas figures differ from `reference-run.txt` (token amounts identical) | Absolute gas must be cited with forge version 1.8.6; relative E6 overhead is stable | Record the forge version used for the reference run and rerun on the same version |
| Some agents found internal inconsistencies in sources ([03] per-type counts sum to 199,724 vs 199,725; [06] 78 papers and 186 incidents in breakdowns vs 77 and 181; [27] abstract 21% to 37% vs body; [29] 2.8 s vs 2.8 ms) | Quote the headline number with its page, not derived sums | Recheck in the PDFs before quoting |
