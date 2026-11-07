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
