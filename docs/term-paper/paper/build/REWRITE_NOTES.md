# Author rewrite (2026-11-27): coverage check and corrections

The author supplied reworded text for the abstract and Sections I to V. It was applied with the author's wording and
structure wherever the claim was right; only statements that contradict the evidence, the code or the cited papers
were corrected. Formatting kept as before: IEEE conference template, headings, Notation paragraph, Fig. 1, Tables I
and II and their captions, `%` pointer comments, `\cite` keys, cross-references and the reference list.

## 1. Core content coverage

All core content of the previous version is present in the supplied text: the three concerns, the system, the issue,
the four attacks and two measured mitigations, the motivation, the survey by theme, the gap, the notation, the threat
model, C1 to C6 with their evidence, M1/M2 with what remains open, M6/M7, M8 to M12, M4/M5/M11, the adoption order,
and the conclusion. Missing in the supplied text and restored: the E8 sentence that a minimum order size does not stop
the stop hunt, the "paper gain" hedge on Mallory's 5.0, the Victor et al. self-trade evidence, the scope statement in
full, the "we argue" hedge on C3's third reason, the limitation "did not reproduce C5 or C6", the extrapolation note on
the 10^9 rounds, and the abstract's limit of 180 words with no math or symbols (the supplied abstract was about 260
words and contained "109", a lost superscript of 10^9).

## 2. Corrections to the supplied text (statement as supplied -> as printed, reason)

### Abstract
| Supplied | Printed | Reason |
|---|---|---|
| "the adversary can then sweep the stop order at a price half of what the stop order was set at" | "sweeps a stop for half its proceeds in our test" | The stop executes within its own limit; the loss is half the proceeds in our setup (E3, E9) |
| "costly as the adversary would have to pay the gas cost to clear the dust orders 8.4 times greater than that of the defender to clear a single dust order" | "costs the adversary 8.4 times the gas needed to clear it" | 8.4 is building the wall vs clearing all of it (E4) |
| "a defender can absorb the theft by canceling the orders in the stop order ... delays the execution of the stop order by 109 rounds" | "canceling a still-crossed remainder removes the sandwich and snipe profits but, used alone, turns theft into an extrapolated billion-round delay and cancels the sniped stop" | M2 is an engine change, not a defender action; the delay is on the victim's order, 10^9 rounds extrapolated (E5, E7, E10) |
| about 260 words, "109" | 180 words, "billion-round", "33 percent" | Template: 150 to 180 words here, no math or symbols in the abstract |

### Section I
| Supplied | Printed | Reason |
|---|---|---|
| "Each token has a corresponding market" | "a separate market for each token pair" | MarketFactory.sol:27 |
| "Every state changing transaction has a lower bound, which reduces the gas cost" | "Every loop that changes state has a fixed limit, which keeps the gas of each call bounded" | Upper limits on loops, OB:20-21 |
| Duplicated sentence "Trade executions occur against the order ... rather than an AMM" | One sentence | Repetition |
| "fill-or-kill 'sandwich' attack" | "fill-cap sandwich" | The attack exploits the ten-fill cap; no fill-or-kill order exists |
| "Because one of these solutions delayed executions of stop orders, preventing an attack from extracting immediate value." | "including a case where one of them turns theft into a delay that we extrapolate to 10^9 rounds" | Fragment; the delay is of the sandwich victim's fill (E10) |
| Blockchain not explained | Restored one clause | The template asks the introduction to describe blockchain |

### Section II
| Supplied | Printed | Reason |
|---|---|---|
| "Embedding two addresses in the same transaction reduces the anonymity set by a factor of three" | "combining two embeddings of an address's position in the transaction graph shrank a user's anonymity set about threefold" | [25] p. 7 |
| "This would reveal a user's trading strategy" | "Linked addresses could reveal a trader's strategy, although that study links accounts rather than strategies" | Inference; [25] does not study strategies |
| "Three of the four attacks ... are therefore best answered within loop boundaries" | "three of our four attacks run through loop bounds we introduced to save gas" | Meaning garbled |
| "They claim that extractable value will remain" | "Qin et al. argue ..." | "They" had no antecedent |
| Eskandari "written prior to the development of fully on-chain order books" | "written while such books were still being built by several projects" | [02] p. 7 says they were being pursued |
| Daian "bots could successfully implement front running attacks to increase gas price" | "observed bots ... bidding up gas prices in priority gas auctions to buy an early place in the transaction order" | [01] p. 1 |
| Zhou 2021 "and therefore do not include limit order books" | "and they explicitly exclude limit order books" | No causal link in [04] |
| "AMMs reserve the right to perform sandwiches on trades by removing and replacing liquidity" | "a sandwich moves the reserves before the victim's trade and restores them after" | [04] F1; AMMs do not perform sandwiches |
| "front running attacks involve trading against the order of the victim [9]" | Ferreira cited only for "the book must store and match"; the attacker consequence marked "we argue" | [21] p. 2 to 3 does not make the attack claim |
| "Our stop price is an example of a price oracle attack" | "our stop trigger is such a price" | The trigger is a price reference, not an attack |
| Lissy: "orders are matched with the best price first, so the order of transaction arrival determines ..." | Attributed to OUR continuous book, not Lissy | Lissy is a call market (F1, F7) |
| Lissy: "front-running to execute an order at the same price ... improbable ... miner to include a higher price" | Suppression costly; hybrid attack defused by paying the miner; exact price tie broken by time, improbable but possible | [09] p. 8 to 11 |
| "orders can only be displaced until after the call ... therefore require a more complex data structure" | Two separate reasons Lissy has no cancellation | [09] p. 11 |
| Budish "not applicable to a blockchain environment" | "their evidence comes from futures and equity markets, not a blockchain" | Overclaim |
| Heimbach "if the cost of each transaction is sufficiently low, it is more effective to use multiple transactions ..." | Removed | Not in [18] |
| Canidio "For contracts that resolve competing claims such as auctions, a Reveal commit message can also be used" and "best defense ... unpredictable number of orders" | "their model excludes contracts that resolve competing claims, such as auctions" | Inverted; [20] p. 27 to 28 |
| "Only the more profitable ones [6] are implemented." | "an attacker can commit several orders and reveal only the profitable ones [6]" | Fragment; [02] p. 15 |
| "Measuring latency to decrypt ... is one defense mechanism [10], [11]" | Choudhuri [15] measure their own scheme's latency and report a fixed flaw in a different deployed one | Wrong references; [29] |
| "there are bound to be flaws in an implementation" | Removed | Overclaim |
| "Other attacks are expected to be similar in nature." | Removed | Unsupported |

### Section III
| Supplied | Printed | Reason |
|---|---|---|
| "prices are quoted in the base token" | "prices are quote tokens per base token" | Price = quote per base |
| "Order amounts are in multiples of 0.00000001 tokens; one lot is 0.00000001 tokens" | Multiples of 10^9 units; one lot is 10^-9 token | LOT_SIZE = 1e9 of 1e18 (OB:18) |
| "best price may be specified as 1, 2, or 3 best ask ... C1, C2, and C3" | C1 to C6 are the considerations (fill-cap sandwich ... unpaid keepers) | C labels are the attacks and risks |
| "attacks E1 to E11" | "experiments E1 to E11" | E labels are tests (E11 is the cost model) |
| "Profits are stated in local Foundry 1.8.6 gas units" | "All gas figures for our engine are local Foundry 1.8.6 measurements, and all profits are stated before gas" | Profits are in quote tokens |
| "Orders in the book may cross the best price (i.e. a maker order)" | Removed | Wrong definition of maker |
| "Callers that make no payment (maker calls) are rewarded no ether" | "anyone may call matchOrders ... or triggerStopOrders ..., without any reward; we call such callers keepers" | Keepers, not makers |
| "becomes a sell limit order with the price of the stop order" | "becomes a sell limit order at L" | The limit price, not the trigger |
| Threat model: "read-only access", "cannot ... execute transactions against other traders' orders", "This is because she has no control over the consensus" | Sees pending transactions and the book; cannot move others' escrow or fake their orders; no control over consensus | She does trade against others' orders; consensus is a separate limit |
| "Any order execution advantage is likely assumed to be purchased" | "which we assume can be bought with fees" | Grammar |
| C1: "added to Mallory's book", "The engine checks if an opposing order is still there" | Remainder goes into the book at the victim's limit; the engine does not check for a cheaper opposing order | OB:67-68 |
| C1: "Bob rests an order to buy 10 at 1.5, and Mallory then places 10 orders to buy 1 lot at 1.499" | Bob rests an ask; Mallory places ten one-lot asks | E1 setup |
| C1: "This leaves 10 base at 1.49999999 ... Since the bid is less than Bob's ask, Bob is now the maker ... sells him the 9 base" | Remaining 9.99999999 base rest as a bid at 2.0 crossed with Bob's ask; Carol is the maker; Mallory sells her 9.99999999 base at 2.0 | E1, OB:276 |
| Impact: "excess gas price unexploited", "quote gas" | Loss is the gap to the best resting price; amounts in quote | E1 |
| "K is 4 and 1,300" with no definition | K defined (E11), with the gas-only and order-of-magnitude caveats | COST_MODEL |
| Ordering: "leaves Mallory with a quote of 10-11 ... left with a quote of 10-8" | Mallory 10^-11 quote worse off when the 10^-8 base she sold is valued at 1.5 | E9 |
| "providing liquidity against the victim's order"; AMM: "the pool price does not change" | Trades against the victim at the victim's price; an AMM sandwich moves the pool price | [02] p. 4; [04] |
| C2: "the engine won't allow a trader to fill her own order" | The engine does not stop a trader filling her own order | OB:251-265; this is what makes C2 possible |
| C2: "ask of 10 at 1.95", "20 base / 15 base", "gains 5 base", "filled at 1.90", "self trade at 100% slippage" | One-lot ask at 1.95; 15.0 vs 20.0 quote; 5.0 paper gain; shortfall 5.0/3.0/1.0 with depth | E2 |
| "II-C There are no studies of crypto here." | "we found no crypto study of it (Section II-C)" | Fragment |
| C3: "cease sniping", "Bob, then, places", "remaining 0.000000011 of its base", "Carol gets 20.000000011 instead of 20.00", "9.999999989 gas" | Stop snipe; Bob bids 10 at 2.0; remaining 9.99999999 base; Carol receives 10.000000011 instead of 20.0; profit 9.999999989 quote | E3, E9 |
| "If there was an order for OrderMatching the entire spread ... like C2" | An honest matchOrders between trigger and back-run defeats the two-step version; the one-transaction form does not need ordering | E9 |
| "C3 is the stronger solution" | "C3 is the stronger finding" | It is an attack |
| C4: "costing 8,056,221 gas for Mallory", "The quote was significantly deeper", "gas is the main limitation", "gas is extremely cheap" | Defender 8,056,221 gas, Mallory 67,436,118; gas the attacker's only barrier "we argue", weak where layer-one gas per operation is small | E4; S3 caveat |
| Bug 006: "allowed a stop order to be placed at the head ... The wall can now be removed and still cancel" | An unplaceable stop at the head of the stop list, behind dust, reverted every trigger call; the fix cancels and refunds; the wall can still cancel another trader's stop | issue 006 |
| C5: "a token that is set to be transferred to a given address", "unconfirmed transaction", "No test was able to reproduce this" | A token that refuses transfers to a chosen address; one failing push payment; no test reproduces it here (none was run) | OB:296-298; [15] |
| C6: "in the case of a call to triggerStopOrder ... crossed market order" | Both keeper functions pay nothing; who pays to close a market is open | OB:103-145; [09] |

### Section IV
| Supplied | Printed | Reason |
|---|---|---|
| "checkCrossed function", "checkPlacement functions" | `_stillCrossed`, placement functions | Research copy RC:66, 75-88, 98 |
| "Carol resubmits her remainder of 14.99999999999, pays 10 base ... Mallory's quote ends up -1.499e-8" | Pays 14.99999999999 quote for 10 base; Mallory 1.499e-8 quote up, 1e-8 base down, net -1e-11 | E5 |
| Duplicated measured-effect paragraph | One paragraph | Repetition |
| "109 rounds for Mallory to fill 10 base" | 10^9 rounds for Carol, extrapolated from five | E10 |
| "Mallory's position, which is worth 1.5" | "valued at 1.5" | E10 |
| M6: "a price floor ... wash trade which sets the clearing price to zero" | One size floor does not help since a self-trade nets to zero | E8; reasoning |
| "rolling median ... as is done in the Uniswap protocol" | "a countermeasure they borrow from Uniswap" | [09] p. 19 |
| M8: "We therefore expect orders to walk through the price levels" | A price-level book lets an insertion skip whole levels | Inverted |
| M9: "keeper reward to be transferred to a trading bot which would pay the trading fee to remove the order" | Needs a trading fee the engine lacks; we expect it to become a prize bots bid for | Garbled |
| M10: "pull payments to remove a refusing token to block a fill", "unbounded, permissionless listings" | Pull payments stop a refusing token from blocking fills; cost is an extra withdrawal step or permissionless listing | [15]; M10 |
| M12: "lower fills for larger orders ... wider spreads", "0.015 to 0.0015" | Orders fill less often; a 0.1% limit shrinks the loss to 0.015 | E1 0.1% row is 0.015 |
| M5: "Here, we show", "However, Moosavi and Clark show that on-chain call options" | "We argue"; "Moosavi and Clark argue that an on-chain call market" | Hedge; call market, not options |
| "There are no production measurements" | "We found no production measurement" | Gap phrasing |
| "since these attacks reorder no transactions. Carol's transaction and its stop order" | reorders no victim transaction and Carol's stop is already public | One-transaction attack does run a transaction |
| Adoption: "affect only the placement and activation of rules, respectively", "no effect of change M1 or M2 on C3", "introduce changes to the matching rule", "Clearly defining protection" | Touch only the placement and stop-activation paths; M1 and M2 leave C2 untouched; reduce exposure without changing the matching rule; batching and ordering protection are larger redesigns | RC; E7, E8 |

### Section V
| Supplied | Printed | Reason |
|---|---|---|
| "an attacker was able to steal gas" | "take value from honest traders" | Value in quote, not gas |
| "We showed that public order data enabled the attack" | "we argue that public order data is what lets her aim the attacks" | S6 is a design inference |
| "no order can be placed to stop the transaction" | "no keeper can step in" | The keeper call is what could intervene |
| "cancelling a crossed remainder (M2) results in a 109 round delay in the profit" | Removes the profit but, used alone, turns theft into an extrapolated 10^9-round delay | E5, E7, E10 |
| "these do not stop a stop order" | "they leave the stop hunt untouched and can cancel a victim's stop" | E8, E7 |
| "minimum size orders (M1) and orders crossing the new order taken (M3)" as future work | Stop hardening, clearing of crossings before a new order takes (M3), a minimum-size sweep | M1 is built; the open work is the sweep |

## 3. Space and template
The rewrite ran about 7 lines over 6 pages and the abstract was over 180 words. Fixed by shortening wording only
(no claim, hedge or open point removed). Final: 6 pages, abstract 180 words, no math or symbols in the abstract,
"Fig." at sentence start, no abbreviations in headings, 0 errors, 0 overfull boxes, 0 undefined references,
0 "et al." spacing warnings, no em or en dashes, no 8-word overlap with any cited paper or the ChatGPT draft
(one overlap with Zhou et al. p. 12 was reworded).

## 4. Independent audit after the rewrite (numbers, citations, overclaims)
A fresh auditor checked every changed sentence against the raw test logs, the notes and the PDF pages.
- Numbers: every number matches its source.
- Must-fix (applied): Qin et al. hedge restored ("is likely to remain", [05] p. 13); "redesigns of the engine" contradicted
  "M11 needs no contract change", now "redesigns, of the engine or of the chain".
- Should-fix (applied): abstract now says we argue that public order data guides the attacks and that each attack
  reproduces in local tests (not "succeeds"); "sweeps" replaced; rollup sentence scoped to rollups without a public
  mempool; Budish "only a fraction" restored; Babel analogy tied to our contract; Arbitrum appositive clarified; threat
  model opener fixed; dangling modifier in IV-A fixed; the lag expectation split from the Zhou citation.
- Not applied (optional, no space): adding transaction ordering to the intro's focus sentence; splitting the web
  interface sentence.
- Overlap scan: one 8-word run with Zhou et al. p. 12 reworded; no other overlap with any cited PDF or the ChatGPT draft.

Final: 6 pages (US Letter), abstract 180 words, 0 errors, 0 overfull boxes, 0 undefined references, 0 BibTeX
warnings, 0 "et al." spacing warnings, no em or en dashes.
