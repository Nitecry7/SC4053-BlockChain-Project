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

---

## 2026-10-28: Phase 0, commit, push and PR #1

**Prompt (summary):**
- Leave `docs/project.pdf` out of the commit.
- Check GitHub CLI auth.
- Verify the staged files.
- Commit, push `engine/setup`, and open a PR asking Person 2 to review the interface and spec.
- Ask Person 2 to make the repo private.

**Dropping project.pdf:**
- When showing the file list, the AI pointed out that the repo looked public, because it could be read without signing in.
- Committing the course brief would therefore publish it.
- The human decided to keep it local: it is unstaged, listed in `.gitignore`, and noted in SPEC.md as intentionally untracked.

**gh auth issue:**
- `gh auth status` reported an invalid saved token for AdvaithK500.
- The AI stopped instead of trying to work around it.
- The human ran `gh auth login -h github.com` (HTTPS, web browser), and the re-check showed a valid login with the `repo` scope.

**Repo visibility:**
- The repo (`Nitecry7/SC4053-BlockChain-Project`) is public.
- Engine code is coursework, so PR #1 asks Person 2, who owns the repo, to switch it to private before any engine code is pushed.

**Evidence:**
- The staged-file check found no `project.pdf`, `out/`, `cache/` or nested `.git`. `.gitmodules` and both submodules were staged as gitlinks (mode 160000).
- Commit `cd35f8b`, pushed to `origin/engine/setup`.
- PR: https://github.com/Nitecry7/SC4053-BlockChain-Project/pull/1

---

## 2026-11-01: Status check and revised schedule (no code changes)

**Prompt (summary):** Resuming after a few days away. Without editing, read the spec docs and prompt log, check git and PRs, run `forge build` and `forge test`, check repo visibility, then propose a plan for 1 to 8 Nov using the cut order, and give the exact next step.

**Findings (verified by the AI with git, gh and forge):**
- Only Phase 0 is done. `contracts/src/` held only `.gitkeep`, and the one passing test was the Phase 0 smoke test.
- PR #1 was open with 0 comments and 0 reviews. Person 2 had pushed nothing, and `origin/faheem` had no commits beyond main.
- The repo is now private.
- Phase 0 gaps: PR #1 not merged, so not yet on main as the acceptance line requires; `.claude/commands/` missing, although Phase 0 lists it; the last prompt-log entry uncommitted.

**What the earlier AI work got wrong or left unclear:**
- ENGINE_PHASES.md listed `.claude/commands/` under Phase 0 and was marked done, but the folder was never created.
- ENGINE_PHASES.md holds no phase prompts. The Phase 1 prompt in section 11 of the plan predates the 28 Oct decisions: it fixes the mock at 18 decimals and omits `LOT_SIZE`, `TICK_SIZE` and the constructor tests. Its "bodies that revert" also did not say how, given the rules against revert strings and new errors. The AI proposed an updated prompt using a bare `revert()`.
- The estimates are still untested: only Phase 0 has a logged result.

**Human decisions:**
- Accepted the revised schedule. Phase 7 now runs before Phase 6, with a stop-limit go/no-go on the night of Tue 3 Nov. The ABI freeze moves to Mon 2 Nov.
- Prompts live in ENGINE_PHASES.md from now on, starting with the updated Phase 1 prompt.
- Added `.claude/commands/` from section 10 of the plan. `log-issue` uses the brief's four-part format, checked against `docs/project.pdf`.
- Asked Person 2, in a comment on PR #1, to review CONTRACT_INTERFACE.md and merge by noon on 2 Nov.

---

## 2026-11-01: Phase 1, skeleton

**Prompt (summary):** The Phase 1 prompt in docs/ENGINE_PHASES.md: interface, configurable-decimals mock, OrderBook skeleton with bare `revert()` stubs, abstract test base, constructor revert tests, delete the smoke test, check the interface against CONTRACT_INTERFACE.md, do not commit.

**What the AI produced:**
- `src/interfaces/IOrderBook.sol`, `src/OrderBook.sol`, `test/mocks/MockERC20.sol`, `test/OrderBookBase.t.sol`. Deleted `test/Toolchain.t.sol`.
- `lastTradePrice` and `hasTradePrice` are public state variables, not stubs, and stay at their defaults until Phase 3a. Writes already carry `nonReentrant`.
- Two tests beyond the prompt check that setUp stored the tokens and constants, and funded and approved the traders.

**What the AI got wrong or left unclear:**
- The first attempt, one large shell script, failed with a quoting error before running anything. The AI confirmed the tree was unchanged and recreated the files with the file tool. No effect on the code.
- OpenZeppelin `ReentrancyGuard` adds `ReentrancyGuardReentrantCall()` to the compiled ABI. CONTRACT_INTERFACE.md does not list it. IOrderBook.sol itself matches the doc; the difference is only in the OrderBook ABI. Flagged for a human decision, not changed.
- A token with no `decimals()` function makes the constructor revert without `UnsupportedDecimals`. It still cannot deploy. Not tested; flagged.

**Evidence:**
- `forge build`: success with 8 warnings: 5 mutability warnings on view stubs, 2 uninitialized-state lint warnings on `lastTradePrice` and `hasTradePrice`, and 1 unreachable-code warning in `ReentrancyGuard`, which appears to come from `nonReentrant` wrapping a stub that always reverts. All 8 are expected to go once the functions are implemented; not yet confirmed.
- `forge test`: 7 passed, 0 failed, 0 skipped. `forge fmt --check`: no differences.
- Scripted comparison of the doc block with IOrderBook.sol: 51 statements each, same order, 25 comments each, no differences.

**Human decisions:**
- `ReentrancyGuardReentrantCall()` is documented in CONTRACT_INTERFACE.md as an inherited error. It sits outside the IOrderBook block, because declaring it in both the interface and the guard would not compile.
- The freeze banner now says "target 2 Nov".
- The empty revert for a token without `decimals()` is a known limitation in SPEC.md. The AI added `test_constructor_emptyRevertWhenTokenHasNoDecimals`, so the note rests on a test: 8 passed, 0 failed.
- Merge Phase 1 into main with `--no-ff`, before Person 2 has reviewed PR #1. The merge includes the PR #1 commits.

---

## 2026-11-01: Phase 2a, book structure

**Prompt (summary):** The Phase 2a prompt in docs/ENGINE_PHASES.md: sorted doubly linked lists, `_insert` bounded by `MAX_INSERT_SCAN`, `_unlink`, `getBestBid`, `getBestAsk`, `getBook`, harness tests, and an `assertBookSorted` helper. Do not commit.

**What the AI produced:**
- `src/OrderBook.sol`: list storage, `_stampBookSeq`, `_insert`, `_unlink`, `_ranksAhead` and the three views.
- `test/mocks/OrderBookHarness.sol`, `test/OrderBook.Book.t.sol` (20 tests), and `assertBookSorted` in the base test.

**AI choices the human should check:**
- `assertBookSorted` lives in the base test but needs the internal links, and no new interface function is allowed. So the base test now deploys `OrderBookHarness` as `book`, and later phases will test through the harness. The harness adds accessors only. The constructor tests still deploy `OrderBook` directly.
- "Past the limit" is read as: exactly `MAX_INSERT_SCAN` orders ahead succeeds, one more reverts. Both boundaries are tested.
- `assertBookSorted` is called in every Book test, but not in the constructor tests, which never touch the lists.
- Beyond the prompt: tests for a deep book accepting a new best order, for price beating `bookSeq`, and for side independence.

**What the AI got wrong or left unclear:**
- `_unlink` has a precondition the compiler cannot enforce: calling it on an order that is not in the book empties that side, because such an order looks like a head with no successor. It is documented on the function, and Phase 4 must check status first. It is not guarded in code.
- `forge fmt --check` reported whole-file differences after the branch switches. Cause: `core.autocrlf=true` checks files out with CRLF. LF copies of the six Solidity files pass `forge fmt --check`, so the formatting is fine, but the check will keep failing in this checkout until line endings are settled.

**Evidence:**
- `forge build`: success, 6 warnings: 2 mutability warnings on remaining stubs, 1 unreachable-code warning in `ReentrancyGuard`, 2 uninitialized-state lints, and a new `require-revert-in-loop` lint on `BookTooDeep`, which is intended.
- `forge test`: 28 passed, 0 failed, 0 skipped.
- Temporary source mutations, each restored afterwards: flipping the `bookSeq` comparison failed 3 tests; breaking the prev link in `_unlink` failed 1 (`test_unlink_middle`); lowering the scan limit by one failed 1. All three failures came from direct assertions, so `assertBookSorted` itself has not been shown to catch a fault.

**Human decisions:**
- Person 2 approved CONTRACT_INTERFACE.md verbally, as reported by Person 1. There is no written approval on GitHub. The banner now says FROZEN. The earlier PR #1 comment asking Person 2 to merge is outdated and is to be ignored.
- Added `.gitattributes` (LF for `*.sol`, `*.md`, `*.toml`, `*.json`) and renormalised, so `forge fmt --check` works in this checkout.
- `_unlink` must be guarded in code, not only by a comment. The AI added a link check that reverts with the existing `OrderNotActive`, since the frozen interface allows no new error. Logged as `docs/ai-audit/issues/001-unlink-empties-book-side.md`, with failing and passing test output.
- Merge Phase 2a into main with `--no-ff`.
