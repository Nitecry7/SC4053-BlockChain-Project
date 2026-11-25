# Verification report (stage 4, 2026-11-25)

## Method and independence
- Stage 4 was run in the SAME Claude Code session that drafted stages 1 to 3 (the human asked for it here). To keep
  the checks independent, each audit was done by a fresh subagent that had not seen the drafting and received only
  the paper source and the files it needed. The drafting session only collected findings, applied fixes and
  recompiled. Audit B was split into B1 (Sections I, II, V, abstract, appendix) and B2 (III, IV, tables, figure).
- Human addition to audit B: every II-B sentence citing [09], [18] or [20] was checked against the PDF page itself.
- Fixes were applied to the `.tex`, then audits A, B and D were re-run by three more fresh subagents on the diff,
  and audit E's 8-word overlap script was re-run on the revised text (see "Re-audit" at the end).
- Line numbers below refer to the files BEFORE the fixes (as the auditors saw them).

## A. Numbers (101 numbers checked against the raw forge logs and the PDFs)
| Result | Count | Items |
|---|---|---|
| MATCH | 98 | Every experiment number in the text, Table I, Fig. 1 and the abstract matches `experiments.txt`, `experiments-gaps.txt` and `rerun-2026-11-25.txt` exactly before rounding; derived ratios correct (8.371, 3.29, 0.4999, 0.333, 4.99x, 1e9) |
| MISMATCH | 3 | II: Beres "three behavioural features" (really two graph embeddings); II: Lissy "2021 gas limit" (really July 2020); IV: "local to two functions" (really three) |
| Misleading rounding / framing | 6 | E9 keeper attacker loss shown as 0; E4 defender tx count under Loss/Gain; "Mallory loses 0.010" without "marked at 1.5"; K given to two decimals; "half vs a third" setup-dependent; "at least a block" vs "one-block" delay |
| Evidence gap | 1 | 351-test full-suite pass on 2026-11-25 had no saved raw output (now `evidence/fullsuite-2026-11-25.txt`) |

## B. Citations
| Audit | Supported | Partly | Not supported | Notes |
|---|---|---|---|---|
| B1 (I, II, V, abstract, appendix): 26 claims | 12 | 12 | 2 | Not supported: Beres attribution; Eskandari "predates working on-chain books". Uncited claims at II l.35 and l.47 |
| B2 (III, IV, tables, figure): 31 claims | 16 | 15 | 0 | Misattributed: Choudhuri (2,818.6 ms is their own scheme; the flaw is in Shutter) |

Human-requested PDF checks (II-B, sources 09, 18, 20):
| Claim | PDF finding | Verdict | Fixed to |
|---|---|---|---|
| Seven comparison criteria | [18] p. 5: "we introduce seven measures": decentralization, security, scope, jostling, goodput, delay, cost | supported | kept; "seven families" changed to "seven categories (their Secs. 5.1 to 5.7)", the count is ours |
| Jostling definition | [18] p. 5: "competition between traders for block inclusion (at a preferential position)" | supported after the stage 3 fix | kept, with goodput defined |
| Reshuffling changes nothing except price ties | [09] p. 8 to 11: true only for BASIC insertion and displacement; suppression partly mitigated (p. 9), hybrid price-improvement attack defused only by paying the miner (p. 9 to 10), ties (p. 11) | overstated | all exceptions now listed |
| Lissy drops cancellation | [09] p. 11: two reasons, displacement of cancels until after the close, and a heavier data structure | partly (one reason given) | both reasons given |
| Closing one market takes a whole block | [09] p. 6: "monopolizing an entire Ethereum block just to close the market", worst case (every order marketable), July 2020 limit; sentence had no cite | partly, uncited | worst case stated, cited |
| Commit and reveal two-transaction cost | [18] p. 10 to 11: low cost score, significant on-chain space, two transactions; delay of a few block times; attacker may not reveal | supported | kept; marked as their qualitative scoring for AMM DEXs |
| Canidio "only when the attacker cannot guess" | [20] p. 16 Prop. 2: "guessing is hard for B"; p. 27 to 28 excludes contracts with competing claims | overstated | "only when guessing the hidden order is hard (their Prop. 2)" plus the exclusion |

Corrected summaries from the checklist: [04] used correctly; [06] had drifted from "oracle" to "price" manipulation (fixed); [12] EtherDelta-specific but "match off-chain" wrong (fixed to "keep their books off-chain"); [23] consistent. AMM labelling: all present except Table II M12 cell (fixed) and Babel's AMM price source (fixed).

## C. Code (48 references and claims, tests re-run by the auditor: 16/16 and 351/351 passed)
| Result | Count | Items |
|---|---|---|
| OK | 37 | Constants, functions, errors, line ranges, worked example and Fig. 1 step order, appendix test names, M1/M2 code description |
| WRONG | 2 | IV l.5 corrupted `\ref` (literal carriage return); IV l.6 duplicate sentence |
| IMPRECISE | 9 | C3 cause ("shared budget, so..." but E3 has one stop; the cap is the cause); E2 setup omits Mallory's resting bid; issue 006 needed an unplaceable stop at the stop-list head, not dust alone; M7 functions; M9 "paid from fees" (no fees exist); Table I E8 also runs M2; Table II M1 vs C3 untested; "every loop" (getBook view loop is caller-bounded); stop triggers readable via `getOrder` only; pointer ranges OB:251-268 and TermPaper.t.sol:97 |

## D. Overclaims (46 rows)
| Severity | Count | Main items |
|---|---|---|
| must-fix | 6 | Abstract C1 without ordering assumption ("up to 5.0"); Table II M1 targets C1, C3 with E5, E8 as evidence; Table II M2 shown as strong fix with no "partial"; Table II M4/11 targets C1 to C3 vs text "none fixes the one-tx snipe"; conclusion snipe profit not "before gas"; corrupted `\ref` |
| should-fix | ~25 | Missing hedges and setting qualifiers (Daian PoW reward analogy, Budish "in their model", "is cheap" gas, "any size", allowlist vs pull payments, "local to two functions", conclusion omits research copy and E10 assumption, II "rollup cuts gas sharply" without testnet, S6 unhedged, "closest published system", Babel "directly", gas not local in body) |
| ok | 15 | No forbidden words about own work; scope stated once (I); C1/C3 ordering distinction in III; M1, M2 research-copy status in IV; keeper timing not asserted |

## E. Originality (234 sentences against 38 notes, 18 cited PDFs (486 pages), PAPER_DRAFT_v0 and LITERATURE_RESEARCH)
| Severity | Count | Items |
|---|---|---|
| must-fix | 2 | Zhou 2021 "the first to formalize and quantify sandwich attacks" (8-word verbatim run, p. 1); intro "It is an order book, not an automated market maker (AMM)" (11 words from the draft) |
| should-fix | 13 | Sentences following the draft's structure: intro system list; abstract opening; II-A "security first" argument; II-B AMM closing line; II-B defences closing line; III stop eligibility; III adversary limits; III cap/remainder clause; III Mallory sells to Carol; Fig. 1 caption and III impact; III issue 006 history; IV M2 description; IV commit and reveal |
| own notes only (no fix) | 4 | Shared phrases with `notes/` paraphrases, not with sources |

## F. Assessment fit and format
| Item | Rating |
|---|---|
| Task 1 argue the choice; task 2 survey and considerations; task 3 analyse impact | strong |
| Task 4 propose strategies | strong for M1/M2/M6/M7, adequate for the rest |
| I Introduction, V Conclusion | adequate (V lacked a limitations sentence) |
| II, III (C1 to C4) | strong; III C5/C6 thin by design |
| IV | strong for A and B; M4 code change unstated |
| Format | PASS: two columns, 6 pages, captions, numbered IEEE references, 0 overfull; FAIL: corrupted `\ref` visible on page 4; placeholders print (intended) |

## G. Readability (cold read without code)
| Severity | Main items |
|---|---|
| must-fix | Undefined: base/quote, "base units", crossed, dust, C/E/M labels, K and gwei, stop trigger direction; C1 steps: why dust fills first, where 1e-8 comes from, why Carol is maker and Mallory's inventory; C2 who buys the stop at depth 0; C3 how the stop becomes eligible and why dust outranks Bob; corrupted `\ref` |
| should-fix | Undefined maker before III, keeper, round, slack, "marked at", extractable value, call market, rollup, mempool, issue 006/007, Table II strength key; repeated passages II vs IV (commit and reveal, Heimbach, Ferreira, Choudhuri), Qin count twice, Zhou 2023 framed two ways, stop-hunt gap stated twice; M3 first appears in V |

---

## Ranked fix list and what was done

### Must fix (all done)
| # | Fix | Source audits | Done |
|---|---|---|---|
| 1 | Corrupted `Table~\ref` (carriage return) and duplicate sentence in IV | A, C, D, E, F, G | Retyped; duplicate removed. Cause: a stage 2 Python edit run through a shell heredoc that collapsed `\\r` to a CR byte. Full scan: no other control bytes in paper, notes or bib |
| 2 | Beres attribution (two graph embeddings, not three behavioural features) | A, B1, D | II-A rewritten |
| 3 | Lissy gas limit July 2020 and worst case | A, B1, B2 | II-A, II-B, IV-D |
| 4 | Lissy "except price ties" overstated; cancellation two reasons; "whole block" worst case and cite | B1 | II-B rewritten |
| 5 | Eskandari "predates working on-chain books" | B1 | now "written while such books were still being built by several projects" |
| 6 | Canidio condition ("guessing is hard", Prop. 2, competing-claims exclusion) | B1 | II-B |
| 7 | Choudhuri conflation (own scheme vs Shutter flaw) | B2 | II-B and IV-D |
| 8 | Abstract: C1 ordering assumption, 33% slack, snipe trigger race, non-crossing bids, attacker-side gas, extrapolated 1e9, cancelled stop, 0.1 minimum | D, A, C | Abstract rewritten (about 179 words) |
| 9 | Table II M1, M2, M4/11 rows; M9 strength; M12 AMM label | D, B2, C | Table II rewritten |
| 10 | Conclusion: before gas, research copy, E10 assumption, limitations sentence | D, F | V rewritten |
| 11 | "local to two functions" (three) | A, D | IV adoption order |
| 12 | Zhou 2021 verbatim run; intro sentence from the draft | E | Paraphrased; intro rewritten |
| 13 | Undefined basics and missing example steps | G | Notation paragraph at the start of III (base/quote, maker/taker, crossed, lot, dust, slack, C/E/M labels, local gas, before gas); stop trigger direction where stops are described; keepers defined; K defined; extra steps in C1, C2, C3 |
| 14 | C3 cause (cap, not only the shared budget) | C | III-B |
| 15 | Issue 006 description | C | III-C |

### Should fix (all done unless marked)
| # | Fix | Done |
|---|---|---|
| 16 | All 13 draft-structure sentences rewritten (human instruction: all, not only the must-fix two) | yes |
| 17 | Qin wording; [06] "oracle"; Victor "keep books off-chain" and page; Osler causal hedge, cite the 2002 staff report actually read (`src13osler2002sr`) | yes |
| 18 | Daian PGA framing in III; M9 reward as our analogy; Budish "in their model", time priority across intervals only, delta/tau | yes |
| 19 | Grech "consistent in direction"; wallet griefing "analogous"; Grech cited for pull payments only, Zhou 2023 for the allowlist | yes |
| 20 | Moosavi miner wash trade and rolling median from Uniswap; fivefold across five designs | yes |
| 21 | Chemaya: dynamic 0.1% to 5% replacing static 0.5% (not "tighter"), March 2023, on AMMs | yes |
| 22 | Ferreira "some instances"; Babel AMM price source | yes |
| 23 | Gas local, profits before gas: one notation sentence in III; "one book shape" for E6 | yes |
| 24 | K to order of magnitude (about 4, about 1,300) with the fixed-cost and ordering-fee caveat | yes |
| 25 | "half vs a third" tied to our setups | yes |
| 26 | Table I: rounding stated, E9 keeper gain "<0", E4 defender figures in caption, E8 runs M1 and M2, loss definitions | yes |
| 27 | E10: "valued at 1.5", why 0.010, extrapolated 1e9 | yes |
| 28 | M6/M7 functions; M6 "by time or volume over a window"; time-weighted lag as our expectation | yes |
| 29 | Repeated II vs IV passages cut (commit and reveal, Heimbach, Ferreira in IV now point to II-B); Qin count and AMM point not repeated in III; stop-hunt gap now a back-reference | yes |
| 30 | Threat model labelled; M3 introduced in IV; "every loop that changes state"; stop triggers readable via `getOrder` | yes |
| 31 | II-A rollup sentence: Arbitrum testnet, layer-two work excluded, liquidations and cross-layer sandwiches | yes |
| 32 | "closest published system" as our view; S6 hedged; Babel "by analogy" | yes |
| 33 | Raw full-suite log saved to `evidence/` | yes |

### Optional (not done)
| # | Item | Why not |
|---|---|---|
| 34 | Add "first measurement of ordering attacks on a smart-contract LOB" to V (F) | Declined by the human: no-novelty rule |
| 35 | Renumber M labels to remove gaps (G) | Declined by the human: IDs are shared with the evidence files; the notation paragraph explains the numbering |
| 36 | Fig. 1 keeper label font size (F) | Lifelines shortened for space; label kept |
| 37 | Underfull boxes (6, cosmetic) | Left |

## Corrections made upstream (notes and evidence map), for hand rechecking
Each is tagged "[corrected 2026-11-25, stage 4]" in the file.
| File and row | Was | Now | Check against |
|---|---|---|---|
| `EVIDENCE_MAP.md` S8 | "combined quasi-identifiers give 1.6 bits" | two transaction-graph embeddings (Diff2Vec, Role2Vec) give 1.6 bits; time-of-day and gas price weaker | [25] PDF p. 7. Note 25 F4 was already right |
| `EVIDENCE_MAP.md` M5e | "2021 gas limit 11,741,495" | worst case, every order marketable (p. 6); limit from EthStats July 2020 (p. 4) | [09] PDF p. 4 footnote, p. 6 |
| `notes/09-moosavi-2021.md` F4 | throughput statements without conditions | conditions added (worst case, July 2020 limit) | [09] PDF p. 4, p. 6 |
| `paper/OUTLINE_V2.md` IV hedge | "2021 gas limit" | July 2020, worst case | as above |
| `EVIDENCE_MAP.md` C2d | p. 7 for the 58,791 count; "off-chain-matched" | count in Table 2 p. 9 (text p. 7); books kept off-chain, EtherDelta settles on-chain, only IDEX matches off-chain | [12] PDF p. 2, p. 9 |
| `EVIDENCE_MAP.md` C2f, `notes/13-osler-2002.md` F1 | stops "amplify" moves; cascade as fact | the author argues stops "may contribute"; causality not proven (p. 5); data periods stated | [13] PDF p. 5, p. 22 |
| `EVIDENCE_MAP.md` S5, `notes/05-qin-2022.md` F4 | "root cause of extractable value" | stated as a condition ("likely to remain as long as") | [05] PDF p. 13 |
| `EVIDENCE_MAP.md` M9 | Daian F4 "rewards become PGA prizes", moderate | analogy only, Daian does not study keeper rewards; weak | [01] PDF p. 1, p. 10 to 14 |
| `EVIDENCE_MAP.md` M11d | 2818.6 ms listed with the Shutter flaw as one system | 2818.6 ms is the authors' own scheme, single-threaded; flaw is in Shutter, since fixed | [29] PDF p. 6 to 7, p. 12 |
| `EVIDENCE_MAP.md` M12 | "dynamic tighter default" (added by stage 1) | static 0.5% replaced by dynamic 0.1% to 5%, not necessarily tighter; March 2023 | [34] PDF p. 2, p. 10, p. 14 |
| `EVIDENCE_MAP.md` C3a | "shares one budget, so dust can make a stop rest crossed" | the 10-fill cap is the cause; the shared budget only worsens later stops in one call | `OrderBook.sol:131, 141-142`; E3 has one stop |
| `EVIDENCE_MAP.md` C4c | "the same dust blocked all stop activations" | an unplaceable stop at the stop-list head behind 101 dust orders reverted every trigger call | `docs/ai-audit/issues/006-*.md` |
| `notes/18-heimbach-2022.md` F11 | (added in stage 3 follow-up) jostling definition | unchanged, confirmed by B1 on p. 5 | [18] PDF p. 5 |

Paper bib: Osler now cited as `src13osler2002sr` (the staff report actually read) instead of the 2005 journal
version; Chemaya booktitle shortened (fields removed, none guessed).

## Needs a human
1. Author details (matriculation numbers, emails), deadline, AI-use acknowledgement wording (placeholders kept).
2. Push `term-paper/research` and put its public commit in the appendix TODO.
3. Recheck by hand the 13 upstream corrections above against the PDFs.
4. Page margin is zero: the PDF is exactly 6 pages (5.99 page-equivalents). The real template, if it differs, may
   overflow; whether the appendix counts toward 6 pages is not known. First things to cut if needed: the appendix,
   then Fig. 1 height.
5. Citation versions: most entries cite the published version while the notes' page pointers come from the preprint
   read (stated in each bib comment). Lissy is cited as the LNCS chapter but read as arXiv v3. Decide whether to
   cite the versions read.
6. Whether the shortened Chemaya booktitle is acceptable to the marker.

## Re-audit after fixes (three fresh subagents on `git diff HEAD`, plus the E script)
| Audit | Must-fix | Should-fix | Result |
|---|---|---|---|
| A, numbers (53 changed items) | 0 | 5 | Every printed number matches its source. Should-fix: "leftover base" in E9 (she sold base); abstract "half" setup-dependent; "all gas figures" also covers literature gas; Table I E9 valued at 1.5; forge version not in a saved log (now `evidence/forge-version-2026-11-25.txt`) |
| B, citations (45 changed sentences) | 0 | 7 | 39 supported, 6 partly. Should-fix: Heimbach scoring is for DEXs generally, not AMM only; "order books measured" clashes with Lissy's gas measurement; allowlist is our analogy to Zhou et al.'s protocol whitelists; Chemaya 54.7% is before/after the March 2023 change; Budish delta/tau is a share of time exposed to sniping; "gas is cheap" on the rollup; Lissy "only" |
| D, overclaims (whole paper) | 0 | 11 | Contradiction: "none alone stops the one-transaction snipe" included M5 while Table II lists M5 for C3 (now limited to commit and reveal and chain-level protection). Others: intro causal link "to keep gas bounded"; intro 1e9 not marked extrapolated; Daian PoW present tense; "M1 does nothing"; abstract "half"; Chemaya causal "cut"; pull payments "would stop" without "we expect"; Babel AMM price only in their examples; Victor era 2017 to 2020 |
| E, 8-word overlap script | 1 | 0 | One new 11-word run from Qin p. 4 ("with a total profit of 174.34M USD"), introduced by a B1-suggested rewording; reworded. Rerun: no 8-word overlap with any cited PDF or the draft |

All 23 should-fix items applied. No must-fix items remain, so the loop ends here.

## Space
The fixes grew the paper from 5.51 to 6.28 page-equivalents (7 physical pages). Recovered without cutting analysis,
hedges or "what remains open" clauses (human instruction): repeated II/IV passages replaced by back-references,
connective wording tightened, single-word paragraph endings removed, Table I and II set in \scriptsize, Table II kept
single-column (a two-column float went to page 7 on its own), Fig. 1 lifelines shortened, the appendix heading merged
to one line and its per-row test names moved to a comment, the long Chemaya booktitle shortened.

Final compile (pdflatex, bibtex, pdflatex x2): **6 pages**, 5.95 page-equivalents, 0 errors, 0 overfull boxes,
0 undefined citations, 0 BibTeX warnings, 7 underfull boxes (cosmetic). Abstract 179 words. No control bytes, no
em or en dashes.

| Part | Measured (pages) | Stage 3 budget |
|---|---|---|
| Front matter | 0.28 | 0.30 |
| I | 0.49 | 0.55 |
| II | 1.10 | 1.05 |
| III (with Fig. 1, Table I) | 1.99 | 1.90 |
| IV (with Table II) | 1.30 | 1.25 |
| V (with AI-use placeholder) | 0.24 | 0.20 |
| References and appendix | 0.55 | 0.65 |
| **Total** | **5.95** | 6.0 |

Sections II, III, IV and V are each a little over their stage 3 budgets, within the flex the human allowed (up to
0.25 page of the former page-6 space for definitions and example steps).
