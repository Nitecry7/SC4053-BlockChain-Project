# Final reference list (stage 1, 2026-11-25)

18 papers plus the repository (19 entries). Rule: 14 to 18 entries, peer-reviewed first, plus the repository
(`../prompts/00-RULES.md`). Ranked by how directly each supports a claim the paper makes, using the strength column
of `../EVIDENCE_MAP.md`. Sections refer to `OUTLINE_V2.md`. Everything not listed here is dropped from the paper
(it stays in `references.bib` but is never `\cite`d).

| # | Bib key | Cited for (EVIDENCE_MAP rows) | Where |
|---|---|---|---|
| 1 | `repo8753521` | Engine code at public `main` commit 8753521 (`contracts/src` identical to this branch): caps, stops, keepers, issue 007 regression | I.2, III.A, III.B |
| 2 | `src09moosavi2023` | On-chain book gas and L2 saving (S2, S3); call market resists insertion and displacement (M5b); throughput 38 to 152 trades per block (M5e); one wash trade can fix a price (C2g); who pays to close (C6b); data structure gas (M8a) | II.A.3, II.B.3, III.C.3, III.E.2, IV.B, IV.C, IV.D.2 |
| 3 | `src02eskandari2019` | Front-running taxonomy and on-chain books named as vulnerable (C1c); selective reveal in a price-time queue (M4b) | II.B.1, III.B.4, IV.D.1 |
| 4 | `src01daian2020` | Priority gas auctions, paid ordering (C1e); crossed book captured by a bot (C1f); rewards become PGA prizes (M9) | II.B.1, III.B.4, IV.D.3 |
| 5 | `src05qin2022` | Measured sandwich scale on AMMs (C1d); transparency plus ordering as root cause (S5) | II.A.2, II.B.1, III.B.4 |
| 6 | `src12victor2021` | Self-trades and wash trades on order-book DEXs (C2d, C2e) | II.B.3, III.C.3 |
| 7 | `src18heimbach2022` | No chain-level ordering defence meets all requirements (M11a); commit and reveal scores low on cost and delay (M4c) | IV.D.1 |
| 8 | `src29choudhuri2024` | Encrypted mempool latency and flaws (M11d, S7) | IV.D.1 |
| 9 | `src23torres2024` | Rollups without a public mempool still carry MEV (M11f, S4) | II.A.3 |
| 10 | `src08babel2023` | Economic security as a formal concern (S9); ordering around a price source triggers payouts (C3c) | I.3, II.B.2, III.C.5 |
| 11 | `src06zhou2023` | Incident shares: oracle manipulation 15% (S10, M6), look-alike contracts 10.5% (C5c) | II.B.2, IV.B |
| 12 | `src04zhou2021` | First to formalize and quantify sandwiches, scopes out limit order books (C1d caveat, gap a) | II.B.1 |
| 13 | `src15grech2018` | Attacker-grown loops as a gas DoS class (C4d); push-payment DoS (C5d); pull payments (M10) | III.D.2, III.E.1, IV.D.4 |
| 14 | `src11budish2015` | Frequent batch auctions end the speed race (M5a). No page numbers (2013 draft read) | II.B.3, IV.C |
| 15 | `src20canidio2024` | Commit and reveal: one extra message and delay, only when guessing is hard (M4a) | IV.D.1 |
| 16 | `src21ferreira2023` | Verifiable sequencing still leaves risk-free miner profit, AMM setting (M11c) | IV.D.1 |
| 17 | `src13osler2005` | Stop clustering and cascades, FX (C2f); only literature on stops (gap b) | II.B.3, III.C.3 |
| 18 | `src34chemaya2025` | Defaults drive user limits; dynamic tighter default cut Uniswap losses per 100 USD swapped by 54.7% (Table 5, p. 14), on AMMs (M12, supports E1 direction) | IV.D.5 |
| 19 | `src25beres2021` | Ethereum users can be profiled from public behaviour (S8), privacy background only | II.A.1 |

First to cut if the reference column overflows 0.65 page: 19 (`src25beres2021`), then 12 (`src04zhou2021`, its gap
point moves to a sentence without citation), then 18 (M12 falls back to E1 only).

## Dropped (not cited in the paper)

| Key | Reason |
|---|---|
| `src03torres2021` | Same role as [05] (measured front-running on AMMs); [05] is broader |
| `src07werner2021` | S9 covered by [08]; published venue unverified (arXiv only) |
| `src10warren2017` | White paper; S2 covered by [09] |
| `src13osler2002sr` | Duplicate record of Osler (staff report version); cite `src13osler2005` |
| `src14mackinga2022`, `src17baum2023` | Never read (rule: do not cite) |
| `src16atzei2017` | C5d covered by [15] |
| `src19kelkar2020` | M11b; one-sentence M11 treatment covered by [18], [21] |
| `src22gudgeon2020` | L2 background; not needed with [09], [23] |
| `src24miller2025`, `src31shutter2025`, `src32hyperliquid`, `src33clober2025` | Grey literature; claims either dropped or covered by peer-reviewed rows |
| `src26yang2024` | Countermeasure SoK; [18] fills the role |
| `src27gong2025` | Simulated spread on dYdX (M5c); M5 argued with [11], [09]; proceedings record not seen |
| `src28ramseyer2023` | Off-EVM batch exchange (M8c); not needed |
| `src30yuminaga2025` | Preprint only |
| `src35guidi2025` | Could not open a legal copy (bot checks, see note); do not cite |
| `src36soliditydocs`, `src37ozdocs`, `src38owaspscwe110` | See `RECONCILE.md` table 3; vendor documentation, used for background checks only |
