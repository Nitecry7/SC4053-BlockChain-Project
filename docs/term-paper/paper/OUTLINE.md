# Paper outline (master plan for the two writers)

Stage 1 (2026-11-25): superseded as the plan by `OUTLINE_V2.md` (official five sections). Kept for history.

Target: IEEE conference format (IEEEtran), 4 to 6 pages; aim for 5 pages plus references. Lens: Security, framed as
transaction ordering and economic security. Row IDs (C1a, M2a, S1, ...) refer to `../EVIDENCE_MAP.md`. Experiment
numbers come from `../evidence/README.md` and `../evidence/COST_MODEL.md`. Bib keys are in `overleaf/references.bib`.

Owners: **P1** = engine owner (OrderBook.sol, tests). **P2** = teammate. **Both** = written together on day 5.

Working thesis (one line, to be phrased by the writers): the limits added for scalability (bounded loops) and the
transparency of a fully on-chain book (public limits and triggers) combine into ordering attacks, so economic
security is the main concern.

Every bullet below is a point to make, not text to paste. Each lists the rows it must cite and the caveat it must
carry. If a bullet has no strong or moderate row, it goes to Section VII instead.

---

## Abstract (Both, 0.15 page, written last)
- System in one clause; thesis; four attacks reproduced (C1 to C4); two mitigations implemented and measured (M1,
  M2); headline numbers: E1 profit equals victim overpay, E3 one-tx snipe of about half the victim's proceeds, E10
  M1 plus M2 bounds the delay. Rows: S1, C1b, C3b, C3d, M2a, M1d.

## I. Introduction (Both, 0.5 page)
1. Context: front-running and extractable value are large and measured, mostly on AMMs.
   Rows C1d, C1e. Cite `src05qin2022`, `src03torres2021`. Caveat: AMM numbers, not order books.
2. Gap: little on fully on-chain limit order books (Phase 4 gap a, `../notes/PHASE4_GAPS.md`). Row C1d caveat.
3. Our system and thesis. Row S1.
4. Contributions (3 bullets in the paper):
   (a) four ordering attacks on our engine with reproducible Foundry tests (E1 to E4, E8, E9);
   (b) two mitigations implemented and measured, with what they do not fix (E5 to E8, E10);
   (c) the security versus privacy versus scalability trade-off (S1 to S10).
5. Paper organisation (one sentence).

## II. Background and related work (P2, 0.75 page)
1. Front-running taxonomy: displacement, insertion, suppression. Row C1c. `src02eskandari2019`.
2. Priority gas auctions and MEV; ordering as a systemic risk. Row C1e. `src01daian2020`. Caveat: PoW era.
3. Measured sandwiching and extraction. Row C1d. `src04zhou2021` (say "first to formalize and quantify", p. 1, not
   "first formal model"), `src03torres2021`, `src05qin2022`. Caveat: AMM.
4. On-chain order books: cost pushed books off-chain (0x); Lissy call market and its gas. Rows S2, M5e, M8a.
   `src10warren2017`, `src09moosavi2023`, `src28ramseyer2023`.
5. Batch auctions remove the speed race. Rows M5a, M5c. `src11budish2015` (no page numbers: 2013 draft read),
   `src27gong2025` (simulation, spread not MEV).
6. Economic security as a distinct concern. Row S9. `src07werner2021`, `src08babel2023`. Caveat: under Werner's
   definition atomic sandwiches count as "technical".
7. Layer 2 and MEV on rollups. Rows S3, S4, M11f. `src22gudgeon2020`, `src23torres2024`.

## III. System and threat model (P1, 0.75 page)
1. Engine: escrow, price-time priority by `bookSeq`, execution at maker price. Cite `OrderBook.sol` lines.
2. Scalability caps: `MAX_MATCHES_PER_TX = 10`, `MAX_INSERT_SCAN = 100`, `LOT_SIZE = 1e9`. Rows C1a, C3a, C4a.
3. Stops: trigger on `lastTradePrice`, any fill of any size sets it. Rows C2a, C2b.
4. Permissionless, unrewarded `matchOrders` and `triggerStopOrders`. Rows C6a, C6c.
5. Permissionless tokens and push payouts. Rows C5a, C5b.
6. Adversary model: sees pending transactions; can place orders and call keeper functions; may deploy a contract;
   in C1 needs its back-run before any `matchOrders` (E9). No control over consensus assumed.
7. Fig. 1: order flow (place, match up to 10, rest or refund, keeper calls). TODO P1.

## IV. Security considerations (P1, 1.5 pages)
For each: mechanism (code), experiment (numbers), literature (analogous evidence), limits.
1. C1 fill-cap sandwich. Rows C1a, C1b, C1c, C1d, C1f. Table I (E1). Fig. 2 sequence. E9: one keeper call defeats
   it (row C1b caveat). Caveat: profit not net of gas, see K in COST_MODEL.
2. C2 stop hunt by self-trade. Rows C2a to C2g. E2 depth sweep. Self-trades on real DEXs (`src12victor2021`, say
   "EtherDelta" for the self-trade majority). Stop clustering and cascades (`src13osler2005`, FX, folklore only for
   deliberate running). Caveat: no crypto stop-hunt literature found (gap b).
3. C3 stop snipe. Rows C3a to C3d. E3 and E9 atomic: one transaction, no ordering control around the victim
   needed. This is the strongest finding; state it precisely.
4. C4 dust wall. Rows C4a to C4e. E4: 101 bids block the bid side; 11 tx to clear; attacker pays 8.4x the
   defender's gas (capital-cheap, gas-expensive). `src15grech2018` for the gas DoS class.
5. C5 permissionless tokens. Rows C5a to C5e. No test; reasoning plus `src06zhou2023` Insight 4 and push-payment DoS
   (`src15grech2018`, `src16atzei2017`). Caveat: C5e has no source, say design inference or drop.
6. C6 unrewarded keepers. Rows C6a to C6c. `src07werner2021`, `src09moosavi2023`. Caveat: no timing data.
7. Table I: attack results (`overleaf/tables/experiments.tex`).

## V. Mitigations (1.0 page; P1 items 1 to 2, P2 items 3 to 8)
1. M1 minimum order size: rejects dust (E5 reject test), does not stop C2 (E8), bounds C1 repeat when paired with
   M2 (E10). Rows M1a, M1b, M1d. Caveat: only 0.1 tested; reuses `ZeroAmount` error in the research copy.
2. M2 no crossed rest: removes C1 and C3 profit (E5, E7), cheap (E6: +606, +26, +1071 gas), but alone turns theft
   into indefinite delay (E10, 1e9 rounds) and cancels the victim's stop (E7). Rows M2a to M2c.
3. M4 commit and reveal. Rows M4a to M4c. `src20canidio2024` (one extra message plus delay; only when guessing is
   hard), `src02eskandari2019` (spray and selective reveal in a price-time queue), `src18heimbach2022`.
4. M5 frequent batch auction. Rows M5a to M5e. Caveat: no production MEV-reduction measurement (M5d gap).
5. M6 hardened reference price and M7 band: weak or no evidence; name them as untested design options. Rows M6, M7.
6. M8 price-level book, M9 keeper reward, M10 allowlist or pull payments. Rows M8a to M8c, M9, M10.
7. M11 chain-level ordering protection. Rows M11a to M11f. `src18heimbach2022`, `src19kelkar2020`,
   `src21ferreira2023`, `src29choudhuri2024`, `src23torres2024`.
8. M12 frontend guards. Row M12 (E1: tight limit shrinks but does not remove loss).
9. Table II: mitigation vs consideration matrix with evidence strength (`overleaf/tables/mitigations.tex`).

## VI. Security versus privacy versus scalability (P2, 0.5 page)
1. Bounded loops are a scalability choice that creates C1, C3, C4. Row S1.
2. On-chain books are expensive; L2 cuts L1 gas but keeps MEV and adds spam. Rows S2, S3, S4. Quote `src24miller2025`
   per chain (grey literature; "under a tenth of fees" holds only for OP Mainnet).
3. Transparency plus unilateral ordering is the root cause. Rows S5, S6.
4. Privacy fixes cost latency and gas. Rows S7, M11d. `src29choudhuri2024` Table 2.
5. Privacy background: profiling of accounts. Row S8. `src25beres2021`.

## VII. Limitations and future work (P2, 0.25 page)
- Local chain only; gas tied to forge 1.8.6, absolute gas differs from the reference run (relative overhead stable).
- Keeper timing not measured (C6b); one minimum size tested (M1a).
- Sources not read: [14] TWAP manipulation, [17] cryptographic defences survey (download failed).
- Literature gaps: no crypto stop-hunt study (gap b), no production MEV reduction for batch DEXs (gap d), no
  front-running study on contract order books (gap a).
- Future: M7 band, M6 reference price, M3 clear-before-take, minimum-size sweep.

## VIII. Conclusion (Both, 0.15 page)
- Restate thesis with the two strongest results (C3d one-tx snipe; M2 alone is insufficient, M1 plus M2 bounds it).

---

## Figures and tables
| Item | Content | Source | Owner |
|---|---|---|---|
| Fig. 1 | Order flow and keeper calls | `OrderBook.sol`, SPEC section 5 | P1 |
| Fig. 2 | C1 sandwich sequence (dust, victim, back-run, keeper alternative) | E1, E9 | P1 |
| Fig. 3 (optional) | E1 profit vs slack, E2 shortfall vs depth | `overleaf/figures/*.dat` | P1 |
| Table I | Attack results E1 to E4, E8, E9 | `overleaf/tables/experiments.tex` | ready |
| Table II | Mitigation vs consideration matrix | `overleaf/tables/mitigations.tex` | ready, P2 checks |
| Table III (optional) | Mitigated engine E5, E7, E10 | `overleaf/tables/gaps.tex` | ready |

## Page budget check
0.15 + 0.5 + 0.75 + 0.75 + 1.5 + 1.0 + 0.5 + 0.25 + 0.15 = 5.55 pages before references. Cut first from II and the
optional Fig. 3 / Table III if over.
