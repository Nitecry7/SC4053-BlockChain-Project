# 29: Mempool privacy via batched threshold encryption, attacks and defenses

## 1. Verified citation (IEEE style)
A. R. Choudhuri, S. Garg, J. Piet, and G.-V. Policharla, "Mempool privacy via batched threshold encryption: Attacks and defenses," in Proc. 33rd USENIX Security Symp. (USENIX Security 24), Philadelphia, PA, USA, Aug. 2024, pp. 3513 to 3529.
- Checked against: PDF page 1 (USENIX cover: "Proceedings of the 33rd USENIX Security Symposium, August 14 to 16, 2024, Philadelphia, PA, USA", ISBN 978-1-939133-44-1, authors Arka Rai Choudhuri (NTT Research), Sanjam Garg, Julien Piet, Guru-Vamsi Policharla (UC Berkeley)); printed page footers run 3513 (p. 2) to 3529 (p. 18); https://www.usenix.org/conference/usenixsecurity24/presentation/choudhuri (same title, authors, pp. 3513 to 3529, ISBN 978-1-939133-44-1, USENIX Association, Aug 2024).
- Version read: USENIX open-access proceedings PDF, 2024 (18 PDF pages including cover). Published version: same.
- Peer review status: peer-reviewed (USENIX Security 2024).
- Differences between what I read and the published version: none found. Full version with security proof is IACR ePrint 2024/669 (cited as [16], p. 15); not read. DBLP blocked (bot-protection page).
- Fields NOT verified: none for the citation.

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Attack on deployed Shutter Network (inferred from its GitHub code, no spec found): ciphertexts were malleable (bit flips stay valid), so anyone relaying a user's transaction could submit a mauled copy, get it included, and learn the plaintext without the original being executed; this violates IND-CCA2. | p. 6 (Sec. 3) |
| 2 | Second Shutter flaw: one decryption key per epoch, so transactions encrypted to an epoch but not included (stuck, or withheld by a malicious collator in the rollup version) are revealed anyway ("pending transaction privacy" lost). | p. 3 (Sec. 1); p. 6 (Sec. 3); p. 3 (Table 1: Shutter O(n), no pending tx privacy) |
| 3 | Disclosure: Shutter team says the malleability bug was fixed; they accept the lack of pending transaction privacy but consider it "prohibitively difficult to exploit" in practice; the designers say the bug was introduced in implementation, not in the 2021 formal design. | p. 6 to 7 (Sec. 3.1) |
| 4 | Naive threshold encryption needs O(nB) decryption communication (n committee, B transactions); epoch-key schemes (Shutter, McFly) get O(n) but lose pending privacy; the proposed batched threshold encryption gets O(n) and keeps pending privacy, at the cost of an MPC setup (expected under 100x more expensive) plus a per-epoch setup. | p. 2 (Abstract); p. 3 (Table 1); p. 4 (Sec. 1.1); p. 14 (Sec. 9.1) |
| 5 | Measured (single thread, 2019 MacBook Pro i9): encryption under 6 ms for a 32-byte message; ciphertext 370 bytes. Partial decryption / reconstruction time for batch 8: 41.5 / 41.9 ms; 32: 173.4 / 165.0 ms; 128: 678.11 / 781.4 ms; 512: 2818.6 / 3472.2 ms. Over 99% of partial decryption cost is proof and pairing checks. Each partial decryption is 80 bytes. | p. 12 (Sec. 9, Table 2) |
| 6 | Estimated on-chain cost (Table 3, BLS12-381, average Ethereum 2023 transaction and block sizes, ETH/USD of 1 Jan 2024): ciphertext storage gas 15,120 ($0.7) Ferveo/MEVade, 30,240 ($1.4) McFly, 13,440 ($0.6) Shutter, 42,000 ($1.9) this work; transaction size increase 12%, 23%, 10%, 30%. | p. 14 (Table 3) |
| 7 | Decryption broadcast for n = 128, B = 512: Ferveo 3 MB (500% of block size), McFly and Shutter 6 KB (1%), this work 10 KB (2%); using about 80 ms added propagation per kilobyte, Ferveo adds about 250 s versus 0.8 s for this work. | p. 14 (Table 3 and bullets) |
| 8 | Committee churn (64 parties, protocol from [33]): setup 6.24 s LAN / 8.21 s WAN, refresh one secret 0.22 s / 1.5 s; extrapolated under 2 minutes WAN for block size 512. | p. 14 (Table 4) |
| 9 | Encrypted mempools add DoS risk (invalid encrypted spam); suggested fixes are validity proofs (e.g. range proofs that the user owns the tokens on a DEX) or penalties, with sender addresses left in clear for blacklisting. | p. 13 (Sec. 9, Denial of Service) |
| 10 | Internal inconsistency: abstract says "close to 2.8 s" per partial decryption for ~500 transactions, contributions say "close to 2.8 ms", Table 2 shows 2818.6 ms for 512. Text says "$2 additional spent gas" while Table 3 shows $1.9. | p. 2 (Abstract); p. 4 (Sec. 1.1); p. 12 (Table 2); p. 14 |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | M4, M11 | analogous | A deployed encrypted-mempool system had a real privacy break; hiding orders (M4/M11) is only as good as the implementation. |
| 2 | M4, C1, C2 | analogous | Orders revealed without execution would expose limits and stop triggers on our book, the information C1 and C2 need. |
| 3 | M11, Security vs Privacy vs Scalability | analogous | Deployer explicitly trades pending privacy for efficiency. |
| 4 | M11, Security vs Privacy vs Scalability | direct | Direct statement of the privacy versus communication scalability trade-off for encrypted mempools. |
| 5 | M11 | analogous | Measured compute cost of threshold decryption per block. |
| 6 | M4, M11 | analogous | Estimated per-transaction gas and size overhead of encrypted submission, usable as a cost figure for M4/M11. |
| 7 | M11 | analogous | Network cost of decryption shares. |
| 8 | M11 | background | Operational cost of committee changes. |
| 9 | C4, M1, M11 | analogous | Privacy makes spam harder to filter; relevant to dust (C4) if orders were encrypted. |
| 10 | none | n/a | Cite the Table 2 value (2818.6 ms), not the abstract. |

## 4. Limits for an on-chain order book
- About chain-level or rollup-level encrypted mempools (M11), not an application-level commit and reveal inside a Solidity order book (M4).
- Shutter attacks are found by code reading and disclosed; no measured exploitation on mainnet.
- Gas costs are estimates from ciphertext size (calldata/storage), not measured on a deployed contract; benchmarks are single-threaded laptop numbers.
- Trust in a threshold committee (security proof for t < n/3, p. 18) has no analogue in our contract.
- Encryption hides content, not the existence or sender of an order; dust attacks (C1, C3, C4) do not need content.

## 5. Gap question answered
- Question(s): e.
- Answer from this source: deployed encrypted mempool Shutter had malleable ciphertexts (fixed after disclosure) and no pending transaction privacy (acknowledged, not fixed) (p. 6 to 7, Sec. 3 and 3.1). Costs: encryption under 6 ms, 370-byte ciphertext; 2818.6 ms partial decryption and 3472.2 ms reconstruction for 512 transactions single-threaded (p. 12, Table 2); estimated ciphertext gas 13,440 ($0.6) for Shutter up to 42,000 ($1.9) for the proposed scheme and 10% to 30% larger transactions (p. 14, Table 3); decryption broadcast 6 to 10 KB versus 3 MB for Ferveo at n = 128, B = 512 (p. 14).
- Strength: strong for e. Peer-reviewed (USENIX Security 2024), concrete attack on a deployed system with vendor response, measured compute benchmarks; gas numbers are estimates, and the setting is chain-level encryption, not an on-chain order book.

## 6. One quote (optional, max one sentence)
> "This means transactions that are stuck in the mempool and don't make it on chain before the end of the epoch will be revealed even though they won't be executed." (p. 6, Sec. 3)
