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
| Demo plan | Written, not rehearsed on the recording chain | `docs/VIDEO_PLAN.md` |

## 3. Remaining human activities

- [ ] **Read the final report as a team.** Both teammates should read `docs/report/AI_AUDIT_REPORT.md` once, in particular the sections they did not write, and confirm that it says what happened. Three facts only a person can confirm: whether Person 2 used a chat assistant (none is recorded), whether Person 2 approved Person 1 regenerating `web/lib/contracts/abis.ts` (`e375ff6`; the approval is not recorded), and that Person 1's account of the claude.ai chat (not in the repository) is accurate.
- [ ] **Peer evaluation** (mandatory and confidential; brief sections 4 and 7). Each student submits their own, separately.
- [ ] **Record the demo video**, if one is to be submitted (`docs/VIDEO_PLAN.md`). The plan targets 7:30 within a 6 to 8 minute window; that window is the team's own plan, not a requirement of the brief. Record a `contracts/script/demo-journey.sh` clip as a backup.
- [ ] **Rehearse the demo on the recording chain**: a fresh Anvil, then deploy and export, so the recording starts from block 0.
- [ ] **Agree the shared-file wording**: `CLAUDE.md` still names the brief `docs/project.pdf`, while the file in the repository is `docs/Development_Project.pdf`. `CLAUDE.md` is shared, so neither teammate has edited it.
- [ ] **Decide whether the brief PDF should stay in the public repository** (see section 6).
- [ ] **Submit** (section 7).

## 4. Optional extra manual tests

The cases below were not performed with MetaMask. They are optional unless the team wants to claim them; mock-wallet and real-chain evidence exists for most of them (`TESTING.md`, Section F).
- Rejecting a placement, a cancel, a match and a trigger in MetaMask.
- Switching account while a request is open.
- An RPC outage and a chain reset during a transaction.
- Cancelling a buy order, and the engine's refund of a stop that cannot enter a deep book (real-chain suite only).
- The later steps of `TESTING.md` Tests 5 to 11 that were not reported, and screenshots and transaction hashes for the journeys already run.

## 5. Confirm on NTULearn (not stated in the brief)

- The submission deadline.
- The submission format: PDF or Markdown report, how the code is handed in, and whether a repository link or a zip is expected.
- Whether a demo video is required, and its length and format.
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
5. **Code hand-over.** The repository is public, so a link may be enough; confirm the expected format on NTULearn. For a zip: `git archive -o sc4053-dex.zip submission` (it excludes `node_modules` and the submodule contents; if graders must build from the zip, include the submodules or describe `git submodule update --init`).
6. **Upload** the report, the video (if required) and the code on NTULearn, in the required format, before the deadline.
7. **Peer evaluation:** each teammate submits separately.
