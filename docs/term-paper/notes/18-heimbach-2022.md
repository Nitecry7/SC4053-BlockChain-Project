# 18: Heimbach, Wattenhofer, SoK preventing transaction reordering

## 1. Verified citation (IEEE style)
L. Heimbach and R. Wattenhofer, "SoK: Preventing transaction reordering manipulations in decentralized finance," in *Proc. 4th ACM Conf. Adv. Financial Technol. (AFT '22)*, Cambridge, MA, USA, Sep. 2022, pp. 47 to 60, doi: 10.1145/3558535.3559784.

- Checked against: PDF page 1 (title, two authors, ETH Zurich, arXiv margin stamp "arXiv:2203.11520v3 [cs.CR] 21 Sep 2022"; no venue or page numbers printed in this copy).
- https://api.crossref.org/works/10.1145/3558535.3559784 : same authors and title, Proceedings of the 4th ACM Conference on Advances in Financial Technologies, pages 47 to 60, published 2022-09-19, ACM.
- https://researchr.org/publication/HeimbachW22-0 (via search result): AFT 2022, Cambridge, MA, Sep. 19 to 21, 2022, pp. 47 to 60, same DOI.
- DBLP not used: dblp.org returned an "Access Denied" bot-protection page.
- Version read: arXiv 2203.11520v3, 21 Sep 2022, 14 PDF pages. Published version: AFT '22, ACM, pp. 47 to 60, DOI 10.1145/3558535.3559784.
- Differences between what I read and the published version: title and authors match. Content and page layout of the ACM version not compared (ACM PDF not read); page pointers below are arXiv PDF pages, not proceedings pages.
- Fields NOT verified: whether the ACM text differs from arXiv v3.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Fair order definition: no party can include or exclude transactions after seeing their contents, nor insert its own transaction before one whose contents it has observed. | p. 5 (Sec. 4) |
| 2 | Seven measures (the "demands"/"requirements"): decentralization, security, scope, jostling, goodput, delay, cost; each scored 1 (poor) to 3 (excellent), Ethereum as benchmark for several. | p. 5 (Sec. 4) |
| 3 | Seven categories of defence: optimized trade execution (5.1), professional market makers (5.2), trusted third party ordering (5.3), eUTXO model (5.4), algorithmic committee ordering (5.5), on-chain commit and reveal (5.6), off-chain commit and reveal (5.7). | pp. 5 to 11 (Sec. 5) |
| 4 | Manipulation types: fatal front-running, front-running, back-running; "clogging" (filling blocks until a deadline) treated as a case of fatal front-running with multiple transactions. | pp. 2 to 3 (Sec. 3, Fig. 1) |
| 5 | Verdict: no approach meets all demands; each scores poorly on at least one measure, and at least one approach excels on every measure (Fig. 11). | p. 1 (Abstract); p. 11 (Sec. 6); pp. 12 to 13 (Sec. 7); Fig. 11 p. 12 |
| 6 | On-chain commit and reveal: broad scope, low jostling, good decentralization, but low cost score (two on-chain transactions) and poor delay (a few block times); small loophole: attacker may choose not to reveal. | pp. 10 to 11 (Sec. 5.6) |
| 7 | Trusted third party ordering (flashbots, Eden, OpenMEV, TEEs) excels in scope, goodput, delay, jostling, but fails decentralization and security; adopted fastest. Gnosis Protocol/CowSwap: batches with a uniform clearing price, so no sandwich within a batch. | pp. 7 to 8 (Sec. 5.3); p. 12 (Sec. 6) |
| 8 | Algorithmic committee ordering: Condorcet paradox makes "fair" receive-order impossible to agree on; attackers with better network connections can still front-run; relies on two-thirds honest nodes. | pp. 9 to 10 (Sec. 5.5) |
| 9 | eUTXO (or zero slippage / one interaction per block): stops front-running but not fatal front-running and possibly not back-running; goodput limited to one transaction per pool per block. | pp. 8 to 9 (Sec. 5.4) |
| 10 | Scope note: authors say centralized exchanges use limit order books while the largest DEXes are AMMs; their attack examples are AMM sandwiches, arbitrage, and lending liquidations. | p. 3 (Sec. 3.1); p. 4 (Sec. 3.2) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | C1, C2, C3 | analogous | Our attacks insert after observing public orders or stops; definition gives a test for "unfair" ordering. |
| 2 | Security vs Privacy vs Scalability, M4, M5, M11 | direct (as evaluation framework) | Ready-made criteria to score our mitigations (cost, delay, goodput, decentralization). |
| 3 | M4, M5, M11 | direct (as survey) | Covers commit and reveal (M4), batch-style (via CowSwap, M5) and chain-level ordering (M11). |
| 4 | C1, C3, C4 | analogous | Clogging (filling capacity before the victim) resembles dust using up a fill budget (C1, C3) or the insert scan (C4). |
| 5 | M4, M5, M11 | direct | Supports the claim that no ordering defence is free; justifies application-level mitigations (M1, M2, M7) alongside. |
| 6 | M4 | direct | Commit and reveal costs: extra transaction and delay; non-reveal option. |
| 7 | M5, M11 | analogous | Private ordering and uniform-price batches as existing remedies; private ordering trades away decentralization. |
| 8 | M11 | background | Limits of fair-ordering consensus. |
| 9 | M2, M7 | analogous | Refusing to execute on a changed state (zero slippage) parallels cancelling instead of resting crossed (M2) or a trigger-to-limit band (M7); paper notes it leaves back-running. |
| 10 | background | background | Shows the SoK is AMM-centred; transfer to an order book is our argument, not theirs. |

## 4. Limits for an on-chain order book
- Examples and threat models are AMM (CPMM) sandwiches, cyclic arbitrage and lending liquidations (Sec. 3); no on-chain limit order book, no stop orders, no fill caps.
- Scores are the authors' qualitative judgements (1 to 3), not measurements.
- Written for Ethereum L1 with public mempool and miners (pre-Merge framing, "miners"); rollups with private sequencers not discussed.
- Explicitly excludes confidentiality-based DEX designs that hide trade size (p. 2, Sec. 2), so privacy-preserving order books are out of scope.

## 5. Claim check
- Summary given: "no current reordering defence meets all requirements."
- Verdict: supported
- Evidence: stated three times. Abstract p. 1: currently no scheme fully meets all the demands of the blockchain ecosystem, and all approaches perform unsatisfactorily in at least one area. Sec. 6 p. 11: exact sentence in Sec. 6 below (uses "demands", qualified by "on a fully decentralized blockchain"). Sec. 7 pp. 12 to 13 (sentence spans the page break): no current approach can meet all requirements that a fully decentralized blockchain places on a mitigation scheme (this is the only place the word "requirements" is used for it). The "requirements" are the seven measures of Sec. 4 (p. 5). Nuance: "all requirements" refers to a fully decentralized blockchain; the paper also states at least one approach excels in every individual measure (Fig. 11 caption, p. 12).

## 6. One quote (optional, max one sentence)
> "We conclude that, currently, no approach meets all the demands placed on a scheme to prevent transaction reordering manipulation attacks on a fully decentralized blockchain (cf. Figure 11)." (p. 11, Sec. 6)
