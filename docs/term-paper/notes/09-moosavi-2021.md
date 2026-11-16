# 09: Lissy, an on-chain call market order book (gas, priority queues, Arbitrum)

## 1. Verified citation (IEEE style)
M. Moosavi and J. Clark, "Lissy: Experimenting with on-chain order books," in *Financial Cryptography and Data Security. FC 2022 International Workshops*, ser. Lecture Notes in Computer Science, vol. 13412. Cham, Switzerland: Springer, 2023, pp. 598 to 614, doi: 10.1007/978-3-031-32415-4_36.

- Checked against:
  - PDF page 1: title "Lissy: Experimenting with on-chain order books", authors "Mahsa Moosavi and Jeremy Clark", Concordia University; side stamp "arXiv:2101.06291v3 [cs.CR] 6 Oct 2021".
  - https://arxiv.org/abs/2101.06291: same two authors; v1 15 Jan 2021, v2 2 Jun 2021, v3 6 Oct 2021; no journal-ref listed.
  - Crossref DOI metadata (https://api.crossref.org/works/10.1007/978-3-031-32415-4_36): title "Lissy: Experimenting with On-Chain Order Books", authors Mahsa Moosavi, Jeremy Clark, container "Lecture Notes in Computer Science; Financial Cryptography and Data Security. FC 2022 International Workshops", Springer, pages 598-614, published 2023 (online 22 Jul 2023), event FC 2022, Grenada.
  - https://www.ifca.ai/fc22/wtsc/program.html: entry 9, "Lissy: Experimenting with On-chain Order Books", Mahsa Moosavi and Jeremy Clark, session "DEFI and PAYMENTS" of WTSC'22 (6th Workshop on Trusted Smart Contracts).
  - LNCS volume number 13412 for the FC 2022 workshops proceedings: from web search results (DBLP record conf/fc/2022w listed in results; publisher listings), not from a page I could open.
  - DBLP itself: blocked (Anubis "Access Denied" page on dblp.org and dblp.dagstuhl.de; API returned HTTP 429). Not checked on DBLP.
  - Springer chapter page: redirected to a Springer login/cookie page; not opened.
- Version read: arXiv v3, 6 Oct 2021 (20 PDF pages, LNCS-like layout). Published version: WTSC 2022 workshop at FC 2022 (Grenada, May 2022), proceedings LNCS 13412, Springer 2023, pp. 598 to 614, DOI 10.1007/978-3-031-32415-4_36.
- Differences between what I read and the published version: title capitalisation only ("on-chain order books" vs "On-Chain Order Books"). Authors the same (two authors). Content of the published chapter not compared (could not open it), so page numbers below refer to arXiv v3 only. Corrections versus the task's one-line description: "Lissy" is the name of the system, not a third author; the paper has two authors (Moosavi, Clark). Venue found: WTSC 2022 workshop at FC 2022, published 2023 (not 2021).
- Fields NOT verified: LNCS volume number 13412 (search results only, not an opened page); editors; whether the published text or numbers differ from arXiv v3.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Lissy is a call market (orders collected during an open window, then matched best bid against best ask at close until they no longer cross), not a continuous book. Each fill trades at the ask; the bid/ask difference ("price improvement") is sent to the miner via block.coinbase.transfer(). Lissy is 336 SLOC of Solidity plus a priority queue of about 300 SLOC; bytecode 10,812 bytes (constructor 6,400 bytes). Funds are preloaded (deposit, then claim) i.e. escrow in the contract. | p. 3 (Sec. 3), p. 4 (Table 2), p. 10 (Sec. 5), p. 12 (Sec. 6.4), p. 17 (App. A.3) |
| 2 | Five priority-queue variants benchmarked (heap with dynamic array, heap with static array, heap with mapping, linked list where every node is its own contract, linked list with mapping); sorting is done at enqueue. Dequeuing 50 integers: gasUsed 2,518,131 / 1,385,307 / 2,781,684 / 557,085 / 731,514 (refunds 750,000 / 750,000 / 1,500,000 / 1,200,000 / 3,765,000, applied refund capped at half). Linked lists are much cheaper to dequeue; authors pick linked list with mapping on L1. | p. 4 to 5 (Sec. 3.1, Fig. 1, Table 3) |
| 3 | Main L1 result (Table 5, worst case where every order is marketable, block gas limit 11,741,495, 1 gas = 56 Gwei): max trades per close = 38 (heap dynamic), 42 (heap static), 46 (heap mapping), 152 (linked list), 86 (linked list with mapping); gas for max trades about 5.2M to 5.5M (e.g. 5,372,679 for heap dynamic, 5,495,265 for linked list), "just under the block gas limit (~11M gas) with a full refund of half of its gas". Gas for 1000 trades: 457,326,935 / 333,656,805 / 226,499,722 / 35,823,601 / 62,774,170. Average gas per order submission (over 200 submissions): 207,932 / 197,710 / 215,040 / 735,243 / 547,466. | p. 4 (Sec. 3), p. 6 to 7 (Sec. 3.3, Table 5) |
| 4 | Headline throughput statements: "Upper-bounded by 152 per block"; data-structure choice only turns "38 trades into 152"; call markets "limited to processing about a hundred orders per transaction" and closing monopolises a whole block; abstract says you "cannot expect to exceed a few hundred trade executions per block". Also: "Ethereum will not permit more than hundreds of orders so asymptotic behaviour is not significant". | p. 1 (Abstract, Contributions), p. 2, p. 5 (Sec. 3.1), p. 6 (Sec. 3.3) |
| 5 | Gas refunds: refund capped at 50% of transaction gas and the block limit applies to pre-refund gas (so a fully refunded tx costs up to 5.5M of an 11M block). Refunds estimated by hand (24,000 per SELFDESTRUCT, 15,000 per cleared slot). Cleanup only sometimes pays: linked list with SELFDESTRUCT 557,085 vs 721,370 without; linked list with mapping and DELETE 731,514 vs 334,689 without. Clearing mappings costs more than it refunds. | p. 2 (Sec. 2.1), p. 5 to 6 (Sec. 3.2, Table 4), p. 14 to 15 (App. A.1), p. 18 (App. B) |
| 6 | Arbitrum (optimistic rollup, on Rinkeby testnet): closing a 38-pair market costs 6,569 L1 gas (103 bytes calldata) vs 5,372,679 on L1, "a 99.88% savings", plus 508,250 ArbGas of L2 computation; L1 cost stays about 6,569 as pairs grow; order submission drops from 207,932 to 6,917 L1 gas. On L2 the heap with dynamic array is used (heaps 32% more efficient to submit, 29% less efficient to close). Caveats: tokens and ETH must be bridged; withdrawals final after a 1 hour challenge period; ArbGas price "not well established". | p. 7 (Table 6, Sec. 4), p. 8 (Sec. 4.1) |
| 7 | Front-running evaluation (taxonomy of insertion, displacement, suppression from the SoK [14]): call markets mitigate basic insertion and displacement because there is no time priority within a call (shuffling orders gives the same outcome). Suppression is only partially mitigated (expensive but possible; the call times out). A hybrid attack can extract price improvement; Lissy counters by paying price improvement to the miner. A sequencer on L2 is "an additional front-running actor" with miner-like ordering power. | p. 8 to 10 (Sec. 5, Table 7, Sec. 5.1) |
| 8 | Ties: with indivisible tokens pro rata can fail; random choice is fairest but on-chain randomness is miner-manipulable, so Lissy uses time priority and accepts that "front-running attacks are possible in this one improbable case". No cancellations (they enable displacement of cancels and need a heavier data structure); markets kept short-lived instead. | p. 11 (Sec. 6.1, 6.2) |
| 9 | Who pays to close the market is "probably the most significant design challenge": options are miner via MEV (price improvement pays the miner), traders of the next call paying incrementally (backlog risk), a fee-funded bounty for the first closeMarket() caller (bounty may not cover gas as costs are not linear and gas prices vary), meta-transaction relays or Ethereum Alarm Clock (regulatory hook), or an interested third party such as the token issuer. | p. 11 to 12 (Sec. 6.3) |
| 10 | Lissy deliberately emits no market clearing price because miners can manipulate it by including "a single wash trade at the price they want fixed"; suggested countermeasures are a rolling median over time and combining with other price sources. Also: anyone can deploy an on-chain order book next to their token, which "should concern regulators". | p. 19 (App. D), p. 12 (Sec. 7), p. 16 (App. A.2) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | background; M5 | direct | Closest prior design: on-chain order book with escrow, but call market instead of continuous price-time book; contrast for our design choice. |
| 2 | M8; Security vs Privacy vs Scalability | direct | Measured gas of on-chain order data structures; supports discussion of sorted-list insertion cost behind MAX_INSERT_SCAN and a price-level book (M8). |
| 3 | C4; M1; Security vs Privacy vs Scalability | direct | Shows block gas makes per-call matching capacity tiny (38 to 152 trades per block), the reason for bounded loops such as MAX_MATCHES_PER_TX = 10; bounded capacity is what C1, C3, C4 exploit. |
| 4 | C1; C3; C4; Security vs Privacy vs Scalability | direct | Citable numbers for "on-chain books can only process about a hundred orders per transaction", justifying fill caps. |
| 5 | background | background | Gas refund economics for deleting orders; refund rules are 2020-era. |
| 6 | M11; Security vs Privacy vs Scalability | direct | L2 cuts L1 gas by 99.88% so caps could be raised, but adds a sequencer with miner-like ordering power (does not remove ordering attacks). |
| 7 | M5; M4; M11; C1; C3 | direct | Batch (call) execution removes time-priority races that C1 and C3 depend on; suppression and sequencer power remain. |
| 8 | M5; M2 | analogous | Their choice of no cancellations and time-priority tie break shows the residual front-running surface; our book allows cancels. |
| 9 | C6; M9 | direct | Same keeper problem as our permissionless matchOrders and triggerStopOrders: someone must pay gas; bounty design and its limits. |
| 10 | C2; M6; C5 | direct | A single wash trade can fix an on-chain price; their remedy (rolling median, other sources) matches M6 for our lastTradePrice stop trigger. Permissionless listing concern relates to C5. |

## 4. Limits for an on-chain order book
- Call market, not a continuous limit order book: the front-running resistance (Finding 7) comes from batching and does not transfer to our price-time continuous book.
- Measured on Ganache (Truffle/Mocha) and Rinkeby testnet, not mainnet; block gas limit about 11.7M and 1 gas = 56 Gwei (July 2020). Gas schedules and refund rules may have changed since; not checked in this file.
- Throughput is the worst case (every order marketable); real closes stop at the first non-crossing order (p. 6).
- Arbitrum numbers are L1 gas only; L2 cost given only in ArbGas with no price (p. 8). Arbitrum version described is a 2021 testnet deployment.
- No stop orders, no cancellations, no keeper reward implemented; design landscape items (bounty, MEV payment) are discussion, not evaluated.
- Table 7 symbols (filled/partial/empty dots) are lost in the text extraction; the attack results above are taken from the prose on p. 8 to 10, not from the table cells.

## 5. Claim check
- Summary given: "on-chain call market; at most a few hundred executions per block on Ethereum; 99.88% gas reduction on Arbitrum; benchmarks five priority queue designs; call markets resist insertion and displacement."
- Verdict: supported (with precision caveats)
- Evidence:
  - "on-chain call market": holds (p. 1 Abstract; p. 3 Sec. 3).
  - "at most a few hundred executions per block": holds as worded in the abstract ("cannot expect to exceed a few hundred trade executions per block", p. 1). The measured figures are lower: max 152 trades (linked list) and 38 to 86 for other variants in a block-filling close (p. 7 Table 5), "Upper-bounded by 152 per block" (p. 1), and "about a hundred orders per transaction" (p. 6). Better to cite 152 and 38 than "a few hundred".
  - "99.88% gas reduction on Arbitrum": holds, but it is L1 gas only for closeMarket() of 38 pairs (6,569 vs 5,372,679), excluding 508,250 ArbGas of L2 work (p. 7 Table 6, p. 8 Sec. 4.1). Not a total cost reduction.
  - "benchmarks five priority queue designs": holds (p. 4 to 5, Sec. 3.1, Fig. 1, Tables 3 and 5).
  - "call markets resist insertion and displacement": holds for basic insertion and displacement (p. 8 Sec. 5: no time priority). Suppression only partially mitigated (p. 9); a hybrid price-improvement attack exists and is handled by paying improvement to miners (p. 9 to 10); time-priority tie breaks leave a front-running case (p. 11).

## 6. One quote (optional, max one sentence)
> "The main takeaway is that call markets appear to be limited to processing about a hundred orders per transaction and even that is at the enormous cost of monopolizing an entire Ethereum block just to close the market." (p. 6, Sec. 3.3)
