# 3. Specification Engineering & Prompt Logs (engine)

## Specification files given to the AI
| File | Role in each session |
|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | Loaded automatically every session: rules, ownership, engine invariants, working rules |
| [`SPEC.md`](../../SPEC.md) | The behaviour contract. Every phase prompt says "per SPEC.md section N". Accounting rules A1 to A8 are cited by name in code comments and tests |
| [`CONTRACT_INTERFACE.md`](../../CONTRACT_INTERFACE.md) | Frozen 1 Nov. Prompts say "do not add any error, event or function that is not in the interface". It forced design choices: for example, reusing `OrderNotActive` for the `_unlink` guard (issue 001), and cancel-and-refund via the existing `OrderCancelled` (issue 006) |
| [`docs/ENGINE_PHASES.md`](../ENGINE_PHASES.md) | The phase table (goal, files, functions, required tests, acceptance), plus the verbatim phase prompts. Required tests found in later reviews were added to the rows of future phases (for example, "`matchOrders` must also unlink a filled taker", added to Phase 5 during the Phase 3a review) |

## How prompts were structured
Each phase prompt:
- names the SPEC sections
- lists the exact functions and the required tests, including the adversarial ones (re-entry at each transfer, boundary values, mutation of the guard)
- states what must NOT change
- ends with the standard finish: independent review, fixes with regression tests, `/log-issue` for real flaws, mutants, build, test and fmt with the real output, log, commit and merge

## Representative prompt chains

**1. Phase 0 planning (plan mode, 28 Oct): the AI found gaps, and the human corrected two of its fixes.**
- **Prompt:** read the plan and explore the repo without editing, then propose a phase plan and list the open decisions.
- **AI output:** seven spec gaps (a) to (g).
  - It filled some well: `InvalidTokens`, the A5 refund rule, the `requiredQuote` view, and the `StopOrderTriggered`-only event.
  - It got two of them wrong:
    - `AmountTooSmall` against dust only guards the *total* cost, not each partial fill.
    - A per-activation trigger budget multiplies worst-case gas.
- **Human response:** lot and tick sizes of 1e9, which make every fill cost exact, and one shared fill budget.
- **Found while writing SPEC:** ordering ties by order ID would let a late-triggered stop jump the queue, so the internal `bookSeq` was added (O1).

**2. Phase 3a (2 Nov): implementation, then an independent review, then fixes.**
- **Prompt:** escrow before matching, a single `_settleFill`, and match tests with a reentrant mock token.
- **The review** returned 11 findings, including a second undocumented CEI deviation (issue 002), an overflow (issue 003), and three surviving matching mutants (issue 004).
- **Each one went back to the AI as a fix-and-prove task:** "fix with a regression test, show the failing then the passing output".

**3. Phase 6 (7 Nov): the review found a design flaw, the human chose the fix, and the AI implemented and proved it.**
- **The review's H1:** a 102-wei stop plus dust bids blocks every trigger.
- **The AI presented four options** with their trade-offs. The human chose auto-cancel and refund.
- **The AI then:**
  - implemented it
  - reproduced the bug on the old line (3 FAIL, `BookTooDeep()`)
  - showed the fix (3 PASS)
  - added mutants for the old behaviour (P6x) and for dropping the refund (P6y)
  - logged issue 006

**4. Phase 7 (7 to 8 Nov): a review of the AI's tests.**
- **The first invariant suite was green but weak.** The review found tautological ghost variables (H1), a regression test that could not fail on the original bug (M3), and that the fuzzer rarely reached the hard paths (H2).
- **The prompt back to the AI** was the review itself. The AI rebuilt the handler around an independent reference model, so that wrong-recipient payouts became detectable.
- **Mutants P7c to P7h prove the new suite's teeth:** the invariant suite *alone* catches them.

## Context management
- Long sessions relied on the prompt log, which the AI wrote and the human reviewed, as the durable memory between sessions. Each session starts by reading `CLAUDE.md`, SPEC and the log.
- When a session resumed after several days (7 Nov), the first task was a read-only recovery and sync. It covered uncommitted work, Person 2's 24 new commits, and a diff of the frozen files. No code was written until the state was reported back.
