# 30: Execution welfare across solver-based DEXes

## 1. Verified citation (IEEE style)
Y. Yuminaga, D. Chen, and D. Sui, "Execution welfare across solver-based DEXes," arXiv:2503.00738v3 [cs.CE], May 2025. doi: 10.48550/arXiv.2503.00738.
- Checked against: PDF page 1 (title, the three authors with affiliations Tenbin Labs, Semantic Layer, Flashbots; dated "May 8, 2025"; margin stamp "arXiv:2503.00738v3 [cs.CE] 6 May 2025") and https://arxiv.org/abs/2503.00738 (same title and authors; v1 2 Mar 2025, v2 14 Mar 2025, v3 6 May 2025; DOI 10.48550/arXiv.2503.00738; no journal-ref, no comments field).
- Version read: arXiv v3, 6 May 2025 (title page itself says May 8, 2025). Published version: none found.
- Differences between what I read and the published version: no published version found. Minor internal date mismatch: arXiv stamp 6 May 2025 versus title-page date May 8, 2025.
- Fields NOT verified: DBLP (dblp.org search and API both returned an Anubis "Access Denied" bot page). A web search for the exact title returned only arXiv copies and summary sites, no venue.
- Peer review status: preprint only.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Empirical study of CoWSwap, 1inchFusion and UniswapX trades on Ethereum mainnet, blocks 18000000 to 19164987, August 26, 2023 to February 5, 2024, pairs USDC-WETH and PEPE-WETH. | p. 5 (Sec. 3.1); p. 2 (Sec. 1.1) |
| 2 | Metric "execution welfare" = (solver output minus simulated single-pool Uniswap V2 or V3 output after gas) / that AMM output, using top-of-block simulation; the authors equate it with price improvement. | p. 6 (Sec. 3.2, Eq. 1) |
| 3 | USDC-WETH: welfare versus V2 is consistently positive on all venues; versus V3 it is "marginally negative or close to zero"; only CoWSwap consistently improves over V3. | p. 8 to 9 (Sec. 4.1, Fig. 3) |
| 4 | Trade size: for USDC-WETH, trades over 100 ETH show welfare versus V2 of 100 bps and higher; CoWSwap reaches above 500 bps versus V2 and, at large sizes, over 20 bps versus V3 with some near 150 bps; 1inchFusion about 5 to 10 bps versus V3 for larger trades; UniswapX about 0 to 10 bps versus V3. | p. 10 (Sec. 4.2, Fig. 5) |
| 5 | Binance markout is negative across venues; it narrows from below -1000 bps to about -10 to -5 bps as trade size rises from 0 ETH to 100 ETH. | p. 10 (Sec. 4.2) |
| 6 | PEPE-WETH: versus V3, all CoWSwap trades show significantly positive welfare, trades under 1 ETH exceeding 500 bps; the authors attribute CoWSwap's large-trade gain versus V2 to its batch auction and diverse liquidity. | p. 11 to 12 (Sec. 4.2, Fig. 6) |
| 7 | Solver market concentration: CoWSwap top solver (Wintermute) 25% share, next five about 10% each; 1inchFusion top three 80%; UniswapX two solvers over 90%. Average daily volume about $200 million (CoWSwap), $60 million (1inchFusion), $30 million (UniswapX). | p. 4 (Sec. 2, Fig. 2) |
| 8 | Correlation of realized volatility with welfare is near zero (0.0267 to 0.0764 across venues, Table 1). | p. 14 (Sec. 4.4, Table 1) |
| 9 | MEV is explicitly NOT measured: top-of-block snapshots do not capture intra-block changes such as MEV activity; batch auction delay (CoWSwap waiting for orders) is also not captured. | p. 15 to 16 (Sec. 6) |
| 10 | Second-hand only: cites a master's thesis [21] that found Coincidence of Wants on CoWSwap "negligible, offering limited benefits" for MEV mitigation. | p. 4 (Sec. 2), ref. [21] p. 18 |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | M5 | background | Shows batch/solver DEXs (CoWSwap) run in production at scale. |
| 2 | M5 | background | Defines price improvement versus an AMM, not versus a continuous book. |
| 3 | M5 | analogous | CoWSwap (batch auction) gives the most consistent improvement, but the baseline is an AMM pool. |
| 4 | M5 | analogous | Measured outcome numbers for a batch venue; size dependent. |
| 5 | background | background | On-chain execution worse than CEX mid, mostly gas for small trades. |
| 6 | M5 | analogous | Authors credit batch auction for large-trade gains (argued, not isolated). |
| 7 | M5, C6 | analogous | Batch/solver designs move ordering power to a concentrated set of solvers, a trust cost of M5. |
| 8 | background | background | Not relevant to ordering attacks. |
| 9 | M5 | direct (as a negative) | The paper does not measure MEV or sandwich exposure, so it cannot back an "M5 reduces MEV" claim. |
| 10 | M5 | analogous | Weak hint that the batch's CoW matching rarely occurs; second-hand, non peer-reviewed thesis. |

## 4. Limits for an on-chain order book
- Baseline is a single Uniswap V2 or V3 pool (p. 7, Sec. 3.2.3; p. 16), not a limit order book; no comparison to a continuous on-chain book.
- Solvers route to off-chain PMM inventory (p. 2; p. 12 to 13, Sec. 4.3); our book has no off-chain liquidity.
- Ethereum L1 mainnet only, Aug 2023 to Feb 2024 (p. 5), two pairs only (p. 15).
- Only filled orders landed on-chain are included (selection bias, p. 16).
- Gas-cost assumptions can change the comparison "dramatically" by the authors' own statement (p. 16).
- Solver token incentives (16 million $COW, 10 million $1INCH annually) subsidise results (p. 16).

## 5. Gap question answered
- Question(s): d.
- Answer from this source: It measures price improvement ("execution welfare") of three solver DEXs including CoWSwap against simulated single-pool AMM swaps (p. 6, p. 8 to 12). CoWSwap shows the most consistent improvement (p. 9, p. 10). It does NOT measure MEV or sandwich exposure, and lists MEV activity as outside its top-of-block method (p. 15 to 16); the only MEV statement is a citation to a thesis finding CoWs negligible (p. 4). Batch delay cost is not measured (p. 16).
- Strength: weak to moderate. Preprint only (no peer-reviewed version found); measured, but the measured quantity is price improvement versus an AMM, not MEV reduction, and the venue type is solver/intent auction, not an on-chain order book. Usable for "batch/solver DEXs exist in production and report price improvement", not for "batch auctions measurably reduce MEV".

## 6. One quote (optional, max one sentence)
> "Results show only CoWSwap consistently improves user welfare over V3 pools." (p. 9, Sec. 4.1)
