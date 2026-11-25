# Stage 4: independent verification (run this in a NEW Claude Code session)

Read `prompts/00-RULES.md` and `paper/CLAIM_CHECKLIST.md`. You did not write this paper. Your job is to find what is
wrong with it. Use subagents that have not seen the drafting sessions, one per audit, and give each only the paper
source and the files it needs. Do not trust the `%` pointer comments: follow each one and check it.

Paper source: `paper/overleaf/main.tex`, `sections/`, `tables/`, `figures/`, `references.bib`.

## Audits

A. Numbers. List every number in the paper (text, tables, figure, abstract). For each: the claimed pointer, the value
   found there, match or mismatch, and whether rounding changed the meaning. Check the abstract against Section III.

B. Citations. For every sentence with a `\cite`: open the note for that source, and the PDF page in `papers/` when
   the file is there. Verdict: supported, partly supported, not supported, with the page. Check each corrected
   summary in the checklist is used in its corrected form. Flag every AMM result stated without "on AMMs".

C. Code. Check every `file:line` and every function or constant name against the source at HEAD. Check the worked
   example and Fig. 1 against `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` and `TermPaper.t.sol`.

D. Overclaims. Any "first", "novel", "prove", "always", "prevents". M2 presented as a complete fix. M1 presented as
   fixing C2. C1 presented without its ordering assumption. Mainnet or real-money language. Missing scope statement.
   Any claim whose EVIDENCE_MAP row is weak or none and is not hedged.

E. Originality. Compare every sentence of the paper with: the quoted sentences in `notes/`, the abstracts and
   cited pages of the PDFs in `papers/`, and `context/PAPER_DRAFT_v0.md`. Flag any run of eight or more consecutive
   words in common, and any sentence that follows a source's structure closely. Rewrite each flagged sentence.

F. Assessment fit. For each of the four tasks in the brief (argue the choice, survey and identify considerations,
   analyse impact, propose strategies) and each of the five template sections, name the paragraphs that satisfy it
   and rate it strong, adequate or thin. Check the format: two columns, 4 to 6 pages including references,
   reference style, figure and table captions, author and AI-use placeholders present.

G. Readability. Read as a marker who has not seen the code: any undefined term, any step in the C1 example that
   cannot be followed, any paragraph that could be cut without loss.

## Output

Write `paper/VERIFICATION_REPORT.md`: one table per audit, then a ranked fix list (must fix, should fix, optional).
Then fix every must-fix and should-fix item in the `.tex`. Re-run audits A, B and D on the changed sentences.
Repeat until there are no must-fix items. List what only a human can settle under "Needs a human".
Compile, report the page count, commit, and write the stage log.
