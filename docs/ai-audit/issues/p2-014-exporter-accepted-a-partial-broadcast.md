# Issue P2-014: the ABI/deployment exporter accepted an incomplete (partial) broadcast as a finished deployment

- **Date found and fixed:** 2026-11-05 (P2-3, deployment script and ABI export). **This record was written afterwards, on 2026-11-06 in P2-8A.1** (finding I-5 of the P2-8A audit); it documents a defect that was already found and fixed, it is not a new discovery.
- **Phase:** P2-3. **Model that wrote the original code:** not recorded in the P2-3 log entry (the independent reviewer was a read-only Opus subagent).
- **Found by:** the independent read-only review of P2-3, reproduced with an interrupted `--slow` broadcast. Severity: **Medium** (the front end could be wired to a half-finished deployment; no contract logic was affected and no funds were at risk).

## 1. Why the AI made the mistake
The AI wrote that `export-web.mjs` writes nothing unless every check passes, without defining "every". It checked the chain id, the block hash and the contract addresses, but not that the deployment had finished: whether any transaction was still pending, whether every transaction had a receipt and whether every receipt was successful. The unit tests used a complete, synthetic broadcast file, so they never exercised an interrupted run.

## 2. Why it is problematic
An interrupted deployment (for example a pending transaction and an unfunded demo wallet) produced a broadcast file that looked valid. The exporter turned it into `abis.ts` and `deployments.ts`, so the app would show addresses and a market as if the deployment were complete while a transaction was still missing or had failed. The user would only find out later through confusing runtime errors.

## 3. How it was fixed
`contracts/script/export-web.mjs` (`parseBroadcast`) now refuses a broadcast that has any pending transaction, a transaction without a receipt, or a receipt whose status is not successful. It writes nothing in those cases. Person 1's files and the Solidity contracts were not changed.

## 4. Evidence the fix works
- **Reproduction of the original defect:** performed by the reviewer in P2-3 with an interrupted `--slow` run (pending transactions and an unfunded wallet); recorded in `test-evidence/person2/p2-3-deployment.md`. Not repeated in P2-8A.1 (it needs the old code).
- **Regression test:** `parseBroadcast refuses a broadcast that is pending, incomplete or has a failed transaction` in `contracts/script/export-web.test.mjs`. **Re-run in P2-8A.1 (2026-11-06):** `node --test contracts/script/export-web.test.mjs` gives `tests 21, pass 21, fail 0`, and that test is listed as passing.
- **Mutation checks recorded in P2-3 (not re-run in P2-8A.1):** removing the pending-transaction check (E4) and the failed-status check (E7) are each caught by the tests.
- Limit: the tests use a synthetic broadcast fixture shaped like a real Forge file seen on Anvil; the partial case on a real interrupted run was reproduced by the reviewer, not automated.
