# 2. Development Methodology & AI Tooling Infrastructure (engine)

## Tools
| Tool | Used for | Source |
|---|---|---|
| **Claude Code** (CLI, model recorded as Claude Opus 5.5 in the prompt log header) | All engine code, tests, specs and reviews; plan mode for Phase 0 | `docs/ai-audit/prompt-log.md` header |
| Claude Code **subagents** | One independent review per phase: a fresh agent with no session context, read-only, given the files and a checklist but not the author's conclusions. Also used for broad read-only scans (for example, how `web/` calls the engine) | Each phase's prompt-log entry |
| **Foundry** 1.8.6 (`forge`, `anvil`, `cast`) | Build, unit, fuzz and invariant tests, gas and size reports, scratch-chain deployment and `cast` journeys | Prompt log, 28 Oct; `docs/ai-audit/test-evidence/` |
| **OpenZeppelin** 5.7.0, forge-std 1.17.0 (pinned submodules) | `SafeERC20`, `ReentrancyGuard`, `Math.mulDiv`; test framework | Prompt log, 28 Oct |
| **Slither** 0.11.6, solc-select (solc 0.8.24) | Static analysis, Phase 8 (installed 2 Nov, results pending) | Prompt log, 2 Nov and 7 Nov |
| **Node.js** 26.13.0 | Running Person 2's exporter and frontend tests against engine changes (installed 7 Nov) | Prompt log, 7 Nov |

## Custom infrastructure built for the AI
- **`CLAUDE.md`:** standing rules read every session.
  - Source-of-truth order: the brief, then SPEC, then CONTRACT_INTERFACE.
  - File ownership.
  - Engine rules: `PRICE_SCALE`, lot and tick sizes, `bookSeq` priority, bounded loops, CEI and its two documented exceptions, custom errors only.
  - Working rules: small scoped changes; tests in the same task; "never weaken or delete a failing test"; "never claim something was run unless you ran it"; log every session; log every real bug.
- **`SPEC.md`:** accounting rules A1 to A8, the lifecycle, per-function behaviour, who triggers execution, open items O1 to O4, and known limitations.
- **`CONTRACT_INTERFACE.md`:** the frozen ABI contract with Person 2. `IOrderBook.sol` must match it exactly (checked with a script in Phase 1).
- **`docs/ENGINE_PHASES.md`:** the build order, plus the exact prompt for each phase, written *before* the phase ran.
- **`.claude/commands/`:**
  - `review-engine`: spawns an independent reviewer.
  - `log-issue`: writes an issue file in the brief's four-part format, "use only output actually produced in this session".
  - `explain-diff`.
- **Test infrastructure aimed at AI mistakes:**
  - `OrderBookHarness` exposes internal links without changing the interface.
  - `assertSolvent` and `assertBookSorted` are called after almost every test.
  - Hostile mock tokens: `ReentrantERC20` (re-enters on the Nth balance change, optionally swallowing the failure) and `ViewSpyERC20` (records what views show during a transfer).
- **`docs/ai-audit/test-evidence/mutants.sh`:** a re-runnable mutation script that matches on code text, not line numbers, and has a configurable target suite. 67 mutants by Phase 7. See `MUTANTS.md`.

## Workflow per phase
1. The human writes or approves the phase prompt in `ENGINE_PHASES.md`.
2. The AI implements it and writes tests in the same task, running `forge build`, `forge test` and `forge fmt --check` and reporting the real output.
3. **Independent review** by a fresh subagent. Real findings are fixed with regression tests, and real AI-made bugs are logged with `/log-issue`, with failing-then-passing output.
4. **Mutation check:** each phase adds mutants for its own code, and they must be caught. From Phase 6, only that phase's mutants plus a smoke set run per phase, and the full set runs once in Phase 8.
5. Log the session, commit, merge into `main` with `--no-ff`, and push.
6. The human makes every design decision the AI flags, and every change to a frozen or shared file. The AI is told to stop and ask instead of deciding.

## Division of labour and decisions
- **Person 1:** the engine (`OrderBook.sol`, interface, engine tests, SPEC, ENGINE_PHASES).
- **Person 2:** the factories, deploy script, exporter, frontend and README.
- **Shared, requiring agreement:** `CLAUDE.md`, `CONTRACT_INTERFACE.md` and `foundry.toml`.
- **The engine AI never edited Person 2's files.** Where a change was needed (stale UI text, error messages, the Windows `--check` line-ending quirk), it was written into `docs/ENGINE_HANDOFF.md` instead.
- **One exception, made explicitly by the human:** `web/lib/contracts/abis.ts` was regenerated with Person 2's own exporter on a scratch chain (7 Nov, `e375ff6`).

**Human design decisions recorded in the log** (each one overrode or chose between AI proposals):
- **28 Oct:** lot and tick sizes instead of the AI's `AmountTooSmall`.
- **28 Oct:** one shared fill budget for stop triggering, instead of the AI's per-activation budget.
- **28 Oct:** the internal `bookSeq` for time priority (O1).
- **1 Nov:** pull escrow before matching (the documented CEI deviation).
- **2 Nov:** keep the crossed-book behaviour and document it (O4).
- **2 Nov:** keep `MAX_*` at 10 and 100 (O2).
- **7 Nov:** auto-cancel and refund an activated stop that cannot enter the book (issue 006, option (a) of four).
