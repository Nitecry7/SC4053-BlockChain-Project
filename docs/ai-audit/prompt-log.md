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

---

## 2026-11-01: Phase 2b, place and rest

**Prompt (summary):** The Phase 2b prompt in docs/ENGINE_PHASES.md: `placeLimitOrder` without matching and with escrow pulled last, `getOrder`, `getUserOrderIds`, `requiredQuote`, `assertSolvent`, and placement tests. Do not commit.

**What the AI produced:**
- `src/OrderBook.sol`: the placement flow and the three functions. `requiredQuote` uses OpenZeppelin `Math.mulDiv` rounding up, and is `public` so placement can call it.
- `test/OrderBook.Place.t.sol` (22 tests), `assertSolvent` in the base test, and a `nextOrderId` accessor on the harness.

**AI choices the human should check:**
- `assertSolvent` uses the SPEC A8 statuses (Open, PartiallyFilled, PendingTrigger), wider than "open" in the prompt, so it will not need changing in later phases. It sums over every placed order rather than walking the book.
- `getOrder` returns an all-zero order for an unknown ID. Neither SPEC.md nor the interface defines this case.
- Beyond the prompt: tests for validation order, `BookTooDeep` on placement without pulling escrow, a failed attempt not using up an ID, the smallest aligned order, and rounding up on unaligned `requiredQuote` inputs, plus one fuzz test.

**What the AI got wrong or left unclear:**
- **Conflict for Phase 3a, not resolved here.** The prompt pulls escrow last. SPEC section 5 pulls escrow at step 2, before matching, and says "Escrow is pulled before any matching". With no matching the order is harmless in Phase 2b, so the AI followed the prompt. It cannot carry into Phase 3a: a taker's fills pay out of the contract's balance, so with escrow pulled last a fill would either revert or pay out of other traders' escrow.
- The AI's first version of the new test file failed `forge fmt --check` on one wrapped line. Fixed with `forge fmt`.
- Closed a gap from Phase 2a: a temporary test file, deleted afterwards, showed `assertBookSorted` and `assertSolvent` both detect faults (4 of 4 tests failed as intended, with the helpers' own messages).

**Evidence:**
- `forge build`: success, 6 warnings: unreachable code in `ReentrancyGuard` and 2 uninitialized-state lints (both from code not yet implemented), `require-revert-in-loop` (intended), `unsafe-typecast` on `uint64(block.timestamp)`, and `reentrancy-events` on `OrderPlaced`. That lint looks like a false positive: in the source, the emit comes before the only external call.
- `forge test`: 53 passed, 0 failed, 0 skipped. `forge fmt --check`: passes.
- Temporary source mutations, each restored afterwards: pulling base for buys failed tests through `assertSolvent`; removing the `bookSeq` stamp failed 1; swapping the validation order failed 1.

**Human decisions:**
- Escrow order follows SPEC.md: run the checks, record the order, pull escrow, match, then rest any remainder. This relies on `nonReentrant`, and SPEC.md section 5 now documents why the deviation from strict CEI is safe. The code committed in this phase still pulls escrow last; Phase 3a changes it, when matching is added.
- CONTRACT_INTERFACE.md now states that `getOrder` returns an all-zero `Order` for an unknown ID, and that the frontend should treat `id == 0` as "not found". No signature changed.
- Merge Phase 2b into main with `--no-ff`.

---

## 2026-11-01: Phase 3a prompt written, not run (uncommitted)

**Prompt (summary):** Commit and merge Phase 2b, create `engine/phase-3a`, write the human's Phase 3a prompt into docs/ENGINE_PHASES.md, and stop. Do not run it tonight.

**What the AI did:** Added the prompt word for word. No engine code changed on this branch.

**Left for Phase 3a:**
- The code on main still pulls escrow last, and the prompt's "after pulling escrow, match" changes that.
- The CLAUDE.md engine rule still asks for checks-effects-interactions in every function that moves tokens, with no mention of the exception now documented in SPEC.md. CLAUDE.md is a shared file, so it was not edited.
- The prompt's loop and cap overlap with Phase 3b, so 3b's remaining work would be its tests: sweep, FIFO at equal price, the cap, and self-trade.

---

## 2026-11-02: Side tasks during the Phase 3a review

**Prompt (summary):** While the independent review runs: draft the Phase 3b prompt (not Phase 4), install Slither and solc-select, and add the escrow exception to the CLAUDE.md engine rules.

**What the AI did:**
- Drafted the Phase 3b prompt in docs/ENGINE_PHASES.md, marked as a draft to check against the review. Not run. The human has not reviewed it yet.
- Installed slither-analyzer 0.11.6 and solc-select 1.2.0 with pip into the global Python 3.12, and installed solc 0.8.24 through solc-select. `slither --version` printed `0.11.6` in Git Bash. Slither has not been run on the code. `solc-select use` was not run, since it was not requested.
- Added the exception to the CLAUDE.md engine rules.

**Human decision:** CLAUDE.md is listed as a shared file that both teammates must agree to change. The human, as engine owner, decided this rule change does not need Person 2's sign-off. Person 2 has not been asked.

**Timing note:** The CLAUDE.md edit landed while the review subagent was running, and that subagent was told to read CLAUDE.md. It may have seen either version.

---

## 2026-11-02: Phase 3a, matching and settlement

**Prompt (summary):** The Phase 3a prompt in docs/ENGINE_PHASES.md: escrow before matching, one `_settleFill`, match tests including a reentrant mock token, then `/review-engine`, `/log-issue` for real findings, fixes with regression tests. Do not commit.

**What the AI produced:**
- `src/OrderBook.sol`: `_matchTaker` and `_settleFill`. Escrow is now pulled before matching, and any remainder rests after it.
- `test/OrderBook.Match.t.sol`, `test/mocks/ReentrantERC20.sol`, `test/mocks/ViewSpyERC20.sol`.
- The match loop and cap landed here as the prompt required, with basic sweep and cap tests.

**A test was rewritten, not weakened:** `test_place_crossingOrdersRestWithoutTrading` failed once matching existed (`1000000000000000000 != 0`). It pinned the Phase 2b behaviour that the 2b prompt called temporary. It is now `test_place_crossingOrderTradesInsteadOfResting` and asserts that the orders trade. `test_place_revertsBookTooDeepWithoutPullingEscrow` was renamed `test_place_bookTooDeepRevertRollsBackEscrowPull`, because the pull now happens and is rolled back.

**Independent review (subagent, no context from this session):** 73 tests passing at the time, and no fund-loss, stranding or list-corruption bug in the implemented code. Its own random-walk and mutation checks ran on throwaway copies. How each finding was handled:

| Finding | Severity | Outcome |
|---|---|---|
| F1 second CEI deviation, undocumented | Medium | Fixed in SPEC.md, pinned by tests. Issue 002. CLAUDE.md updated by human decision |
| F2 crossed book breaks price-time priority | Medium | Human: keep the behaviour. SPEC O4 resolved, limitation in section 8, pinned by a test |
| F3 dust griefing is nearly free | Medium | Human: documenting is enough, keep `LOT_SIZE`. In SPEC section 8 |
| F4 overflow in `_settleFill` | Low | Fixed with `mulDiv`, regression test. Issue 003 |
| F5 push payouts can be blocked by a hostile token | Low | Documented in SPEC section 8 |
| F6 direct transfers break A8's equality and are stranded | Low | Documented in A8 and section 8 |
| Interface drift: `SafeERC20FailedOperation` in the ABI, not in the doc | Low | Human: added next to `ReentrancyGuardReentrantCall` in CONTRACT_INTERFACE.md |
| F7 three matching mutants survived | High (tests) | Fixed with three tests. Issue 004 |
| F8 ordering inside `_settleFill` untested | Medium (tests) | Fixed with two payout tests. Issue 002 |
| F9 misleading test name | Low | Renamed |
| F10 helpers miss book membership | Low | `assertBookSorted` strengthened. Issue 004 |
| F11 further missing tests | Low | Left for Phase 3b. The sell-side tick boundary was added to the draft |
| Phase 5 note: `matchOrders` must also unlink a filled taker | Later | Added to the Phase 5 row in ENGINE_PHASES.md |

**What the AI got wrong:** Everything in issues 002, 003 and 004. Also, the AI's mutation script reported one caught mutant as SURVIVED because of its own output filter. A direct run settled it, and issue 004 records this.

**Human decisions:**
- F2: keep the behaviour, document it as a limitation (a capped placement can leave the book crossed, and `matchOrders` clears it), and pin it with a test. The AI added `test_match_crossedBookNewTakerFillsOppositeHeadAheadOfOlderOrder`. `matchOrders` is still a stub until Phase 5, so the clearing half is not tested yet.
- F3: documenting dust griefing is enough. `LOT_SIZE` stays as it is.
- CLAUDE.md now names both exceptions: the escrow pull before matching and payouts during matching. The AI kept the existing "Do not move the pull to the end" sentence.
- `SafeERC20FailedOperation` added to the inherited errors in the frozen CONTRACT_INTERFACE.md, by the human's decision. No signature changed. Person 2 has not been asked.
- **The human approved the rewrite of `test_place_crossingOrderTradesInsteadOfResting`** (formerly `test_place_crossingOrdersRestWithoutTrading`).
- Commit Phase 3a, merge into main with `--no-ff`, push, and create `engine/phase-3b`. Phase 3b is to be run by the human in the morning.

---

## 2026-11-02: Phase 4 prompt drafted; Phase 3b commit request not carried out

**Prompt (summary):** Commit Phase 3b, merge into main with `--no-ff`, push, create `engine/phase-4` with `git push -u`, and draft the Phase 4 prompt, including reentrancy tests against the real `cancelOrder` and during the refund transfer.

**What the AI found:** `engine/phase-3b` had no changes and no commits beyond main (`6d1d14c`, no stashes). The Phase 3b prompt was still marked as a draft, the log had no Phase 3b entry, and the suite was unchanged at 80 tests. So there was no Phase 3b work in this checkout to commit.

**What the AI did:** Drafted the Phase 4 prompt in docs/ENGINE_PHASES.md, uncommitted on `engine/phase-3b`. It did not commit, merge or create `engine/phase-4`, because an empty merge would make main's history show Phase 3b as done. It asked the human how to proceed. The draft moves to `engine/phase-4`, uncommitted, once Phase 3b is merged.

**Draft choices for the human to check:** "the refund transfer" is read as both the `cancelOrder` refund and the price-improvement refund in `_settleFill`, which the Phase 3a review said was never a re-entry point. The check order means an unknown ID reverts with `NotOrderOwner`.

**Human decisions:** Run Phase 3b first, then commit and merge. The owner-before-status order is accepted, so an unknown ID gives `NotOrderOwner`.

---

## 2026-11-02: Phase 3b, sweeps, cap, self-trade and gas

**Prompt (summary):** The Phase 3b prompt in docs/ENGINE_PHASES.md: harden multi-level matching with tests only, add a fuzz test and a gas report, and propose `MAX_*` values without changing them. Do not commit. The human then authorised commit and merge once the review findings were fixed and the checks passed.

**What the AI produced:** Tests only, in `test/OrderBook.Match.t.sol`. `OrderBook.sol` did not change, and no test exposed a contract bug. Phase 3a already covered the buy-side one-tick boundary and the basic sweep and cap, so those were not repeated.

**Independent review (subagent, no context from this session):** no contract bugs. It worked out the expected balances by hand and they were correct. How each finding was handled:

| Finding | Severity | Outcome |
|---|---|---|
| The "worst case" gas test had no refunds and a cheap scan, so 1,281,301 understated the worst placement by about 500k | Medium | Replaced with `test_gas_worstCasePlacement`. The AI reproduced the reviewer's 1,778,221 exactly |
| `test_cap_remainderHittingBookTooDeepRevertsFillsToo` did not itself prove a fill happened before the revert | Low | Now places a filling order afterwards, which shows the reverted call really crossed |
| The fuzz test never reached the cap or a crossed book (0 in 500 seeds, by the reviewer's replay) | Low | Added `testFuzz_coarsePlacementsKeepSolvencyAndBookOrder` |
| FIFO tests cannot tell `bookSeq` from order ID | Info | Not testable until stops exist. The Phase 6b row already requires this case |
| No Phase 3b log entry or O2 proposal yet | Info | This entry, and O2 in SPEC.md |

**What the AI got wrong:**
- The AI labelled the first gas test "worst single placement ... with refunds" without checking. Carol's limit equalled the maker price, so no refunds happened, and the AI gave the human 1.28M as the worst case before the review corrected it.
- The AI's first replacement fuzz was still ineffective. A temporary metric showed 0 of 40 seeds reached the cap or a crossed book (best: 9 fills). The AI redesigned the generator with separate price bands and occasional large orders. The metric then showed the cap and a crossed book each reached in 10 of 15 seeds, and 10 fills at most in one placement. The metric was deleted afterwards.
- The new fuzz is slow: at 100 runs it took about 40 seconds. It is set to 25 runs in the default profile and 200 in the `deep` profile. Its coverage per seed is what the metric measured, not its run count.

**Evidence, final run before committing:**
- `forge build --force`: success, 6 warnings, the same kinds as Phase 3a.
- `forge test`: 95 passed, 0 failed, 0 skipped. `forge fmt --check`: passes.
- All six mutants from the Phase 3a review were caught, and the source was restored afterwards.

**Human decisions:**
- Keep `MAX_MATCHES_PER_TX = 10` and `MAX_INSERT_SCAN = 100`. Gas figures are in SPEC.md, and O2 is resolved.
- The interface comments still say "proposed 10" and "proposed 100". CONTRACT_INTERFACE.md is frozen and IOrderBook.sol must match it, so they were not changed. The values did not change.

---

## 2026-11-02: Phase 4, cancel (uncommitted, awaiting human review of the summary)

**Prompt (summary):** The Phase 4 prompt in docs/ENGINE_PHASES.md: `cancelOrder`, cancel tests, reentrancy tests against the real `cancelOrder` and during the refund transfers, a guard mutation, and the independent review. Pause before committing. Also remove "(draft, not run)" from the heading, and change the "proposed 10" and "proposed 100" comments to final values.

**What the AI produced:**
- `src/OrderBook.sol`: `cancelOrder`. `test/OrderBook.Cancel.t.sol`. `test/mocks/ReentrantERC20.sol` gained firing on the Nth balance change, a swallow mode and an `execute` function, so the token can own orders and pass the owner check. `test/mocks/ViewSpyERC20.sol` gained `makerLockedQuote`.
- SPEC.md section 5 now says "emit `OrderCancelled`, then refund", to match the approved prompt. It previously listed the refund first.
- Comment-only change in CONTRACT_INTERFACE.md and IOrderBook.sol: "10" and "100". The scripted comparison of the two files shows no differences.

**Human decisions:**
- The Phase 4 draft is approved, including owner before status, so an unknown ID gives `NotOrderOwner`.
- The interface comment change does not need sign-off, as it is comment-only. CONTRACT_INTERFACE.md is shared and frozen, and Person 2 has not been told yet.
- Pending: the commit and merge.

**Guard mutation:** With `nonReentrant` removed from `cancelOrder`, 10 tests failed. Failures showed `OrderNotActive` for re-entry as the owner, so with the guard gone, the final state still blocks a double refund. The reviewer also showed that removing both the guard and the `_unlink` guard lets a re-entrant cancel succeed during the price-improvement refund.

**Independent review (subagent, no context from this session):** The first run stalled and failed without a report. Its background mutant batch had been stopped because the system was low on memory. It was resumed, foreground only, and reported with 18 of 40 mutants run. No fund-affecting bug found. How each finding was handled:

| Finding | Severity | Outcome |
|---|---|---|
| Zero-address caller passes the owner check on unknown IDs | Low (real bug) | Fixed, regression test. Issue 005 |
| CEI inside `cancelOrder` not pinned: all transfers before state passed all tests | Medium (tests) | Fixed with `test_cancelRefund_viewsFinalOnSell` and `..OnBuy` |
| Event order not pinned; zero-value transfers of the other token unnoticed | Low (tests) | Fixed with two log tests |
| Status check and `_unlink` guard mask each other | Low | No test possible today. Added to the Phase 6a row |
| Later matching covered only a cancelled head, on asks only | Low (tests) | Now head, middle and tail on both sides, plus only element |
| Crossed-book cancel test weak; no sell-taker remainder or equal-price queue test | Low (tests) | Replaced with stronger tests |
| Owner re-entry not tested during the pull or payouts; "other order" payload hidden by the loop | Low (tests) | Added tests for the escrow pull, seller payout, buyer payout and other order |
| `placeStopLimitOrder` guard removal survives | Info | A deliberate stub. Added to the Phase 6a row |

**What the AI got wrong:** Issue 005, and the test gaps above. The AI's first draft had a crossed-book test that did not check the book was crossed.

**Skipped mutants:** The AI ran the reviewer's skipped mutants that apply to the source itself, plus new ones, one at a time with fuzz tests excluded. All were caught except S1 (zero-value refund transfer in `_settleFill`), which survived and is now covered by `test_match_noRefundTransferWhenNoPriceImprovement`. Not run: the reviewer's C9, S3 to S6, and the test-only T2 and T3.

---

## 2026-11-07: Recovery and sync with Person 2's main (Stage 0 review)

**Prompt (summary):** Recover uncommitted Phase 4 work that was left on `main` after a branch switch, when `git pull` refused to overwrite `CONTRACT_INTERFACE.md`. Commit it as WIP on `engine/phase-4` and push. Fast-forward `main` to `origin/main` (24 commits from Person 2). Merge `main` into `engine/phase-4`, keeping both sides. Show the interface diffs. Then do a full review and run `forge build --sizes`, `forge test` and `forge fmt --check`.

**What the AI did:**
- WIP commit `814dc53` on `engine/phase-4`, pushed. `main` was fast-forwarded to `8258fa6`. The AI checked that the old `main` is an ancestor of the new one, and that `main` matches `origin/main`.
- Merged `main` into `engine/phase-4` with no conflicts. The pull had failed only because of the uncommitted local edit. `CONTRACT_INTERFACE.md` was the only file both sides touched, and the edits were on different lines: Person 2 rewrote the deployment handoff (markets are created through `MarketFactory`), and Person 1 changed the `MAX_*` comments.
- Interface diffs against `main`: comment-only (`proposed 10` became `10`, `proposed 100` became `100`) in both `CONTRACT_INTERFACE.md` and `IOrderBook.sol`. No signature, event or error changed.
- Results on the merged tree: 233 tests passed, 0 failed (15 suites). `fmt --check` was clean. Sizes: OrderBook runtime 6,812 B, MarketFactory runtime 8,859 B (it embeds OrderBook's creation code), both well under the 24,576 B limit of EIP-170.
- Frontend scan by a subagent: web/ calls only `placeLimitOrder` and view functions, and decodes only `OrderPlaced` and `Trade`. `NotOrderOwner`, `OrderNotActive` and `InvalidMaxCount` have no UI message. The exported ABI in `web/lib/contracts/abis.ts` predates Phase 4, so `cancelOrder` still has the stub's unnamed parameter. The main session checked this.

**What the AI got wrong:** Nothing that changed the outcome. It updated `main` with `git branch -f main origin/main` rather than `git pull --ff-only`, and confirmed only afterwards that this was a fast-forward. Checking first is the safer order.

**Human decisions:**
- Commit the merge, keeping both sides.
- Fix `.gitignore`: Person 2's change removed the `docs/project.pdf` rule and left a stray `]`. Restore the rule, and keep `docs/Development_Project.pdf` tracked (the repo is private).
- Finish Phase 4 with a journey test using the brief's numbers. The `matchOrders` re-entry test waits for Phase 5.
- Tell Person 2 about the interface comment change, and that the ABI needs re-exporting after Phase 4 merges.

---

## 2026-11-07: Phase 4, finish (review, mutants, merge)

**Prompt (summary):** Finish Phase 4: add a journey test with the brief's exact numbers (Alice sells 100 at 2, Bob buys 40, Alice cancels and receives exactly 60). Defer the `matchOrders` re-entry test to Phase 5 (it is still a stub) and note it in the Phase 5 row. Run an independent review, log real flaws, re-run the earlier mutants and add new ones, run build, test and fmt, log, commit, merge into `main` with `--no-ff`, push, and create `engine/phase-5`. Also: fix `.gitignore` (stray `]`, restore the `docs/project.pdf` rule) and check the tools.

**Tool check:** `slither --version` 0.11.6. `solc-select versions` 0.8.24. `node` and `npm` were not found in Git Bash or PowerShell, and Node was not installed.

**What the AI produced:**
- `test_cancel_briefJourneyAliceSells100BobBuys40AliceGets60Back`: every balance is exact at each step, and the book holds 100, then 60, then 0.
- The Phase 5 row in ENGINE_PHASES.md now includes the deferred `matchOrders` re-entry test.
- A commit fixing `.gitignore` on its own.

**Independent review (fresh subagent, read-only, no session context):** It found no High or Medium issue and no code bug. It found three Low test gaps:

| Finding | Outcome |
|---|---|
| L1: the `cancelOrder` status check is masked by `_unlink`'s guard, so deleting it survives | `test_cancel_statusCheckRejectsLinkedTerminalOrder` writes Filled or Cancelled onto a linked order through the harness. The Phase 6a row was updated |
| L2: no minimum-size cancel (1 lot at 1 tick escrows 1 wei of quote) | `test_cancel_minimumSizeBuyRefundsOneWei`, `test_cancel_minimumSizeSellRefundsOneLot` |
| L3: no fuzz test of cancel | `testFuzz_cancel_partialFillThenCancelRefundsExactRemainder` (1,000 runs) checks against the reference cost `fill * price / PRICE_SCALE` |

The Info notes were not acted on: an equivalent mutant (I1), `_unlink`'s guard as defence in depth (I2), reentrancy tests to recheck when the stubs are replaced in Phases 5 and 6 (I3), PendingTrigger deferred to Phase 6a (I4), and redeploying the factory and re-exporting the ABI after the merge (I5).

None of these is a bug in AI-written engine code, so no issue file was added.

**Mutants** (one at a time on `OrderBook.sol`, fuzz tests excluded, source restored after each run):
- Before the new tests: 13 caught, 4 survived. C1 (status check removed), R1 and R2 (refunds skipped at 1 wei and at one lot), and R3 (status check weakened) survived. R4 survived too.
- After the new tests: 16 of 17 caught. The re-run earlier mutants were G (guard removed, 16 tests failed), Z (issue 005), S1, and C1 to C6. The new ones were N1 to N4 and R1 to R4.
- R4 survives as an equivalent mutant. It recomputes the buy refund as `(amount - filled) * price / PRICE_SCALE`. Lot and tick sizes make that exactly equal to `lockedQuote`, so no test can tell them apart.

**Results:** `forge build --sizes`: OrderBook 6,812 B runtime and 7,475 B initcode. MarketFactory 8,859 B runtime and 8,888 B initcode. Both have room under EIP-170 and EIP-3860. `forge test`: 238 passed, 0 failed, 0 skipped (15 suites). `forge fmt --check`: clean.

**What the AI got wrong:** In the first version of the L1 test, `forged = original` aliased the memory struct, so the "restore" wrote the forged status back, and `assertBookSorted` failed with "order in the book is not live". It was fixed by reading a separate copy. This was a test-code mistake, not an engine bug.

**Human decisions:** The `matchOrders` re-entry test moves to Phase 5. `docs/Development_Project.pdf` stays tracked (the repo is private).

**Follow-up for Person 2:** OrderBook bytecode changed in Phase 4, so the deployed MarketFactory still creates markets with the stub `cancelOrder`. Redeploy, re-export the ABI, and add UI messages for `NotOrderOwner` and `OrderNotActive`.

---

## 2026-11-07: Phase 5, batch matching (`matchOrders`)

**Prompt (summary):** Copy the mutant script into the repo with a note on how to run it. Implement `matchOrders(maxMatches)`:
- `InvalidMaxCount` for 0 and for anything above the cap
- fill the two heads through the same `_settleFill`
- the head with the lower `bookSeq` is the maker
- unlink both orders when filled
- return the number of fills; anyone may call it

Tests: clearing over several calls, the cap respected exactly, at least 4 traders on each side in one call, the maker following `bookSeq`, a no-op, `InvalidMaxCount` at both edges, a third-party caller, and the deferred re-entry tests. Add a SPEC section on who triggers execution. Then the standard finish. Mid-session the human added: run only the new phase's mutants plus a smoke set from now on, and the full set once, in Phase 8.

**What the AI produced:**
- **`src/OrderBook.sol`:**
  - `matchOrders` is implemented.
  - `_settleFill` gained a `takerInBook` flag. `matchOrders` passes true, so a filled taker that is already in the book is unlinked before that fill's transfers (CEI per fill). Placement passes false.
  - There is no second settlement path.
  - The return variable is named `matchesDone`, matching the interface.
- **`test/OrderBook.Batch.t.sol`:** 31 tests in 3 contracts, built on crossed books that come from a capped placement, the only way a book becomes crossed:
  - the multi-party test settles 4 buyers and 4 sellers in one `matchOrders` call, with every balance exact
  - maker selection by `bookSeq`, including a harness swap that proves the order ID is not used
  - unlink cases
  - two fuzz tests: ask makers, and bid makers at random prices
  - a payout view-spy test
  - re-entry tests during the base payout, quote payout and refund, and `matchOrders` re-entered during a placement refund (deferred from Phase 4)
  - swallow-mode tests
- **SPEC.md:**
  - the `matchOrders` details
  - section 6 expanded into a who, how and how-often table, with design points (bounded work, a permissionless and harmless caller, no caller reward, multi-party batching)
  - the gas figure for `matchOrders(10)`
  - a section 8 limitation: no caller reward
- **ENGINE_PHASES.md:** the 6b row notes that activated stops must pass `takerInBook = false`.
- **`docs/ai-audit/test-evidence/mutants.sh` and `MUTANTS.md`:**
  - mutants now match on code text, not line numbers
  - a filter argument picks which mutants run
  - mutants whose pattern no longer matches report NOT APPLIED

**What the AI got wrong (in its own test code, not the engine):**
- One re-entry test asserted the token's `fired` flag after the outer call reverted. The revert rolls that flag back too, so the assertion could never hold. It was replaced by a swallow-mode twin that pins where the call fires.
- A NatSpec comment on the bid-maker fuzz test said "spans several bids per fill". The real behaviour is one bid per fill, across several calls. Corrected.
- The first mutant run of the full set took more than 10 minutes and outlasted the tool's foreground timeout. The human then limited each phase to its own mutants plus a smoke set.

**Independent review (fresh subagent, read-only, no session context):** It found no High issue and no code bug. It did reason through and confirm several properties: the refund cannot underflow when the bid is the maker, placement is not affected by the flag, linked-list integrity holds when both orders fill, and CEI holds.

| Finding | Outcome |
|---|---|
| M1 (test gap): the `askId == 0` break was never exercised with bids only, so dropping it would go unnoticed (it would make `matchOrders` revert on a book with only bids) | `test_batch_noOpWhenOnlyBids`, `test_batch_stopsWhenAsksRunOutWithBidsLeft`, and mutants P5o and P5p (both caught) |
| L1: bid-maker coverage was thin | `testFuzz_batch_bidMakersClearAtTheirOwnPrices` (1,000 runs) |
| L2: no self-trade test through `matchOrders` | `test_batch_selfTradeAcrossTheCrossingNetsToZero` |
| L3: the gas figure was not a worst case | The SPEC O2 text now says it is a typical case, warm storage, not a worst case |
| Info: the return named `fills` differed from the interface's `matchesDone` in the compiled ABI | Renamed to `matchesDone` |
| Info: Phase 6 activated stops must pass `takerInBook = false` | Added to the 6b row |

None of these is a bug in the engine code, so no issue file was added.

**Mutants:**
- After the implementation, the full set of 31: 30 caught, R4 survived (equivalent).
- After the review fixes, `^(P5|G |Z |S1)`, 20 mutants: 19 caught. P5q survives as an equivalent mutant (an empty bid side reads as price 0, which never crosses). This run took 8 minutes.
- P5o and P5p were added together with their tests, so no run shows them surviving beforehand.
- After each run, `git diff contracts/src` showed only the Phase 5 change.

**Results:** `forge build --sizes`: OrderBook runtime 7,239 B (+427) and initcode 7,902 B. MarketFactory runtime 9,286 B and initcode 9,315 B. Both are within EIP-170 and EIP-3860. `forge test`: 269 passed, 0 failed, 0 skipped (18 suites). `forge fmt --check`: clean. `matchOrders(10)` with 10 fills and refunds used 765,646 gas.

**Human decisions:**
- Mutant scope per phase: the new phase's mutants plus the smoke set (G, Z, S1). The full set runs once, in Phase 8.

**Follow-up for Person 2:**
- `matchOrders` is live, and the return name in the ABI is `matchesDone`.
- The deployed factory embeds the old bytecode, so redeploy and re-export the ABI.
- Map `InvalidMaxCount` to a message.
- The "not available yet" text in `order-result.tsx` is out of date.

---

## 2026-11-07: Stage 3, size check, factory integration and handoff part 1 (before stop-limit)

**Prompt (summary):**
1. Sync with `origin/main`.
2. Report sizes against EIP-170 and EIP-3860, and estimate what stop-limit adds.
3. Write `test/Integration.Factory.t.sol`: TokenFactory, then MarketFactory, then the brief's journey with cancel, a multi-party `matchOrders`, and duplicate or reversed listing refused.
4. Deploy with Person 2's script on a scratch Anvil (port 8546 only), run the same journey with `cast`, then stop that Anvil.
5. Do not edit Person 2's files.
6. Write `docs/ENGINE_HANDOFF.md` part 1.
7. Test, log, commit, merge, push.

**Sync:** There was nothing new on `origin/main` since `dab79f8` except this project's own Phase 5 merge. `origin/faheem` has 0 commits that are not on `main`, so nothing needed merging and there were no conflicts.

**Sizes** (`forge build --sizes`; limits are 24,576 B runtime and 49,152 B initcode):

| Contract | Runtime | Initcode | Runtime margin | Initcode margin |
|---|---|---|---|---|
| OrderBook | 7,239 | 7,902 | 17,337 | 41,250 |
| MarketFactory | 9,286 | 9,315 | 15,290 | 39,837 |

MarketFactory's runtime is about OrderBook's initcode plus 1.4 KB, because it embeds the creation code.

The stop-limit estimate is extrapolated, not measured. Phase 5's `matchOrders` added 427 B. Stop-limit adds stop placement with its own sorted lists, a bounded scan or insert, trigger with a shared budget, and PendingTrigger cancel. That is roughly 1.5 to 3 KB of runtime, so OrderBook would reach about 9 to 10.5 KB, and MarketFactory about 11 to 12.5 KB. That is about half the limit, so no optimizer change or deployer split is needed. Re-measure after Phase 6.

**Integration test:** `test/Integration.Factory.t.sol` has 5 tests, all passing:
- the stack wiring
- the journey with exact balances and the `OrderCancelled(1, alice, 60e18, 0)` event
- a non-owner cancel and a second cancel both refused
- 4 buyers and 4 sellers settled by one keeper `matchOrders`
- the same pair and the reversed pair refused with `MarketExists(book)`

It uses real DemoTokens and exact per-order approvals, as the wallet flow does.

**Scratch Anvil:**
- `anvil --port 8546`. Before starting, nothing was listening on ports 8540 to 8549, and no repo `broadcast/` or `cache/` deploy record existed.
- Deployed with `forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8546 --broadcast --unlocked --sender 0xf39F...2266`. `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` were redirected to the session scratchpad, following Person 2's P2-005 procedure. Afterwards the repo's `broadcast/` and `cache/` were confirmed absent.
- Result: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. TokenFactory `0x5FbD...0aa3`, MarketFactory `0xe7f1...0512`, NTU `0xa16E...d2be`, SGDx `0xB7A5...d968`, market `0xCafa...052c`. These are the same as DEPLOYMENT.md's fresh-chain table.
- Real `cast` results:

| Step | Status | Gas | Trades | Tx |
|---|---|---|---|---|
| Alice approve 100 NTU | 1 | 46,379 | 0 | `0xc88fb0be...27d2` |
| Alice placeLimitOrder Sell 100@2 | 1 | 303,333 | 0 | `0x3b90fe49...43c4` |
| Bob approve 80 SGDx (`requiredQuote`) | 1 | 46,379 | 0 | `0x30157e6c...b134` |
| Bob placeLimitOrder Buy 40@2 | 1 | 369,761 | 1 | `0x3c7d194a...6383` |
| Bob cancelOrder(1) | reverted `0xf6412b5a` = `NotOrderOwner` | | | |
| Alice cancelOrder(1) | 1 | 57,066 | 0 | `0xdee96980...19d7` |
| Alice cancelOrder(1) again | reverted `0x1d4ecc5b` = `OrderNotActive` | | | |
| Bob placeLimitOrder Buy 11@3 (after 22 asks of 1@2 from Alice and Carol) | 1 | 890,909 | 10 | `0x9c84d046...3bde` |
| Account 0 placeLimitOrder Buy 11@2.5 | 1 | 915,545 | 10 | `0x29630ce8...32fe` |
| Keeper matchOrders(0) and matchOrders(11) | reverted `0xac38930b` = `InvalidMaxCount` | | | |
| Keeper (account 4, no tokens) matchOrders(10); simulated return 2 | 1 | 223,001 | 2 | `0xeccfe90d...51a8` |

- Every balance check passed:
  - After the journey: Alice 9,960 NTU and 10,080 SGDx; Bob 10,040 NTU and 9,920 SGDx; the market held 0 and 0. The cancel refunded exactly 60 NTU.
  - After the batch: Alice 9,949 NTU and 10,102 SGDx; Carol 9,989 NTU and 10,022 SGDx; Bob 10,051 NTU and 9,898 SGDx; the keeper 0 and 0; the market 0 and 0. Orders 23 to 26 were Filled.
  - A further `matchOrders(1)` simulated as 0.
- The Anvil was then stopped: port 8546 refuses connections, and no anvil process remains.

**Handoff:** `docs/ENGINE_HANDOFF.md` part 1 covers:
- signatures, events and errors, with when each fires
- the cancel and batch call flows, with the verified sequences
- error text to add for `NotOrderOwner`, `OrderNotActive` and `InvalidMaxCount`
- the stale frontend files
- the exact re-run steps (fresh Anvil, deploy, the exporter with `--check` and its tests)
- a placeholder for part 2

**Person 2's files:** none were edited. The handoff records:
- `docs/DEPLOYMENT.md`'s stale size figures and "four unnamed functions" note
- stale comments and UI text in `my-orders.tsx`, `order-result.tsx`, `order-plan.ts` and the tests
- the missing error text

Their frontend tests' assertions about the placement cap stay correct.

**Not done:** The ABI export was not run, because Node is not installed on this machine. The handoff gives Person 2 the command.

**What the AI got wrong:** In the first draft of the cast script, the refund check computed a balance difference in bash arithmetic, which overflows above about 9.2e18. It was caught on review before running, and replaced with a whole-token difference. The first scratch-deploy command also returned exit code 2, but only because the follow-up `ls` confirmed that the repo's `broadcast/` directory did not exist, which was the intended outcome.

**Results:** `forge test`: 274 passed, 0 failed, 0 skipped (19 suites). `forge fmt --check`: clean.

---

## 2026-11-07: Node setup, then Phases 6a and 6b, stop-limit

**Prompt (summary):**
- **Step 0:** install Node LTS with winget. Run `npm ci` and Person 2's frontend tests for a baseline, without editing `web/`.
- **Phase 6:** implement `placeStopLimitOrder`, PendingTrigger cancel, and `triggerStopOrders` with one shared fill budget. Use the simplest correct design, with sorted lists only if they stay simple. Write the listed tests, a factory integration test, a cast flow on a scratch Anvil, and the SPEC section 8 manipulation note. Then the standard finish (P6 mutants plus the smoke set), sizes, handoff part 2, and a re-run of Person 2's tests after the merge.
- **ABI:** regenerate `abis.ts` only if the export works without a deployment.

**Step 0:**
- winget installed Node.js LTS 26.13.0. The installer asked for administrator rights, and the human approved.
- `/c/Program Files/nodejs/node --version` gives v26.13.0, and npm gives 11.20.0. This shell needs `export PATH="/c/Program Files/nodejs:$PATH"` until Git Bash is restarted.
- `npm ci` in `web/` succeeded. npm 11 skipped install scripts for optional native packages such as `utf-8-validate`.
- Baseline:
  - `npm test`: 33 files passed and 3 skipped; 410 tests passed and 48 skipped (gated real-chain suites). This matches Person 2's record.
  - `node --test contracts/script/export-web.test.mjs`: 21 passed.

**Design decision (AI, stated to the human):**
- An unsorted list scanned up to `maxCount` would be incorrect. With more than `maxCount` ineligible stops ahead of an eligible one, that stop could never be reached.
- Instead, sorted stop lists (SPEC's design) reuse the book's `_insert` and `_unlink`. The order's status selects the list through `_heads`, the stops share the `_bookNext` and `_bookPrev` links, and `_ranksAhead` has a stop branch. Ties go in placement order.
- `placeLimitOrder` was refactored into `_validate`, `_record` and `_pullEscrow`, and `_matchTaker` gained a `maxFills` budget.

**What the AI produced:**
- **`src/OrderBook.sol`:** `placeStopLimitOrder`, `triggerStopOrders`, PendingTrigger cancel, `_eligibleStop` (buy side first), and later `_tryInsert` and `_closeAndRefund` (issue 006).
- **Tests:**
  - `OrderBookBase.assertBookSorted` now walks both stop lists and checks membership for every status.
  - The harness gained `stopHead`.
  - `test/OrderBook.Stop.t.sol` has 41 tests: 38 in the main suite, including a fuzz test and 2 gas tests, plus 3 reentrancy tests.
  - `Integration.Factory.t.sol` gained a stop-limit flow on the factory market.
- **SPEC.md:** placement and trigger details, the lifecycle row, the section 2 rows, and the gas figures. Section 8 now covers `lastTradePrice` manipulation, budget sniping, stop-list griefing, and the issue 006 history and trade-off.
- **Handoff:** `docs/ENGINE_HANDOFF.md` part 2.
- **Mutants:** P6a to P6y added, and C1, C2, R3 and P6n updated for the new code.

**Independent review (fresh subagent, read-only):**
- No fund-loss bug. The reviewer reasoned through and confirmed that the shared-link design, the budget accounting, CEI and reentrancy are correct, and that the refactor did not change `placeLimitOrder` behaviour.

| Finding | Outcome |
|---|---|
| **H1:** a self-owned lowest-trigger buy stop plus 101 dust bids (102 wei) made activation revert with `BookTooDeep`, so every `triggerStopOrders` call reverted, permanently, on both sides | **Real design flaw in AI-written code.** The human chose option (a), auto-cancel and refund. Fixed with `_tryInsert` and `_closeAndRefund`, and logged as issue 006 with real before and after output (3 FAIL `BookTooDeep()`, then 3 PASS) |
| M1: running out of fill budget lets an attacker snipe an activated stop at its limit price | Documented in SPEC section 8, with the possible mitigations listed. No code change |
| M2: no test pinned the activation-depth behaviour | Covered by the three issue 006 tests |
| L1: a mutant reporting the trigger price in `StopOrderTriggered` survived | `test_trigger_eventCarriesLastTradePriceNotTriggerPrice`, plus mutant P6v |
| L2: an ineligible buy head hiding a sell head was caught only by the fuzz test | `test_trigger_ineligibleBuyHeadDoesNotHideEligibleSellStop`, plus mutant P6w |
| L3: the fuzz test's final check was weak | It now asserts that no eligible head is left and that one more trigger returns 0 |
| L4: no gas figure | Two gas tests: 1,998,765 gas for 10 deep inserts, 1,482,995 for 10 fills with refunds. Added to SPEC O2 |
| L5: no test of a partly filled activated buy stop's remainder escrow | `test_trigger_activatedBuyStopPartFillKeepsExactRemainderEscrow` |
| Info: stale NatSpec, SPEC section 2 rows, the "strict CEI" wording, and stop-list placement griefing | All fixed or documented |

**What the AI got wrong:**
- **Issue 006 (H1).** The AI had seen the deep-book revert, but called it an accident and underrated it. The review raised it to High.
- **Test code:**
  - The first extended `assertBookSorted` asserted that every listed ID is below `nextOrderId`, which broke 20 Book tests that write orders through the harness. The check was narrowed.
  - A duplicate `last` variable in the fuzz test was a compile error.
  - A redundant line in the integration test was removed.
  - None of these was an engine bug.
- **Process:**
  - The scratch Anvil was started in the same command as the port check, so its freshness (chain 31337, block 0) was confirmed only afterwards.
  - One combined shell command failed to parse and ran nothing. It was redone in parts.

**Mutants:** `^(P6|G |Z |S1)`, 28 mutants: **28 caught, 0 survived**, in 13 min 54 s. Afterwards the source had the fix line, and the full suite passed on it (317 passed).

**Scratch Anvil:**
- `anvil --port 8546` was fresh: chain 31337, block 0.
- `Deploy.s.sol` ran with the broadcast and cache redirected, and the repo's `broadcast/` and `cache/` stayed absent. The addresses were the usual ones.
- The cast stop-limit flow passed every check:
  - simulated trigger before any trade: 0
  - stop placed: `StopOrderPlaced`, status 4, `getBestAsk` (0, 0)
  - trigger at 2: 0 triggered (37,277 gas)
  - the price falls to 1.8, then the keeper's trigger made 1 triggered and 1 trade (182,193 gas, tx `0xd47c0da1...df508`); Alice +17.5 SGDx; last price 1.75
  - `NotOrderOwner` on Bob's cancel of Carol's stop; Carol's cancel refunded 2.5 SGDx in full (54,904 gas)
  - final balances exact; the market and the keeper hold 0
- The Anvil was then stopped: the port refuses connections and no anvil process remains.

**Sizes:** OrderBook 8,461 B runtime (+1,222) and 9,124 B initcode. MarketFactory 10,508 B runtime and 10,537 B initcode, with 14,068 B left under 24,576. That is below the 1.5 to 3 KB estimate made in Stage 3.

**ABI export:** not run. `export-web.mjs` has no ABI-only mode: it needs a complete broadcast file and a live chain whose bytecode matches `contracts/out`, and it writes `abis.ts` and `deployments.ts` together. Under the human's rule ("if it needs a deployment, don't run it"), the command is left for Person 2 in the handoff.

**Results before commit:** `forge test`: 317 passed, 0 failed (21 suites). `forge fmt --check`: clean.

---

## 2026-11-07: ABI regeneration on a scratch chain

**Prompt (summary):** Regenerate `web/lib/contracts/abis.ts` with Person 2's exporter on a scratch chain, without touching the local chain or its broadcast record. Confirm `deployments.ts` is byte-identical, copy only `abis.ts`, run `--check` and Person 2's tests, update the handoff, commit on main, and stop the Anvil.

**What the AI did:**
- Confirmed ports 8540 to 8549 were free, in a step of its own before starting Anvil. Started `anvil --port 8546` and confirmed chain 31337 at block 0.
- Deployed with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` redirected. The repo's `broadcast/` was confirmed absent afterwards.
- Ran `export-web.mjs --rpc-url http://127.0.0.1:8546 --broadcast-file <scratch> --out <scratch>/export`.
- `deployments.ts` was byte-identical to `git show HEAD:web/lib/contracts/deployments.ts`. The `abis.ts` diff is 20 lines, which are 10 parameter and return names on `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders`.
- Copied only `abis.ts`.
- `--check` on LF copies printed `up to date` (exit 0). The control, the old `abis.ts`, printed `out of date: abis.ts` (exit 1).
- `npm test`: 410 passed and 48 skipped. `npx tsc --noEmit`: exit 0. Exporter tests: 21 passed.
- Stopped the Anvil: the port refuses connections and no process remains.

**What the AI got wrong:**
- The first `cmp` compared against the CRLF working copies, which reported a false difference at byte 90 of both files. It was redone against the committed blobs.
- `--check` against `web/lib/contracts/` failed on `deployments.ts` for the same CRLF reason. This is a real Windows-only quirk of the check (`core.autocrlf=true`, a byte comparison, and no `.gitattributes` rule for `*.ts`). It is recorded in the handoff for Person 2, and their files were not changed.
- The AI first said 11 names differed, and corrected that to 10.
