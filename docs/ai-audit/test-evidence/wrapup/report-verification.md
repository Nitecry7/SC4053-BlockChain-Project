# Report verification (wrap-up)

This file checks [`docs/report/AI_AUDIT_REPORT.md`](../../../report/AI_AUDIT_REPORT.md), its figures and the related documents against the repository.

The plan has seven phases:

| Phase | What it checks |
|---|---|
| 0 | The baseline |
| 1 | The numbers, re-derived from the code |
| 2 | The report, mechanically |
| 3 | Attributions |
| 4 | Diagrams against the code |
| 5 | Consistency across documents |
| 6 | End-to-end behaviour |
| 7 | Brief compliance and sign-off |

Phases 0 to 2 are done. The raw output is in [`verification/`](verification/).

## Phase 0: baseline
- **Commit:** `main` at `e868f2a` (8 Nov), pulled before starting.
- **Working tree:** clean.
- **Running processes:** no other `forge`, `anvil` or `slither` process was running.
- **Tools:** Foundry 1.8.6 and Slither 0.11.6.

## Phase 1: numbers re-derived from the code
**How it ran:** the Phase 8 commands were re-run in sequence ([`phase1-rerun.sh`](verification/phase1-rerun.sh); Slither runs `forge clean`), from 2026-11-07 20:04Z to 20:16Z UTC (8 Nov, local time).

| Claim in the report | Fresh result | Match |
|---|---|---|
| 335 Foundry tests: 245 engine, 90 Person 2 | **335 passed**, 0 failed, 27 suites, 603 s ([test](verification/phase1-test.txt)). By suite: 245 engine and 90 Person 2 (`TokenOrderBookIntegration.t.sol` is Person 2's, added in `0c4a383`) | Yes |
| 20 fuzz tests | 20 `testFuzz_*` passed | Yes |
| `OrderBook.sol` coverage 100%: lines 182/182, statements, branches 59/59, functions | 182/182, 246/246, 59/59, 25/25 ([coverage](verification/phase1-coverage.txt)) | Yes |
| Maximum gas per call (unit suites): `placeLimitOrder` 1,808,075; `matchOrders` 781,693; `triggerStopOrders` 1,998,747; `cancelOrder` 215,166 | The same four figures ([gas](verification/phase1-gas.txt), `OrderBookHarness` rows) | Yes |
| Sizes: OrderBook 8,461 B runtime (9,124 B initcode); MarketFactory 10,508 B | 8,461 / 9,124 B; 10,508 B ([sizes](verification/phase1-sizes.txt)) | Yes |
| Slither 0.11.6: 27 results | "27 result(s) found" ([slither](verification/phase1-slither.txt)). The process exited with code 127 after printing the complete result | Yes |
| `forge lint`: 6 warnings | 6: 4 `reentrancy-events`, 1 `require-revert-in-loop`, 1 `unsafe-typecast` ([lint](verification/phase1-lint.txt)) | Yes |
| Deep run: 128,000 calls, 0 reverts, 7,088 s | Not re-run (about 2 h). The committed [`phase7/forge-test-deep.txt`](../phase7/forge-test-deep.txt) is the source | Source unchanged |

**Coverage test count:** this run had 333 tests; `phase8/coverage-summary.txt` had 332. The difference is the issue 007 test, added after the Phase 8 coverage run. `6-validation-engine.md` ("All 332 tests") describes that run, so it is accurate as written.

## Phase 2: mechanical check of the report
**Checker:** [`phase2-check.py`](verification/phase2-check.py), run from the repo root.

| Check | Result |
|---|---|
| Relative links and `#anchors` in the report and `docs/report/README.md` | 143 checked, **0 broken** |
| Commit hashes in the report | 12, **all exist**. Every date stated next to a hash matches `git log` ([list](verification/phase2-hashes-and-severities.txt)) |
| Hashes in `docs/report/README.md` and the Figure 2 source | 13 and 14, all exist, dates match |
| `engine-final` tag | Points to `fd8869a`, as stated |
| Issue IDs | 22 referenced (001 to 007, P2-001 to P2-015), **all have a file**. No issue file is missing from the report |
| Severity in the 5.1 inventory against each issue file's own severity line | **All 22 match** (P2-009 and P2-010 are mixed per finding in their files and grouped in the report; consistent) |
| Figure anchors and image order | Figures 1 to 10 appear in order; each anchor precedes its own `NN-*.png` |
| Teammate markers | **39** ([checklist with line numbers](verification/phase2-markers.txt)): 37 "[P2 to confirm]" (one is "[P2 to confirm and expand]"), 1 "[P2 to add]", and 1 "[P1 + P2 to confirm]" |

**Error found and fixed: Figure 2's Person 2 bar.**
- **What was wrong:** it ended on 6 Nov.
- **What git shows:** Person 2's non-merge commits run 5 to 7 Nov. The last is `dd60588` (P2-8A.2 liveness), at 02:46 on 7 Nov.
- **The fix:** the bar now spans 5 to 7 Nov, and the caption says the dates come from those commits. The figure was re-rendered and inspected.

## Leads for later phases (found during Phases 1 and 2)
- **Gas wording (Phase 3 or 5).** The gas report's maximum `placeLimitOrder` is 1,808,075. That is higher than `test_gas_worstCasePlacement` (1,778,221, SPEC O2), yet `7-improvements-engine.md` calls 1.78M "the worst measured placement". Find the test that reaches 1.81M, then reword "worst" wherever it overclaims.
- **Brief file names: settled, no action.** `docs/project.pdf` and `docs/Development_Project.pdf` are byte-identical (SHA-256 `1789420ce80fe100…`). `project.pdf` is an untracked local copy. `CLAUDE.md` still names `project.pdf`; that is already open in `SUBMISSION_CHECKLIST.md`, because `CLAUDE.md` is a shared file.
- **"334 / 244" mentions: settled, no action.** They appear in `6-validation-engine.md`, `VIDEO_PLAN.md` and `ENGINE_SECURITY_SUMMARY.md`. Each is labelled as the Phase 7 figure, next to 335 for `engine-final`.
- **Key figures are consistent across documents.** Coverage, sizes, Slither, lint, the deep run and test counts agree across the report, the section drafts, README, SPEC, `ENGINE_SECURITY_SUMMARY.md`, `ENGINE_HANDOFF.md`, `VIDEO_PLAN.md` and `SUBMISSION_CHECKLIST.md`.
