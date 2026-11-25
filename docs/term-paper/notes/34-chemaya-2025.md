# 34: The Power of Default (slippage tolerance defaults on Uniswap and Sushiswap)

## 1. Verified citation (IEEE style)
N. Chemaya, D. Liu, R. McLaughlin, N. Ruaro, C. Kruegel, and G. Vigna, "The power of default: Measuring the effect of slippage tolerance in decentralized exchanges," in Financial Cryptography and Data Security (FC 2024, Revised Selected Papers, Part I), J. Clark and E. Shi, Eds., Lecture Notes in Computer Science. Cham, Switzerland: Springer Nature Switzerland, 2025, pp. 192-208, doi: 10.1007/978-3-031-78676-1_11.
- Checked against: PDF page 1 of the authors' copy (title "The Power of Default: Measuring the Effect of Slippage Tolerance in Decentralized Exchanges", authors Nir Chemaya and Dingyue Liu (Department of Economics, UC Santa Barbara), Robert McLaughlin, Nicola Ruaro, Christopher Kruegel, Giovanni Vigna (Department of Computer Science, UC Santa Barbara); no venue, date or copyright stamp on the page). Crossref chapter record https://api.crossref.org/works/10.1007/978-3-031-78676-1_11 (same title and same six authors in the same order, type book-chapter, container "Lecture Notes in Computer Science" / "Financial Cryptography and Data Security", publisher Springer Nature Switzerland, Cham, pages 192-208, published-print 2025, first online 22 February 2025; assertions: conference FC, number 28, Willemstad, Curacao, 2024). Crossref book record https://api.crossref.org/works/10.1007/978-3-031-78676-1 (subtitle "28th International Conference, FC 2024, Willemstad, Curacao, March 4 to 8, 2024, Revised Selected Papers, Part I"; editors Jeremy Clark and Elaine Shi; ISBN 9783031786754 print, 9783031786761 electronic).
- Authors' page https://seclab.cs.ucsb.edu/publications/mclaughlin2024slippage/ (opened): same title and authors, venue "Financial Cryptography and Data Security, March 2024", BibTeX key mclaughlin2024slippage with year 2024 (conference year, not proceedings year); author list there has a stray comma ("Nicola, Ruaro"). The "Download paper" link on that page is the copy read.
- Version read: authors' self-hosted PDF https://seclab.cs.ucsb.edu/files/publications/mclaughlin2024slippage.pdf, 22 PDF pages (body and references p. 1 to 17, appendix p. 18 to 21, p. 22 is a stray fragment of three reference lines); PDF metadata creation date 15 May 2024, pdfTeX. PDF page numbers equal the printed page numbers in this copy. Published version: LNCS chapter, pp. 192-208, DOI 10.1007/978-3-031-78676-1_11.
- Differences between what I read and the published version: published page range 192-208 is 17 pages, matching the body plus references (p. 1 to 17) of this copy; whether the appendix (p. 18 to 21) is in the published chapter is not checked. Title capitalisation in Crossref is the same apart from non-breaking spaces. Body text of the Springer chapter not read (Springer page not opened).
- Fields NOT verified: LNCS volume number (Crossref gives none; not found on any page I opened). Conference dates: Crossref book subtitle says March 4 to 8, 2024 while the Crossref chapter assertions say 5 to 9 March 2024; I do not cite dates. DBLP not checked.
- Peer review status: peer-reviewed (FC 2024 main conference proceedings, "Revised Selected Papers, Part I", per the Crossref book record). The copy read is the authors' pre-publication version.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| F1 | Data: own geth archive node with 500 peers, 1 to 31 March 2023, 33,108,538 transactions; slippage tolerance is not in the transaction, so it is inferred from the mempool arrival time plus the pool state at that moment; inferred for 1,187,141 Uniswap and 19,111 Sushiswap router swaps (single-pool swaps only). | p. 2 (Sec. 1); p. 6 (Sec. 3.2, Eq. 5); p. 7 to 8 (Sec. 4.1 to 4.3) |
| F2 | Default effect: 24% of Uniswap router swaps (before 16 March) and 67% of Sushiswap router swaps use the 0.5% default; users also cluster on round numbers (10%, 5%). | p. 2 to 3 (Sec. 1); p. 9 to 10 (Sec. 4.4, Table 1) |
| F3 | Uniswap's new "auto" default (from 16 March 2023, soft launch to 20 March) is the user's gas cost in USD divided by trade size in USD, clamped to [0.1%, 5%]; after 21 March only 4.7% of Uniswap swaps still use 0.5% and use of 0.1% rises about six-fold to 11%. Sushiswap kept a static 0.5% default and is used as the control. | p. 2 (Sec. 1); p. 10 (Sec. 4.4); p. 11 (Sec. 4.5) |
| F4 | Sandwich detection (same block, same pool, opposite directions, same wallet or matching amounts, victim in between, multi-victim allowed) finds 36,158 attacks in the filtered set; Uniswap attacks per day fall to 38.09% of the pre-change rate, Sushiswap to 75.66%. Total March loss $16,584,438; mean loss per attacked swap $458.7, median $69.6. | p. 11 to 12 (Sec. 4.6, Table 2, Table 3); p. 18 to 19 (App. A.1) |
| F5 | Loss per $100 swapped (Table 5): Uniswap all users 0.0371 to 0.0168 (54.7% decrease), Uniswap defaulters 0.1366 to 0.0137 (90.0%); Sushiswap all 0.0816 to 0.0706 (13.5%), Sushiswap defaulters 0.1369 to 0.1302 (4.9%). | p. 13 to 14 (Sec. 4.8, Table 5) |
| F6 | Before the change, default (0.5%) users on both DEXs lost about 0.13% of trade value, several times the average user (0.037% Uniswap, 0.081% Sushiswap); the authors read this as attackers targeting 0.5% default users. | p. 14 (Sec. 4.8) |
| F7 | Cost of tighter limits is small: 8,705 swaps failed because the slippage limit triggered, costing $79,456.8 in gas over the month; sandwich losses are 200 to 300 times larger than this gas loss. | p. 13 (Sec. 4.7, Table 4) |
| F8 | 81.0% of successful Uniswap swaps realised zero slippage, so the authors suggest defaults below the 0.1% floor may be safe; they still see residual sandwich losses for default users. | p. 14 to 15 (Sec. 4.9, Fig. 4) |
| F9 | Method limits stated by the authors: no separation of bots and humans; welfare sample restricted to top-1,000-token pools active every day of March (about 2.25 million swaps, 824 pools); defaulter label after the change is "within 20% of our estimated default"; defaulters classified for only 20,477 Uniswap and 7,919 Sushiswap transactions. | p. 9 (Sec. 4.4); p. 10 (Sec. 4.4); p. 11 (Sec. 4.5); p. 14 (Sec. 4.8, fn. 9) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| F2 | M12 | direct | Most users keep whatever bound the frontend proposes, so a frontend default is a real control lever, not cosmetic. Behavioural result, independent of AMM vs order book. |
| F3 | M12 | analogous | Concrete design for a dynamic default: tie the allowed slack to how much an attacker could profit after gas (gas / trade size). For us the analogue is a frontend that proposes a limit price close to the best opposite quote, scaled by order size, instead of a fixed generous margin. |
| F5 | M12, C1 | analogous | Measured evidence that shrinking the user's price bound cuts sandwich losses (54.7% overall, 90% for defaulters). Our E1 shows the same direction by construction on our book: C1 loss is linear in limit-price slack (0.015 / 0.15 / 0.75 / 5.0 quote at 0.1% / 1% / 5% / 33%). The paper supplies the real-world magnitude; E1 supplies the mechanism on our contract. |
| F6 | C1 | analogous | Attackers concentrate on users with a predictable, loose bound. In C1 the victim's resting buy at a generous limit is the same kind of target: the slack is visible on chain once the order rests. |
| F7 | M12 | analogous | Supports the trade-off argument that tighter bounds cost little. Transfer is partial: on an AMM a tight bound means a reverted swap and lost gas; on our book a tight limit means the remainder rests unfilled (no revert), so the cost is delay or non-execution, not gas. |
| F8 | M12 | analogous | Suggests real price movement within a block is usually zero, so very tight default limits are realistic. |
| F4 | C1, background | background | Sandwich definition and detection rules for AMMs; useful vocabulary, not our attack path. |
| F9 | none | n/a | Caveats to quote alongside F5. |

## 4. Limits for an on-chain order book
- AMM only (Uniswap V2/V3 and Sushiswap, CPMM model, p. 5 to 6 Sec. 3). In an AMM the attacker moves the pool price with its own swap; in our book the attacker cannot move a price curve, it trades against the victim's resting limit (C1). The shared quantity is the user's price bound; the attack mechanics differ.
- The Uniswap auto formula (gas / trade size) is calibrated to AMM sandwich economics; it is not shown to be the right rule for a limit order book. Any transfer to our frontend (M12) is our proposal, not the paper's result.
- Effect estimate is a before/after comparison with Sushiswap as a control over one month (March 2023), with weighted means and 95% confidence intervals for the attack-loss series (p. 12 to 13, Fig. 3); there is no formal difference-in-differences model and no bot/human split (p. 9).
- Internal inconsistencies: the text says Sushiswap's overall reduction is "only 4.9%" (p. 13) but Table 5 gives 13.5% for all Sushiswap users and 4.9% for Sushiswap defaulters (p. 14); Table 2 uses periods 16 to 19 March and 20 to 31 March while the text uses 16 to 20 and 21 to 31 (p. 11 to 12). Quote Table 5 numbers, not the sentence.
- Ethereum L1 with a public mempool; no discussion of order books, fill caps, stop orders, or bounded matching loops (not found in the file).

## 5. Claim check
- Summary given: "Measured effect of safer default slippage tolerances on Uniswap and Sushiswap, reporting a 54.7% reduction in trader losses for a dynamic Uniswap default in their evaluation."
- Verdict: supported, with wording caveats
- Evidence:
  - 54.7%: holds. Table 5 gives Uniswap all-user loss per $100 swapped falling from 0.0371 to 0.0168, a 54.7% decrease (p. 14); the same figure is in the abstract (p. 1), contributions (p. 3) and Sec. 4.8 (p. 13). The arithmetic checks: (0.0371 - 0.0168) / 0.0371 = 0.547.
  - "Dynamic Uniswap default": holds. The change replaced the static 0.5% with a per-trade value from gas cost and trade size, bounded to 0.1% to 5% (p. 2; p. 10).
  - "Trader losses": holds in the paper's definition, which combines sandwich losses and gas lost on slippage-triggered failures, normalised per $100 swapped (p. 10 Sec. 4.5; p. 13 Sec. 4.8). It is a loss rate, not an absolute dollar total.
  - "Safer default slippage tolerances on Uniswap and Sushiswap": slightly loose. Only Uniswap changed its default; Sushiswap is the unchanged control (p. 11). It is a measurement of one natural experiment in March 2023, not a test of several safer defaults.

## 6. One quote (optional, max one sentence)
> "This implies that attackers may target these 0.5% default users regardless of which protocol they are using." (p. 14, Sec. 4.8)
