# 28: SPEEDEX, a batch-clearing decentralized exchange

## 1. Verified citation (IEEE style)
G. Ramseyer, A. Goel, and D. Mazières, "SPEEDEX: A scalable, parallelizable, and economically efficient decentralized EXchange," in Proc. 20th USENIX Symp. Networked Systems Design and Implementation (NSDI 23), Boston, MA, USA, Apr. 2023, pp. 849 to 875.
- Checked against: PDF page 1 (title "SPEEDEX: A Scalable, Parallelizable, and Economically Efficient Decentralized EXchange", three authors, all Stanford University, stamp "arXiv:2111.02719v6 [cs.DC] 2 Mar 2023"); https://arxiv.org/abs/2111.02719 (v1 4 Nov 2021 to v6 2 Mar 2023, "27 pages, 10 figures", no journal-ref); https://www.usenix.org/conference/nsdi23/presentation/ramseyer (NSDI 23, Boston, April 2023, pp. 849 to 875, ISBN 978-1-939133-33-5, USENIX Association).
- Version read: arXiv v6, 2 Mar 2023 (27 PDF pages, includes appendices A to L). Published version: NSDI 23, pp. 849 to 875 (27 pages), no DOI on the USENIX page.
- Peer review status: peer-reviewed (USENIX NSDI 2023).
- Differences between what I read and the published version: none found in title, authors, year; page count of the published range (27) equals the arXiv PDF length, but the text itself was not compared. Acknowledgements (p. 13) thank "our shepherd", consistent with a camera-ready version. DBLP blocked (bot-protection page).
- Fields NOT verified: DOI (none shown); text identity with the USENIX PDF.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | SPEEDEX processes all limit orders in a block as one batch at a single set of asset valuations (Arrow-Debreu exchange market); every sale of A for B clears at pA/pB, so transactions in a block commute and no ordering is imposed inside a block. | p. 2 (Sec. 1.1); p. 4 (Sec. 2, 2.1) |
| 2 | Front-running claim is limited: it removes "risk-free" front-running (buy then resell to the victim in the same block) because back-to-back buy and sell offers see the same price and cancel. It explicitly does not stop delaying a victim to a later block, or estimating the next batch price from the public mempool; the authors suggest combining with commit and reveal. | p. 5 (Sec. 2.2); p. 11 (Sec. 8, "Other Types of Front-Running") |
| 3 | Commit and reveal interaction: the evaluated overdraft-prevention design "is incompatible with cryptographic commit-reveal schemes"; a deterministic per-account filtering alternative is proposed and measured at 0.13 s (24 threads) and 0.07 s (48 threads) for 500,000-transaction batches. | p. 11 (Sec. 8); p. 25 to 26 (App. I) |
| 4 | Data structures: per asset pair, a Merkle-Patricia trie (fan-out 16, BLAKE2b) of offers keyed with the limit price as the leading 6 bytes of a 22-byte key, so insertion sorts by price; executed offers form dense subtries that are cheap to remove; account balances in a red-black tree in memory, pushed to a trie once per block. | p. 6 (Sec. 5.1); p. 12 (Sec. 9.3); p. 26 to 27 (App. K.1, K.5) |
| 5 | Price computation: each Tatonnement demand query is a set of binary searches, O(#assets^2 * lg(#offers)); a follow-up linear program of size O(#assets^2) corrects approximation error; ties broken by account ID and offer ID; at most one offer per pair fills partially. LP runtime "increases dramatically beyond 60-80 assets". | p. 3 (Sec. 1.2); p. 6 (Sec. 4.2, 5.1); p. 11 (Sec. 8, LP scalability) |
| 6 | Throughput (measured, 4 replicas, 48-core AWS r6id.24xlarge, HotStuff, 50 assets, 10 million accounts, ~500,000-transaction blocks): over 200,000 transactions per second with tens of millions of open offers; throughput falls only about 10% as open offers go from 0 to tens of millions; speedups 6 to 12 threads ~1.9x, 12 to 24 ~1.8x, 24 to 48 ~1.4x. | p. 1 (Abstract); p. 8 to 9 (Sec. 7) |
| 7 | Baselines: a bare-bones two-asset sequential order book on the same data structures runs ~1.7 million tx/s with 100 accounts but ~210,000 tx/s with 10 million accounts; Geth 1.10 on UniswapV2 transactions ~3000 tx/s; Stellar's order book DEX ~4000 trades/s; Loopring claims ~2000/s. | p. 9 to 10 (Sec. 7.1) |
| 8 | Not an EVM contract: SPEEDEX is a module inside blockchain node software ("best implemented directly within blockchain node software (instead of as a smart contract)"); prototyped in a HotStuff chain and in Stellar, not yet merged. | p. 1 (Abstract); p. 3 (Sec. 1.2) |
| 9 | Spam and fairness design notes: asset quantities are integer multiples of a minimum unit (partial fills risk one unit of rounding); trades round in favour of the auctioneer; transaction fee charged only "to prevent spam"; only sell offers supported (buy offers make pricing PPAD-hard). | p. 5 (Sec. 4.1); p. 4 (Sec. 2.1); p. 12 (Sec. 9.1); p. 11 (Sec. 8, Limited Trade Types) |
| 10 | Related work notes a Solana outage partly caused by many transactions conflicting on one order book contract; CoWSwap clears batches of at most 100 offers. | p. 13 (Sec. 10) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | M5 | analogous | Concrete batch design: one price per batch makes order inside a block irrelevant, the property M5 relies on. |
| 2 | M5, M4, C1, M11 | analogous | Shows M5 alone leaves delay and price-estimation attacks; supports pairing M5 with M4 or M11. C1-style sandwich inside one batch is the class removed. |
| 3 | M4, Security vs Privacy vs Scalability | analogous | Design choices for scalability (proposer checks balances) conflict with privacy (commit and reveal); a tension like our thesis. |
| 4 | M8, C4 | analogous | Price-keyed sorted trie avoids linear insertion scans; contrasts with our MAX_INSERT_SCAN linked list that enables C4. Off-chain node memory, not EVM storage. |
| 5 | M8, M5 | analogous | Shows batch clearing cost scales with assets and log of offers, not linearly with orders. |
| 6 | Security vs Privacy vs Scalability, background | background | Throughput numbers are for native node code on large servers, not gas-metered contract execution. |
| 7 | background | background | Sequential order books are serial by nature; native baseline numbers only. |
| 8 | none (limit) | n/a | Key caveat for any transfer to our Solidity contract. |
| 9 | M1, C4 | analogous | Minimum unit and anti-spam fee as design notes, but no minimum order size rule like M1. |
| 10 | C4, background | background | Contention on a single order book contract cited as a real outage cause (Solana), via a secondary reference. |

## 4. Limits for an on-chain order book
- Not an EVM smart contract and not gas-metered: runs as native C++ inside every replica, with multi-core parallelism our contract cannot use.
- Throughput measured on a custom HotStuff chain with 4 replicas (10 in App. L), no Byzantine replicas or rotating leader (p. 8).
- Workload is synthetic (geometric Brownian motion valuations) or derived from CoinGecko price/volume history (p. 7 to 8); no real attack measured.
- Front-running resistance is argued from the mechanism (same price for all), not measured; delay and mempool-estimation attacks remain (p. 11).
- Only sell offers; no stop orders; no fill cap or keeper concept.

## 5. Gap question answered
- Question(s): d, f.
- Answer from this source: d: a batch exchange design (not in production: "prototyped but not yet merged within the Stellar blockchain", p. 1) that removes same-block buy-then-resell front-running by clearing all trades at one price (p. 5 Sec. 2.2), with stated residual attacks (p. 11 Sec. 8). No measured MEV reduction. f: price-keyed Merkle-Patricia tries per asset pair (6-byte big-endian price prefix of a 22-byte key, fan-out 16) and precomputed cumulative-supply arrays enable O(#assets^2 lg #offers) demand queries (p. 6, p. 12, p. 24, p. 26 to 27); measured >200,000 tx/s with tens of millions of open offers on 48-core servers (p. 1, p. 8 to 9). No gas figures.
- Strength: moderate for f (peer-reviewed NSDI, measured, but native node code not EVM); weak for d (mechanism argument, no MEV measurement, not deployed at time of writing).

## 6. One quote (optional, max one sentence)
> "By eliminating the ordering of transactions within a block, SPEEDEX eliminates a large source of MEV." (p. 5, Sec. 2.2)
