# 20: Commitment Against Front-Running Attacks

## 1. Verified citation (IEEE style)
A. Canidio and V. Danos, "Commitment against front-running attacks," *Management Science*, vol. 70, no. 7, pp. 4429 to 4440, Jul. 2024, doi: 10.1287/mnsc.2023.01239.

- Checked against: PDF page 1 (title "Commitment Against Front-Running Attacks", authors Andrea Canidio (CoW Protocol) and Vincent Danos (CNRS and ENS), dated "August 1, 2023", side stamp "arXiv:2301.13785v3 [econ.TH] 28 Jul 2023"; footnote thanks "the editor Joshua Gans, two anonymous referees").
- Crossref DOI record https://api.crossref.org/works/10.1287/mnsc.2023.01239 (same title and authors; Management Science; vol. 70; issue 7; pages 4429 to 4440; published-print 2024-07).
- EconPapers/RePEc https://econpapers.repec.org/RePEc:inm:ormnsc:v:70:y:2024:i:7:p:4429-4440 (same: vol. 70, issue 7, 2024, pp. 4429 to 4440, DOI 10.1287/mnsc.2023.01239).
- DBLP: NOT checked. dblp.org returned an Anubis "Access Denied" page and the DBLP API returned HTTP 429. Publisher page (pubsonline.informs.org) not opened.
- Version read: arXiv v3 (28 Jul 2023; title page dated 1 Aug 2023), 30 PDF pages. Published version: Management Science 70(7), 2024, pp. 4429 to 4440, DOI 10.1287/mnsc.2023.01239.
- Differences between what I read and the published version: title and authors match. Year differs (preprint 2023, journal 2024). Page layout differs (30-page preprint vs 12 journal pages); content not compared, since the journal text was not opened. The referee/editor acknowledgement on p. 1 suggests v3 is the post-review text, but that is not confirmed.
- Fields NOT verified: DBLP record (blocked); exact online-first date (Crossref record gave none).

## 2. Findings
| # | Finding (own words) | Pointer (p. N, Sec.) |
|---|---|---|
| 1 | Front-running arises because pending transactions are public: an attacker sees a victim's transaction, crafts one of their own and pays to be placed earlier. | p. 2 (Sec. 1) |
| 2 | Attack vs legitimate competition: B is an attacker if, under a "veil of ignorance" (not seeing A's message), B would not send anything (condition (4)); severity = how much the attacker relies on the victim's message. | pp. 2 to 3 (Sec. 1); p. 12 (Sec. 2, eq. (4)) |
| 3 | Without protection, B attacks iff qPB(s) > f; when PA(s) > c but (1 - q)PA(s) < c the threat alone stops A from transacting. | p. 11 (Sec. 2, Prop. 1) |
| 4 | Protocol: commit S(addr, message), e.g. a SHA-256 hash including the address that will send the reveal; reveal in the next block; contract executes the first valid reveal. Copying the victim's commit fails because the reveal comes from a different address (Lemma 1). | p. 3 (Sec. 1); pp. 13 to 15 (Sec. 3, Sec. 3.1, Lemma 1) |
| 5 | Prop. 2: if pi <= c/beta ("guessing is hard for B") there is no front-running in equilibrium; if pi > c/beta, front-running occurs with strictly positive probability. | p. 16 (Sec. 3.1, Prop. 2) |
| 6 | Costs to the honest user: "one additional message is required" and the payoff comes with a one-block delay (discount beta). | p. 16 (Sec. 3.1) |
| 7 | The protocol is most effective against the most severe attacks (low pi) and keeps legitimate competition, postponed by one period. | p. 16 (Sec. 4.1); p. 17 (Sec. 4.2) |
| 8 | With two attackers there is no equilibrium where both commit with probability 1; the protocol lowers competition and total attacker spending, which helps the victim. | p. 4 (Sec. 1); pp. 18 to 22 (Sec. 4.5) |
| 9 | Extensions: hidden commitments via a shared container-contract template; partial use for a subset of messages; commit/reveal periods to handle reveals that linger in the mempool (at the cost of longer waits). | pp. 22 to 24 (Sec. 5.1); pp. 25 to 27 (Sec. 5.2, 5.3) |
| 10 | Limits stated by authors: harms composability; not for contracts with an explicit mechanism for competing claims such as on-chain auctions (players may not reveal); not effective against suppression attacks (spam), where the victim's content is irrelevant. | pp. 27 to 28 (Sec. 6) |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | C1, C2, C3 | analogous | Public pending orders, limits and triggers are the information C1 to C3 exploit. |
| 2 | C1, C3, Security vs Privacy vs Scalability | analogous | C1/C3 attackers rely fully on the victim's visible limit or trigger, i.e. "severe" in the paper's sense. |
| 3 | C1 | analogous | Threat of attack can deter trading at all, an economic-security cost beyond direct losses. |
| 4 | M4 | direct | Gives a concrete contract-level commit and reveal design (address-bound hash) usable for orders. |
| 5 | M4 | direct | Protection is conditional on guessing being hard; a book with few price levels may make guessing easier (own inference). |
| 6 | M4, Security vs Privacy vs Scalability | direct | Two transactions and one block of delay per order: the privacy gain costs gas and latency. |
| 7 | M4, C1, C3 | direct | Supports using M4 against attacks that need the victim's exact limit/trigger. |
| 8 | M4 | analogous | Secondary benefit; less relevant to an order book where attacks are cheap dust orders. |
| 9 | M4, M5, C6 | analogous | Fixed commit/reveal periods resemble batch windows (M5); revealing needs a later action, similar to keeper dependence (C6). |
| 10 | C4, M4 | direct | C4 (dust wall) is suppression-like, so M4 does not fix it; an order book resolves competing claims (matching), so the auction caveat (non-reveal as free option) applies (own inference). |

## 4. Limits for an on-chain order book
- Model is a contract that settles claims in arrival order with no auction-like mechanism (p. 28, Sec. 6); a limit order book matches competing orders, which is closer to the excluded case.
- Commitment is weak: users may commit and never reveal (p. 5, Sec. 1), so in a book a committed order is a free option unless a penalty is added (own inference).
- Single-shot game with one victim message; no resting orders, partial fills, or stop triggers.
- No empirical evaluation or gas measurement; costs are abstract (c, f, beta).
- Assumes inclusion in the next block; mempool lingering only discussed informally (pp. 25 to 26, Sec. 5.3).

## 5. Claim check
- Summary given: "commit and reveal blocks the most severe attacks at the cost of two messages and a delay."
- Verdict: supported (with one condition)
- Evidence:
  - "commit and reveal": holds, p. 3 and pp. 13 to 14 (Sec. 3).
  - "blocks the most severe attacks": holds in the paper's terms. Abstract p. 1: "it prevents the most severe front-running attacks"; p. 16 (Sec. 4.1): "most effective at preventing the most severe front-running attacks". Formally this is Prop. 2 (p. 16): no front-running in equilibrium only when pi <= c/beta; otherwise attacks still occur with positive probability. "Blocks" should be read as "removes in equilibrium when guessing is hard", not as an absolute guarantee. Also not effective against suppression attacks (p. 28).
  - "at the cost of two messages": holds. Abstract p. 1: "it requires two messages"; p. 16 states it as "one additional message".
  - "and a delay": holds. Abstract p. 1 "imposes a delay"; p. 16: one-block delay, payoff discounted by beta.

## 6. One quote (optional, max one sentence)
> "Therefore, we can say that the protocol is most effective at preventing the most severe front-running attacks." (p. 16)
