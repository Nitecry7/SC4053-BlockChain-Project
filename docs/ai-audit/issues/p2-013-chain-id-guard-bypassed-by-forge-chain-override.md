# Issue P2-013: the deployment script's chain-id guard could be bypassed with Forge's `--chain` override

- **Date found and fixed:** 2026-11-05 (P2-3, deployment script and ABI export). **This record was written afterwards, on 2026-11-06 in P2-8A.1** (finding I-5 of the P2-8A audit); it documents a defect that was already found and fixed, it is not a new discovery.
- **Phase:** P2-3. **Model that wrote the original code:** not recorded in the P2-3 log entry (the P2-3 session was Person 2's AI-assisted run; the independent reviewer was a read-only Opus subagent).
- **Found by:** the independent read-only review of P2-3 (reproduced by the reviewer against its own scratch node). Severity: **Medium** (the script could broadcast its transactions to a non-local chain; no funds were involved because the reviewer used a disposable test node and the script uses an unlocked local account, but the guard was the only protection against a wrong target).

## 1. Why the AI made the mistake
The AI claimed that `Deploy.s.sol`'s `run()` could not send transactions to a public network because it reverted with `WrongChain` unless `block.chainid == 31337`. It reasoned from how Forge usually behaves and never tried a hostile flag. In a Forge script `block.chainid` is the chain id Forge is *told* to use: `--chain 31337` sets it regardless of what the connected node reports, so the guard compared the flag with itself instead of with the node.

## 2. Why it is problematic
The guard existed to stop a script written for a local Anvil from broadcasting to another network. With `--chain 31337` against a node whose real chain id was 1, the guard passed and the reviewer's test node received **11 transactions**. A mistyped RPC URL combined with that flag (or a copied command) would have sent a deployment to the wrong network.

## 3. How it was fixed
`Deploy.s.sol` `run()` now also asks the node (`eth_chainId` through a Forge cheatcode) and reverts with `WrongChain(<node's id>)` if the node's answer is not 31337, in addition to the existing `block.chainid` check. The original check was kept (it still stops the plain case). Person 1's engine files were not touched.

## 4. Evidence the fix works
- **Reproduction of the original defect:** performed by the reviewer in P2-3 (11 transactions on a chain-id-1 test node). That run is described in `test-evidence/person2/p2-3-deployment.md` (findings and item 12); it was not repeated in P2-8A.1, because reproducing it needs the old code.
- **After the fix, recorded in P2-3:** against `anvil --chain-id 1`, `forge script ... --broadcast` fails with `WrongChain(1)`, and so does the same command with `--chain 31337`; the node height stayed 0 (item 12 of the evidence file).
- **Regression test:** `DeployTest.test_run_revertsWhenTheNodeReportsAnotherChainEvenIfBlockChainidSaysLocal` in `contracts/test/Deploy.t.sol`. **Re-run in P2-8A.1 (2026-11-06):** `forge test --match-test test_run_revertsWhenTheNodeReportsAnotherChain` gives `[PASS] ... Suite result: ok. 1 passed; 0 failed`. The full Foundry run in the same session: `185 tests passed, 0 failed, 0 skipped`.
- **Mutation check recorded in P2-3 (not re-run in P2-8A.1):** removing the node chain-id check (mutant S2) is caught by that test.
- Limit: the test and the evidence cover a local Anvil and a scratch node; nothing was run against any public network, by design.
