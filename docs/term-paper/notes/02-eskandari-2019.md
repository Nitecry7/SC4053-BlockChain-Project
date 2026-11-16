# 02: SoK: Transparent Dishonesty (front-running taxonomy)

## 1. Verified citation (IEEE style)
S. Eskandari, S. Moosavi, and J. Clark, "SoK: Transparent dishonesty: Front-running attacks on blockchain," in Financial Cryptography and Data Security (FC 2019 Int. Workshops, VOTING and WTSC), Lecture Notes in Computer Science. Cham, Switzerland: Springer, 2020, pp. 170-189, doi: 10.1007/978-3-030-43725-1_13.
- Checked against: PDF page 1 (title "SoK: Transparent Dishonesty: Front-running Attacks on Blockchain.", authors Eskandari, Moosavi, Clark, Concordia University and ConsenSys Diligence, stamp "arXiv:1902.05164v3 [cs.CR] 9 Apr 2019"); Crossref record https://api.crossref.org/works/10.1007/978-3-030-43725-1_13 (title "SoK: Transparent Dishonesty: Front-Running Attacks on Blockchain", same three authors, series Lecture Notes in Computer Science, book "Financial Cryptography and Data Security", pages 170-189, published 2020, online 13 March 2020, no volume number given); arXiv abstract page https://arxiv.org/abs/1902.05164 (v1 13 Feb 2019, v2 18 Feb 2019, v3 9 Apr 2019; journal-ref "FC: International Conference on Financial Cryptography 2019").
- Cross-check inside the corpus: 04-zhou-2021 reference [25] gives editors A. Bracciali, J. Clark, F. Pintore, P. B. Ronne, M. Sala, "Financial Cryptography and Data Security", pp. 170-189, Cham, 2020 (04 PDF p. 14).
- DBLP: blocked by an Anubis bot-protection "Access Denied" page; not bypassed. Springer chapter page redirected to a login/cookie page; not followed.
- Version read: arXiv v3, 9 Apr 2019 (19 PDF pages). Published version: FC 2019 International Workshops (VOTING and WTSC), LNCS, Springer, 2020, pp. 170-189, DOI 10.1007/978-3-030-43725-1_13.
- Differences between what I read and the published version: title capitalisation only ("Front-running" vs "Front-Running"; trailing period on arXiv PDF). Authors same. Publication year of the proceedings is 2020 (workshops held 2019). Body text of the published chapter not checked.
- Fields NOT verified: LNCS volume number (11599 appears only in a web search snippet from researchr, not on a page I could open; Crossref lists no volume); the workshop names "VOTING and WTSC" also come only from that snippet; DBLP entry (blocked).

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| F1 | Taxonomy of front-running by attacker goal: displacement (victim's call no longer matters), insertion (attacker needs victim's call to run on the changed state), suppression (attacker delays the victim's call). Each has asymmetric and bulk variants. | p. 4 to 5 (Sec. 3) |
| F2 | Insertion example is an order-book trade: attacker buys at the best offer and re-offers at the victim's higher purchase price, profiting without holding the asset. | p. 4 (Sec. 3) |
| F3 | Fully on-chain order books are described as generally vulnerable to displacement and insertion: insert a pair of limit orders ahead of a large market order to scalp it; or cancel own offers likely to be hit and re-offer higher. | p. 7 (Sec. 4.1) |
| F4 | Cancellation grief: a pending cancel is seen and a fill with higher gas price takes the order first (asymmetric displacement); a miner can do the same while collecting the cancel's gas. | p. 6 (Sec. 4.1, Fig. 2) |
| F5 | Suppression case: the Fomo3D winner stuffed blocks with high-gas transactions so nobody else could buy a ticket (also called block stuffing). | p. 8 (Sec. 4.3) |
| F6 | Mitigations grouped into three categories: transaction sequencing (remove miner's free ordering), confidentiality (cryptographic techniques, including commit/reveal), and design practices (redesign the DApp so order or timing does not matter). | p. 1 to 2 (Sec. 1); p. 12 (Sec. 6) |
| F7 | Sequencing limits: FIFO is not achievable on a distributed network without more orphans or a trusted sequencer; pseudorandom ordering is marginal and may even help attackers (grind transaction hashes); transaction chaining prevents insertion but not displacement and allows one state change per state. | p. 13 (Sec. 6.1) |
| F8 | Commit/reveal weakness: in an exchange with a price-time priority queue an attacker can spray committed orders and reveal only the profitable ones; fidelity bonds are a blockchain-specific counter; two rounds hurt usability. | p. 15 (Sec. 6.2) |
| F9 | Design-practice fix for exchanges: a call market (batch execution, arrival time irrelevant) instead of a time-sensitive order book, turning front-running gains into fees. | p. 16 (Sec. 6.3) |
| F10 | Status.im ICO: F2Pool (about 23% hash rate) pre-funded 30 addresses with 100 Ether, mined its own unbroadcast purchase transactions; ICO's 50 GWei gas price cap stopped fee-based front-runners but not the miner. | p. 9 to 12 (Sec. 5.1, 5.2) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| F1 | C1, C2, C3, C4, background | background | Vocabulary for classifying our attacks: C1 and C3 are insertion, C2 is insertion (the self-trade must land before the trigger call), C4 is closer to suppression/denial. |
| F2 | C1 | direct | Same pattern as C1: attacker trades against the victim at the victim's limit price. Their version uses ordering; ours uses the fill cap to make the victim rest. |
| F3 | C1, Security vs Privacy vs Scalability | direct | Explicitly about on-chain order books; public pending orders reveal demand and enable scalping. |
| F4 | C6, background | analogous | Public cancels can be front-run; same exposure for our cancel and for keeper calls. |
| F5 | C6, C3 | analogous | Block stuffing could delay a keeper's matchOrders or triggerStopOrders call. |
| F6 | M4, M5, M11 | direct | Primary source for grouping our mitigations (sequencing = M11, confidentiality = M4, redesign = M5/M8). |
| F7 | M11 | direct | Explains why ordering rules at chain level are hard and partial. |
| F8 | M4 | direct | Commit/reveal on a price-time priority book is weakened by selective reveal; supports adding bonds or fees if M4 is proposed. |
| F9 | M5 | direct | Call market / batch auction as the design-level answer for exchanges. |
| F10 | M11, background | analogous | App-level fee caps do not stop a miner-level adversary. |

## 4. Limits for an on-chain order book
- SoK from 2018/2019: case studies are the top 25 DApps on DAppRadar on 4 Sep 2018 (p. 5, Table 1) plus one ICO; mostly qualitative, little measurement (only the Status.im ICO data, p. 10 to 12).
- The exchanges studied (EtherDelta, 0x) keep the order book off-chain (p. 6, Sec. 4.1); on-chain order books are discussed only as a design that several projects were pursuing (p. 7).
- PoW-era miner model (p. 3, Sec. 2.3); no MEV relays, PBS, or rollup sequencers.
- No discussion of bounded loops, fill caps, stop orders or dust orders (not found in the file).

## 5. Claim check
- Summary given: "taxonomy of displacement, insertion and suppression; fixes grouped as sequencing, commit and reveal, redesign."
- Verdict: supported
- Evidence:
  - Taxonomy: holds. Section 3 distinguishes three cases: displacement, insertion and suppression attacks (p. 4), with asymmetric and bulk variants (p. 5).
  - Fix grouping: holds, with a labelling caveat. The introduction lists transaction sequencing, cryptographic techniques such as commit/reveal, and redesigning how the DApp functions (p. 1 to 2). In Sec. 6 the three headings are Transaction Sequencing (6.1), Confidentiality (6.2) and Design Practices (6.3) (p. 12 to 16). Commit/reveal is a subsection of the confidentiality category, which also covers privacy-preserving blockchains (p. 13 to 14). If our paper names the second group, confidentiality (including commit/reveal) is more precise than commit and reveal alone.
  - The paper also notes legal deterrence for identified parties as a fourth, non-technical factor (p. 12).

## 6. One quote (optional, max one sentence)
> "These designs are generally vulnerable to front-running attacks following a displacement or insertion template." (p. 7, Sec. 4.1, about order books on a public blockchain)
