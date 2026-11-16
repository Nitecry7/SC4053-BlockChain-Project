# Term paper research task (for Claude Code, run from the repo root)

Course: NTU SC4053 Blockchain Technology. Deliverable later: a 4 to 6 page IEEE conference paper analysing OUR DEX
(this repo) for one of Security, Privacy or Scalability. We chose Security, framed as transaction-ordering and
economic security. Your job is to build a verified evidence base on this laptop. You do NOT write the paper.

## Ground rules

1. Work on a new branch `term-paper/research`. Never change `contracts/src/`, `web/`, or existing files under `docs/`.
2. Put everything under `docs/term-paper/`. Commit locally at the end of each phase. Do not push.
3. This repo is public. Add `docs/term-paper/papers/*.pdf` and `docs/term-paper/papers/*.html` to `.gitignore`
   before downloading anything, so downloaded papers are never committed. Notes and indexes are committed.
4. Legal sources only: arXiv, IACR ePrint, USENIX, publisher open-access pages, authors' own pages. No Sci-Hub, no
   paywall bypass. If there is no open copy, record the entry as "needs NTU library access" and move on.
5. Evidence only. Every statement in your notes needs a page or section number from a file you actually opened, or a
   test name and output line, or a `file:line` in this repo. Never fill a gap from memory. Say "not found" when it is.
6. No paper prose. Write notes, tables and bullet points. Quote at most one short sentence per source, with page.
7. Never use em dashes or en dashes in any file you write.
8. If a download, build or test fails, record the exact error and continue with the rest. Do not hide failures.

## Context: what the paper argues

System: a fully on-chain limit order book. `contracts/src/OrderBook.sol` holds escrow, matches by price-time
priority, caps work per call (`MAX_MATCHES_PER_TX = 10`, `MAX_INSERT_SCAN = 100`), and has permissionless
`matchOrders` and `triggerStopOrders`. Stops trigger on `lastTradePrice`. Minimum order is one lot (`1e9`).
Read `SPEC.md` section 8, `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md` and `docs/ai-audit/issues/006*` and `007*` first.

Thesis: the limits added for scalability (bounded loops) and the transparency that removes privacy (public limits
and triggers) combine into ordering attacks, so economic security is the main concern.

Considerations:
- C1 Fill-cap sandwich of a limit order (issue 007). Dust orders use up the taker's 10 fills, the remainder rests
  crossed at its own limit, the attacker trades against it at that limit.
- C2 Stop hunt. A one-lot self-trade moves `lastTradePrice` and fires a victim's stop.
- C3 Stop snipe. Dust uses up the shared fill budget in `triggerStopOrders`, the activated stop rests crossed.
- C4 Dust wall. 101 one-lot orders make later inserts revert with `BookTooDeep`.
- C5 Permissionless tokens and listing (hostile token, push payouts, look-alike symbols).
- C6 Unrewarded keepers (crossed books and eligible stops wait for a caller).

Mitigations under study: M1 minimum order size, M2 no crossed rest (cancel and refund), M3 clear crossings before
taking, M4 commit and reveal, M5 frequent batch auction, M6 harden the stop reference price, M7 trigger to limit
band, M8 price-level book, M9 keeper reward, M10 token allowlist or pull payments, M11 chain-level ordering
protection, M12 frontend guards.

## Phase 0: set up

- Create `docs/term-paper/{papers,notes,evidence}`.
- Files I downloaded are in `docs/term-paper/inbox/`. Copy `TermPaper.t.sol` and `OrderBookMitigated.sol` to
  `contracts/test/termpaper/`. Copy `termpaper-results.txt` to `docs/term-paper/evidence/reference-run.txt`.
- `OrderBookMitigated.sol` is a research copy of `src/OrderBook.sol` with two changes marked M1 and M2. Diff it
  against the source and confirm those are the only behavioural changes. Report anything else.

## Phase 1: reproduce the experiments

1. From `contracts/`: `forge test --match-path "test/termpaper/*" --isolate -vv`. If the gas helper fails on our
   Foundry version, fix only `_lastCallGas()`.
2. Run the full existing suite and confirm it still passes.
3. Save raw output to `docs/term-paper/evidence/experiments.txt`, with the forge version and commit hash on top.
4. Write `docs/term-paper/evidence/README.md`: one table per experiment (E1 to E7) built only from that output.
   List every number that differs from `reference-run.txt`.
5. Review each test independently: one line on what it proves, and any assumption that fails on a public chain.

## Phase 2: download the sources

Save each as `docs/term-paper/papers/NN-firstauthor-year.pdf` (save [24] as HTML). After each download check the
file starts with `%PDF`, is not an error page, and that the title on page 1 matches. Then write
`docs/term-paper/papers/INDEX.md`: id, full citation, URL used, local file, status.

| ID | Source | Open copy |
|---|---|---|
| 01 | Daian et al., Flash Boys 2.0, IEEE S&P 2020 | https://arxiv.org/pdf/1904.05234 |
| 02 | Eskandari, Moosavi, Clark, SoK Transparent Dishonesty, FC 2019 workshops | https://arxiv.org/pdf/1902.05164 |
| 03 | Torres, Camino, State, Frontrunner Jones, USENIX Security 2021 | https://arxiv.org/pdf/2102.03347 |
| 04 | Zhou et al., High-Frequency Trading on Decentralized On-Chain Exchanges, IEEE S&P 2021 | https://arxiv.org/pdf/2009.14021 |
| 05 | Qin, Zhou, Gervais, Quantifying Blockchain Extractable Value, IEEE S&P 2022 | https://arxiv.org/pdf/2101.05511 |
| 06 | Zhou et al., SoK Decentralized Finance (DeFi) Attacks, IEEE S&P 2023 | https://arxiv.org/pdf/2208.13035 |
| 07 | Werner et al., SoK Decentralized Finance (DeFi) | https://arxiv.org/pdf/2101.08778 |
| 08 | Babel et al., Clockwork Finance, IEEE S&P 2023 | https://arxiv.org/pdf/2109.04347 |
| 09 | Moosavi, Clark, Lissy: Experimenting with On-Chain Order Books | https://arxiv.org/pdf/2101.06291 |
| 10 | Warren, Bandeali, 0x white paper, 2017 | https://www.exodus.com/assets/docs/zrx-whitepaper.pdf (prefer an official 0x copy if you find one) |
| 11 | Budish, Cramton, Shim, Frequent Batch Auctions, QJE 2015 | https://doi.org/10.1093/qje/qjv027 (open access) |
| 12 | Victor, Weintraud, Wash Trading on Decentralized Exchanges, WWW 2021 | https://arxiv.org/pdf/2102.07001 |
| 13 | Osler, Stop-Loss Orders and Price Cascades, FRBNY Staff Report 150 | https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf |
| 14 | Mackinga, Nadahalli, Wattenhofer, TWAP Oracle Attacks: Easier Done than Said? | https://eprint.iacr.org/2022/445.pdf |
| 15 | Grech et al., MadMax, OOPSLA 2018 | https://doi.org/10.1145/3276486 |
| 16 | Atzei, Bartoletti, Cimoli, Survey of Attacks on Ethereum Smart Contracts, POST 2017 | https://eprint.iacr.org/2016/1007.pdf |
| 17 | Baum et al., SoK Mitigation of Front-Running in DeFi, FC 2022 workshops | https://eprint.iacr.org/2021/1628.pdf |
| 18 | Heimbach, Wattenhofer, SoK Preventing Transaction Reordering Manipulations, AFT 2022 | https://arxiv.org/pdf/2203.11520 |
| 19 | Kelkar et al., Order-Fairness for Byzantine Consensus, CRYPTO 2020 | https://eprint.iacr.org/2020/269.pdf |
| 20 | Canidio, Danos, Commitment Against Front-Running Attacks, Management Science 2024 | https://arxiv.org/pdf/2301.13785 |
| 21 | Ferreira, Parkes, Credible DEX Design via Verifiable Sequencing Rules, STOC 2023 | https://arxiv.org/pdf/2209.15569 |
| 22 | Gudgeon et al., SoK Layer-Two Blockchain Protocols, FC 2020 | https://eprint.iacr.org/2019/360.pdf |
| 23 | Torres et al., Rolling in the Shadows (MEV on rollups) | https://arxiv.org/pdf/2405.00138 |
| 24 | Miller, MEV and the Limits of Scaling, Flashbots, 2025 (grey literature) | https://writings.flashbots.net/mev-and-the-limits-of-scaling |
| 25 | Beres et al., Blockchain is Watching You, IEEE DAPPS 2021 | https://arxiv.org/pdf/2005.14051 |

## Phase 3: read each source and extract evidence

You may use subagents to read papers in parallel. For each source write `docs/term-paper/notes/NN-firstauthor-year.md`:

1. Verified citation in IEEE style: authors, title, venue, year, pages, DOI. Check against the PDF and the
   publisher or DBLP page. Note where the published version differs from the preprint you read.
2. Five to ten findings, each with a page or section number, in your own words.
3. Which of C1 to C6 and M1 to M12 each finding supports, and how directly (direct, analogous, background).
4. Limits: what does NOT transfer to an on-chain order book (most MEV papers study AMMs).
5. Claim check against the summaries below: supported, partly supported, or not supported, with the page.

Summaries to check:
- 01: bots compete in priority gas auctions for block position; introduces MEV; ordering dependence is a systemic risk.
- 02: taxonomy of displacement, insertion and suppression; fixes grouped as sequencing, commit and reveal, redesign.
- 03: over 11 million blocks, about 200 thousand attacks, 18.41 million USD attacker profit.
- 04: first formal model of sandwich attacks, on AMMs.
- 05: quantifies value from sandwiches, liquidations and arbitrage; links it to consensus risk.
- 06: 77 papers, 30 audit reports, 181 incidents, at least 3.24 billion USD lost; oracle attacks under-studied.
- 07: separates technical from economic security; the latter is less studied.
- 08: extractable value as a formal measure of economic security under composition.
- 09: on-chain call market; at most a few hundred executions per block on Ethereum; 99.88% gas reduction on
  Arbitrum; benchmarks five priority queue designs; call markets resist insertion and displacement.
- 10: on-chain order books are costly; proposes off-chain relay with on-chain settlement.
- 11: the continuous limit order book rewards speed by design; proposes uniform-price frequent batch auctions.
- 12: over 159 million USD of wash trades on IDEX and EtherDelta; self-trades common and easy to prevent.
- 13: clustered stop-loss orders contribute to price cascades.
- 14: cost of manipulating on-chain TWAP oracles; multi-block control makes it far cheaper.
- 15: classifies gas-focused vulnerabilities such as unbounded loops.
- 16: taxonomy of Ethereum contract vulnerabilities.
- 17: systematises cryptographic front-running defences and remaining attacks.
- 18: no current reordering defence meets all requirements.
- 19: order-fairness as a third consensus property.
- 20: commit and reveal blocks the most severe attacks at the cost of two messages and a delay.
- 21: verifiable sequencing rules; an impossibility result leaves some producer profit.
- 22: systematises layer-two protocols.
- 23: MEV is widespread on rollups without a public mempool.
- 24: spam bots use over half the gas on several rollups while paying under a tenth of fees.
- 25: Ethereum accounts can be profiled through behavioural quasi-identifiers.

## Phase 4: search for evidence on the gaps

Use web search. Add at most 8 new sources, peer-reviewed first, and label grey literature. Download and note them
exactly as in Phases 2 and 3, numbered from 26. Questions:

a. Front-running or sandwiching analysed on on-chain limit order book DEXs, not AMMs.
b. Stop-loss hunting or trigger-price manipulation in crypto or DeFi; reference price design for conditional orders.
c. Dust or spam order denial of service on on-chain order books; documented minimum order size or tick rules in
   production order book DEXs.
d. Batch auction DEXs in production and measured reduction in MEV.
e. Commit and reveal or encrypted mempool deployments and their measured costs.
f. On-chain order book data structures and gas (trees, tick bitmaps, heaps).

If a question has no credible source, say so. That is a finding.

## Phase 5: synthesis

1. `docs/term-paper/EVIDENCE_MAP.md`: one row per claim the paper may make. Columns: claim, evidence type (paper,
   experiment, code), exact pointer (source and page, or test name, or `file:line`), strength (strong, moderate,
   weak), caveat. Cover C1 to C6, M1 to M12, and the Security versus Privacy versus Scalability comparison.
2. `docs/term-paper/references.bib`: only verified entries. List unverified fields separately.
3. `docs/term-paper/OPEN_QUESTIONS.md`: claims with weak or no evidence, and what would close each one.

## Phase 6: report back in chat

Give counts (downloaded, failed, needing library access), every citation you corrected, every summary in Phase 3
that was not supported, experiment numbers that differ from the reference run, and the three weakest claims.
