# 38: OWASP SCWE-110, Fee-On-Transfer Token Misaccounting (grey literature)

## 1. Verified citation (IEEE style)
OWASP Smart Contract Security Project, "SCWE-110: Fee-on-transfer token misaccounting," Smart Contract Weakness Enumeration (SCWE), v1.0, Aug. 19, 2026. [Online]. Available: https://scs.owasp.org/SCWE/SCSVS-COMP/SCWE-110/ (accessed Nov. 25, 2026).
- Checked against: saved HTML docs/term-paper/papers/38-owasp-scwe110.html (plain curl, HTTP 200, 383 KB; title "SCWE-110: Fee-On-Transfer Token Misaccounting - OWASP Smart Contract Security"; full Description, Remediation and code examples present in the static HTML).
- Page metadata: "Last updated: August 19, 2026"; banner "Stable Version v1.0" with the note that the content is still under active development and may change (structure, IDs, content, URLs). Category SCSVS-COMP. Relationship listed: CWE-682 Incorrect Calculation. Footer "OWASP Foundation 2026", CC-BY-4.0.
- Version read: page as served on 2026-11-25 (last updated 2026-08-19).
- Differences between what I read and the published version: none known; the page warns it can change at any time.
- Fields NOT verified: individual authors (none named for the entry; corporate author used); whether "Aug. 19, 2026" is the edit date of this entry or a site-wide build date.
- Peer review status: grey literature (community-maintained OWASP weakness list).

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | Code that assumes an ERC20 transfer moves exactly the requested amount breaks with fee-on-transfer or deflationary tokens; crediting the requested rather than received amount can let a protocol be drained or mis-account balances. | "Description" |
| 2 | Remediation: measure the contract's token balance before and after the transfer and credit the difference. | "Remediation", first item; "Examples", "Fixed" |
| 3 | Remediation also lists allowlists or blocklists for incompatible tokens, or explicit fee handling, and checking that share or debt accounting uses the net amount. | "Remediation", items 2 and 3 |
| 4 | Vulnerable example: a vault calls `transferFrom(msg.sender, this, amount)` then adds `amount` to the user's deposit. | "Examples", "Vulnerable" |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1, 4 | C5 | direct | Our `_pullEscrow` pulls `order.amount` base or `order.lockedQuote` quote with `safeTransferFrom` (contracts/src/OrderBook.sol:214-221) and books the order at the requested amount; OrderBook.sol contains no `balanceOf` check. With a fee-on-transfer base or quote token the book holds less than it owes, so the last payouts or refunds in that market revert. The constructor only checks `decimals() == 18` (:49). |
| 2 | M10 (alternative) | direct | Balance-delta crediting is the source's fix; for our book it would conflict with LOT_SIZE and exact cost rules, so rejecting a short receipt is the closer fit. Proposal only, not implemented. |
| 3 | M10 | direct | Explicitly names a token allowlist as a remediation, matching M10's allowlist branch. |

## 4. Limits for an on-chain order book
- Written around a deposit vault, not an order book; transfer out (payouts) and fees on outgoing transfers are not discussed.
- Covers only fee-on-transfer and deflationary tokens; refusing or blocklisting tokens (our push payout liveness problem in C5) are outside this entry (SCWE-111 rebase drift is a separate entry, not read).
- Short entry: no incident data, no severity rating, no references beyond CWE-682.
- Allowlists conflict with permissionless market creation; the page does not discuss that trade-off.

## 5. Claim check
- Summary given: "Fee-on-transfer token misaccounting can arise when internal credit assumes the requested amount arrived; recommends tracking actual balance deltas."
- Verdict: supported
- Evidence:
  - Cause: holds ("Description": crediting the requested amount instead of the received amount).
  - Fix: holds ("Remediation": measure balances before and after transfers; "Fixed" example credits `received`). The page also offers allowlists and explicit fee handling as alternatives, which is worth mentioning next to M10.
  - Last updated: "August 19, 2026" shown on the page; marked v1.0 and subject to change.

## 6. One quote (optional, max one sentence)
> "Measure token balances before and after transfers to calculate the actual received amount." ("Remediation")
