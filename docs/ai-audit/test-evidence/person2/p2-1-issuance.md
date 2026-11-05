# P2-1 evidence: ERC20 issuance (DemoToken, TokenFactory)

Date: 2026-11-05. Branch `faheem` at `55fe657`. Environment: WSL2, forge/anvil 1.9.0, solc 0.8.24 (foundry.toml), OpenZeppelin v5.7.0, Slither 0.11.6.

## `cd contracts && forge test --root .` (final line, verbatim)
`Ran 9 test suites in 5.48s (19.63s CPU time): 130 tests passed, 0 failed, 0 skipped (130 total tests)`

(Re-run after the review fixes below. The first run, before the fixes, was 131 passed.)

Per suite: DemoTokenTest 11, TokenFactoryTest 20 (includes 3 fuzz tests, 1000 runs each), TokenOrderBookIntegrationTest 4 = 35 new tests. Existing Person 1 suites unchanged: Book 23, Place 22, Match 36, Reentrancy 4, PayoutViews 2, Constructor 8 = 95. 95 + 35 = 130.

## `forge fmt --root . --check` on the five new files
No output, exit code 0 (after `forge fmt` on the same five new files only).

## `forge build --root . --sizes` (EIP-170 runtime limit 24,576 B)
| Contract | Runtime B | Initcode B |
|---|---|---|
| DemoToken | 1,786 | 2,996 |
| TokenFactory | 4,654 | 4,683 |

## `slither src/<file>.sol --solc-remaps "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" --filter-paths "lib/"`
- `src/DemoToken.sol analyzed (8 contracts with 102 detectors), 0 result(s) found`
- `src/TokenFactory.sol analyzed (9 contracts with 102 detectors), 0 result(s) found`

## Independent review (read-only Opus subagent, fresh context)
Its own run of the suite reported 131 passed (before the fixes). Result: no High or Medium defects in either contract. Mutation reasoning: every mutant it tried was caught except `offset >= total` to `offset > total`, an equivalent mutant (same empty result). Findings acted on, all in my new test files:
- `test_noAllowance_...` used a bare `expectRevert()`. It now asserts `ERC20InsufficientAllowance(book, 0, 10e18)`.
- `testFuzz_getTokens_matchesRegistry` fuzzed `offset` over all of uint256, so most runs only hit the empty branch. `offset` is now bounded to `0..n+2`.
- `test_getTokens_middlePage` did not check `page[1]`. It does now.
- `test_createToken_failedAttemptWritesNothing` passed trivially, because the EVM rolls back state on any revert. It was deleted, not kept as evidence.
Findings recorded, not changed: the TokenFactory ABI is not in CONTRACT_INTERFACE.md (needs both teammates); supplies that are not multiples of 1e9 leave untradable dust; `isFactoryToken` proves provenance, not identity, and names and symbols can be duplicated or spoofed, so the UI must identify tokens by address; the 1e27 cap does not bound the engine's inputs in general; `test_noMintOrBurnEntryPoint` and `test_hasNoOwner` probe only a few selectors, so the no-hidden-mint guarantee rests on reading the 7-line  source.

## Limits
- A green run proves only the scenarios listed, in this environment. There is no Anvil deployment, MetaMask or UI evidence for R4 yet.
- Slither ran after the code was written, and its runs executed `forge clean`, which touched only the ignored `out/` and `cache/` directories.
- `forge build` still prints one `require-revert-in-loop` lint warning at `src/OrderBook.sol:202`. That is Person 1's file and is untouched.
