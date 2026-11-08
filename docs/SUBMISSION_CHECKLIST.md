# Submission checklist (SC4053 DEX)

State on 8 Nov 2026: branch `faheem` at `30daadd` contains `main` (the `engine-final` tag, `fd8869a`, and the documentation wrap-up). The brief is [`docs/Development_Project.pdf`](Development_Project.pdf).

**What the brief requires** (sections 2, 4, 6 and 7 of the brief): the code; an accompanying **AI Audit Report** with the eight sections of its section 2.1; a **four-part breakdown** (section 2.2) for every major issue; and **peer evaluation**, which is mandatory and confidential. The brief states no deadline, submission format, video or repository-visibility rule. Those must be confirmed on NTULearn (section 5 below).

Test numbers below are recorded results from earlier runs, not new executions.

## 1. Implemented and verified

| Req. | Requirement (brief) | Status | Evidence |
|---|---|---|---|
| M1 | Asset issuer: new ERC20 tokens | Done | `TokenFactory.sol`, `DemoToken.sol`; `test-evidence/person2/p2-1-issuance.md` |
| M2 | Token listing | Done | `MarketFactory.sol`; `MarketFactory*.t.sol`; `Integration.Factory.t.sol` |
| M3 | Buy and sell limit orders | Done (engine and UI) | `OrderBook.placeLimitOrder`; Trade page; `OrderBook.Place.t.sol` |
| M4 | Automatic execution of matched orders | Done | `_matchTaker`, `_settleFill`; `OrderBook.Match.t.sol`; invariant suite |
| M5 | Partial fulfilment | Done | A5 refunds; partial-fill tests; demo step 1 |
| M6 | Self-custody, non-custodial | Done | No admin; `ENGINE_SECURITY_SUMMARY.md`; ledger and conservation invariants |
| M7 | Simple front end | Done | `web/`; unit, real-chain and mock-wallet browser suites; `docs/FRONTEND.md` |
| B1 | Bonus 1: cancel unfilled amounts | Engine and UI done | `cancelOrder`; `OrderBook.Cancel.t.sol` (52); My Orders Cancel action; MetaMask happy path run by the owner (`TESTING.md` Test 12) |
| B2 | Bonus 2: batched multi-party matching | Engine and UI done | `matchOrders`; Match Orders panel; four-trader scenario with a token-less keeper; MetaMask happy path run by the owner on a scratch chain (`TESTING.md` Test 13) |
| B3 | Bonus 3: conditional orders | Engine and UI done | `placeStopLimitOrder`, `triggerStopOrders`; Stop-Limit mode, pending stops, Trigger Stops panel; MetaMask happy path run by the owner on a scratch chain (`TESTING.md` Test 14); the cancelled-stop label defect it exposed was fixed in P2-8C (issue P2-017) |
| T1 | Tricky point: who triggers execution, and how often | Answered | `SPEC.md` section 6 |
| T2 | Tricky point: priority of older orders | Answered | `SPEC.md` sections 2 and 7 (O1, `bookSeq`) |

**Recorded test results (latest):** 335 Foundry tests (engine and Person 2 contracts, from the 8 Nov engine verification; no Solidity changed since); 604 front-end unit tests passed and 76 gated real-chain tests skipped in the standard run; 76 real-chain tests passed; 125 mock-wallet browser tests passed (13, 14, 14, 9, 11, 13, 15, 17 and 19 across nine suites); 21 exporter tests passed (P2-8C, 8 Nov). Earlier baselines, labelled as such elsewhere: 410 unit and 48 gated tests on the fresh-clone check of 8 Nov (`test-evidence/wrapup/fresh-clone-check.md`), 576 and 75 after Bonus 3, 106 browser tests after Bonus 3.

## 2. Completed documentation and evidence

| Item | Status | Where |
|---|---|---|
| D1 AI Audit Report, eight sections, ten figures | Complete, in its final-review version | `docs/report/AI_AUDIT_REPORT.md` |
| D2 Four-part breakdown per major issue | 24 issue files: 7 engine (001 to 007) and 17 Person 2 (P2-001 to P2-017) | `docs/ai-audit/issues/` |
| D3 Validation evidence | Engine (phases 7 and 8, mutants, wrap-up verification) and Person 2 (per-phase evidence) | `docs/ai-audit/test-evidence/` |
| Prompt logs | Person 1 and Person 2, separate files | `docs/ai-audit/prompt-log.md`, `prompt-log-person2.md` |
| Tools and models per phase | Written | `docs/ai-audit/tooling-and-methodology.md` |
| User and test documentation | README Quick Start, Beginner's Guide, deployment, testing and front-end guides | `README.md`, `docs/BEGINNERS_GUIDE.md`, `DEPLOYMENT.md`, `TESTING.md`, `FRONTEND.md` |
| Demo video package | Runbook, word-for-word script and a cue sheet for the two-call recording (a silent screen capture of about 7:30, never over 9:00, then a voice-over; under the 10-minute limit; every brief requirement and all three bonuses shown live); the on-chain sequence of Segments 3 to 6 was rehearsed with `cast` on a fresh scratch chain (8 Nov) and every expected value matched; README section "Reproduce the demo". **Video not recorded; the MetaMask rehearsal is not done** | `docs/VIDEO_PLAN.md`, `docs/VIDEO_SCRIPT.md`, `docs/VIDEO_CUE_SHEET.md` |

## 3. Remaining human activities

- [ ] **Read the final report as a team.** Both teammates should read `docs/report/AI_AUDIT_REPORT.md` once, in particular the sections they did not write, and confirm that it says what happened. Three facts only a person can confirm: whether Person 2 used a chat assistant (none is recorded), whether Person 2 approved Person 1 regenerating `web/lib/contracts/abis.ts` (`e375ff6`; the approval is not recorded), and that Person 1's account of the claude.ai chat (not in the repository) is accurate.
- [ ] **Peer evaluation** (mandatory and confidential; brief sections 4 and 7). Each student submits their own, separately.
- [ ] **Record the demo video** (required: at most 10 minutes and 300 MB, `GroupName.mp4`, architecture first, then a hands-on demo of the local deployment). The runbook is `docs/VIDEO_PLAN.md`, the spoken text is `docs/VIDEO_SCRIPT.md`, and `docs/VIDEO_CUE_SHEET.md` has the two calls step by step (Part A: Person 2's silent screen capture; Part B: the voice-over by both). Recording deliverables, none of them done yet:
  - [ ] the dedicated recording environment built on 8549 / 3103 (`VIDEO_PLAN.md`, section 2), without touching 8545 to 8548 or 3000 to 3102
  - [ ] one timed run of Part A against its checkpoints, and a 1-minute test of the two-call pipeline played back
  - [ ] the clean browser profile with a throwaway MetaMask (Alice, Bob, Keeper) set up
  - [ ] the backup clip: `DEMO_PORT=8550 bash contracts/script/demo-journey.sh` recorded once (`VIDEO_PLAN.md`, section 9)
  - [ ] Call 1: the silent screen capture made and checked (about 7:30, at most 9:00, readable, no key or phrase)
  - [ ] Call 2: the voice-over recorded over it, played back and checked (both voices in time with the picture)
  - [ ] the file saved as `GroupName.mp4`, at most 10 minutes and 300 MB, and the recording environment stopped and `/tmp/sc4053-demo` removed
- [ ] **Agree the shared-file wording**: `CLAUDE.md` still names the brief `docs/project.pdf`, while the file in the repository is `docs/Development_Project.pdf`. `CLAUDE.md` is shared, so neither teammate has edited it.
- [ ] **Decide whether the brief PDF should stay in the public repository** (see section 6).
- [ ] **Submit** (section 7).

## 4. Optional extra manual tests

The cases below were not performed with MetaMask. They are optional unless the team wants to claim them; mock-wallet and real-chain evidence exists for most of them (`TESTING.md`, Section F).
- Rejecting a placement, a cancel, a match and a trigger in MetaMask.
- Switching account while a request is open.
- An RPC outage and a chain reset during a transaction.
- Cancelling a buy order, and the engine's refund of a stop that cannot enter a deep book (real-chain suite only).
- The later steps of `TESTING.md` Tests 5 to 11 that were not reported. (We decided not to add MetaMask screenshots; the demo video shows the MetaMask flow.)

## 5. Confirm on NTULearn (not stated in the brief)

- The submission deadline.
- The submission format: PDF or Markdown report, how the code is handed in, and whether a repository link or a zip is expected.
- How peer evaluation is submitted.

## 6. Known limitations

- **Not proven:** no human security audit (the final audit covered the engine only and was done by AI reviewers); no public testnet or mainnet deployment; a mock wallet is not MetaMask.
- **Accepted engine limitations** (SPEC section 8): `lastTradePrice` can be moved by trading; a limit order can be sandwiched through the fill cap (issue 007); a capped placement can leave the book crossed until someone calls `matchOrders`; nobody is rewarded for calling `matchOrders` or `triggerStopOrders`.
- **Front end:** only the connected account's stops are listed because the engine has no view of other traders' stops; the information tips and badges were checked in Chromium only; no warning for loose limit prices (issue 007) was built.
- **Repository:** the GitHub repository `Nitecry7/SC4053-BlockChain-Project` is **public** (checked with `gh repo view` on 8 Nov). The brief PDF `docs/Development_Project.pdf` is tracked in it, although the README previously described it as git-ignored.

## 7. Final steps to submit

1. **Freeze the content.** Make sure `main` and `faheem` hold the final state. If anything changed since the recorded results, run once more: `cd contracts && forge test` and `cd web && npm test && npm run build`.
2. **Check the report.** `grep -n "to confirm" docs/report/AI_AUDIT_REPORT.md` prints nothing; the Contents, list of figures and links resolve.
3. **Export the report to PDF.** Render `docs/report/AI_AUDIT_REPORT.md` with a Markdown viewer that supports Mermaid (GitHub, or VS Code with a Mermaid preview), print to PDF, and check that the figures and tables appear. Links to repository files work only if the graders get the repository.
4. **Tag the submission:** `git tag submission && git push origin submission`, so the graded state is fixed.
5. **Code hand-over.** The repository is public, so a link may be enough. For a ZIP: GitHub's **Code, Download ZIP** on `main`, or `git archive --format=zip -o sc4053-dex.zip main`. Neither contains `node_modules` or the two Solidity libraries (git submodules); the README's "Downloaded as a ZIP" step installs the same pinned versions. That path was tested on 8 Nov from a `git archive` ZIP: dependencies installed, `forge build`, then 334 of 334 Foundry tests passed (the one slow fuzz test, `testFuzz_coarsePlacementsKeepSolvencyAndBookOrder`, was left out for time; it passed in the full 335-test run the same day), and `npm ci` then `npm test` gave 604 passed, 76 gated skipped.
6. **Upload** the report, the video (if required) and the code on NTULearn, in the required format, before the deadline.
7. **Peer evaluation:** each teammate submits separately.
