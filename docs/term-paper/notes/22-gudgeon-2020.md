# 22: SoK: Layer-Two Blockchain Protocols

## 1. Verified citation (IEEE style)
L. Gudgeon, P. Moreno-Sanchez, S. Roos, P. McCorry, and A. Gervais, "SoK: Layer-two blockchain protocols," in *Financial Cryptography and Data Security (FC 2020)* (Lecture Notes in Computer Science, vol. 12059), J. Bonneau and N. Heninger, Eds. Springer, 2020, pp. 201 to 226, doi: 10.1007/978-3-030-51280-4_12.

- Checked against: PDF page 1 (title "SoK: Layer-Two Blockchain Protocols", authors Lewis Gudgeon, Pedro Moreno-Sanchez, Stefanie Roos, Patrick McCorry, Arthur Gervais; affiliations Imperial College London, TU Wien, TU Delft, PISA Research, Lucerne UAS, Liquidity Network; no venue, date, or Springer header on the page).
- Crossref DOI record https://api.crossref.org/works/10.1007/978-3-030-51280-4_12 (same title and five authors; "Lecture Notes in Computer Science; Financial Cryptography and Data Security"; pages 201 to 226; 2020; event FC 2020, Kota Kinabalu, Malaysia, 10 to 14 Feb 2020). No volume field in Crossref.
- TU Delft research portal https://research.tudelft.nl/en/publications/sok-layer-two-blockchain-protocols/ (FC 2020 Revised Selected Papers, eds. Bonneau and Heninger, LNCS vol. 12059, pp. 201 to 226, same DOI).
- DBLP: NOT checked (dblp.org returned an Anubis "Access Denied" page; API HTTP 429). UCL Discovery record pages (discovery.ucl.ac.uk/id/eprint/10182335 and the discovery-pp staging page) returned HTTP 403, so the repository's version statement could not be read.
- Version read: UCL Discovery file "2019-360.pdf" (filename matches IACR ePrint 2019/360), 44 PDF pages: main text pp. 1 to 20 (Sec. 1 to 9), references pp. 21 to 29, Appendices A to G pp. 29 to 44. Embedded PDF creation date 2020-01-25 (file metadata, not printed on any page). Published version: FC 2020, LNCS 12059, pp. 201 to 226.
- Is it the FC version? Not confirmed, and probably not the typeset chapter: no LNCS header or page numbers, and 44 pages vs 26 pages (201 to 226). It looks like the full/extended preprint, dated just before FC 2020 (Feb 2020). Title and authors match the FC record.
- Differences between what I read and the published version: title and authors same; length differs (appendices A to G may be shortened or absent in the chapter, not checked); text not compared.
- Fields NOT verified: DBLP record; UCL version statement; LNCS volume 12059 and editors rest on the TU Delft page, not Crossref.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Permissionless layer one is limited to about ten transactions per second, versus thousands for custodial payment systems. | p. 1 (Sec. 1) |
| 2 | Layer two = authenticated off-chain messages tethered to a layer-one chain, which is used only for disputes; security relies on the parent chain's consensus. Side-chains are excluded because they have their own consensus. | p. 4 (Sec. 2, Def. 1) |
| 3 | Three classes: channels (n equal parties, unanimous updates), commit-chains (one operator, trusted for availability, untrusted for funds), and refereed delegation (Truebit, Arbitrum bisection). | p. 4 (Sec. 2); p. 11 (Sec. 4.1); pp. 13 to 14 (Sec. 5) |
| 4 | Channels need parties online to dispute old states; watching services take this role and are kept honest with collateral; incentives for watching services remain open. | pp. 6 to 7 (Sec. 3.2, 3.3); pp. 10 to 11 (Sec. 3.8) |
| 5 | Commit-chain operators can censor transactions; users rely on exit, data availability, and eventual (not instant) finality. | pp. 11 to 12 (Sec. 4.1) |
| 6 | Table 1 compares channel, channel hub, and commit-chain on topology, finality, collateral and on-boarding. | p. 13 (Table 1) |
| 7 | Layer-two transactions are not private by default; not publishing on a public chain is not enough for privacy. | p. 18 (Sec. 7.3); p. 20 (Sec. 9) |
| 8 | Security threats: hot wallets, online assumption, congestion and mass exits (fees "from several cents to $50" under congestion), and attacks on synchronizing protocols (wormhole, American call option). | p. 19 (Sec. 8.2); pp. 40 to 41 (App. E) |
| 9 | Trade-off between collateral and finality; costs shift from transaction size to transaction value; ZKP verification approx. 650k gas per proof. | p. 19 (Sec. 8.1); p. 20 (Sec. 9) |
| 10 | Rollups appear only as "compression-chains" in open challenges, which "might not be considered layer-two"; their analysis is missing. No discussion of front-running, transaction ordering, or exchanges found in the text. | p. 42 (App. F); "front" not found in text search |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | Security vs Privacy vs Scalability | background | Motivates why bounded on-chain work (MAX_MATCHES_PER_TX, MAX_INSERT_SCAN) matters on layer one. |
| 2 | M11, background | background | Defines what moving the book off chain or to layer two means for trust. |
| 3 | M11, background | background | Taxonomy to place a rollup-hosted or operator-run book. |
| 4 | C6, M9 | analogous | Watchtowers are the layer-two analogue of keepers: someone must act on time, and their incentives are an open problem. |
| 5 | M11, C1 | analogous | A single operator can censor or order transactions, shifting ordering power rather than removing it. |
| 6 | background | background | Reference table only. |
| 7 | Security vs Privacy vs Scalability | analogous | Supports the thesis point that scaling does not by itself give privacy. |
| 8 | C6, Security vs Privacy vs Scalability | analogous | Congestion can stop time-critical actions (disputes there, keeper calls or cancels here). |
| 9 | Security vs Privacy vs Scalability | background | Scaling trades security assumptions (collateral, finality) for throughput. |
| 10 | M11 | background | Shows this SoK predates rollup analysis; use 23/24 for rollup ordering. |

## 4. Limits for an on-chain order book
- Focus is payments and channels; exchanges and order matching are not analysed.
- No treatment of transaction ordering, front-running or MEV (text search for "front" found nothing).
- Predates widespread rollups (2019/2020); rollups only mentioned as compression-chains (p. 42).
- Security notions are about balance security, not economic attacks on application logic.
- Copy read may not be the FC chapter text (see Sec. 1).

## 5. Claim check
- Summary given: "systematises layer-two protocols."
- Verdict: supported
- Evidence: Abstract p. 1: systematizes layer-two protocols "from the inception of cryptocurrencies in 2009 until today", grouped into payment and state channels, commit-chains and refereed delegation, with synchronization, routing, privacy and security; Sec. 9 p. 20 repeats this. Note that rollups are not part of the systematization (p. 42, App. F).

## 6. One quote (optional, max one sentence)
> "Our discussion highlights clearly that not publishing transactions on a public blockchain is not sufficient for solving the privacy issues experienced in blockchain systems." (p. 20)
