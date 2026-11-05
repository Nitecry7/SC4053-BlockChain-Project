# P2-5 evidence: limit orders and the transaction lifecycle

Date: 2026-11-05. Branch `faheem` at `3aba573` plus uncommitted P2-5 files.
- **Model:** Sonnet 5.5 (Medium) planned and implemented. One fresh-context **Sonnet** subagent reviewed the trading code read-only. No Opus, no Haiku.
- **Environment:** WSL2 Ubuntu 26.04, Node 26.13, npm 11.20, Foundry 1.9.0.

## What was verified, and by what (read this first)
| Layer | Verified | NOT verified |
|---|---|---|
| Unit tests (node, no chain) | validation, allowance step, execution estimate, lifecycle reducer, runner with a **fake** chain and wallet, receipt decoding with **synthetic** logs, error mapping, wallet copy | anything on a real chain |
| Real chain: scratch Anvil, port 8546 | the same code against the deployed contracts, signing with Anvil's **unlocked dev accounts through viem** | MetaMask, a browser |
| Browser: Chromium against a production build on port 3100 | the UI end to end, with a **mock wallet** (`web/e2e/mock-wallet.mjs`) that forwards to the scratch chain | **MetaMask.** A screenshot or a pass here is not a MetaMask approval or trade |
| Manual MetaMask (Windows Brave, two accounts) | checklist written in `docs/FRONTEND.md` | **not run** |

Your Anvil on 8545 and your `next dev` on 3000 were never written to or restarted: block 11 before and after, the same PIDs, HTTP 200 on 3000, and `export-web.mjs --check` against 8545 passes. The scratch Anvil (8546) and the scratch server (3100) were mine and are stopped.

## Final gate results
| Command | Result |
|---|---|
| `npm test` (in `web/`) | `Test Files 16 passed | 1 skipped (17)`, `Tests 207 passed | 18 skipped (225)`. Baseline was 69, so 138 are new. The 18 skipped are the gated real-chain tests |
| `E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run lib/trading.integration.test.ts` | `Test Files 1 passed (1)`, `Tests 18 passed (18)` |
| `npm run e2e` (mock wallet, scratch chain, full run incl. the real 20 s escalation wait) | `13 passed, 0 failed`; no console errors and no failed responses (`results.json`) |
| `npm run typecheck`, `npm run lint` | no errors |
| `npm run build` | succeeds; routes `/`, `/markets`, `/tokens`, `/trade` static, `/tx/[hash]` dynamic |
| `cd contracts && forge test --root .` | `185 tests passed, 0 failed` (unchanged; no contract edited) |
| `node --test contracts/script/export-web.test.mjs` | `pass 21, fail 0` (unchanged) |
| `node contracts/script/export-web.mjs --check --rpc-url http://127.0.0.1:8545` | `up to date for chain 31337` |
| `impeccable detect --json` over `web/components` and `web/app` | `[]` (0 findings) |

### Safety guards of the real-chain suite (observed)
- `E2E_RPC_URL=http://127.0.0.1:8545 ...` -> `Error: Refusing to run: 8545 is the developer's own chain.` (8545 block unchanged).
- `E2E_RPC_URL=http://127.0.0.1:8546` without `E2E_ALLOW_MUTATE=1` -> `Error: Refusing to run: set E2E_ALLOW_MUTATE=1 ...`.
- With neither variable set the suite is skipped (`18 skipped`).
- Each test runs inside `evm_snapshot` / `evm_revert`.

## The SPEC worked example, on a real chain
Alice sells 10 NTU at 2 SGDx; Bob buys 4 NTU with a limit of 2.2. Verified by `trading.integration.test.ts` on the scratch chain and again through the UI by `trade.e2e.mjs`.

Measured balance changes (scratch chain, exact wei):
| | NTU | SGDx |
|---|---|---|
| Alice | -10.0 (escrowed) | +8.0 (paid at the maker price 2) |
| Bob | +4.0 | -8.0 net (8.8 escrowed, 0.8 refunded) |
| Order book | +6.0 (Alice's remainder) | 0 |

The decoded receipt gave: order id 2, one trade (maker #1, taker #2, price 2, 4 NTU for 8 SGDx), escrow pulled 8.8, **refund 0.8**. `getOrder`: Alice's order #1 partly filled (4 of 10, 6 locked); Bob's #2 Filled with nothing locked. `lastTradePrice` = 2. The ticket's estimate matched the chain on filled, traded, refund, remaining and locked.

Transaction hashes recorded by that run (`E2E_EVIDENCE_FILE`): Alice's order `0xfcdd15bc74261ab2fcffcee2a5300b843d449f803d10a2d34419e710e6c573b7`, Bob's approval `0x6a64e5667de0ce16663f5c3475d66fcc73c9a363738c5152e59532c13f3152d5`, Bob's order `0x4be5bfbf94b908b300be26844e89245b0321f889243f87abf4ed3d7b5445facf` (block 15). **These identify the run only: the suite reverts its chain snapshot afterwards, so the hashes no longer resolve on any chain.** They are not MetaMask transactions.

## Other real-chain scenarios (all passed, 18 tests)
Resting buy (escrow = `requiredQuote`, no refund); partial fill with a rested remainder (22 escrowed = 8 traded + 0.8 refunded + 13.2 locked); a taker sweeping three makers best-price-first at their own prices; a sell filled against two bids; an immediate full fill; the **fill cap** (12 crossing makers, 10 matched, remainder rests with the book left crossed: best bid >= best ask, and `matchOrders` is a stub); a self trade (the payment to oneself is not counted as a refund); approvals exactly equal to the collateral and not requested again when sufficient; named reverts `InvalidLotSize`, `InvalidTickSize`, `ZeroAmount`, `ZeroPrice` with no transaction sent (block number unchanged); `ERC20InsufficientAllowance` and `ERC20InsufficientBalance` decoded by name; `getUserOrderIds` across statuses; estimate-versus-chain parity.

## Browser run (mock wallet, NOT MetaMask): 13 steps
Connect (guidance floats above RainbowKit's dialog, verified as the topmost element at its centre; recovery steps and Try again appear after 20 s; then connected); validation messages with no wallet request; Alice's sell with the exact approval (`Approve 10 NTU`; the on-chain `Approval` event is for 10e18, spender = the market, token = NTU) and the pending-wallet guidance; account switch (Bob sees none of Alice's orders; the review step is closed); the SPEC example through the UI (`Approve 8.8 SGDx`, result Filled, refund 0.8000, trade vs #1 at 2); My orders and the transaction page matching the chain; Alice's partly-filled order with 6 NTU locked; a wallet rejection (nothing sent, Try again recovers); a double click sends exactly one wallet request (approval and order); an account change while the wallet is open (stale notice, nothing placed, no result card); wrong network (banner and ticket, switch-pending guidance); no horizontal overflow and no console errors at 1586, 768 and 375 wide on `/trade`, `/` and `/tx/[hash]`.

Screenshots (JPEG, 1.9 MB in total) and `results.json` are in `p2-5-screens/`. Visual judgement was by eye; there is no pixel diff. The mock wallet signs through Anvil's unlocked accounts; no private key is involved.

## The MetaMask hidden-notification finding
During manual P2-4 testing the connection looked stuck until the owner opened the MetaMask extension and found the pending request.
- **Cause:** the app showed no explanation while a request waited, and RainbowKit's own dialog gives only "Confirm connection in the extension".
- **What the app can and cannot do:** a web page cannot see whether the extension popup is open or hidden, so the app never claims to.
- **Fix:** every wallet request (connect, approve, order, network switch) shows "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request." After 20 s it adds recovery steps and Try again; there are distinct rejected, error and success states.
- **A defect found while building it:** the first placement of the connect notice was inside the page, underneath RainbowKit's full-page dialog, which would have hidden it exactly when needed. It now floats above everything, and the browser run asserts it is the topmost element.
- **Verified:** the notice text, its escalation, and its position (mock wallet). **Not verified:** how it reads next to a real MetaMask popup.

## Mutation checks (originals restored after each; the suite is green again)
26 of 26 deliberate breaks were caught. First group (18): buy refund ignoring price improvement; strict crossing; fill-cap off by one; taker price instead of maker price; duplicate START while busy; account change not making a busy flow stale; late results from an older attempt accepted; RECONCILED without a mined receipt; logs from any contract accepted; self-trade payment counted as a refund; escrow identity check dropped; lot check dropped; balance checked against the wrong token; allowance re-read ignored; approval for double the collateral; token errors not added to the simulation ABI; sell collateral using the full amount; no escalation. Second group (8, after the review): late hash of an abandoned attempt not recorded; reset forgetting the abandoned attempt; mined order not compared with the requested one; outcome keeping the first hash; cancelled/replaced receipt accepted; no "may still be mined" warning; mined revert saying "nothing was sent"; revert text taken for a wallet rejection.

## Independent security review (Sonnet, read-only, fresh context)
It read the code and ran `tsc` only; it did not run tests or any chain. Its report was treated as findings to verify, not as instructions. Disposition of all 13:
| # | Finding | Disposition |
|---|---|---|
| 1 | Unmount (market switch) orphans an open wallet request | **Fixed**: the attempt is abandoned on unmount; the market picker is disabled while a request is open. *Remaining:* leaving the page by another link mid-signature is not blocked |
| 2 | Try again during a wallet wait loses a late signature | **Fixed** (P2-006), red then green |
| 2b | Failure after signing invites a duplicate | **Fixed** (P2-008), red then green |
| 3 | Outcome not bound to the requested order or the mined hash; cancelled/replaced receipts | **Fixed** (P2-007), red then green |
| 4 | Approval notice could name another token/amount | **Fixed** (P2-009): reads the current allowance and token |
| 5 | Unreadable token metadata silently removes the "not from TokenFactory" warning | **Fixed** (P2-009): trading is disabled with a message |
| 5b | A token symbol can be spoofed | **Partly**: the review now shows the market and token contract addresses. Symbols remain issuer-chosen; stated in the UI |
| 6 | Registry read as page one of 50 only | **Documented limit**; the unknown-market message no longer claims "not listed" when more than 50 exist |
| 7 | Revert text misclassified as a wallet rejection; wrong "Nothing was sent" | **Fixed** (P2-008), red then green |
| 8 | Green "confirmed" header despite a failed cross-check | **Fixed** (P2-009). `getOrder` at the receipt block is exact on Anvil's automine; another transaction in the same block could skew it on a busy chain: noted |
| 9 | Transaction page claims "no events" before the registries load | **Fixed** (P2-009); the trust copy is softened |
| 10 | Zero-address pair before a non-primary market's tokens load | **Fixed**: the flow gets no pair until both tokens are known, and `start()` refuses a zero token |
| 11 | Wallet and app RPC can differ (31337 on another node) | **Documented**: it fails safe (success needs the app RPC's receipt) but the timeout message does not hint at it |
| 12 | Escrow, refund and received figures come from token-emitted `Transfer` logs | **Documented**; the result card says "from the receipt's events". A lying token could emit consistent logs; wallet balances shown separately are read from the chain |
| 13 | The estimate would return a negative refund silently for unaligned inputs | **Accepted**: lot and tick alignment make it unreachable; `BookTooDeep` is caught by the simulation |

## Real defects found and fixed this phase (issue entries with before and after output)
`docs/ai-audit/issues/`: `p2-001` token errors not decoded (found by the real chain; the unit test had passed); `p2-002` fill cap hid the crossed remainder (real chain); `p2-003` review step survived an account switch (browser); `p2-004` switch-network guidance missing in the ticket (browser); `p2-005` a scratch deploy overwrote the exporter's record (found by `--check`); `p2-006` to `p2-009` from the independent review.

## Tools actually used
| Tool | Used for | Outcome |
|---|---|---|
| Context7 | wagmi 2 (`useWriteContract`, `useWaitForTransactionReceipt`, `useSwitchChain`) and viem (`parseEventLogs`) | accepted; `isPending` on a write marks "waiting for the wallet", which fixed the wording of the notice |
| `playwright-core` 1.64.1 (library) with Chromium 157 | the browser run | works with `executablePath` although 1.64.1 expects revision 1248 and 1252 is installed. The Playwright MCP was not used (its Chrome channel needs root) |
| `impeccable detect` | one mechanical pass | 0 findings. The skill's design workflow was not rerun: `DESIGN.md` fixed the design |
| One Sonnet subagent | the security review above | 13 findings; the verified ones were fixed |
| `solidity-security` skill | **not invoked.** No Solidity changed in P2-5; the independent review covered approvals, escrow and token interaction instead | deviation from the plan, recorded |
| Awwwards, taste, ui-ux-pro-max, shadcn MCP | not used (no redesign; no new shadcn component) | |

## Known limits
- No cancellation, no bonus orders (the engine reverts them). A crossed remainder after the 10-fill cap cannot be cleared yet.
- Orders are per market; My orders shows the selected market's latest 50. Registries are read one page (50) at a time.
- Chromium needs `libnss3` and `libnspr4`, which are not installed system-wide here; the browser run used copies unpacked in a scratch folder with `LD_LIBRARY_PATH`. A rerun on your machine needs `sudo apt-get install libnss3 libnspr4` (not done for you).
- The estimate is a preview from the book as read; the contract decides at mining time.
- Nothing here was run against a real MetaMask.
