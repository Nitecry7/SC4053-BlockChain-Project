# Outline v2: official five-section template (stage 1, 2026-11-25)

Replaces `OUTLINE.md` as the plan of record (rule source 3 in `../prompts/00-RULES.md`). Row IDs refer to
`../EVIDENCE_MAP.md`; experiment numbers to `../evidence/README.md` and `../evidence/COST_MODEL.md`; bib keys to
`overleaf/references.bib`; the reference list to `REFERENCES_FINAL.md`. Every bullet below is a point to make, not text.

Limit: 4 to 6 pages INCLUDING references, IEEE two-column (`context/README.md`). Template file not yet in hand:
if `context/paper-template.*` appears, it overrides this section order and budget.

## Page budget (must total at most 6.0)

| Part | Pages | Of which floats |
|---|---|---|
| Title, authors, abstract, index terms | 0.30 | |
| I. Introduction | 0.55 | |
| II. Motivation and Literature Survey | 1.05 | |
| III. Observations and Analysis | 1.90 | Fig. 1 (about 0.25), Table I (about 0.20) |
| IV. Proposed Solutions | 1.25 | Table II (about 0.25) |
| V. Conclusion | 0.20 | |
| References (17 papers plus the repository) | 0.65 | |
| **Total** | **5.90** | |

Cut order if over: (1) optional Fig. 2, (2) II.B theme 3 sentences on [13] and [12] move to III.C only,
(3) IV.D shrinks to the table alone, (4) Table I drops row 5.

## Figures and tables (fixed)

| Item | Content | Source | Limit |
|---|---|---|---|
| Fig. 1 | C1 sandwich as a three-actor sequence: Bob (resting ask 10 at 1.5), Carol (buy 10, limit 2.0), Mallory (10 one-lot asks at 1.499 before Carol; after Carol: sells into Carol's crossed remainder at 2.0, buys Bob's ask at 1.5). Mark the point where one `matchOrders` call (E9) would close the window | E1, E9; `OrderBook.sol:20, 67-68, 115` | One column wide |
| Table I | Attack results | `overleaf/tables/experiments.tex` | 9 rows (now 9) |
| Table II | Mitigations against considerations, status, evidence strength | `overleaf/tables/mitigations.tex` | 9 rows (now 9) |
| Fig. 2 (optional, cut first) | E1 victim loss against limit slack | `overleaf/figures/e1_slack.dat` | Cut if over budget |

Table I rows: E1 1% slack; E1 33% (issue 007); E9 sandwich with keeper first; E2 depth 0; E2 depth 10; E8 hunt with
M1 0.1; E3 snipe; E9 one-transaction snipe; E4 dust wall. Dropped from the old table: E1 0.1% and 5% (linearity is
stated in text with the closed form, 0.1% value used once in IV.D for M12), E2 depth 5, E9 snipe with keeper first
(stated in text).

Table II rows: M1; M2; M6 and M7 together; M5; M4 with M11 (ordering and confidentiality); M8; M9; M10; M12.
M3 (clear before take) leaves the table and appears in V as future work (no evidence).

---

## Front matter (Both, 0.30)
- Title: decided by the humans (three options in the stage 1 report). Authors: placeholder until supplied.
- Abstract, about 150 words, written last (stage 3).
  - Point: system in one clause; correct settlement does not imply fair execution; four attacks reproduced; two
    mitigations built in a research copy and measured; what they leave open.
  - Rows: S1, C1b, C3d, M2a, M1d. Numbers allowed: 5.0 of 15.0 overpaid at 33% slack (E1); about 10 of 20 quote
    taken in one transaction (E9 atomic); 1e9 rounds under M2 alone vs 10 under M1 plus M2 (E10).
  - Hedge: local Anvil chain, before gas, research copy only.
- Index terms: blockchain, decentralized exchange, limit order book, front-running, transaction ordering, economic
  security.
- AI-use declaration: placeholder only (see stage 1 questions).

## I. Introduction (Both, 0.55)
1. Blockchain and the three concerns, one sentence each (security, privacy, scalability), defined for a DEX.
   Rows: none (definitions). Refs: none needed. Hedge: none.
2. What we built: `TokenFactory`, `MarketFactory`, one `OrderBook` per pair (escrow, price-time priority, execution at
   the maker price, stop-limit orders, bounded loops), wallet front end. Rows: S1, C5a. Refs: repository. Hedge: the
   scope sentence, stated once here: local Anvil chain, deterministic Foundry tests, no public deployment, no
   external audit.
3. Chosen issue and thesis: security, framed as economic security under transaction ordering. The book can stay
   solvent and every fill can respect its limit while value still moves to an attacker. Rows: S1, S9.
   Refs: `src08babel2023`. Hedge: do not say "first"; say the issue was found in our own audit (issue 007) and is
   reproduced and extended here.
4. Contributions, three bullets: (a) four attacks reproduced and measured with Foundry tests (E1 to E4, E8, E9);
   (b) two mitigations implemented in a research copy and measured, including what they fail to fix (E5 to E8, E10);
   (c) the remaining mitigations mapped to evidence strength. Plus one organisation sentence.
   Rows: C1b, C3d, M2a, M1d. Hedge: "reproduce and measure", never "discover"; M1 and M2 are not in the engine.

## II. Motivation and Literature Survey (P2 leads, 1.05)

### A. Why security over privacy and scalability (0.35)
1. For this DEX a security failure moves value; a privacy failure exposes intent; a scalability failure raises cost
   or delay. Rows: S1, S8. Refs: `src25beres2021` (profiling, background only). Hedge: S8 is about profiling users,
   not trading strategies.
2. The other two concerns show up as security losses here: the loop caps (a scalability choice) create C1, C3, C4;
   public limits and triggers (no privacy) make them targetable. Rows: S1, S5, S6. Refs: `src05qin2022` (S5).
   Hedge: S6 is a design inference from `IOrderBook.sol:49, 52`, say "we argue".
3. Moving to a cheaper layer does not remove the problem: L2 cuts L1 gas for an on-chain book but rollups still
   carry MEV. Rows: S3, M11f. Refs: `src09moosavi2023`, `src23torres2024`. Hedge: S3 is Rinkeby testnet and excludes
   L2 work; on rollups the extraction is back-running and arbitrage, sandwiches were absent.

### B. Survey by theme (0.55)
1. Ordering attacks and extractable value. Taxonomy (displacement, insertion, suppression), with on-chain books
   named as vulnerable; paid ordering through priority gas auctions; measured sandwich scale. Rows: C1c, C1e, C1d.
   Refs: `src02eskandari2019`, `src01daian2020`, `src05qin2022`, `src04zhou2021`. Hedge: [04] "first to formalize
   and quantify sandwich attacks" (p. 1) and it excludes limit order books; all measured numbers are on AMMs;
   [01] is PoW era.
2. Economic security as distinct from code bugs. Rows: S9, S10, C5c. Refs: `src08babel2023`, `src06zhou2023`.
   Hedge: [06] says "few academic papers" on oracle attacks; its counts cover Ethereum and BSC, Apr 2018 to Apr 2022.
3. Order books, stops and market design. Lissy measures on-chain book gas and argues a call market resists
   insertion and displacement; frequent batch auctions remove the speed race; self-trades are common on
   order-book DEXs; stops cluster and cascade. Rows: S2, M5a, M5b, C2d, C2f. Refs: `src09moosavi2023`,
   `src11budish2015`, `src12victor2021`, `src13osler2005`. Hedge: [11] no page numbers (2013 draft read);
   [12] self-trade majority is EtherDelta only; [13] is FX, 1990s data, stops private, deliberate stop running is
   only market lore.

### C. The gap (0.15)
1. We did not find a measurement of front-running on a smart-contract limit order book (gap a), nor a study of stop
   hunting in crypto markets (gap b), so C1 to C3 rest on our own tests plus analogy. Rows: C1d caveat;
   `../notes/PHASE4_GAPS.md` a, b. Refs: none new. Hedge: "we did not find", never "none exists".

## III. Observations and Analysis (P1 leads, 1.90)

### Opening, no subsection heading: system and threat model (0.35)
Stage 3 decision (2026-11-25): Section III is an unheaded opening plus subsections A to D, matching the written
text. Point labels below (III.A.1 etc.) are kept as IDs for the opening.
1. Engine: full escrow, price-time priority by an internal sequence number, execution at the maker price; caps
   `MAX_MATCHES_PER_TX = 10`, `MAX_INSERT_SCAN = 100`, `LOT_SIZE = 1e9`. Rows: C1a, C3a, C4a. Refs: repository
   (`OrderBook.sol:18-21, 67-68`). Hedge: none.
2. Stops trigger on the last trade price, set by any fill of any size, including a self-trade; `matchOrders` and
   `triggerStopOrders` are permissionless and unpaid; any 18-decimal token can be listed; payouts are pushed.
   Rows: C2a, C2b, C5a, C5b, C6a. Refs: repository (`OrderBook.sol:291, 242-248, 103-119, 127-145, 296-298`;
   `MarketFactory.sol:27`). Hedge: none.
3. Adversary Mallory: sees pending transactions and the public book, places and cancels orders, calls keeper
   functions, may deploy a contract; does not control consensus. C1 additionally needs its back-run to land before
   any `matchOrders`; C3 in its one-transaction form does not. Honest actors Bob and Carol. Rows: C1b caveat, C3d.
   Hedge: ordering control is an assumption for C1 only (E9 keeper test).

### A. C1 fill-cap sandwich (0.55, includes Fig. 1)
1. Mechanism: ten one-lot asks use up Carol's ten fills; her remainder rests at her own limit, crossed with Bob's
   older, cheaper ask; Mallory sells into Carol at 2.0 and buys Bob's ask at 1.5. Fig. 1. Rows: C1a.
   Refs: repository (`OrderBook.sol:20, 67-68`; `OrderBook.Regression.t.sol:184` for issue 007). Hedge: Carol never
   pays above her limit; no escrow is lost.
2. Measurement: profit equals overpay exactly and grows linearly with limit slack (0.15 at 1%, 5.0 at 33%), at a
   fixed 3,910,616 attacker gas over 12 transactions. Rows: C1b. Table I rows 1, 2. Hedge: before gas; gas is a
   local Foundry 1.8.6 measurement; break-even K from 3.84 to 1278.57 (COST_MODEL), give the formula not a verdict
   unless prices are cited.
3. Ordering dependence: one keeper `matchOrders` (153,587 gas) before the back-run removes the profit, because the
   older order is maker (`OrderBook.sol:115`). Rows: C1b caveat (E9). Table I row 3. Hedge: keeper timing not
   measured.
4. Literature link: insertion on order books [02]; a crossed book captured by a bot [01]; sandwiching on AMMs
   [05] as the analogous measured case. Rows: C1c, C1f, C1d. Hedge: "analogous", "on AMMs"; [01] TokenStore was not
   fully on-chain matching.

### B. C2 with C3: stop-order manipulation (0.45)
1. C2 stop hunt: a one-lot self-trade moves the reference price to 1.95 and fires Carol's stop; her shortfall
   against 2.0 is 5.0, 3.0, 1.0 as honest depth grows 0, 5, 10. Rows: C2a, C2b, C2c. Table I rows 4, 5.
   Hedge: Mallory's gain is a paper gain marked at 2.0; part of the shortfall is ordinary stop slippage.
2. A minimum order size does not help: with 0.1 base the self-trade still nets to zero and the shortfall stays 5.0
   (E8). Rows: M1b. Table I row 6. Hedge: one minimum and one depth tested.
3. Literature: self-trades are common on order-book DEXs [12]; stops cluster and cascade [13]; a single wash trade
   can fix an on-chain price [09]. Rows: C2d, C2f, C2g. Hedge: as in II.B.3.
4. C3 stop snipe: the trigger call shares one ten-fill budget, so ten dust bids leave the activated stop resting
   crossed at its limit 1.0; Carol receives 10.000000011 instead of 20.0. Rows: C3a, C3b. Table I row 7.
   Hedge: the stop still executes within its own limit.
5. The snipe fits in one transaction (3,588,665 gas, same profit): no ordering around Carol's transaction is needed,
   only calling the trigger before an honest keeper. Rows: C3d, C3c (`src08babel2023` for ordering around a price
   source). Table I row 8. Hedge: keeper timing not measured; [08] is about liquidations and payouts, not stops.

### C. C4 dust wall, the security versus scalability trade-off (0.25)
1. 101 one-lot bids make every non-crossing bid revert `BookTooDeep`; clearing takes 11 transactions. Rows: C4a, C4b.
   Table I row 9. Hedge: crossing bids still work (not tested).
2. Capital-cheap (1.5e-7 quote locked) but gas-expensive: attacker 67,436,118 gas vs defender 8,056,221 (8.4x).
   The cap turns an unbounded-gas risk [15] into a revert by design. Issue 006 (a stop that could block all others)
   is fixed; dust can still cancel an activated stop. Rows: C4b, C4c, C4d. Refs: `src15grech2018`. Hedge: local gas;
   67.4M gas spans many blocks.

### D. C5 and C6 briefly (0.10)
1. C5: permissionless listing plus pushed payouts means a token that refuses transfers can block fills against an
   address; untested. Rows: C5a, C5b, C5d. Refs: `src15grech2018`. Hedge: "no test reproduces this"; C5e dropped.
2. C6: no reward for `matchOrders` or `triggerStopOrders`, and C1 and C3 both depend on who calls first. Rows: C6a,
   C6b. Refs: `src09moosavi2023`. Hedge: no timing data; design risk.

## IV. Proposed Solutions (P1 for A, P2 for B to D, 1.25 including Table II)
Per issue: change, code impact, implemented or not, measured effect, what remains.

### A. C1 and C3: no crossed rest (M2) with a minimum order size (M1) (0.45)
1. Change and code impact: when the fill budget runs out and the remainder still crosses, cancel and refund it
   instead of resting it (M2); reject orders below `minOrder` (M1). A few lines in
   `contracts/test/termpaper/OrderBookMitigated.sol`; reuses the `ZeroAmount` error. Rows: M1a, M2a. Hedge: research
   copy only, never in the engine; changes order-lifecycle semantics.
2. Measured effect: M2 removes the C1 profit (Carol pays 14.99999999999 after one resubmission) and the C3 profit,
   at +606, +26, +1071 gas on three calls. Rows: M2a, M2b, M2c. Hedge: one book shape for gas.
3. What remains: M2 alone turns theft into delay (one-lot dust: 1e-8 base per round, 1e9 rounds) and cancels Carol's
   stop in C3; M1 plus M2 bounds the delay to 10 rounds with the attacker losing 0.010 quote and paying 3.3x the
   victim's gas; M1 does not touch C2; which minimum is enough is open (only 0.1 tested). Rows: M2a caveat, M2b
   caveat, M1d, M1b. Hedge: attacker assumed to see every resubmission.

### B. C2: harden stop activation (M6, M7), untested design (0.20)
1. Only trades above a minimum size, or a time-weighted price, may move the trigger reference; optionally reject
   stops whose limit is far from the trigger. Not implemented. Rows: M6, M7. Refs: `src09moosavi2023` (wash-trade
   argument), `src06zhou2023` (oracle manipulation share). Hedge: weak or no evidence; say "untested design";
   E8 already shows a size floor on orders alone does not suffice.

### D (written as part of IV-D "Design directions"). Batch clearing (M5), design direction (0.20)
1. A frequent batch auction removes time priority inside a batch, so fill order within a block stops mattering for
   C1 and C3; Lissy's call market resists insertion and displacement but clears only 38 to 152 trades per block.
   Not implemented. Rows: M5a, M5b, M5e, M5d. Refs: `src11budish2015`, `src09moosavi2023`. Hedge: no production
   measurement of MEV reduction for batch DEXs was found (gap d); throughput figure uses the 2021 gas limit.

### C and D (as written): IV-C "C4, C5, C6 and the front end" holds M8, M9, M10, M12; IV-D "Design directions" holds M5, M4, M11; then Table II and the adoption order (0.15 + 0.25)
1. Ordering and confidentiality (M4, M11): commit and reveal costs a message and delay and can be gamed by selective
   reveal in a price-time book; no chain-level defence meets every requirement; verifiable sequencing still leaves
   miner profit; encrypted mempools have measured latency and flaws. Rows: M4a, M4b, M11a, M11c, M11d.
   Refs: `src20canidio2024`, `src02eskandari2019`, `src18heimbach2022`, `src21ferreira2023`,
   `src29choudhuri2024`. Hedge: [20] only when guessing is hard; [21] AMM setting.
2. M8 price-level book (C4): data structure choice changes book gas a lot. Row M8a. Ref `src09moosavi2023`.
   Hedge: a call-market priority queue, not our list.
3. M9 keeper reward (C6): a reward creates its own race. Rows M9. Refs `src01daian2020`. Hedge: argued, not measured.
4. M10 allowlist or pull payments (C5). Row M10. Ref `src15grech2018`. Hedge: trades away permissionless listing.
5. M12 tight limits in the front end: E1 shows a 0.1% limit shrinks the C1 loss to 0.015 but does not remove it.
   Row M12. Hedge: weak; no user study.

## V. Conclusion (Both, 0.20)
1. Restate the thesis with the two strongest results: the one-transaction stop snipe (C3d); M2 alone is not a fix
   and M1 plus M2 bounds the attack (M1d). Rows: C3d, M2a, M1d.
2. Limits in one sentence: local chain, keeper timing not measured, one minimum size tested. Future work: M3 clear
   before take, M6, M7, a minimum-size sweep. Rows: C6b, M1a, M3. Hedge: future work, not results.

---

## Mapping from the old eight-section outline (`OUTLINE.md`)

| Old bullet | Fate | New place |
|---|---|---|
| Abstract | kept | Front matter |
| I.1 Extractable value is measured, mostly AMMs | merged | II.B.1 |
| I.2 Gap on on-chain books | moved | II.C |
| I.3 System and thesis | kept | I.2, I.3 |
| I.4 Contributions (a) (b) (c) | kept, (c) reworded to mitigation mapping | I.4 |
| I.5 Organisation | kept | I.4 last sentence |
| II.1 Taxonomy | kept | II.B.1 |
| II.2 PGAs and MEV | kept | II.B.1 |
| II.3 Measured sandwiching ([04], [03], [05]) | kept, [03] dropped | II.B.1 |
| II.4 On-chain order books ([10], [09], [28]) | merged, [10] and [28] dropped | II.B.3 |
| II.5 Batch auctions ([11], [27]) | merged, [27] dropped | II.B.3, IV.C |
| II.6 Economic security ([07], [08]) | kept, [07] dropped | II.B.2 |
| II.7 L2 and rollup MEV ([22], [23]) | merged, [22] dropped | II.A.3 |
| III.1 Engine | kept | III.A.1 |
| III.2 Scalability caps | kept | III.A.1 |
| III.3 Stops on last trade price | kept | III.A.2 |
| III.4 Unrewarded keepers | kept | III.A.2 |
| III.5 Permissionless tokens, push payouts | kept | III.A.2 |
| III.6 Adversary model | kept | III.A.3 |
| III.7 Fig. 1 order flow | cut (space); the sequence figure carries the flow | Fig. 1 is now the C1 sequence |
| IV.1 C1 | kept | III.B |
| IV.2 C2 | kept, joined with C3 | III.C.1 to III.C.3 |
| IV.3 C3 | kept, joined with C2 | III.C.4, III.C.5 |
| IV.4 C4 | kept, framed as the security vs scalability trade-off | III.D |
| IV.5 C5 | cut to one sentence | III.E.1 |
| IV.6 C6 | cut to one sentence | III.E.2 |
| IV.7 Table I | kept, 13 rows to 9 | III |
| V.1 M1 | kept | IV.A |
| V.2 M2 | kept | IV.A |
| V.3 M4 commit and reveal | cut to one sentence | IV.D.1 |
| V.4 M5 batch auction | kept in depth as design direction | IV.C |
| V.5 M6, M7 | kept in depth as untested design | IV.B |
| V.6 M8, M9, M10 | cut to one sentence each | IV.D.2 to IV.D.4 |
| V.7 M11 | cut to one sentence | IV.D.1 |
| V.8 M12 | cut to one sentence | IV.D.5 |
| V.9 Table II | kept, 12 rows to 9 | IV.D |
| VI.1 Bounded loops create C1, C3, C4 | merged | II.A.2, III.D |
| VI.2 On-chain cost, L2 ([24] grey) | merged, [24] dropped | II.A.3 |
| VI.3 Transparency plus ordering is the root cause | merged | II.A.2 |
| VI.4 Privacy fixes cost latency and gas | merged | IV.D.1 |
| VI.5 Privacy background ([25]) | kept | II.A.1 |
| VII Local chain only, gas tied to forge 1.8.6 | merged | I.2 (scope), Table I caption |
| VII Keeper timing, one minimum tested | merged | V.2 |
| VII Sources not read ([14], [17]) | cut | not mentioned in the paper |
| VII Literature gaps a, b, d | merged | II.C (a, b), IV.C (d) |
| VII Future work M7, M6, M3, sweep | merged | V.2 |
| VIII Conclusion | kept | V |
| Fig. 2 C1 sequence | kept, renumbered | Fig. 1 |
| Fig. 3 E1 and E2 plots | cut to optional E1 only | Fig. 2 (cut first) |
| Table III mitigated engine | cut; numbers move to IV.A text | IV.A |
