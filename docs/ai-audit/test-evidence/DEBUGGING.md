# Debugging the engine tests

Run every command from `contracts/` in Git Bash unless it says otherwise. If `forge` is not found, run `export PATH="$HOME/.foundry/bin:$PATH"` first.

## Run one thing

| What | Command |
|---|---|
| One test by name | `forge test --match-test test_issue006_unplaceableStopNoLongerBlocksTriggers` |
| One file | `forge test --match-path test/OrderBook.Stop.t.sol` |
| One contract in a file | `forge test --match-contract OrderBookStopReentrancyTest` |
| Everything except the slow invariant suite | `forge test --no-match-path "test/invariant/*"` (this also skips the reach test, which lives in the same folder) |
| Only the invariant suite | `forge test --match-path "test/invariant/*"` |
| Re-run only what failed last time | `forge test --rerun` |
| The deeper profile (fuzz: 10,000 runs; invariants: 1,000 runs at depth 128) | `FOUNDRY_PROFILE=deep forge test --match-path "test/invariant/*"` |
| Quick invariant smoke run | `FOUNDRY_INVARIANT_RUNS=10 FOUNDRY_INVARIANT_DEPTH=32 forge test --match-path "test/invariant/*"` |
| Per-selector call and revert counts for an invariant run | add `FOUNDRY_INVARIANT_SHOW_METRICS=true` |

## Read a trace
Use `-vv` for logs (`console2.log` and the handler's `SUMMARY` lines), `-vvv` for traces of failing tests, and `-vvvv` for traces of every test, including setup.

```bash
forge test --match-test test_trigger_sharedFillBudgetAcrossTheWholeCall -vvvv
```

How to read a trace:
- Each line is a call: `[gas] Contract::function(args)`. The lines below it are the calls it made, ending in `← [Return]` or `← [Revert] ErrorName()`.
- **Find the first `← [Revert]` from the bottom up.** That is where the failure started. Every line above it just propagates the revert.
- **Engine events appear as `emit Trade(...)`, `emit StopOrderTriggered(...)`, `emit OrderCancelled(...)`,** in the order they fired. CEI questions ("was the state changed before the transfer?") are answered by the order of `emit` against the token's `Transfer` lines.
- **`vm.prank` and `vm.expectRevert` appear as `VM::` calls.** A failing `expectRevert` shows the error that actually happened next to the one expected.
- **Custom errors decode by name** when the selector is known (for example `BookTooDeep()`). An unknown selector shows as hex, and `cast sig "Name()"` gives the selector to compare.

## Replay a failing fuzz or invariant case
Foundry saves the counterexample and replays it first on the next run:
- fuzz failures: `contracts/cache/fuzz/failures`
- invariant failures: `contracts/cache/invariant/failures/<TestContract>/<invariant_name>`

Both folders are gitignored.

1. **Run the failing invariant alone with traces:**
   ```bash
   forge test --match-test invariant_solvency -vvvv
   ```
   The output lists the shrunk call sequence as `[Sequence]` lines: `sender`, `addr` (the Handler), and `calldata=... args=[...]`. The trace of the call that broke the invariant follows.
2. **Read the sequence as handler actions.** Each line is `Handler.placeLimit(actorSeed, sideSeed, priceSeed, amountSeed)`, `cancel(actorSeed, orderSeed)`, `matchOrders(actorSeed, maxSeed)`, `placeStop(...)`, `triggerStops(actorSeed, maxSeed)` or `burst(sideSeed, priceSeed, countSeed)`. Some seed mappings are simple:
   - actor = `actors[seed % 5]`
   - price = `1.8e18 + (seed % 5) * 0.1e18`
   - amount = dust (1e9) when `seed % 8 == 0`, else `(1 + (seed >> 3) % 15) * 0.5e18`

   Others depend on state: a stop's trigger price depends on `lastTradePrice`, and `cancel` picks among the actor's active orders. So don't rewrite the sequence by hand. Replay the calls as in step 3.
3. **Turn it into a unit test:** paste the handler calls, in order, into a test that deploys a `Handler` (as `OrderBookInvariantReachTest.setUp` does). After each step, call `this.checkAllExternal()`, or `_checkAll()` inside an external chunk, to find the first bad step. Run that test with `-vvvv`.
4. **Reproduce a run exactly:** pass `--fuzz-seed <n>` to make the random sequence repeatable.
5. **Start fresh:** after a fix, delete the matching folder under `cache/invariant/failures/` (or `cache/fuzz/failures/`). Otherwise the old counterexample is replayed first. That is useful as a regression check, but it is not a new random run.

**Handler violations.** `invariant_handlerChecks` fails when the handler recorded a violation during a call. Examples:
- a revert an action should never hit
- a `BookTooDeep` or auto-cancel without more than `MAX_INSERT_SCAN` orders ranked ahead
- a `Trade` not at the maker's price, or with the wrong cost
- a cancel refund that differs from the reference model
- a return value that disagrees with the events
- `lastTradePrice` not equal to the last `Trade` price

The failing output prints `violation: <text>` (from `lastViolation`). If a revert was involved, it also logs the raw revert data. Compare its first 4 bytes with `cast sig "ErrorName()"`, or decode it with `cast decode-error <data> --sig "ErrorName()"`. `invariant_ledgerMatchesBalances` failing means a payment went to the wrong address or had the wrong amount. Compare `handler.netBase` and `handler.netQuote` for each participant with the real balances.

## Run a single mutant
From the **repo root**:
```bash
bash docs/ai-audit/test-evidence/mutants.sh "^P6x"            # one mutant by name
bash docs/ai-audit/test-evidence/mutants.sh "^(P6|G |Z |S1)"  # a phase's set plus the smoke set
```
The script restores `OrderBook.sol` on exit, but check `git diff contracts/src` afterwards. To see *why* a mutant is caught:
1. Apply its sed edit by hand to a copy of `src/OrderBook.sol`.
2. Run the test named in the script's `e.g.` column with `-vvvv`.
3. Restore with `git checkout -- src/OrderBook.sol`, and only if the file had no other uncommitted changes.

See [MUTANTS.md](MUTANTS.md) for the results so far.

**Stopping a long mutant run safely.** Let a mutant run finish if you can. Stopping a background run can kill only the outer shell and leave `mutants.sh` running as an orphan, still swapping mutants into `OrderBook.sol`. This happened once during Phase 7. Before running anything else, check that nothing is left: `ps -ef | grep mutants.sh`. If something is, kill those processes. The script's exit trap then restores the file. Finally, confirm the source is back with `git diff --quiet HEAD -- contracts/src`.

## The invariant call summary
The handler counts each path it takes: crossing fills, cap hits, cancels by status, batch fills, stop activations, shared-budget exhaustion, and issue 006 auto-cancels. A `duster` posts bursts of one-lot makers so that cap hits and crossed books are common. A `flooder` rests 101 one-lot bids at 1.7 in setUp, outside the 1.8 to 2.2 price cluster, so any buy stop limited at 1.7 takes the auto-cancel path. `afterInvariant` prints the counts as `SUMMARY` lines with `-vv`. Foundry resets state between runs, so the printed summary is the **last run's** counts.

Two things cover all runs instead:
- `FOUNDRY_INVARIANT_SHOW_METRICS=true` prints calls and reverts per handler function, summed over all runs.
- `OrderBookInvariantReachTest.test_handlerReachesEveryPath` drives the same handler for 600 seeded steps with uniform weights (like the fuzzer), checks every invariant every 25 steps, and fails if any path's counter is still 0.
