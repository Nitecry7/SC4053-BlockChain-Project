# When Correct Settlement Is Not Fair Execution

## Transaction Ordering and Dust Attacks in a Gas-Bounded On-Chain Decentralized Exchange

**SC4053 Blockchain Technology Term Paper**  
**Authors:** Group member names, matriculation numbers, school affiliations and emails to be inserted after confirmation.  
**Evidence baseline:** `Nitecry7/SC4053-BlockChain-Project`, `main` commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`, inspected 23 November 2026.

### Abstract

Decentralized exchanges (DEXs) can settle trades without a custodial intermediary, but correct token accounting alone does not guarantee economically fair execution. We analyze the security of our Ethereum-style, fully on-chain limit order book, which escrows ERC20 tokens, executes at the maker's price, and bounds computation to ten matches and 100 insertion scans per call. We identify a compositional economic attack in which tiny orders exhaust the match budget and allow a later transaction to bypass a better resting price. A regression test in the development repository documents a victim paying approximately 20 quote tokens instead of 15 for ten base tokens, while all accounting invariants hold. We also analyze manipulable stop triggers, low-capital depth griefing and the lack of rewards for permissionless clearing. Drawing on research into extractable value and market design, we propose crossed-remainder handling, minimum economically meaningful order sizes, stronger stop-price references, keeper incentives and longer-term batching. Our central finding is that bounded execution, order transparency and transaction ordering interact to create security failures not captured by traditional contract solvency tests.

**Index Terms:** blockchain, decentralized exchange, limit order book, front-running, economic security, maximal extractable value.

## I. Introduction

Blockchains enable users to exchange assets through deterministic smart contracts rather than an exchange operator. Their decentralization, however, brings three connected engineering concerns: security of assets and transactions, privacy of public trading activity, and scalability under execution and storage costs. Our development project implements a non-custodial DEX on an Ethereum-compatible local blockchain. A `TokenFactory` issues fixed-supply ERC20 tokens, a permissionless `MarketFactory` deploys one `OrderBook` per trading pair, and a wallet-connected frontend lets users place, cancel and inspect orders. The engine supports price-time priority, partial fills, batch matching and stop-limit orders [11], [12]. It is an order book, not an automated market maker (AMM).

We select **security**, particularly economic security and market integrity, as the leading concern. A matching contract may be solvent, non-reentrant and internally consistent yet give a trader a materially worse fill because the public order book and bounded matching logic can be manipulated. This matters directly whenever users escrow tokens and submit price limits. Privacy matters because visible orders disclose intentions and wallet activity; scalability matters because ordered scans consume gas. Rather than treating these as independent topics, we examine how the protections adopted for scalability may themselves create security exposure.

This paper contributes an implementation-grounded threat model, an analysis of four interacting risk classes, and a prioritized mitigation strategy. Evidence is drawn from the committed Solidity code, specification and regression tests [11]-[13]. The development environment is a local Anvil chain; none of our results establishes an attack observed on a public deployed market.

## II. Motivation and Literature Survey

### A. Why Security Is the Primary Concern

For our DEX, the immediate consequence of a security failure can be the transfer of trading value to an adversary, even when each individual transfer obeys the signed order's limit. By comparison, a privacy failure reveals trading behavior, while a scalability failure causes higher costs or delayed execution. Both are important, and in this design they also *cause* or amplify economic-security failures. The engine bounds work to prevent unlimited gas costs; under adversarial ordering, those same caps can interrupt the expected best-price matching sequence. Thus the chosen concern is not merely generic Solidity correctness but whether the market's executed outcome respects an economically meaningful fairness expectation.

### B. Existing Research and Relevance

Eskandari, Moosavi and Clark classify front-running in transparent blockchain applications, emphasizing that visibility before finalization can be exploited through ordering [2]. Daian *et al.* established how profit-seeking transaction ordering and priority-gas competition create extractable value in decentralized exchanges [1]. Torres, Camino and State later measured front-running in deployed Ethereum activity [3], while Qin, Zhou and Gervais quantified blockchain-extractable value from strategies that include sandwich attacks [4]. These studies support the adversary model, but their aggregate measurements or AMM-specific examples must not be presented as measured losses in our order book.

Order-book research is more directly relevant. Moosavi and Clark's *Lissy* investigates fully on-chain call-market trading and execution-cost tradeoffs [5]. Ferreira and Parkes study verifiable sequencing rules as a market-design response to ordering incentives [7]. Heimbach and Wattenhofer compare transaction-reordering defenses and find that designs trade off security, decentralization, delay and throughput [6]. Canidio and Danos analyze commitment-based defenses against front-running [8]. More recent work by Choudhuri *et al.* studies batched threshold encryption for mempool privacy, making clear that concealment also introduces coordination and decryption constraints [9]. Zhou *et al.* contextualize the distinction between technical smart-contract vulnerabilities and broader DeFi economic attacks [10].

Together, this literature establishes a gap between basic financial correctness and fair execution. Our contribution is narrower than a new general theory or a field measurement: we apply these insights to the exact caps, stop triggers and settlement rules of an educational order-book DEX and identify which defenses address the actual failure mechanism.

## III. System and Threat Model

The `OrderBook` accepts two 18-decimal ERC20 tokens, holds fully funded buy or sell escrow, and matches against the best opposite-side order at the **maker's price**. A partial buy-fill releases surplus quote escrow when execution improves upon its limit. Sorted linked lists preserve price-time ordering for ordinary resting orders. To bound gas, `MAX_MATCHES_PER_TX` is **10**, `MAX_INSERT_SCAN` is **100**, and the smallest permitted quantity is `LOT_SIZE = 10^9` atomic units, or `10^-9` of a base token [12]. Once a new order uses its ten fills, its remainder may rest even if the opposite side still contains a crossing quote. A separate permissionless `matchOrders` call can subsequently clear this state.

Stop-limit orders are escrowed at placement and later activated by `triggerStopOrders`. Eligibility depends on the contract's **single last trade price**, which is updated by every fill regardless of quantity. Activations share a ten-fill budget. Neither matching nor triggering rewards the outside caller. `MarketFactory` has no token allowlist, admin pause or exclusive matcher [11], [12].

We model one adversary who owns tokens and addresses, can submit many small orders, observes publicly available book state and may influence the placement of transactions around honest orders. The adversary cannot forge signatures or withdraw another owner's escrow and does not need privileged contract permissions. Ordering advantages are assumptions for particular sandwich scenarios, **not guaranteed properties of every block**. Our primary assets are trader value, execution fairness and continued access to order placement and stop activation.

## IV. Observations and Application-Specific Analysis

### A. Ten-Fill Dust Sandwich and Crossed Remainder

The strongest verified case combines two intentional rules. First, one-lot orders can consume a match, even if their amount is economically negligible. Second, an incoming order whose ten-fill budget expires may become a resting maker while an older, better-priced order remains on the opposite side. A later incoming trader can then execute against this newly resting maker at its limit. The mechanism is thus a change in **execution priority**, not a theft of escrow.

The repository's regression `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` provides an exact worked scenario [13]. Bob already offers ten base tokens at 1.5 quote each. Carol sends a buy for ten base with a maximum price of 2.0. Before her order, Mallory inserts ten tiny asks, each only `10^-9` base at 1.499. Carol fills those ten asks, acquiring just `10^-8` base, and her match budget expires. The rest of Carol's bid now sits at 2.0 opposite Bob's older ask at 1.5. Mallory next sells the remainder to Carol at **2.0**, because Carol is now the maker, then purchases Bob's ten base at **1.5**.

The asserted test balances show that Carol pays `19.99999999499` quote for ten base instead of `15` quote in the unmanipulated reference scenario. Mallory's net quote gain is `4.99999999499`, **before transaction gas**. This is an approximately 33.33% higher expenditure than the 15-quote reference outcome. The test also asserts that the book remains sorted and solvent [13]. The result does not mean Carol paid beyond her declared limit; it shows why a permitted limit is a weak substitute for best available execution. The attack additionally requires Mallory's sequence to execute before any successful honest clearing transaction, making transaction ordering and keeper availability material.

**Table I. Issue 007 regression outcome, in quote and base tokens [13]**

| Measure | No-attack reference | Attacked sequence |
| :--- | :--- | :--- |
| Carol quote paid | 15.00000000000 | 19.99999999499 |
| Mallory quote profit | 0 | 4.99999999499 |
| Carol base acquired | 10 | 10 |
| Escrow solvency | Preserved | Preserved |

The no-attack figures are the test's reference expectation, not a separate real-network observation. Profits exclude gas.

### B. Stop-Price Manipulation and Stop Sniping

The same market-design weakness extends to stop-limit orders. Each fill updates `lastTradePrice`, including a minuscule self-trade, and the current engine does not use a volume threshold or time-weighted reference [11], [12]. An adversary in a thin market can therefore move the trigger signal without establishing sustained market demand. Once triggered, a stop-limit still respects its chosen limit, but the trigger may be premature or strategically induced.

The specification also documents a stop-sniping scenario. An attacker places ten tiny bids, calls `triggerStopOrders`, and exhausts its shared match budget on these fills. The activated sell stop can then rest crossed with a better honest bid. A subsequent attacker order buys the stop at its wider limit before `matchOrders` restores crossing. The independently reviewed scenario is described in `SPEC.md`; the stronger quantitative experiments E3, E7 and E9 mentioned in the teammate's separate handoff are **not included in the inspected main branch**, so we do not cite their figures as independently verified results. This distinction matters: stop-price manipulation, ordering and budget exhaustion are related, but a mitigation for one does not automatically solve the others.

### C. Depth Griefing and Availability

An attacker can also place 101 tiny, high-priority orders to make the 100-step insertion cap block a less competitive incoming order with `BookTooDeep` [11], [12]. The cap limits gas exposure but may shift a denial-of-service cost to honest users. An earlier, more severe defect allowed one uninsertable stop to block every subsequent stop activation. The audit records that this was **fixed**: current code instead cancels and refunds an activated stop that cannot re-enter the book [11]. This avoids global blocking, but it can still remove stop protection from an honest user when the book is crowded. The distinction between a historical fixed bug and a present residual limitation is essential.

### D. Token and Execution Dependencies

Because token-pair creation is permissionless, an incompatible asset may be listed. `SafeERC20` and `nonReentrant` protect standard transfer paths, yet the implementation explicitly does not support fee-on-transfer or rebasing tokens [11], [12]. A hostile token could also reject a transfer and prevent a fill. This is a conditional integration and availability risk, **not evidence that the project's own standard demo tokens have been exploited**. Likewise, permissionless `matchOrders` and `triggerStopOrders` are unpaid. An unprofitable clearing call may be delayed; the contract's liveness depends partly on external actors rather than on an automatic blockchain scheduler.

## V. Proposed Solutions and Tradeoffs

### A. Repair the Bounded-Matching Transition

The highest-priority change is to remove the state transition that enables a capped taker remainder to rest crossed. After the match budget is consumed, the engine could **cancel and refund any remainder still crossing the best opposite order** instead of inserting it as a new maker. An alternative is to clear crossed heads before allowing a new taker to execute, but pre-clearing must itself remain gas-bounded and may require reverting or returning an explicit incomplete outcome. These proposals directly target the issue 007 trace. They are **not implemented in the current main-branch contract** and would change the accepted order-lifecycle semantics, tests, ABI expectations and frontend communication.

A minimum order amount or notional can make ten dust matches more expensive, but alone cannot establish fairness; an attacker may finance larger orders. Because tokens have differing values, a fixed base-unit floor is particularly crude. The teammate's handoff reports prototype M1 and M2 experiments, including interactions and residual attacks, but those tests must be independently retrieved from the unpushed research branch and rerun before their numerical results can enter a final paper. The combination of anti-dust controls and a no-crossed-remainder rule deserves comparison against the unchanged baseline.

### B. Harden Stop Activation and Market Access

A price-setting trade-size threshold, moving-volume-weighted price, median of recent independent fills or external price reference could reduce the impact of a single dust self-trade. Each has limitations: on-chain aggregation costs gas, thin markets have sparse observations, colluding accounts can evade simple self-trade checks, and an external oracle introduces trust and availability dependencies. A stop-limit price should remain a second line of protection, while the UI must clearly present its worst acceptable execution and warn that stop activation is neither instantaneous nor guaranteed.

For depth griefing, tighter economically meaningful order limits, cancellation costs or a price-level data structure could raise attacker costs or reduce insertion scanning. A properly funded keeper incentive could improve clearing liveness, but reward design must prevent self-farming and does not guarantee priority over an adversary's transaction. Incompatible token listings could be restricted to explicitly supported behavior or validated with carefully designed balance-delta accounting; this sacrifices some permissionlessness and cannot make arbitrary rebasing or blocklisting tokens safe automatically.

### C. Market-Design Alternatives

Commit-reveal submission can conceal trading intent until a reveal phase [8]. Frequent batch auctions or verifiable sequencing can reduce the advantage of infinitesimal execution timing and provide a different fairness rule [5], [7]. Encrypted mempools may limit pre-confirmation information leakage but introduce additional protocol, committee and latency assumptions [9]. These are longer-term redesigns, not small Solidity patches, and **none automatically repairs a crossed remainder if the underlying clearing algorithm retains that state transition**. Heimbach and Wattenhofer's comparative results reinforce the need to evaluate security gains alongside cost, fairness, delay and decentralization [6].

We propose evaluating each mitigation with the same three-party attack trace and four measurements: (1) victim's effective quote paid versus the best original resting ask, (2) adversary profit before and after stated gas assumptions, (3) proportion of honest orders still matchable or stoppable, and (4) gas per operation. Solidity solvency invariants must be checked **in addition to**, rather than as a substitute for, these market-outcome measures.

## VI. Limitations and Conclusion

Our evidence concerns deterministic Foundry and local Anvil behavior, not a deployed public-network attack. The committed regression establishes a possible execution sequence, not its real-world frequency or profitability after fees, token liquidity and transaction competition. Test coverage and static analysis are useful for classic contract defects but do not certify market fairness. The collaborator's additional E1-E11 experiments and mitigated contract copy need retrieval and reproducibility checks before inclusion as empirical results. No human or independent professional security audit is claimed.

This study selected **security** as the DEX's central concern because economically adverse execution can occur even when token custody, arithmetic and limits behave exactly as programmed. The reproduced dust sandwich and related stop and depth risks illustrate how public transaction ordering and bounded computation interact. The most effective near-term response is to repair crossed-remainder handling and strengthen anti-dust and stop rules; longer-term fair sequencing remains a market-design research problem. The broader lesson is that **correct settlement is necessary, but not sufficient, for a trustworthy decentralized exchange**.

## References

[1] P. Daian *et al*., “Flash Boys 2.0: Frontrunning in Decentralized Exchanges, Miner Extractable Value, and Consensus Instability,” in *2020 IEEE Symposium on Security and Privacy*, 2020, pp. 910-927. doi: [10.1109/SP40000.2020.00040](https://doi.org/10.1109/SP40000.2020.00040).

[2] S. Eskandari, S. Moosavi, and J. Clark, “SoK: Transparent Dishonesty: Front-Running Attacks on Blockchain,” in *Financial Cryptography and Data Security Workshops*, 2019, pp. 170-189. [Online]. Available: https://arxiv.org/abs/1902.05164.

[3] C. F. Torres, R. Camino, and R. State, “Frontrunner Jones and the Raiders of the Dark Forest: An Empirical Study of Frontrunning on the Ethereum Blockchain,” in *30th USENIX Security Symposium*, 2021, pp. 1343-1359. [Online]. Available: https://www.usenix.org/conference/usenixsecurity21/presentation/torres.

[4] K. Qin, L. Zhou, and A. Gervais, “Quantifying Blockchain Extractable Value: How Dark Is the Forest?” in *2022 IEEE Symposium on Security and Privacy*, 2022. doi: [10.1109/SP46214.2022.9833734](https://doi.org/10.1109/SP46214.2022.9833734).

[5] M. Moosavi and J. Clark, “Lissy: Experimenting with On-Chain Order Books,” in *Financial Cryptography and Data Security Workshops*, 2022. [Online]. Available: https://arxiv.org/abs/2101.06291.

[6] L. Heimbach and R. Wattenhofer, “SoK: Preventing Transaction Reordering Manipulations in Decentralized Finance,” in *Proceedings of the 4th ACM Conference on Advances in Financial Technologies*, 2022, pp. 47-60. doi: [10.1145/3558535.3559784](https://doi.org/10.1145/3558535.3559784).

[7] M. V. X. Ferreira and D. C. Parkes, “Credible Decentralized Exchange Design via Verifiable Sequencing Rules,” in *Proceedings of the 55th Annual ACM Symposium on Theory of Computing*, 2023, pp. 723-736. doi: [10.1145/3564246.3585233](https://doi.org/10.1145/3564246.3585233).

[8] A. Canidio and V. Danos, “Commitment Against Front-Running Attacks,” *Management Science*, vol. 70, no. 7, pp. 4429-4440, 2024. doi: [10.1287/mnsc.2023.01239](https://doi.org/10.1287/mnsc.2023.01239).

[9] A. R. Choudhuri, S. Garg, J. Piet, and G.-V. Policharla, “Mempool Privacy via Batched Threshold Encryption: Attacks and Defenses,” in *33rd USENIX Security Symposium*, 2024, pp. 3513-3529. [Online]. Available: https://www.usenix.org/conference/usenixsecurity24/presentation/choudhuri.

[10] L. Zhou *et al*., “SoK: Decentralized Finance (DeFi) Attacks,” in *2023 IEEE Symposium on Security and Privacy*, 2023, pp. 2444-2461. doi: [10.1109/SP46215.2023.10179435](https://doi.org/10.1109/SP46215.2023.10179435).

[11] SC4053 project contributors, “OrderBook Engine Specification,” *SC4053-BlockChain-Project*, `SPEC.md`, commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`, 2026. [Online]. Available: https://github.com/Nitecry7/SC4053-BlockChain-Project/blob/8753521b83bd37896ff24314a3c1eaa36bd2a374/SPEC.md.

[12] SC4053 project contributors, “OrderBook Solidity Implementation,” *SC4053-BlockChain-Project*, `contracts/src/OrderBook.sol`, commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`, 2026. [Online]. Available: https://github.com/Nitecry7/SC4053-BlockChain-Project/blob/8753521b83bd37896ff24314a3c1eaa36bd2a374/contracts/src/OrderBook.sol.

[13] SC4053 project contributors, “OrderBook Regression Tests,” *SC4053-BlockChain-Project*, `contracts/test/OrderBook.Regression.t.sol`, commit `8753521b83bd37896ff24314a3c1eaa36bd2a374`, 2026. [Online]. Available: https://github.com/Nitecry7/SC4053-BlockChain-Project/blob/8753521b83bd37896ff24314a3c1eaa36bd2a374/contracts/test/OrderBook.Regression.t.sol.

*Draft verification status:* Main-branch code, named regression assertions and source documents have been read. No new compilation or execution has been performed in this session. The collaborator's E1-E11 results are described as proposed or pending verification, not as independently validated evidence. Verify author metadata, the research branch, and the official deadline before submission.
