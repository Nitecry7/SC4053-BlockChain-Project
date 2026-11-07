# Fresh-clone check (8 Nov, after `engine-final`)

**Method.** The README was followed as a marker would follow it:
- clone of `main` at `a220ee2` into an empty scratch folder
- Quickstart steps 1 and 2, then "Deploy and export"
- the command-reference checks

**Environment:** Windows 11 with Git Bash (the README targets WSL Ubuntu), Foundry 1.8.6 (the README lists 1.9.0), Node 26.13.0 and npm 11.20.0.

**Deviations, both deliberate:**
- the scratch Anvil ran on **port 8546**, not 8545, so no existing chain was touched
- the app was served on port 3999 with `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`

Anvil and the dev server were stopped afterwards.

| Step (README) | Command | Result |
|---|---|---|
| Clone | `git clone https://github.com/Nitecry7/SC4053-BlockChain-Project.git` | OK |
| Submodules | `git submodule update --init --recursive` | **Failed on Windows:** `Filename too long` in OpenZeppelin's *nested* `lib/erc4626-tests` (the scratch path was 175 characters). forge-std v1.17.0 and OpenZeppelin themselves checked out. With `git -c core.longpaths=true submodule update --init --recursive`: OK. Not an issue on WSL or with a short Windows path |
| Build | `cd contracts && forge build` | OK: 64 files, about 48 s (lint warnings only) |
| Contract tests | `forge test` | **335 passed, 0 failed, 0 skipped** (27 suites, 709 s, invariant suite included) |
| Front-end dependencies | `cd web && npm ci` | OK, about 2 min. npm 11 skipped install scripts for optional native packages; `npm audit` advisories were reported (informational) |
| Front-end unit tests | `npm test` | **410 passed, 48 skipped** (gated real-chain and browser suites), the same as Person 2's record |
| Types, lint, build | `npm run typecheck`, `npm run lint`, `npm run build` | All exit 0; 8 routes built |
| Pre-deploy check | `scripts/check-local.sh` (with `RPC_URL` on 8546) | As documented for a fresh chain: "NO contract code … Only now is a deployment needed" |
| Deploy | `forge script script/Deploy.s.sol:Deploy --rpc-url … --broadcast --unlocked --sender $DEPLOYER` | OK: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, market `0xCafa…052c` |
| Export | `node contracts/script/export-web.mjs --rpc-url …`, then `--check` | OK: "up to date". The regenerated `abis.ts` and `deployments.ts` differ from the committed files **only in line endings** (`git diff --stat` empty), so the committed ABI matches `engine-final` |
| App plus final check | `npm run dev` equivalent, then `scripts/check-local.sh` | App HTTP 200; **"Result: ready. 0 warning(s)"** |

## Fixed (engine section of the README, Person 1)
- **Test timings:** added the first-run compile time, the full-suite time (335 tests, about 12 min) and a realistic deep-profile time.
- **Windows long-path note:** for the submodule step.

## For Person 2 (their README sections; not edited)
1. **Quickstart step 2:** `--recursive` pulls OpenZeppelin's nested test submodules (`erc4626-tests`, `halmos-cheatcodes`, a second forge-std), which the build does not need. On Windows they can hit the path limit. Consider `git submodule update --init` (non-recursive, enough to compile; not verified here), or a Windows note.
2. **Command reference:** `forge test` "Observed … `185 passed`" is stale; it is now **335 passed**.
3. **Feature overview row "Cancel, batch matching, stop-limit: Not implemented … still `revert()`" and "Implemented and pending":** stale for the engine. The engine functions are implemented on `main`; only the UI is pending.
4. **Tool table:** lists Foundry 1.9.0. The engine was built and checked with 1.8.6, and both work here; consider "1.8.6 or newer".
5. **MetaMask section** names account 0 "Alice" and account 1 "Bob". `docs/VIDEO_PLAN.md` uses accounts 1 and 2, which start with exactly 10,000 tokens. Pick one convention for the video.
6. **`export-web.mjs --check` on a Windows checkout** (`core.autocrlf=true`) reports `deployments.ts` out of date because of CRLF line endings. It passed here only because the files had just been regenerated with LF. Already in `docs/ENGINE_HANDOFF.md`.
