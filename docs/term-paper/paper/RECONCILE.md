# Reconciling `context/` (ChatGPT material) with this branch (stage 1, 2026-11-25)

`context/` was written from public `main` without this branch. It is used for assessment requirements, template
structure and scope advice only. Numbers and literature claims come from `../evidence/` and `../notes/`.

## 1. Requirements the context establishes

| Requirement | Value | Where stated | Status |
|---|---|---|---|
| Page limit | 4 to 6 pages INCLUDING references | `context/README.md`; `REVIEW_AND_ACTION_PLAN.md` sec. 1 (quoting the supplied `paper-template.pdf`) | Adopted. Template file itself not seen on this branch |
| Format | IEEE two-column conference style | same | Adopted (`IEEEtran`, conference) |
| Section order | I Introduction; II Motivation and Literature Survey; III Observations and Analysis; IV Proposed Solutions; V Conclusion; References | `context/README.md`; `REVIEW_AND_ACTION_PLAN.md` sec. 1 | Adopted in `OUTLINE_V2.md` and the skeleton |
| Section IV content | Per issue: actionable change, how it changes our code, whether implemented (implementation optional) | `REVIEW_AND_ACTION_PLAN.md` sec. 1 item 4 | Adopted (IV per-issue pattern) |
| Appendix | Allowed after the references for extra supporting material | `context/README.md`; `COMPLETE_GUIDE.md` sec. 1 | Adopted; whether appendix pages count toward 6 is NOT stated, so assume they might |
| Weight | 20% of the module, group paper, peer assessment | `COMPLETE_GUIDE.md` sec. 1 | Noted |
| Rubric | None found ("proposed quality criteria, not official") | `COMPLETE_GUIDE.md` sec. 1; `REVIEW_AND_ACTION_PLAN.md` sec. 1 | Do not claim a rubric |
| Template age | Supplied template is from 2020 with the old CE/CZ4153 code | `REVIEW_AND_ACTION_PLAN.md` sec. 1 | Open: confirm with the lecturer (stage 1 question 1) |
| Deadline, AI-use rule | Not established | both | Open (stage 1 question 3) |

## 2. Statements in the context that the branch supersedes

| Context statement | Where | What the branch shows |
|---|---|---|
| E1 to E11 are "teammate-reported", "not yet independently verified" | `COMPLETE_GUIDE.md` sec. 3; `REVIEW_AND_ACTION_PLAN.md` sec. 2; `PAPER_DRAFT_v0.md` V.A, VI | Rerun on 2026-11-25: 16 of 16 term-paper tests pass; every log line and gas figure identical to `experiments.txt` and `experiments-gaps.txt` (`../evidence/rerun-2026-11-25.txt`, see `STAGE_LOG.md`) |
| The research branch is missing or not visible | `COMPLETE_GUIDE.md` sec. 3, 6; `REVIEW_AND_ACTION_PLAN.md` sec. 2 | The branch is `term-paper/research`, local. Still true that it is not on the remote (`git ls-remote` 2026-11-25 lists only `main` at 8753521 among relevant heads), so tests cannot be cited by public URL yet |
| Stop-snipe figures (E3, E7, E9) "not included", cited only as a SPEC scenario | `PAPER_DRAFT_v0.md` IV.B | Measured: E3 victim receives 10.000000011 of 20.0; E9 one-transaction snipe, 3,588,665 gas |
| Dust wall is "low-capital" or cheap | `PAPER_DRAFT_v0.md` abstract, IV.C; `COMPLETE_GUIDE.md` C4 | Capital-cheap but gas-expensive: attacker 8.4x the defender's gas (`../evidence/COST_MODEL.md`) |
| A minimum order size is a C1 fix candidate, unevaluated | `PAPER_DRAFT_v0.md` V.A; `LITERATURE_RESEARCH.md` P0 | Measured: M1 alone does not stop C2 (E8); M2 alone gives 1e9-round delay (E10); M1 plus M2 bounds it to 10 rounds |
| "Cancel crossing remainder" proposed but not implemented | `PAPER_DRAFT_v0.md` V.A; `LITERATURE_RESEARCH.md` P0 | Implemented as M2 in the research copy `contracts/test/termpaper/OrderBookMitigated.sol` and measured (E5 to E7, E10). Still not in the engine |
| Keep 10 to 14 references | `REVIEW_AND_ACTION_PLAN.md` sec. 2 item 3, sec. 6 | Rules set 14 to 18 plus the repository; chosen 18 plus repository (`REFERENCES_FINAL.md`) |
| 335 tests on main | `REVIEW_AND_ACTION_PLAN.md` sec. 2 item 7 | 351 on this branch (335 plus 16 term-paper tests); 351 passed on 2026-11-25 (`STAGE_LOG.md`) |
| `triggerStopOrders` at lines 127 to 144; placement 58 to 69 | `REVIEW_AND_ACTION_PLAN.md` sec. 3 | Function spans `OrderBook.sol:127-145`. EVIDENCE_MAP said 127-146, corrected today |
| Code cited at commit 96107ad | `CLAIM_CHECKLIST.md` (branch file) | Cite public `main` 8753521 instead: `git diff 8753521 HEAD -- contracts/src` is empty, so line numbers carry over |
| Draft abstract: "We identify a compositional economic attack" | `PAPER_DRAFT_v0.md` abstract | Issue 007 came from our own earlier audit; rules forbid discovery language. Say "reproduce and measure" |

Context statements that the branch confirms: issue 007 regression balances (Carol pays 19.99999999499, Mallory
+4.99999999499; matches E1 33% row); issue 006 fixed and replaced by cancel-and-refund; C1 needs ordering
control (now shown by E9).

## 3. Sources the context cites that had no note

| Source | Obtained | Note | Bib key | Verdict | Use |
|---|---|---|---|---|---|
| Chemaya et al., FC 2024 (LNCS 2025) | Yes, authors' copy (`papers/34-chemaya-2025.pdf`) | `notes/34-chemaya-2025.md` | `src34chemaya2025` | Claim "54.7% reduction for a dynamic Uniswap default" supported (Table 5, p. 14), but losses are per 100 USD swapped, combine sandwich loss and failed-swap gas, and Sushiswap was the unchanged control | Cited for M12, on AMMs |
| Guidi and Michienzi, BCRA | No: HTTP 403 bot checks (ScienceDirect, Pisa repository); Elsevier API needs a key | `notes/35-guidi-2025.md` (stub) | `src35guidi2025` (Crossref only; issue is vol. 7 no. 3, Jun. 2026, not 2025) | Not checked | **Do not cite.** Gold OA, so a browser download could reopen it |
| Solidity 0.8.24 docs, Security Considerations | Yes (`papers/36-solidity-docs.html`, version-matched to `foundry.toml` solc 0.8.24) | `notes/36-solidity-docs.md` | `src36soliditydocs` | Supported for reentrancy and public state; does NOT cover mempool visibility or front-running | Background check only; not cited |
| OpenZeppelin Contracts 5.x API (Utils, SafeERC20) | Yes (`papers/37-openzeppelin-*.html`) | `notes/37-openzeppelin-docs.md` | `src37ozdocs` | Supported; SafeERC20 checks success, never the amount received; installed v5.7.0, docs link v5.6.1 | Background check only; not cited |
| OWASP SCWE-110 | Yes (`papers/38-owasp-scwe110.html`) | `notes/38-owasp-scwe110.md` | `src38owaspscwe110` | Supported: credit the received amount (balance delta) or allowlist. Applies to `_pullEscrow` (`OrderBook.sol:214-221`) | Not cited by default; optional grey support for a fee-on-transfer sentence in III.E or M10 |

## 4. Ideas worth keeping from `context/PAPER_DRAFT_v0.md` (ideas only, no wording)

| Idea | Keep how |
|---|---|
| Title "When Correct Settlement Is Not Fair Execution" with a subtitle on ordering and dust in a gas-bounded book | One of the three title options offered |
| Thesis framing: solvency, valid limits and no reentrancy do not imply best-price execution | Thesis of I.3 and V |
| Security chosen because privacy and scalability show up here as security losses (caps create the attacks) | II.A argument |
| System and threat model opening Section III rather than a separate section | III.A |
| Separating the fixed historical bug (issue 006) from the present residual limit | III.D.2 |
| Stop-limit loss is relative to better resting orders, not a breach of the stop's own limit | Hedge in III.C.4 |
| Evaluate each mitigation on the same three-party trace and the same measures (victim cost, attacker profit, liveness, gas) | Framing sentence for IV; our E5 to E10 already follow it |
| One clear figure plus one compact results table | Fig. 1 and Table I |
| The draft's numbers and reference list | Not kept: numbers come from `../evidence/`; references from `REFERENCES_FINAL.md` |
