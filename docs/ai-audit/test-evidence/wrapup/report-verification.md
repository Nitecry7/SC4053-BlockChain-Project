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

All seven phases have run (8 Nov); the items still open for the team are at the end of Phase 7. The raw output is in [`verification/`](verification/).

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
- **Gas wording: resolved in Phase 5, below.** The gas report's maximum `placeLimitOrder` (1,808,075) looked higher than `test_gas_worstCasePlacement` (1,778,221, SPEC O2).
- **Brief file names: settled, no action.** `docs/project.pdf` and `docs/Development_Project.pdf` are byte-identical (SHA-256 `1789420ce80fe100…`). `project.pdf` is an untracked local copy. `CLAUDE.md` still names `project.pdf`; that is already open in `SUBMISSION_CHECKLIST.md`, because `CLAUDE.md` is a shared file.
- **"334 / 244" mentions: settled, no action.** They appear in `6-validation-engine.md`, `VIDEO_PLAN.md` and `ENGINE_SECURITY_SUMMARY.md`. Each is labelled as the Phase 7 figure, next to 335 for `engine-final`.
- **Key figures are consistent across documents.** Coverage, sizes, Slither, lint, the deep run and test counts agree across the report, the section drafts, README, SPEC, `ENGINE_SECURITY_SUMMARY.md`, `ENGINE_HANDOFF.md`, `VIDEO_PLAN.md` and `SUBMISSION_CHECKLIST.md`.

## Phase 3: attributions and narrative claims
**Method:** a fresh, read-only subagent was given the report and the repository, but none of the verifier's conclusions. It checked about 190 claims against the prompt logs, issue files, evidence, SPEC and git, and returned 25 problems. The main session re-checked each one against the cited source before changing anything. All 25 were confirmed (or confirmed as imprecise) and corrected in the report.

**Engine claims corrected:**

| Report claim | What the record says | Source |
|---|---|---|
| A reviewer for every phase 1 to 7 | Reviews start at Phase 3a | `ENGINE_PHASES.md:9`; no review in the Phase 1 to 2b log entries |
| Phase 0 AI proposed "pull last" | Phase 0 SPEC pulls before matching; "pull last" came from the Phase 2b prompt; the human kept SPEC | `git show cd35f8b:SPEC.md`; log Phase 2b |
| Issue 006: "four options" | Three recorded: auto-cancel, document only, a third list | `issues/006`, Fix section |
| Phase 3a: quoted "fix with a regression test and show…" | No such prompt text. The real prompt: "Log real findings with /log-issue, fix them with regression tests". F2 and F3 were kept, F5 and F6 documented | `ENGINE_PHASES.md` Phase 3a; log, Phase 3a findings table |
| "Replaced two of its fixes" | One gap fix, (b), plus a separate trigger-budget proposal | Log, Phase 0 |
| Verbatim prompts "for each phase" | Only Phases 1 to 4 are in `ENGINE_PHASES.md` | File headings |
| 7 Nov "read-only" recovery | It made a WIP commit and merged | Log, 7 Nov |
| "Neither AI edited the other's files"; "the owner's approval" for `abis.ts` | Person 1's sessions also edited README's engine section and added `contracts/script/demo-journey.sh`. Only Person 1 authorised `abis.ts` | `9c67419`, `5ca1b4a`, `e375ff6`; log |
| Issue 004 "bugs passed the suite", listed as real bugs | Injected mutants; the code itself was correct | `issues/004` |
| 001 and 005 both "guards left as comments" | Only 001; 005 was a missed edge case | `issues/001`, `issues/005` |
| Reviewer "told to look for DoS and economic attacks" | Not in `review-engine.md` or the log | `.claude/commands/review-engine.md` |
| The agent "surfaced every fork" | The reviewers and the auditor did | Log, Phases 3a, 6 and 8 |
| Mutation: "every non-equivalent mutant caught" | Six rewritten mutants had never been re-run, and the planned full Phase 8 run was not recorded. **Closed by running the full set (Phase 5 below)** | `MUTANTS.md` |

**Smaller engine fixes:**
- `forge lint` was triaged in the wrap-up, not in Phase 8.
- The 001 "before" output was one `0 != 1` plus two missing reverts.
- Lot and tick sizes: the rounding rules stay as a safety net.
- P7c to P7e test the ledger; P7f to P7h test the matching and auto-cancel checks.
- The resume read `CLAUDE.md` and SPEC; the log was read only on 1 Nov.
- The escrow-conflict sentence now cites `CLAUDE.md`'s source-of-truth rule.

**Person 2 text (still marked [P2 to confirm]):**
- The "no reviewer" list now includes P2-8A, P2-8A.1 and P2-8A.2.
- `MarketFactory` was proposed in Prompt 00, rev 3, and built in P2-2.
- The deployer design changed after a Context7 check. The bytecode tie came from a Low-Medium review finding, not from P2-013 or P2-014.
- P2-3 logged five lower findings, not two.
- The liveness gap (R9) was found in P2-8A.1.

**Chat-assistant statements:**
- The owner's-account note now lists every section that mentions the chat.
- The 3.1 claim that the prompts were drafted in the chat now also gives what the log records: Claude Code drafted the Phase 1 update, 3b and 4 prompts and wrote the file, and the Phase 3a prompt is the human's.
- The 8.3 claim that the chat drafted Sections 1 and 8 is marked as the owner's account. This log recorded that text as human-written.

**Copies of the errors elsewhere:**
- **The section drafts** (`docs/report/2-…` to `8-…`) repeat several of these errors. `docs/report/README.md` now marks them as superseded by the assembled report.
- **`VIDEO_PLAN.md`** said "each phase was reviewed". It now says this applies from Phase 3a.

## Phase 4: diagrams against the code
- **Figures 4, 6 and 7, against `OrderBook.sol`:**
  - **Figure 4:** every transition is a status assignment in the code, and none is missing.
  - **Figure 6:** the orderings match `_ranksAhead`, and `getBook` walks only the book lists.
  - **Figure 7:** the check order (`maxCount`, then `hasTradePrice`, then buy side first), the constants 10 and 100, and "auto-cancel still counts as triggered" all match.
- **Figure 3:** `MarketFactory`, `TokenFactory` and `DemoToken` state no owner, admin or pause, and the code has none.
- **Figure 5 numbers, proven by execution:**
  - **What was checked:** a temporary test (deleted, never committed) asserted 22, 13.2 and 0.8, both events, the statuses, the best bid and ask, and every balance change. It passed ([output](verification/phase4-figure5-check.txt)).
  - **One false start:** the first version failed on its own balance assumption (the base test's `setUp` already funds Bob), not on the figure. The second version used balance deltas.
- **Figure 8:** matches `test_batch_multiPartySettlesFourBuyersAndFourSellersInOneCall` (re-read).
- **Figure 10, two inaccuracies fixed:**
  - "Per-phase reviews: 7 issues" is now "found 002 to 006 (5 of the 7)". 001 was flagged by the AI itself and decided by the human; 007 came from the final audit.
  - The fuzz box now shows the one slow test's 25 and 200 runs.
  - After Phase 5, its mutation box shows the full-set result.
- **Figure 9:** the 004 label now says "three injected bugs would pass the tests".

**A4 legibility.** The text size of each figure was computed when scaled to a 16 cm × 24 cm text block:

| Figures | Before | After |
|---|---|---|
| 5, 6, 8, 10 | about 5 to 6 pt | at least 7.3 pt |
| 7 | about 7 pt | 7.3 pt |
| 9 | about 6.6 pt | 10 pt |

- **How:** narrower layouts, line breaks, shorter labels, and 2×2 or single-column grids. No fact changed.
- **Checks:** every changed figure was re-rendered and inspected.
- **Final sizes:**

| Figure | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Text size (pt) | 8.5 | 9.3 | 8.3 | 10.1 | 7.6 | 7.6 | 7.3 | 9.7 | 10.2 | 11.0 |

## Phase 5: consistency across documents
**Full mutation set: closes the Phase 3 mutation finding.**
- **Run:** `bash docs/ai-audit/test-evidence/mutants.sh` (all 67) on `14c8d89`. The engine source and tests are identical to `engine-final` (`git diff --quiet`).
- **Result:** **65 caught, 2 survived**, both documented equivalents (R4, P5q), with 0 compile errors and 0 not applied. It took 2,105 s ([output](verification/mutants-full-set.txt)).
- **Rewritten mutants:** C1, C2, R3, P6n, N2, N3 and C6 are all caught.
- **Restore:** `OrderBook.sol` was restored, and `git diff contracts/src` was empty afterwards.
- **Recorded in:** a new row in `MUTANTS.md`, the report (executive summary and 6.1) and Figure 10.

**Gas lead: resolved.**
- **Which test:** the 1,808,075 placement *is* `test_gas_worstCasePlacement`. Per-test gas reports over `OrderBook.Match.t.sol` show it.
- **Why the figures differ:** SPEC O2's 1,778,221 was measured with `--isolate` at Phase 3b. The same command on today's code also gives 1,808,075, so later phases added work to placement.
- **Fixes:**
  - SPEC O2 now shows both figures.
  - The report's 8.2 says the reviewer's worst-case test measured 1.78M at the time and 1.81M on the final code.
  - `7-improvements-engine.md` (a superseded draft) is left as written.

## Phase 6: end to end
- **`contracts/script/demo-journey.sh`:** run on a fresh scratch Anvil on port 8546, which was confirmed free before and after. Result: "DEMO COMPLETE: every check passed". It covers limit orders, partial fill, cancel, a multi-party batch and a triggered stop-limit order, with the keeper and the market both at 0 at the end ([output](verification/phase6-demo-journey.txt)). The script stopped its Anvil, and `contracts/` was unchanged.
- **`npm test` in `web/`, read-only:** **410 passed, 48 skipped** (36 files), the same as the report ([output](verification/phase6-npm-test.txt)). `web/` was unchanged.
- **Not verified here (Person 2):** manual MetaMask cases and the bonus UI.

## Phase 7: brief compliance
- **Sections (brief 2.1):** all eight required sections are present in order and titled as in the brief, and each covers the brief's sub-bullets. Examples: AI in the division of labour and decision-making (2.1, 2.4); context windows (3.3); the AI's initial interface and state proposals (4.2, 4.3).
- **Issue format (brief 2.2):** all 22 issues are in the four-part format (5.2 in full for the engine, 5.3 as a table for Person 2).
- **Peer evaluation** (brief 7) is mandatory and not in the repository. It is already on `SUBMISSION_CHECKLIST.md`.
- **The demo video** is on the checklist, but the brief's text does not mention it. Confirm the requirement on NTULearn.
- **Open before tagging `report-final`:**
  - Person 2 to confirm or edit the **40** markers ([list](verification/phase2-markers.txt))
  - the [P1 + P2 to confirm] team evaluation in Section 8
  - the plan file's "built with Claude Code" title, which conflicts with the chat-assistant account

**Phase 2 re-run after every edit:** 0 broken links, anchors, hashes or IDs.
