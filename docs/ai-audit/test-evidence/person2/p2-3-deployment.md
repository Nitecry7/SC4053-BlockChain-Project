# P2-3 evidence: deployment script and ABI export

Date: 2026-11-05. Branch `faheem` at `ccaa5fc` plus uncommitted P2-3 files. Environment: WSL2, forge/anvil/cast 1.9.0, Node 26.13, solc 0.8.24, OpenZeppelin v5.7.0, Slither 0.11.6.

**Scope of this evidence.** Automated tests, plus commands I ran by hand with `forge`, `anvil` and `cast` on scratch Anvils (ports 8546 and 8547, chain 31337 unless stated). **No MetaMask, browser or UI verification was performed.** The project owner's own Anvil on port 8545 was never deployed to: its block number stayed at 0 whenever I checked, and its process (PID 138485) was never touched. Seeding the market through MarketFactory is a user-authorized integration decision. Person 1 has not reviewed it.

## Foundry suite
`cd contracts && forge test --root .` final line, the same on three consecutive runs: `Ran 12 test suites in 5.85s (21.45s CPU time): 185 tests passed, 0 failed, 0 skipped (185 total tests)`. That is the 169-test P2-2 baseline plus 16 `DeployTest` tests, with no regressions.

`DeployTest` covers: distinct addresses with code; NTU and SGDx metadata, 18 decimals and 1,000,000e18 supply; holder and wallet balances; the TokenFactory registry; the market registered in both orientations; the market's tokens and the 1e18/1e9/1e9 constants; **an approval and the SPEC section 3 trade on the deployed market**; code sizes against EIP-170 and EIP-3860; the default wallets; custom and empty wallet lists; zero, holder and duplicate wallets rejected; a wrong `holder` failing a post-check; `run()` reverting `WrongChain` for chain ids 1 and 11155111; **`run()` on the broadcast path** (through a harness that stands in for the node's chain id) funding from the explicit deployer; and `run()` refusing a node that reports another chain id even when `block.chainid` says 31337.

## Node suite
`node --test contracts/script/export-web.test.mjs`: `tests 21, pass 21, fail 0`. It covers address validation; broadcast parsing on a **synthetic** fixture (the shape matches a real Forge file observed on Anvil, every value is made up), including a wrong chain, a missing or duplicated factory, a bad address, a missing or failed receipt, a pending transaction and a garbled block number; argument parsing; deterministic rendering with no timestamp or block hash; `abis.ts` imported by Node (types stripped) and deep-equal to all four Foundry artifacts; the frozen-interface check (every `IOrderBook` item appears in the exported `OrderBook` ABI); immutable masking and bytecode matching; **`collectDeployment` against an in-memory fake chain** (healthy chain, wrong chain id, restarted chain with the block missing or with a different hash, missing code, bytecode that differs for each contract, differing OrderBook immutables accepted, no markets, the opposite-orientation market refused, registry and token cross-checks, an incomplete broadcast); and `applyFiles` write and `--check` behaviour.

## Mutation checks (originals restored each time, `diff` clean)
`Deploy.s.sol`:
| Mutant | Result |
|---|---|
| D1 market created with swapped tokens | caught by the script's own post-check (fails `setUp`) |
| D2 chain guard (`block.chainid`) removed | caught: `test_run_revertsOffTheLocalChain` |
| D3 SGDx never distributed | caught by the script's own post-check (fails `setUp`) |
| D4 duplicate wallets allowed | caught: `test_deploy_rejectsZeroWalletHolderAsWalletAndDuplicateWallets` |
| D5 `totalSupply` post-check removed | **survived**. Equivalent mutant today: `TokenFactory` cannot mint a different supply than requested. Kept as defence-in-depth |
| S1 `startBroadcast` from the wrong account | caught: `test_run_broadcastsFromTheDeployerAndFundsDefaultWallets` (**survived before the review**) |
| S2 node chain-id check removed | caught: `test_run_revertsWhenTheNodeReportsAnotherChainEvenIfBlockChainidSaysLocal` |
| S3 wrong holder passed in `run()` | caught: the same broadcast test |

`export-web.mjs`:
| Mutant | Result |
|---|---|
| E1 block-hash comparison flipped | caught by 6 tests (**survived before the review**) |
| E2 base and quote swapped in the render | caught: `renderDeployments` test (**survived before the review**) |
| E3 `--check` comparison inverted | caught: `applyFiles` test (**survived before the review**) |
| E4 pending-transaction check removed | caught by 2 tests |
| E5 factory bytecode check removed | caught |
| E6 seed-market check removed | caught |
| E7 receipt-status check removed | caught |
| E8 immutables not masked | caught by 5 tests |

Before the review, the interface-subset test had also been sabotaged once (`placeLimitOrder` removed from the exported ABI) and failed as it should.

## Real-chain checks (by hand, `forge`/`anvil`/`cast`)
1. **Expected deterministic addresses** (`cast compute-address`, deployer nonces 0 and 1): TokenFactory `0x5FbDB2315678afecb367f032d93F642f64180aa3`, MarketFactory `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`.
2. **Dry run** (`forge script script/Deploy.s.sol:Deploy --root . --rpc-url http://127.0.0.1:8546 --unlocked --sender 0xf39F…2266`): `Script ran successfully`, `SIMULATION COMPLETE`, chain height still 0.
3. **Broadcast** (same command plus `--broadcast`): `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, 11 transactions (2 creates, 3 calls, 6 transfers). No private key was supplied.
4. **On-chain state** (`cast call`): NTU and SGDx both 18 decimals and 1e24 supply; `market.baseToken()` = NTU, `quoteToken()` = SGDx; `MarketFactory.marketCount` 1, `getMarket(SGDx, NTU)` returns the market; `TokenFactory.tokenCount` 2, `isFactoryToken(NTU)` true; `PRICE_SCALE`/`LOT_SIZE`/`TICK_SIZE` = 1e18/1e9/1e9. Balances: deployer 970,000 of each token; accounts 1 to 3 each 10,000. Runtime code sizes read from the chain: TokenFactory 4,654 B, MarketFactory 8,358 B, OrderBook 6,325 B, equal to `forge build --sizes`.
5. **Real approval and trade** (`cast send --unlocked`, the SPEC section 3 worked example) on that first scratch chain, discarded afterwards:

   | Step | Block | Gas | Transaction hash |
   |---|---|---|---|
   | account 1 approves 10 NTU | 12 | 46,367 | `0x6fe7a6791d885326c287dfba5ecb75eef0034c094284396da0b67b0ce45b9585` |
   | account 1 places sell 10 NTU @ 2.0 | 13 | 303,225 | `0x4ef19c58c26b518c820eec4512531c11d2d88c0f5c29f3ed17ccf0b432760728` |
   | account 2 approves 8.8 SGDx (`requiredQuote`) | 14 | 46,367 | `0x57502bb4767b181f398b5dd98112cac298bd26fa057d29e5461d94c0e3bcdd87` |
   | account 2 places buy 4 NTU @ limit 2.2 | 15 | 373,361 | `0x5c1ce91b164a2773830927b8ccaf9669f4f4e597c5e0c302bf4816ec7de76f78` |

   Every transaction returned status 1. Resulting balances: seller 9,990 NTU and 10,008 SGDx; buyer 10,004 NTU and 9,992 SGDx (paid 8, refunded 0.8 of the 8.8 escrow); market 6 NTU and 0 SGDx; `lastTradePrice` 2e18; order 1 `PartiallyFilled` with 4e18 filled, order 2 `Filled`. The `Trade` log data decodes to price 2e18, base 4e18, quote 8e18. These hashes belong to a throwaway chain that no longer exists, so a reader cannot look them up. They record that the run happened.
6. **Exporter, first version**: wrote the files; `--check` passed; a re-run was byte-identical; Node imported both generated files and each ABI deep-equalled its artifact (TokenFactory 10 entries, DemoToken 18, MarketFactory 7, OrderBook 38).
7. **Redeploy on the same, non-fresh chain**: new addresses (deploy block 16). `--check` before re-exporting exited 1 with `out of date: deployments.ts`, then the exporter picked up the new deployment.
8. **Stale chain, restart without redeploy**: the exporter exited 1 and wrote nothing. Its first message was misleading (`cast block failed (is Anvil running ...)`). **A real defect, fixed.** It now reads `stale deployment: block 16 does not exist on this chain (height 0). The chain was restarted or replaced; run the deploy script again`.
9. **Stale chain, restart then advance** (`anvil_mine 20`): the exporter exited 1 with `stale deployment: block 16 on this chain is 0xe17a…, but the broadcast file recorded 0xe8b1…`, and wrote nothing.
10. **Other failures**: RPC down, `--rpc-url file:///etc/passwd` and `--chain-id abc` each exit 1 with a clear message.
11. **After the review fixes** (below), on the live scratch chain: the new exporter, including the bytecode, completeness and seed-market checks, passed on a genuine deployment, with OrderBook's immutables masked.
12. **Chain-guard bypass** (finding 1): against `anvil --chain-id 1`, `forge script … --broadcast` fails with `WrongChain(1)`, and so does the same command with `--chain 31337`. The node height stayed 0, so nothing was sent. The reviewer had shown this exact command broadcasting 11 transactions before the fix.
13. **Custom environment** on a fresh chain: `DEPLOYER` = account 1 and `DEMO_WALLETS` = accounts 2 and 4. Account 1 held 980,000 NTU, accounts 2 and 4 held 10,000 each, and the unlisted accounts 0 and 3 held 0. The exporter accepted this non-default deployment (to a scratch output directory).
14. **Reproducibility across fresh chains**: a deployment on a third fresh chain, then the exporter, regenerated `abis.ts` and `deployments.ts` **byte-identical** (`sha256sum -c`) to the previous fresh chain's files, and `--check` passed. Before the fix, `deployBlockHash` differed between fresh chains because blocks include a timestamp.

## Independent review (read-only Opus subagent, fresh context)
Its runs: 183 Foundry tests and 10 Node tests passed on the code it reviewed. It made no repository edits and used its own Anvil on a different port.
- **Medium, reproduced: the chain guard could be bypassed** with Forge's `--chain 31337` (finding 1). **Fixed**: `run()` also asks the node (`eth_chainId`). Verified by items 12 and the new unit test.
- **Medium, reproduced: the exporter accepted a partial broadcast** (an interrupted `--slow` run with pending transactions and an unfunded wallet) (finding 2). **Fixed**: nothing pending, one receipt per transaction, every status successful. Unit-tested, and mutants E4 and E7 are caught.
- **Low-Medium: ABIs were not tied to the deployed bytecode** (finding 3). **Fixed**: deployed code must equal the build artifacts, immutables masked. Mutants E5 and E8 are caught.
- **Low: "the seed market is the factory's first" was assumed** (finding 4). **Fixed**: the market must come from the first two tokens issued, base first (E6).
- **Low: no test of `run()`'s broadcast path** (finding 5). **Fixed**: harness tests; mutants S1 to S3 caught.
- **Low: no test of `collectDeployment` or `--check`** (finding 6). **Fixed**: fake-chain tests and `applyFiles` tests; mutants E1 to E3 caught. Two misleading test titles were also corrected.
- **Low, reproduced: `deployments.ts` was not reproducible** because of `deployBlockHash` (finding 7). **Fixed**: removed from the output. The exporter still compares it with the broadcast file at export time. Item 14.
- **Info: robustness and wording** (findings 8 and 9). **Fixed**: malformed JSON, a bad block number and unexpected `cast` output now give `export-web:` messages. Error messages print only the RPC URL's scheme and host. Docs: Node version corrected, "Verified" reworded, the smoke-trade variables explained, and the MetaMask nonce advice labelled as untested.
- **Claims the reviewer checked and found sound**: no secrets anywhere (including Forge's cache files); no injection, path traversal or unsafe parsing in the exporter, including hostile token names containing quotes, backticks and `${}`; generated `abis.ts` byte-identical to the artifact render; the explicit-deployer design.

One of my own fixes introduced a mistake that I caught by running the suite: I added a `run()` test that set process-wide environment variables, and its comment claimed they were cleared afterwards. They were not, and another test then read them and failed. I removed that test and checked custom `DEPLOYER` and `DEMO_WALLETS` on a real chain instead (item 13).

## Other checks
- `forge fmt --root . --check script/Deploy.s.sol test/Deploy.t.sol`: exit 0 (after `forge fmt` on those two new files only).
- `forge build --root . --sizes`: DemoToken 1,786 B, TokenFactory 4,654 B, OrderBook 6,325 B, MarketFactory 8,358 B runtime (limit 24,576 B). Unchanged from P2-2.
- Slither on `script/Deploy.s.sol`: 6 results, all `calls-loop` (the demo-wallet transfer and balance loops). Triage: accepted. They concern the deployer's own wallet list in a local script, not deployed contract code.

## Limits
- No MetaMask or UI verification. Everything above used tests, `forge`, `anvil` and `cast`.
- The script's post-checks run against the simulated state under `--broadcast`. The exporter's chain checks and the `cast` reads above are what confirm the live chain.
- `web/lib/contracts/deployments.ts` is only valid for a chain deployed the same way (deployer at nonce 0). It is byte-identical on every fresh Anvil.
- Person 1 has not reviewed the factory-seeded market, and the deployed `OrderBook` ABI has unnamed parameters on its four unimplemented functions (see `docs/DEPLOYMENT.md`).
- The exporter's bytecode check ties exports to the current `contracts/out`. After an engine change, redeploy and re-export, and re-check sizes.
