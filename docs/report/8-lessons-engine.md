# 8. Lessons Learned (engine)

Fits Person 2's draft section 8. Every example below is from the prompt log or an issue file.

## Where the AI excelled
- **Finding specification gaps before code existed.** In planning it listed seven concrete gaps (a) to (g), from missing token validation to an unbounded trigger search. Most of its fixes were adopted: the A5 refund rule, `requiredQuote`, and sorted stop lists.
- **Volume and rigour of adversarial tests, once asked.**
  - Reentrancy at every transfer point, with a configurable hostile token.
  - View spies that pin CEI ordering.
  - Exact-balance assertions to the wei.
  - 245 engine tests, plus an invariant suite with an independent reference model.
- **Independent review as a separate agent.** Fresh subagents with no session context repeatedly found what the authoring session missed:
  - the second CEI deviation (issue 002)
  - surviving matching mutants (issue 004)
  - the zero-address edge (issue 005)
  - the stop-trigger denial of service (issue 006)
  - tautological ghost variables in its own invariant suite
- **Reproducing and proving fixes.** Every logged issue has failing-then-passing output, produced in the session (for example, issue 006: 3 FAIL `BookTooDeep()` on the old line, then 3 PASS).
- **Tooling around the work.** A mutation script, scratch-chain deployment that kept everyone's local chain records intact, regeneration of the frontend ABI with the other teammate's own exporter, and detection of a Windows line-ending quirk in that exporter's check.

## Where the AI failed
- **It wrote tests from the prompt's list, not from "what would still pass if the code were wrong"** (issue 004). Green suites looked stronger than they were. The same pattern recurred:
  - A Phase 7 regression test for issue 004 could not fail on the original bug.
  - The first invariant suite's ghost flows were tautological: they summed the same Transfer events that move the balances.
- **It documented hazards instead of enforcing them, and underrated them.**
  - `_unlink`'s precondition was left as a comment (issue 001).
  - The stop-activation revert was described as an accident, but a 102-wei attacker could exploit it (issue 006).
- **Local reasoning about a global property.** CEI was reasoned for one external call at a time (issue 002). The same formula was written two ways with different overflow ranges (issue 003).
- **Assumptions about defaults.** It assumed `trader != msg.sender` rejects unknown IDs, forgetting the zero address (issue 005).
- **Wrong status claims, caught by its own later checks or by the human:**
  - It labelled a gas test "worst case" without checking that refunds happened (Phase 3b).
  - It reported the deep invariant run as dead, because a process listing missed it. It was alive and was corrected before merging (Phase 7).
- **Process slips with real consequences:**
  - Stopping a background mutant run left an orphan script swapping mutants into the source for about 20 minutes. Two suites then failed, and the AI had to diagnose that it was not an engine bug.
  - Shell quoting and `git merge -F -` errors, which ran nothing.
  - Rare, but each one cost time and needed honest reporting.

## What made the difference (recommendations)
1. **Specification files as the contract, read every session:** CLAUDE.md, SPEC, a frozen interface and per-phase prompts. The frozen interface stopped the AI from "fixing" problems by inventing ABI. It had to solve them inside the agreed surface (issues 001, 006).
2. **Separate the author from the reviewer.** Use a fresh agent, give it the code and a checklist, not your conclusions, and make it read-only. Every high-severity finding came from this.
3. **Demand failing-then-passing evidence, and mutants.** "Tests pass" was repeatedly insufficient. A test is only trusted once it has been shown to fail on the bug it targets.
4. **Make the human the decision point for design trade-offs.** Lot and tick sizes, the shared budget, `bookSeq`, keeping the crossed-book behaviour, and the issue 006 option were all human decisions. The AI's job was to surface the options and the evidence.
5. **Log everything, including the AI's mistakes.** The prompt log was the memory across sessions and is the basis of this report. "Never claim something was run unless you ran it" in CLAUDE.md caught several near-misses.
6. **Treat background processes and shared state as hazards.** Run destructive tools (mutation) in isolation, verify the source against HEAD after every run, and keep long evidence runs in a separate copy.
