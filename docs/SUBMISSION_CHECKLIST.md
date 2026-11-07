# Submission checklist (SC4053 DEX)

State on 8 Nov: `main` includes the `engine-final` tag (`fd8869a`) and the documentation wrap-up. The brief is `docs/Development_Project.pdf`. **Confirm the deadline and the submission format on NTULearn.**

## 1. Brief requirements and bonuses
| Req. | Requirement (brief) | Status | Evidence |
|---|---|---|---|
| M1 | Asset issuer: new ERC20 tokens | ✅ Done (Person 2) | `TokenFactory.sol`, `DemoToken.sol`; `test-evidence/person2/p2-1-issuance.md` |
| M2 | Token listing | ✅ Done (Person 2) | `MarketFactory.sol`; `MarketFactory*.t.sol`; `Integration.Factory.t.sol` |
| M3 | Submit buy and sell limit orders | ✅ Done (engine and UI) | `OrderBook.placeLimitOrder`; Trade page; `OrderBook.Place.t.sol` |
| M4 | Automatic execution of matched orders | ✅ Done | `_matchTaker`, `_settleFill`; `OrderBook.Match.t.sol`; invariant suite |
| M5 | Partial fulfilment | ✅ Done | A5 refunds; partial-fill tests; demo step 1 |
| M6 | Self-custody / non-custodial | ✅ Done | No admin; `ENGINE_SECURITY_SUMMARY.md`; ledger and conservation invariants |
| M7 | Simple front end | ✅ Done (baseline) | `web/`; 410 unit tests; browser suites (mock wallet) |
| B1 | Bonus 1: cancel unfilled amounts | ✅ **Engine** · ✅ **UI (Person 2): cancel from My orders; mock-wallet tests plus one owner-run MetaMask happy path, other manual cases pending** | `cancelOrder`; `OrderBook.Cancel.t.sol` (52); demo step 2 |
| B2 | Bonus 2: batched multi-party matching | ✅ **Engine** · ⏳ **UI (Person 2)** | `matchOrders`; 4 + 4 traders in one transaction (`OrderBook.Batch.t.sol`, demo step 3) |
| B3 | Bonus 3: conditional orders | ✅ **Engine** · ⏳ **UI (Person 2)** | `placeStopLimitOrder`, `triggerStopOrders`; `OrderBook.Stop.t.sol` (42); demo step 4 |
| T1 | Tricky point: who triggers execution, and how often | ✅ Answered | `SPEC.md` section 6 |
| T2 | Tricky point: priority of older orders | ✅ Answered | `SPEC.md` sections 2 and 7 (O1, `bookSeq`) |
| D1 | AI Audit Report, 8 sections | 📝 Full draft; confirmations pending | `docs/report/AI_AUDIT_REPORT.md` |
| D2 | Four-part breakdown per major issue | ✅ 22 issues | `docs/ai-audit/issues/` (001 to 007, P2-001 to P2-015) |
| D3 | Validation evidence | ✅ | `docs/ai-audit/test-evidence/` (phase7, phase8, MUTANTS, wrapup) |
| D4 | Manual tests and screenshots | ⏳ Partly (owner) | `docs/TESTING.md` Section F |
| D5 | Peer evaluation (brief section 7) | ⏳ Team | Not in the repository |
| V | Demo video | ⏳ Team | `docs/VIDEO_PLAN.md` |

**Verified on a fresh clone (8 Nov):** `forge test` 335 passed; `npm test` 410 passed and 48 skipped; typecheck, lint and build pass; deploy, export and `check-local.sh` all succeed. See `docs/ai-audit/test-evidence/wrapup/fresh-clone-check.md`.

## 2. Depends on Person 2
- [ ] **Redeploy your local chain:** a fresh Anvil, then deploy and export (`docs/ENGINE_HANDOFF.md`, "What you must re-run"). `abis.ts` is already regenerated (`e375ff6`).
- [ ] **Bonus UI** (the handoff, parts 1 and 2):
  - a Cancel button in My orders, including for pending stops
  - a "Match orders" action when the book is crossed
  - a stop-limit order type
  - a "Trigger stops" button
  - pending stops shown in My orders
- [ ] **Error text** for `NotOrderOwner`, `OrderNotActive` and `InvalidMaxCount` in `web/lib/errors.ts`.
- [ ] **Stale UI and comment text:** `my-orders.tsx`, `order-result.tsx`, `order-plan.ts` and test names (handoff, "Stale frontend files").
- [ ] **A warning for loose limit prices** (issue 007, accepted).
- [ ] **README updates in your sections** (`fresh-clone-check.md`, "For Person 2"):
  - the stale "185 passed" and "bonus functions revert" rows
  - the Windows long-path note
  - the Foundry version
  - the Alice and Bob account convention
- [ ] **Confirm every `[P2 to confirm]` paragraph** in `docs/report/AI_AUDIT_REPORT.md`. Fill in model names where "not recorded".
- [ ] Optional: the Windows CRLF behaviour of `export-web.mjs --check` (a `.gitattributes` rule for `web/lib/contracts/*.ts`).

## 3. Depends on both
- [ ] **Report Section 1 ([P1 + P2 to confirm]):** what each of you decided before using any AI tool.
- [ ] **Report Section 8:** rewrite the lessons in your own words; the brief asks for the team's evaluation.
- [ ] **`CLAUDE.md` (shared):** it still calls the brief `docs/project.pdf`. Agree the wording (Person 2's audit I-1). `SPEC.md` is already fixed.
- [ ] **One account convention for the video:** accounts 1 and 2 (the video plan) or 0 and 1 (TESTING.md).
- [ ] **Record the video** (`docs/VIDEO_PLAN.md`). Record a `demo-journey.sh` clip as the backup.
- [ ] **Manual MetaMask cases** still open in `docs/TESTING.md` Section F, plus screenshots, if they are to be submitted.
- [ ] **Peer evaluation** (mandatory, brief section 7). Each of you, separately.

## 4. Final steps to submit
1. **Freeze the content.** Merge any last Person 2 work into `main`, then run once more:
   - `cd contracts && forge test` (expect 335 passed, or more if tests were added)
   - `cd web && npm test && npm run build`
2. **Finish the report:**
   - resolve every `[P2 to confirm]` and `[P1 + P2 to confirm]` marker: `grep -n "to confirm" docs/report/AI_AUDIT_REPORT.md` should print nothing
   - update the executive summary and the traceability table if the bonus UI shipped
3. **Export the report to PDF.** Render `docs/report/AI_AUDIT_REPORT.md` with a Markdown viewer that supports Mermaid (GitHub, or VS Code with a Mermaid preview), print to PDF, and check that the diagrams and tables appear. Links to repository files work only if the graders get the repository; if not, keep the evidence index as file paths.
4. **Tag the submission:** `git tag submission && git push origin submission`, so the graded state is fixed.
5. **Repository access:** the repo is private. Give the graders access, or submit a zip of the tagged commit (`git archive -o sc4053-dex.zip submission`). The zip excludes `node_modules` and the submodules. If graders must build from the zip, include the submodule contents or describe `git submodule update --init`.
6. **Upload** the report PDF, the video and the code (link or zip) on NTULearn, in the required format, before the deadline.
7. **Peer evaluation:** each teammate submits separately.
