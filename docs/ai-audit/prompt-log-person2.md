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

## Requirements traceability (R4 only, so far)
| ID | Brief text | Design | Code | Tests | Evidence | Report § | Status |
|---|---|---|---|---|---|---|---|
| R4 | Asset Issuer: issue new asset tokens adhering strictly to ERC20 | plan rev 3 section 6, P2-1 | `contracts/src/DemoToken.sol`, `contracts/src/TokenFactory.sol` | `DemoToken.t.sol`, `TokenFactory.t.sol`, `TokenOrderBookIntegration.t.sol` | `test-evidence/person2/p2-1-issuance.md` | 1, 4, 6 | tested (Foundry only). Not demo-verified: no Anvil or UI run yet |
Other rows (R2 listing, R3, R5, R6, B1 to B3, T1, T2) are not started by Person 2 and will be added in later phases.
