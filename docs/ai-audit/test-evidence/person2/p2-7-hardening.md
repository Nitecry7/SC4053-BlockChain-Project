# P2-7 evidence: transaction-lifecycle hardening (Person 2)

Date: 2026-11-06. Environment: WSL, Foundry 1.9.0 (scratch Anvil on 8546), viem 2.57.16, Chromium 1252 via `playwright-core`, Sonnet 5.5 Medium. **All browser results use a MOCK wallet, not MetaMask.** Speed-up, cancel and replace were sent from Anvil's unlocked dev account to the node with the same nonce; the wallet's own buttons were not exercised. The user's Anvil (8545) and `next dev` (3000) were not touched; the exporter record hash was identical before and after the scratch deploy.

## 1. Measurements that decided the design (scratch Anvil, no-mining, scripts in the session scratchpad)
| Question | Result |
|---|---|
| Does viem find a replacement when only the original hash is known (what the app did)? | **No.** Repriced, cancelled and replaced-by-different-action were all reported as `WaitForTransactionReceiptTimeoutError` in three windows, including after the replacement was mined. |
| With sender and nonce (`replacement: {from, nonce, input, to, value}`)? | **Yes**, in all three: `onReplaced` fired with reason `repriced`, `cancelled`, `replaced` and the replacement's receipt. It fires only when the replacement is mined, not while it is pending. |
| What does a restart look like? | Genesis hash changed (`0xaa22da94...` to `0x5b304f88...`); block 3, seen before, was `BlockNotFoundError` afterwards; the new head was 1. |
| Does viem's block watcher notice? | **No.** Events before the restart: `[3]`; after the restart and a new block 1: none (the head is below the old one). |
| Why the first real-chain tests proved nothing | Mining the speed-up immediately meant no wait window started after the original was dropped; with `replacement` removed they still passed. Changed to keep the replacement pending across windows. |

## 2. Test results (this session)
| Check | Result |
|---|---|
| Unit, `npx vitest run` | 368 passed, 48 gated skipped (27 files passed, 3 skipped) |
| New unit files | `chain-reset.test.ts` (8), `order-runner.hardening.test.ts` (15). First run before the code: `10 failed \| 4 passed (14)`, all failures for the missing behaviour |
| Mutation checks (each restored afterwards) | 5 of 5 killed: no hash tracking (2 red), replacement fields not forwarded (2), unlisted tx treated as a reset (1), missing anchor block alone treated as a reset (1), replacement hash not surfaced (2) |
| Real chain, `trading` + `creation` + `hardening`, `--no-file-parallelism`, scratch 8546 | 48 passed (39 before + 9 new) |
| Real chain, `hardening` with replacement fields removed from `viemDeps` | `3 failed \| 6 passed` (repriced order, repriced approval, token creation), then `9 passed` after restoring |
| Browser `npm run e2e:hardening` | 8 passed, 0 failed (9 passed after the header test was added, section 5) |
| Browser regression `e2e` / `e2e:create` / `e2e:dashboard` | 13 / 14 / 13 passed |
| `tsc`, `eslint`, `npm run build` | clean |
| `forge test` | 185 passed |
| Exporter `node --test` | 21 passed |
| `scripts/check-local.sh` | ready, 0 warnings |
| `git diff --stat -- contracts CONTRACT_INTERFACE.md SPEC.md` | empty |
| `impeccable detect` on the two touched components | no findings (regex rules only; an undercount) |

## 3. What the real-chain and browser suites prove
- A re-priced order or approval that stays pending across several receipt windows is confirmed under its new hash, exactly one order exists, and the outcome reconciles with `getOrder`.
- A cancelled order fails as "cancelled" under the cancelling hash; no order exists and the NTU balance is unchanged. A replaced order fails as "replaced"; what the replacement did (an allowance) is what is on-chain.
- A speed-up that lands before the first lookup is **not** followed: the result is "not confirmed yet, the node no longer lists this transaction", no false success, no reset claim, and the order does exist on-chain (limitation documented).
- A transaction dropped by the node on an intact chain is reported as unlisted, not as a reset. A snapshot revert under a waiting transaction is reported as a reset with its evidence.
- In the browser: after `evm_revert` a notice states the evidence ("the chain head (block 16) is below block 18"), the Network card's block follows the real head, the notice can be dismissed, a healthy chain that keeps mining never shows it, and the notice fits at 390 px.
- Two markets on one chain: DTT/SGDx approves and escrows on its own order book (`allowance(DTT, NTU book) == 0`, factory allowance 0), and the NTU book stays empty.

## 4. Limits
- Mock wallet only; Test 10 in `docs/TESTING.md` is a procedure, not performed with MetaMask.
- Header overflow (found in this run, fixed afterwards, see section 5).
- Screenshots: `p2-7-screens/` (`order-speedup-*`, `order-cancelled-desktop`, `order-replaced-desktop`, `chain-reset-notice-*`). Failure screenshots from earlier red runs were removed by name; only the final green run's images remain.

## 5. Header overflow fix (follow-up)
Measured with Playwright Chromium and the mock wallet connected, before the fix: at 390 px the page overflowed by 5 px and at 375 px by 20 px. Row contents: menu button 20 px wide (a 40 px control crushed by flex shrink), brand 161 px, wallet chip 166 px, 16 px gaps and side padding; the row needs about 431 px.
Change (layout only): header gap and padding `gap-2 px-3` below 640 px (unchanged from `sm`), `shrink-0` on the menu button, wordmark `text-[1.1875rem]` below 640 px, the decorative wallet chevron hidden below 640 px (the address and avatar are intact; the button keeps its accessible name).
After: overflow 0 at 375, 390, 430, 768 and 1586 px; menu button 40 px; wallet control fully inside the viewport (right edge 363 of 375, 378 of 390); 768 and 1586 px measurements identical to before. Screenshots `p2-7-screens/header-375-connected.jpg`, `header-390-connected.jpg`, `header-768-connected.jpg`. New assertion in `e2e/hardening.e2e.mjs` ("header with a connected wallet fits at 375, 390, 768 and 1586 px"), 9 passed. Mock wallet, not MetaMask; the chip draws the app's own avatar and shortened address from the connected address, so its width does not depend on the wallet.
