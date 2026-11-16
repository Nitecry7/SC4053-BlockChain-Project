# 31: Shutterized Optimism performance evaluation (grey literature)

## 1. Verified citation (IEEE style)
luis_bb, "Shutterized Optimism: Performance evaluation," Shutter Forum (Encrypt The Mempool category), Oct. 27, 2025. [Online]. Available: https://shutternetwork.discourse.group/t/shutterized-optimism-performance-evaluation/764
- Checked against: the saved HTML docs/term-paper/papers/31-shutter-2025.html: canonical URL as above; `article:published_time` 2025-10-27T11:10:21+00:00; post `datetime='2025-10-27T11:10:21Z'`; `dateModified` 2025-10-27T11:10:21Z; author link https://shutternetwork.discourse.group/u/luis_bb; publisher itemprop name "Shutter". No web check made (forum post, no DOI).
- Version read: forum post 1 as saved in the HTML (no edits shown; dateModified equals publish time).
- Differences between what I read and the published version: the assignment filename says 2024, but the post is dated October 27, 2025. Author is shown only as the forum handle "luis_bb"; no full name or affiliation in the page.
- Fields NOT verified: author's real name and affiliation (not in the page).
- Peer review status: grey literature (vendor forum post by the Shutter project, a technical report).

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | Design: users encrypt transactions; the sequencer commits to an order (seals a block); a keyper network (typically about five to fifty keypers, threshold typically two-thirds) then generates decryption keys. | Sec. "Threshold-Encrypted Mempools" |
| 2 | Method: lab benchmarks on a 2021 MacBook Pro (M1 Pro, 32 GB) plus observation of network traffic in the live Shutterized Gnosis Chain keyper network; Optimism figures are extrapolated. | Sec. "Methodology" |
| 3 | Measured on Gnosis Chain: most decryption keys arrive just over one second after the trigger, nearly all within three seconds; a bump just before 2 seconds is blamed on peer-to-peer forwarding. | Sec. "Results", Figure 1 |
| 4 | Estimated (not measured) that Optimism-specific changes could cut overall latency by more than a factor of two. | Sec. "Results", text after Figure 1 |
| 5 | Lab: key share generation, share verification and key verification each under 2 ms; key aggregation under 10 ms (scales linearly with keyper set size); encryption about 1.5 ms, decryption under 1 ms. | Sec. "Results", Figure 2 |
| 6 | Key sizes: 48 bytes (decryption key and share), 96 bytes (encryption key). | Figure 3 |
| 7 | Extrapolated failure rate (keyper failures assumed independent, threshold ratio one-third): about 1 in 100,000 at a ~2 s cutoff, about 1 in 10 million at 2.5 s. | Figures 4 and 5 and text |
| 8 | Gas overhead is argued qualitatively (costs driven by state access, not CPU); no gas number is given. | Sec. "Results", text after Figure 2 |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | M11, M4 | analogous | Chain-level encrypted ordering hides order contents (limits, triggers) until order is fixed. |
| 2 | M11 | background | Shows one production deployment (Gnosis Chain) exists. |
| 3 | M11, Security vs Privacy vs Scalability | direct | Measured latency cost of privacy: about 1 to 3 s extra before execution. |
| 4 | M11 | background | Projection only. |
| 5 | M11, Security vs Privacy vs Scalability | analogous | Crypto cost small; network delay dominates. |
| 6 | M11 | background | Bandwidth cost negligible. |
| 7 | M11, Security vs Privacy vs Scalability | analogous | Liveness risk depends on keyper set; adds a trust assumption (threshold honest). |
| 8 | M11 | background | No measured gas; cannot support a gas claim. |

## 4. Limits for an on-chain order book
- Chain-level mitigation (M11), not a contract feature; our OrderBook.sol cannot adopt it on its own.
- Only key arrival on Gnosis Chain is measured in production; all Optimism numbers are extrapolations.
- Does not measure MEV reduction or any effect on trading outcomes.
- Encryption hides orders only until the block is sealed; resting limit orders and stop triggers become public once executed into contract storage, so C1 to C3 against already-resting orders are not addressed.
- Vendor-authored, not peer-reviewed.

## 5. Gap question answered
- Question(s): e.
- Answer from this source: In the live Shutterized Gnosis Chain keyper network, most decryption keys arrive just over one second after the triggering event and nearly all within three seconds (Figure 1). Lab crypto operations take under 2 ms (aggregation under 10 ms); encryption about 1.5 ms, decryption under 1 ms (Figure 2). Failure rates at 2 s and 2.5 s cutoffs are extrapolated, not measured (Figures 4 and 5). No gas cost is measured.
- Strength: moderate for latency (measured in production, but grey literature by the vendor, method thinly described, no sample size or time window stated); weak for anything else (extrapolated).

## 6. One quote (optional, max one sentence)
> "It reveals that the majority of decryption keys are generated just over one second after the triggering event, with nearly all keys available within three seconds." (Results, Figure 1)
