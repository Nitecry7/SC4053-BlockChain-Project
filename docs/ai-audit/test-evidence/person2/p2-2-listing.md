# P2-2 evidence: MarketFactory (token listing)

Date: 2026-11-05. Branch `faheem` at `0c4a383` plus uncommitted P2-2 files. Environment: WSL2, forge/anvil 1.9.0, solc 0.8.24 (foundry.toml), OpenZeppelin v5.7.0, Slither 0.11.6.

## `cd contracts && forge test --root .` (final line, verbatim)
`Ran 11 test suites in 5.48s (31.29s CPU time): 169 tests passed, 0 failed, 0 skipped (169 total tests)`

Final run, after the review fixes below. New: `MarketFactoryTest` 25 (includes 1 fuzz test, 1000 runs) and `MarketFactoryIntegrationTest` 14 = 39. Existing (unchanged): Person 1's 95 plus Person 2's P2-1 35 = 130. 130 + 39 = 169. The first full run, before the review, was 166 passed.

## Mutation check on `MarketFactory.sol` (original restored byte-for-byte afterwards, `diff` clean)
| Mutant | Result |
|---|---|
| M1 pair key not sorted | caught: 2 tests (`..revertsMarketExistsForReversedPair`, `test_getMarket_isOrderInsensitive`) |
| M2 `isMarket` never set | caught: 2 tests |
| M3 `new OrderBook(quote, base)` | caught: 12 tests |
| M4 `getMarkets` ignores remaining | caught: 5 tests |
| M5 wrong creator in `MarketCreated` | caught: 1 test |
| M6 no duplicate check | caught: 2 tests |

My first M3 run reported "0 failed". That was a flaw in my mutation script, not in the tests: `str.replace(..., 1)` changed the first occurrence of the text, which is in a doc comment, so no code was mutated. I noticed the result contradicted a test that asserts `baseToken()`, re-ran against the real code line, and M3 was then caught by 12 tests.

## Reentrancy argument (claim: no guard needed)
- Test `test_createMarket_tokenCannotReenterFromDecimals`: a token that calls `createMarket` again from inside `decimals()` cannot register a second market (exactly one market is registered, and `expectCall` shows the nested attempt happened: 2 calls with that calldata, the outer and the nested).
- Control `test_control_reenteringTokenSucceedsOutsideStaticContext`: the same token called normally (not through the constructor's STATICCALL) does re-enter and succeeds. So the attack is real and the constructor's STATICCALL is what blocks it.
- Side effect observed: the failing nested call in a static context consumes the gas forwarded to it (about 1e9 gas in the test). Only the caller of that `createMarket` pays.

## `forge fmt --root . --check` on the three new source and test files
Exit code 0 (after `forge fmt` on the same three files only).

## `forge build --root . --sizes` (EIP-170 runtime limit 24,576 B)
| Contract | Runtime B | Initcode B |
|---|---|---|
| MarketFactory | 8,358 | 8,387 |
| OrderBook (unchanged) | 6,325 | 6,974 |

## `slither src/MarketFactory.sol --solc-remaps "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" --filter-paths "lib/"`
`INFO:Slither:src/MarketFactory.sol analyzed (13 contracts with 102 detectors), 5 result(s) found`
All 5 are `naming-convention` notes on `IOrderBook.PRICE_SCALE`, `LOT_SIZE`, `TICK_SIZE`, `MAX_MATCHES_PER_TX` and `MAX_INSERT_SCAN` ("not in mixedCase"). Triage: accepted. They are Person 1's frozen ABI getter names (upper-case on purpose, matching the constants), not code in MarketFactory. Slither reports nothing in `MarketFactory.sol` itself.

## Independent review (read-only Opus subagent, fresh context)
Its own run reported 166 passed (before the fixes). Result: no High or Medium defects. **Claim 1 (no reentrancy guard needed) survived**: the constructor's only external calls are the two `decimals()` reads, which are STATICCALLs; a token created from its own constructor has no code yet; a later code swap cannot create a second market for a pair or corrupt the registry. The reviewer found no mutant the tests miss (it worked through about 20 by reading the tests, without running them). Findings and what was done:
- **Low, orientation squatting can make a pair unusable** (a low-value token as base can push the real price below one tick). Accepted as a limitation, documented in `docs/MARKET_FACTORY.md` with the UI and deploy-script mitigation. I added `test_market_orientationFixesTheSmallestTradablePrice` so the claim is executed and not only argued. The reviewer had marked its own arithmetic as unexecuted.
- **Low (latent), factory size grows with OrderBook's initcode.** Measured 8,358 B against 6,974 B. Documented. P2-3 should re-run `forge build --sizes` after engine changes.
- **Info, new ABI outside the frozen interface.** Already marked DRAFT pending Person 1, and nothing is wired into deployment or the UI.
- **Info, UI expectations** (read `baseToken()`/`quoteToken()`, page with a fixed limit, `creator` may be a contract). Added under "Notes for the UI".
- **Info, test quality.** The differential test ran only on an empty book, so I added `test_market_tradeSequenceMatchesADirectDeployment`, which replays a trade on both and compares the full order state, balances, last trade price and best ask. I also added `test_createMarket_customRevertDataFromTokenPassesThroughUnchanged`, which pins claim 2 for custom error data. `test_createMarket_factoryHoldsNoTokensAndIsNotTrader` and the `owner()` probe pass trivially (the factory has no such code) and should not be cited as evidence.

## Person 1 files
`git status` shows only new untracked files. `OrderBook.sol`, `interfaces/`, `CONTRACT_INTERFACE.md`, `SPEC.md` and all `OrderBook*` tests are unchanged.

## Limits
- Green tests prove only the listed scenarios, in this environment. No Anvil deployment, MetaMask or UI evidence exists for listing yet.
- Person 1 has not reviewed or agreed to MarketFactory. It is a draft for their review, not finalised.
- `test_market_runtimeBytecodeIdenticalToADirectDeployment` passes because both deployments use the same compiled OrderBook and the same token arguments. It does not prove anything about other compiler settings.
