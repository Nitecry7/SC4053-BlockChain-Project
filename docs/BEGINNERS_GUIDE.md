# SC4053 DEX: Beginner's Guide to Running, Understanding and Testing the Exchange

**Who this is for.** A student who can read basic code but has never used Anvil, MetaMask, an Ethereum RPC, a smart contract or a local blockchain. Every command below says **why** it is needed, **what it changes**, **what you should see** and **what that means**.

**Where this guide fits.** It explains and links; it does not replace the authoritative documents:

| Document | Use it for |
|---|---|
| [README.md](../README.md) | A short Quick Start and the feature overview |
| **This guide** | Understanding the system, first-time setup, troubleshooting, what the tests prove |
| [DEPLOYMENT.md](DEPLOYMENT.md) | The exact deploy and ABI-export mechanism |
| [TESTING.md](TESTING.md) | **The single source** of every manual test step and expected value (Tests 1 to 14) |
| [report/AI_AUDIT_REPORT.md](report/AI_AUDIT_REPORT.md) | The SC4053 AI Audit Report: what the AI got wrong, what was verified, what is still open |

> **Commands are marked.** 🔍 = read-only (changes nothing). ✏️ = changes state (starts a process, deploys, sends a transaction, writes a file). Run 🔍 commands freely; stop and read before an ✏️ one.

> **Development keys only.** Everything here uses Anvil's public test accounts on a local, disposable chain. **Never send real money to them and never reuse a development key anywhere else.** No private key is written in this guide, and you should never paste one into the repository, a screenshot or a log.

## Table of contents
- [Part A. How the system works](#part-a-how-the-system-works)
- [Part B. The three development environments](#part-b-the-three-development-environments)
- [Part C. First-time setup (Windows with WSL Ubuntu)](#part-c-first-time-setup-windows-with-wsl-ubuntu)
- [Part D. MetaMask setup](#part-d-metamask-setup)
- [Part E. Development accounts and the mnemonic](#part-e-development-accounts-and-the-mnemonic)
- [Part F. Common mistakes and troubleshooting](#part-f-common-mistakes-and-troubleshooting)
- [Part G. Feature walkthroughs](#part-g-feature-walkthroughs)
- [Part H. Reproducible manual testing](#part-h-reproducible-manual-testing)
- [Part I. What the tests actually prove](#part-i-what-the-tests-actually-prove)

---

# Part A. How the system works

## A1. The vocabulary, in plain words

| Term | Meaning in this project |
|---|---|
| **Blockchain** | A shared ledger of **blocks**; each block holds **transactions** and the ledger can only be appended to. Here it is a single program on your own computer (Anvil), not a public network. |
| **Anvil** | A local, throw-away Ethereum node from Foundry. It starts with 10 funded test accounts, mines a block for every transaction, and **forgets everything when you stop it**. |
| **Foundry** | The toolkit: **`forge`** compiles, tests and deploys contracts; **`anvil`** is the local node; **`cast`** is a command-line tool to read the chain and send transactions. |
| **RPC endpoint** | A web address (for example `http://127.0.0.1:8545`) that accepts JSON requests such as "what is the balance of this address?" or "here is a signed transaction". Wallets and the website both talk to the chain through it. |
| **localhost / 127.0.0.1** | Both mean "this computer". `localhost` is the name, `127.0.0.1` is the numeric address. |
| **Port** | A numbered door on your computer. Several programs can run at once, each on its own port, for example the website on `3000` and the chain on `8545`. |
| **Chain ID (31337)** | A number that labels a network so a wallet does not sign a transaction meant for another network. `31337` is Anvil's default. It is a **label**, not a location. |
| **Address** | The public identifier of an account, like `0x7099…79C8`. Safe to share. |
| **Private key** | The secret that proves you own an address and signs transactions. Whoever has it controls the account. |
| **Nonce** | A per-account counter of transactions sent. Transaction 1 must use nonce 0, the next nonce 1, and so on; the chain rejects gaps and repeats. |
| **Transaction** | A signed request that changes the chain's state (transfer tokens, place an order). It costs **gas**. |
| **Gas** | The unit that measures the work of a transaction. On Anvil it is paid in free test ETH, but the numbers are real (for example 203,299 gas to trigger a stop). |
| **Receipt** | The chain's record of a mined transaction: success or revert, gas used, and its logs. |
| **Log / event** | A record a contract writes into the receipt, such as `Trade(…)` or `OrderCancelled(…)`. The website reads these to show "what happened". |
| **Escrow** | Tokens the order book holds on your behalf while your order is open. A sell order escrows base tokens (NTU); a buy order escrows quote tokens (SGDx). |
| **Approval (allowance)** | An ERC20 permission: "this contract may pull up to N of my tokens". It is a **separate transaction** from placing the order. |

## A2. The contracts

| Contract | What it does |
|---|---|
| **ERC20 token** (`DemoToken`) | A standard token with 18 decimals and a fixed supply. Two are deployed: **NTU** ("NTU Token", the *base* token) and **SGDx** ("Singapore Dollar X", the *quote* token). |
| **TokenFactory** | Lets anyone issue a new `DemoToken`. |
| **MarketFactory** | Creates and registers an **OrderBook** market for a pair of tokens (one market per unordered pair). The website lists markets from this registry. |
| **OrderBook** | The exchange itself: limit orders with price-time priority, escrow, matching at the **maker's** price, plus the three bonuses (cancel, batch match, stop-limit). There is no AMM and no price oracle. |

Prices are "SGDx per whole NTU", scaled by `1e18`. Amounts are multiples of a lot size of `1e9` atomic units, and prices multiples of a tick of `1e9`, so every cost is exact. The authoritative description is [SPEC.md](../SPEC.md) and [CONTRACT_INTERFACE.md](../CONTRACT_INTERFACE.md).

## A3. The pieces and how they talk

```text
        your browser                                            your computer (WSL)
 ┌───────────────────────────┐                  ┌────────────────────────────────────────────┐
 │ http://localhost:3000     │   page + JS      │  Next.js server (port 3000)                │
 │  the DEX website          │◀─────────────────│  serves the website; holds NO keys         │
 │  (React, wagmi, viem,     │                  └────────────────────────────────────────────┘
 │   RainbowKit)             │
 │                           │  read-only calls ┌────────────────────────────────────────────┐
 │  reads: balances, book    │─────────────────▶│  Anvil (port 8545)  chain id 31337         │
 │                           │   (viem → RPC)   │   • blocks, accounts, contracts, orders    │
 │                           │                  │   • TokenFactory / MarketFactory /         │
 │  ┌─────────────────────┐  │  signed txs      │     NTU / SGDx / OrderBook                 │
 │  │ MetaMask extension  │──┼─────────────────▶│                                            │
 │  │  holds the keys,    │  │  (MetaMask → its │                                            │
 │  │  has its OWN RPC URL│  │   own RPC URL)   │                                            │
 │  └─────────────────────┘  │                  └────────────────────────────────────────────┘
 └───────────────────────────┘
```

Key facts the picture shows:
- The **frontend server** (Next.js, port 3000) only delivers the web page. It never talks to the chain and never sees a key.
- The website's JavaScript reads the chain **directly** from the RPC URL built into the app (`NEXT_PUBLIC_RPC_URL`, default `http://127.0.0.1:8545`).
- **MetaMask has its own RPC URL.** The app asks MetaMask to sign; MetaMask sends the signed transaction to *its* RPC. If the two URLs point at different nodes, the app and the wallet are looking at different blockchains (see [Part B](#b3-the-danger-frontend-and-metamask-on-different-nodes)).
- **viem** is the library that builds RPC requests and decodes results; **wagmi** and **RainbowKit** provide React hooks and the "Connect wallet" button; **MetaMask** is the wallet; **Anvil** is the chain.

## A4. A read versus a signed transaction

```text
READ-ONLY QUERY (free, no wallet needed)           SIGNED STATE-CHANGING TRANSACTION
 website ── eth_call "getBook()" ──▶ RPC              website ─ "place sell order" ─▶ MetaMask
 website ◀── the answer (no block mined) ──            MetaMask ── shows request ──▶ you click Confirm
                                                       MetaMask signs with the private key
                                                       MetaMask ── signed tx ──▶ RPC ──▶ mempool
                                                       Anvil mines a block ──▶ receipt (status, gas, logs)
                                                       website reads the receipt and the order again
```

A read (`cast call`, `eth_call`, `getBook`) runs the code on the node but **mines nothing and changes nothing**. A transaction (`cast send`, a click on Confirm) must be signed, costs gas, is mined into a block and permanently changes state.

## A5. Life of one transaction

1. **Build:** the app prepares the call (for example `placeLimitOrder(sell, 2e18, 10e18)`).
2. **Simulate:** it asks the node whether the call would succeed, to show a clear error instead of a wasted transaction.
3. **Sign:** MetaMask shows the request; you confirm. Nothing has happened on the chain yet.
4. **Submit:** the signed transaction goes to the RPC with the account's next **nonce**.
5. **Mine:** Anvil puts it in a block (instantly) and produces a **receipt**.
6. **Verify:** the app waits for the receipt, checks it **succeeded**, decodes the events, and re-reads the order. The result screen is drawn from the receipt, not from hope.

Wallet approval, a submitted transaction, a confirmed receipt, a successful receipt and the final order status are five different things. The app keeps them apart on purpose.

---

# Part B. The three development environments

During the Bonus work three independent test setups were used. They are **historical test configurations**, not services that are always running.

| Name | Website | Chain RPC | Chain ID | Purpose |
|---|---|---|---|---|
| **Main** | `http://localhost:3000` | `http://127.0.0.1:8545` | 31337 | The developer's own working chain and demo data. Read it freely, avoid resetting it |
| **Bonus 2** | `http://localhost:3100` | `http://127.0.0.1:8546` | 31337 | Scratch chain holding the batch-matching test evidence |
| **Bonus 3** | `http://localhost:3101` | `http://127.0.0.1:8547` | 31337 | Scratch chain holding the stop-limit test evidence |

## B1. Separate RPCs are separate blockchains
Each Anvil process has its own blocks, accounts' balances, contracts, orders and nonces. They are **not copies of one shared ledger**. Starting a second Anvil does not clone the first; it starts a new empty world that happens to use the same label (chain ID 31337).

## B2. Why they can share one chain ID
The chain ID is only a label that protects against signing for the wrong network. Nothing enforces that labels are unique among private local chains, so every Anvil says 31337. MetaMask therefore **cannot tell them apart**; the only difference is the RPC URL it is currently using.

Consequence: the **same address** (for example Anvil account 5) can have a different ETH balance, token balance, allowance, transaction count and order history on 8545, 8546 and 8547. On 8547 account 5 sent five transactions; on 8545 it may have sent none.

## B3. The danger: frontend and MetaMask on different nodes
If the website at `localhost:3101` reads 8547 but MetaMask's RPC is 8545:
- the website shows balances from 8547, MetaMask shows balances from 8545;
- a transaction you sign is sent to **8545**, where the contract state (or the contract itself) differs, and the website will not see it;
- MetaMask's cached nonce for your account may not match the node it is now talking to (see [F](#part-f-common-mistakes-and-troubleshooting)).

Rule: **the browser URL you open and the RPC URL in MetaMask must belong to the same pair** (3000 with 8545, 3100 with 8546, 3101 with 8547).

## B4. Check what is running (read-only)
Do not assume any of the three is up.

```bash
# 🔍 Which ports are listening, and by which program?
ss -ltnp | grep -E ':(3000|3100|3101|8545|8546|8547)\b'

# 🔍 Is a chain answering, what is its chain ID, and what block is it at?
export PATH="$HOME/.foundry/bin:$PATH"
for p in 8545 8546 8547; do
  echo "$p: chain $(cast chain-id --rpc-url http://127.0.0.1:$p 2>&1)  block $(cast block-number --rpc-url http://127.0.0.1:$p 2>&1)"
done

# 🔍 Is a website answering? (prints the HTTP status, 200 = up)
for p in 3000 3100 3101; do echo "$p: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$p)"; done

# 🔍 The all-in-one environment check (it never deploys or sends anything)
bash scripts/check-local.sh                                                       # main pair
bash scripts/check-local.sh --rpc-url http://127.0.0.1:8547 --web-url http://localhost:3101
```
"Connection refused" or an empty `ss` line simply means that service is not running now.

---

# Part C. First-time setup (Windows with WSL Ubuntu)

The commands are taken from the repository's own README and [DEPLOYMENT.md](DEPLOYMENT.md). Use **three WSL terminals** for a working session.

## C1. Open WSL and find the repository
1. Press the Windows key, type **Ubuntu** (or open **Windows Terminal** and choose the Ubuntu profile).
2. Go to the project folder and confirm you are on the right branch:
```bash
cd ~/projects/SC4053-BlockChain-Technology/SC4053-BlockChain-Project   # 🔍 adjust to where you cloned it
ls                                                                      # you should see README.md, contracts, web, docs, scripts
git branch --show-current                                               # 🔍 read-only
```
Work inside WSL (Linux paths), not in `/mnt/c/...`, so file watching and permissions behave.

## C2. Install the tools (once per machine)
| Tool | Why | Check |
|---|---|---|
| Node.js 22.18 or newer, npm | runs the website and the exporter | `node --version` |
| Foundry (`forge`, `anvil`, `cast`) | compiles, tests, runs the chain | `forge --version` |

Install Foundry if `forge` is not found (✏️ downloads software; the official installer is at https://getfoundry.sh):
```bash
curl -L https://foundry.paradigm.xyz | bash
# open a NEW terminal, then:
foundryup
```
If `forge` is still not found, add Foundry to your PATH for this and future terminals:
```bash
echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.foundry/bin:$PATH"
```
This guide was checked with Foundry 1.9.0 and Node 26; the README lists the minimum versions.

## C3. Install dependencies and compile (once per clone)
```bash
cd contracts && forge build && cd ..     # ✏️ compiles the Solidity contracts into contracts/out/ ; ends with "Compiler run successful"
cd web && npm ci && cd ..                # ✏️ installs the website's exact dependency versions from package-lock.json
```
**Why compile?** The deploy script and the ABI exporter read the compiled files in `contracts/out/`.

## C4. The six steps of a working session
Anvil keeps state **only while it runs**. Remember the two facts that surprise beginners:
- **Starting Anvil does not deploy anything.** A fresh node has accounts with test ETH and *no contracts at all*.
- **Rebuilding or merging source code does not upgrade contracts that are already deployed.** A deployed contract is frozen bytecode on that chain. To run new contract code you must deploy again, which means a fresh chain.

A restart of Anvil gives a new, empty chain at block 0: the contracts, tokens, markets, balances and orders all disappear, and the generated addresses may be stale.

| # | Terminal | Command | Why / what it changes |
|---|---|---|---|
| 1 | 1 | `anvil` ✏️ | Starts the chain on port 8545 (chain ID 31337). Leave it running. The banner lists accounts and the mnemonic |
| 2 | 2 | `cd contracts && forge build` ✏️ | Compiles (skip if already built) |
| 3 | 2 | deploy (below) ✏️ | Sends the deployment transactions: factories, NTU, SGDx and the NTU/SGDx market |
| 4 | 2 | export (below) ✏️ | Writes `web/lib/contracts/abis.ts` and `deployments.ts` so the website knows the ABIs and addresses |
| 5 | 2 | `bash scripts/check-local.sh` 🔍 | Confirms node, chain ID, contracts and generated files agree |
| 6 | 3 | `cd web && npm run dev` ✏️ | Starts the website on port 3000 |

**Deploy** (from the repository root; `--unlocked --sender` uses Anvil's built-in unlocked account 0, so **no private key is involved**):
```bash
export RPC_URL=http://127.0.0.1:8545
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266      # Anvil account 0's public address
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"
cd ..
```
The script refuses any chain that is not 31337. Leaving out `--broadcast` simulates without sending.

**Export the ABIs and addresses:**
```bash
node contracts/script/export-web.mjs --rpc-url "$RPC_URL"
```
The exporter refuses to write if the broadcast is incomplete, a contract has no code, or the deployed bytecode does not match your current build. A refusal is protective; read the message. Check without writing: `node contracts/script/export-web.mjs --check --rpc-url "$RPC_URL"` 🔍.

**Check the environment:**
```bash
bash scripts/check-local.sh                       # 🔍 expects the RPC on 8545 and the site on 3000
```
Each line starts with PASS or FAIL; fix the first FAIL.

**Start the website** (terminal 3):
```bash
cd web
npm run dev                                       # ✏️ expect "Local: http://localhost:3000"
```
Open **http://localhost:3000** in your browser. With no wallet connected you can already see markets and the order book (reads only).

On a fresh Anvil with account 0 at nonce 0 the addresses are deterministic (the market is `0xCafac3dD18aC6c6e92c921884f9E4176737C052c`), but always trust what the exporter wrote, not a table.

---

# Part D. MetaMask setup

Menu names change between MetaMask versions. The ideas stay the same; if a label differs, look for the equivalent.

## D1. Install or open MetaMask
Install the official extension from https://metamask.io in your browser (Chrome, Brave, Edge or Firefox). Create a wallet and **set it up only for development**. Write down its recovery phrase safely if you wish, but this wallet should hold **no real assets**; use a separate browser profile if you also use MetaMask for real funds.

## D2. Add the local Anvil network
*Network selector, Add a custom network* (or *Settings, Networks, Add network, Add a network manually*):

| Field | Value |
|---|---|
| Network name | `Anvil Local` (any label) |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | leave empty |

Save, then select **Anvil Local**. **Why the RPC URL matters:** it is the address MetaMask will send your signed transactions to.

## D3. Connect the wallet to the DEX
1. Open the website (`http://localhost:3000`).
2. Press **Connect wallet** and choose **MetaMask**.
3. MetaMask opens a **connection permission** request for the site. Choose the account(s) you want to allow and confirm.
4. The site now shows your address and "Anvil (local), chain ID 31337".

**Importing an account into MetaMask is not the same as connecting it to the DEX.** Importing puts the key in MetaMask; connecting gives *this website* permission to see that account's address and request signatures. If the permission popup is hidden, click the **Extensions (puzzle) icon** in your browser toolbar and open **MetaMask** to find the pending request.

## D4. Selecting the intended account
Open the MetaMask account selector and choose the account. **Verify the address**, not the label: MetaMask labels imported accounts in import order ("Imported Account 1"), which has nothing to do with Anvil's account numbering. After switching, check that the **website** also shows the new address; it may take a moment, or you may need to reconnect it (see [F](#part-f-common-mistakes-and-troubleshooting)).

## D5. Edit an existing custom network
Open the network list, find **Anvil Local**, choose its settings (or *Settings, Networks, Anvil Local*), edit the field, and save. Use this to change the RPC URL.

## D6. Add a second RPC URL under chain ID 31337
**Why MetaMask may refuse a second network:** MetaMask identifies networks by chain ID. If you try *Add a custom network* with chain ID 31337 again, it may say the chain ID is already in use. You do not need a second network; add a **second RPC URL to the existing one**:
1. Open **Anvil Local**'s settings.
2. In the **RPC URL** area choose **Add RPC URL**, enter `http://127.0.0.1:8547`, give it a name such as `Anvil scratch 8547`, and save.
3. Select that RPC URL as the network's active endpoint.

If your version allows only one URL per network, **edit** the URL (D5) and remember to change it back.

## D7. Switch safely between 8545, 8546 and 8547
1. Decide which pair you are about to use (Part B): 3000/8545, 3100/8546 or 3101/8547.
2. Select the matching RPC URL in MetaMask.
3. **Verify:** the website's block number must equal `cast block-number --rpc-url http://127.0.0.1:<port>`. If it differs, MetaMask or the site is on another node.
4. Use only the website of that pair while MetaMask points at it.

## D8. Restore the main RPC afterwards
When you finish a scratch test: select `http://127.0.0.1:8545` again (or edit the URL back), reload `http://localhost:3000`, and check its block number equals the 8545 node's block. Remove the extra RPC URL if you will not need it.

## D9. Browser URL versus MetaMask RPC URL

| | Browser URL | MetaMask RPC URL |
|---|---|---|
| Example | `http://localhost:3101` | `http://127.0.0.1:8547` |
| What it is | The **website** you look at | The **chain** MetaMask sends transactions to |
| Who uses it | You | MetaMask |
| Program behind it | Next.js | Anvil |

Never confuse them: typing the RPC URL into the address bar shows a JSON error, and the website URL is not an RPC.

---

# Part E. Development accounts and the mnemonic

## E1. Anvil's deterministic accounts
Anvil creates 10 accounts from one **mnemonic** (a 12-word phrase). They are **deterministic**: the same phrase always gives the same accounts in the same order. They are numbered by **index starting at 0**: account 0 is the first.

The default mnemonic is **publicly known**:

```text
test test test test test test test test test test test junk
```

**It is NEVER suitable for real assets.** Anyone can derive these keys, and bots watch these addresses on real networks. Use it only on a local, disposable Anvil.

## E2. Is your node actually using the default mnemonic?
Do not assume. Anvil prints a `Mnemonic:` line in its banner, and a node started with `--mnemonic` uses another phrase. Check without exposing a key by comparing addresses:
```bash
export PATH="$HOME/.foundry/bin:$PATH"
M="test test test test test test test test test test test junk"          # the public default phrase
cast wallet address --private-key "$(cast wallet private-key "$M" 5)"     # 🔍 derives account 5's address (the key is never printed)
cast rpc eth_accounts --rpc-url http://127.0.0.1:8547                     # 🔍 the node's own account list (index 5 is the sixth)
```
If the derived address equals the node's account at the same index (account 5 is `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` on a default node; checked against the 8547 node), the node uses the default mnemonic.

## E3. Deriving a development private key
```bash
read -r -s ANVIL_MNEMONIC          # paste the phrase from the Anvil banner, press Enter (nothing is echoed)
cast wallet private-key "$ANVIL_MNEMONIC" 5      # prints account 5's DEVELOPMENT key; do not save or share it
unset ANVIL_MNEMONIC               # forget the phrase in this shell
```
Equivalent long form: `cast wallet private-key --mnemonic "$ANVIL_MNEMONIC" --mnemonic-index 5`.

**Why `ANVIL_MNEMONIC` must be set first.** If you run the command in a new terminal where `ANVIL_MNEMONIC` was never set, the shell replaces `"$ANVIL_MNEMONIC"` with an **empty string**, and `cast` fails with `Error: the word `` is invalid` (an empty word). Set the variable for the **current terminal session** (`read -r -s ANVIL_MNEMONIC`, or `export ANVIL_MNEMONIC="..."`) before you use it; it does not carry over to other terminals or after `unset`.

## E4. Importing a development account into MetaMask, safely
1. Derive the key as in E3 and keep it on screen only as long as needed.
2. MetaMask: account selector, **Add account or hardware wallet**, **Import account**, type **Private Key**, paste, **Import**.
3. **Verify the address** under the new account matches the address you expect (for account 5: `0x9965…A4dc`).
4. Clear your clipboard and terminal history if you wish; never paste the key into a file, a screenshot, a chat or the repository.

## E5. Roles used in our tests
These are **scenario labels, not privileged smart contract roles**. The contracts give no special power to any account; "keeper" simply means "an account that sent the trigger or match transaction".

| Index | Address starts | Label in the tests | Used for |
|---|---|---|---|
| 0 | `0xf39F…` | Deployer / Alice | Deploys; holds the remaining token supply; seller in the main walkthrough |
| 1 | `0x7099…` | Bob (or another trader) | Buyer in the main walkthrough |
| 2 | `0x3C44…` | Trader | The bidder in the Bonus 2 and Bonus 3 seed scripts |
| 3 | `0x90F7…` | Carol / another trader | A seller in the seed scripts |
| 4 | `0x15d3…` | Bonus 2 keeper | Sent the `matchOrders` transaction; holds no NTU or SGDx |
| 5 | `0x9965…` | Bonus 3 Stop Order Owner | Placed the stop-limit orders |
| 6 | `0x976E…` | Bonus 3 Tester Keeper 2 | Sent the `triggerStopOrders` transaction; holds no tokens |

---

# Part F. Common mistakes and troubleshooting

**Always diagnose first, with read-only commands.** Clearing MetaMask activity, dropping a transaction from Anvil or restarting a chain is **never** the first step; it is a last, targeted step on a **disposable** chain after you have identified the exact problem.

## F1. The five read-only questions
```bash
export PATH="$HOME/.foundry/bin:$PATH"; R=http://127.0.0.1:8547     # 🔍 set R to the RPC you are testing
cast chain-id --rpc-url $R                                          # is it the chain I think? (31337)
cast block-number --rpc-url $R                                      # compare with the block shown in the website
cast code <contract-address> --rpc-url $R | head -c 20              # "0x" alone means NO contract there (fresh chain?)
cast nonce <account> --rpc-url $R                                   # the next nonce the chain accepts (latest)
cast nonce <account> --block pending --rpc-url $R                   # including transactions still in the pool
```
Also check **which account** MetaMask has selected, **which account the website shows** and **which RPC URL** MetaMask uses.

## F2. Troubleshooting table

| Symptom | Likely explanation | Safe diagnostic | Recovery | Do not |
|---|---|---|---|---|
| MetaMask keeps stale nonce info after a chain reset | MetaMask caches nonces **per chain ID**; a restarted Anvil is back at nonce 0 but MetaMask remembers the old count | `cast nonce <acct>` versus the nonce MetaMask shows | Use a fresh account, or on a **disposable** chain clear MetaMask's activity data for that account (Settings, Advanced, Clear activity tab data) | Don't clear activity on a chain whose history you need; don't assume the chain is broken |
| MetaMask shows a pending transaction that never confirms | The nonce is above what the chain expects (a gap), or the node never received it | `cast tx <hash>` (empty block number = pending); compare latest and pending nonces | Reject/replace from MetaMask once; on a disposable chain, after identifying the hash, `cast rpc anvil_dropTransaction <hash>` then clear activity | Don't click Speed up or Cancel repeatedly; don't restart the node or revert it after MetaMask has sent to it |
| A nonce above Anvil's expected next nonce | An earlier transaction was lost, or the chain was reset | latest vs pending nonce vs MetaMask's | Fix the gap (resend the lost transaction) or use a fresh account | Don't keep submitting; each one waits behind the gap |
| A transaction is in Anvil's pool but unmined | Gap or rejected nonce; Anvil normally mines instantly | `cast tx <hash>`, `cast nonce` latest vs pending | As above | Don't assume it will confirm by waiting |
| Several RPC instances share chain ID 31337 | Local chains are independent but labelled the same | Compare block numbers (Part B) | Select the RPC URL that matches the website | Don't trust the network *name* in MetaMask |
| Frontend and MetaMask target different ports | Website reads one node, MetaMask sends to another | Website block number vs `cast block-number` on the RPC MetaMask uses | Pair them (Part D7) | Don't sign anything until they match |
| Wallet imported but not connected to the DEX | Importing ≠ connecting | The site shows "Connect wallet" or another address | Press **Connect wallet**; approve the site permission (check the Extensions menu) | Don't re-import the account |
| Switching MetaMask's account did not update the DEX | The site keeps the previously connected account until it receives the change | Compare the address on the site with MetaMask's selected one | Reload, or disconnect and reconnect that account | Don't assume a bug in the order list |
| **My orders** seems to show another user's orders | The DEX is still connected to the previous account (confirmed in the Bonus 3 test: not an isolation bug) | The address shown on the site | Connect the intended account | Don't report a data leak without checking the connected address |
| Anvil has no contracts after restart | A restart wipes state | `cast code <market>` is `0x`; `check-local.sh` FAILs | Redeploy and re-export (Part C4) | Don't just restart the website |
| Approved, but no order exists | **An ERC20 approval is not an order.** It only grants a spending permission | Check `allowance` and the order list | Press the **Place order** step after the approval | Don't approve again repeatedly |
| "Insufficient allowance" | The allowance is smaller than the escrow needed | `cast call <token> "allowance(address,address)(uint256)" <you> <market>` | Send a separate approval transaction for the exact amount | Don't approve an unlimited amount |
| A pending stop is eligible but has not activated | Eligibility is only tested **inside** a `triggerStopOrders` call; nobody has sent one | My orders reads "Eligible now…"; `triggerStopOrders(10)` simulation is above 0 | Anyone (a keeper, no tokens needed) sends **Trigger stops** | Don't wait for another trade; it is not needed |
| An activated stop only partly filled | It trades as a taker against what rests; the rest becomes an ordinary order at its limit price | `getOrder` status PartiallyFilled, filled < amount | Nothing wrong: the remainder rests in the book | Don't call activation a fill |

## F3. Dropping a transaction or clearing activity, step by step (disposable chains only)
1. Run the F1 diagnostics and write down account, nonce, hash.
2. Confirm the chain is one you can lose (a scratch Anvil, not 8545).
3. `cast rpc anvil_dropTransaction <hash> --rpc-url http://127.0.0.1:8547` removes **that one** pooled transaction. It answers `null` and changes nothing if the hash is not in the pool.
4. In MetaMask, clear the activity data for that account (it clears MetaMask's cache of activity and nonce, not the chain or your keys).
5. Retry the original step once.
6. Restore the main RPC (D8).

See also TESTING.md section 14-2 and [DEPLOYMENT.md](DEPLOYMENT.md).

---

# Part G. Feature walkthroughs

The authoritative click-by-click steps are in [TESTING.md](TESTING.md); here you learn what each feature means. Numbers are from the project's own tests.

## G1. ERC20 token issuance
**What:** the **TokenFactory** deploys a new `DemoToken` (18 decimals, fixed supply) to the creator. **How:** in the app, the **Create token** page (`/create-token`). **Result to look for:** the new token's address and symbol in the receipt, and your balance of it. **Test:** TESTING.md Test 8.

## G2. Market creation
**What:** the **MarketFactory** creates an `OrderBook` for a token pair and registers it; the site's market selector lists registered markets. One market exists per unordered pair, so listing the same pair twice is refused (`MarketExists`); the page to list one is `/list-market`. **Test:** TESTING.md Test 8.

## G3. Normal limit orders: buy and sell
Alice sells 10 NTU at 2 SGDx. Because a sell escrows base tokens, she first **approves** 10 NTU, then **places** the order: 10 NTU move into the market's escrow. Bob buys 4 NTU with a limit of 2.2: a buy escrows quote tokens (he approves and escrows the cost at his limit, 8.8 SGDx).

## G4. The order book, bids, asks, spread and depth
- **Bids** are buy orders (highest price first); **asks** are sell orders (lowest first).
- **Spread** = best ask − best bid. A normal book has a positive spread; a crossed book (best bid ≥ best ask) means orders could trade but have not.
- **Market depth** adds up the quantity at each price level.
- Only **open** orders appear. A pending stop-limit order, a filled order and a cancelled order are not part of the live book.

## G5. Maker pricing and partial fills
A trade executes at the **maker's** price (the order that was resting first), not the taker's limit. Bob's bid of 2.2 meets Alice's ask of 2: the trade is at **2**, 4 NTU for 8 SGDx, and Bob gets the difference back (0.8 SGDx of escrow). Alice's order is **partially filled** (4 of 10); 6 NTU keep resting.

**A fill is not an order and not a transaction.** One transaction can create zero, one or many fills; each fill is one `Trade` event between a maker order and a taker order. An order can be filled in many fills across many transactions.

## G6. Bonus 1: cancellation and refunds
The owner of an open, partly filled or pending-stop order can cancel it; the engine returns the **unfilled escrow** (sell: remaining base; buy: leftover quote; stop: the whole escrow). Real tested journey: Alice sold 5 NTU at 2, Bob filled 2, Alice cancelled the 3 NTU remainder, got 3 NTU back and escrow remaining was 0; the cancelled order stays in My orders as history. **Test:** TESTING.md Test 12.

## G7. Bonus 2: multi-party batch matching and crossed books
**Why a book can be crossed:** one placement may fill at most **10** orders in a transaction (`MAX_MATCHES_PER_TX = 10`), to bound gas. The seed script builds: **22 sell orders** of 1 NTU at 2, then **two buy orders** of 11 NTU each (at 3 and at 2.5). Each buy fills 10 asks automatically (**20 automatic fills** in total) and stops at the cap, leaving 1 NTU still crossing. A **keeper** (any account) then sends one `matchOrders(10)` that settles **two more fills** (22 trades in total). No keeper is built in: matching the rest is an explicit, permissionless transaction. **Test:** TESTING.md Test 13; script `scripts/seed-crossed-book.sh`.

## G8. Bonus 3: stop-limit placement, eligibility, activation and execution

**Five different prices.** Keep them apart:

| Price | Meaning |
|---|---|
| **Last trade price** | The price of the most recent trade **in this market**. The contract uses this, not any external price feed or oracle. It exists only after the first trade |
| **Trigger price** | The condition that makes a stop **eligible**: a **sell** stop when last trade ≤ trigger, a **buy** stop when last trade ≥ trigger (equality counts) |
| **Limit price** | The worst price you accept **after** activation, and the price your escrow is computed at. If nothing fills, the remainder rests in the book at the limit price |
| **Resting maker price** | The price of an order already waiting in the book that your activated stop trades against |
| **Actual execution price** | The maker's price. Not the trigger, not your limit |

**The lifecycle:**
1. **Place** (`placeStopLimitOrder`): escrow is taken at once at the **limit** price; the order becomes **Pending trigger**, outside the order book.
2. **Waiting for price:** the rule is false at the current last trade price.
3. **Eligible now:** the rule is true. The order is **still pending** and escrowed. **It does not need another trade.** It needs someone to send `triggerStopOrders`.
4. **Activation:** a keeper (anyone, no tokens, no approval) sends `triggerStopOrders(10)`; the engine checks eligibility, emits `StopOrderTriggered`, and the stop becomes an ordinary order that trades as a **taker** in the same transaction, then rests or is refunded if it cannot enter a very deep book.
5. **Execution** may follow, partly, fully or not at all.

**Our real tested journey (scratch chain 8547, owner-run in MetaMask, chain-verified):** a sell stop for 10 NTU with **trigger 1.8** and **limit 1.7**. The last trade was 2.0 (waiting), then 1.9 (waiting), then 1.8 (eligible, still pending). A resting buy of 4 NTU at **1.9** existed. The keeper's trigger transaction activated the stop and it filled 4 NTU for **7.6 SGDx** at **1.9**, the maker's price. The remaining 6 NTU rest as an ordinary sell at 1.7.

**Why trigger 1.8 and limit 1.7 can fill at 1.9:** the trigger only decides *when* the order may activate and the limit only sets the *lowest acceptable* price for a seller. The seller trades at the resting bid's price, 1.9, which is better than both, so it is accepted.

**Why trigger = limit does not guarantee a fill:** the trigger only makes the order eligible. After activation there must still be a resting order at an acceptable price, and the price can move before the keeper's transaction.

**A sudden move below the sell limit:** if the last trade jumps from 2.0 down to 1.5 (below a sell limit of 1.7), the stop becomes eligible and activates, but no bid at or above 1.7 may exist; it then **rests unfilled** at 1.7 and nothing is executed. A stop-limit protects your *minimum price*, not your *execution*.

**Price source caution:** because the engine's price is the market's own last trade, trading in that market moves it. Stop orders are not price protection against a thin or manipulated market. **Test:** TESTING.md Test 14; script `scripts/seed-stop-orders.sh`.

---

# Part H. Reproducible manual testing

The **authoritative procedures** are in [TESTING.md](TESTING.md). This part tells you how to approach them; it deliberately does not copy their steps, so there is only one version to keep correct.

## H1. Before any manual test
| Question | Answer |
|---|---|
| Prerequisites | Parts C and D done; MetaMask on the right RPC; accounts imported with verified addresses |
| Terminals | One for the chain (Anvil), one for `cast` and the scripts (repository root), one for the website (`web/`) |
| RPC and website | Main: 8545 + 3000. Bonus 2: 8546 + 3100. Bonus 3: 8547 + 3101 |
| Which account | The one the test names (Alice 0, Bob 1; Bonus 2 keeper 4; Bonus 3 owner 5, keeper 6) |
| State-changing actions | Any click on **Confirm** in MetaMask, `cast send`, `seed-*.sh seed/prepare/move-price/add-bid`, a deploy |
| Read-only checks | `seed-*.sh status` and `verify-after`, `cast call`, `check-local.sh` |

## H2. The tested journeys

| Journey | What you do | What changes | PASS looks like | Where |
|---|---|---|---|---|
| **Main flow** (Tests 1 to 6) | Alice sells 10 NTU at 2, Bob buys 4 at 2.2 | Escrow, one trade at 2, balances | Alice partly filled with 6 NTU left; Bob 4 NTU richer | TESTING.md Tests 1 to 6 |
| **Bonus 1: cancel** (Test 12) | Cancel Alice's remainder | Escrow refunded, status Cancelled | Refund shown equals the event and the token transfer; escrow remaining 0 | Test 12 |
| **Bonus 2: match** (Test 13) | `seed-crossed-book.sh seed` on 8546, keeper account 4 presses **Match orders** | 20 automatic fills before, 2 keeper fills | "Matched: 2 fills settled"; `verify-after` every check PASS; book no longer crossed | Test 13 |
| **Bonus 3: stop-limit** (Test 14) | `seed-stop-orders.sh prepare`, owner places stops, price moved with `move-price`, keeper triggers | Escrow at placement, activation + one fill | Order partly filled; owner NTU 100 → 90 and SGDx 100 → 107.6; keeper's balances unchanged; market 6 NTU and 0 SGDx; `verify-after` PASS | Test 14 |

## H3. A pass is more than "it looked right"
A step passes only when the **screen**, the **transaction** and the **chain** agree:
1. The app shows the expected status and numbers.
2. The receipt/transaction page lists the expected events (for example `StopOrderTriggered`, one `Trade`).
3. A read-only check agrees (`cast`, or `seed-*.sh verify-after` printing PASS on every line).

## H4. Collect evidence
- **Screenshots:** the review card, the MetaMask request, the result card, My orders, and the transaction page. Name them as TESTING.md section D suggests. Never include a key or recovery phrase.
- **Transaction hashes:** copy the full hash from the app's result or the receipt. You can list a block's transactions with `cast rpc eth_getBlockByNumber <hex block> false --rpc-url <RPC>`.
- Write down the RPC URL, block numbers and date next to each result.

## H5. Interpret each verification result
- `PASS … StopOrderTriggered` and "FROM the keeper": the activation really came from the keeper account, not the owner.
- `PASS … keeper still holds no NTU and no SGDx`: triggering needs no tokens and the keeper gained nothing.
- `PASS … solvent`: the market holds exactly what its open orders still owe.
- Any `FAIL`: stop and read the line; do not edit the test to pass.

## H6. Recover from an interruption without destroying evidence
1. **Stop clicking.** Note the last transaction hash shown, if any.
2. Run the read-only questions (F1) on the chain you were using.
3. If a request is open in MetaMask, reject it or confirm it deliberately; never both quickly.
4. **Do not** restart, reset or revert the chain after MetaMask has sent to it: that destroys the history you are testing and desyncs MetaMask's nonce.
5. Re-run `status` (read-only) to see where the scenario stands, then continue from the next step.

---

# Part I. What the tests actually prove

No single layer proves the whole system safe. Each answers a different question.

| Layer | What it checks | What it can **not** show |
|---|---|---|
| **Solidity unit and invariant tests** (`forge test`, 335 tests recorded) | The contract rules on random and edge inputs: escrow conservation, price-time priority, bounded loops, solvency | How the website, the wallet or a human use it |
| **Frontend unit tests** (`npm test`, vitest) | Pure logic: amount parsing, eligibility rules, receipt decoding, error wording, runners against a fake chain | The real chain or a real wallet |
| **Automated real-chain integration tests** | The app's runners against a real scratch Anvil and the real contracts | The browser UI, MetaMask |
| **Browser automation with a mock wallet** (`npm run e2e…`, Playwright) | Real pages, clicks, labels, states, accessibility, against a real scratch chain | Real MetaMask behaviour: it uses an **injected stand-in**, so it says nothing about MetaMask |
| **Human-operated MetaMask tests** (TESTING.md) | The real wallet flow end to end | Anything the human did not do; each report states which cases were run |
| **Static analysis** (for example Slither, linting, type checking) | Known bug patterns and type errors in code | Whether the design is right |
| **Independent audit and review** | A fresh reader's view of design, security and process | That the reviewed state is the deployed state, or that nothing changed after |

**A green run proves only what it checked, in that environment.** It is not a statement about a production network.

**Why honest failure records matter.** The SC4053 AI Audit Report asks what the AI got wrong and how it was found and fixed. Records such as "the first stop-limit browser run failed 1 of 17", "a cancelled stop was labelled Activated until the owner's MetaMask run exposed it", or "this case was not performed" are the evidence that the verification was real. Hiding or softening them removes exactly the information a reviewer needs. See the [AI Audit Report](report/AI_AUDIT_REPORT.md) and `docs/ai-audit/` for the project's records.

---

## Where to go next
- Run the environment: [README Quick Start](../README.md), then [DEPLOYMENT.md](DEPLOYMENT.md).
- Follow a test step by step: [TESTING.md](TESTING.md).
- Understand the results and open issues: [AI Audit Report](report/AI_AUDIT_REPORT.md).
