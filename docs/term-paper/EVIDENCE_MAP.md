# Evidence map (Phase 5)

One row per claim the paper may make. Pointers:
- **Experiments:** test names in `contracts/test/termpaper/TermPaper.t.sol` (E1 to E7, numbers from
  `evidence/experiments.txt`) and `TermPaperGaps.t.sol` (E8 to E10, numbers from `evidence/experiments-gaps.txt`);
  tables in `evidence/README.md`; E11 break-even in `evidence/COST_MODEL.md`. Forge 1.8.6.
- **Code:** `file:line` at commit 96107ad (`contracts/src/` unchanged on this branch).
- **Papers:** `[NN] p. X` = PDF page of the copy read (see `notes/NN-*.md` section 1 for version; for [11] the
  2013 draft, not QJE). "F3" = finding 3 in that note.

Strength: **strong** = reproduced here or measured in a peer-reviewed source on the same mechanism; **moderate** =
peer-reviewed but analogous (AMM, TradFi, other venue) or argued not measured; **weak** = grey literature, a
single indirect source, or reasoning only.

## A. Considerations (C1 to C6)

| # | Claim | Evidence type | Exact pointer | Strength | Caveat |
|---|---|---|---|---|---|
| C1a | The fill cap lets 10 one-lot orders use up a taker's fills so its remainder rests crossed at its own limit | Code | `OrderBook.sol:20` (`MAX_MATCHES_PER_TX = 10`), `:67-68` (match up to cap, then `_insert` remainder), `:115` (in `matchOrders` the earlier `bookSeq` is maker) | strong | Behaviour, not impact |
| C1b | An attacker profits exactly the victim's overpay, linear in limit slack: 0.015 / 0.15 / 0.75 / 5.0 quote at 0.1% / 1% / 5% / 33% slack on a 10-base buy | Experiment | `test_E1_sandwich_limitSlackSweep`; closed form asserted `TermPaper.t.sol:146-148`; issue 007 pinned by `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` (`OrderBook.Regression.t.sol:184`) | strong | Profit is not net of gas (attacker 3.91M gas over 12 tx; break-even K = 3.84 to 1278.57 in `evidence/COST_MODEL.md`). Needs ordering control: `test_E9_keeperClearsBeforeBackrun_sandwich` shows one keeper `matchOrders` (153587 gas) before the back-run removes the profit |
| C1c | Fully on-chain order books are vulnerable to insertion and displacement | Paper | [02] p. 7 Sec. 4.1 (F3); [02] p. 4 Sec. 3 order-book insertion example (F2) | moderate | Taxonomy and argument, no measurement on a contract book |
| C1d | Sandwiching is a large, measured phenomenon (on AMMs) | Paper | [05] p. 4 Sec. IV-A2: 750,529 sandwiches, 174.34M USD; [03] p. 1 to 2: 199,725 attacks, 18.41M USD; [04] p. 1 formal model | moderate | AMM only; [04] p. 1 explicitly excludes limit order books. No measurement on contract order books found (Phase 4 gap a) |
| C1e | Anyone can buy ordering position with fees | Paper | [01] p. 1, p. 5 to 6 Sec. III-C (PGAs, F1); [04] p. 10 to 11 Sec. VI-A: 78.53% of blocks ordered by gas price | moderate | PoW-era Ethereum; today builder/relay markets ([05] p. 4: 31.98% of sandwiches privately relayed) |
| C1f | A crossed order book is captured by bots in practice | Paper | [01] p. 4 to 6 Sec. III-B/C (TokenStore cross executed by a bot, F3) | moderate | Single worked example; TokenStore was not fully on-chain matching |
| C2a | Any single fill, of any size, sets the stop reference price | Code | `OrderBook.sol:291` (`lastTradePrice = price` on every fill), `:242-248` (`_eligibleStop` compares to `lastTradePrice`), `:18` (`LOT_SIZE = 1e9`) | strong | |
| C2b | Self-trades are allowed, so the price move costs gas plus nothing net | Code + spec | `OrderBook.sol:251-268` (`_matchTaker` has no trader check); `SPEC.md:232` | strong | |
| C2c | A one-lot self-trade fires a victim's stop; loss set by depth between trigger and limit (5.0 / 3.0 / 1.0 quote shortfall at depth 0 / 5 / 10) | Experiment | `test_E2_stopHunt_depthSweep`; `TermPaper.t.sol:179-180` asserts the price move and activation | strong | Attacker "gain" is a paper gain marked at 2.0; part of the shortfall is ordinary stop slippage |
| C2d | Wash trades and self-trades happen on real order-book DEXs | Paper | [12] p. 9 Table 2: 159M USD wash volume on IDEX and EtherDelta; p. 7 Sec. 6.1: 58,791 self-trades on EtherDelta (F4) | strong | Measured on off-chain-matched order-book DEXs, 2017 to 2020 era |
| C2e | Self-trade prevention alone is weak because accounts are free | Paper | [12] p. 7 Sec. 6.1 ("could easily be prevented", F7) and p. 1 Sec. 1 (account creation "virtually cost-free", F8) | moderate | |
| C2f | Stop orders cluster and their triggering amplifies moves (cascades) | Paper | [13] p. 1, p. 7 Sec. I-A (clustering, F3, F4), p. 16 to 18 Sec. IV (F6) | moderate | FX market, 1990s data; deliberate "running the stops" only as market lore (p. 3, F7); cascades assume stops are private (p. 9, F8), ours are public |
| C2g | A single wash trade can fix a manipulable on-chain price | Paper | [09] p. 19 App. D (F10), Lissy withholds a clearing price for this reason | moderate | Argument in an order-book paper, not measured |
| C2h | Cheap price manipulation of on-chain reference prices (TWAP) | Paper | [14] not read | none | Download failed (ePrint 403); cannot cite findings |
| C3a | `triggerStopOrders` shares one 10-fill budget across the call, so dust can make an activated stop rest crossed | Code | `OrderBook.sol:131` (`budget = MAX_MATCHES_PER_TX`), `:141-142` (match with remaining budget, then rest) | strong | |
| C3b | Snipe: victim receives 10.000000011 instead of 20.0 quote; attacker profit 9.999999989 quote | Experiment | `test_E3_stopSnipe_originalEngine` | strong | Attacker must call trigger before any honest keeper. A keeper `matchOrders` between trigger and back-run defeats it (`test_E9_keeperClearsBeforeBackrun_snipe`), but `test_E9_atomicSnipe_noOrderingNeeded` does all steps in 1 tx (3588665 gas, same 9.999999989 profit), so no back-run race exists |
| C3c | Ordering around a price source lets a block producer trigger liquidations or payouts | Paper | [08] p. 18 Sec. 4.2 (F7) | moderate | Maker/betting contracts, not stop orders |
| C3d | The snipe needs no ordering around a victim transaction: dust, trigger and back-run fit in one transaction | Experiment | `test_E9_atomicSnipe_noOrderingNeeded`: victim receives 10.000000011, attacker +9.999999989 in 1 tx, 3588665 gas | strong | Only race is calling `triggerStopOrders` before an honest keeper; keeper timing not measured |
| C4a | 101 resting orders at or better than a price make new placements revert | Code | `OrderBook.sol:21` (`MAX_INSERT_SCAN = 100`), `:314` (`BookTooDeep`), `:328` (scan limit) | strong | |
| C4b | 101 one-lot bids block every non-crossing bid; clearing takes 11 tx | Experiment | `test_E4_dustGrief_blocksBidSide`; asserts `TermPaper.t.sol:278-282, 298` | strong | Attacker gas 67.4M is 8.4x defender gas 8.06M (`evidence/COST_MODEL.md`); capital locked only 1.515e-7 quote. Cheap in capital, not in gas |
| C4c | The same dust blocked all stop activations before issue 006 was fixed | Code + tests | `docs/ai-audit/issues/006-*.md`; `test_trigger_unplaceableStopIsCancelledAndDoesNotBlockOthers` (`OrderBook.Stop.t.sol:620`) | strong | Now an auto-cancel, so dust can still cancel others' activated stops (SPEC section 8) |
| C4d | Loops whose length an attacker can grow are a known gas DoS class | Paper | [15] p. 6 Sec. 3.1 unbounded mass operations (F3); [16] p. 16 GovernMental (F5) | moderate | Our loops are bounded, so the risk moves from out-of-gas to revert-by-design; [15] p. 23: growing an array costs about 10x iterating it (F10) |
| C4e | Production order-book venues cap orders and rate-limit | Paper (grey) | [32] Rate limits: open orders 1000 to 5000 per user; 1 request per 1 USDC traded | weak | Vendor docs; app-specific L1, not EVM; minimum order value not found |
| C5a | Anyone can create a market for any 18-decimal token | Code | `MarketFactory.sol:27` (`createMarket` permissionless); `TokenFactory.sol:25` (any name and symbol) | strong | |
| C5b | Push payouts let a refusing token block fills against an address | Code + spec | `OrderBook.sol:296-298` (`safeTransfer` inside settlement), `SPEC.md:256` | moderate | **No test** reproduces a blocking token; reentrancy is tested (`ReentrantERC20` mock) |
| C5c | Hostile or look-alike contracts are a frequent real attack vector | Paper | [06] p. 12 Sec. VI Insight 4: 19 (10.5%) incidents used contracts with expected ABI but harmful logic (F5) | moderate | Not specific to token listing on order books |
| C5d | Push-payment DoS by a reverting recipient is a known pattern | Paper | [15] p. 7 to 8 Sec. 3.2 wallet griefing (F5); [16] p. 14 to 15 King of the Ether (F6) | moderate | |
| C5e | Look-alike symbols mislead users | none | not found | none | No source found; only `TokenFactory.sol:25` shows symbols are free text |
| C6a | `matchOrders` and `triggerStopOrders` pay no reward | Code + spec | `OrderBook.sol:103-119`, `:127-146` (no transfer to caller); `SPEC.md:222, 258` | strong | |
| C6b | Contracts need incentivised keepers; unrewarded keeper tasks can be left undone | Paper | [07] p. 2 Sec. 2.2, p. 10 Sec. 6.1 (F6); [09] p. 11 to 12 Sec. 6.3, "who pays to close" (F9) | moderate | No measurement of how long crossed books or eligible stops wait |
| C6c | A crossed book breaks price-time priority until cleared | Test | `test_match_crossedBookNewTakerFillsOppositeHeadAheadOfOlderOrder` (`OrderBook.Match.t.sol:294`); `SPEC.md` section 8 | strong | |

## B. Mitigations (M1 to M12)

| # | Claim | Evidence type | Exact pointer | Strength | Caveat |
|---|---|---|---|---|---|
| M1a | A minimum order size rejects one-lot dust | Experiment | `test_E5_dustBelowMinimumIsRejected` (minOrder 0.1e18); `OrderBookMitigated.sol:66, 98` | strong (for the check) | Only one placement tested; reuses `ZeroAmount`; no test shows any minimum makes C1, C3, C4 unprofitable |
| M1b | A minimum does not stop the stop hunt (C2): the self-trade nets to zero | Experiment | `test_E8_stopHunt_withMinOrder` (minOrder 0.1e18): 0.1-base self-trade moves the price to 1.95, stop activates, victim receives 15.0 (shortfall 5.0, same as E2 depth 0) | strong | One minimum (0.1) and one depth tested. The older `test_E7_stopHunt_stillWorksOnMitigatedEngine` runs with minOrder = 0; cite E8 instead |
| M1d | M1 plus M2 bounds the repeated front-run delay | Experiment | `test_E10_mitigatedSandwich_repeated_M1andM2`: filled in 10 rounds, paid 14.99; attacker -0.010 quote and 32.1M gas vs victim 9.77M | strong | Attacker assumed to see every resubmission |
| M1c | Production venues use lot/tick grids and caps | Paper (grey) | [32] Tick and lot size; [28] p. 5 Sec. 4.1 (minimum unit, F9) | weak | Not a minimum order size in the M1 sense |
| M2a | Cancelling a still-crossed remainder removes the C1 profit | Experiment | `test_E5_sandwich_onMitigatedEngine`: victim pays 14.99999999999; attacker quote +1.499e-8, base -1e-8 | strong | Victim must resubmit. Repeated attack measured in `test_E10_mitigatedSandwich_repeated_M2only`: with M2 alone and one-lot dust the victim gets 1e-8 base per round (5 rounds: 5e-8 base, 4.92M gas), so 1e9 rounds to fill. Theft becomes indefinite delay unless M1 is also set (M1d) |
| M2b | Same rule stops the C3 profit | Experiment | `test_E7_stopSnipe_onMitigatedEngine`: attacker quote -2.1e-8; book not crossed | strong | Victim's stop is **cancelled**: only 1e-8 base sold, 9.99999999 refunded; stop-loss protection lost |
| M2c | M2 is cheap | Experiment | `test_E6_gasOverheadOfMitigation`: +606, +26, +1071 gas | strong | One book shape; identical overhead in the reference run |
| M3 | Clearing crossings before a new order takes | none | not implemented; [01] F3 and [21] F7 only analogous | weak | No experiment and no direct source |
| M4a | Commit and reveal blocks the most severe front-running at the cost of one extra message and one block of delay | Paper | [20] p. 16 Sec. 3.1 Prop. 2 (F5), p. 16 (F6), p. 16 to 17 Sec. 4 (F7) | moderate | Only when guessing is hard (Prop. 2); not for on-chain auctions (p. 27 to 28, F10); theory |
| M4b | In a price-time queue, committed orders can be sprayed and selectively revealed | Paper | [02] p. 15 Sec. 6.2 (F8) | moderate | Directly relevant to an order book; argued |
| M4c | On-chain commit and reveal scores low on cost and delay | Paper | [18] p. 10 to 11 Sec. 5.6 (F6) | moderate | Survey scoring |
| M5a | Batch auctions make speed worth delta/tau and compete on price | Paper | [11] p. 6 to 7, p. 45 to 47 Sec. 7.2 Prop. 8 (F6) of the 2013 draft | moderate | TradFi model; page numbers are the 2013 draft |
| M5b | Call markets resist insertion and displacement (no time priority within a call), suppression only partly | Paper | [09] p. 8 to 10 Sec. 5, Table 7 (F7) | moderate | Lissy is the closest on-chain design; time-priority tie breaks leave a case (p. 11) |
| M5c | FBA lowers costs versus CLOB on an order-book DEX | Paper | [27] p. 8 to 9 Sec. IV-C: CLOB realized spread 24% to 37% (BTC-USD), 21% to 34% (ETH-USD) higher | moderate | Simulated FBA on real dYdX data; spread, not MEV |
| M5d | Batch DEXs measurably reduce MEV in production | none | Phase 4 gap d: not found; [30] measures price improvement only (p. 15 to 16) | none | **Gap** |
| M5e | Batch execution costs throughput on-chain: Lissy closes 38 to 152 trades per block | Paper | [09] p. 6 to 7 Table 5 (F3), p. 1 (F4) | strong | 2021 gas limit 11,741,495 |
| M6 | Harden the stop reference price (time- or volume-weighted, minimum trade size) | Paper | [09] p. 19 App. D (F10); [07] p. 11 Sec. 6.4 (F5); [06] p. 12 Insight 3: 28 (15%) oracle-manipulation incidents (F4) | weak | No source designs a reference price for conditional orders (Phase 4 gap b); [14] not read |
| M7 | Trigger-to-limit band | none | not found | none | No source |
| M8a | Data structure choice changes on-chain book gas a lot | Paper | [09] p. 4 to 5 Sec. 3.1 Table 3: dequeue 50 items 557,085 to 2,781,684 gas across five designs (F2) | strong | Peer-reviewed measurement, but a priority queue for a call market |
| M8b | Price-level books with bitmaps can make lookups constant | Paper (grey) | [33] Sec. 3, Sec. 5 (F2, F5) | weak | Estimates, no code |
| M8c | Price-keyed tries scale batch exchange off-EVM | Paper | [28] p. 1, p. 6, p. 8 to 9 | moderate | Native code, no gas |
| M9 | Keeper reward | Paper | [07] p. 10 Sec. 6.1 (F6); [09] p. 11 to 12 (F9); [01] p. 10 to 14 (F4: rewards become PGA prizes) | moderate | Argued, no measurement; a reward creates its own race |
| M10 | Token allowlist or pull payments | Paper | [10] p. 12 Sec. 4.1.2 token registry (F7); [15] p. 7 to 8 (F5) | moderate | 0x registry was a plan in a white paper |
| M11a | Chain-level ordering defences exist but none meets all requirements | Paper | [18] p. 1, p. 11 Sec. 6, Fig. 11 p. 12 (F5) | strong | Survey judgement |
| M11b | Order-fairness as a consensus property; natural form impossible | Paper | [19] p. 1 Abstract, p. 4 Sec. 1.1; impossibility of receive-order-fairness Thm 4.3, 4.4 pp. 21 to 22 | moderate | Block-level fairness only |
| M11c | Verifiable sequencing still leaves risk-free miner profit | Paper | [21] p. 25 Sec. 6 (impossibility, deterministic rules, constant-product AMM) | moderate | AMM setting |
| M11d | Encrypted mempools have measured costs and real flaws | Paper | [29] p. 6 to 7 Sec. 3 (Shutter malleability, no pending privacy), p. 12 Table 2 (2818.6 ms partial decryption, 512 tx) | strong | Gas per ciphertext is estimated (p. 14 Table 3) |
| M11e | Live threshold-decryption latency is about 1 to 3 s | Paper (grey) | [31] Results, Figure 1 | weak | Vendor forum post |
| M11f | Rollups without a public mempool still have MEV | Paper | [23] p. 2 Sec. 1, p. 4 Sec. 2.3 (no public mempool, F2, F3), p. 7 Sec. 4 (arbitrage on Arbitrum 7.2x Ethereum in Apr 2023, F4) | strong | Sandwiches absent; extraction is back-running/arbitrage |
| M12 | Frontend guards (tight limits, self-trade warnings) | Spec + paper | Issue 007 advice "use a tight limit price" (`SPEC.md` section 8); [04] p. 2, p. 13 Sec. IX (slippage trade-off, F8) | weak | E1 shows tight limits shrink loss (0.015 at 0.1% slack) but do not remove it |

## C. Security versus Privacy versus Scalability

| # | Claim | Evidence type | Exact pointer | Strength | Caveat |
|---|---|---|---|---|---|
| S1 | The bounded loops are a scalability choice that creates C1, C3, C4 | Code + experiments | `OrderBook.sol:20-21`; E1, E3, E4 | strong | |
| S2 | On-chain books are expensive; earlier DEXs moved books off-chain for gas | Paper | [10] p. 4 Sec. 2 (F1); [09] p. 6 to 7 Table 5 | strong | |
| S3 | L2 cuts L1 gas for an on-chain book by 99.88% | Paper | [09] p. 7 Table 6: 6,569 vs 5,372,679 L1 gas for a 38-pair close | moderate | Excludes 508,250 ArbGas of L2 work; Rinkeby testnet |
| S4 | Moving to L2 does not remove MEV and adds spam | Paper | [23] (MEV on rollups); [24] "over 50% of gas" on Unichain, Base, OP Mainnet; OP Mainnet ~57% gas, ~9% fees | moderate | [24] grey; "under a tenth of fees" holds for OP Mainnet only (Base 14%) |
| S5 | Transparency plus unilateral ordering is the root cause of extractable value | Paper | [05] p. 13 Sec. VII (F4); [03] p. 15 Sec. 6.2 (F8) | strong | |
| S6 | Public stops and limits are what make C1 to C3 targetable | Code + paper | `IOrderBook.sol:49, 52` (`getOrder`, `getBook` are public views); [13] p. 9 (cascades argued for private stops) | moderate | Inference from design; no source measures stop visibility |
| S7 | Privacy fixes (encryption, commit and reveal) cost latency and gas | Paper | [29] p. 12 Table 2; [20] p. 16; [18] p. 10 to 11 | moderate | |
| S8 | Ethereum users can be profiled from public behaviour | Paper | [25] p. 7 Sec. 6: combined quasi-identifiers give 1.6 bits, anonymity set shrinks about 3.03x | moderate | Privacy dimension background; not about trading strategies |
| S9 | Economic security is less studied than technical security | Paper | [07] p. 1 (F1); [08] p. 1, p. 5 (EV as formal economic security, F1) | strong | Under [07]'s definition, atomic sandwiches are "technical" (p. 1, p. 6), so C1 may count as technical there |
| S10 | Oracle/price manipulation is common in incidents but under-addressed by papers | Paper | [06] p. 1 abstract, p. 12 Insight 3: 28 (15%) incidents | moderate | [06] says "few academic papers", not "under-studied" (word used only for network incidents) |
