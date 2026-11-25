# SC4053 Term Paper Review and Action Plan

**Prepared 23 November 2026**  
**Primary source:** GitHub `Nitecry7/SC4053-BlockChain-Project`, main commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`.  
**Other supplied sources:** `TERM_PAPER_HANDOFF.md`, the official-looking course paper template supplied by the group, prior project discussions and current repository audit records.

## 1. Actual assessment requirements

The course description asks a **group** to analyze its **own existing decentralized application** and select one leading issue among **security, privacy, scalability**. You must justify the choice, review relevant research, analyze several application-specific concerns, explain consequences and propose practical or literature-derived remedies. Assessment weight is **20%** and peer assessment applies.

The supplied `paper-template.pdf` is a stronger source than the course overview. It explicitly says **4 to 6 pages INCLUDING references**, additional supporting material may appear in appendices, and uses a two-column IEEE conference style. Its exact outline is:

1. Introduction, describe blockchain, the three concerns and what your group built.
2. Motivation and Literature Survey, justify why your chosen issue matters most in your DEX and critically explain analogous research.
3. Observations and Analysis, give concrete issues by component, explain why they occur, their impact and parallel literature cases.
4. Proposed Solutions, name an actionable intervention per issue, explain how it changes your own code and state whether implemented; implementation is optional.
5. Conclusion, restate the issue and actual scholarly contribution; IEEE-format references.

The template itself was produced in 2020 and uses the earlier CE/CZ4153 course designation. Confirm whether the lecturer expects the unchanged supplied template or an updated SC4053 template. **No explicit detailed scoring rubric or confirmed deadline was provided**, so do not claim one exists.

### Proposed standards for an excellent paper, not an official marking rubric

| Criterion | Distinction-quality evidence |
|---|---|
| Topic selection | Defend security over privacy and scalability using the DEX's actual escrow and execution behavior |
| Literature | Synthesize a focused set of peer-reviewed papers; state where AMM findings do and do not transfer to an order book |
| Original analysis | Name specific contract functions and failure mechanisms, include exact reproducible balances and an attack trace |
| Critical thought | Show that correct settlement, no reentrancy and solvency do not imply best-price fairness |
| Mitigations | Explain how each mechanism changes the system, what it costs, and what it fails to stop |
| Scientific rigor | Preserve baseline commit, tool versions, scripts, test outputs, assumptions, citations and limitations |
| Presentation | Observe 4 to 6 pages including references; use one clear figure, one compact results table and readable IEEE references |

## 2. What your teammate's Markdown says, in plain English

Your teammate chose **Security** and refined it to **economic security / market integrity**. The central observation is that the DEX matches no more than ten orders per transaction so that gas consumption stays controlled, but an attacker can fill those ten slots using tiny orders and steer the remaining execution toward a worse price. Even while the DEX correctly accounts for all tokens, a trader can end up paying more than the best standing price would have required.

The handoff is a **research project management document, not the finished paper**. It describes four attack experiments, two evaluated local mitigations, several more proposed mitigations, an evidence map, 33 researched source candidates, an Overleaf skeleton and suggested writing responsibilities. These materials reportedly exist in a separate **`term-paper/research` branch**, not in `main`.

### Main issues and confidence

| ID | Ordinary-language explanation | Evidence tier |
|---|---|---|
| C1, fill-cap sandwich | Ten tiny offers consume Carol's ten matches, so her largely unfilled buy rests at her generous limit and a subsequent attacker sells into it ahead of Bob's cheaper earlier offer | **Verified in main code, main issue 007 and committed regression** |
| C2, stop hunt | A very small self-trade changes the only price used to decide whether stops activate | **Code-supported current risk, described in SPEC** |
| C3, stop snipe | Tiny bids consume a stop-trigger call's shared matching budget; a newly activated sell stop can then be bought at its own low limit even though a better bid was resting | **Documented in SPEC; handoff's expanded quantified E3/E9 tests not yet retrieved** |
| C4, dust wall | 101 small higher-priority orders stop a new less competitive order from entering a book that can scan only 100 prior orders | **Current code and SPEC limitation; prior global stop blockage was fixed** |
| C5, hostile tokens | Listing arbitrary ERC20s can include tokens whose fees, rebases or refusal to transfer violate the engine's assumptions | **Supported integration risk; no demonstrated exploitation of DemoToken** |
| C6, unpaid keepers | Anyone may clear crossed books or trigger stops but must spend gas without receiving a reward | **Verified incentive design; no real-network keeper availability measured** |

### What do the teammate's experiments mean?

These numbers below are the **teammate's reported results**, quoted for planning. They are **not yet independently verified from raw artifacts** in this session.

| Experiment | Reported takeaway | Why it helps the paper |
|---|---|---|
| E1 | At 1% slack, a victim overpays 0.15 quote on a ten-base order; at 33% slack, about 5 quote | Shows how the severity grows with a trader's unused limit-price tolerance |
| E2 and E8 | A one-lot self-trade can trigger a stop, and even a minimum order amount of 0.1 does not necessarily prevent it | Distinguishes trigger manipulation from dust-only blocking |
| E3 and E9 | Stop sniping is possible even as a single attacker transaction; an ordinary keeper may help only if it runs first | Establishes an ordering-independent variant that simple private routing may not solve |
| E4 | 101 tiny orders jam insertion; clearance takes additional gas | Connects capital cost to denial of service and scalability tradeoffs |
| E5 to E7 | Refund-on-cap and minimum-size rules remove some theft but can cancel stops or leave delays | Enables critical evaluation instead of an overly optimistic solution section |
| E10 | Refund-on-cap alone reportedly permits repeated tiny fills and severe delay; combining the two prototype guards behaves better | Shows why compositional defenses matter |
| E11 | Break-even gas model supplied in symbolic form, without assuming current ETH/token prices | Allows honest profitability discussion without pretending test-token gains have fiat value |

### What the handoff gets right

1. It selects the most distinctive, technically relevant concern for your actual DEX.
2. It has a strong evidence discipline: raw experiments, named tests, cost models, per-paper notes and a claim-to-source map.
3. It distinguishes a mitigation **implemented only in a research copy** from code actually shipped on main.
4. It acknowledges limitations such as the local Anvil environment, the need for ordering assumptions, two unread papers and weak literature coverage for some suggested mechanisms.
5. It separates research tasks so the team can work without duplicating efforts.

### What must be corrected before submission

1. **The branch has not been pushed or is otherwise not visible.** The GitHub API currently lists `main`, `faheem`, `submission` and multiple engine/docs branches, but no `term-paper/research`. Main also contains no `docs/term-paper` directory or `contracts/test/termpaper` tests. Request a push or a ZIP of the branch, and do not claim E1 to E11 are GitHub-reproducible yet.
2. **The page limit is now verified.** Contrary to the handoff's open question, the uploaded paper template explicitly says 4 to 6 pages **including** references. The proposed outline of about five pages plus references will likely need compression.
3. **The 33 papers are too many for the final paper.** The 33-source research inventory is valuable, but keep about 10 to 14 highly relevant references in the final five-page draft. An older seminal paper is appropriate if supplemented by more recent research.
4. **Narrow the body.** Give most space to C1, C2/C3 and C4. Mention C5 and C6 as subsidiary dependencies rather than treating six concerns as equally deep.
5. **Separate mechanisms.** AMM sandwiching is analogous, not the same as an order-book crossed-remainder attack. A stop-limit executes at or better than its specified limit; the loss is relative to available better offers or the holder's trigger expectation, not a violation of its limit.
6. **Distinguish old and current defects.** Issue 006's permanent stop-blocking condition is FIXED; issue 007's economic attack is documented, reproduced in a regression, and ACCEPTED without a code fix.
7. **Do not overclaim testing.** Main's recorded 335 tests, comprehensive coverage, mutation evidence and Slither checks do not prove protection from economic ordering attacks. Document what was actually rerun for the paper and preserve the command transcript.

## 3. Repository-grounded architecture and issue sources

At the 23 November read of commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`:

1. `contracts/src/TokenFactory.sol` issues fixed-supply ERC20 demo tokens.
2. `contracts/src/MarketFactory.sol` creates one market per token pair with no authorized owner, oracle or allowlist.
3. `contracts/src/OrderBook.sol` escrows orders and matches at maker price. Key code: lines 58 to 69 (placement and budget), 103 to 119 (batch clearing), 127 to 144 (stop triggers), 250 to 299 (settlement), 317 to 343 (insertion cap).
4. `SPEC.md`, sections 5, 6 and 8, documents trigger semantics, keeper incentives and current known limitations.
5. `docs/ai-audit/issues/007-dust-sandwich-of-capped-limit-order.md` identifies the accepted economic risk.
6. `contracts/test/OrderBook.Regression.t.sol`, approximately lines 184 to 215, contains the proof-of-concept balances and invariant checks for issue 007.
7. `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` documents the former high-availability bug, its regression and its repair.
8. `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md` and `docs/ai-audit/test-evidence/wrapup/report-verification.md` list baseline security properties and documented testing; a separate research run should not silently reuse those test counts.

Use this pinned source URL rather than the moving main branch in figures and code citations: https://github.com/Nitecry7/SC4053-BlockChain-Project/tree/8753521b83bd37896ff24314a3c1eaa36bd2a374.

## 4. Recommended paper argument

**Research question:** To what extent can a DEX that protects escrow and limits execution gas still suffer economically unfair execution through adversarial transaction ordering and small orders?

**Thesis:** Security is the most consequential concern because the interaction of public transaction ordering, dust-sized orders and bounded execution can transfer economic value away from honest users even when the book remains solvent and no Solidity safety rule is broken.

**Defensible contribution:** A case study of the precise contract execution paths, a reproduced limit-order regression, a threat model for related stop and availability risks, and a comparative, falsifiable proposal for fixing the priority discontinuity.

The companion complete draft is in `SC4053_Term_Paper_Draft.md`. Adapt it to the official IEEE template and validate the final page count after citations and figures are inserted. This draft deliberately does not present the teammate-only experimental results as independently verified.

## 5. What each person should do

Based on earlier development discussions, **your teammate was Person 1 (OrderBook and security engine)** and **you were Person 2 (token factory, market listing, frontend, deployment, tests and documentation)**. The handoff labels the engine owner **Person A** and the teammate receiving the handoff **Person B**, which maps naturally to your group. Confirm that mapping with your teammate, since the uploaded file has no names.

| Task | Engine owner, Person A | You, Person B |
|---|---|---|
| Reproducible evidence | Push research branch, rerun E1 to E11, archive gas reports, confirm main and mitigated-copy difference | Independently read raw logs, check quantities, reproduce one representative exploit if feasible |
| System description | Write architecture and threat model with `OrderBook.sol` line references | Check TokenFactory, MarketFactory, wallet assumptions and UI claims for accuracy |
| Technical attack analysis | Lead C1 to C4, figure of order-flow and before/after order book | Check the attack narrative against issue 007, avoid claiming filled amount/price incorrectly |
| Literature review | Check research claims used in mechanisms | Lead literature synthesis, IEEE citations, cross-paper comparisons and recent sources |
| Mitigation comparison | Explain M1/M2 research implementation, code diff and regression effects | Compare M3 to M12 research proposals, practicality, tradeoffs and limitations |
| Report integration | Review technical correctness and experiment table | Lead formatting, page limit, reference numbering, cross-check and final submission package |
| Final sign-off | Validate every code and experimental claim | Validate every citation, link, publication year, author and statement of uncertainty |

Both authors should write and approve the abstract, motivation, conclusion, research question and peer-assessment account. Do not rely on the earlier split if either member has substantially changed responsibilities.

## 6. Best next steps in order

1. **Today:** Ask the engine owner to push `term-paper/research` or provide a ZIP containing `docs/term-paper`, `contracts/test/termpaper` and `references.bib`. Ask for the deadline, AI-use disclosure requirements and any latest rubric or official template clarification.
2. **Evidence day:** Record `git rev-parse HEAD` and `forge --version`, then run the existing baseline suite. Once the research branch is available, rerun its 16 targeted tests and the full 351-test suite. Keep output with zero failures. Check that the purported mitigated engine differs in only the claimed rules.
3. **Experiment day:** Select **C1 as your flagship result**, C2/C3 as the mechanism comparison, and C4 as the security/scalability tradeoff. Draw one figure of the before, after-dust and after-attacker book, plus a small numeric table with exact source rows.
4. **Writing day:** Use the template's real structure: I Introduction; II Motivation and Literature Survey; III Observations and Analysis; IV Proposed Solutions; V Conclusion. Put system/threat model as the opening of III if you need to match the supplied layout closely.
5. **Citation day:** Favor 10 to 14 relevant peer-reviewed papers and the pinned repository. Verify DOI and landing page, remove the two unread sources, correct page numbers and cite actual evidence for every quantity.
6. **Joint review:** Have each person review the other's sections sentence by sentence. Mark every claim VERIFIED, REPORTED BY TEAMMATE, HYPOTHESIS or RECOMMENDATION. No unsupported claim should survive.
7. **Final layout:** Build the exact IEEE two-column PDF, count **all pages including references** and target five or six total. Move raw source excerpts and larger test tables into an appendix only if appendices are allowed outside the limit.

### Evidence to retain alongside the submission

1. Exact Git SHA and toolchain versions.
2. Baseline and mitigated source diff.
3. Test invocation and entire logs, not just green screenshots.
4. Raw input parameters and end balances, with gas-unit assumptions.
5. A figure that explicitly labels code behavior and attacker ordering assumption.
6. A bibliography with active DOI or official proceedings URLs and access dates as needed.
7. Any required AI-assistance declaration and group contribution statement.

## 7. Clarifications to request before the final submission version

1. **Can your teammate push the research branch now?** This is the key blocker for verifying E1 to E11 and replacing cautious draft language with measured comparisons.
2. **What is the exact deadline?** The course overview and template shown do not establish it.
3. **Who are the two authors, and what names, matriculation numbers and emails should appear?** These were deliberately not invented.
4. **Is there a more recent official template or AI-use policy?** The supplied template names an older course code and contains no modern AI disclosure directions.
5. **Do you want a stronger empirical draft after branch verification?** That would incorporate E1 to E11 into compact tables, while keeping main and prototype changes clearly distinguished.

## Selected reading links

1. [Daian et al. 2020, IEEE S&P](https://doi.org/10.1109/SP40000.2020.00040).
2. [Moosavi and Clark, Lissy, on-chain order books](https://arxiv.org/abs/2101.06291).
3. [Heimbach and Wattenhofer 2022, ordering defenses](https://doi.org/10.1145/3558535.3559784).
4. [Ferreira and Parkes 2023, verifiable sequencing](https://doi.org/10.1145/3564246.3585233).
5. [Canidio and Danos 2024, commitments](https://doi.org/10.1287/mnsc.2023.01239).
6. [Choudhuri et al. 2024, threshold encryption](https://www.usenix.org/conference/usenixsecurity24/presentation/choudhuri).
7. [Full IEEE-style bibliography in the paper draft](SC4053_Term_Paper_Draft.md).
