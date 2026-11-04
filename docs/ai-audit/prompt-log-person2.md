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

## Requirements traceability (R4 only, so far)
| ID | Brief text | Design | Code | Tests | Evidence | Report § | Status |
|---|---|---|---|---|---|---|---|
| R4 | Asset Issuer: issue new asset tokens adhering strictly to ERC20 | plan rev 3 section 6, P2-1 | `contracts/src/DemoToken.sol`, `contracts/src/TokenFactory.sol` | `DemoToken.t.sol`, `TokenFactory.t.sol`, `TokenOrderBookIntegration.t.sol` | `test-evidence/person2/p2-1-issuance.md` | 1, 4, 6 | tested (Foundry). Deployed and exercised on a scratch Anvil by script and `cast` (P2-3). **Not wallet- or UI-verified** |
| R2 | Front end supports token listing (and order submission, execution, self-custody) | `docs/MARKET_FACTORY.md`, plan rev 3 section 3 | `contracts/src/MarketFactory.sol` | `MarketFactory.t.sol`, `MarketFactoryIntegration.t.sol` | `test-evidence/person2/p2-2-listing.md` | 1, 4, 6, 7 | tested (Foundry). The seed market is created through it by `Deploy.s.sol` on a scratch Anvil (P2-3, user-authorized). **Draft: Person 1 has not reviewed it.** Not wallet- or UI-verified. The front-end part of R2 is not built |
| R3 (partly) / R5 / R6 | non-custodial, limit orders, automatic matching and partial fills | `docs/DEPLOYMENT.md` | `contracts/script/Deploy.s.sol` (deployment only; the engine is Person 1's) | `Deploy.t.sol` trade test | `test-evidence/person2/p2-3-deployment.md` item 6: a real approval and trade (SPEC section 3 example) on a scratch Anvil | 6 | executed on a deployed market by `cast`. **Not wallet- or UI-verified** |
Other rows (B1 to B3, T1, T2) are not started by Person 2 and will be added in later phases.
