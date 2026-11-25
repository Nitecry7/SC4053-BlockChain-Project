# SC4053 Blockchain Technology Term Paper

## 1. Understanding the assessment

- **Assessment weight:** 20% of the module.
- **Required length:** 4–6 pages, including references, according to the supplied template.
- **Format:** IEEE style, using the supplied two-column template.
- **Submission:** Group paper with peer assessment.
- **Research focus:** One primary issue affecting your actual decentralized exchange (DEX).

Your teammate's research is extensive, but the final submission needs to be a tightly argued academic paper rather than a compilation of everything researched.

### What are you being asked to prove?

| Requirement | Meaning | Example for your DEX |
|---|---|---|
| Choose a concern | Explain why security, privacy or scalability is the most significant concern | Why unfair execution and financial loss may outweigh other concerns |
| Review existing research | Investigate what researchers already know about that concern | Transaction ordering, front-running, MEV and DEX market manipulation |
| Analyze your application | Identify how the concern arises in your own system | Examine OrderBook, order execution, stop orders and matching logic |
| Evaluate consequences | Explain what could happen, to whom, how seriously and under what conditions | Worse execution prices, delayed orders or prohibitively expensive execution |
| Propose solutions | Explain mechanisms supported by research and technical reasoning | Minimum order sizes, bounded execution, batch auctions and protective execution constraints |

You do not have to discover a critical vulnerability or prove that the application has already been exploited. A well-supported analysis of realistic, reproducible risks and their mitigations can make an excellent paper.

### Official template structure

1. **Introduction:** Briefly explain blockchain, security, privacy, scalability, your DEX and the selected issue.
2. **Motivation and Literature Survey:** Justify the choice over the other two concerns and review relevant research.
3. **Observations and Analysis:** Examine specific issues in application components, their causes, consequences and comparable published cases.
4. **Proposed Solutions:** Explain how each concern could be addressed, whether solutions have been implemented and what limitations remain.
5. **Conclusion and References:** Present findings and properly cite supporting sources.

The template allows appendices after references for additional evidence. Connect implementation to academic research, support findings with reproducible evidence and critically evaluate solutions.

### How to aim for the highest grade

No verified marking rubric was identified in the supplied material. These are proposed quality criteria, not official grading percentages:

- **Precise problem definition:** Define a focused security problem with a clear threat model and scope.
- **Technical depth:** Explain actual contract execution paths and economic mechanisms rather than merely naming attacks.
- **Original evidence:** Use repeatable experiments, meaningful comparisons and carefully interpreted measurements.
- **Critical literature review:** Synthesize research, distinguish applicable findings from adjacent work and acknowledge limitations.
- **Evaluated solutions:** Compare mitigations by security effectiveness, cost, usability and remaining risks.
- **Academic rigor:** Use accurate IEEE citations, cautious claims, clear figures and tables and the required page format.

**Recommendation:** Make this an evidence-led economic security paper. A DEX can enforce correct asset accounting and still expose traders to economically harmful order execution.

## 2. GitHub repository findings

Repository: https://github.com/Nitecry7/SC4053-BlockChain-Project/tree/main

Previously inspected main commit: `8753521`, reported as dated 8 November 2026. The following summarizes the previous analysis; it is not a fresh repository audit.

### Application architecture

1. `TokenFactory.sol` creates ERC20 tokens.
2. `MarketFactory.sol` deploys trading markets.
3. `OrderBook.sol` manages escrow, matching, partial fills and stop-limit orders.
4. A wallet-connected frontend enables trading and order management.

The contracts include protections against familiar vulnerabilities such as reentrancy and unauthorized cancellation. The most interesting remaining risks concern how trades execute even when Solidity code behaves as intended.

### Six security considerations

| Issue | What can go wrong? | Previous assessment |
|---|---|---|
| C1. Fill-cap sandwich | Tiny orders exhaust the ten-fill limit, exposing a trader to worse execution | Reproduced in repository documentation; unresolved |
| C2. Stop hunting | Small trades manipulate the price used to activate stop orders | Code-supported risk |
| C3. Stop sniping | A triggered stop may execute at a worse price than another available order | Documented scenario |
| C4. Dust griefing | Many tiny orders prevent other orders from entering the book | Residual limitation |
| C5. Hostile tokens | Incompatible ERC20 behavior can interrupt execution | Conditional risk |
| C6. Keeper incentives | Nobody is guaranteed to pay for clearing or triggering | Design limitation |

Primary source: [Issue 007 — dust sandwich of capped limit order](https://github.com/Nitecry7/SC4053-BlockChain-Project/blob/main/docs/ai-audit/issues/007-dust-sandwich-of-capped-limit-order.md).

### Concrete example: C1

Suppose Bob wants to sell 10 tokens for 1.5 each. Carol wants to buy 10 tokens, with a maximum acceptable price of 2.0. Without interference, Carol could buy Bob's tokens for 15 in total.

An attacker, Mallory, first places ten extremely tiny orders. These consume Carol's ten permitted matches without fulfilling much of her order. The remainder of Carol's order remains at her maximum price of 2.0, even though Bob's cheaper order is still available. Mallory exploits that situation.

| Metric | Expected execution | Documented attack example |
|---|---:|---:|
| Quote tokens paid by Carol | 15.00 | Approximately 20.00 |
| Additional cost relative to reference outcome | — | Approximately 33.33% |

Mallory gains nearly five quote tokens before gas in this example. Carol does not pay beyond her maximum limit, and the contract does not lose anyone's escrow. The attacker instead exploits the interaction of matching limits and transaction ordering.

[Regression test](https://github.com/Nitecry7/SC4053-BlockChain-Project/blob/main/contracts/test/OrderBook.Regression.t.sol) — verify exact balances and rerun before submission.

## 3. Evaluation of teammate's Markdown handoff

The choice of economic security is a strong direction. The handoff describes:

1. Six application-specific security considerations.
2. Twelve potential mitigations.
3. Eleven groups of experiments and cost analyses.
4. A literature inventory of 33 sources.
5. An evidence map connecting claims to tests and papers.
6. An Overleaf writing skeleton.
7. A proposed responsibility split.

### Verification blocker

The handoff says the additional research lives in `term-paper/research`. That branch was not visible during the previous repository inspection. E1–E11 remain teammate-reported results until their raw experiment files and logs are checked. Do not present them as independently verified findings yet.

### Recommended scope

Covering all six concerns and twelve mitigations equally would be difficult within six pages. Prioritize:

1. C1 as the flagship empirical result.
2. C2 and C3 together as stop-order manipulation analysis.
3. C4 as the security-versus-scalability tradeoff.
4. C5 and C6 briefly where relevant to the proposed solutions.

**Central thesis:** Correct asset accounting does not necessarily guarantee fair trade execution. A DEX's gas limits and public transaction ordering can interact to create economic security risks.

## 4. Drafts and literature research

The previous response provided the following companion artifacts. These are the original library links from that response; they have not been reopened or independently verified in this conversion.

- [Term Paper PDF Preview](https://chatgpt.com/library?file_id=libfile_3ffd946adf208191b62b93b93289d2f8&account_id=personal): Four-page, two-column academic draft with references and regression results table; not the exact course template.
- [Complete Editable Paper Draft](https://chatgpt.com/library?file_id=libfile_cfd51628a0dc8191bde3ac041bdf1f79&account_id=personal): Full Markdown manuscript with introduction, literature review, technical analysis, mitigations, limitations and 13 IEEE-style references.
- [Detailed Assessment Review and Action Plan](https://chatgpt.com/library?file_id=libfile_f175db4da57c8191a702914098bcc80a&account_id=personal): Six issues, handoff evaluation, evidence matrix, responsibilities and next steps.
- [Literature Research Notes](https://chatgpt.com/library?file_id=libfile_744bc2d566cc8191ba2ba97e58ba195d&account_id=personal): Research links, source applicability, twelve reference candidates and mitigation tradeoffs.

### Particularly useful papers

| Research | Why it matters |
|---|---|
| Daian et al., 2020, *Flash Boys 2.0* | Establishes transaction-ordering incentives and MEV |
| Moosavi and Clark, *Lissy* | Directly examines fully on-chain order books and performance/security tradeoffs |
| Heimbach and Wattenhofer, 2022 | Compares transaction-reordering mitigations and their limitations |
| Ferreira and Parkes, 2023 | Explores verifiable sequencing rules for DEX market design |
| Choudhuri et al., 2024 | Examines transaction confidentiality using batched threshold encryption |

Older papers remain useful when establishing foundational findings. Include newer work as well. Consult the companion literature notes for full IEEE reference details and validate publication metadata and links before submission.

## 5. Responsibilities

| Teammate (engine owner) | You (Person 2) |
|---|---|
| Push the research branch | Review literature and citation accuracy |
| Rerun and document E1–E11 | Check each paper's applicability to the actual order book |
| Explain C1–C4 through code | Write the comparative security/privacy/scalability argument |
| Verify mitigated-contract experiments | Evaluate proposed mechanisms and tradeoffs |
| Draw and verify the attack sequence | Lead paper integration and IEEE formatting |
| Audit technical statements | Audit research claims and reference links |

Both members should independently review the finished paper and be able to defend its main results. This division is a recommendation rather than an agreed assignment of work.

## 6. Recommended next steps

- [ ] **Obtain the research branch.** Ask the teammate to push `term-paper/research` or provide the complete research folder. This allows validation of additional experiments and comparison of original and modified engines.
- [ ] **Reproduce the strongest attacks.** Preserve commit SHA, Foundry version, inputs, balance changes and gas measurements. Confirm tests pass rather than relying solely on handoff claims.
- [ ] **Strengthen the empirical section.** After E1–E11 are verified, replace cautious descriptions with measured comparisons, including which mitigations help and which leave exploitable behavior.
- [ ] **Transfer the paper into the official template.** The previous preview was four pages, but the exact IEEE template may paginate differently. Add authors, check citations and keep the paper within six pages including references.
- [ ] **Conduct a joint final review.** Every important statement should be supported by source code, reproducible tests, research papers or explicitly identified inference.

### Outstanding questions

1. Can the teammate push `term-paper/research` or send the complete research folder?
2. What is the exact submission deadline? No verified date was identified in the supplied material.
3. Is the uploaded two-page PDF the latest term paper template? It uses an older course designation.

Application screenshots are not currently necessary: Solidity code, tests and experimental logs provide stronger evidence for this research topic.

## Overall assessment

The teammate has chosen a promising direction, and the DEX has a documented, reproducible security case worth analyzing. The next improvement is to validate additional experiments and turn extensive research into a concise, carefully evidenced final paper.

---

**Conversion note:** This file consolidates both parts of the preceding assistant response into portable Markdown, replacing interface widgets with ordinary Markdown. It preserves links to the separate companion artifacts, but does not embed their full contents because those files were not available in the active runtime during this conversion. No new repository or literature verification was performed.
