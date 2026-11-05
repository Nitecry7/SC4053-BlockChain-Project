# Issue P2-005: A scratch deployment made the exporter report the developer's own chain as stale

- **Date:** 2026-11-05
- **Phase:** P2-5 setup (scratch Anvil for automated tests)
- **Found by:** Running `node contracts/script/export-web.mjs --check` against the developer's chain after a scratch deploy.
- **Severity:** Medium for the workflow, none for the chain. No on-chain state was touched. The tracked generated files were not changed.

## 1. Why the AI made the mistake
The P2-5 plan promised "no tracked file changes" because a fresh scratch chain yields the same deterministic addresses. That is true for the tracked files, but `forge script --broadcast` also overwrites the git-ignored `contracts/broadcast/Deploy.s.sol/31337/run-latest.json`, which the exporter compares with the chain's block hash. The AI checked what git would show and not what else the deploy writes.

## 2. Why it is problematic
The developer's `export-web.mjs --check` against their own Anvil began failing ("stale deployment"), which would send them to redeploy a chain that was fine.

## 3. How we fixed it
- Restored `run-latest.json` (and the matching cache copy) from the timestamped run whose recorded block-1 hash equals the developer's chain.
- Scratch deploys now redirect forge's output with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` (verified with `forge config`), and the procedure is documented in `docs/FRONTEND.md`.

## 4. Evidence the fix works
**Before (after the scratch deploy):**
```
export-web: stale deployment: block 1 on this chain is 0x453d3002…c9039c, but the broadcast file recorded 0x5646c813…427e78. The chain was restarted or replaced; run the deploy script again
8545 check exit=1
```
**After restoring:**
```
export-web: abis.ts, deployments.ts are up to date for chain 31337
8545 check exit=0
```
**A second scratch deploy with the redirect:** `run-latest unchanged: dceba043314d809c -> dceba043314d809c` and the check on 8545 still exits 0. The developer's chain stayed at block 11 throughout.
