# Paper completion: five Claude Code stages

Run from the repo root, on branch `term-paper/research`, one stage per Claude Code session. Paste the line, let the
stage finish, read its report, then start the next. Stage 4 must be a new session so the checker has not seen the
drafting.

| Stage | Paste this | What you get | Stops for you? |
|---|---|---|---|
| 1 | `Read docs/term-paper/prompts/01-sync-and-plan.md and carry it out exactly.` | Tests rerun, context reconciled, final reference list, outline in the official five sections, rebuilt skeleton | Yes: template, authors, deadline, AI rule, title |
| 2 | `Read docs/term-paper/prompts/02-draft-core.md and carry it out exactly.` | Sections III and IV, Fig. 1, Tables I and II | Only if blocked |
| 3 | `Read docs/term-paper/prompts/03-draft-frame.md and carry it out exactly.` | Sections I, II, V, abstract, title, verified references | Only if blocked |
| 4 | `Read docs/term-paper/prompts/04-verify.md and carry it out exactly.` (new session) | Seven audits, a verification report, fixes applied | Lists what needs a human |
| 5 | `Read docs/term-paper/prompts/05-finalize.md and carry it out exactly.` | PDF within 6 pages, Overleaf zip, `HUMAN_TASKS.md`, `DEFENCE_QA.md` | Final report |

If a session runs out of room, start a new one with: `Read docs/term-paper/paper/STAGE_LOG.md, then continue
docs/term-paper/prompts/0N-....md from where it stopped.`

Every stage reads `00-RULES.md` first. Change a rule there and it applies to all later stages.

## What stays human after stage 5

Person 1 (engine owner): owns Section III and the M1, M2 part of IV. Rerun the tests yourself, check every line
reference, number, Table I and Fig. 1, reword anything that is not how you would say it, and push the branch once
the repo visibility is decided.

Person 2 (tokens, factory, front end): owns Sections I, II, the rest of IV, V, references and format. Get the
template, deadline and AI-use rule, confirm the survey sentences against the papers, check each reference against
its DOI page, move the text into the official template if needed, produce the final PDF and submit.

Both, last: abstract, title and conclusion sign-off, author block, AI-use declaration, one cross-read each with
`paper/CLAIM_CHECKLIST.md`, peer assessment. Stage 5 writes the detailed checklist to `paper/HUMAN_TASKS.md`.
