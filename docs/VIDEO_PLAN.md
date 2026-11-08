# Video plan: SC4053 DEX demo (6 to 8 minutes)

**Target length:** 7:30. **Speakers:** P1 = Person 1 (engine), P2 = Person 2 (factories, front end). Check NTULearn for the required length and format before recording.

**Recording setup:**
- **Screen:** 1920×1080; browser zoom 110% so numbers are readable.
- **Terminal:** font 16 pt or larger.
- **Windows open:** the browser (app plus MetaMask) and one terminal. Keep the repo open in an editor for the files segment.

## Status to check on the day
| Item | Needed for | Status on 8 Nov |
|---|---|---|
| Base trading UI (place order, partial fill, order history) | Segment 3 | Built (Person 2) |
| **Cancel button and Match Orders panel** | Segments 3c and 4a in the UI | **Built** (P2-8B.2 and P2-8B.3; Cancel's happy path run with MetaMask by the owner, Match orders: happy path confirmed with MetaMask by the owner on a scratch chain, 2026-11-08, but not yet rehearsed on the recording chain). Rehearse them on the recording chain; the **terminal path** in each segment remains the fallback |
| **Stop-limit form and Trigger Stops panel** | Segment 4b in the UI | **Built** (P2-8B.4; verified with a mock wallet and a scratch chain, and the **happy path was run with MetaMask by the owner on 2026-11-08**; rehearse on the recording chain; the "Activated" wording that wrongly appeared on a stop cancelled before activation was fixed in P2-8C). The **terminal path** remains the fallback |
| Your local chain runs the current engine | Every UI segment | **Redeploy needed**: a fresh Anvil, then deploy and export (below) |

## Setup (do this before recording)
All commands are from the repo root unless the step says otherwise. The README Quickstart is the reference: Person 2 uses WSL. On Windows with Git Bash, run `export PATH="$HOME/.foundry/bin:$PATH"` first.

```bash
# Terminal 1: a FRESH chain (closing it destroys all state)
anvil

# Terminal 2: deploy, export, check
cd contracts
export RPC_URL=http://127.0.0.1:8545
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   # Anvil account 0: public address, not a key
forge build
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"
cd ..
node contracts/script/export-web.mjs --rpc-url "$RPC_URL"
node contracts/script/export-web.mjs --check --rpc-url "$RPC_URL"   # must print "up to date" (on Windows, see the CRLF note in docs/ENGINE_HANDOFF.md)
scripts/check-local.sh                                               # expect "Result: ready"

# Terminal 3: the app
cd web && npm run dev     # open http://localhost:3000
```

**Expected after deploy:**
- Anvil accounts 1, 2 and 3 each hold **10,000 NTU and 10,000 SGDx**; account 0 holds the rest (970,000 of each).
- On a fresh chain the addresses are fixed: NTU `0xa16E…d2be`, SGDx `0xB7A5…d968`, market `0xCafa…052c`. Always trust `web/lib/contracts/deployments.ts`.

**MetaMask** (README, "MetaMask and local accounts"):
1. **Add the network:**
   - name: Anvil Local
   - RPC: `http://127.0.0.1:8545`
   - chain ID: `31337`
   - symbol: `ETH`
2. **Import accounts** (*Account selector, Add account, Import account, Private Key*), pasting each key from the Anvil banner's `Private Keys` list:
   - index **1**: rename it **Alice** (address `0x7099…79C8`)
   - index **2**: rename it **Bob** (address `0x3C44…93BC`)
   - optionally index **3** (**Carol**, `0x90F7…b906`) and index **4** (**Keeper**, `0x15d3…6A65`, which holds ETH only)

   Never paste a key anywhere else, and never show the banner's key list on camera.
3. **Import tokens** for Alice and Bob: NTU and SGDx, using the addresses from `deployments.ts` or the app's Tokens page.
4. **After any Anvil restart,** use MetaMask's *Clear activity tab data* for the network.

> [P2 to confirm] `docs/TESTING.md` uses account 0 as Alice and account 1 as Bob. This plan uses accounts 1 and 2, which start with exactly 10,000 of each token, so the on-screen numbers are round. It also matches `contracts/script/demo-journey.sh`.

**Rehearse once,** then restart Anvil and redeploy, so the recording starts from block 0.

## Script and shot list
| Time | Speaker | Shot | Say / do |
|---|---|---|---|
| 0:00–0:30 | P2 | Title slide → the app's dashboard | **The problem:** custodial exchanges hold your keys (Mt. Gox). Here tokens stay in your own wallet until *you* place an order, and the contract only escrows and settles. No admin, no backend |
| 0:30–1:30 | P1 (engine), P2 (app) | The architecture diagram (`docs/report/AI_AUDIT_REPORT.md` section 4.1) | P2: `TokenFactory` issues ERC20s, `MarketFactory` lists one `OrderBook` per pair, and the browser reads the chain with MetaMask signing. P1: the engine is a price-time order book. Escrow at placement; execution at the maker's price; partial fills; at most 10 fills per transaction; anyone can trigger batch matching and stops |
| 1:30–2:15 | P2 | App: Tokens and List market pages | Show that NTU and SGDx are issued and NTU/SGDx is listed. Optional: create a token and list a market live (or say it's covered in tests) |
| 2:15–3:45 | P2 drives, P1 narrates | **Journey** (3a to 3c below) | Alice sells 100, Bob buys 40, Alice cancels 60. Point at each balance |
| 3:45–4:45 | P1 | **Batch matching** (4a) | Four traders settled in one transaction |
| 4:45–5:30 | P1 | **Stop-limit** (4b) | A trade moves the price, a keeper triggers Alice's stop, and it fills |
| 5:30–6:30 | P1 | **Security and testing** (5) | Tests, invariants, coverage, Slither, one real AI bug |
| 6:30–7:15 | P1 + P2 | **AI workflow** (6) | Spec files, independent reviews, prompt logs, the issue format |
| 7:15–7:30 | P2 | Closing | What's built; what we'd do next |

### 3. The journey (Alice = account 1, Bob = account 2, on NTU/SGDx)
| Step | Action (UI) | On screen afterwards |
|---|---|---|
| 3a | **Alice:** sell **100 NTU at 2.0**. Approve exactly 100 NTU, then place | Order Book: ask 100 @ 2.0. Alice: **9,900 NTU** (100 in escrow), 10,000 SGDx |
| 3b | **Bob:** buy **40 NTU at 2.0**. Approve exactly 80 SGDx, then place | One trade, 40 @ 2.0. Bob: **10,040 NTU, 9,920 SGDx**. Alice: **10,080 SGDx**. Alice's order: PartiallyFilled, 40 of 100, **60 left** |
| 3b′ (optional) | Bob instead buys at a limit of **2.2** | It still executes at **2.0** (the maker's price). Bob escrows 88 and gets **8 SGDx back** at once (price improvement) |
| 3c | **Alice: Cancel** on her order (bonus UI) | Alice gets exactly **60 NTU** back, to **9,960 NTU**. Order: Cancelled. Book: empty. Bob trying to cancel Alice's order is refused (`NotOrderOwner`) |

**Terminal path for 3c,** if there is no Cancel button. Alice's order is order 1 on a fresh chain:
```bash
MKT=<market address from deployments.ts>; ALICE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
cast send $MKT "cancelOrder(uint256)" 1 --from $ALICE --unlocked --rpc-url http://127.0.0.1:8545
```
Refresh the app to show Alice at 9,960 NTU and the order Cancelled.

### 4a. Batch matching (Bonus 2)
**Say:** a placement makes at most 10 fills, so a large order can rest *crossed*. `matchOrders` lets **anyone** settle crossed orders. The caller gains nothing, and many traders settle in **one** transaction.

**Do (simplest and reliable): the terminal, in a split screen.** This replays the whole journey on a private chain (port 8546) without touching the app's chain:
```bash
bash contracts/script/demo-journey.sh
```
Scroll to step 3 of its output:
- Alice and Carol posted 22 asks.
- Bob (limit 3) and Dan (limit 2.5) each filled 10 and rested 1 crossed.
- One `Keeper matchOrders(10)` transaction settled all four: orders 23 to 26 Filled.
- Balances: Alice 9,949 NTU / 10,102 SGDx; Carol 9,989 / 10,022; Bob 10,051 / 9,898; Dan 970,011 / 969,978; **Keeper 0 / 0**; market 0 / 0.

**UI path** (the Match Orders panel exists since P2-8B.3; its happy path was confirmed with MetaMask by the owner on a scratch chain on 2026-11-08, but **not yet rehearsed on the recording chain**): create the same crossed book on the app's chain with the `cast` lines from `demo-journey.sh` step 3 (or the setup in `docs/TESTING.md`, Test 13), using `--rpc-url http://127.0.0.1:8545`. Open Trade as the token-less Keeper account, press **Review match**, then **Confirm match**, and show the two fills in the result table. The spread reads **Crossed** until it is settled.

### 4b. Stop-limit (Bonus 3)
**Say:** a stop-limit waits, escrowed, until the last trade price reaches its trigger. Then anyone can activate it, and it becomes a normal limit order.

**Do:** continue with the `demo-journey.sh` output, step 4:
- Alice's sell stop: trigger 1.8, limit 1.7, 10 NTU. Status PendingTrigger; not in the book.
- The trigger at price 2 activates **0**.
- Carol sells 1 at 1.8, so the last price is 1.8.
- The keeper triggers: **1 activated**, which sells 10 into Bob's 1.75 bid. Alice **+17.5 SGDx**, to **10,119.5**.

**UI path** (the Stop-limit mode and the Trigger Stops panel exist since P2-8B.4; **the happy path was run with MetaMask on 2026-11-08, on a scratch chain; the recording chain itself is not yet rehearsed**): in Stop-limit mode place the stop as Alice, make the 1.8 trade as Carol, then press **Review trigger** and **Confirm trigger** from the Keeper account. The stop's own line in the result says what happened to it (it fills here); the My Orders line says *Waiting for price* before the trade and *Eligible now* after it. The setup helper and a manual procedure are in `docs/TESTING.md`, Test 14.

**Mention:** stops trigger on the last trade price, which a single trade can move. That is a documented teaching limitation (SPEC section 8).

### 5. Security and testing (show files, about 60 s)
| Show | File | Point at |
|---|---|---|
| Test run summary | `docs/ai-audit/test-evidence/phase7/forge-test-default.txt` (last line) | **334 passed** at Phase 7; **335** with the issue 007 test (`engine-final`) |
| Deep invariant run | `docs/ai-audit/test-evidence/phase7/forge-test-deep.txt` | `runs: 1000, calls: 128000, reverts: 0`; all invariants `[PASS]`, including `invariant_ledgerMatchesBalances` |
| Coverage | `docs/ai-audit/test-evidence/phase8/coverage-summary.txt` | `src/OrderBook.sol` **100.00%** on every column |
| Slither | `docs/ai-audit/test-evidence/phase8/slither-triage.md` | 27 results, **0 real**, each with a reason |
| One real AI bug | `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` | For **102 wei**, one stop blocked every trigger. Before: 3 FAIL `BookTooDeep()`; after: 3 PASS |

### 6. AI workflow (about 45 s)
- **Show `CLAUDE.md` and `SPEC.md`:** the AI reads them every session, and the interface is frozen, so the AI could not "fix" things by inventing an ABI.
- **Show a phase prompt in `docs/ENGINE_PHASES.md`, then that phase's entry in `docs/ai-audit/prompt-log.md`:** "What the AI got wrong" and "Human decisions".
- **Say:** from Phase 3a on, each phase was reviewed by a fresh AI agent that never saw our reasoning. Every bug became an issue file with failing-then-passing proof. Mutants proved the tests catch real bugs.
- **One lesson:** the AI's first invariant suite was green but could not fail. Only an independent review caught that.

## Fallback plan (if the UI or MetaMask misbehaves)
1. **The whole demo from the terminal:** `bash contracts/script/demo-journey.sh`. It needs nothing running. It starts its own Anvil on port 8546, deploys with `Deploy.s.sol`, runs all four steps with balance tables and `ok` checks, and ends with `DEMO COMPLETE: every check passed`. About 50 s. Record it once in advance as a backup clip.
2. **MetaMask nonce errors after an Anvil restart:** *Settings, Advanced, Clear activity tab data*.
3. **The app says "No SC4053 DEX deployment on this chain":** redeploy and re-export (Setup).
4. **The app shows "Node unreachable":** Anvil stopped. Restart it, redeploy, re-export, then clear MetaMask activity.

## Checklist before pressing record
- [ ] Fresh Anvil, deployed, exported; `check-local.sh` says ready.
- [ ] Alice, Bob, Carol and Keeper imported and renamed, with tokens imported. Addresses checked, not labels.
- [ ] No private keys visible anywhere on screen.
- [ ] `demo-journey.sh` run once successfully (the backup clip is recorded).
- [ ] Evidence files open in editor tabs, in segment order.
