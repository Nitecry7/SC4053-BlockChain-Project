# Stage log

## Stage 1: sync and plan (2026-11-25, Claude Code)

### Environment
- Branch `term-paper/research`, HEAD `948d04f4c87e21019df8c62248a6b49f99973aa5`.
- Tree at start: not fully clean. `docs/term-paper/context/` and `docs/term-paper/prompts/` were untracked (the
  human had just added them). No tracked file was modified. Both folders are committed in this stage.
- `forge Version: 1.8.6`, commit `6bad0a66de7c83f7b33695044138f0f5fa4c5990` (same build as the logged runs).

### 1. Evidence check
- `forge test --match-path "test/termpaper/*" --isolate -vv` from `contracts/`: 16 passed, 0 failed, 0 skipped.
  Raw output: `../evidence/rerun-2026-11-25.txt`.
- Diff against `experiments-gaps.txt` (which holds all 16 tests) after removing header, timing and warning lines:
  **identical**, including every gas figure and every whole-test `(gas: N)` value. Every log line of
  `experiments.txt` (E1 to E7) is also present unchanged. **No number moved.**
- Full suite (`forge test`): `Ran 29 test suites in 636.45s (1975.00s CPU time): 351 tests passed, 0 failed,
  0 skipped (351 total tests)`. Same count as the 2026-11-19 run.
- `git diff 8753521 HEAD -- contracts/src`: empty. Code citations can pin public `main` 8753521
  (`git ls-remote` shows remote `main` at `8753521b83bd37896ff24314a3c1eaa36bd2a374`).

### 2. Reconcile (`RECONCILE.md`)
- Requirements adopted: 4 to 6 pages including references, IEEE two-column, five official sections, appendix after
  references. Template file not in hand.
- Superseded context statements listed (E1 to E11 "unverified", branch "missing", snipe numbers "not included",
  dust wall "cheap", 10 to 14 references, line ranges).
- Five uncovered sources: 34 Chemaya (note written, cited for M12), 35 Guidi (**failed**: HTTP 403 bot checks on
  ScienceDirect and the Pisa repository, Elsevier API needs a key; stub note, do not cite), 36 Solidity docs,
  37 OpenZeppelin docs, 38 OWASP SCWE-110 (notes written, not cited by default). Bib entries added to both
  `references.bib` copies; `papers/INDEX.md` updated. Notes 34 to 38 were written by subagents and not yet
  read line by line by a human.

### 3. References (`REFERENCES_FINAL.md`)
- 18 papers plus the repository (`repo8753521`, new). Dropped: 03, 07, 10, 14, 16, 17, 19, 22, 24, 26 to 28,
  30 to 33, 35 to 38. Cut order if over: 25, 04, 34.

### 4. Plan (`OUTLINE_V2.md`)
- Five sections with the given budget (5.90 pages total). Every old-outline bullet mapped (kept, merged, cut).
- Table I cut from 13 to 9 rows; Table II from 12 to 9 rows (M6 with M7, M4 with M11; M3 moved to future work);
  optional Table III removed (numbers go to IV.A text).

### 5. Skeleton
- `overleaf/sections/`: eight files removed (`git rm`), five added (`01-introduction` to `05-conclusion`) with TODO
  pointers. `main.tex` updated (five inputs, keywords, author and AI-declaration placeholders).
  `tables/gaps.tex` removed.
- **Bug fixed in the old tables**: every row ended with a single `\` instead of `\\`, so the tables would not have
  compiled. The rewritten tables use `\\`.
- LaTeX toolchain: **none installed** (`latexmk`, `pdflatex`, `tectonic`, `xelatex` all absent). Skeleton not
  compiled. Install: `winget install --id MiKTeX.MiKTeX -e` (then `pdflatex` and `bibtex`; `latexmk` also needs Perl).

### Other edits
- `EVIDENCE_MAP.md`: C6a range `:127-146` to `:127-145`; M12 adds [34].
- `CLAIM_CHECKLIST.md`: code commit 8753521; page rule including references; reference list rule.
- `OUTLINE.md`: marked superseded.

### Human answers to the stage 1 questions (2026-11-25)
1. Template: not available. Use IEEEtran conference mode with the five official sections; if the file arrives in
   `context/`, adjust in stage 5.
2. Authors: Kumar Advaith; Muhammadh Faheem Faizal. Affiliation: College of Computing and Data Science, Nanyang
   Technological University. Matriculation numbers and emails not yet supplied (TODO in `main.tex`).
3. Deadline: not yet supplied (placeholder). AI rule: none stated for the term paper; a short AI-use
   acknowledgement placeholder sits after the conclusion in `main.tex`.
4. Title: "Bounded Loops, Open Books: Economic Security of a Fully On-Chain Limit Order Book" (option c).
Applied to `overleaf/main.tex` in a follow-up stage 1 commit. Stage 3 should keep the title and read
"Open Books" as the public order book (rows S5, S6), so the intro must define that idea.

### Open decisions (for the humans)
1. Matriculation numbers, emails, deadline date.
2. Push `term-paper/research` (or a later commit) so experiments can be cited by public URL; until then only the
   engine at 8753521 is publicly citable.
3. Optional: download [35] Guidi in a browser if anyone wants it cited.

## Stage 2: technical core (2026-11-25, Claude Code, same session as stage 1)

### Done
- `overleaf/sections/03-observations.tex`: full prose. Opening (engine in five sentences, adversary in three),
  III-A C1, III-B C2 with C3, III-C C4, III-D C5 and C6. Section structure follows the stage 2 prompt (opening
  without a subsection heading, then A to D), not the A to E split in `OUTLINE_V2.md`.
- `overleaf/sections/04-solutions.tex`: full prose. IV-A M1 and M2, IV-B M6 and M7, IV-C C4, C5, C6 and M12,
  IV-D M5, M4, M11, Table II, recommended order of adoption.
- `overleaf/figures/fig1-sandwich.tex`: TikZ, three lifelines (Mallory, order book with Bob's ask, Carol), four
  numbered steps with 1.499, 2.0, 2.0 and 1.5, the E9 keeper window marked, wrapped in `\resizebox{\columnwidth}`.
  `main.tex` now loads `tikz`.
- Table I caption now states before gas, paper gains, Foundry 1.8.6. Table II caption explains RC / D / X and the
  strength letters; M1's targets changed from "C1, C3, C4" to "C1, C3" (C4 effect untested).
- Every line with a number or literature claim has a `%` pointer (EV = evidence/README.md, CM = COST_MODEL.md,
  EM = EVIDENCE_MAP row, OB = OrderBook.sol line, RC = OrderBookMitigated.sol line, [NN] = note and page).
- Mechanical checks: no em or en dashes; no novelty words ("first" occurs only as an ordinal); every `\cite` key
  exists in `references.bib` and is on `REFERENCES_FINAL.md`.

### Compile (after the human installed MiKTeX 25.12 with winget)
- `pdflatex`, `bibtex`, `pdflatex` x2 from `overleaf/`, output to the session scratchpad (no build files in the repo).
  No errors, no undefined references or citations. The first attempt to fetch a portable Tectonic was blocked by the
  auto-mode classifier and was not worked around; the human then installed MiKTeX.
- First compile: two overfull boxes, Table I 48.1pt and Table II 45.3pt too wide. Fixed by shorter headers and case
  labels and `	abcolsep` 4pt / 3.5pt; no number changed. Table I header now "Loss / Gain / Gas (tx)" with the
  caption saying whose each is; E4 case reads "Dust wall, bids blocked", "11 tx to clear". Table II drops
  "; not C2" from M1 (stated in IV-A text) and "(strength)" from the header (key is in the caption).
- Final compile: **0 overfull boxes**, 5 underfull boxes (narrow-column justification, cosmetic). 4 pages so far
  (I, II, V and abstract still empty).
- Page use measured from the PDF (column 667pt): **III 1.86 pages (budget 1.90)**, **IV 1.18 pages (budget 1.25)**.
  Both inside budget; no further trimming needed. Fig. 1 checked visually at column width: readable.

- `figures/e1_slack.dat` and `e2_depth.dat` unused (optional Fig. 2 not drawn, as planned to be cut first).

### Numbers
- No number changed. Every number in III, IV, Fig. 1 and the tables was checked against `evidence/README.md`,
  `COST_MODEL.md` and the notes. One near miss fixed before commit: E5 attacker quote is 1.499e-8, not 1.5e-8.

### Sentences hedged, and why
| Where | Hedge | Why |
|---|---|---|
| III opening | "observed being bought with transaction fees on proof-of-work Ethereum" | [01] is PoW-era (EM C1e caveat) |
| III opening | "every experiment is a deterministic Foundry test on a local chain" | scope rule |
| III-A | "Carol never pays above her own limit and no escrow is lost" | loss is relative to the best resting price, not a limit breach |
| III-A | "These are profits before gas" plus the K formula without prices | no cited gas or token prices (CM) |
| III-A | AMM sandwich "only analogous" | rule: AMM results never stated as order-book results; gap a |
| III-A | E9 keeper paragraph | C1 needs ordering control (checklist) |
| III-B | "paper gain marked at 2.0", "ordinary stop slippage" | E2 per-test review (1), (3) |
| III-B | "order-book DEXs that match off-chain", "on EtherDelta alone" | [12] caveat; self-trade majority is EtherDelta only |
| III-B | Osler "foreign exchange data from 1996 to 2000", lore, private stops | [13] F5, F7, F8 |
| III-B | "We did not find a study of stop hunting" | gap b; not "none exists" |
| III-B | "The stop still executes within the limit Carol chose" | stop-limit semantics |
| III-B | "we argue it hits the order meant to protect the victim" | reason three for C3 is an argument, not a measurement |
| III-B | [08] "although not for stop orders" | [08] covers liquidations and payouts |
| III-C | "in line with" (not "matches") Grech's 10x | our 8.4x is a different setting |
| III-C | "We argue that gas is therefore the only barrier"; Arbitrum testnet, excludes L2 work; "We did not measure the wall on a layer two" | S3 caveats; no L2 experiment |
| III-D | "reasoning from the code without an experiment"; "no test reproduces it"; "we have no data on how long" | C5b and C6b have no test or timing data |
| IV opening | "the submitted engine contains neither" | M1, M2 exist only in the research copy |
| IV-A | "Neither change is complete on its own" plus E10, E7 limits | checklist: M2 not a fix alone, M1 not for C2 |
| IV-A | "we tested only one minimum"; "E10 assumes Mallory sees every resubmission" | M1a weak; E10 assumption |
| IV-B | "Not implemented and not tested; these are design options"; "would lag"; "We expect M7 to..." | M6 weak, M7 none |
| IV-B | [06] "on Ethereum and BSC from 2018 to 2022" | [06] date and chain scope |
| IV-C | M1 effect on C4 "which we did not test" | no experiment |
| IV-C | M12 "on AMMs" for [34] | AMM result |
| IV-D | "We found no production measurement showing that batch DEXs reduce extractable value" | gap d |
| IV-D | [20] "works only when the attacker cannot guess"; [21] "AMM miners" | [20] Prop. 2; [21] AMM setting |
| IV-D | "none fixes the one-transaction snipe on its own, since that attack never waits in a mempool" | reasoning from E9 atomic, stated as such |

### Open decisions
1. Compile: done (see above).
2. Section III structure: the prompt's A to D was used; `OUTLINE_V2.md` still lists A to E. Update the outline or
   accept the prompt's version (no content difference).

## Stage 3: frame, abstract, references (2026-11-25, Claude Code, same session as stages 1 and 2)

### Human instructions at the start
- Section III stays as an unheaded opening plus subsections A to D: `OUTLINE_V2.md` updated to match (III labels
  A to D; the IV labels C and D also aligned with the written text).
- Keep I, II, V inside budget; report measured pages from the compiled PDF, not word counts.

### Done
- Section I (`01-introduction.tex`): blockchain and DEX, the three concerns defined, what we built (verified against
  `TokenFactory.sol:25`, `DemoToken.sol:7`, `MarketFactory.sol:27`, `OrderBook.sol`), order book not AMM, issue
  and thesis, three contributions matching III, IV-A and IV / Table II, scope sentence, organisation.
- Section II (`02-motivation-survey.tex`): II-A motivation from rows S1, S3 to S6, S8 (privacy and scalability get
  two sentences each); II-B by theme (front-running and EV; economic security and composition; on-chain books and
  batch auctions; defences); II-C gap (gaps a, b). Every source has one statement and one transfer clause.
- Section V (`05-conclusion.tex`): five sentences, no new claims.
- Abstract (about 175 words) and six index terms in `main.tex`; title from stage 1.
- Appendix "Reproducing Table I" after the references: command, forge 1.8.6, commit 8753521, test names per row,
  TODO for the public commit of the branch. The template allows appendices; whether they count toward 6 pages is
  not stated, and it fits on page 6 either way.
- `pgfplots` removed (optional Fig. 2 cut).

### References
- `paper/overleaf/references.bib` cut to the 19 cited entries (order of first citation: repo, 25, 09, 23, 05, 02, 01,
  04, 08, 06, 11, 20, 18, 21, 29, 12, 13, 15, 34). Master `docs/term-paper/references.bib` keeps all 38.
- UNVERIFIED FIELDS resolved on Crossref DOI records (`api.crossref.org`, opened 2026-11-25): pages added for src01
  (910--927), src04 (428--445), src05 (198--214), src06 (2444--2461); src08 2499--2516 confirmed and the alternative
  622--639 discarded. LNCS volume numbers for src02, src09, src34 are absent on Crossref, so not added. DBLP not used.
- All `note` fields moved to comments in the paper bib (IEEEtran would print them, e.g. "Read as arXiv...").
- Repository entry author set to the two paper authors (two committers up to 8753521 in `git shortlog`). **Humans
  confirm.**
- BibTeX: no warnings. All keys resolve.

### Compile and measured pages (pdflatex, bibtex, pdflatex x2; MiKTeX 25.12)
- No errors, no undefined references, **0 overfull boxes**, 6 underfull (cosmetic).
- PDF: **6 physical pages**; content ends on page 6 at about 55% of the left column (5.28 page-equivalents).
- Measured from heading positions in the PDF (column height 668pt; floats sit inside their own section's range):

| Part | Measured | Budget |
|---|---|---|
| Title, authors, abstract, index terms | 0.28 | 0.30 |
| I. Introduction | 0.53 | 0.55 |
| II. Motivation and Literature Survey | 0.71 | 1.05 |
| III. Observations and Analysis (incl. Fig. 1, Table I) | 1.72 | 1.90 |
| IV. Proposed Solutions (incl. Table II) | 1.20 | 1.25 |
| V. Conclusion (incl. AI-use placeholder) | 0.19 | 0.20 |
| References | 0.52 | 0.65 |
| Appendix (after references) | 0.12 | n/a |
| **Total content** | **5.28** | 6.0 |

III reads 1.72 here against 1.86 in stage 2 because float placement changed (less white space around Fig. 1); the
text is unchanged.

### Checklist run (I, II, V, abstract)
- Every line with a number or literature claim has a `%` pointer; no em or en dashes; "first" only as an ordinal or
  attributed to Zhou et al.; AMM results said to be on AMMs; [04], [06], [12], [23] corrected wording used; [11] no
  page numbers; [14], [17], [35] not cited; C1 ordering need and C3 one-transaction form kept distinct; M2 not
  presented as a fix alone; M1 not presented as fixing C2; no keeper-timing claim.

### Sentences hedged, and why
| Where | Hedge | Why |
|---|---|---|
| I | "we did not deploy publicly, and the engine has had no external audit" | scope rule |
| II-A | Beres "profiles accounts rather than trading strategies" | EM S8 caveat |
| II-A | Lissy "under the 2021 gas limit"; rollups carry "mainly arbitrage rather than sandwiches" | EM M5e, S4, M11f caveats |
| II-A | public book "lets the adversary aim them" cited to code views only | S6 is a design inference |
| II-B | Eskandari "qualitative and predates working on-chain books" | note 02 limits |
| II-B | Daian "on proof-of-work Ethereum before today's builder markets" | EM C1e caveat |
| II-B | Zhou 2021 "describe their work as the first..." | novelty claim attributed, not ours |
| II-B | "These measurements are all on AMMs" | rule: AMM never stated as order-book result |
| II-B | "We argue their insight transfers directly" (Babel) | our inference |
| II-B | Zhou 2023 "on Ethereum and BSC from 2018 to 2022", "few academic papers" | corrected summary |
| II-B | Budish "evidence from traditional futures and equity markets" | TradFi source |
| II-B | Ferreira "on an AMM"; "we argue that none alone removes..." | AMM setting; inference |
| II-C | "We did not find..." | gaps a, b |
| Abstract | "in our tests the buyer pays up to 5.0"; "profit before gas"; "In a research copy of the engine" | measured range; before gas; M1, M2 not in engine |
| V | "leave the stop hunt untouched and can cancel a victim's stop" | E8, E7 |

### Open decisions
1. Matriculation numbers, emails, deadline; AI-use acknowledgement wording (placeholder in `main.tex`).
2. Confirm the repository bib author line.
3. Push `term-paper/research` and put its public commit in the appendix TODO.
4. II has 0.34 page of unused budget; stage 4 or 5 may spend some of it, or leave it as margin.

## Stage 3 follow-up: II-B additions (2026-11-25)

### Human decisions
- Repository bib entry: both authors confirmed (Kumar Advaith and Muhammadh Faheem Faizal). Closed.
- Matriculation numbers, emails, deadline, AI-use wording, public branch commit: stay as TODO placeholders.
- Spend about 0.25 page of II's spare budget on II-B, notes only, no new sources.

### Done (all in `overleaf/sections/02-motivation-survey.tex`)
- (c) AMM versus order book made explicit: AMM price follows deterministically from reserves, so a sandwich moves
  them ([04] F1, F2, F10); a limit order book prices by resting orders it must store and match ([21] F10); the
  consequence for an attacker is marked "we argue".
- (a) Lissy versus our continuous book: in a continuous book landing order decides who trades with whom and who is
  maker (`OrderBook.sol:38-40, 67-68, 115, 276`), the lever of C1 and C3; in Lissy's call market shuffling within a
  call changes nothing, except price ties broken by time where its authors accept front-running remains ([09] F7,
  F8); Lissy drops cancellation because cancels can be front-run, ours keeps it ([09] F8, [02] F4); the cost is
  throughput, a close can take a whole block ([09] F4).
- (b) Heimbach and Wattenhofer's seven criteria named (decentralization, security, scope, jostling, goodput, delay,
  cost) and commit and reveal's scores (good on scope, jostling, decentralization; poor on cost, two on-chain
  transactions, and delay; reveal can be withheld) ([18] F2, F6, F11); Canidio and Danos' cost and condition kept.
- Correction caught before commit: my first draft defined "jostling" from memory as position being pushed around.
  Checked in the PDF (p. 5, Sec. 4): it is competition between traders for inclusion at a preferential position.
  Text fixed, and the definition added to `notes/18-heimbach-2022.md` as F11 so the pointer resolves to a note.

### Compile and measured pages
- No errors, no undefined citations, 0 overfull boxes, 6 underfull (cosmetic). 6 physical pages; the appendix ends
  at the foot of page 6's left column, right column empty.

| Part | Measured | Budget |
|---|---|---|
| Front matter | 0.28 | 0.30 |
| I | 0.53 | 0.55 |
| II | **0.95** (was 0.71) | 1.05 |
| III | 1.74 | 1.90 |
| IV | 1.18 | 1.25 |
| V (incl. AI-use placeholder) | 0.19 | 0.20 |
| References | 0.51 | 0.65 |
| Appendix | 0.12 | n/a |
| **Total content** | **5.51** | 6.0 |

### Checklist (II)
- Every new line has a `%` pointer to a note finding or `OrderBook.sol` line; no new source; no dashes; AMM
  statements labelled; inference marked "we argue"; [20] condition ("only when the attacker cannot guess") kept.

## Stage 4: independent verification (2026-11-25, Claude Code, same session as stages 1 to 3)

### Independence caveat
The prompt asks for a new session. The human asked for it here. Every audit and re-audit was done by a fresh
subagent that had not seen the drafting and received only the paper source and the files it needed; this session
only collected findings, applied fixes and recompiled. Full results: `VERIFICATION_REPORT.md`.

### Audits run
- A numbers, B1 citations (I, II, V, abstract, appendix, plus the human's PDF-level checks on [09], [18], [20] in
  II-B), B2 citations (III, IV, tables, figure), C code (re-ran 16/16 and 351/351 tests), D overclaims, E originality
  (8-word runs against 38 notes, 18 PDFs, the ChatGPT draft), F assessment fit and format, G cold-read readability.
- Re-audit after fixes: A, B, D by three more fresh subagents on `git diff HEAD`; E script rerun. Result: 0 must-fix
  from A, B, D; one new 11-word run (Qin) caught by E and reworded. 23 should-fix items then applied.

### What was wrong (main items)
- A literal carriage return had replaced `\r` in `Table~\ref` in IV since stage 2 (a Python edit sent through a shell
  heredoc collapsed `\r`). The PDF printed "Table eftab:mitigations". Stage 2 and 3 page checks missed it because
  they measured layout, not text. Full byte scan now clean.
- Misattributions or overstatements: Beres (two graph embeddings, not three behavioural features); Lissy gas limit
  (July 2020, not 2021) and worst case; Lissy "except price ties" (also suppression and a hybrid attack); Lissy
  cancellation (two reasons); Eskandari "predates working books"; Canidio condition; Choudhuri (own scheme vs Shutter
  flaw); Chemaya "tighter" default; EtherDelta "matched off-chain"; Osler causal wording; [06] "price" vs "oracle".
- Overclaims: abstract C1 without ordering assumption; Table II M1, M2, M4/11 rows; conclusion profit not before gas;
  M5 contradiction in IV.
- Code precision: C3 cause (cap, not only shared budget); E2 setup; issue 006; M7 functions; "local to two functions".
- Originality: Zhou 2021 verbatim run; intro sentence from the draft; 13 sentences following the draft's structure
  (all rewritten, human instruction).
- Readability: base/quote, crossed, dust, lot, C/E/M labels, K, stop trigger direction undefined; missing steps in the
  C1, C2, C3 examples. Fixed by a Notation paragraph at the start of III, the trigger direction where stops are first
  described, and the extra steps.

### Upstream corrections (notes and evidence map)
13 corrections, each tagged "[corrected 2026-11-25, stage 4]", listed in `VERIFICATION_REPORT.md` for hand checking:
EVIDENCE_MAP S8, M5e, C2d, C2f, S5, M9, M11d, M12, C3a, C4c; notes 09 F4, 13 F1, 05 F4; OUTLINE_V2 IV hedge.
Paper bib: Osler now `src13osler2002sr` (the version read); `REFERENCES_FINAL.md` updated.

### Evidence added
- `evidence/fullsuite-2026-11-25.txt` (raw full-suite run: 351 passed, 0 failed).
- `evidence/forge-version-2026-11-25.txt` (forge 1.8.6, commit 6bad0a6).

### Declined (by the human)
- Adding "first measurement" to the conclusion (no-novelty rule).
- Renumbering M labels (IDs shared with the evidence files; the Notation paragraph explains them).

### Compile and pages
pdflatex, bibtex, pdflatex x2 (MiKTeX 25.12): **6 pages**, 5.95 page-equivalents, 0 errors, 0 overfull, 0 undefined
citations, 0 BibTeX warnings, 7 underfull (cosmetic); abstract 179 words. Per section: front 0.28, I 0.49, II 1.10,
III 1.99, IV 1.30, V 0.24, references and appendix 0.55. The fixes first pushed the paper to 7 pages (6.28); space was
recovered without cutting analysis, hedges or "what remains open" clauses (see the report's Space section).

### Needs a human
1. Matriculation numbers, emails, deadline, AI-use wording (placeholders kept, human instruction).
2. Push the branch and fill the appendix's public-commit TODO.
3. Recheck the 13 upstream corrections against the PDFs.
4. Page margin is about 0.05 page; the real template or the appendix rule could change the fit.
5. Citation versions: published versions are cited while most page pointers come from preprints (see bib comments).
