# Prompt log (Person 2: tokens, deployment, frontend)

Separate from `prompt-log.md` (Person 1) so neither history is overwritten. Whether the team prefers one shared file is an open question (plan Q3).
Each entry: date and phase, prompt summary, what the AI produced, what the AI got wrong or left unclear, what the human did.
Tools: Claude Code. Model: Opus 5.5 for planning (Prompt 00), Sonnet 5.5 for P2-1 execution, plus one read-only Opus review subagent.

---

## 2026-11-05: Prompt 00, reconnaissance and architecture review (plan mode, no edits), revisions 1 to 3

**Prompt (summary):** Read-only review of the checkout: git state, OrderBook, interface, tests, docs, audit logs, toolchain. Produce a traceability matrix, architecture, token issuance plan, frontend plan, security checklist, roadmap and a first task. The brief PDF was not available at first, then added.

**What the AI produced:** A verified baseline (95 tests passing, bonus functions are `revert()` stubs, no Person 2 files), then three plan revisions: rev 1 from the repo and second-hand brief quotes, rev 2 after reading the official brief, rev 3 with the MarketFactory analysis.

**What the AI got wrong or left unclear:**
1. Rev 1 treated token listing as a stretch goal because the brief was missing. The brief (section 5.1) names "token listing" in its nutshell, so listing became a core phase in rev 2.
2. Rev 1 proposed dropping RainbowKit for wagmi 3 plus a custom connect button, on the evidence that RainbowKit 2.2.11 peers on `wagmi ^2.9.0`. The evidence was right, but the conclusion overrode a team preference. The human chose RainbowKit 2 with wagmi 2, and rev 2 pinned `wagmi@^2.19`.
3. Rev 2 advised renaming the brief to `docs/project.pdf`. The human had already committed a different filename. Re-checking showed commit 55fe657 *replaced* the `docs/project.pdf` ignore line instead of adding one, so `docs/project.pdf` is no longer ignored. That is flagged in the plan for the team, not edited.
4. The first `forge test` (run as `cd contracts && forge test`) failed with "Source @openzeppelin/... not found". `forge test --root .` passed. The root cause is not diagnosed, so every later command uses `--root .`.

**What the human did:** Added the brief, chose RainbowKit 2, required MarketFactory to be a separate Person 2 contract that leaves OrderBook.sol and the frozen interface untouched, fixed the PDF path and ignore entry, and approved P2-1 only.

---

## 2026-11-05: P2-1, ERC20 issuance (DemoToken, TokenFactory)

**Prompt (summary):** Execute only P2-1 from plan rev 3: `DemoToken`, `TokenFactory`, unit, fuzz and integration tests, Slither, an independent read-only review, then stop. No staging, committing or branch changes. No edits to Person 1 files.

**What the AI produced:**
- `contracts/src/DemoToken.sol`: OpenZeppelin ERC20, supply minted once to a holder, no owner, no mint or burn function.
- `contracts/src/TokenFactory.sol`: permissionless `createToken(name, symbol, initialSupply)`, `MAX_SUPPLY = 1e27`, four custom errors, `TokenCreated` event, `tokenCount`, `isFactoryToken`, bounded `getTokens(offset, limit)`.
- `contracts/test/DemoToken.t.sol` (11), `TokenFactory.t.sol` (20 after review), `TokenOrderBookIntegration.t.sol` (4, the SPEC section 3 worked example with factory tokens). 35 new tests, 130 in total with Person 1's 95.

**What the AI got wrong or left unclear:**
- One of its own tests failed on the first run: `test_constructor_emitsMintTransfer` declared a local event named `IERC20Transfer`, so its topic hash did not match ERC20's `Transfer` and `expectEmit` never matched. This was a test bug, not a contract bug. It was fixed by emitting `IERC20.Transfer`, and the assertion was not weakened.
- Four weaknesses in its own tests, found by the independent review and then fixed: a bare `vm.expectRevert()` that accepted any revert; a fuzz test whose `offset` range mostly landed past the end, so it rarely compared elements; a middle-page test that skipped `page[1]`; and a rollback test that passed trivially because the EVM reverts all state anyway (deleted). The AI's own mutation check at writing time had not caught these.
- `TokenOrderBookIntegration` uses its own small solvency helper because `assertSolvent` lives in Person 1's `OrderBookBase` and reads harness accessors. That reuse was deliberately avoided to keep Person 1's files untouched.

**Evidence:** `docs/ai-audit/test-evidence/person2/p2-1-issuance.md` (130 tests pass after review fixes, formatting clean, Slither 0 findings on both contracts).

**Independent review:** read-only Opus subagent, fresh context. No High or Medium defects in the contracts. No `docs/ai-audit/issues/` entry was written, because the findings were test-quality weaknesses and design notes, not bugs in shipped code, and the brief's section 2.2 format is for real defects. The details and what was changed are in the evidence file.

**Design notes carried forward:** the TokenFactory ABI needs a home both teammates agree on; supplies below or not aligned to LOT_SIZE (1e9) leave untradable dust, so the UI should suggest whole-token supplies; the UI must identify tokens by address, never by name or symbol.

**Human decisions:** pending. P2-2 (MarketFactory) is not started and needs your approval and Person 1's agreement.

---

## 2026-11-05: P2-2, MarketFactory (token listing)

**Prompt (summary):** Implement P2-2 from plan rev 3: a separate permissionless MarketFactory that deploys `new OrderBook(base, quote)` unmodified, with an on-chain registry, duplicate prevention including the reversed pair, pagination and events. Unit, fuzz and integration tests that show factory-created markets trade like directly deployed ones. Slither, an independent read-only Opus review, `docs/MARKET_FACTORY.md` and a proposal for Person 1. No staging or committing, no Person 1 file edits.

**What the AI produced:**
- `contracts/src/MarketFactory.sol` (unordered-pair key, `createMarket`, `getMarket`, `isMarket`, `getMarkets`, `marketCount`, `MarketCreated`, `MarketExists`).
- `contracts/test/MarketFactory.t.sol` (25) and `contracts/test/MarketFactoryIntegration.t.sol` (14). 39 new tests (36 before review), 169 in total.
- `docs/MARKET_FACTORY.md` with the interface, design rules, limitations and a review request for Person 1.

**What the AI got wrong or left unclear:**
1. **A wrong design claim in the approved plan.** Plan rev 3 said the OrderBook constructor's external calls to the tokens allowed reentrancy into `createMarket`, so it specified a `ReentrancyGuard`. While implementing, the AI checked the claim against the code and found it false: the constructor only calls `decimals()` through a `view` interface, which is a STATICCALL, so a token cannot run `createMarket`'s storage writes. The AI dropped the guard and replaced the claim with a test (`test_createMarket_tokenCannotReenterFromDecimals`) plus a control (`test_control_reenteringTokenSucceedsOutsideStaticContext`). The false claim was written by the AI and approved by the human before it was tested. It cost nothing because it was caught before any code shipped.
2. **A flawed mutation script.** The first mutation run reported that mutant M3 (swapped constructor arguments) survived. The cause was the script, which replaced the first textual match, a doc comment, instead of the code line. Re-running against the code line killed M3 with 12 tests. Without the sanity check against an existing assertion, this would have been recorded as a test gap that did not exist.
3. **Two test-quality gaps the review caught.** My differential test compared factory and direct markets only on an empty book, and the orientation limit was argued from arithmetic without a test. Both were fixed with new tests, and no assertion was weakened.
4. **A wrong expectation in a new test.** `expectCall(..., 1)` failed with "called 2 times". The same calldata is sent by the outer call and by the token's nested attempt, so 2 is correct, and it is evidence that the nested attempt happened. It was not a contract bug.

**Evidence:** `docs/ai-audit/test-evidence/person2/p2-2-listing.md`.

**Independent review:** read-only Opus subagent, fresh context. No High or Medium defects, and the no-reentrancy-guard claim survived its attempt to falsify it. Two Low findings: orientation squatting (a permanent, first-come choice of base and quote that can make a pair unusable when the real price is below one tick) and the factory size growing with OrderBook's initcode. Both are documented limitations and not code changes. I added three tests it prompted: one that executes the orientation claim, a full-state replay of a trade on both a factory market and a direct deployment, and custom revert data passing through. No `docs/ai-audit/issues/` entry was written because there was no defect in shipped code. Details are in the evidence file.

**Human decisions:** pending. Person 1 has not reviewed MarketFactory, and it is not wired into any deployment or UI.

---

## 2026-11-05: P2-3, deployment script and ABI export

**Prompt (summary):** Implement P2-3 from plan rev 3: `Deploy.s.sol` deploying TokenFactory and MarketFactory, issuing NTU and SGDx through the TokenFactory, creating the NTU/SGDx market through the MarketFactory, funding demo wallets, with a reproducible local-Anvil procedure and an export of real Foundry ABIs and deployed addresses to `web/lib/contracts/`. Contract size checks, a real approval and trade where practical, an independent read-only Opus review, and continuous audit evidence. Local Anvil only, no secrets, no staging or committing, no edits to Person 1's files, the frozen interface or shared files.

**Integration decision, recorded accurately:** seeding the NTU/SGDx market through `MarketFactory` was **authorized by the project owner for P2-3**. Person 1 has **not** reviewed or approved it. `CONTRACT_INTERFACE.md` still describes a direct `OrderBook` deployment and was not changed.

**What the AI produced:**
- `contracts/script/Deploy.s.sol`: `run()` (a `WrongChain` guard, `DEPLOYER` and `DEMO_WALLETS` env vars, broadcast wrapper) and `deploy(holder, wallets)` with wallet validation and post-conditions as custom errors.
- `contracts/test/Deploy.t.sol` (16 tests, including an approval and the SPEC section 3 trade on the deployed market, and `run()` on its broadcast path).
- `contracts/script/export-web.mjs` (dependency-free Node exporter) and `export-web.test.mjs` (21 tests).
- `web/lib/contracts/abis.ts` and `deployments.ts` (generated), `docs/DEPLOYMENT.md`, a status note in `docs/MARKET_FACTORY.md`, and `test-evidence/person2/p2-3-deployment.md`.
- 185 Foundry tests pass (the 169-test baseline plus 16) and 21 Node tests pass, stable across three runs.

**What the AI got wrong or left unclear:**
1. **A design that contradicts the Foundry docs, caught before any code.** The first design passed `msg.sender` from `run()` as the deployer. Context7 (Foundry book, "scripting internals") showed that inside a script `msg.sender` is the script caller and not the broadcaster, and that Forge's default `script_execution_protection` rejects reading it in the broadcasting frame. The design changed to an explicit `DEPLOYER` address with `--unlocked --sender`, so no key is needed either. This never reached code.
2. **A misleading error in the exporter, found by a real test.** After restarting Anvil without redeploying, the exporter correctly refused and wrote nothing, but said `cast block failed (is Anvil running ...)` when the real cause was a missing deployment block. Fixed to `stale deployment: block 16 does not exist on this chain (height 0) ...`. The unit tests would not have found this: it only appeared against a real chain.
3. **An equivalent mutant, not a test gap.** Removing the script's `totalSupply` post-check survived all tests. `TokenFactory` cannot mint a different supply than requested, so the check cannot fail today. It stays as defence-in-depth, and the evidence says so plainly.
4. **Two process slips, no harm done.** A `pkill -f "anvil --port 8546"` also matched its own shell and exited 144. The owner's Anvil on 8545 was confirmed untouched (same PID, block 0) before continuing, and later kills used an anchored pattern. One temporary file was briefly written to `/tmp` outside the session scratchpad and was removed.
5. **Gaps my own tests and checks missed, found by the independent review (all fixed).**
   - *The chain-id guard could be bypassed.* I had claimed `run()` could not send transactions to a public network. `block.chainid` is whatever chain id Forge is told to use, and `--chain 31337` made a node reporting chain id 1 pass the guard (11 transactions were broadcast on the reviewer's test node). The fix also asks the node (`eth_chainId`). I re-ran the exact command afterwards: `WrongChain(1)`, nothing sent. My claim was wrong because I reasoned from how Forge usually behaves and never tried hostile flags.
   - *The exporter accepted a partial broadcast.* It checked the chain but not that the deployment finished, so an interrupted run with a pending transaction and an unfunded wallet was exported as if complete. I had written "nothing is written unless every check passes" without defining "every". The fix requires nothing pending, one receipt per transaction and every status successful.
   - *ABIs were not tied to the deployed code.* A rebuild without a redeploy would have paired a new ABI with old addresses. The fix compares deployed bytecode with the build artifacts, with OrderBook's immutable slots masked. The market is also tied to the first two issued tokens, which closes a case where someone else's opposite-orientation market was exported as the seed market.
   - *A non-reproducible generated file.* `deployBlockHash` differs between fresh Anvils because blocks include a timestamp, so `--check` failed on any other fresh chain, and my doc claim that the file corresponds to a fresh Anvil was only true for the addresses. I removed the hash from the output.
   - *Tests that passed without protecting anything.* Eight mutants survived my first suite: `vm.startBroadcast` from the wrong account, a flipped block-hash comparison, swapped base and quote in the rendered file, an inverted `--check`, and others. The first suite had no test of `run()` and none of `collectDeployment`, so stale detection was backed only by my manual runs. Those tests now exist and all 11 mutants I tried are caught.
6. **A test I added during the fixes broke another test.** I wrote a `run()` test that set process-wide environment variables, with a comment saying they were cleared afterwards. They were not, and the default-environment test then read them and failed (0 balance for account 0). I found it by running the suite, removed the test, and verified custom `DEPLOYER` and `DEMO_WALLETS` on a real chain instead.
7. **A finding about the deployed ABI, for Person 1.** The deployed `OrderBook` ABI has unnamed parameters on the four unimplemented functions, while `IOrderBook` names them. Types match, so encoding works, and the interface-subset test compares types for that reason. Callers should use positional arguments. I did not change Person 1's file.

**Skills and MCPs actually invoked, and what they contributed:**
- `solidity-security` skill (invoked with the Skill tool, then its playbook headings and checklist read). Contribution: a generic checklist. Accepted: check return values of external calls (the ERC20 `transfer` results are checked), validate inputs (wallet list), never authenticate with `tx.origin` or `msg.sender` (consistent with the explicit-deployer design). Not applicable and rejected: reentrancy guards, circuit breakers, pull payments and gas packing, which concern deployed contracts, not a local script. It surfaced no defect by itself and did not change the design beyond confirming it.
- Context7 (Foundry book). Contribution: it falsified the `msg.sender` design (finding 1) and confirmed the `--unlocked --sender` and `vm.startBroadcast(address)` semantics. Accepted in full.
- Slither on `script/Deploy.s.sol`: 6 `calls-loop` notes, triaged as accepted.
- Independent Opus review subagent (invoked once, read-only): see the review paragraph below. It found and reproduced the two Medium defects that my own tests, mutation checks and real-chain runs had missed.
- Installed but not invoked, because they are not relevant to this phase: Playwright, shadcn, Awwwards, Frontend Design, Impeccable, taste, UI/UX Pro Max.

**Evidence:** `docs/ai-audit/test-evidence/person2/p2-3-deployment.md`. It distinguishes the automated `forge`, `anvil` and `cast` runs on a scratch Anvil from manual wallet or UI checks, of which there were none.

**Independent review:** read-only Opus subagent, fresh context, using its own Anvil on a separate port and no repository edits. Its seven findings of substance are listed under item 5 above and in the evidence file: two Medium (the chain-id guard bypass and the partial-broadcast export, both reproduced), one Low-Medium (ABIs not tied to the deployed bytecode), four Low (the seed-market assumption, no test of `run()`, no test of `collectDeployment` or `--check`, and a non-reproducible `deployments.ts`), and Info items on error handling and documentation wording. All were fixed and re-tested. It confirmed the claims it could not falsify: no secrets anywhere, no injection or path traversal in the exporter (it tried hostile token names), a faithful `abis.ts`, and the explicit-deployer design. No `docs/ai-audit/issues/` entry was written. The two Medium findings were defects in my own unshipped, uncommitted code, caught before anything depended on them, and they are recorded here and in the evidence file instead.

**Human decisions:** pending. P2-4 (frontend) is not started and needs approval.

---

## 2026-11-05: P2-4, Next.js foundation, wallet integration and design system

**Model record:** planning (plan revisions, compatibility checks, tool research) was done by **Sonnet 5.5**. After the owner switched with `/model opus`, design and implementation were done by **Opus 5.5 (Medium)**. One targeted **Sonnet** read-only reviewer was used; no Opus subagents.

**Prompt (summary):** Build the P2-4 front end in the RainbowKit 2 + wagmi 2 + viem 2 stack:
- the app shell, sidebar and top navigation, wallet and network display, token balances, market discovery and summary cards;
- correct wallet and network states, on-chain reads and bigint utilities;
- visual fidelity to the owner's approved Liquid Glass screenshot as an explicit acceptance criterion: render with Playwright Chromium at desktop, tablet and mobile, compare against the reference and iterate;
- no AMM features presented as real and no fabricated data; read-only (no transactions until P2-5);
- deliberate use of the design skills and MCPs.

**What the AI produced:**
- **App:** `web/`, Next 16 App Router (root layout, no `src/`, because the exporter fixes `web/lib/contracts`) with Tailwind v4 and shadcn `base-nova`.
- **Wallet:** RainbowKit 2.2.11 + wagmi 2.19.5 + viem 2.57, injected wallet only unless a WalletConnect id is set.
- **Hooks:** read-only `hooks/use-dex-data.ts`, every read pinned to 31337 and refreshed per block.
- **Logic modules:** `lib/units.ts` (bigint), `config`, `network-status`, `errors`, `depth`, and the x402 build stub, with 69 vitest tests.
- **Design:** a liquid-glass design system in `app/globals.css`.
- **Pages:** dashboard, Markets and Tokens.
- **Docs and evidence:** `docs/FRONTEND.md`, `test-evidence/person2/p2-4-frontend.md`, and screenshots.

**What the AI got wrong or left unclear:**
1. **A design direction that the brief then replaced.** The first plan proposed a monochrome "ledger" identity, following `frontend-design`'s warnings about dark-plus-accent defaults. The owner's screenshot pinned a liquid-glass look instead, so the brief won and the earlier direction was withdrawn. This is recorded as a planning revision, not a defect.
2. **The build broke on transitive optional peers, found only by running it.** Turbopack could not resolve `@x402/*` modules deep under wagmi's connectors. The dependency chain was traced and the optional-peer status confirmed. Exactly five specifiers were aliased to a stub that throws only when called; no unused payment SDK was installed.
3. **A wrong expected value in my own unit test** (the dimmed tail of 1e9 base units). The function was right and the test was corrected, not weakened.
4. **Visible defects in my first render, caught only by looking.**
   - Desktop: depth drawn as diagonals instead of steps; the Market board's Trades column clipped by my minimum widths; order fields overflowing because a `fieldset` takes min-content width.
   - Mobile: the hero wave stretched through the text, and a 1px overflow from the header button.
   All were fixed over four Playwright passes.
5. **A false claim in a no-data state.** The depth panel said "No trades yet" when it simply had no data (unknown chain or node down). It now shows a dash.
6. **A craft-floor ban I had copied from the reference.** The "Welcome" eyebrow above the h1. Impeccable's craft floor bans eyebrows outright, even when a brief has one, so it was removed.
7. **Security-relevant gaps found by the Sonnet review, all fixed with regression tests:**
   - `requiredQuote` and `quoteCost` returned impossible bigints where the contract's `mulDiv` reverts;
   - a reverting market read was blamed on the RPC;
   - an empty check list would classify as "ok".
8. **Assumptions about tools that did not hold.**
   - The plan expected the Playwright MCP to run once Chromium was installed, but the MCP is configured for the Google Chrome channel, which needs root. It was driven through the MCP's bundled Playwright library and the approved Chromium instead. Missing NSS libraries came from user-space `.deb` extraction, with no sudo.
   - A WalletConnect dashboard URL was written from memory and corrected to the one RainbowKit's docs give.
   - `shadcn init` ran its own `npm install` (with lifecycle scripts) after my `--ignore-scripts` install. Only three optional native add-ons have install scripts, and all have JavaScript fallbacks.
9. **Housekeeping I created.** A stray `tsconfig.tsbuildinfo` (moved into the ignored `.next/cache`) and 30 MB of intermediate screenshots (pruned to 12 MB of before, final and state evidence).

**Skills and MCPs actually invoked, and what they contributed:**
- **Context7:** RainbowKit (install, `ConnectButton.Custom`), wagmi (the `readContracts` multicall fallback), shadcn (CLI flags). All accepted.
- **`frontend-design`:** process and the list of AI-default clichés. The ledger concept was withdrawn once the brief was pinned; its copy rules were kept.
- **`ui-ux-pro-max`:** 6 searches.
  - Accepted: Swiss-minimal at density 8, skeletons with `aria-busy`, Server Components by default.
  - Rejected: its landing-page pattern and its gold/purple palette.
  - Its IBM Plex pairing was replaced by Inter (closer to the reference), keeping Plex Mono for addresses.
- **Awwwards MCP:** 2 searches and 1 detail fetch. The results were unrelated marketing dashboards with no extractable design data, so rejected.
- **shadcn MCP:** `get_project_registries` and `get_add_command_for_items`. Its command installed 10 components.
- **`impeccable`:** context loader; critique in degraded single-context mode (owner's no-extra-agents rule); detector with 0 findings. Applied: the eyebrow ban and themed browser surfaces.
- **`taste-skill`:** the app-screen rules and `inspect.mjs --app`.
  - 4 FAILs, all the pinned liquid-glass brief: kept and documented.
  - 6 WARNs: one fixed (`panel-void`), five defended.
  - Applied: one finding stated (the spread), an 11px text floor, chips that never wrap, numbers that add up across panels.
- **Playwright** (the MCP's bundled library and Chromium): every render, overflow probe and console check.
- **Not invoked:** `solidity-security` (no Solidity changed), backend skills (no backend).

**Evidence:** `docs/ai-audit/test-evidence/person2/p2-4-frontend.md` and `p2-4-screens/`.

**Human decisions:**
- The owner chose RainbowKit 2, approved the Chromium install and switched the model to Opus.
- The owner provided the Liquid Glass reference as the visual source of truth.
- Pending: the owner's manual MetaMask checklist in `docs/FRONTEND.md`, and approval for P2-5.

---

## 2026-11-05: P2-5, limit orders and the transaction lifecycle

**Model record:** planned and implemented by **Sonnet 5.5 (Medium)** (the owner switched to it with `/model` before this prompt). One fresh-context **Sonnet** subagent reviewed the trading code read-only. No Opus subagent, no Haiku. Between prompts the session was also used on smaller tasks (creating `PRODUCT.md` and `DESIGN.md`, reformatting `AGENTS.override.md`, an environment diagnosis); those are not P2-5 work.

**Prompt (summary):** Make the limit-order ticket work on any MarketFactory market, with exact bigint maths, exact-collateral approvals to the order book, a typed lifecycle (simulate, sign, receipt, decode `OrderPlaced`/`Trade`, refresh, reconcile), My orders and a transaction page; improve the MetaMask pending-request experience (connect, approve, order, network switch) without changing the wallet setup; preserve the approved design; verify on a scratch Anvil (8545 and 3000 untouched), with a mock-wallet browser test never described as MetaMask; write a manual checklist; run a focused security review; record real defects.

**What the AI produced:** pure logic in `web/lib/` (`order-input`, `order-plan`, `order-flow`, `order-runner`, `receipt`, `order-status`, `flow-steps`, `wallet-prompt`, an appended `describeTxError`), hooks (`use-order-flow`, appended reads), `components/trade/*`, `components/wallet/wallet-pending-notice.tsx`, the `/trade` and `/tx/[hash]` pages, a gated real-chain test, a mock-wallet browser test, 138 new unit tests, and the docs and evidence.

**What the AI got wrong (each with evidence in `docs/ai-audit/issues/p2-*`, unless noted):**
1. **Decoded only the order book's errors** (P2-001). The unit test built the error by hand and passed; the real chain showed the token's `ERC20InsufficientAllowance` came back unnamed. Lesson: a hand-built fixture proves the mapping table, not the decoding path.
2. **Read exactly as many orders as the fill cap** (P2-002), so the preview could never see the maker that would still cross after 10 fills. Found by the real chain.
3. **Kept the review step open after an account switch** (P2-003) and **left one Switch-network button without the pending guidance** (P2-004). Both found by the browser run.
4. **Planned "no tracked file changes" for a scratch deploy** (P2-005) without checking that `forge script --broadcast` also overwrites an ignored record the exporter validates. The owner's `export-web.mjs --check` began reporting their chain as stale; I restored the record and redirected forge's output for later scratch deploys.
5. **Four issues a fresh reviewer found in my lifecycle code** (P2-006 to P2-009): "Try again" could lose a signed transaction; the outcome was not checked against the requested order or the mined hash (viem resolves a replaced or cancelled transaction with the replacement's receipt); failures after signing invited a duplicate; a mined revert said "Nothing was sent"; and five places where the UI could state something it did not know. I had not seen any of them in my own review.
6. **A first design that hid the notice.** I placed the connect guidance in the page; RainbowKit's dialog covers the whole page while it waits. Caught by reasoning before the first browser run; the browser run now asserts the notice is the topmost element. (No "before" failure to show, so no issue entry.)
7. **Test and tooling mistakes, none shipped:** a locator that matched a non-clickable heading; a wrong balance assertion in my own test; an environment variable placed after the command instead of before it; piping a long run through `tail` so its progress was invisible; a `pkill -f` pattern that matched my own shell and killed it before the edit ran; a first aborted browser run that left the scratch chain dirty, which I noticed and reset by redeploying.
8. **A plan item not carried out:** I said I would apply the `solidity-security` skill's lens. I did not invoke it (no Solidity changed); the independent review covered approvals, escrow and token interaction. Recorded rather than glossed.

**What the human did:** approved the plan and the scratch-environment approach; the manual MetaMask run in Windows Brave with two accounts (`docs/FRONTEND.md`) is **pending**.

**Skills and MCPs:** see `test-evidence/person2/p2-5-trading.md` ("Tools actually used"). In short: Context7, `playwright-core` (library), `impeccable detect`, one Sonnet reviewer; not used: Awwwards, taste, ui-ux-pro-max, shadcn MCP, `solidity-security`.

## 2026-11-06: P2-5 wrap-up, Quick Actions fix, README and manual testing guide

**Model record:** **Haiku 5.5**, as the owner instructed ("use Haiku to implement the plan"). No Sonnet or Opus delegation and no review subagent. During this stretch the session reported a different model for a short time without any action from me; I stopped, said so, and resumed only after the owner confirmed Haiku.

**Prompt (summary):** (1) Fix the Place order Quick Actions tile alignment. (2) Write a professional README and, if useful, a read-only environment checker. (3) Write an illustrated `docs/TESTING.md` for manual testing with MetaMask, with troubleshooting. Also: record the owner's real MetaMask verification of the SPEC example accurately, keep docs consistent, add a documentation-maintenance rule to the two local instruction files, and do not start P2-6.

**What the AI produced:** a one-line CSS change; `README.md`; `scripts/check-local.sh`; `docs/TESTING.md`; a new section in the P2-5 evidence file; two small status corrections (`PRODUCT.md`, `docs/FRONTEND.md`); a numbering fix in `docs/DEPLOYMENT.md`; a maintenance rule appended to `CLAUDE.local.md` and `AGENTS.override.md` (ignored by Git).

**What the AI got wrong or left unclear:**
1. **My first Quick Actions edit was lost.** I applied the fix, the command that built and measured it was interrupted, and when I came back the file was at its committed state (and the working tree clean). I do not know who reverted it; I re-applied the same one-line change and re-measured. Lesson: after an interruption, check the file, do not assume.
2. **Plan versus request on keys.** The owner asked for the `cast wallet` derivation to be documented but forbade any seed phrase in the repo. I resolved it by documenting the real command with a `$ANVIL_MNEMONIC` placeholder and a way to read the phrase from an Anvil banner, and verified it by comparing only the derived *address*; no phrase or key is in any file.
3. **A scratch-environment loss.** My temporary Chromium libraries in `/tmp` had been cleared. The owner installed the system libraries; I checked that Chromium launched normally before using any workaround and recorded which measurements used which method.
4. **Unverified items are labelled, not explained away:** the `cz-shortcut-listen` hydration warning (no repo code mentions it; not reproduced), MetaMask's native-token-symbol warning wording, MetaMask menu wording and popup contents, and `anvil --state` persistence are all marked unverified in `docs/TESTING.md`.
5. **No real MetaMask screenshots were in the workspace** (the owner's screenshots were not available to me). I used clearly labelled placeholders and existing mock-wallet renders (labelled as such), and listed the 19 images still needed. I did not draw or imitate any MetaMask window.

**What the human did:** performed the real MetaMask SPEC walkthrough (recorded in `p2-5-trading.md`), installed the missing Ubuntu libraries for Chromium, and supplied the instructions. Still pending: the negative and recovery cases and the screenshots.

**Skills and MCPs:** none beyond ordinary file, shell, `cast`, `forge` and `playwright-core` use (Chromium for the alignment measurement). Context7, shadcn, design skills and `solidity-security` were not needed.

## 2026-11-06: P2-6, token issuance and market listing

**Prompt (summary):** Make Create token and List market work in the browser with the existing contracts, on the P2-5 lifecycle; duplicate and reversed-pair handling; integration with Trade; tests at every layer; one narrow review; docs.

**What the AI got wrong:**
1. Invisible-character lists, lone-surrogate handling, a stale hash after a speed-up and an unhandled `isMarket` error (reviewer findings; issue P2-010).
2. Reused a full-width panel in a sidebar column, which squeezed it unreadably (found from a screenshot, fixed).
3. Ran two real-chain suites in parallel, which interleaved snapshots and produced false failures; the command now uses `--no-file-parallelism`.
4. Two test-code slips (address case, a strict selector matching two elements) were test errors, fixed in the tests, not the product.

**What the human did:** approved the plan and the model choice. Still pending: the manual MetaMask cases in `docs/TESTING.md` Test 8.

**Skills and MCPs:** `playwright-core`, `impeccable detect` (placeholder contrast fixed; other findings match the existing pages), Foundry, one Sonnet reviewer. Context7, shadcn and `solidity-security` were not needed (no Solidity change).


## 2026-11-06: P2-6.1, Dashboard market selector and all-token wallet overview

**Prompt (summary):** After P2-6 was manually verified in MetaMask, let the Dashboard show any registered market (selector, URL-based, validated) and add an all-token wallet overview with paginated registry discovery; no contract changes; stop for review.

**What the AI got wrong:**
1. Reused a panel keyed by token symbol for non-seed markets, which left a stale "ghost" row while token metadata loaded (found from a screenshot; issue P2-011, red then green in the browser run).
2. Planned to carry `?market=` through the sidebar links, then found that needs `useSearchParams` in the layout shell (a Suspense boundary around everything); dropped it and linked Dashboard and Trade to each other instead.
3. Test-code slips (a selector counting each holdings row twice, a label that matched a landmark too, a race on async titles), fixed in the tests.

**What the human did:** approved the plan; reported the manual MetaMask results for P2-6. Still pending: `docs/TESTING.md` Test 9.

**Skills and MCPs:** `playwright-core`, `impeccable detect`, Foundry. No reviewer, Context7, shadcn or `solidity-security` (no Solidity or signing-path change). Deviation from the brief: no "component" test harness was added (no jsdom dependency); logic is in pure tested modules and the components are covered by the browser run.

## 2026-11-06: P2-7, transaction-lifecycle hardening and bonus-integration readiness

**Prompt (summary):** Plan then implement P2-7: handle replaced, repriced and cancelled pending transactions in the P2-5 runner, prevent stale receipts and misleading confirmations, strengthen account, network, rejection and local-chain-restart behaviour, add multi-market regression, and document what Person 1's bonuses (cancel, batch, stop-limit) will need, without activating any bonus UI. The user approved the plan with two refinements: chain-reset detection must be evidence-based (a missing transaction alone is not proof), and viem's replacement behaviour must be measured across several windows before finalising `waitBounded`. A follow-up asked for one narrow correction: the existing 5 px header overflow at 390 px with a connected wallet.

**What the AI got wrong:**
1. The P2-5 runner's "follows a re-priced transaction" was only tested with a fake `waitForReceipt`; viem was never given the sender and nonce, so the real wait could not see a replacement (issue P2-012). The P2-6 creation runner copied the same shape.
2. In this session: the first real-chain tests mined the speed-up at once and passed even with the fix removed; the choreography was corrected and a mutant run proved it (3 red).
3. A `pkill -f` pattern matched my own shell and killed the scratch Anvil (the user's 8545 was unaffected); later a stale scratch server made a run fail with HTTP 500 chunks before I found it.
4. A browser-test helper used `lastSent()` and picked up the earlier approval transaction ("nonce too low"); a wording slip put the word "reset" in a message that had to avoid it.
5. A single cache-hit of viem's `getBlockNumber` left the displayed block stale after a reset; found from a screenshot and fixed with one delayed re-read.
6. I reported the header overflow as "5 px" and left it. Measuring showed the real cause: at 390 px the row needs about 431 px, and flex shrink had already crushed the menu button to 20 px, so the touch target was also broken (at 375 px the overflow was 20 px). Fixed in the follow-up with layout classes only.
7. While writing this log the first time, a second `open().read()` overwrote the entry; the final diff review caught it and it was restored.

**What the human did:** approved the plan with the two refinements above; asked for the header fix and a final diff review. Still pending: `docs/TESTING.md` Test 10 with MetaMask, review and commit.

**Skills and MCPs:** Foundry (scratch Anvil, `forge test`), `playwright-core`, `impeccable detect`. No reviewer was spawned and no Opus agent: there is no new signing or contract path, only wait-logic and notice changes. `solidity-security` was not applicable (no Solidity changed). Context7 was not needed (viem behaviour was measured and the installed source read).

## 2026-11-06: documentation alignment and README redesign (model: Haiku 5.5, docs only)

**Model:** Haiku 5.5 for this entire task. Earlier sessions' Sonnet attribution is not carried over.

**Prompt (summary):** Make the documentation match the implemented DEX through P2-7: an SGHomie-style README with three Mermaid diagrams (architecture, user journey, MarketFactory workflow), the accepted MarketFactory architecture (rationale, tradeoffs, not an AMM, router, escrow or matcher), PRODUCT, FRONTEND, TESTING, DEPLOYMENT, MARKET_FACTORY and a narrow CONTRACT_INTERFACE deployment-handoff correction. Separate owner-reported MetaMask actions from read-only chain observations. No Solidity, frozen API, SPEC, ENGINE_PHASES, CLAUDE or Person 1 history changes. No commit.

**What the AI got wrong:**
1. The first draft of MARKET_FACTORY.md had a duplicate "What it does" heading after the new sections; caught on re-reading and removed.
2. The first draft of the TESTING.md results table grouped Tests 5 and 6 with the owner's confirmed steps. Section F says they were not separately reported; the table was corrected to match Section F before the work was reported.
3. The first version of the workflow chart drew Anvil with four arrows into the contracts, which reads as if Anvil calls them. The architecture picture uses one chain box instead.

**What the human did:** supplied the README reference and two diagrams as starting points, approved the plan with the MarketFactory diagram and rationale, and asked that the attribution be Haiku 5.5. The DTT/SGDx manual trade was reported by the owner; its hashes and screenshots are not in the repository and are not recorded here.

**Evidence:** this was a docs-only change, so no test suite was run. Checks actually run: all three Mermaid diagrams parsed with mermaid 12.2.0 in headless Chromium; a relative-link and anchor check over 12 edited files (one reported item is a documented image-syntax example, not a broken link); read-only `cast` and `scripts/check-local.sh` reads on 8545 (chain 31337, block 13, `marketCount` 2, DTT base, SGDx quote, `lastTradePrice` 2e18). Nothing was marked passed that was not run.

## Requirements traceability
| ID | Brief text | Design | Code | Tests | Evidence | Report § | Status |
|---|---|---|---|---|---|---|---|
| R4 | Asset Issuer: issue new asset tokens adhering strictly to ERC20 | plan rev 3 section 6, P2-1 | `contracts/src/DemoToken.sol`, `contracts/src/TokenFactory.sol` | `DemoToken.t.sol`, `TokenFactory.t.sol`, `TokenOrderBookIntegration.t.sol` | `test-evidence/person2/p2-1-issuance.md` | 1, 4, 6 | tested (Foundry). Deployed and exercised on a scratch Anvil by script and `cast` (P2-3). **Not wallet- or UI-verified** |
| R2 | Front end supports token listing (and order submission, execution, self-custody) | `docs/MARKET_FACTORY.md`, plan rev 3 section 3 | `contracts/src/MarketFactory.sol` | `MarketFactory.t.sol`, `MarketFactoryIntegration.t.sol` | `test-evidence/person2/p2-2-listing.md` | 1, 4, 6, 7 | tested (Foundry). The seed market is created through it by `Deploy.s.sol` on a scratch Anvil (P2-3, user-authorized). **Draft: Person 1 has not reviewed it.** Not wallet- or UI-verified. The front-end part of R2 is not built |
| R3 (partly) / R5 / R6 | non-custodial, limit orders, automatic matching and partial fills | `docs/DEPLOYMENT.md` | `contracts/script/Deploy.s.sol` (deployment only; the engine is Person 1's) | `Deploy.t.sol` trade test | `test-evidence/person2/p2-3-deployment.md` item 6: a real approval and trade (SPEC section 3 example) on a scratch Anvil | 6 | executed on a deployed market by `cast`. **Not wallet- or UI-verified** |
| R2 (front end) / R3 (UI) | Front end supports token listing and self-custody | `docs/FRONTEND.md` | `web/` (markets and tokens registries, wallet connect through RainbowKit; no signing outside the wallet) | `web/lib/*.test.ts` (69) | `test-evidence/person2/p2-4-frontend.md`, `p2-4-screens/` | 4, 6, 7 | **read-only listing and discovery built and browser-rendered** with real chain data. Issuing and listing from the browser is P2-6. **Wallet flows not yet verified with MetaMask** |
| G (UX) | Sleek UX, comprehensive docs | `docs/FRONTEND.md` design system | `web/app/globals.css`, `web/components/` | Playwright renders at 3 widths, impeccable detector, taste inspector | `p2-4-screens/` before and after | 7 | rendered and iterated against the owner's reference. Visual judgement by eye, no pixel diff |
| R5 / R6 / R3 (trading) | Buy and sell limit orders, automatic execution with partial fills, non-custodial | `docs/FRONTEND.md` "Trading workflow", plan rev 3 section 4 | `web/lib/order-*.ts`, `web/lib/receipt.ts`, `web/hooks/use-order-flow.ts`, `web/components/trade/` (signing only in the wallet; no key in `web/`) | `web/lib/*.test.ts` (207 passing), `trading.integration.test.ts` (18, real scratch chain), `web/e2e/trade.e2e.mjs` (13, mock wallet) | `test-evidence/person2/p2-5-trading.md`, `p2-5-screens/` | 4, 5, 6, 7 | **tested** against deployed contracts on a scratch Anvil and in a browser with a **mock wallet**. SPEC example reproduced to the wei. **The SPEC example was also performed by the project owner with real MetaMask accounts in Windows Brave (reported 2026-11-06; chain state checked read-only).** The negative and recovery cases are procedures in `docs/TESTING.md`, **not yet performed manually** |
| G (UX): pending-wallet guidance | Sleek, usable UX | `docs/FRONTEND.md`, `DESIGN.md` "Wallet notices" | `web/components/wallet/wallet-pending-notice.tsx`, `web/lib/wallet-prompt.ts` | `wallet-prompt.test.ts`, browser steps "connect", "wrong network", "rejection" | `p2-5-screens/connect-pending-*.jpg`, `p2-5-trading.md` | 7 | wording, escalation after 20 s and position above RainbowKit's dialog verified with a mock wallet. **The owner has used the flow with real MetaMask; the pending-request guidance itself has not been separately recorded against a real popup** |
| B1 (cancel remainder), B2, B3 | Bonus: cancel, batched matching, conditional orders | n/a | none: the engine's `cancelOrder`, `matchOrders`, stop functions revert, so the UI has no control for them | n/a | `OrderBook.sol` lines 88-101 | n/a | **not implemented** (Person 1's engine); not presented as available |
| T1 / T2 | Who triggers execution and how often; priority at equal price | `docs/FRONTEND.md` | the UI says matching only happens inside order transactions and that a crossed remainder cannot be cleared yet | `trading.integration.test.ts` (fill cap) | `p2-5-trading.md` | 4 | behaviour observed on a real chain; the priority rule itself is the engine's (Person 1) |
| R2 (front end) / G (UX) | Usable multi-market dashboard and wallet overview | `docs/FRONTEND.md` "Dashboard market selector" | `web/lib/market-select.ts`, `holdings.ts`, `registry-pages.ts`, `web/hooks/use-market-choice.ts`, `use-holdings.ts`, `web/components/dashboard/` | `market-select`, `holdings`, `registry-pages` unit tests; `e2e:dashboard` (mock wallet) | `test-evidence/person2/p2-6-1-dashboard.md`, issue P2-011 | n/a | Mock-wallet verified; MetaMask Test 9 pending |
| R5 / R6 / G (UX): reliable order and creation lifecycle | Orders and token/market creation report what actually happened despite speed-ups, cancels, replacements, restarts | `docs/FRONTEND.md` "Transaction lifecycle hardening", `docs/BONUS_INTEGRATION.md` | `web/lib/order-runner.ts`, `chain-reset.ts`, `create-runner.ts`, `web/hooks/use-chain-watch.ts`, `web/components/shell/chain-reset-notice.tsx` | `chain-reset.test.ts`, `order-runner.hardening.test.ts`, `hardening.integration.test.ts`, `e2e/hardening.e2e.mjs` | `test-evidence/person2/p2-7-hardening.md`, issue P2-012 | n/a | implemented, mock-wallet verified; MetaMask Test 10 pending |
Other rows are not started by Person 2.
| R4 / R2 (browser) | Issue tokens and list markets from the front end | `docs/FRONTEND.md` "Token issuance and market listing" | `web/lib/create-*.ts`, `web/hooks/use-create-flow.ts`, `web/components/create/` | `create-*.test.ts`, `creation.integration.test.ts` (21), `e2e/create.e2e.mjs` (14) | `test-evidence/person2/p2-6-issuance-listing.md` | 7 | mock wallet and scratch chain only; MetaMask not yet performed |
