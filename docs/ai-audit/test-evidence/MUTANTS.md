# Mutation checks for OrderBook.sol

`mutants.sh` (in this folder) applies one hand-written bug ("mutant") at a time to `contracts/src/OrderBook.sol`, runs the
test suite, and reports whether any test noticed. A **CAUGHT** mutant means the tests detect that bug. A **SURVIVED** mutant
is a gap: either add a test or explain why the mutant is equivalent (behaves identically to the real code).

## How to run
From the repo root, in Git Bash:

```bash
bash docs/ai-audit/test-evidence/mutants.sh "^(P5|G |Z |S1)"   # one phase's mutants plus the smoke set
bash docs/ai-audit/test-evidence/mutants.sh                    # the full set (slow: one compile per mutant)
```

- The argument is a regex matched against mutant names (`G`, `Z`, `S1`, `C1`-`C6`, `N1`-`N4`, `R1`-`R4`, `P5a`-`P5n`, ...).
- Fuzz tests are excluded for speed.
- Mutants match on code text, not line numbers. If the code changes and a pattern no longer matches, the mutant
  reports **NOT APPLIED**; update it rather than counting it as caught.
- The script backs up `OrderBook.sol` and restores it on exit, including after Ctrl+C. Check `git diff contracts/src`
  afterwards anyway.
- Per phase, run only that phase's mutants plus the smoke set. The full set runs once, in Phase 8.

## Results

| Date | Scope | Caught | Survived | Notes |
|---|---|---|---|---|
| 2026-11-07 | Phase 4: G, Z, S1, C1-C6, N1-N4, R1-R4 (17) | 16 | 1 | R4 is equivalent: lot and tick sizes make the recomputed buy refund equal `lockedQuote`. Before the review's test additions, C1, R1, R2 and R3 also survived |
| 2026-11-07 | Full set after Phase 5 implementation, before its review (31) | 30 | 1 | R4 again (equivalent). All 14 `P5*` mutants then in the script were caught |
| 2026-11-07 | Phase 5 after review: `^(P5\|G \|Z \|S1)` (20) | 19 | 1 | P5o and P5p (review M1, empty ask side) added with their tests and caught. They were not run before those tests existed, so the "survived before" claim rests on the reviewer's reasoning. P5q survives as an equivalent mutant: an empty bid side reads as price 0, which never crosses. Took 8 min |
| 2026-11-07 | Phase 6 after review and the issue 006 fix: `^(P6\|G \|Z \|S1)` (28) | 28 | 0 | P6a to P6y (25 stop-limit mutants) plus the smoke set. P6v and P6w came from the review (L1 and L2), and their tests were added before this run. P6x is the pre-fix code of issue 006. C1, C2 and R3 were rewritten for the new multi-line status check, and P6n for the new activation line; none of these four was run here. Took 13 min 54 s |
