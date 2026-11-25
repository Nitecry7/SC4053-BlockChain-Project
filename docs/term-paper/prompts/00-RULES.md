# Rules for every paper stage (read this first, every session)

Goal: a finished SC4053 term paper in IEEE two-column conference format, 4 to 6 pages INCLUDING references, on the
security of our order book DEX. Branch: `term-paper/research`. All paths below are relative to `docs/term-paper/`.

## Sources of truth, in this order

1. Code on this branch and `evidence/` (`experiments.txt`, `experiments-gaps.txt`, `README.md`, `COST_MODEL.md`).
2. `EVIDENCE_MAP.md` rows and `notes/NN-*.md` with their page pointers. `OPEN_QUESTIONS.md` for known gaps.
3. `paper/OUTLINE_V2.md` once stage 1 has written it (until then `paper/OUTLINE.md`), and `paper/CLAIM_CHECKLIST.md`.
4. `context/` (ChatGPT material written without this branch). Use it for the assessment requirements, the template
   structure and scope advice. Never take a number or a literature claim from it unless `evidence/` or `notes/`
   confirms it.

## Fixed decisions

- Issue: Security, framed as economic security under transaction ordering.
- Section order (official template): I Introduction. II Motivation and Literature Survey. III Observations and
  Analysis. IV Proposed Solutions. V Conclusion. References. Optional appendix after the references.
  If `context/paper-template.pdf` or a template `.tex` or `.docx` exists, it overrides anything here.
- Depth: C1 fill-cap sandwich is the flagship result. C2 and C3 are treated together as stop-order manipulation.
  C4 is the security versus scalability trade-off. C5 and C6 get one or two sentences each.
- Mitigations in depth: M1 and M2 (measured in the research copy), stop hardening (M6, M7, untested design), batch
  clearing (M5, design direction). The rest appear in the mitigation table and at most one sentence.
- References: 14 to 18 entries, peer-reviewed first, plus the repository pinned to a commit.

## Evidence rules

- Every number in the paper carries a `%` comment on the same line of the `.tex` giving its pointer: an evidence
  file and heading, a note and page, or `file:line`.
- Gas figures are local Foundry measurements. Say so. Profits are before gas unless the E11 break-even is used.
- AMM results are never stated as order book results. Say "on AMMs" or "analogous".
- Apply every corrected summary and every hedge listed in `paper/CLAIM_CHECKLIST.md`.
- Sources 14 and 17 were never read. Do not cite them.
- M1 and M2 exist only in `contracts/test/termpaper/OrderBookMitigated.sol`. Never imply they are in the engine.
- C1 needs ordering control (E9 keeper test). The one-transaction C3 snipe does not (E9 atomic). Keep that distinction.
- State the scope once, plainly: local Anvil chain, deterministic tests, no public deployment, no external audit.

## Writing rules

- Write from the notes and evidence in fresh wording. Do not copy or lightly reword sentences from any paper, from
  `context/PAPER_DRAFT_v0.md`, or from any other text. At most one short quotation per source, with page.
- Plain academic English, "we", short sentences, every term defined on first use, actors named Bob, Carol, Mallory.
- No claims of novelty ("first", "novel", "we discover"). Say what was reproduced and measured.
- No em dashes or en dashes in prose. BibTeX page ranges are the only exception.
- Leave a clearly marked placeholder for author details and for an AI-use declaration. Never invent either.

## Process rules

- Never change `contracts/src/`, `web/`, or files outside `docs/term-paper/` and `contracts/test/termpaper/`.
- Commit locally at the end of the stage with a message starting "Term paper stage N:". Do not push.
- Append to `paper/STAGE_LOG.md` at the end: what was done, what failed, numbers that changed, open decisions.
- If something blocks the stage, stop and ask. Do not paper over a gap.
