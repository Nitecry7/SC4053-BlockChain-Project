# 21: Credible Decentralized Exchange Design via Verifiable Sequencing Rules

## 1. Verified citation (IEEE style)
M. V. X. Ferreira and D. C. Parkes, "Credible decentralized exchange design via verifiable sequencing rules," in *Proc. 55th Annu. ACM Symp. Theory of Computing (STOC '23)*, Orlando, FL, USA, 2023, pp. 723 to 736, doi: 10.1145/3564246.3585233.

- Checked against: PDF page 1 (title "Credible Decentralized Exchange Design via Verifiable Sequencing Rules", authors Matheus V. X. Ferreira and David C. Parkes, Harvard University, dated "April 19, 2023", stamp "arXiv:2209.15569v2 [cs.GT] 17 Apr 2023").
- Crossref DOI record https://api.crossref.org/works/10.1145/3564246.3585233 (same title; authors Matheus Venturyne Xavier Ferreira, David C. Parkes; "Proceedings of the 55th Annual ACM Symposium on Theory of Computing"; pages 723 to 736; published 2023-06-02; event STOC '23, Orlando, FL, USA).
- Web search summary of the Harvard publications page and EconPapers gave the same pages (723 to 736); not fetched directly.
- DBLP: NOT checked. https://dblp.org/rec/conf/stoc/FerreiraP23.bib and the uni-trier mirror returned an Anubis "Access Denied" page. ACM DL not opened.
- Version read: arXiv v2 (17 Apr 2023), 34 PDF pages. Published version: STOC 2023, pp. 723 to 736, DOI 10.1145/3564246.3585233.
- Differences between what I read and the published version: title and authors match (task line abbreviated "DEX"; full title says "Decentralized Exchange"). Length differs (34 pages vs 14 proceedings pages); content of the STOC version not compared.
- Fields NOT verified: DBLP record (blocked); content equivalence with the STOC text.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Setting is a two-token liquidity pool (AMM, e.g. Uniswap constant product); miners (equivalently PoS block proposers) pick block content and execution order and can sandwich users for risk-free profit; Flashbots "institutionalizes" this. | p. 1 (Abstract); pp. 2 to 3 (Sec. 1, fn. 1) |
| 2 | A sequencing rule maps (initial state X0, block B) to a set of allowed orderings; it must be efficient and verifiable in polynomial time, so anyone can prove non-compliance using only on-chain data. | p. 4 (Sec. 1); pp. 13 to 15 (Sec. 3, Def. 3.1 to 3.4) |
| 3 | Thm 4.1 (folklore): with free ordering, a user's buy with limit price p is executed so they pay exactly q*p, and the miner gets q*p - Y(X, Buy(q)) for free; limit prices only cap the loss at the limit. | p. 4 (Sec. 1); p. 16 (Sec. 4, Thm 4.1) |
| 4 | Thm 4.2 (impossibility): for a product-potential pool and ANY sequencing rule, there is an initial state and a block with three user transactions where the miner gains a strictly positive amount of token 2 and pays nothing. Generalizes to pools with price impact. | p. 1 (Abstract); p. 17 (Sec. 4.1, Thm 4.2); p. 18 (proof) |
| 5 | The impossibility covers deterministic sequencing rules only; randomized rules are an open question. | p. 25 (Sec. 6) |
| 6 | Greedy Sequencing Rule: while both buys and sells remain, next order must be a buy if token-1 reserves are at or above X0, else a sell; after one side runs out, any order. Works without knowing who owns which order. | p. 5 (Sec. 1.1); p. 20 (Sec. 5, Alg. 3, Thm 5.1 Duality) |
| 7 | Thm 5.2: for each user order, either the user gets a price at least as good as executing alone at X0 (isolation), or the miner does not gain from including it (indifference). | p. 22 (Sec. 5.1, Thm 5.2); pp. 24 to 25 (Sec. 6) |
| 8 | With one user transaction in a block the miner cannot get risk-free profit under the rule; the two-transaction case is open; the miner can still profit with three or more users without breaking Thm 5.2. | p. 6 (Sec. 1.1, fn. 5); p. 23 (Fig. 4) |
| 9 | Assumes myopic miners: X0 is taken as not manipulable, since a different miner builds each block. | p. 5 (Sec. 1.1, fn. 4) |
| 10 | Authors contrast AMMs with order books (order book storage grows with pending orders, needs matching, orders wait) and note on-chain batch auctions add latency and computation; strict FIFO is not verifiable because nodes see transactions in different orders. | p. 2 (Sec. 1); p. 3 (Sec. 1); p. 7 (Sec. 1.2) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | C1, M11, background | analogous | Same root cause (block producer controls order), but on an AMM, not a book. |
| 2 | M11 | analogous | A verifiable sequencing rule is a form of chain-level ordering protection that needs builder/relay cooperation. |
| 3 | C1, M12 | analogous | Mirrors C1: the attacker extracts up to the victim's limit, so a limit price caps loss but becomes the execution price; supports frontend guards on limit width (M12). |
| 4 | M11, Security vs Privacy vs Scalability | analogous | No ordering rule removes all producer profit, so M11 alone cannot close ordering attacks. |
| 5 | M11 | background | Scope condition for citing the impossibility. |
| 6 | M11, M8 | analogous | A deterministic, checkable ordering constraint; the book analogue is the contract's own price-time rule. |
| 7 | M2, M3 | analogous | Same goal as M2/M3: never let a user execute worse than the price available when they arrived. |
| 8 | C1, C3 | analogous | Profit remains when several user orders share a block, like dust plus victim orders in C1/C3. |
| 9 | C2 | analogous | Benchmark price is assumed safe; C2 shows a manipulable reference (lastTradePrice) breaks such guarantees, supporting M6. |
| 10 | M5, M8, Security vs Privacy vs Scalability | background | Gives the AMM-side argument for why order books are costly on chain and batch auctions add latency. |

## 4. Limits for an on-chain order book
- AMM-specific: results are for two-token liquidity pools with a potential function; there are no resting orders, price levels, partial fills or stop orders.
- The ordering is enforced at block-building level (miner/relay), not by the exchange contract; our contract cannot impose it (M11 only).
- Assumes myopic, single-block miners (p. 5, fn. 4); multi-block manipulation is outside the model.
- Impossibility holds only for deterministic rules (p. 25) and is shown with the product potential (p. 17).
- No fees in the positive result and no empirical or gas evaluation.

## 5. Claim check
- Summary given: "verifiable sequencing rules; an impossibility result leaves some producer profit."
- Verdict: supported (wording caveats)
- Evidence:
  - "verifiable sequencing rules": holds. Abstract p. 1 and Def. 3.4 p. 15; verifier Alg. 4, p. 24.
  - "an impossibility result leaves some producer profit": holds. Thm 4.2 (p. 17): "for any sequencing rule, there is an initial state X0 and a block B, containing miner transactions and a set of three user transactions, such that the miner receives a strictly positive quantity of token 2 and pays nothing". Abstract p. 1 calls it "non-zero risk-free profits".
  - Wording caveats: the paper says "miner" (p. 2, fn. 1 equates it with a PoS block proposer), not "producer". The profit is "risk-free" and shown only in some instances (three user transactions, product potential), not in every block. It applies to deterministic rules only (p. 25). It is about AMMs, not order books.

## 6. One quote (optional, max one sentence)
> "Our first result is an impossibility theorem: for any sequencing rule, there is an instance of user transactions where the miner can obtain non-zero risk-free profits." (p. 1)
