# Stage 2: write the technical core (Sections III and IV), the figure and the tables

Read `prompts/00-RULES.md`, `paper/OUTLINE_V2.md`, `paper/REFERENCES_FINAL.md`, `paper/CLAIM_CHECKLIST.md`,
`paper/STAGE_LOG.md`, `EVIDENCE_MAP.md`, `evidence/README.md`, `evidence/COST_MODEL.md`, and
`contracts/src/OrderBook.sol`. Open a note in `notes/` each time you cite its source.

Write full prose into `paper/overleaf/sections/03-observations.tex` and `04-solutions.tex` (use the file names
stage 1 created). Stay inside the page budget in `OUTLINE_V2.md`.

## Section III. Observations and Analysis

The template asks, per issue: which component, why it occurs, what the impact is, and a comparable published case.

1. Opening, about 0.35 page: the engine in five sentences (escrow, price-time priority, maker-price settlement,
   the three bounds, permissionless unrewarded `matchOrders` and `triggerStopOrders`, stops on `lastTradePrice`),
   with `OrderBook.sol` line references. Then the adversary model in three sentences: what Mallory can and cannot do.
2. III-A, C1 fill-cap sandwich, the flagship. Mechanism with line references. The worked example with Bob, Carol
   and Mallory. Fig. 1. E1: loss grows linearly with limit slack, attacker profit equals victim overpayment. E9: one
   honest keeper call first defeats it, so it needs ordering control. E11: break-even gas price. Published analogue:
   AMM sandwiching, stated as analogous, and the insertion class from the front-running taxonomy.
3. III-B, stop-order manipulation, C2 with C3. C2: a one-lot self-trade sets the reference price (E2 depth sweep,
   E8 shows a minimum size does not stop it). C3: dust exhausts the shared budget and the stop rests crossed (E3),
   and the one-transaction variant needs no ordering control (E9 atomic). Say precisely why C3 is the stronger
   finding. Published analogues: self-trades on order book DEXs, stop-loss clustering. State the literature gap.
4. III-C, C4 dust wall as the security versus scalability trade-off. E4 numbers: gas for attacker against defender,
   capital locked, transactions to clear. Why cheaper gas on a layer 2 weakens the only barrier.
5. III-D, C5 and C6 in two or three sentences each, clearly marked as reasoning without an experiment.
6. Table I as planned. Every row's numbers must match `evidence/README.md` exactly before rounding.

## Section IV. Proposed Solutions

The template asks, per issue: an actionable intervention, how it changes our own code, and whether it is
implemented. For each solution give: the change, the functions touched, status, measured effect, what it leaves open.

1. For C1 and C3: M2 no crossed rest, and M1 minimum order size. Status: implemented in the research copy only.
   E5, E7: profit removed. E6: gas overhead. E10: M2 alone turns theft into unbounded delay, M1 with M2 bounds it.
   E7: an activated stop can be cancelled. Do not present either as complete.
2. For C2: hardening the reference price (M6) and a trigger to limit band (M7). Status: not implemented, not
   tested. Present as design options with their known weaknesses.
3. For C4: minimum size, and a price-level book (M8). For C6: keeper reward (M9). For C5: allowlist or pull
   payments (M10). One or two sentences each, status "not implemented".
4. Design direction: batch clearing (M5), commit and reveal (M4), chain-level ordering protection (M11). What each
   would change, its cost, and the evidence gap recorded in `OPEN_QUESTIONS.md`.
5. Table II as planned, and one closing paragraph giving the recommended order of adoption with reasons.

## Figure

Fig. 1 in TikZ at `paper/overleaf/figures/fig1-sandwich.tex`: three lifelines (Mallory, Carol, order book), four
numbered steps, the prices 1.499, 1.5 and 2.0 on the arrows, readable at single-column width.

## Before you finish

1. Add the `%` pointer comment to every line that carries a number or a literature claim.
2. Run `paper/CLAIM_CHECKLIST.md` over both sections yourself and fix every failing sentence.
3. Compile. Report pages used by III and IV against the budget, and list any overfull boxes.
4. Commit and write the stage log, including every sentence you hedged and why.
