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

### Open decisions (for the humans)
1. Official template file, author block, deadline, AI-use rule, title (asked in the stage report).
2. Push `term-paper/research` (or a later commit) so experiments can be cited by public URL; until then only the
   engine at 8753521 is publicly citable.
3. Optional: download [35] Guidi in a browser if anyone wants it cited.
