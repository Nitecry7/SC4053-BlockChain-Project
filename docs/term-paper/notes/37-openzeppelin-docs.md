# 37: OpenZeppelin Contracts 5.x API reference, Utils and ERC20 (SafeERC20) (grey literature)

## 1. Verified citation (IEEE style)
OpenZeppelin, "Utilities," OpenZeppelin Contracts 5.x API Reference. [Online]. Available: https://docs.openzeppelin.com/contracts/5.x/api/utils (accessed Nov. 25, 2026).
OpenZeppelin, "ERC 20: SafeERC20," OpenZeppelin Contracts 5.x API Reference. [Online]. Available: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20 (accessed Nov. 25, 2026).
- Checked against: saved HTML docs/term-paper/papers/37-openzeppelin-docs.html (Utils page, HTTP 200, 2.8 MB, text present) and docs/term-paper/papers/37-openzeppelin-safeerc20.html (ERC20 page, HTTP 200, 0.85 MB, SafeERC20 section present). Both fetched with plain curl on 2026-11-25.
- Installed version: contracts/lib/openzeppelin-contracts/package.json `"version": "5.7.0"`; submodule tag v5.7.0. File headers: ReentrancyGuard "last updated v5.5.0", Pausable "last updated v5.3.0", SafeERC20 "last updated v5.7.0".
- Version read: the "5.x" docs as served on 2026-11-25. The source links on these pages point to tag v5.6.1, not v5.7.0. No 5.7 specific page exists (`/contracts/5.7/api/utils` redirects to a 404). Cite as "OpenZeppelin Contracts 5.x docs; installed library v5.7.0".
- Differences between what I read and the installed version: spot check of the installed v5.7.0 sources matches the docs text for what we cite (SafeERC20 "non-reverting calls are assumed to be successful"; `trySafeTransfer` present; ReentrancyGuard deprecation note and transient storage tip present in contracts/utils/ReentrancyGuard.sol:20-28). Other differences between v5.6.1 and v5.7.0 not checked.
- Fields NOT verified: individual authors (corporate author "OpenZeppelin"); page publication or update date (none shown).
- Peer review status: grey literature (vendor library documentation; the library itself is widely audited, the docs are not peer reviewed).

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | ReentrancyGuard provides a `nonReentrant` modifier that blocks nested calls; since there is one guard, two `nonReentrant` functions cannot call each other (use private workers behind external entry points). | Utils, "ReentrancyGuard" |
| 2 | The storage-based ReentrancyGuard is marked deprecated and will be replaced by ReentrancyGuardTransient (EIP-1153) in v6.0; a `nonReentrantView` variant exists to stop views reading inconsistent state mid-call. | Utils, "ReentrancyGuard" |
| 3 | SafeERC20 wraps ERC20 calls so they revert when a token returns false and accepts tokens that return nothing; a non-reverting call is assumed to have succeeded. | ERC20, "SafeERC20" |
| 4 | SafeERC20 also offers `trySafeTransfer` / `trySafeTransferFrom` that return a bool instead of reverting, and `forceApprove` for tokens like USDT. | ERC20, "SafeERC20" |
| 5 | Pausable is an emergency stop "triggered by an authorized account"; `_pause` and `_unpause` are internal, and nothing is pausable until the `whenNotPaused` / `whenPaused` modifiers are applied. | Utils, "Pausable" |
| 6 | Neither page says SafeERC20 handles fee-on-transfer or rebasing tokens (searched; not found); it checks success only, not amounts received. | ERC20, "SafeERC20" |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | background (design) | direct | We inherit ReentrancyGuard (contracts/src/OrderBook.sol:8, :14) and mark every external write `nonReentrant` (:58, :75, :89, :103, :127); getOrder/getBook (:148, :162) are plain views, not `nonReentrantView`. |
| 2 | background, future work | direct | Our guard is the deprecated storage version; switching to the transient variant is a v6 migration note, not a security fix. |
| 3 | C5 | direct | We call `safeTransferFrom` for escrow (OrderBook.sol:217, :219) and `safeTransfer` for payouts and refunds (:237-238, :296-298). It handles missing return values but a token that reverts still reverts the whole settlement. |
| 4 | M10 | analogous | `trySafeTransfer` is a library building block that would let settlement record a failed payout as a claimable balance (pull payments) instead of reverting; we do not use it. |
| 5 | design trade-off (roleless) | direct | Pausable only helps if someone holds pause rights; our contracts have no owner or pause by design (MarketFactory.sol:7-8), so Pausable is not applicable without adding a trusted role. |
| 6 | C5, M10 | gap | SafeERC20 does not protect against fee-on-transfer misaccounting; see 38. |

## 4. Limits for an on-chain order book
- API reference, not analysis: says what the tools do, not whether they suffice for a DEX.
- The 5.x docs track the latest 5.x release; source links point to v5.6.1 while we install v5.7.0.
- No threat model for hostile tokens; nonReentrant protects our own state but not liveness when a token reverts.

## 5. Claim check
- Summary given: "ReentrancyGuard and SafeERC20 facilities; Pausable requires configured authorization to be effective."
- Verdict: supported, with a nuance on Pausable
- Evidence:
  - ReentrancyGuard: holds (Utils, "ReentrancyGuard": modifier that prevents nested calls). Note the page also marks it deprecated in favour of ReentrancyGuardTransient for v6.0.
  - SafeERC20: holds (ERC20, "SafeERC20": wrappers that throw on failure, support no-return tokens).
  - Pausable: holds in substance. The page calls it a mechanism "triggered by an authorized account", makes `_pause`/`_unpause` internal and says functions are not pausable until the modifiers are applied. It does not itself include access control; the inheriting contract must add it. Phrase as "the developer must expose pause through an authorized role and apply the modifiers".

## 6. One quote (optional, max one sentence)
> "Note that they will not be pausable by simply including this module, only once the modifiers are put in place." (Utils, "Pausable")
