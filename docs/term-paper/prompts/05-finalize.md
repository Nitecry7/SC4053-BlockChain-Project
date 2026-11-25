# Stage 5: fit to the template, build the PDF, hand over to the two authors

Read `prompts/00-RULES.md`, `paper/VERIFICATION_REPORT.md`, `paper/STAGE_LOG.md`, and `context/` for the template.

## 1. Template and length

1. If `context/` holds the official template, match it: class or styles, title block, heading style, reference
   style, any required statement. If it is a Word template and the course requires Word, say so and stop for a
   decision. Otherwise stay with `IEEEtran` conference mode.
2. Compile. The paper must be 4 to 6 pages INCLUDING references. Aim for 5.5 to 6.0.
3. If it is over, cut in this order and stop as soon as it fits: optional Fig. 2, the optional appendix, C5 and C6
   down to one sentence each, the weakest survey sentences, table rows with the least evidence, then tighten prose.
   Never cut a hedge, the scope statement, or the "what remains open" clause of a solution.
4. If it is under 4.5 pages, deepen Section III-B and the solution trade-offs from the evidence. No padding.

## 2. Layout check

Render every page to an image and look at it. Fix: overfull boxes, tables wider than a column, a figure that is
unreadable at print size, a heading stranded at the bottom of a column, uneven last-page columns, broken
references, any "?" citation, any TODO left in the output except the author block and the AI-use declaration.

## 3. Build outputs

- `paper/build/SC4053_term_paper_draft.pdf`
- `paper/build/overleaf.zip` (the `overleaf/` folder, ready to upload)
- `paper/build/CHANGES_SINCE_VERIFY.md` (every sentence changed in this stage, so it can be re-checked)
Re-run audits A and D from stage 4 on the changed sentences only.

## 4. Hand over to the authors

Write `paper/HUMAN_TASKS.md` from the baseline split below, adjusted for whatever the verification report and this
stage left open. Use checkboxes, one owner per task, no shared ownership except the last block. Mark
`paper/TEAM_TASKS.md` as superseded at its top.

Baseline split:

Person 1 (engine owner): Section III and the M1 and M2 part of Section IV.
- Rerun the term-paper tests on your own machine and keep the log with the commit and Foundry version.
- Read III and IV-M1, M2 against the code and the evidence. Rewrite in your own words wherever the wording is not
  how you would say it. Check every line reference, number, Table I and Fig. 1.
- Decide with the repo owner whether the repo goes private before the branch is pushed, then push it.

Person 2 (tokens, factory, front end): Sections I, II, the rest of IV, V, references, format.
- Get the official template, the deadline and the AI-use rule in writing. Save the template into `context/`.
- Read I, II, IV (M3 to M12) and V against the notes. Open the PDF for the eight most-cited sources and confirm
  each sentence about them. Rewrite in your own words wherever needed.
- Check every reference entry against its DOI page. Move the text into the official template if it differs.
  Final page count, final PDF, submission.

Both, together, last: abstract, title and conclusion sign-off. Fill in the author block and the AI-use
declaration. Each reads the other's sections once with `paper/CLAIM_CHECKLIST.md`. Peer assessment.

## 5. Defence sheet

Write `paper/DEFENCE_QA.md`: fifteen questions a marker could ask (for example "why is this not just a limit order
working as designed?", "why does a keeper not solve it?", "why did you not implement M2 on main?"), each with a
three-line answer and the pointer to the evidence. Both authors should be able to answer all fifteen.

## 6. Finish

Commit. Write the stage log. Then give me in chat: the page count, the three weakest points left in the paper, the
list under "Needs a human", and the path to the PDF.
