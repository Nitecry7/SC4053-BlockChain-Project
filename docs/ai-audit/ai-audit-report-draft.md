# AI Audit Report: preliminary draft (SC4053 DEX)

Status: **preliminary draft**, prepared 2026-11-06 (P2-8A) from the repository's own records. It follows the eight sections required by the official brief (`docs/Development_Project.pdf`, section 2.1) and the four-part major-issue format (section 2.2). It is written for the team to edit; it is not final and it is not the submission.

**Rules used.** Every statement here is traceable to a prompt-log entry, an issue file or an evidence file, which are linked. Nothing is invented: no vulnerability, tool use, manual test or review. Person 1's contributions are marked where they are missing. Where only the owner can supply a fact, the section says so.

## Section status

| # | Brief title | Status | Main gaps | Needs |
|---|---|---|---|---|
| 1 | Initial Specification & System Scope | **Partly drafted** | what existed *before* AI tools were used | owner and Person 1 |
| 2 | Development Methodology & AI Tooling Infrastructure | **Drafted** (Person 2 side) | Person 1's tooling, models for some phases | Person 1 |
| 3 | Specification Engineering & Prompt Logs | **Drafted** (Person 2 side) | Person 1's chains after 2026-11-02 | Person 1 |
| 4 | AI-Generated Architecture | **Drafted** | owner to mark which choices were the AI's and which were human | owner |
| 5 | Problems Discovered & Vulnerability Analysis | **Substantially drafted** (Person 2); **outline** (Person 1) | Person 1's 4 issues and Phases 4 to 8 findings; no engine static analysis | Person 1 |
| 6 | Validation Process & Testing Strategy | **Substantially drafted** | invariant suite, engine Slither, manual MetaMask results | Person 1 and owner |
| 7 | Improvements & Refinements | **Drafted** (Person 2 side) | Person 1's refinements; bonus functions | Person 1 |
| 8 | Lessons Learned | **Drafted from evidence, for team edit** | the team's own judgement | all |

Evidence behind this table: [`p2-8a-audit.md`](test-evidence/person2/p2-8a-audit.md) (coverage matrix, baseline, findings) and [`tooling-and-methodology.md`](tooling-and-methodology.md).

---

## 1. Initial Specification & System Scope

**Status: partly drafted. The brief asks for what the team intended to build *before engaging AI tools*; the repository cannot establish that boundary.** The first logged session (Person 1, 2026-10-28) is already an AI planning session, so the owner and Person 1 must say what existed before it.

*Drafted from the brief and the first plan.* The team chose Option 1, a minimal decentralized exchange (brief section 5.1): an order-book DEX on Ethereum with a simple web front end supporting token listing, order submission, order matching and execution, and user self-custody. The core requirements were:

- **Asset issuance:** new ERC20 tokens.
- **Orders:** buy and sell limit orders (the baseline), automatic execution of matched orders, and partial fulfilment.
- **Bonus:** cancelling unfilled amounts, batched multi-party matching, conditional orders.
- **Brief's two questions to settle:** who triggers execution and how often, and whether older orders get priority at identical conditions.

*Smart-contract logic intended:* one order book per token pair, non-custodial escrow, execution at the resting order's price, price-time priority, partial fills, refunds, no admin. *UI features intended:* wallet connection, a market view with the live order book, an order ticket with approval and escrow shown, an order history, token issuing and market listing. Sources: [`docs/DEX_Trading_Engine_Plan.md`](../DEX_Trading_Engine_Plan.md) sections 3 to 6, [`SPEC.md`](../../SPEC.md) (design decisions section 2, accounting rules section 3), [`PRODUCT.md`](../../PRODUCT.md).

*Open for the owner:* confirm which of these existed as the team's own notes before the first AI session, and whether to cite the plan document as an AI-assisted artefact (it says it was built with Claude Code).

## 2. Development Methodology & AI Tooling Infrastructure

**Status: drafted for Person 2. Full register: [`tooling-and-methodology.md`](tooling-and-methodology.md).**

**Division of labour.** Person 1 owned the engine (`OrderBook.sol`, its interface, engine tests and specification). Person 2 owned `TokenFactory`, `DemoToken`, `MarketFactory`, the deployment script and exporter, the Next.js front end, front-end and end-to-end tests, and the documentation. The interface between them (`CONTRACT_INTERFACE.md`) was frozen on 1 November by agreement. Shared files needed both people's agreement (`CLAUDE.md`, `CONTRACT_INTERFACE.md`, `foundry.toml`). Decisions such as the front-end library choice, the MarketFactory architecture and the model to use for each phase were the owner's.

**Workflow per phase.** A read-only planning session produced a plan the owner approved or refined; implementation followed one phase at a time; tests were written with the code; mutation checks, real-chain runs and, for most phases, a fresh-context read-only AI review followed; the result and the AI's own mistakes were logged in [`prompt-log-person2.md`](prompt-log-person2.md) with evidence files under [`test-evidence/person2/`](test-evidence/person2/).

**Tools actually used** (status per tool in the register): Claude Code with Opus 5.5, Sonnet 5.5 and Haiku 5.5 in different phases; Context7 for library documentation (P2-3 to P2-5); the shadcn and Awwwards MCPs and the `frontend-design`, `ui-ux-pro-max`, `impeccable` and `taste-skill` skills (P2-4); the `solidity-security` skill (P2-3 and P2-8A); Slither 0.11.6 and `forge lint`; Foundry (`forge`, `anvil`, `cast`); Vitest; `playwright-core` with a mock wallet. The Playwright MCP was attempted in P2-4 and did not launch. The `react-best-practices` skill was invoked in P2-8A. SkillSpector: no installation found, not used.

**Custom artefacts.** Shared: `CLAUDE.md` (engine and working rules, including "never claim something was run unless you ran it"), `SPEC.md`, `CONTRACT_INTERFACE.md`, and three project commands in `.claude/commands/` (`explain-diff`, `log-issue`, `review-engine`). Person 2: the deployment script with a chain-id guard, the dependency-free exporter `contracts/script/export-web.mjs` (generates the front end's ABIs and addresses from build artefacts and verifies them against the chain), the read-only `scripts/check-local.sh`, and the mock-wallet browser harness `web/e2e/mock-wallet.mjs`.

**Needs Person 1:** the engine side of the toolchain, the model used in phases 1 to 3, and the models for P2-2, P2-3, P2-6, P2-6.1 and P2-7 (not recorded in the log entries).

## 3. Specification Engineering & Prompt Logs

**Status: drafted for Person 2.**

**Specification files given to the AI tools.**

| File | Role |
|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | Standing rules read every session: source of truth order, file ownership, engine rules, "never weaken a failing test", log each session |
| [`SPEC.md`](../../SPEC.md) | Engine behaviour: design decisions, accounting rules A1 to A8, lifecycle, functions, who triggers execution, known limitations |
| [`CONTRACT_INTERFACE.md`](../../CONTRACT_INTERFACE.md) | The frozen contract interface (units, structs, events, errors, deployment handoff) |
| [`docs/ENGINE_PHASES.md`](../ENGINE_PHASES.md) | The engine build order, one phase at a time |
| [`docs/MARKET_FACTORY.md`](../MARKET_FACTORY.md), [`PRODUCT.md`](../../PRODUCT.md), [`DESIGN.md`](../../DESIGN.md) | Person 2 specifications: the factory, the product rules and the approved visual design |

**Representative prompt chains** (full text and iterations are in the logs; the owner's briefs are summarised there, not quoted).

| Chain | Iterations | What changed because of it | Log |
|---|---|---|---|
| Planning for Person 2's scope | three plan revisions in read-only mode before any edit | scope, ownership and the MarketFactory proposal | [Prompt 00](prompt-log-person2.md) |
| P2-3 deployment script | plan, implementation, mutation checks, an independent review, fixes | a design contradicted by the Foundry docs was changed before code; the reviewer's two Medium findings were fixed (section 5.2) | [P2-3](prompt-log-person2.md) |
| P2-5 limit orders | plan, implementation, a fresh-context review | review findings became issues P2-006 to P2-009 | [P2-5](prompt-log-person2.md) |
| P2-7 hardening | plan, owner approval with two refinements (evidence-based chain-reset detection; measure viem's replacement behaviour before finalising), implementation, a follow-up on a layout defect | issue P2-012; the refinements changed the design | [P2-7](prompt-log-person2.md) |
| P2-8A audit | plan, one owner refinement round (axe-core allowed as a temporary pinned tool; defects are reported, not fixed) | this draft and the evidence file | [P2-8A](prompt-log-person2.md) |

**Context windows.** Sessions were long, with summaries carried between them; the logs record each session's prompt summary, what the AI got wrong and what the human did. The exact context window contents are not preserved and are not claimed.

**Needs Person 1:** engine prompt chains after 2026-11-02 (the Person 1 log ends at Phase 3b, with the Phase 4 prompt only drafted).

## 4. AI-Generated Architecture

**Status: drafted.** The structure below was proposed by the AI tools in the planning sessions and then accepted, changed or rejected by the owner. [`prompt-log-person2.md`](prompt-log-person2.md) and [`docs/MARKET_FACTORY.md`](../MARKET_FACTORY.md) record the decisions.

**Contracts.**
- `OrderBook` (Person 1): one contract per token pair, immutable `baseToken` and `quoteToken`, both required to be 18-decimal. Each side of the book is a sorted doubly linked list of order IDs, best order at the head. Escrow is pulled at placement. Fills execute at the maker's price inside `_settleFill`, up to `MAX_MATCHES_PER_TX` (10) fills per call. Priority is price, then an internal `bookSeq`. `ReentrancyGuard` is on every write. Interface in [`CONTRACT_INTERFACE.md`](../../CONTRACT_INTERFACE.md); behaviour in [`SPEC.md`](../../SPEC.md).
- `DemoToken` and `TokenFactory` (Person 2): a fixed-supply 18-decimal ERC20 with no owner, mint or burn, created through a registry factory.
- `MarketFactory` (Person 2): a permissionless factory that deploys one unmodified `OrderBook` per unordered token pair and keeps a registry. Proposed by the AI in P2-2; the owner accepted it as the architecture for listing and deployment. Not an AMM, router or escrow contract. Details and tradeoffs: [`docs/MARKET_FACTORY.md`](../MARKET_FACTORY.md).
- Deployment: `Deploy.s.sol` (local Anvil only) creates `TokenFactory`, `MarketFactory`, the NTU and SGDx tokens and the NTU/SGDx market, and funds demo wallets.

**Front end (Person 2).** Next.js App Router with TypeScript and Tailwind; RainbowKit, wagmi and viem for the wallet and chain access; TanStack Query for caching. No backend, database or indexer: the browser reads the chain directly. State management is a pure lifecycle reducer (`web/lib/order-flow.ts`) shared by order, approval, token creation and market listing, with runners (`order-runner.ts`, `create-runner.ts`) that simulate, sign, wait and reconcile against the chain.

**Changes made to the AI's initial proposal** (examples recorded in the logs): `LOT_SIZE` and `TICK_SIZE` added to make every cost exact; `InvalidTokens`, `requiredQuote` and public constants added to the interface (`CONTRACT_INTERFACE.md`, "Changes from the plan's section 5"); an explicit deployer instead of `msg.sender` in the script; the exporter tied to build artefacts and the live chain.

**Needs the owner:** mark which of these were the AI's first proposal and which were human decisions, as the brief asks for what the *AI tools* proposed.

## 5. Problems Discovered & Vulnerability Analysis

**Status: substantially drafted for Person 2; outline for Person 1.** Findings come from the AI's own mistakes, independent AI reviews, real-chain and browser tests, and measurement. None was invented. The two Medium reviewer findings in P2-3 were in the deployment tooling (script and exporter), not in the deployed contracts; no High-severity defect is recorded for Person 2's contracts.

### 5.1 Person 2 issues, in the brief's four-part format

Each row summarises an issue file, which holds the full analysis and the real before-and-after output.

| Issue | 1. Why the AI made the mistake | 2. Why it is problematic | 3. How it was fixed | 4. Evidence the fix works |
|---|---|---|---|---|
| [P2-001](issues/p2-001-token-errors-not-decoded.md) Token errors not decoded | the test built the error object by hand, so it proved only the mapping table; assumed viem decodes any revert | the two commonest mistakes (no approval, low balance) showed a generic message | token ABI errors added to the simulation ABI | regression test replays the real revert data (red, then green); raw revert from the scratch chain |
| [P2-002](issues/p2-002-fill-cap-hides-crossed-remainder.md) Fill cap hides crossed remainder | the plan said to read "at least" the cap and the code read exactly 10, so the 11th maker was invisible | the ticket's warning failed exactly when the remainder stays crossed and `matchOrders` cannot clear it | read cap plus one; report an exhausted snapshot | regression test red then green; real-chain test with 12 crossing makers |
| [P2-003](issues/p2-003-review-step-survived-account-switch.md) Review step survived an account switch | account changes were handled in the reducer, but the ticket kept its own `reviewing` state | information from the previous wallet shown as the new wallet's | ticket ends review on any account, chain or market change | browser run failed, then 13 passed (mock wallet) |
| [P2-004](issues/p2-004-switch-network-no-guidance-in-ticket.md) No guidance on the ticket's network switch | guidance was added to one switch button; the ticket had a second hook instance with separate state | a hidden wallet popup was unexplained | same waiting notice on the ticket | browser run failed, then passed (mock wallet) |
| [P2-005](issues/p2-005-scratch-deploy-overwrote-exporter-record.md) Scratch deploy overwrote the exporter record | the plan said "no tracked file changes" but missed that `forge script --broadcast` overwrites an ignored record the exporter reads | the owner's export check would report a healthy chain as stale | record restored; scratch deploys redirect broadcast and cache output | exit code 1 before, passing after; procedure documented |
| [P2-006](issues/p2-006-try-again-lost-a-late-signature.md) "Try again" lost a late signature | the reset was unconditional and relied on wording to tell users to reject first | two escrowed orders, the first invisible | abandoned attempts are remembered and a late hash is shown with a warning | red reducer tests, then green |
| [P2-007](issues/p2-007-result-not-bound-to-requested-order.md) Result not bound to the requested order | treated any successful receipt with one `OrderPlaced` as the answer; viem resolves a replacement's receipt | "Order confirmed" for a transaction the user did not sign | compare side, price and amount; replaced and cancelled are failures; use the mined hash | red tests, then green |
| [P2-008](issues/p2-008-failure-after-submission-invited-a-duplicate.md) Failure after signing invited a duplicate | every non-timeout error after a hash became a generic retryable failure | a second escrow after an RPC drop; "Nothing was sent" for a mined revert | "may still be mined" warning; correct revert wording; classify reverts first | red tests, then green |
| [P2-009](issues/p2-009-ui-fail-open-and-false-claims.md) Five places the UI could mislead | happy-path reasoning in five components | the UI stated things it did not know | five targeted fixes | no automated "before" (no DOM tests); after: type check, lint, build and one browser assertion, stated plainly |
| [P2-010](issues/p2-010-creation-flow-review-findings.md) Creation-flow review findings | invisible characters listed by code point, a lone surrogate untested, a stale hash, a silent deep link, a squeezed layout, parallel suites sharing a chain | look-alike symbols, false "not the token", a stale link | Unicode categories, encoder-aware check, hash tracking, explicit failure state, layout, sequential suites | red-first tests; real-chain and browser runs |
| [P2-011](issues/p2-011-duplicate-key-ghost-row-on-market-switch.md) Ghost row on market switch | reused a panel keyed by symbol, valid only for the seed pair | a misleading extra row | key by position | red run `12 passed, 1 failed`, then `13 passed` |
| [P2-012](issues/p2-012-replacement-detection-never-had-sender-and-nonce.md) Replacement never detectable | tested "following a replacement" with a fake `waitForReceipt`; viem was never given the sender and nonce | a sped-up order could read "not confirmed", inviting a duplicate | the runner reads the transaction once and passes the fields; evidence-based chain-reset detection | defect measured on a scratch Anvil; red `10 failed, 4 passed`, then green; real chain `3 failed, 6 passed`, then `9 passed` |

### 5.2 Reviewer findings in P2-3 (issue files written in P2-8A.1)

These are the highest-severity findings in Person 2's work. The two Medium findings now have issue files, written on 2026-11-06 (P2-8A.1) for defects found and fixed on 2026-11-05 (P2-3): [P2-013](issues/p2-013-chain-id-guard-bypassed-by-forge-chain-override.md) and [P2-014](issues/p2-014-exporter-accepted-a-partial-broadcast.md); the model of the original P2-3 session was not recorded. The two lower-severity rows below are still only drafts here, with no issue file.

| Finding | 1. Why the AI made the mistake | 2. Why it is problematic | 3. How it was fixed | 4. Evidence the fix works |
|---|---|---|---|---|
| **Medium** ([P2-013](issues/p2-013-chain-id-guard-bypassed-by-forge-chain-override.md)): the chain-id guard could be bypassed | reasoned from how Forge usually behaves and never tried hostile flags: `block.chainid` is whatever Forge is told, so `--chain 31337` passed on any node | the script could broadcast to a non-local chain; the reviewer's test node (chain id 1) received 11 transactions | `run()` also asks the node (`eth_chainId`) | the exact command now fails with `WrongChain(1)` and the node height stays 0 ([p2-3](test-evidence/person2/p2-3-deployment.md) item 12); unit test; mutants caught |
| **Medium** ([P2-014](issues/p2-014-exporter-accepted-a-partial-broadcast.md)): the exporter accepted a partial broadcast | wrote "nothing is written unless every check passes" without defining "every" | an interrupted deployment (a pending transaction, an unfunded wallet) was exported as complete | require nothing pending, one receipt per transaction and every status successful | unit tests; mutants E4 and E7 caught |
| **Low-Medium:** ABIs not tied to the deployed bytecode | exporter compared chain and files, not code | a rebuild without a redeploy would pair a new ABI with old addresses | deployed bytecode must equal the build artefacts (immutables masked); the market must come from the first two issued tokens | mutants E5, E6 and E8 caught; items 11 and 14 in the evidence |
| **Low:** `deployments.ts` not reproducible | claimed the file matched a fresh Anvil; `deployBlockHash` varies with block timestamps | `--check` failed on any other fresh chain | hash removed from the output | byte-identical files on three fresh chains (`sha256sum -c`) |

### 5.3 Findings from the P2-8A audit, and their status after P2-8A.2

| ID | Severity | Finding | Status (evidence: [p2-8a1-fixes.md](test-evidence/person2/p2-8a1-fixes.md)) |
|---|---|---|---|
| R6 | Medium | `aria-label` on plain `<span>`s (`Amount`, address chip) is a prohibited ARIA use; exact amounts may not reach assistive technology | **Fixed** in P2-8A.1 (hidden text instead; regression test red on the old code, axe 12 views to 0). Screen-reader behaviour still unverified |
| R6b | Low | four more role-less `aria-label` containers (`tx-status`, three review boxes) | **Fixed** in P2-8A.2: reproduced in eight states (axe "needs review", `aria-prohibited-attr`), then the name moved to the `<ol>` and the review boxes became labelled groups; 0 needs-review after. See [p2-8a2-liveness.md](test-evidence/person2/p2-8a2-liveness.md) section 7 |
| R7 | Low to Medium | two buttons whose accessible name does not contain their visible text (WCAG 2.5.3) | **Fixed** (axe 6 views to 0; name, keyboard and five-width layout assertions) |
| R1, R2 | Medium | every block re-read immutable data; no JSON-RPC batching | **Fixed and measured:** overview per block 65 to 45 operations, HTTP 65 to 9 with batching; Trade 43 to 28; Tokens 42 to 27 |
| R3 to R5 | Low | idle polling, log rescan from the deploy block, 304 to 448 KB gzip first-load JavaScript | Reported, unchanged (chain watcher deliberately left alone) |
| R8 | Low to Medium | contrast unresolved by axe | **Partly fixed** in P2-8A.2 (all failing runs kept, 18 views): badge letters, the "Connect wallet" gradient button and 11 px captions now measure above 4.5; the dimmed disconnected placeholders and one suspected measurement artifact remain; manual DevTools check still needed; no compliance claim |
| R9 | Medium | after the RPC dies, the page keeps showing its last data as live | **Fixed** in P2-8A.2 after a controlled reproduction: probe, outage alert, "last known" labels, disabled transactions, and a verified recovery that reuses the P2-7 chain-reset assessment. Issue [P2-015](issues/p2-015-stale-data-shown-as-live-after-the-rpc-died.md). Cost +12 requests per minute |
| I-1 | Medium (process) | `SPEC.md` and `CLAUDE.md` call the brief `docs/project.pdf`, untracked; it is tracked as `docs/Development_Project.pdf` | Recorded with proposed wording; Person 1's files not edited |
| I-5 | Medium (process) | P2-3 Medium findings had no issue files | **Done:** P2-013 and P2-014 |

### 5.4 Static analysis and review

Slither triage (P2-1 to P2-3, re-run at HEAD in P2-8A) and every independent-review result by phase are in [`tooling-and-methodology.md`](tooling-and-methodology.md) and [`p2-8a-audit.md`](test-evidence/person2/p2-8a-audit.md) section 5.2. They are different kinds of evidence and are not merged. No Slither run on `OrderBook.sol` is recorded by Person 2.

### 5.5 Known limitations (not defects)

[`SPEC.md`](../../SPEC.md) section 8 lists the engine's known limitations (manipulable `lastTradePrice`, `BookTooDeep` as a gas bound, 18-decimal tokens only, self-trades allowed, a crossed book after a capped placement, cheap dust griefing, push payouts, stranded direct transfers). [`docs/FRONTEND.md`](../FRONTEND.md) lists the front end's.

### 5.6 Person 1

**Outline only.** Issues [001](issues/001-unlink-empties-book-side.md), [002](issues/002-undocumented-cei-deviation-in-matching.md), [003](issues/003-fill-cost-overflow.md) and [004](issues/004-matching-test-gaps.md) exist in the four-part format; Person 1 should summarise them here and add findings from Phases 4 to 8 (cancel, batch, stop-limit, fuzz and invariants, static analysis). Nothing from those phases exists yet.

## 6. Validation Process & Testing Strategy

**Status: substantially drafted.** Layers, from the cheapest to the strongest:

| Layer | What it checks | Result recorded (P2-8A, 2026-11-06, commit `c23c6a3`) |
|---|---|---|
| Foundry unit and integration tests | contracts, including the factory against a direct deployment | 185 passed |
| Fuzz tests | eight stateless fuzz tests, 1,000 runs each by default | pass (within the 185); a 10,000-run deep profile exists and is not recorded as run |
| Mutation checks | deliberately broken code must turn tests red | 11 of 11 caught in P2-3; 5 of 5 in P2-7 and in P2-6.1 ([p2-3](test-evidence/person2/p2-3-deployment.md), [p2-7](test-evidence/person2/p2-7-hardening.md)) |
| Differential tests | factory market versus direct deployment, including all write functions | pass (`MarketFactoryIntegration.t.sol`) |
| Static analysis | Slither 0.11.6 on Person 2's contracts and script; `forge lint` | 0, 0, 5 and 11 results; 7 lint warnings (section 5.2 of the audit file) |
| Front-end unit tests | pure logic, reducers, runners with fake chains, decoding | 368 passed, 48 gated skipped |
| Real-chain integration tests | the runners against a scratch Anvil with unlocked accounts | 48 passed |
| Browser tests, mock wallet | the UI end to end in Chromium on a scratch chain | 13, 14, 13 and 9 passed |
| Independent AI review | a fresh-context read-only subagent, per phase | P2-1 to P2-6 (none for P2-5 wrap-up, P2-6.1, P2-7) |
| Accessibility and performance measurement | axe-core 4.14.0 (temporary), Playwright network capture | two violation types found; counts in [p2-8a-audit.md](test-evidence/person2/p2-8a-audit.md) |
| **Manual MetaMask** | the real wallet | **owner-reported only**: Tests 1 to 4 and a DTT trade; most steps and every negative case not performed ([TESTING.md](../TESTING.md) Section F) |

**What this does not prove.** A passing run proves only the scenarios it checks. Mock-wallet runs are not MetaMask. The two stateless solvency fuzz tests are not a stateful invariant suite, and that suite (Engine Phase 7) does not exist. Slither on the engine has not been run by Person 2. Automated tools and AI reviews supplement tests, manual verification and human review; they do not replace them.

**Needs Person 1:** the invariant suite, fuzz hardening and engine static-analysis results (Phases 7 and 8). **Needs the owner:** the manual MetaMask evidence and screenshots.

## 7. Improvements & Refinements

**Status: drafted for Person 2.** Changes beyond the AI's first output, each with its evidence in the log or issue files:

- **Safer order flow:** exact-amount approvals; simulation before signing; results tied to the requested order and the mined hash; stale-attempt and duplicate-submission guards (P2-003, P2-006 to P2-008).
- **Honest estimates:** the ticket reads one maker past the fill cap so it can warn about a crossed remainder (P2-002).
- **Transaction hardening (P2-7):** speed-ups, cancels and replacements followed to what was mined; local chain resets detected from block identity, never from a missing transaction alone; every read refreshed after a failure.
- **Token and market safety:** Unicode-category input checks, decimals and duplicate-pair detection before any signature, permanence acknowledgement for market orientation (P2-6, P2-010).
- **Deployment safety:** a chain-id guard that asks the node, an exporter that refuses incomplete, stale or mismatched deployments and produces reproducible files, scratch-chain isolation (P2-3, P2-005).
- **Architecture:** the permissionless `MarketFactory` with duplicate and reversed-pair prevention, accepted as the listing mechanism (P2-2).
- **Usability:** multi-market dashboard, all-token holdings, responsive header fixed at 375 and 390 px (P2-6.1, P2-7).
- **Documentation and audit trail:** a README, a manual testing guide, a coverage matrix, this report draft, per-phase evidence.

**Not yet done (the audit's recommendations, not improvements):** the accessibility fixes R6 and R7, the read-volume reductions R1 to R3, and the bonus functions.

**Needs Person 1:** engine refinements and the three bonus functions.

## 8. Lessons Learned

**Status: drafted from evidence, for the team to edit.** These are observations the records support, not conclusions the team has agreed.

- **Where AI helped.** Fast drafting of contracts, tests and UI; broad test suites; a fresh-context reviewer found real defects that the authoring session's own tests missed (two Medium findings in P2-3; 13 findings in P2-5). Mutation checks and measuring tool behaviour against a real chain exposed weak tests.
- **Where AI failed.**
  - It reasoned from typical behaviour instead of trying hostile cases (the chain-id guard, P2-3).
  - It wrote tests that proved only its own mapping or a fake (P2-001, P2-012: a fake `waitForReceipt` showed the runner reacts to a callback, not that viem ever calls it).
  - It followed the happy path of one component (P2-003, P2-004, P2-009).
  - It stated unsupported claims: in this project's own documentation, an earlier README line described invariant tests that did not exist, and said every phase's model was recorded. Both were corrected (see the log).
  - Its accessibility claim ("exact amounts are available to assistive technology") is contradicted by an axe finding (R6); a green browser suite did not catch it.
- **Process lessons.**
  - A tool being installed is not evidence it was used; the register records "invoked", "attempted, failed" and "no installation found" separately (the Playwright MCP could not launch; SkillSpector has no installation).
  - Log every real bug as an issue entry when it is found; the P2-3 findings were missed and had to be drafted afterwards.
  - Keep scratch and real environments separate: a scratch deploy once overwrote the exporter record for the owner's chain (P2-005).
  - A mock-wallet result is not a MetaMask result, and the report must say so each time.
- **Recommendations for future AI-driven dApp work.** Use an independent reviewer on every phase that adds a signing or deployment path; add a stateful invariant suite before any security claim; test accessibility with a real screen reader and not only axe; and record the model and tool used for every phase when it happens, not afterwards.

**Needs the whole team:** the team's own critical evaluation of the tools and method, which the brief asks for.

---

## Evidence still required (summary)

- **Owner:** manual MetaMask tests and the screenshot walkthrough; screen-reader and contrast checks; DevTools contrast check of the cases left open in P2-8A.2 (dimmed placeholders, the "Open Trade view" artifact), the shared name of the review boxes, the I-1 wording agreed with Person 1; the pre-AI boundary for Section 1; peer evaluation. Detail: [p2-8a-audit.md](test-evidence/person2/p2-8a-audit.md) section 6.
- **Person 1:** the bonus functions, the invariant suite, engine Slither and `forge lint` triage, logs and issues after 2026-11-02, and per-phase models.
