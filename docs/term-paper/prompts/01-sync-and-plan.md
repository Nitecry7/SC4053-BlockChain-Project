# Stage 1: confirm the evidence, absorb the new context, re-plan to the official template

Read `prompts/00-RULES.md` first. Then read: `context/README.md` and every file in `context/`, `paper/OUTLINE.md`,
`paper/CLAIM_CHECKLIST.md`, `paper/TEAM_TASKS.md`, `EVIDENCE_MAP.md`, `OPEN_QUESTIONS.md`, `evidence/README.md`,
`evidence/COST_MODEL.md`. No paper prose in this stage.

## 1. Confirm the evidence still holds

1. Check the branch is `term-paper/research` and the tree is clean. Record `git rev-parse HEAD` and `forge --version`.
2. From `contracts/`: `forge test --match-path "test/termpaper/*" --isolate -vv`. Save the raw output to
   `evidence/rerun-<date>.txt`. Diff every logged number against `experiments.txt` and `experiments-gaps.txt`.
3. Run the full suite once and record the pass count.
4. Confirm `git diff 8753521 HEAD -- contracts/src` is empty, so code citations can pin the public `main` commit.
   If it is not empty, say exactly what differs.
5. Report any number that moved. If one moved, stop after this section and ask.

## 2. Reconcile the context files with the branch

Write `paper/RECONCILE.md` with four short tables:
1. Requirements the context establishes (page limit including references, section order, weight, appendix rule).
2. Statements in the context that the branch supersedes (for example "E1 to E11 unverified", "branch missing").
3. Sources the context cites that have no note here (Chemaya 2025, Guidi and Michienzi 2025, Solidity docs,
   OpenZeppelin docs, OWASP SCWE-110). For each: fetch a legal open copy into `papers/`, write a note in the usual
   format, and add a verified bib entry. If you cannot open it, mark it "do not cite".
4. Ideas worth keeping from `context/PAPER_DRAFT_v0.md`: title, thesis framing, any structure choices. Ideas only.

## 3. Choose the final reference list

Pick 14 to 18 references from the 33 notes plus any added above. Rank by how directly each supports a claim the
paper will make, using the EVIDENCE_MAP strength column. Write the list to `paper/REFERENCES_FINAL.md` with one line
per entry: bib key, what it will be cited for, and where (section). Everything else is dropped from the paper.

## 4. Re-plan to the official five-section template

Write `paper/OUTLINE_V2.md`. Map every bullet of the old eight-section outline to one of: kept (with its new
section), merged, cut. Use this budget, which must total at most 6.0 pages including references:

| Part | Pages |
|---|---|
| Title, authors, abstract, index terms | 0.30 |
| I. Introduction (blockchain, the three concerns, what we built, chosen issue, contributions) | 0.55 |
| II. Motivation and Literature Survey (why security over privacy and scalability; survey by theme; the gap) | 1.05 |
| III. Observations and Analysis (short system and threat model; C1; C2 with C3; C4; C5 and C6 briefly) | 1.90 |
| IV. Proposed Solutions (per issue: change, code impact, implemented or not, measured effect, what remains) | 1.25 |
| V. Conclusion | 0.20 |
| References | 0.65 |

Figures and tables (fix these now): Fig. 1 the C1 sandwich as a three-actor sequence. Table I attack results, at
most 9 rows. Table II mitigations against considerations with status and evidence strength, at most 9 rows.
Optional Fig. 2 (E1 loss against limit slack) is the first thing cut.

For each paragraph of the new outline give: the point, the EVIDENCE_MAP rows, the references, the required hedge.

## 5. Rebuild the skeleton

Under `paper/overleaf/`: replace the eight section files with five (`01-introduction.tex` to `05-conclusion.tex`),
carry over the TODO pointers, update `main.tex`, and compress `tables/experiments.tex` and
`tables/mitigations.tex` to the row limits. Keep the old files in git history only.
Check for a LaTeX toolchain (`latexmk`, `pdflatex` or `tectonic`). If none is installed, tell me the single install
command for this machine and carry on. Compile the empty skeleton if you can.

## 6. Stop and ask me, in one message

1. Is the official template file available? (Save it as `context/paper-template.pdf` or `.tex` or `.docx`.)
2. Author names, matriculation numbers, emails, exactly as they should print.
3. The submission deadline and the course rule on AI-use disclosure.
4. Title: offer three options, one of them the title in `context/PAPER_DRAFT_v0.md`.
Then commit and write the stage log.
