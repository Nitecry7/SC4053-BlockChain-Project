# Prompt log (Person 1, trading engine)

Each entry records:
- date and phase
- what was asked (a summary of the prompt)
- what the AI produced
- what the AI got wrong or left unclear
- what the human decided

Tool: Claude Code (model: Claude Opus 5.5).

---

## 2026-10-28: Phase 0, planning session (plan mode, no edits)

**Prompt (summary):** Read docs/DEX_Trading_Engine_Plan.md fully and explore the whole repo
without editing. Report:
- what exists, and any conflicts with the plan
- a revised phase plan (goal, files, functions, tests, acceptance criteria and estimate per phase)
- which decisions to agree with Person 2 now and which can wait
- risks to 31 Oct and 8 Nov, and the cut order

**Repo findings (verified by the AI with git, glob and version commands):**
- The repo has one commit (`095b2af`, one-line README). The remote has only `main`. The plan in `docs/` was untracked.
- There are no contracts, Foundry config, tests or frontend. Person 2 had pushed nothing.
- Foundry 1.8.6 is installed in `~/.foundry/bin`. It was not on the PATH of the agent's non-interactive shell; interactive and login shells find it via `~/.bashrc`.
- Node and Slither are not installed.

**Gaps the AI found in the plan's interface and spec:**

| Gap | Problem | Resolution |
|---|---|---|
| (a) | No error for zero or identical token addresses, although the security checklist requires the check | Added `InvalidTokens()` |
| (b) | Dust: a tiny fill can have `cost = q*p/1e18` round to 0, so a seller gives base for 0 quote | The AI proposed `AmountTooSmall()`. **The human replaced this** (see below) |
| (c) | Rule "lockedQuote decreases by the quote this fill used up" is ambiguous | SPEC A5: after each fill, `lockedQuote = requiredQuote(remaining, limit)` and the excess is refunded. Solvent by construction |
| (d) | The frontend must reproduce the rounded-up buy escrow for `approve`, which is an integration risk | Added the pure view `requiredQuote(amount, price)` |
| (e) | Events on stop activation not specified | `StopOrderTriggered` only (no `OrderPlaced`), followed by `Trade` events |
| (f) | `triggerStopOrders` had no bounded way to find eligible orders | Two sorted stop lists (buy ascending, sell descending by trigger), so eligible orders are always at the head |
| (g) | Self-trades not specified | Allowed and documented |

**Human changes to the AI's proposal:**
1. **Dust is handled by lot and tick sizes, not `AmountTooSmall`.**
   - What the AI got wrong: `AmountTooSmall` only rejects orders whose *total* cost rounds to 0. Individual partial fills could still round down, and the buyer escrow would still need rounding up and dust refunds.
   - The human's fix: `LOT_SIZE = TICK_SIZE = 1e9`, with `amount % LOT_SIZE == 0` and `price % TICK_SIZE == 0`. Then `amount * price` is always a multiple of 1e18, so every fill cost is exact.
   - Errors are `InvalidLotSize` and `InvalidTickSize`, exposed as public constants. Rule (c) and `assertSolvent` stay as a safety net.
2. **One shared fill budget in `triggerStopOrders`.**
   - What the AI got wrong: it proposed capping the gas risk at `maxCount × MAX_MATCHES_PER_TX` fills, which multiplies the worst-case gas.
   - The human's fix: one shared budget of `MAX_MATCHES_PER_TX` fills across the whole call. Activated orders past the budget rest on the book, and `matchOrders` clears them.
3. The brief (docs/project.pdf Section 5.1) was verified by the human. Only the 8 Nov date still needs confirming on NTULearn.
4. Cut order: Slither moved below batch matching (it is cheap, and it is report Section 6 evidence).
5. CONTRACT_INTERFACE.md is marked DRAFT until Person 2 confirms it.

**Found while writing SPEC.md:** with stop orders, ties by order ID let a stop that was placed
early but triggered late jump ahead of orders that entered the book in between. This is recorded as SPEC open item O1, to decide before Phase 6.

**Output:**
- CLAUDE.md
- SPEC.md
- CONTRACT_INTERFACE.md (DRAFT)
- docs/ENGINE_PHASES.md
- this log
- `.gitignore`

The PATH line was already present in `~/.bashrc`, so nothing was added.

---

## 2026-10-28: Phase 0, Foundry scaffold and O1 decision

**Prompt (summary):**
- Scaffold `contracts/` as a Foundry project with no nested git repo.
- Pin solc 0.8.24, set paths and fuzz/invariant settings.
- Add OpenZeppelin v5.x as a submodule, with a remapping.
- Run `forge build` and `forge test` and show the real output.
- Resolve O1 using an internal `bookSeq`.
- Commit, push, and open a PR for Person 2's review.

**What the AI did:**
- `forge init contracts --no-git --empty`. There is no `.git` inside `contracts/`.
- Replaced the forge-std copy with a submodule pinned to v1.17.0, and added OpenZeppelin as a submodule pinned to v5.7.0.
- `foundry.toml`:
  - solc 0.8.24, cancun, optimizer at 200 runs
  - remappings for `@openzeppelin/contracts/` and `forge-std/`
  - fuzz runs 1000; invariant runs 256, depth 64
  - a `deep` profile with 10000 fuzz runs, and invariant runs 1000, depth 128
- Added `test/Toolchain.t.sol`, a smoke test that uses OZ ERC20, SafeERC20 and ReentrancyGuard through the remapping.

**AI mistake caught during the step:** `forge init --no-git` installed forge-std as a plain directory copy, not a
submodule. The AI checked (`git describe` failed, and there was no `.git` in the library), removed it, and re-added it as a
pinned submodule. A plain copy would have committed thousands of vendored files and left the version unpinned.

**Evidence:** `forge build`: "Compiling 33 files with Solc 0.8.24 … Compiler run successful!" (exit 0).
`forge test`: "[PASS] test_OpenZeppelinRemappingAndSafeTransfer() … 1 tests passed, 0 failed" (exit 0).

**Human decision, O1:**
- Price-time priority ties, and the `matchOrders` maker rule, use an internal `bookSeq`.
- `bookSeq` is stamped when an order enters the book: at placement, or at stop activation. The order ID is not used.
- It stays internal, so the interface is unchanged.
- Updated SPEC.md, the CLAUDE.md engine rules and ENGINE_PHASES.md. Phase 2a must test a case where a higher order ID with a lower `bookSeq` ranks first, and Phase 6b must test that an activated stop queues behind earlier equal-price orders.
