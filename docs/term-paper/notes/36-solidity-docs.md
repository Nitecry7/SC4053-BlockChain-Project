# 36: Solidity documentation v0.8.24, "Security Considerations" (grey literature)

## 1. Verified citation (IEEE style)
The Solidity Authors, "Security considerations," Solidity 0.8.24 Documentation. [Online]. Available: https://docs.soliditylang.org/en/v0.8.24/security-considerations.html (accessed Nov. 25, 2026).
- Checked against: saved HTML docs/term-paper/papers/36-solidity-docs.html (plain curl, HTTP 200, 62 KB, full text present; HTML title "Security Considerations" followed by "Solidity 0.8.24 documentation"; footer "Copyright 2016-2023, The Solidity Authors. Revision e11b9ed9").
- Version match: our contracts declare `pragma solidity ^0.8.20` (contracts/src/OrderBook.sol:2) and compile with `solc_version = "0.8.24"` (contracts/foundry.toml:7). The cited page is the version-matched v0.8.24 page, so it is preferred over the "latest" docs.
- Version read: v0.8.24 docs as served on 2026-11-25. Published version: same URL; versioned docs are frozen per release, but the page is not formally dated.
- Differences between what I read and the published version: none known. Later compiler versions may have edited this page; not compared.
- Fields NOT verified: individual authors (corporate author "The Solidity Authors" from the footer); exact publication date of the page (only the 2016-2023 copyright range and revision hash are shown).
- Peer review status: grey literature (official language documentation, community edited via GitHub).

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | Every contract execution is public and source code is often available; the docs compare a contract to a public web service open to malicious actors. | Intro of "Security Considerations" |
| 2 | Everything a contract uses is publicly visible, including local variables and state variables marked `private`. | Pitfalls, "Private Information and Randomness" |
| 3 | Any call from contract A to contract B (not only Ether transfers) hands control to B, which can call back into A before A finishes; multi-contract situations must also be considered. | Pitfalls, "Reentrancy" |
| 4 | Checks-Effects-Interactions (checks, then state writes, then external calls) is presented as the standard way to prevent reentrancy; calls to known contracts may still reach unknown ones, so apply it always. | Pitfalls, "Reentrancy"; Recommendations, "Use the Checks-Effects-Interactions Pattern" |
| 5 | Loops whose iteration count depends on storage can grow past the block gas limit and stall the contract; document such cases. | Pitfalls, "Gas Limit and Loops" |
| 6 | A recipient can make a send fail (revert or run out of gas) and so block progress in the sender; the docs recommend a "withdraw" pattern over a "send" pattern. | Pitfalls, "Sending and Receiving Ether" |
| 7 | Recommends limiting value held in a contract and adding a fail-safe mode (self-checks such as whether token sum equals balance, then disabling features or handing control to a trusted party). | Recommendations, "Restrict the Amount of Ether", "Include a Fail-Safe Mode" |
| 8 | Front-running, mempool visibility and transaction ordering are NOT discussed on this page (searched; not found). | whole page |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1, 2 | S6, background | direct (general) | Our getOrder and getBook views (contracts/src/OrderBook.sol:148, :162) expose every limit and stop trigger; the docs confirm that even without views the data would be public. |
| 3, 4 | background (design), C5 | direct | Our settlement calls arbitrary ERC20s; we use ReentrancyGuard (OrderBook.sol:8, :14) with `nonReentrant` on every external write (:58, :75, :89, :103, :127) and document the CEI exceptions in placeLimitOrder (:57). |
| 5 | C4, background | direct | Supports our explicit loop bounds and the shared MAX_MATCHES_PER_TX budget. |
| 6 | C5, M10 | analogous | Written for Ether, but the same logic covers a token that refuses `safeTransfer` inside settlement (OrderBook.sol:296-298): push payouts can be blocked by the recipient side; pull payments (M10) are the documented remedy. |
| 7 | design trade-off (roleless) | analogous | The fail-safe advice argues for an admin or pause path, which we deliberately omit; useful as the counter-position in the discussion. |
| 8 | C1, C2, C3 | gap | Cannot cite this page for front-running; use the academic sources (e.g. 02). |

## 4. Limits for an on-chain order book
- General guidance for any contract; no exchange, order-book or token-specific advice.
- The push vs pull argument is about Ether and the 2300 gas stipend; transfer to ERC20 refusal is our analogy, not the docs' claim.
- Nothing on hostile or nonstandard ERC20s (fee-on-transfer, blocklists, return values).
- No discussion of MEV, mempool observation, or ordering attacks.

## 5. Claim check
- Summary given: "External contract calls can introduce reentrancy; all on-chain state and transaction inputs are observable."
- Verdict: supported, with a wording caveat on "transaction inputs"
- Evidence:
  - Reentrancy: holds. The page says reentrancy follows from "any function call on another contract", not only Ether transfer (Pitfalls, "Reentrancy").
  - State observable: holds. "Everything you use in a smart contract is publicly visible, even local variables and state variables marked private" (Pitfalls, "Private Information and Randomness").
  - Transaction inputs: implied, not stated as such. The intro says every execution happens in public; the page never mentions calldata visibility, pending transactions or the mempool. If the paper needs "inputs are visible before inclusion", cite another source.

## 6. One quote (optional, max one sentence)
> "Everything you use in a smart contract is publicly visible, even local variables and state variables marked private." (Pitfalls, "Private Information and Randomness")
