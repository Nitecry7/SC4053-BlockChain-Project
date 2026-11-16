# Phase 4: gap questions, answers and new sources (26 to 33)

Searches run 2026-11-17 (web search, standard and extended modes). 8 sources added (the maximum), 4 peer-reviewed,
1 preprint, 3 grey literature. Per-source details are in `NN-*.md`; the "Strength" lines below are copied from
each note's section 5.

## New sources
| ID | Source | Peer review | Questions | Note |
|---|---|---|---|---|
| 26 | Yang et al., SoK: MEV Countermeasures (arXiv 2212.05111v2; published as "SoK: MEV Countermeasures", ACM CCS 2024 DeFi Security workshop, pp. 21 to 30) | Peer-reviewed workshop | d, e | `26-yang-2024.md` |
| 27 | Gong, Liu, Kate, The Case of FBA as a DEX Processing Model (arXiv 2302.01177v5) | Peer-reviewed (FC 2025 program; proceedings record not seen) | a, d | `27-gong-2025.md` |
| 28 | Ramseyer, Goel, Mazieres, SPEEDEX (arXiv 2111.02719v6; NSDI 2023, pp. 849 to 875) | Peer-reviewed | d, f | `28-ramseyer-2023.md` |
| 29 | Choudhuri, Garg, Piet, Policharla, Mempool Privacy via Batched Threshold Encryption: Attacks and Defenses (USENIX Security 2024, pp. 3513 to 3529) | Peer-reviewed | e | `29-choudhuri-2024.md` |
| 30 | Yuminaga, Chen, Sui, Execution Welfare Across Solver-based DEXes (arXiv 2503.00738v3) | Preprint only | d | `30-yuminaga-2025.md` |
| 31 | Shutter forum, "Shutterized Optimism: Performance Evaluation", 2025-10-27, handle luis_bb | Grey (vendor forum post) | e | `31-shutter-2025.md` |
| 32 | Hyperliquid Docs, "Tick and lot size" and "Rate limits and user limits" | Grey (vendor docs) | c | `32-hyperliquid-docs.md` |
| 33 | ethresear.ch, "Fenwick + Bitmap: constant-time matching for on-chain order books", 2025-05-12, handle dev-clober | Grey (forum proposal) | f | `33-fenwick-ethresearch.md` |

## Answers by question

**a. Front-running or sandwiching on on-chain limit order book DEXs (not AMMs).**
- No empirical measurement of front-running on a smart-contract limit order book was found. **This is a finding.**
- Closest: [27] models front-running on order-book DEXs (game-theoretic, p. 3 to 5) with dYdX data, not a contract
  book. [09] Lissy argues a call market resists insertion and displacement (see `09-moosavi-2021.md`). [04]
  explicitly scopes out limit order books (see `04-zhou-2021.md`). [02] taxonomy is venue-agnostic.
- So C1 and C3 rest on our own experiments (E1, E3) plus analogy to AMM sandwich literature.
- Strength: weak (literature), strong (our reproduction).

**b. Stop-loss hunting or trigger-price manipulation in crypto or DeFi; reference price design.**
- **No credible source found.** Search results were blogs, vendor announcements and SSRN working papers on
  liquidation cascades (not read, not added). The MITRE AADAPT "Stop Hunting" page (ADT3021.002) was downloaded but
  the HTML is a JavaScript shell with no content (`papers/33-mitre-aadapt.failed-js-shell.html`, title only); it was
  not used.
- Only evidence: [13] Osler (FX markets, TradFi; stop clustering and cascades; deliberate "running the stops" only as
  market lore, p. 3), [14] TWAP manipulation (not read, download failed), and our E2 and E7.
- Strength: weak for C2 and M6/M7 from literature.

**c. Dust or spam order DoS on on-chain order books; minimum order size or tick rules in production.**
- No peer-reviewed source on dust-order DoS against an on-chain book was found. **Finding.**
- [32] Hyperliquid docs: tick and lot grids, volume-linked rate limits and an open-order cap of 1000 (up to 5000).
  A minimum order value was **not found** in the pages read. Hyperliquid is an app-specific L1, not an EVM contract.
- Related: [15] MadMax (unbounded mass operations, gas DoS) and [24] (rollup spam uses gas cheaply) are analogous.
- Strength: moderate for "production venues use tick/lot and order caps" (grey), weak for the DoS claim itself.

**d. Batch auction DEXs in production and measured MEV reduction.**
- Production batch venues named: CoW Swap, Penumbra, Injective ([27] p. 10 to 11), CoWSwap and FairTraDEX ([26] p. 7).
- **No measured MEV reduction from a live batch venue was found. Finding.** [27] simulates FBA on dYdX data (spread
  21% to 37% lower, simulated); [30] measures CoWSwap price improvement versus AMM, not MEV; [28] SPEEDEX argues
  front-running resistance but was not deployed when written.
- Strength: weak to moderate.

**e. Commit and reveal or encrypted mempool deployments and measured costs.**
- [29] strong: attacks on deployed Shutter; measured encryption under 6 ms, 2818.6 ms partial decryption for 512
  transactions; gas per ciphertext is estimated (13,440 to 42,000), not measured.
- [31] grey: live Gnosis keyper key arrival mostly just over 1 s, nearly all within 3 s.
- [20] theory: commit and reveal costs one extra message and a one-block delay (see `20-canidio-2024.md`).
- No deployment measurement of a contract-level commit and reveal DEX was found.
- Strength: moderate to strong for chain-level encryption; weak for M4 implemented inside our contract.

**f. On-chain order book data structures and gas.**
- [09] Lissy (peer-reviewed WTSC'22) benchmarks priority queue designs on Ethereum and Arbitrum: the only
  peer-reviewed gas measurement of on-chain book data structures found.
- [28] SPEEDEX: price-keyed tries, measured throughput, but native code, no gas.
- [33] grey: bitmap plus Fenwick design, gas figures are estimates only.
- Strength: moderate (one peer-reviewed measured source).
