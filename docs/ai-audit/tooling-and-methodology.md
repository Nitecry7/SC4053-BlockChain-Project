# AI-assisted development: tools, models, reviews and verification

Status: written 2026-11-06 from the repository's own records. Person 2 (`prompt-log-person2.md`, `test-evidence/person2/`). Person 1's log is `prompt-log.md`; this file does not summarise or change it.

## Principles

- **Only what is recorded counts.** A tool is listed as *used* only when a prompt-log entry or an evidence file records it being invoked. Being installed is not use.
- **Status vocabulary.** *Invoked* (a recorded run or call, with its outcome). *Attempted, failed* (tried, did not run). *Evaluated only* (read or searched, not applied). *Installed, not invoked* (present, no recorded use). *No installation found* (searched, nothing present).
- **Supplement, not replacement.** AI tools and AI reviews supplement contract tests, real-chain tests, manual verification and human review. A green run covers only the scenarios it checks. Mock-wallet results are not MetaMask results. Slither notes are not an audit.

## Models and reviewers by phase

Models are shown only where the repository records them. "Not recorded" means the log entry does not name a model.

| Phase | Planning and implementation | Independent review (read-only) | Source |
|---|---|---|---|
| Prompt 00 (planning) | Opus 5.5 | not applicable | `prompt-log-person2.md`, header |
| P2-1 issuance | Sonnet 5.5 | one Opus subagent, fresh context | `prompt-log-person2.md` P2-1; `test-evidence/person2/p2-1-issuance.md` |
| P2-2 listing | not recorded | one Opus subagent | `prompt-log-person2.md` P2-2 |
| P2-3 deployment | not recorded | one Opus subagent, own Anvil | `prompt-log-person2.md` P2-3; `p2-3-deployment.md` |
| P2-4 frontend foundation | planning Sonnet 5.5; implementation Opus 5.5 (Medium) | one Sonnet subagent | `prompt-log-person2.md` P2-4 model record; `p2-4-frontend.md` "Independent review" |
| P2-5 limit orders | Sonnet 5.5 (Medium) | one fresh-context Sonnet subagent | `prompt-log-person2.md` P2-5; `p2-5-trading.md` "Tools actually used" |
| P2-5 wrap-up | Haiku 5.5 | none | `prompt-log-person2.md` P2-5 wrap-up |
| P2-6 token issuance and listing | not recorded in the entry | one Sonnet reviewer, narrow scope | `prompt-log-person2.md` P2-6 |
| P2-6.1 dashboard | not recorded | none | `prompt-log-person2.md` P2-6.1 |
| P2-7 hardening | not recorded in the entry (the owner's brief asked for Sonnet 5.5 Medium) | none ("no Opus agent" recorded) | `prompt-log-person2.md` P2-7 |
| Documentation alignment and this methodology file (2026-11-06) | Haiku 5.5 | none | `prompt-log-person2.md`, 2026-11-06 entries |
| P2-8A pre-integration audit (2026-11-06) | Sonnet 5.5 (Medium) | none (claims traced by script) | `prompt-log-person2.md` P2-8A; `test-evidence/person2/p2-8a-audit.md` |
| P2-8A.1 fixes (2026-11-06) | Sonnet 5.5 (Medium) | none | `prompt-log-person2.md` P2-8A.1; `test-evidence/person2/p2-8a1-fixes.md` |

## Tool register

### Claude Code and the model roles
- **Purpose:** the working environment for every phase: reading and writing files, running `forge`, `cast`, `npm` and the browser suites, and holding the prompt logs.
- **Status:** invoked in every phase.
- **Contribution:** the implementation, the tests and the documentation, under the owner's per-phase prompts. The model used is in the table above.
- **Limitations:** the model names above are the ones the repository records; they are not a claim about every subagent or every turn.

### Context7 (library documentation)
- **Purpose:** current API documentation for libraries (Foundry, RainbowKit, wagmi, viem, shadcn).
- **Status:** invoked in P2-3, P2-4 and P2-5. Not used in the P2-5 wrap-up, P2-6, P2-6.1 or P2-7 (recorded as not needed).
- **Contribution and outcome:**
  - P2-3: the Foundry book falsified the `msg.sender` design, and it confirmed `--unlocked --sender` and `vm.startBroadcast(address)` semantics (accepted in full).
  - P2-4: RainbowKit `ConnectButton.Custom`, wagmi's `readContracts` fallback and shadcn CLI flags (accepted).
  - P2-5: `useWriteContract`, `useWaitForTransactionReceipt`, `useSwitchChain` and `parseEventLogs`. The result set the `isPending` wording.
- **Limitations:** documentation only. It cannot show runtime behaviour, which is why P2-7 measured viem's replacement handling against Anvil.
- **Evidence:** `prompt-log-person2.md` P2-3 and P2-4 entries; `test-evidence/person2/p2-5-trading.md` "Tools actually used".

### Playwright MCP
- **Purpose:** driving a browser from the tool.
- **Status:** **attempted, failed** in P2-4. Its Chrome channel is configured for `/opt/google/chrome`, and installing that needs root. Not used from P2-5 onwards.
- **Evidence:** `test-evidence/person2/p2-4-frontend.md` "Browser verification"; `p2-5-trading.md` "Tools actually used".

### playwright-core (library, not the MCP)
- **Purpose:** the browser suites: renders, overflow probes, console checks and the mock-wallet end-to-end suites (`e2e`, `e2e:create`, `e2e:dashboard`, `e2e:hardening`).
- **Status:** invoked from P2-4 onwards.
  - P2-4: the MCP's bundled library (1.65.0-alpha) drove the approved Chromium (revision 1252). Its missing NSS libraries came from `apt-get download` and were loaded from the scratchpad, with no system change and no sudo.
  - P2-5 onwards: the project's own dev dependency `playwright-core` 1.64.1, with the same Chromium 1252 (Chromium 157).
- **Limitations:** the mock wallet is an injected stand-in. It does not exercise MetaMask. The 1.64.1 library expects revision 1248, so the installed 1252 was used through `executablePath`.
- **Evidence:** `p2-4-frontend.md`; `p2-5-trading.md`; `p2-7-hardening.md`.

### shadcn MCP
- **Purpose:** looking up and adding shadcn components.
- **Status:** invoked in P2-4 (`get_project_registries`, `get_add_command_for_items`). Its command installed 10 components. Not used from P2-5 (no new component).
- **Evidence:** `prompt-log-person2.md` P2-4.

### Awwwards MCP
- **Purpose:** looking for design references.
- **Status:** invoked in P2-4 (2 searches and 1 detail fetch).
- **Outcome:** the results were unrelated marketing dashboards with no extractable design data. **Rejected.**
- **Evidence:** `prompt-log-person2.md` P2-4.

### solidity-security skill
- **Purpose:** a checklist for Solidity risks (external-call results, input validation, authentication, reentrancy, gas).
- **Status:** invoked in **P2-3** and again in **P2-8A**. Not invoked in P2-4, P2-5, P2-6, P2-6.1 or P2-7. P2-1 and P2-2 do not record it. Not invoked in those phases because no Solidity changed. In P2-8A it grounded the review points requested from Person 1 for the bonus functions (see `docs/BONUS_INTEGRATION.md`); it is not a security review of `OrderBook.sol`.
- **Contribution (P2-3):** a generic checklist. **Accepted:** check return values of external calls, validate inputs, never authenticate with `tx.origin` or `msg.sender`. **Rejected as not applicable** to a local script: reentrancy guards, circuit breakers, pull payments and gas packing.
- **Limitations:** the skill is a reading checklist. It produced no findings of its own.
- **Evidence:** `prompt-log-person2.md` P2-3 (item on the skill), P2-5 (recorded as a deviation).

### Slither 0.11.6 (static analysis)
- **Purpose:** static analysis of Solidity.
- **Status:** invoked on Person 2 contracts in P2-1, P2-2 and P2-3, and re-run at commit `c23c6a3` in P2-8A on `DemoToken.sol`, `TokenFactory.sol`, `MarketFactory.sol` and `Deploy.s.sol` (results in `test-evidence/person2/p2-8a-audit.md`). Not recorded for P2-4 to P2-7. Not run on `OrderBook.sol` by Person 2. Person 1's log records the install and that Slither had not yet been run on the code at that time; this file does not claim any Person 1 result.
- **Findings and triage:** see the static-analysis table below.
- **Evidence:** `p2-1-issuance.md`, `p2-2-listing.md`, `p2-3-deployment.md`.

### Foundry (`forge`, `anvil`, `cast`)
- **Purpose:** compilation, the contract test suite (fuzz included), scratch chains for real-chain tests, and read-only checks.
- **Status:** invoked in every phase.
  - `forge test`: 185 passed (recorded in P2-7 evidence and the README).
  - Fuzz tests exist in `TokenFactory.t.sol` (3), `OrderBook.Match.t.sol` (2), and one each in `DemoToken.t.sol`, `OrderBook.Place.t.sol` and `MarketFactory.t.sol`.
  - Invariant tests: **not present.** `contracts/test/invariant/` does not exist. `foundry.toml` has `[invariant]` settings, but there are no invariant tests to run. `ENGINE_PHASES.md` plans a Phase 7 invariant suite.
  - `anvil` on scratch ports 8546 and 3100, and `cast` reads, were used for real-chain suites and exporter checks.
- **Limitations:** fuzz tests ran under the configured profile. A deep profile exists but is not recorded as run for Person 2 contracts.
- **Evidence:** `p2-1-issuance.md`, `p2-2-listing.md`, `p2-3-deployment.md`, `p2-7-hardening.md`.

### Vitest and the real-chain suites
- **Purpose:** unit tests of the pure logic, and gated real-chain suites that run against a scratch Anvil and refuse port 8545.
- **Status:** invoked from P2-4 onwards.
- **Results recorded in P2-7 evidence:** 368 passed and 48 gated tests skipped (unit). Real chain: 48 passed (trading, creation and hardening suites, `--no-file-parallelism`).
- **Limitations:** the gated suites need `E2E_RPC_URL` and `E2E_ALLOW_MUTATE=1`. A fresh scratch chain is needed for each run.

### Design tools (P2-4)
- **frontend-design:** invoked in P2-4 for process and the list of AI design clichés to avoid. Its concept step was withdrawn once the brief pinned the look; its copy rules were kept.
- **ui-ux-pro-max:** invoked in P2-4 with 6 searches. **Accepted:** Swiss-minimal at density 8, skeletons with `aria-busy`, Server Components by default. **Rejected:** its landing-page pattern and its gold/purple palette. Its IBM Plex pairing was replaced by Inter; Plex Mono was kept for addresses.
- **impeccable:** context loader and a critique run in P2-4, in degraded single-context mode (no sub-agents, per the owner's rule). Applied: the eyebrow ban and themed browser surfaces. `impeccable detect` was run in P2-4 (0 findings), P2-5 (0 findings), P2-6.1 (0 findings on the three new components) and P2-7 (0 findings on the two touched components). **Limitation (recorded in P2-6.1 and P2-7):** the detector ran its regex rules only; rules that need a rendered page did not run, so the result is an undercount.
- **taste-skill:** invoked in P2-4 with `inspect.mjs --app` on the production build: 4 FAIL, 6 WARN. The 4 FAILs were the pinned liquid-glass brief, kept and documented. Of the 6 WARNs, one was fixed (`panel-void`) and five were defended. Applied: one finding stated, an 11px text floor, chips that never wrap.
- **Evidence:** `p2-4-frontend.md`; `p2-5-trading.md`; `p2-6-1-dashboard.md`; `p2-7-hardening.md`.

### React Best Practices (`react-best-practices`)
- **Status:** installed, **invoked once in P2-8A** (2026-11-06) for the front-end audit and **once in P2-8A.1** (rules applied and rejected: `test-evidence/person2/p2-8a1-fixes.md` section 7). Not invoked in P2-1 to P2-7. Its rules are mostly server-component and bundle oriented, so the bundle, re-render and client data-fetching categories were applied to this client-side wallet app. Contribution: the findings R1 to R5 in `test-evidence/person2/p2-8a-audit.md`, each backed by a measurement or a file reference. No code was changed.
- **Installation as recorded:** a user-level copy in `~/.claude/skills/react-best-practices` (`SKILL.md` and `references/`). A copy with `references/` only is also tracked in git under `.claude/skills/react-best-practices/` since commit `d2be460`. The two copies differ; the tracked copy has no `SKILL.md`. Resolving that is an open point.
- **No use is claimed for any phase before P2-8A.**

### forge lint and axe-core (first used in P2-8A)
- **`forge lint`** (Foundry 1.9.0): invoked in P2-8A on the contracts. 7 warnings (4 `reentrancy-events`, 2 `require-revert-in-loop`, 1 `unsafe-typecast`), 4 of them in Person 1's `OrderBook.sol`. Listed with owners in `test-evidence/person2/p2-8a-audit.md` section 5.2. Not a replacement for Slither.
- **axe-core 4.14.0:** a temporary, pinned version loaded from a CDN into throwaway scratch pages, at desktop and mobile widths. It is **not** a project dependency and is not in `package.json` or the lockfile. Result: two serious violation types, and colour contrast not determined (axe cannot resolve translucent glass backgrounds). It finds only the machine-checkable subset of WCAG.
- **Playwright library** (not the MCP) was used for the network capture and the axe runs, as in P2-5 to P2-7.

### SkillSpector
- **Status:** **no installation found** under the user skills, plugins, the project `.claude/` folder, pip or npm global packages. It was **not** used. No success is claimed.

## Static-analysis findings (Slither)

| Phase | Target | Result | Triage | Evidence |
|---|---|---|---|---|
| P2-1 | `DemoToken.sol`, `TokenFactory.sol` | 0 results on each | none needed | `p2-1-issuance.md` |
| P2-2 | `MarketFactory.sol` | 5 `naming-convention` notes on the constant getters `PRICE_SCALE`, `LOT_SIZE`, `TICK_SIZE`, `MAX_MATCHES_PER_TX`, `MAX_INSERT_SCAN` | accepted: these are the names of Person 1's frozen ABI getters, not code in `MarketFactory` | `p2-2-listing.md` |
| P2-3 | `Deploy.s.sol` | 6 `calls-loop` notes | accepted: the demo-wallet transfer and balance loops in a local script, not deployed contract code | `p2-3-deployment.md` |

## Independent-review findings

These are different evidence from the static analysis above. Each reviewer was a read-only AI subagent, not a human audit.

| Phase | Reviewer (recorded) | Outcome | Changes made | Evidence |
|---|---|---|---|---|
| P2-1 | Opus, fresh context | no High or Medium defects in the contracts. Four weaknesses in the tests (a bare `expectRevert`, an offset fuzz range that rarely reached the data, a middle-page test that skipped an element check, a trivially passing test) | tests strengthened; the trivial test deleted; no issue entry (no defect in shipped code) | `p2-1-issuance.md` |
| P2-2 | Opus | no High or Medium defects. Two Low: orientation squatting (a permanent, first-come base and quote choice) and factory size growth with OrderBook | documented as limitations; three tests added; no code change | `prompt-log-person2.md` P2-2 |
| P2-3 | Opus, own Anvil on a separate port | **two Medium, reproduced:** the chain-id guard could be bypassed with `--chain 31337` against a node reporting chain id 1 (the reviewer's run broadcast 11 transactions), and a partial broadcast could be exported as complete. Also one Low-Medium, four Low | guard and export checks fixed; re-run: `WrongChain(1)` and nothing sent | `prompt-log-person2.md` P2-3; `p2-3-deployment.md` |
| P2-4 | one Sonnet subagent | no High or Medium findings. Confirmed: no write path, reads pinned to chain 31337, no cross-account leak, only two public environment variables, placeholder id cannot pass, bigint parser sound | none required | `p2-4-frontend.md` "Independent review" |
| P2-5 | one fresh-context Sonnet subagent | 13 findings, verified ones fixed. Four became issues: a signed transaction could be lost by "Try again" (P2-006); the result was not bound to the requested order (P2-007); a failure after submission invited a duplicate order (P2-008); UI fail-open and false claims (P2-009) | fixed, with issue entries | `p2-5-trading.md`; issues `p2-006` to `p2-009` |
| P2-6 | one Sonnet reviewer, narrow scope | four Low: invisible-character lists, lone-surrogate handling, a stale hash after a speed-up, an unhandled `isMarket` error | fixed. The stale-hash item was a P2-5 gap, fixed properly in P2-7 (issue P2-012) | `prompt-log-person2.md` P2-6; issue `p2-010` |
| P2-5 wrap-up, P2-6.1, P2-7 | none recorded | not applicable | not applicable | `prompt-log-person2.md` |

## What these tools and reviews do not prove

- A passing automated run proves only the scenarios it checks, in the environment it ran in.
- Mock-wallet browser results are not MetaMask results. The owner's manual MetaMask checks are recorded separately in `docs/TESTING.md`, Section F, and not all steps were performed.
- Slither notes are triaged, not an audit. The static-analysis results above cover only the files listed.
- AI reviews are read-only and fresh-context, but they are not human security audits. Their findings were reproduced or tested before fixes were accepted, where the records show that.
- The `impeccable` detector used regex rules only, so its zero results are an undercount.

## Person 1: checks for future engine changes

**None of these checks has been performed for the bonus functions, which are not implemented.** The list is guidance, not a record.

- [ ] Invoke the `solidity-security` checklist on each changed engine function, and record the result in the prompt log.
- [ ] Run Slither on `OrderBook.sol` and the new bonus code, and triage each result in the audit record.
- [ ] Run the Foundry fuzz tests under the configured profile, and the deep profile (`[profile.deep.fuzz]` exists in `foundry.toml`), on the changed code.
- [ ] Add and run the Phase 7 invariant suite (`ENGINE_PHASES.md`). It does not exist at HEAD, so no invariant result can be cited yet.
- [ ] Get a targeted independent review of each changed function, read-only and fresh-context, and log its findings with severity.
- [ ] Retest MarketFactory compatibility after the bonuses land: `MarketFactoryIntegration.t.sol` and its differential test.
- [ ] Check compiled sizes: `cd contracts && forge build --root . --sizes`. `MarketFactory` embeds OrderBook's creation code. Last recorded: factory runtime 8,358 bytes, OrderBook initcode 6,974 bytes, limits 24,576 and 49,152 bytes.

## Keeping this current

At the end of each phase, record the skills and MCPs invoked, what each contributed, what was accepted and rejected, and the evidence file. This follows the rule in the local project instructions, section 11. Update the register rows above with a link to the new entry.
