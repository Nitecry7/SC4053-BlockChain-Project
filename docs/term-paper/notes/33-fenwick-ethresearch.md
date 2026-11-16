# 33: Fenwick + Bitmap matching for on-chain order books (grey literature)

## 1. Verified citation (IEEE style)
dev-clober, "Fenwick + Bitmap: Constant-time matching for on-chain order books," Ethereum Research forum (Decentralized exchanges), May 12, 2025. [Online]. Available: https://ethresear.ch/t/fenwick-bitmap-constant-time-matching-for-on-chain-order-books/22313
- Checked against: saved HTML docs/term-paper/papers/33-fenwick-ethresearch.html: canonical URL as above; `article:published_time` 2025-05-12T06:48:11+00:00; post 1 author handle "dev-clober"; one reply (post 2, "sidratariq", 2026-05-19T19:46:56Z) asking for a GitHub link. No web check made (forum post, no DOI).
- Version read: thread as saved (post 1 plus post 2).
- Differences between what I read and the published version: none applicable.
- Fields NOT verified: real author name and affiliation (only the handle "dev-clober" is shown; the handle suggests the Clober project but the page does not say so).
- Peer review status: grey literature (forum proposal).

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | Targets: best-price lookup O(1); place or cancel O(log m), m = quotes at a level; market order O(t), t = levels touched; with a practical cap of thirty thousand quotes per level, log m stays below fifteen. | Post 1, Sec. 2 "Complexity targets" |
| 2 | Price directory: three-tier bitmap (L0 one bit per tick, L1 one bit per 256 L0 bits, L2 one bit per 256 L1 bits); best price by reading one word per tier, "exactly three storage reads". | Post 1, Sec. 3 table |
| 3 | Within a level: Fenwick tree over sequence-numbered quotes storing live sizes; add or cancel touches log m cells; "at most fifteen reads and two writes under the depth cap". | Post 1, Sec. 3 table |
| 4 | Market order loop runs once per price level, so taker gas depends on ticks crossed, not maker count; makers claim proceeds later by comparing a filled cursor with a prefix sum (pull model). | Post 1, Sec. 4 |
| 5 | Gas outline (estimates): best-price lookup "a few thousand"; place quote ~40 k (up to 18 reads); cancel ~50 k (up to 17 reads); sweep one level ~20 k. | Post 1, Sec. 5 table |
| 6 | Gas numbers are labelled "Gas estimate"; no benchmark, test setup, code or chain is given; the post asks for "Feedback, stress tests, and formal proofs". | Post 1, Sec. 5 and Sec. 8 |
| 7 | Safety notes: matching finishes before any external transfer (re-entrancy); depth counters monotone; claimed entries reset so sequence numbers can wrap. | Post 1, Sec. 6 |
| 8 | Comparison table: Segmented-segment tree with heap has a 32,768-quote depth cap per level, which the post says limits spam; radix-tree heap maker edits can reach sixty writes. | Post 1, Sec. 7 |
| 9 | No code link: the only reply asks where the solution or GitHub link is, with no answer in the thread. | Post 2 |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | M8, C4, Security vs Privacy vs Scalability | direct | Price-level book bounds work by levels, not orders; our MAX_INSERT_SCAN dust wall would not arise from per-order scanning. |
| 2 | M8 | direct | Concrete on-chain structure for constant best-price lookup. |
| 3 | M8 | direct | Preserves time priority inside a level with log-bounded cost. |
| 4 | M8, C1, C3, M10 | analogous | Per-level matching means dust orders at one price do not each consume a fill slot; pull claims avoid push payouts. |
| 5 | M8 | direct (claimed) | Only gas numbers available for this design. |
| 6 | M8 | direct | Numbers are unmeasured estimates; must be cited as claims. |
| 7 | background | background | Matches our CEI rule. |
| 8 | C4, M8 | analogous | A per-level depth cap is itself a spam limit (and a dust-wall target). |
| 9 | M8 | background | No verifiable implementation in the thread. |

## 4. Limits for an on-chain order book
- Proposal only: no measured gas, no code, no audit (Sec. 5, Sec. 8, post 2).
- Fixed tick grid assumed (Sec. 7 table); fits our TICK_SIZE but not arbitrary prices.
- Does not address ordering attacks (front-running, stop hunts); it is a scalability design.
- A per-level cap of thirty thousand quotes (Sec. 2) still lets a dust attacker fill one level, though the post says the Fenwick + Bitmap row has no depth cap in Sec. 7, which conflicts with the "practical cap" wording in Sec. 2.

## 5. Gap question answered
- Question(s): f.
- Answer from this source: data structure is a three-tier bitmap over price ticks plus a per-level Fenwick tree over sequence-numbered quotes (Sec. 3); claimed gas is a few thousand for best-price lookup, ~40 k place, ~50 k cancel, ~20 k per level swept (Sec. 5). These are labelled estimates, not measurements; no benchmark or code is provided (Sec. 5, Sec. 8, post 2).
- Strength: weak to moderate. Directly about an on-chain order book and gives a clear structure, but grey literature (forum proposal), gas figures are argued estimates, and there is no public implementation linked.

## 6. One quote (optional, max one sentence)
> "Because the loop runs once per price level gas depends on ticks crossed, not maker count." (Post 1, Sec. 4)
