# Team tasks and schedule (1 week)

P1 = engine owner. P2 = teammate. Section owners and content: `OUTLINE.md`. Checks: `CLAIM_CHECKLIST.md`.

## Before day 1 (human-only)
- [ ] P1: push the branch so P2 can pull it: `git push -u origin term-paper/research`. Downloaded PDFs are
      git-ignored; P2 re-downloads any paper they need from the URL in `../papers/INDEX.md`.
- [ ] Both: get the term-paper brief and rubric. `docs/project.pdf` covers only the development project; the
      "4 to 6 page IEEE" figure comes from `../inbox/RESEARCH_TASK.md`. Check page limit, whether references count,
      deadline, and AI-use disclosure rules.
- [ ] P1: zip `overleaf/` and upload it as a new Overleaf project; share with P2.
- [ ] Optional: download [14] (https://eprint.iacr.org/2022/445.pdf) and [17] (https://eprint.iacr.org/2021/1628.pdf)
      in a browser into `../papers/` as `14-mackinga-2022.pdf` and `17-baum-2022.pdf`; ask Claude to write the notes.
      If skipped, cite neither.
- [ ] Optional: check DBLP in a browser for the entries under UNVERIFIED FIELDS in `references.bib`.
- [ ] P1: decide whether to add a `docs/ai-audit/prompt-log.md` entry for the research sessions.

## Schedule
| Day | P1 | P2 |
|---|---|---|
| 1 | Read `OUTLINE.md`, `../EVIDENCE_MAP.md` A and B, `../evidence/README.md` | Read `OUTLINE.md`, `../EVIDENCE_MAP.md` B and C, notes 01 to 11, 18 to 23 |
| 2 | Draft III; Fig. 1 | Draft II |
| 3 | Draft IV and V (M1, M2); Fig. 2 | Draft V (M3 to M12), VI, VII; check Table II |
| 4 | Review P2's sections with `CLAIM_CHECKLIST.md` | Review P1's sections with `CLAIM_CHECKLIST.md` |
| 5 | Together: Introduction, Abstract, Conclusion; trim to page limit | same |
| 6 | Full checklist pass on numbers and citations | Full checklist pass on literature claims |
| 7 | Buffer, final compile, submit | same |

## What Claude can still do on request
- Look up a page pointer or number in the notes or evidence.
- Run the checklist against a pasted or committed draft and list each failing sentence.
- Write notes for [14] or [17] once the PDFs are in `../papers/`.
- Run a further experiment (for example a minimum-size sweep for M1a, or the M7 band).
