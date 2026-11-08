# Video plan and recording runbook: SC4053 DEX demo

**Status: prepared, not recorded.** Nothing here claims that the video exists. The spoken words are in [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md); this file is how to prepare and record.

**Duration: 7:30 is provisional.** The assignment brief (`docs/Development_Project.pdf`) says nothing about a video, its length, its format or its file name. The 7:30 target (inside a 6 to 8 minute window) is the team's own plan. Check the final NTULearn instructions before recording, and change the script's timing if they say otherwise.

**Speakers.** Person 1 (engine, Solidity security, invariant testing, engine audit, AI audit method) only speaks. Person 2 (front end, factories, deployment, integration) operates the terminal, the browser, MetaMask and the screen share for the whole video, and speaks as well.

New to Anvil, MetaMask or WSL? Read [`BEGINNERS_GUIDE.md`](BEGINNERS_GUIDE.md) first: it explains the terms used below. Commands marked 🔍 only read; commands marked ✏️ start a process, change a chain or write a file (the place is named).

## 1. The dedicated recording environment

The earlier environments hold historical evidence and are **not touched** by anything in this plan:

| Environment | Chain (Anvil) | App (Next.js) | Why it stays untouched |
|---|---|---|---|
| Main | 8545 | 3000 | The owner's own working chain |
| Bonus 2 evidence | 8546 | 3100 | The batch-matching MetaMask run |
| Bonus 3 evidence | 8547 | 3101 | The stop-limit MetaMask run (hashes in `TESTING.md`) |
| P2-8C scratch | 8548 | 3102 | The UX-polish test pair |
| **Recording (new)** | **8549** | **3103** | **Disposable; this plan creates and deletes it** |
| Backup clip (new, temporary) | 8550 | none | Only used while `demo-journey.sh` runs |

**Rules.** The frontend on 3103 is built to read 8549, and MetaMask's RPC URL is `http://127.0.0.1:8549`: they must name the same chain. Never run the fresh-chain steps of the old plan against 8545. Never run `node contracts/script/export-web.mjs` for the recording chain (it would rewrite the tracked `web/lib/contracts/*` files); a fresh Anvil gives the same contract addresses as the committed `deployments.ts`, so no export is needed. Forge's broadcast and cache output goes to `/tmp/sc4053-demo`, so `contracts/broadcast` is not changed.

## 2. Setup runbook

Use three WSL Ubuntu terminals (Windows Terminal, one tab each): **A** runs Anvil (keep it hidden: its banner prints the development private keys, which must never appear on camera), **B** is the demo terminal (shared on camera), **C** runs the app server (hidden).

Repository path in the commands: `~/projects/SC4053-BlockChain-Technology/SC4053-BlockChain-Project` (adjust if yours differs).

### Step 0. Check the machine and the ports 🔍 (Terminal B)
```bash
cd ~/projects/SC4053-BlockChain-Technology/SC4053-BlockChain-Project
export PATH="$HOME/.foundry/bin:$PATH"
git status --short                      # expect: no output (a clean tree)
forge --version && anvil --version && cast --version && node --version
ss -ltnp | grep -E ':(3000|3100|3101|3102|3103|8545|8546|8547|8548|8549|8550)\b'
```
- **Where / what:** Terminal B; read-only.
- **Expect:** a clean tree; tool versions; lines only for the historical ports that are still running. Nothing on **8549, 8550 or 3103**.
- **If it fails:** `forge: command not found` means `export PATH="$HOME/.foundry/bin:$PATH"` was not run (README, "First-time setup"). If 8549, 8550 or 3103 is in use, pick other free ports and use them everywhere below, including the script's commands.

### Step 1. Start the recording chain ✏️ (Terminal A)
```bash
anvil --port 8549
```
- **What:** starts an empty, disposable chain in memory (chain ID 31337) listening on `127.0.0.1:8549`. It changes no file. It forgets everything when stopped.
- **Verify** (Terminal B):
```bash
export RPC=http://127.0.0.1:8549
cast chain-id --rpc-url "$RPC"          # 🔍 expect 31337
cast block-number --rpc-url "$RPC"      # 🔍 expect 0
```
- **If it fails:** "address already in use" means the port is taken (see Step 0). A connection error from `cast` means Anvil is not running.

### Step 2. Deploy the contracts to 8549 only ✏️ (Terminal B)
```bash
S=/tmp/sc4053-demo; mkdir -p "$S/broadcast" "$S/cache"
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266     # Anvil account 0's public address, not a key
(cd contracts && FOUNDRY_BROADCAST="$S/broadcast" FOUNDRY_CACHE_PATH="$S/cache" \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER")
```
- **What:** runs the project's own deploy script on chain 8549: TokenFactory, MarketFactory, the NTU and SGDx tokens and the NTU / SGDx market, and gives accounts 1 to 3 10,000 NTU and 10,000 SGDx each. The script refuses any chain whose ID is not 31337. The first run may compile for a minute or two because the cache folder is new.
- **Writes:** chain state on 8549 and files under `/tmp/sc4053-demo` only.
- **Expect:** `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, 11 transactions, then `cast block-number --rpc-url "$RPC"` prints `11`. `git status --short` still prints nothing.
- **If it fails:** a `WrongChain(...)` error means `$RPC` is not a 31337 chain; a "Source @openzeppelin/... not found" error means the submodules are missing (`git submodule update --init --recursive`) or run the command with `--root .` as `prompt-log-person2.md` (Prompt 00) records; a compile error means run `cd contracts && forge build` once first.

### Step 3. Verify the deployment 🔍 (Terminal B)
```bash
for n in tokenFactory marketFactory market baseToken quoteToken; do
  a=$(grep -E "^[[:space:]]*$n:" web/lib/contracts/deployments.ts | grep -oE '0x[0-9a-fA-F]{40}' | head -n1)
  echo "$n $a code bytes: $(( ($(cast code "$a" --rpc-url "$RPC" | wc -c) - 3) / 2 ))"
done
```
- **What:** reads the five addresses the app will use from the committed `deployments.ts` and asks the chain for the code at each.
- **Expect:** five lines with a non-zero byte count (for example 4654, 10508, 8461, 1786 and 1786 in a recorded run).
- **If a count is 0:** the chain is not the fresh deployment the app expects; stop and redo Steps 1 and 2.
- **Do not use** `scripts/check-local.sh` as the pass or fail test for this chain. It runs and prints PASS for the chain ID, the five contracts and (later) the front end, and then **FAILs** its export check with "stale deployment" because that check compares against the repository's own broadcast record. That one FAIL is expected here (it was seen on the 8548 scratch chain built the same way). Do not "fix" it.

### Step 4. Build and serve the app for 8549 ✏️ (Terminal C)
```bash
S=/tmp/sc4053-demo
mkdir -p "$S/web" && cp -a web/. "$S/web/" && rm -rf "$S/web/.next"
cd "$S/web"
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8549 npx next build
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8549 npx next start -p 3103
```
- **What:** copies `web/` (about 1.3 GB because of `node_modules`; one or two minutes) into `/tmp/sc4053-demo`, builds it with the RPC address baked in, and serves it on port 3103. A copy is used so the dev server on 3000, which owns `web/.next`, is never disturbed.
- **Writes:** only under `/tmp/sc4053-demo`.
- **Expect:** the build ends with a route table; `next start` prints `Local: http://localhost:3103`.
- **Verify** (Terminal B): `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3103` prints `200`. In the browser the app shows "Anvil (local)", chain ID 31337, and a block number equal to `cast block-number --rpc-url "$RPC"`.
- **If it fails:** "port 3103 in use" (Step 0); "next: not found" means the copy lost `node_modules` (re-run the `cp` line); a build error usually means the repository has uncommitted changes (Step 0).

### Step 5. The demo accounts and MetaMask 🔍 then ✏️
The three accounts used on camera (Anvil's public development accounts; their keys are public but are still never shown):

| Name | Anvil account | Address | Role |
|---|---|---|---|
| Alice | 1 | `0x7099…79C8` | Seller, creates the token, owns the stop |
| Bob | 2 | `0x3C44…93BC` | Buyer |
| Keeper | 4 | `0x15d3…6A65` | Holds **no** trading tokens; calls match and trigger |

Confirm the node uses Anvil's default accounts before importing anything (🔍, Terminal B):
```bash
M="test test test test test test test test test test test junk"      # Anvil's public default phrase (BEGINNERS_GUIDE, Part E)
for i in 1 2 4; do cast wallet address --private-key "$(cast wallet private-key "$M" $i)"; done
cast rpc eth_accounts --rpc-url "$RPC"                                # the node's own list: indexes 1, 2 and 4 must match
```
Expect the three addresses in the table. To import an account, run `cast wallet private-key "$M" 1` (then `2`, then `4`), copy the key into MetaMask's import box, and **clear the terminal afterwards**. Do this away from the recording and the screen share.

**Use a clean browser profile with a throwaway MetaMask** (a new Chrome, Edge or Brave profile named for the demo, with MetaMask installed and a new wallet created for it). It has no history, so it cannot have stale nonces from the other local chains (they all share chain ID 31337), and it hides personal tabs, bookmarks and accounts.
1. Add the network: name `Anvil Local`, RPC `http://127.0.0.1:8549`, chain ID `31337`, symbol `ETH`.
2. Import the three accounts above and rename them Alice, Bob and Keeper. Check the **address** under each name.
3. Import the tokens NTU and SGDx (addresses from `deployments.ts`, printed in Step 3).
4. Open `http://localhost:3103`, press **Connect wallet**, and connect **all three accounts** to the site in one go (tick all three). This lets you switch the active account in MetaMask during the video and have the site follow. After every switch, check the address in the app's header (and the "Orders for 0x…" line in My Orders): selecting an account in MetaMask does not by itself connect it to the site.
5. Never open Settings, Security or the recovery phrase on camera.
- **If you must reuse your normal MetaMask profile:** its saved nonces from other local chains will make the first transaction sit pending. Fix it per account with *Settings, Advanced, Clear activity tab data*, which clears MetaMask's own list only (not keys, not funds, not any chain).

### Step 6. Check the helper scripts 🔍 (Terminal B)
```bash
scripts/seed-crossed-book.sh status --rpc-url "$RPC"
scripts/seed-stop-orders.sh status --rpc-url "$RPC"
```
- **What:** both read the market address from the committed `deployments.ts` and only read the chain.
- **Expect:** "the book is not crossed", a `matchOrders(10)` simulation of 0, and balances of 10,000 for accounts 1 to 3 and 0 for the keeper; for the stop script "no trade yet" and 0 stops. Both refuse port 8545 and any chain that is not 31337.
- **If it fails:** a "NOT ready" message lists exactly why (no contract code, a leftover allowance, a pending transaction). Fix that cause; do not run the seed to "see what happens".

## 3. What is live and what is prepared

Do not mix these up on camera. The order of scenes is also the order of events on one chain; it is the order that works.

| Order | Scene | Live or prepared | Why this order |
|---|---|---|---|
| 1 | Create a token and list a market (Alice) | Live | A different market, so it does not touch the NTU / SGDx book |
| 2 | Alice sells 100 at 2; Bob buys 40 at 2.2; Alice cancels | Live | Needs an empty NTU / SGDx book, which it is on a fresh chain |
| 3 | Crossed book, then the keeper's match (Bonus 2) | The 24 orders are **prepared off camera** with the recording **paused**; the match is **live** | Building the book takes 24 orders; it needs an empty book and no leftover allowances, which Scene 2 leaves behind |
| 4 | Stop-limit placement, price move, keeper trigger (Bonus 3) | **Live**, including the two helper trades | Needs a last trade price (Scene 3 left one) and an empty book (the match emptied it) |

Why not the stop script's `prepare`: it refuses a market that already has a trade, so it cannot follow the journey. `move-price` and `add-bid` only need a trade to exist, which they find. The stop script's `verify-after` needs the record that `prepare` writes, so it is **not** used in this video; the app's result card and the transaction page show the same facts.

## 4. Expected values (tested scenarios; the last table is derived)

**Scene 2** (checked by `contracts/script/demo-journey.sh`, step 1 and 2, and `TESTING.md` Tests 2 to 4 and 12):

| After | Alice | Bob | Market |
|---|---|---|---|
| Alice places the sell of 100 at 2 | 9,900 NTU, 10,000 SGDx | 10,000, 10,000 | 100 NTU |
| Bob buys 40 at a limit of 2.2 | 9,900 NTU, 10,080 SGDx | 10,040 NTU, 9,920 SGDx | 60 NTU |
| Alice cancels the rest | **9,960 NTU**, 10,080 SGDx | unchanged | 0 |

Alice's order #1 reads Partially Filled (40 of 100) before the cancel and Cancelled after. Bob escrows 88 SGDx, pays 80 at the maker's price and gets 8 back.

**Scene 3** (the crossed-book structure is checked by `demo-journey.sh` step 3 and, in MetaMask, by `TESTING.md` Test 13): the seed posts 22 asks of 1 NTU at 2 (orders #3 to #24) and two bids of 11 NTU (limit 3, order #25; limit 2.5, order #26); each bid fills the 10-fill cap and rests 1 NTU crossed. The keeper's one transaction settles #23 and #24 against #25 and #26: 2 fills, 2 NTU, 4 SGDx, 1.5 SGDx of price improvement returned, orders #23 to #26 Filled, the keeper's token balances unchanged. After it: Alice 9,949 NTU and 10,102 SGDx.

**Scene 4** (the 4 NTU at 1.9 for 7.6 SGDx scenario is the tested `TESTING.md` Test 14; here the owner is Alice and the keeper is account 4, so the **account and order id differ and the numbers must be confirmed in the rehearsal**): Alice's stop is order #27 (Pending Trigger, trigger 1.8, limit 1.7, 10 NTU, 10 NTU escrowed, Alice 9,939 NTU). `move-price 1.8` makes the last trade 1.8, so the stop is Eligible Now but still Pending Trigger. `add-bid 1.9 4` rests a bid. The keeper's trigger activates #27 and it fills 4 NTU at 1.9 (the bid's price) for 7.6 SGDx; order #27 reads Partially Filled with 6 NTU resting at 1.7; the last trade is 1.9.

**Differences you will see:** gas figures, transaction hashes and block numbers.

## 5. Recording with Zoom

Menu names change between Zoom versions; look for the equivalent. Zoom's own settings were not tested for this plan.

1. **Create and join.** Person 2 opens Zoom, starts a **New meeting** as host, and sends Person 1 the invitation link. Person 1 joins with audio. Cameras are optional and not needed.
2. **Microphones.** Both use a headset (speakers cause echo). In Zoom's audio settings run the microphone test, and say a sentence to check both people hear each other.
3. **Recording permission.** Person 2, as host, uses **Record, Record on this computer**. Zoom tells participants it is recording. In Zoom's recording settings (web or app) turn on recording video during screen sharing, and leave transcripts and cloud options off.
4. **Resolution.** Set Windows to 1920 by 1080, scale 100 or 125 per cent; browser zoom 110 per cent; terminal font 16 points or larger; Zoom's video setting HD if it has one. The recording's resolution follows what is shared, so check it in the rehearsal file (step 8).
5. **Share the whole screen,** not one window. MetaMask's confirmation popup is a separate window and would be missing from a single-window share. Person 2 arranges the browser (demo profile) and the demo terminal side by side on that one screen, with VS Code ready for Segments 7 and 8, and shares **that screen only**.
6. **Scripts off the shared screen.** Person 1 reads `VIDEO_SCRIPT.md` on their own computer. Person 2 reads their lines from a second monitor, a tablet or a printout, never from the shared screen.
7. **Turns.** Follow the handoff cues in the script. Unmute only to speak; do not talk over a MetaMask wait. Use the bridge lines (script, section 5) for delays.
8. **Privacy.** Use the clean profile (Step 5); close other windows; turn on Windows Focus Assist / Do Not Disturb; set a short terminal prompt (`PS1='$ '`) and run `clear`; keep Terminal A (the Anvil banner with keys) and the key-derivation terminal minimized; never show MetaMask Settings, Security or a recovery phrase; no email or personal tabs.
9. **Pause and resume** for the crossed-book preparation (Segment 5): use Zoom's pause and resume recording button. The recording continues in the same file. Say aloud in the video that the book was prepared off camera (the script does).
10. **Stop and save.** Press **Stop recording** (or end the meeting). Zoom then converts the recording; the default folder is the `Zoom` folder inside Documents on Windows, in a folder named for the date and time, with an `.mp4`. Copy it somewhere safe.

## 6. Rehearse, then reset for the real take

**Rehearsal (once, with a stopwatch).** Do the whole sequence including a 2-minute Zoom test recording: share the screen, speak, stop, find the file, play it back. Check: both voices are clear; MetaMask popups are visible; text is readable; no key or phrase appears; the length is near 7:30. Segments 3, 4 and 6 are the tightest. If the actions alone exceed the segment, cut in this order: (1) make the token listing in Segment 3 a read-only look at the Markets page (and say so), (2) shorten the narration, never the transactions.

**Reset for the real take** (a fresh chain with the same app):
1. Terminal A: press Ctrl+C to stop Anvil. Check: `ss -ltnp | grep ':8549'` prints nothing.
2. Repeat **Step 1** (new Anvil, same port) and **Step 2** (deploy). The app on 3103 is untouched and still correct, because a fresh Anvil gives the same addresses.
3. **MetaMask:** a restarted chain makes MetaMask's saved nonces stale. In each of Alice, Bob and Keeper: *Settings, Advanced, Clear activity tab data* (MetaMask's own list only). Reload the app tab, reconnect if asked, and check the three addresses.
4. 🔍 `cast nonce 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url "$RPC"` (and the Bob and Keeper addresses) must print `0`; Step 6's two `status` commands must show the fresh state.

If a transaction sits pending during the take, do not click Speed up or Cancel repeatedly: stop the take and reset.

## 7. Failure points and fallbacks

| Failure | Cause | What to do |
|---|---|---|
| A MetaMask prompt does not appear | The popup is hidden | Open the extension from the browser toolbar; the app shows this hint after 20 seconds |
| Transaction pending for a long time | Stale nonce after a chain restart, or a gap | Stop the take; reset (section 6). Diagnostics first: `cast nonce <account> --rpc-url "$RPC"` against MetaMask's shown nonce |
| The site shows the wrong account | The account chosen in MetaMask is not connected to the site | Connect it from the site (Step 5 point 4); check the header address |
| "No SC4053 DEX deployment" or "Node unreachable" | The chain was restarted or the app points at another RPC | Check Terminal A is running and the app was built for 8549 (Step 4 and Step 3) |
| The Match Orders panel does not appear | The book is not crossed (the seed did not finish) | Run `scripts/seed-crossed-book.sh status --rpc-url "$RPC"`; re-run `seed` (it explains if the chain is not ready) |
| The Trigger Stops panel does not appear | The stop is not yet eligible | Run `scripts/seed-stop-orders.sh status --rpc-url "$RPC"`: it must report 1 stop that would activate |
| A live action fails twice | Anything else | Use the terminal commands given in the script's fallbacks and say they are terminal actions, or play the backup clip clearly introduced as a clip |

## 8. Evidence to open before recording

Open these in this order, in tabs or editor windows, so Person 2 switches by clicking:
1. `docs/report/diagrams/03-system-architecture.png` (Figure 3, report section 4.1).
2. `docs/report/diagrams/10-evidence-map.png` (Figure 10, report section 6.1).
3. `docs/ai-audit/ENGINE_SECURITY_SUMMARY.md`, scrolled to "Verification evidence".
4. Optional: `docs/ai-audit/test-evidence/phase7/forge-test-deep.txt` at `runs: 1000, calls: 128000`.
5. `CLAUDE.md`, then `docs/ai-audit/issues/006-stop-activation-booktoodeep-blocks-all-triggers.md` (section 4), the `docs/ai-audit/issues/` folder, and `docs/ai-audit/issues/p2-017-cancelled-stop-labelled-activated.md`.
6. Optional extras for the AI segment: Figure 1 (`01-ai-workflow.png`) and Figure 9 (`09-issues-by-phase.png`).

No test is run on camera. Do not open `docs/TESTING.md` screenshots or any file showing a key.

## 9. Backup clip (record in advance)

`contracts/script/demo-journey.sh` replays the whole journey in a terminal on its own private chain: partial fill, cancel, a four-trader batch match and a stop-limit trigger, with balance tables and `ok` checks, and ends with `DEMO COMPLETE: every check passed`. It supports `DEMO_PORT` and refuses to run if anything already answers on that port, so it never touches an existing chain.

```bash
ss -ltnp | grep ':8550'                  # 🔍 expect no output (8550 free)
DEMO_PORT=8550 bash contracts/script/demo-journey.sh      # ✏️ starts and stops its own Anvil on 8550; redirects Forge output to a temp folder
```
- **Do not** run it without `DEMO_PORT`: its default is **8546**, which the Bonus 2 evidence chain uses (the script would refuse, but do not rely on that).
- **Expect:** about a minute; a line `DEMO COMPLETE: every check passed`; the script stops its own Anvil and removes its temp folder. `git status --short` stays empty.
- **If it fails:** read the `FAIL` lines it prints; a "Something already answers on port" message means pick another free port.
- Record one clean run as the backup clip. If a clip is ever played in the video, say it is a recording.

## 10. Recording-day checklist (only real preparation tasks)

- [ ] NTULearn instructions read for the video: required or not, length, format, file name, how to submit.
- [ ] Recording environment built (Steps 0 to 6) and rehearsed once with a stopwatch.
- [ ] Clean browser profile with a throwaway MetaMask: Alice, Bob and Keeper imported, addresses checked, tokens imported, all three connected to `http://localhost:3103`, RPC `http://127.0.0.1:8549`.
- [ ] Reset done for the real take (section 6); nonces read as 0.
- [ ] No private key, recovery phrase or personal tab visible; notifications off; Terminal A minimized.
- [ ] Evidence files open (section 8).
- [ ] Zoom: headsets, microphone test, record on this computer, whole screen shared, scripts on other screens.
- [ ] Backup clip recorded (section 9).

## 11. After recording

1. Check the file: play it from the start; both voices; popups visible; text readable at the video's resolution; no key or phrase; length near 7:30; the segment 5 narration says the book was prepared off camera.
2. Save the final file and name it as NTULearn requires (not specified in the brief).
3. Stop the recording environment. Identify before killing:
   ```bash
   ss -ltnp | grep -E ':(8549|3103)\b'          # 🔍 note the pid of each
   readlink /proc/<pid-of-3103>/cwd             # 🔍 must be /tmp/sc4053-demo/web
   ps -o pid,args -p <pid-of-8549>              # 🔍 must read "anvil --port 8549"
   ```
   Then stop only those two (Ctrl+C in Terminals A and C is simplest). Do not stop anything on 8545 to 8548 or 3000 to 3102.
4. Remove the temporary files: `rm -rf /tmp/sc4053-demo` (a folder of your own made in Step 2, outside the repository). The helper scripts' small records are in `~/.local/state/sc4053/` (outside the repository) and can stay.
5. `git status --short` must print nothing.
6. Tick the video boxes in `docs/SUBMISSION_CHECKLIST.md` only now.

## 12. Open decisions for the team

- The required video length, format and file name (NTULearn).
- Whether a live listing in Segment 3 stays in or becomes a read-only look if the rehearsal runs long.
- Whether the crossed-book preparation is recorded with Zoom's pause (the default here) or kept on camera for about 25 seconds more, which the 7:30 budget does not have.
