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

---

## 2026-11-07 to 08: Phase 7, the verification suite

**Prompt (summary):**
- an invariant handler with 5 actors and bounded random actions, plus ghost variables
- invariants checked after every call: solvency including pending stops, conservation, order fields, sorted and linked lists, list membership by status, the trade-price rules, and uncrossed after `matchOrders`
- a call summary proving reach
- runs at the default and `deep` profiles
- fuzz tests with exact balances and a differential check of `requiredQuote`
- one regression test per issue 001 to 006, plus the brief's journey
- `DEBUGGING.md` and saved evidence
- stop and notify if a real bug is found
- the standard finish, running only the relevant P7 mutants plus the smoke set

**What the AI produced:**
- **`test/invariant/Handler.sol`:**
  - **Participants:** 5 actors, plus a `duster` (bursts of one-lot makers, so cap hits and crossed books are common) and a `flooder` (101 one-lot bids at 1.7, placed in setUp outside the 1.8 to 2.2 cluster, so a buy stop limited at 1.7 takes the issue 006 path).
  - **Reference model:** an **independent reference model** that records each order from the handler's own inputs and replays every `Trade` and `OrderCancelled` with its own arithmetic (A2 to A7) into a per-address ledger.
  - **Revert policy:** only legitimate reverts are tolerated, and those are verified (a `BookTooDeep` or auto-cancel needs more than `MAX_INSERT_SCAN` orders ranked ahead).
  - **Per-call checks:** return values against events, `Trade` at the maker's price with the reference cost, a placement taker never resting while it still crosses below the cap, and `StopOrderTriggered` carrying the current price.
- **`test/invariant/OrderBookInvariant.t.sol`:**
  - invariants: solvency, conservation, ledger equal to balances, order fields (reference ceiling, status and fill consistency, no links on closed orders), lists, and handler checks
  - `afterInvariant`: `matchOrders` until uncrossed, then re-checks
  - `OrderBookInvariantReachTest`: 600 uniform seeded steps, with every invariant checked every 25 steps, asserting that every path is reached
- **`test/OrderBook.Fuzz.t.sol` (8 tests):**
  - crossing fills, cancels (including a partly filled taker remainder after price improvement), batch, sell and buy stop triggers, all with exact balances
  - `requiredQuote` differential checks: against a ceiling reference, and in 512-bit precision using `mulmod`
- **`test/OrderBook.Regression.t.sol`:** `test_issue001` to `test_issue006`, plus `test_briefJourney_issueListTradePartialCancelBatchStop` on the factory stack.
- **Docs and tooling:**
  - `docs/ai-audit/test-evidence/DEBUGGING.md`
  - `mutants.sh` now takes `MUTANT_FORGE_ARGS` (by default the invariant suite is excluded); N2, N3 and C6 were rewritten for `_closeAndRefund`; P7a to P7h were added.

**Independent review (fresh subagent, read-only, could not run anything):** no engine bug, and no new engine defect. The real weaknesses were in the AI's first version of the suite:

| Finding | Outcome |
|---|---|
| **H1:** the ghost flows were tautological. They summed the same Transfer events that move the balances, so no invariant could see a payment going to the wrong address | Replaced by the independent reference ledger and `invariant_ledgerMatchesBalances`. Mutants P7c, P7d and P7e (wrong recipients) are caught by the invariant suite alone |
| **H2:** the fuzzer rarely reached the hard paths; flood wasted 1/6 of the calls; the reach test used different weights and checked invariants only at the end | Bursts from the duster; a setUp flood outside the cluster; a uniform-weight reach test checking every 25 steps. Last-run summary: cap hits, crossed books and auto-cancels now occur within single fuzzer runs (see the evidence) |
| M1: no invariant checked matching rules | `Trade` at the maker's price, the reference cost, and no resting while crossing below the cap. P7f is caught by the invariant suite alone |
| M2: `BookTooDeep` and auto-cancel were accepted unchecked | Each is now verified; a `BookTooDeep` from `placeStop` is a violation. P7g and P7h are caught |
| **M3: the issue 004(a) regression would have passed on the pre-fix code** | The second taker is now larger than the maker's remainder. Shown failing on the pre-fix line (`ERC20InsufficientBalance`, because the book tries to pay 3 base while holding 2), and passing on the current code |
| M4: fuzz bounds left out key regions | Added a partly filled taker remainder cancel and a buy stop filling across two makers or resting. A bid-maker batch fuzz already exists in `OrderBook.Batch.t.sol` |
| L1 to L5: the misleading scripted tail, orderFields using the engine's own `requiredQuote`, unchecked event amounts, stale mutant patterns, DEBUGGING.md inaccuracies | All fixed |

**What the AI got wrong:**
- **The first suite (H1, H2, M3 above).** It was green, but blind to payout recipients, and one regression test could not fail.
- **Test code:**
  - a stack-too-deep error in two fuzz tests, fixed with a struct and a helper
  - bounds that let escrow exceed funding (`ERC20InsufficientBalance`, a test bug)
  - `MemoryOOG`, then the gas limit, in the long reach test, fixed with external chunks and `vm.pauseGasMetering`
  - two garbage lines in the first regression draft
  - event `.selector` used in `constant` declarations, which does not compile in 0.8.24
- **Process incident:**
  - Stopping the first P7 mutant run killed only the outer shell. The inner `mutants.sh` kept running as an orphan and swapped mutants into `OrderBook.sol` for about 20 minutes.
  - Symptoms: a fuzz failure, "order in the book is not live", and a journey failure, `10 != 2`. The AI found mutant P5j applied, killed the exact orphan PIDs (the exit trap restored the file), and verified that `contracts/src` equals HEAD.
  - The affected suites passed on the clean source. Results collected in that window (the first reworked reach run and a 16-run smoke run) were treated as void and re-collected. No engine change resulted.
  - DEBUGGING.md now explains how to stop a mutant run safely.
- **Wrong status report:** the AI told the human that the deep run had died. A process listing had not shown it, and its file was header-only because the output is buffered. It was in fact alive (Windows `tasklist` showed `forge.exe` using CPU, at about 40 MB of memory), and the AI corrected this before merging. The human's instruction to record it as died, and to start a reduced run, was based on that wrong report. With the human's intent kept, the full deep run continues, and its output will be committed when it ends.

**Real outputs** in `docs/ai-audit/test-evidence/phase7/`:
- **`forge-test-default.txt`:** `forge test` at the default profile gave **334 passed, 0 failed, 0 skipped** (26 suites, 836 s, while the deep run was competing for CPU). All 6 invariants plus `afterInvariant` passed at **256 runs × depth 64 = 16,384 calls, 0 reverts**. Per-selector metrics: burst 2,737, cancel 2,717, matchOrders 2,756, and so on.
- **`mutants-phase7.txt`:** part A, the unit suite, **11/11**. Part B, the invariant suite alone, **15/17**; the S1 and R1 survivors are explained in MUTANTS.md.
- **`forge-test-deep.txt`:** the full `FOUNDRY_PROFILE=deep` run (1,000 × 128), running in an isolated copy of `contracts/` since 23:15. Not complete at merge time; it is committed when it ends.

**Result:** no real engine bug found. Every invariant held, including the independent payout ledger.

---

## 2026-11-08: Phase 8 begins, report section drafts (engine)

**Prompt (summary):** After the Phase 7 merge, keep the deep run going in the background. Draft the engine's AI Audit Report sections in `docs/report/` from the real logs, with work that needs no CPU. Run Slither and coverage only after the deep run finishes.

**What the AI produced:**
- `docs/report/README.md` (an index, the rules, and a merge timeline with commit hashes).
- Drafts for brief sections 2 to 8 (engine side): `2-methodology-engine.md`, `3-spec-and-prompts-engine.md`, `4-architecture-engine.md` (including a Mermaid diagram), `5-issues-engine.md` (issues 001 to 006 ranked, each in four parts), `6-validation-engine.md`, `7-improvements-engine.md` and `8-lessons-engine.md`.
- Person 2's `docs/ai-audit/ai-audit-report-draft.md` was not edited. These files are written to slot into the sections where it says "Needs Person 1".
- Every figure comes from the committed evidence, the issue files, SPEC or git.
- Slither, coverage, the final audit and the deep-run result are marked pending.

**What the AI got wrong:**
- Its first Section 6 draft took the reach-test counts from a run that had been declared void, because it ran during the orphan-mutant window.
- On checking, the clean committed run (`phase7/forge-test-default.txt`) gives identical counts, as the test is deterministic. The draft now cites that file.
- The Phase 6 log entry says `OrderBook.Stop.t.sol` has 41 tests. The committed run shows 42 (39 in `OrderBookStopTest` and 3 in `OrderBookStopReentrancyTest`). The report uses 42.

**Deep run status at commit time:** still running (Windows `forge.exe`, about 40 MB of memory), started 7 Nov 23:15 in an isolated copy of `contracts/`.

---

## 2026-11-08: Phase 8, deep run result, Slither, coverage, final audit, demo, engine-final

**Prompt (summary):**
1. Confirm Phase 7 and `abis.ts` are on main.
2. Draft the report sections with placeholders.
3. Draft the demo script and the README engine section, without test-running the script before the deep run ends.
4. When the deep run ends (or at 02:45, stop it), run Phase 8: Slither, coverage, the final audit and the security summary. Fill in the placeholders, test the demo, tag `engine-final`, and push.

Notify after each step.

**Results:**
- **Confirmed on `origin/main`:** Phase 7 at `5f2e860`, with the default-profile evidence. `abis.ts` is at `e375ff6`. The deep run is the full 1,000 × 128.
- **Deep run: passed.** 128,000 calls with 0 reverts held all invariants, in 7,088 s. Deep fuzz: 20/20, 19 at 10,000 runs and one at its 200-run setting. The commit message of `88cedf7` says "20 fuzz tests at 10,000 runs", which is imprecise; the report and the security summary give the exact figures. The 02:45 timer was cancelled.
- **Slither 0.11.6:** 27 results, 0 real: 13 false positives (uninitialized-state through a storage alias, enum and price equality, timestamp taint from `createdAt`) and 14 accepted (bounded costly-loop, interface naming). See `phase8/slither-triage.md`.
- **Coverage:** `OrderBook.sol` 100% on lines (182/182), statements (246/246), branches (59/59) and functions (25/25), with 332 tests passing under coverage. Gas report and sizes saved.
- **Final independent audit** (fresh subagent, PoCs in a scratch copy): no Critical or High. One Medium (M-1): a dust front-run sandwiches an honest limit order through the fill cap. Three Low documentation findings (L-1 to L-3), fixed in SPEC. Info notes (I-1, I-2) went to the handoff.
- **Human decision on M-1: document it.** It is in SPEC section 8, logged as **issue 007** (accepted, four-part format), and reproduced in the repo by `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit`. The test pins the auditor's figures to the wei: Carol pays 20e18 − 5.01e9 instead of 15e18, and the attacker makes 5e18 − 5.01e9.
- **Demo:** `contracts/script/demo-journey.sh` passed every check on its first run (52 s). It ran on a private Anvil, which it stopped afterwards, and `contracts/broadcast/` was not written.
- **Docs:** `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md` (threat model, defences with evidence, audit results, limitations). Every report placeholder in `docs/report/` is filled. Notes for the frontend and the factory are in the handoff.

**What the AI got wrong:**
- **It told the human the deep run had died** (see the Phase 7 entry), and corrected this before merging.
- **The `88cedf7` message overstates the fuzz runs.**
- **M-1 was missed by every earlier review and by the AI's own SPEC writing,** because the two limitations were analysed separately (issue 007, part 1).
- **Two SPEC rows went stale after the issue 006 fix** (insertion, and dust wording). The final audit caught them.

---

## 2026-11-08: Final wrap-up (report, video plan, fresh-clone check, submission checklist)

**Prompt (summary):** Pull first. Never overwrite or delete Person 2's files. Then:
1. Assemble the full AI Audit Report: all 8 sections in the brief's order, every issue in four parts, Person 2's parts from their logs and marked "[P2 to confirm]", Section 1 marked for both, an executive summary, contents, an evidence index and requirements traceability. Then a consistency pass, and Mermaid that renders.
2. The video plan.
3. A fresh-clone check following the README, fixing only the engine sections.
4. The submission checklist.

Commit and notify after each step.

**What the AI did:**
- **Pull:** nothing new from Person 2 (`main` = `origin/main`; `faheem` has nothing unmerged). Worked on `docs/wrapup`, merging into `main` after each step: `6d216a7`, `a220ee2`, `dcc86e2`, then this commit.
- **Step 1:** `docs/report/AI_AUDIT_REPORT.md`:
  - 22 issues: engine 001 to 007 in four parts; P2-001 to P2-015 in a four-part table adapted from Person 2's draft.
  - Traceability (M1 to M7, B1 to B3, T1 and T2, D1 to D5) and an evidence index.
  - **Built on, not replacing:** Person 2's `ai-audit-report-draft.md` was not edited.
  - **Also:** `forge lint` on `OrderBook.sol` triaged (Person 2's I-4: 6 warnings, 0 real); the SPEC brief reference fixed (I-1); `CLAUDE.md` left for both, because it is shared.
- **Step 2:** `docs/VIDEO_PLAN.md`: a 7:30 script with a speaker split, timed shots, setup, the expected numbers on screen, UI and terminal paths for the bonuses, and a `demo-journey.sh` fallback.
- **Step 3:** a fresh clone followed the README end to end on Windows Git Bash:
  - `forge test` **335 passed, 0 failed** (709 s)
  - `npm test` 410 passed, 48 skipped
  - typecheck, lint and build pass
  - deploy and export on 8546; `check-local.sh` "ready"

  The README engine section's timings were fixed and a Windows long-path note added. Six findings for Person 2's sections were recorded in `test-evidence/wrapup/fresh-clone-check.md`, not edited.
- **Step 4:** `docs/SUBMISSION_CHECKLIST.md`.

**What the AI got wrong:**
- **First report draft:**
  - labelled P2-006 to P2-008 "unrated", but Person 2's files do rate them (Medium)
  - called 20 fuzz tests "engine" (they are 15 engine and 5 Person 2)

  Both were caught by checking the files before committing.
- **Old drafts left stale:** its earlier engine drafts kept 334 and 244 without the post-Phase 8 count. Fixed in the consistency pass.
- **Blocked tool:** it tried to download the Mermaid CLI to render the diagrams. The permission classifier blocked running external code, so it did not work around it. It linted the diagram syntax instead: every label quoted, quotes balanced. Rendering is not machine-verified.
- **Orphan processes, again:** stopping the dev server's task left an orphaned `node.exe` listening on port 3999 (the same pattern as the Phase 7 mutant orphan). The AI identified it by its command line as the scratch clone's server and killed only that process tree.
- **Windows path limit:** the README's `git submodule update --init --recursive` failed in the deep scratch path ("Filename too long"). Recorded as an environment finding and worked around with `core.longpaths`, not reported as a README bug.

## 2026-11-08: Report diagrams (publication quality)
**Phase:** wrap-up, report figures. **Branch:** `docs/figures`.

**Prompt (summary):** make the report's diagrams publication-quality, working only in `docs/report/`. There are ten diagrams:
- architecture, lifecycle, the partial-fill sequence, book structure, the stop trigger, the batch match
- AI workflow, a Gantt from git dates, the evidence map, issues by phase

Each must be checked against the source before drawing. Use one colour-blind-safe theme with text labels, kept readable at A4. Render to SVG and a 2x PNG with the Mermaid CLI, open every PNG and fix the layout, embed the figures with captions, update the contents, commit, push, and list the figures.

**What the AI did:**
- **Sources:** `docs/report/diagrams/NN-name.mmd` (01 to 10, numbered in report order), a shared `mermaid-config.json` (Okabe-Ito palette, Arial 16 px), and `render.sh`. Rendered with `@mermaid-js/mermaid-cli@11.4.2` through Edge, because Puppeteer had no bundled Chrome.
- **Facts checked before drawing:**
  - lifecycle transitions against `placeLimitOrder`, `placeStopLimitOrder`, `triggerStopOrders` and `_closeAndRefund`
  - the Figure 5 numbers (22 escrow, re-lock 13.2, refund 0.8)
  - Figure 8 against `test_batch_multiPartySettlesFourBuyersAndFourSellersInOneCall`
  - Gantt dates and merge hashes from `git log`
  - evidence numbers from Sections 5 and 6
- **Every PNG opened and inspected, then fixed and re-rendered:**
  - crossing edges and edges through titles (Figures 3, 4): ELK layout, blank group titles
  - a 3,800 px lifecycle redesigned around a "match" decision
  - overflowing sequence notes (Figures 5, 8)
  - an upside-down ELK workflow: back to dagre
  - Gantt gridlines through labels, plus a white "today" line
  - an evidence map first 3,000 px tall, then 5,600 px wide: four columns
  - an issues chart first 4,800 px wide, then out of phase order: one row per phase
- **Report:** the three inline Mermaid blocks were replaced by Figures 1 to 10. Each figure has a "Figure N" caption and a one-line explanation. A list of figures was added under Contents, plus a new section 2.5 (Timeline). The 4.2 call graph became a bullet list, so no fact was lost.

**What the AI got wrong:**
- **Figure 8 note, first draft:** said the loop ended because the best bid was below the best ask. The test asserts both sides of the book are empty. Caught by reading the test before rendering, and fixed.
- **ELK flipped Figure 1** (the workflow) to bottom-up because of its loop-back edges. The problem was found only by looking at the PNG.
- **Figure 9:** the first two-row layout reordered the phases. The problem was found only by looking.

**What the human did:** set the scope (only `docs/report/`, facts checked against the source), the style rules and the inspection requirement.

## 2026-11-08: Report Sections 1 and 8 replaced with the team's text
**Phase:** wrap-up, report. **Branch:** `docs/sections-1-8`.

**Prompt (summary):** merge the human-written Section 1 (scope) and Section 8 (lessons, Person 1's part plus shared recommendations) into `AI_AUDIT_REPORT.md`, replacing the existing text.
- Keep Person 2's Section 8 material and every [P2 to confirm] marker.
- Check every fact against the repo and report the corrections.
- Keep the contents, the list of figures and the evidence index consistent, and link the figures.
- Pull, commit, merge, push and log the session.

**What the AI did:**
- **Pull:** nothing new.
- **Replacement:** Section 1 replaced, and Section 8 replaced as 8.1 to 8.4. A new 8.5 holds Person 2's earlier Section 8 points with their markers; 37 [P2 to confirm] markers before and after.
- **Figure links:** Figures 3 to 8 in Section 1; Figures 1, 2, 9 and 10 in Section 8.
- **Evidence index:** gained `docs/DEX_Trading_Engine_Plan.md`. The headings were adapted to the report's levels.

**Facts checked against the repo, and the corrections made:**
- **Interface freeze timing.** "Froze the interface before the first line of engine code" was not accurate. The draft was committed on 28 Oct (`cd35f8b`), but the freeze was in `63aee60` (1 Nov, Phase 2a), ten minutes after the Phase 1 skeleton (`7c73490`). The text now says frozen before any escrow, matching or bonus code.
- **Who wrote the specification.** "The coding agent was only given the task after SPEC.md and CONTRACT_INTERFACE.md existed" was not accurate. Claude Code wrote `CLAUDE.md`, `SPEC.md` and the interface draft in its Phase 0 plan-mode session (this log, 28 Oct), and the plan is titled "built with Claude Code". The text now says Claude Code was asked for contract code only after those files existed. The two examples (buy escrow, `hasTradePrice`) are confirmed in the plan.
- **Test count.** "The engine ships with 335 contract tests" is wrong: there are 245 engine tests, and 335 is the project total.
- **Gas figure.** It was corrected by the reviewer, not by the agent itself (1,281,301 to 1,778,221, Phase 3b).
- **Deep run.** It was reported dead while it was still running, not after it completed. It later passed.
- **CEI exception.** The second exception (issue 002) was caught by the independent reviewer, not by the AI itself. The escrow-order conflict (Phase 2b) was flagged by the AI.
- **Fuzz.** 0 of 500 seeds for the original test (reviewer's replay), and 0 of 40 for the AI's first replacement. Both are now stated.
- **Confirmed unchanged:**
  - issue 004 (73 tests; found by review F7)
  - issue 006 (102 wei; the reviewer reproduced it in a scratch copy)
  - mutant C1 (cancel status check)
  - 100% line and branch coverage, and 128,000 invariant calls
  - the deep run of 7,088 s (about two hours)
  - the `88cedf7` commit-message overstatement
  - the aliased memory struct, and the pinned temporary behaviour
  - the out-of-scope list (SPEC section 1)
  - Phase 0 human overrides (lot and tick sizes, the shared budget)

**What the AI got wrong:** its first attempt to write the sections through a shell heredoc failed on quoting, so nothing was written. It switched to writing files directly.

**What the human did:** wrote Sections 1 and 8.1 to 8.4 and set the checking rules.

## 2026-11-08: Report, the claude.ai chat assistant added
**Phase:** wrap-up, report. **Branch:** `docs/chat-assistant`.

**Prompt (summary):** Person 1 used Claude in the claude.ai app, in one long chat from 28 Oct to 8 Nov, as planner and reviewer. Add this accurately in four places:
- **1.6:** the chat stress-tested the brief-based plan and rewrote it as `docs/DEX_Trading_Engine_Plan.md`, before Claude Code was engaged.
- **Section 2:** a two-tier workflow. The chat wrote the phase prompts, reviewed plans and summaries, and proposed corrections; Claude Code implemented and ran the subagent reviews; the human made every decision. Use only facts in this log, attributing logged decisions as "my corrections (drafted with the chat assistant)".
- **Section 3:** the phase prompts were drafted in the chat and refined in Claude Code.
- **Section 8:** a lesson on the two tiers, including the chat's factual errors in the report drafts.

**What the AI did:**
- **1.6:** rewritten as two steps (the chat, then Claude Code).
- **2.2:** a tools row for the chat.
- **2.4:** a tier table, and a table of six corrections, each tied to the log entry that records it as a human decision. The correction entries checked were Phase 0 planning (1) and (2), "Human decision, O1", Phase 2b "Human decisions", the Phase 6 H1 choice and "Human decision on M-1".
- **3.1 and 3.2:** wording updated.
- **8.3:** item 7 added.
- **Executive summary and report rules:** the chat statements are flagged as the owner's account, because there is no committed transcript.

**What the AI got wrong / flagged:** nothing new was invented. The plan file's own title says "built with Claude Code", while the owner says the plan was written in the chat before Claude Code was engaged. The report quotes the title and gives the owner's account; it does not resolve the difference.

**What the human did:** stated the chat's role and dates, and the attribution rule.

## 2026-11-08: Report, the chat assistant marked as minimal use
**Phase:** wrap-up, report. **Branch:** `docs/chat-minimal`.

**Prompt (summary):** the same request as the previous entry, re-sent with one new fact: the claude.ai chat was used "very minimally".

**What the AI did:**
- **Not redone:** the previous merge (`5a81a33`) already carried every requested change, so it was not repeated.
- **"Used minimally" added in five places:** the executive summary, the 1.6 plan bullet, the 2.2 tools row, the 2.4 tier table, and the 2.4 introduction. The introduction now also says that all of the code was written through Claude Code.

**What the human did:** stated that the chat was used very minimally.

## 2026-11-08: Report verification, Phases 0 to 2
**Phase:** wrap-up, verification. **Branch:** `docs/report-verification`.

**Prompt (summary):** the human asked for a phased plan to verify the report, the diagrams and any other logic. The AI proposed seven phases. The human said to start Phases 0 to 2, and while those ran, asked what else could be done.

**What the AI did:**
- **Phase 0:** baseline `e868f2a`, clean tree.
- **Phase 1:** re-ran the Phase 8 commands in sequence: Slither, lint, sizes, coverage, gas and the full `forge test`. Every figure in the report matches:
  - **tests:** 335 passed (245 engine, 90 Person 2)
  - **coverage:** 182/182 and 59/59
  - **gas:** all four maximums
  - **sizes:** OrderBook 8,461 B, MarketFactory 10,508 B
  - **Slither:** 27 results
  - **lint:** 6 warnings
- **Phase 2:** a checker script found 0 broken links or anchors (143), 0 unknown hashes, matching dates, and all 22 issue IDs with files and matching severities. It also exported the 39 teammate markers.
- **Phase 5 leads, done while forge ran:** the two brief PDFs are byte-identical; the 334 and 244 mentions are labelled Phase 7 figures; the key figures agree across documents.
- **Evidence:** `docs/ai-audit/test-evidence/wrapup/report-verification.md` plus `verification/`.

**What the AI got wrong:** in the earlier figures session, Figure 2's Person 2 bar ended on 6 Nov. The verification compared it with `git log` and found that Person 2's commits run to 7 Nov (`dd60588`). The bar and the caption were fixed and the figure re-rendered.

**Open lead:** the gas report's maximum placement (1,808,075) is above `test_gas_worstCasePlacement` (1,778,221), yet a draft calls 1.78M "the worst measured". This goes to Phase 3 or 5.

**What the human did:** chose to start Phases 0 to 2.

## 2026-11-08: Report verification, Phases 3 to 7
**Phase:** wrap-up, verification. **Branch:** `docs/report-verification-2`.

**Prompt (summary):** continue with the remaining verification phases; commit, merge and push as needed. The human then went to sleep and asked for a phone notification when it was done.

**What the AI did:**
- **Phase 3:**
  - **Review:** a fresh, read-only subagent checked about 190 claims and returned 25 problems.
  - **Re-check:** the main session confirmed each against its cited source before editing.
  - **Corrections:** all 25 were corrected in the report. Among them:
    - reviews from Phase 3a, not Phase 1
    - the escrow-order history
    - three options for issue 006, not four
    - an unsupported prompt quotation
    - the cross-boundary edits (README engine section, `demo-journey.sh`, and `abis.ts` authorised by Person 1 only)
    - issue 004 as injected mutants
    - who surfaced the design forks
    - Person 2 details
    - the chat-assistant scope
  - **Elsewhere:** the section drafts were marked superseded, and one line was fixed in `VIDEO_PLAN.md`.
- **Phase 4:**
  - **Code:** Figures 3, 4, 6, 7 and 8 were checked against the code. Figure 5's numbers were proven by a temporary test, then deleted.
  - **Figure 10:** labels fixed (reviews found 5 of 7; the slow fuzz test).
  - **Figure 9:** label fixed (injected bugs).
  - **Legibility:** six figures were narrowed so that every figure prints at 7.3 pt or more on A4, up from about 5 pt.
- **Phase 5:**
  - **Full mutation set:** all 67, which had never been recorded. Result: 65 caught; R4 and P5q survived as documented equivalents. All the rewritten mutants are now caught.
  - **Gas lead:** resolved. The 1.81M placement is `test_gas_worstCasePlacement` on the final code (1.78M at Phase 3b). SPEC O2 now gives both.
- **Phase 6:**
  - **Demo:** `demo-journey.sh` on a scratch Anvil on port 8546: every check passed, and the chain was stopped.
  - **Front end:** `npm test`: 410 passed, 48 skipped.
- **Phase 7:** brief 2.1 and 2.2 compliance confirmed. What remains open: the 40 Person 2 markers, the team evaluation, the plan title, and confirming on NTULearn whether a video is required.
- **Evidence:** `docs/ai-audit/test-evidence/wrapup/report-verification.md` and `verification/`.

**What the AI got wrong:**
- **Its own Figure 10** claimed that the per-phase reviews found all 7 issues.
- **The A4 requirement** set when the figures were first made was not checked numerically then. Four figures would have printed at about 5 to 6 pt.
- **The first Figure 5 check** failed on the test's own wrong balance assumption, not on the figure.
- **Twice, a heredoc append failed on shell quoting.** Nothing was written either time, and the append was redone with the file tools.
- **Phase 3 showed that earlier sessions wrote several unsupported attributions into the report** (listed above). Each one is now corrected against its source.

**What the human did:** asked for the phased plan and for it to be carried out, with commit, merge and push.

## 2026-11-08: Verification of `faheem` and human-judgement wording
**Phase:** wrap-up. **Branch:** `docs/final-verification`, from `origin/faheem` (`4110aa5`).

**Prompt (summary):** the `faheem` branch is the newest; verify it and, if it is sound, open a PR and merge it into `main`. Some report passages read as if AI did more than human judgement; change them where needed. Person 2's D1 status summary was pasted for context.

**What the AI did:**
- **State:** PR #4 had already merged `faheem` up to `5122a0c` into `main` (`f810e40`). The only unmerged commit was `4110aa5` (`VIDEO_PLAN.md`, new `VIDEO_SCRIPT.md`, `SUBMISSION_CHECKLIST.md`).
- **Checks run on `4110aa5`:**
  - no change under `contracts/`, and none to `SPEC.md`, `CLAUDE.md` or `CONTRACT_INTERFACE.md` since `b976591`
  - no Anvil private key in the tree (the 64-hex strings are transaction hashes)
  - `phase2-check.py`: 157 links, 0 findings, 0 markers; the links in the other changed documents resolve (one template path in `TESTING.md` is an instruction, not a link)
  - `npm test`: 604 passed, 76 skipped; `forge test`: 335 passed, 0 failed
- **Wording:** the report now says what the humans decided rather than what the AI did, using only decisions recorded in the two prompt logs:
  - a new Section 2.6 table of 16 human decisions, each tied to its log entry
  - the executive summary, 1.6, the 2.4 tier table (decision-maker first) and 3.2 put the decisions in the first person
  - 7 (issue 001 guard) and 8.1 to 8.2 (review practice, escrow order)
  - the version header now names `main` after PR #4
  - one P1 line in `VIDEO_SCRIPT.md` segment 8 (49 words, from 48; timing table updated)

**What the AI got wrong:** the first draft gave reasons for the 006 and 007 decisions that the log does not record, and attributed F5 and F6 to the human. It removed all three before committing. It also placed Section 2.6 before 2.5 at first and moved it.

**What the human did:** asked for the verification, the wording change and the PR.

## 2026-11-08: Video requirements check and chain rehearsal of the demo
**Phase:** wrap-up. **Branch:** `docs/video-ready`.

**Prompt (summary):** the NTULearn video requirements were given (at most 10 minutes and 300 MB, `GroupName.mp4`, an architecture introduction first, a detailed hands-on demo of the local deployment, a README that lets markers reproduce it). Verify that the script meets them and can be read word for word while recording.

**What the AI did:**
- **UI labels:** every button and label the script names exists in `web/`. One differs only in case ("Still Crossed Afterwards" after P2-8C); the script was fixed.
- **Chain rehearsal:** Segments 3 to 6 were replayed with `cast` and the two helper scripts on a fresh scratch Anvil (port 8546, deployed as in `VIDEO_PLAN.md` Step 2), then the chain was stopped and the helper's 8546 record deleted. Every expected value matched:
  - FIZZ (supply 1,000,000, 18 decimals) and a second market
  - Alice 9,900 then 10,080 SGDx; Bob 10,040 NTU and 9,920 SGDx; order #1 PartiallyFilled, then Cancelled, with Alice at 9,960 NTU and escrow 0
  - the seed: CROSSED, a match would settle 2 fills; the keeper's `matchOrders(10)` filled #23 to #26, the keeper still holds 0 and 0, Alice 9,949 / 10,102, and `verify-after` passed
  - stop #27 PendingTrigger (Alice 9,939 NTU); `move-price 1.8` makes 1 stop eligible; the trigger filled 4 NTU at 1.9; Alice +7.6 SGDx; 6 NTU rest at 1.7; last trade 1.9
- **Fixes:**
  - **Script:** one P1 line said 7.6 SGDx "came back", but it is Alice's sale proceeds. It now says "Alice received", with the same word count.
  - **Script fallbacks:** the `<market>` placeholder is replaced by the deterministic address.
  - **Seed line:** the expected final line is quoted exactly.
  - **Plan, script and checklist:** the requirements are now stated, and the "provisional" notes are replaced.
- **New `docs/VIDEO_CUE_SHEET.md`:** the script's words interleaved step by step with the actions, for reading along.
- **README (Person 2's file, at the human's request, to meet the README requirement):**
  - a new "Reproduce the demo" section
  - the final report and the video documents in the documentation table
  - stale rows fixed: the `BONUS_INTEGRATION` description "Nothing bonus is active" and the superseded draft
  - a cross-mark icon on a built feature
  - an anchor for the engine section

**What the AI got wrong:** the first rehearsal run aborted in the seed scripts because `node` was not on the shell's PATH. It restarted the scratch chain and ran again.

**What the human did:** supplied the requirements and asked for the verification.

## 2026-11-08: Final submission check
**Phase:** wrap-up. **Branch:** `docs/video-ready` (PR #6).

**Prompt (summary):** a final check for wrong statements, errors and unnecessary AI artefacts; make the extensive human effort (planning, detailed prompts over many sessions) clear in the report; make sure the repository can be downloaded as a ZIP and submitted.

**What the AI did:**
- **Artefacts:**
  - no AI mention or signature in any code file (`contracts/`, `web/`, `scripts/`)
  - the plan's title no longer says "built with Claude Code", and report 1.6 no longer quotes it
  - one `FRONTEND.md` row said "not run by Claude"; it now says what the owner ran and what was not run
  - AI tools stay named where the brief requires them: report Section 2, `CLAUDE.md`, `.claude/commands`, and the vendored skill cited in Section 2.2
- **Report:** Section 2.6 became "Human effort and judgement", with its sources:
  - the about 5,000-word plan that existed before Claude Code's first session
  - Person 2's Prompt 00
  - 31 and 23 logged sessions, each scoped by a teammate
  - 35 recorded Person 1 decisions
  - the human checks
  - the executive summary points to it
- **Accuracy:**
  - report link check: 0 findings
  - stale counts in current documents: only labelled historical baselines remain
  - `ENGINE_SECURITY_SUMMARY.md` mutation row now gives the full-set result the video reads aloud
- **ZIP:**
  - **Problem:** a `git archive` ZIP of HEAD has empty `contracts/lib/` (submodules).
  - **Fix:** README "Downloaded as a ZIP" step, `forge install --no-git` at the pinned tags; their commits were checked with `git ls-remote` to equal the pinned submodules.
  - **Tested from an extracted ZIP:** `forge build`; 334 of 334 Foundry tests (the slow fuzz test left out for time); `npm ci`; `npm test` 604 passed, 76 skipped.

**What the AI got wrong:** a first draft of Section 2.6 said every Person 1 log entry records what the human did. Not every entry has that line, so it was narrowed before committing.

**What the human did:** asked for the final check and set its criteria.

## 2026-11-08: Zip test, screenshot clean-up, two-call video workflow
**Phase:** wrap-up. **Branch:** working tree on `main` (not committed).

**Prompt (summary):** (1) run every testing step of the submission ZIP before calling it ready; (2) Person 2 decided not to supply MetaMask screenshots, so remove that requirement everywhere; (3) re-sort the video script and cue sheet for the team's plan: Zoom call 1 is a silent screen capture by Person 2 kept under 9 minutes, and Zoom call 2 is a voice-over by both while the capture plays.

**What the AI did:**
- **ZIP test**, from a fresh unzip of the Downloads ZIP:
  - `unzip`; `forge build`; `forge test` 335 passed, 0 failed; `npm ci`; `npm test` 604 passed, 76 skipped
  - `DEMO_PORT=8550 bash contracts/script/demo-journey.sh`: DEMO COMPLETE
  - `Deploy.s.sol` on scratch 8546: the five app addresses had code
  - `npm run dev` on 3103: all six pages returned 200
  - the sell 100 at 2, buy 40 at 2.2 and cancel journey, sent with `cast` (the expected balances matched)
  - **Not done:** the MetaMask clicks themselves
  - the scratch chain and the app were stopped, and the test folder deleted
- **Screenshots:**
  - removed the 15 "Screenshot to supply" placeholders and the list of 19 files in `TESTING.md` Section D (now "Reference renders")
  - removed the "screenshots still needed" notes in `TESTING.md`, the report (D4 row, 6.1 table, 6.5, 6.7 and 6.9), `PRODUCT.md`, `FRONTEND.md`, `BONUS_INTEGRATION.md`, `BEGINNERS_GUIDE.md` H4 and the checklist
  - where the report said screenshots were missing, it now records the decision: "We chose not to add MetaMask screenshots; the demo video shows the MetaMask flow"
  - historical logs and evidence files are unchanged
- **Video:**
  - **`VIDEO_CUE_SHEET.md` rewritten:**
    - Part A, call 1: Person 2's actions, each with a hold time sized to the line spoken over it, plus checkpoints ending at 8:35, latest 9:00
    - Part B, call 2: every line with its on-screen cue and a blank "At" column
    - checked by script: the lines equal `VIDEO_SCRIPT.md` word for word in all 9 segments
  - **`VIDEO_SCRIPT.md`:** the timing table now gives the call 1 footage plan (8:35) next to the speaking time (about 6 minutes). The handoff cues and fallbacks were changed for silent capture with pause and resume.
  - **`VIDEO_PLAN.md`:** section 5 now covers both calls (muted capture, then the video shared through Zoom and recorded). Also updated: the rehearsal (a 1-minute pipeline test), the checklist and the after-recording steps.
  - **README and checklist:** pointers updated

- **Pacing and coverage check** (the user asked for confirmation before committing):
  - the holds were re-sized from 2.3 to 2.1 words per second plus a two-second breath, and 17 of 17 held lines were checked by script to fit
  - "go slowly" rules were added for Person 2
  - the plan is now 8:58, with no more than 9:30
  - a requirements table maps each feature of the brief (issuance, listing, limit orders, automatic matching with partial fills, Bonuses 1 to 3, architecture first) to its segment
  - the earlier "run long" cut that would have dropped live token issuance was removed

**What the AI got wrong:**
- Its first two-call cue sheet sized the holds at a normal speaking pace, and its first "run long" cut dropped a required feature (ERC20 issuance). The user's request for confirmation led to both fixes.
- It first described the ZIP's testing steps without having run step 1 (`unzip`) or step 5 (the app and the trade). The user asked, and both were then run.
- The `node` PATH line needed in Git Bash was missing from the first instructions.

**What the human did:**
- asked for every step to be run before calling the ZIP ready
- relayed Person 2's decision on screenshots
- designed the two-call recording workflow and the 9-minute safety margin
- required confirmation of the pacing and the rubric coverage before any commit

## 2026-11-08: Short recording sheets
**Phase:** wrap-up.

**Prompt (summary):** the three video files were too much to read while recording. The user asked for one simple voice-over script with clear cues and one step-by-step file of what to open during the 9 minutes.

**What the AI did:**
- added `VIDEO_CALL1_CLICKS.md`: 32 one-line steps under time headings, each with its hold
- added `VIDEO_CALL2_VOICEOVER.md`: each line under its ▶ on-screen cue
- checked by script: the lines equal `VIDEO_SCRIPT.md` word for word, and the holds equal the cue sheet's
- linked both from the cue sheet and the README

**What the human did:** judged the full documents too dense to use live, and asked for the two short sheets.
