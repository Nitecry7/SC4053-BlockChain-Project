# SC4053 DEX: a non-custodial limit-order-book exchange

A small decentralized exchange for the NTU **SC4053 Blockchain Technology** course project. It is an **order book, not an AMM**: traders post buy and sell limit orders, the smart contract matches them on-chain at the resting order's price with price-time priority, and partial fills are supported. Tokens stay in the trader's own wallet until an order escrows them. Everything runs on a **local Anvil chain** (chain ID 31337); nothing is deployed to a public network.

The official assignment brief is kept locally (`docs/Development_Project.pdf`, git-ignored) and is authoritative for requirements. This README is a quickstart. Details live in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/FRONTEND.md`](docs/FRONTEND.md) and [`docs/TESTING.md`](docs/TESTING.md).

## What works today

| Requirement | Status |
|---|---|
| Issue new ERC20 tokens (R4) | **Done in the browser (P2-6):** Create token form, review, wallet signature, receipt, event decoding and on-chain verification; the token appears on the Tokens page. Verified with a mock wallet and a scratch chain; **not yet with MetaMask** (procedure in `docs/TESTING.md`, Test 8) |
| List a token pair as a market (R2) | **Done in the browser (P2-6):** List market form with base/quote explanation, duplicate and reversed-pair detection, permanence acknowledgement, verified result and a link to Trade. Verified with a mock wallet and a scratch chain; **not yet with MetaMask** |
| Buy and sell limit orders, automatic matching, partial fills (R5, R6) | **Done.** Place orders in the browser with MetaMask; exact approvals, simulation, receipt-based results, My orders, transaction page |
| Self-custody (R3) | Done: signing happens only in the wallet; no key is ever used by the app |
| Bonus: cancel an order, batched matching, conditional (stop-limit) orders | **Not implemented.** The engine's `cancelOrder`, `matchOrders`, `placeStopLimitOrder` and `triggerStopOrders` still revert, so the UI offers none of them |
| AI Audit Report evidence | Prompt logs, issue reports and test evidence in `docs/ai-audit/` |

**Verification status.** The SPEC worked example (Alice sells 10 NTU at 2 SGDx, Bob buys 4 NTU at a limit of 2.2) has been checked three separate ways: on a scratch chain by automated tests, in a browser with a **mock** wallet, and **by the project owner with real MetaMask accounts in Windows Brave**. See the evidence in `docs/ai-audit/test-evidence/person2/p2-5-trading.md`.

## Architecture and stack
```
Windows browser (Brave) + MetaMask  --signs-->  wallet
        |  RainbowKit / wagmi / viem
        v
Next.js app (localhost:3000)  --reads chain over HTTP JSON-RPC-->  Anvil (127.0.0.1:8545, chain 31337, runs in WSL)
                                                                     |- TokenFactory -> DemoToken (NTU, SGDx; 18 decimals)
                                                                     |- MarketFactory -> OrderBook (one per token pair)
```
- **Contracts:** Solidity 0.8.24, Foundry (`forge`, `anvil`, `cast`), OpenZeppelin. `OrderBook` is the matching engine (Person 1); the factories, deployment script and exporter are Person 2's.
- **Front end:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, RainbowKit 2, wagmi 2, viem 2, TanStack Query. No backend, database or indexer: the browser reads the chain directly.
- **Units:** both tokens have 18 decimals; prices are quote units per whole base token scaled by 1e18; lot and tick size are 1e9.

## Repository map
| Path | What is in it |
|---|---|
| `contracts/src/` | `OrderBook.sol`, `TokenFactory.sol`, `MarketFactory.sol`, `DemoToken.sol` |
| `contracts/test/` | Foundry tests (185) |
| `contracts/script/` | `Deploy.s.sol` (deployment), `export-web.mjs` (writes ABIs and addresses for the front end) |
| `web/` | The Next.js app. `web/lib/contracts/` is **generated** by the exporter |
| `scripts/check-local.sh` | Read-only environment check (see below) |
| `docs/` | `DEPLOYMENT.md`, `FRONTEND.md`, `TESTING.md`, `MARKET_FACTORY.md`, the engine plan and phases, and `ai-audit/` (prompt logs, issues, test evidence) |
| `SPEC.md`, `CONTRACT_INTERFACE.md` | Engine behaviour and the frozen contract interface (shared; do not edit casually) |
| `PRODUCT.md`, `DESIGN.md` | Product and design reference for the front end |

## Ports, in one table
| Port | What | Notes |
|---|---|---|
| **8545** | Your Anvil (local chain) | The chain MetaMask and the app talk to |
| **3000** | Your Next.js dev server (`npm run dev`) | The address you open in the browser |
| 8546, 3100 | Scratch Anvil and scratch app server for automated tests | Used by the test suites only; never your main chain |

---

# 1. First-time setup (once per machine)

### 1.1 Windows and WSL
1. In Windows PowerShell: `wsl --install -d Ubuntu`, then restart Windows if asked and finish Ubuntu's first-run user setup.
2. Do everything below **inside the Ubuntu (WSL) terminal**. Keep the project in the Linux filesystem (for example `~/projects/`), not under `/mnt/c`.
3. Install **MetaMask** in your Windows browser (this project was tested with Brave).

### 1.2 Tools
| Tool | Needed | Tested with |
|---|---|---|
| Node.js and npm | Node 22.18 or newer (`web/package.json` engines) | Node 26.13.0, npm 11.20.0 |
| Foundry (`forge`, `anvil`, `cast`) | recent | 1.9.0 |
| git | any | |

Install Foundry with its official installer (see https://getfoundry.sh): `curl -L https://foundry.paradigm.xyz | bash`, open a new terminal, run `foundryup`, and make sure it is on your `PATH`:
```bash
export PATH="$HOME/.foundry/bin:$PATH"      # put this line in ~/.bashrc
forge --version && anvil --version && cast --version
```
Install Node.js with your preferred method (for example `nvm`). Check: `node -v && npm -v`.

### 1.3 Get the code and build
```bash
# anywhere, e.g. ~/projects
git clone https://github.com/Nitecry7/SC4053-BlockChain-Project.git
cd SC4053-BlockChain-Project                         # <- "repo root" in this README
git submodule update --init --recursive              # forge-std and OpenZeppelin (needed to compile)

cd contracts && forge build && cd ..                 # contracts/
cd web && npm ci && cd ..                            # web/  (exact versions from package-lock.json)
```
Optional: `web/.env.example` documents `NEXT_PUBLIC_RPC_URL` (default `http://127.0.0.1:8545`) and an optional WalletConnect id. The defaults work; you do not need a `.env.local`.

### 1.4 MetaMask (once)
In MetaMask add a custom network (menu names vary slightly between MetaMask versions: *Settings, Networks, Add network, Add a network manually*):

| Field | Value |
|---|---|
| Network name | Anvil Local (any name) |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

**RPC connection versus wallet connection.** They are two separate things. The RPC URL is how a program *reads the chain*: the Next.js app reads balances, orders and trades from `127.0.0.1:8545` by itself, even with no wallet connected. MetaMask has its *own* RPC setting (the form above) so it can show balances and send transactions to the same node. "Connect wallet" in the app is something else again: it asks MetaMask for permission to see one of your accounts. The app and MetaMask must point at the **same** Anvil.

---

# 2. Every working session (after you restart Windows or WSL)

Anvil keeps its state **only while it runs**. After a restart it is a brand-new chain at block 0 with nothing deployed. Use three WSL terminals.

**Terminal 1: Anvil** (repo root or anywhere)
```bash
anvil
```
Expected: a banner listing `Available Accounts`, `Private Keys`, a `Wallet` section with the mnemonic, `Chain ID` `31337`, and finally:
```
Listening on 127.0.0.1:8545
```
Leave it running. Closing it destroys the chain.

**Terminal 2: check before you deploy** (repo root)
```bash
scripts/check-local.sh
```
This is read-only: it never deploys, never stops anything and never touches a key. It checks the tools, that the RPC answers with chain ID 31337, that every exported contract has code on *this* chain, that the export is current, and that the front end answers. A healthy result:
```
PASS  chain id 31337 at http://127.0.0.1:8545
PASS  tokenFactory has contract code at 0x5FbDB2315678afecb367f032d93F642f64180aa3
...
PASS  export is current: export-web: abis.ts, deployments.ts are up to date for chain 31337
Result: ready. 0 warning(s). No deployment is needed.
```
**Do not redeploy just to start the front end.** Decide from the result:

| The check says | Meaning | Do |
|---|---|---|
| `Result: ready` | Deployment exists and matches the export | Nothing. Go to step 3 |
| `no JSON-RPC answer` | Anvil is not running | Start Anvil (terminal 1) |
| `chain id is N` | Wrong network | Fix the RPC URL; never deploy to it |
| `NO contract code ... None of the exported contracts exist` | Fresh or restarted Anvil | **Deploy once** (section 3) |
| `export check failed` but the contracts *do* exist | The chain is fine; the export record is stale or from another run | Do **not** redeploy. See `docs/TESTING.md`, Troubleshooting |

**Terminal 3: the app** (`web/`)
```bash
cd web
npm run dev
```
Expected (taken from a real run; the port is `3000` by default):
```
▲ Next.js 16.4.5 (Turbopack)
- Local:         http://localhost:3000
✓ Ready in 223ms
```
Open **http://localhost:3000** in Windows Brave. The dashboard's Network card should say `Anvil (local)`, `Chain ID 31337` and a block number. If it instead says **"No SC4053 DEX deployment on this chain"**, the chain has no deployment (see the table above). Use **Connect wallet** to connect MetaMask.

---

# 3. Deploy and export (only on a fresh chain)

Do this only when the check reports no contract code. It creates `TokenFactory`, `MarketFactory`, the NTU and SGDx tokens (1,000,000 each, minted to Anvil account 0) and the NTU/SGDx `OrderBook`, and sends 10,000 NTU and 10,000 SGDx to Anvil accounts 1 to 3.

```bash
# contracts/
cd contracts
export RPC_URL=http://127.0.0.1:8545
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266     # Anvil account 0: a public address, not a key
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"
cd ..

# repo root: write the ABIs and addresses the front end reads
node contracts/script/export-web.mjs --rpc-url "$RPC_URL"
# repo root: confirm
node contracts/script/export-web.mjs --check --rpc-url "$RPC_URL"
```
Expected from the deploy (taken from a real run on a fresh chain):
```
== Logs ==
  deployer        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  TokenFactory    0x5FbDB2315678afecb367f032d93F642f64180aa3
  MarketFactory   0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  NTU (base)      0xa16E02E87b7454126E5E10d957A927A7F5B5d2be
  SGDx (quote)    0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968
  NTU/SGDx market 0xCafac3dD18aC6c6e92c921884f9E4176737C052c
...
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```
and from the check: `export-web: abis.ts, deployments.ts are up to date for chain 31337`.

- On a **fresh Anvil** these addresses are always the same, so the exporter leaves `web/lib/contracts/deployments.ts` unchanged. On a chain where account 0 has already sent transactions, addresses differ and the exporter rewrites that tracked file: always use what the exporter wrote, not this table.
- The script refuses any chain that is not 31337, uses no private key (Anvil's accounts are unlocked), and the exporter refuses to write unless the chain, the broadcast record and the build all agree. Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Where are the addresses?
- The app: **Tokens** and **Markets** pages show every token and market, with copyable addresses.
- The generated file: `web/lib/contracts/deployments.ts` (`tokenFactory`, `marketFactory`, `market` = the NTU/SGDx `OrderBook`, `baseToken` = NTU, `quoteToken` = SGDx).
- On the chain: `cast call <MarketFactory> "getMarkets(uint256,uint256)(address[])" 0 10 --rpc-url http://127.0.0.1:8545`.

### Import NTU and SGDx into MetaMask
With your Anvil network selected (menu names vary by MetaMask version): *Tokens, Import tokens, Custom token*, then paste the token **address** (from the file or the Tokens page). MetaMask normally fills the symbol and decimals; they should be `NTU` / `SGDx` and `18`. Repeat for the second token. Do this for each account that should show the balances.

---

# 4. Tests

| What | Where | Command |
|---|---|---|
| Contracts (185 tests) | `contracts/` | `forge test` |
| Exporter (21 tests) | repo root | `node --test contracts/script/export-web.test.mjs` |
| Front-end unit tests (368 pass, 48 gated tests skipped), types, lint, build | `web/` | `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` |
| Real-chain and browser suites | scratch chain only | see [`docs/FRONTEND.md`](docs/FRONTEND.md), "Testing" |

The real-chain and browser suites send transactions, so they run against a **separate scratch Anvil (port 8546) and a scratch server (port 3100)**, never your main chain: the real-chain suite refuses port 8545. Deploy to a scratch chain with `FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` pointing at a temporary folder, otherwise forge overwrites the record the exporter checks on your main chain (details in `docs/FRONTEND.md`).

To test by hand with MetaMask, follow the illustrated guide: **[`docs/TESTING.md`](docs/TESTING.md)**.

---

# 5. Troubleshooting (short)

| Symptom | Likely cause and first check |
|---|---|
| Dashboard: "No SC4053 DEX deployment on this chain" | Anvil was restarted. Run `scripts/check-local.sh`; deploy only if it says no contract code |
| "Cannot reach the local Anvil node" | Anvil is not running on 8545 (terminal 1) |
| App and MetaMask disagree (different balances, wrong network banner) | They point at different nodes or MetaMask is on another network. Network must be 31337 at `http://127.0.0.1:8545` |
| `export-web ... stale deployment` while the contracts exist | The exporter's record (`contracts/broadcast/.../run-latest.json`) is from another chain or run. Do not redeploy; see `docs/TESTING.md` |
| MetaMask spinning but no popup | The request is waiting behind the browser's *Extensions* icon. See the notice the app shows, and `docs/TESTING.md` |
| Transactions fail after an Anvil restart | MetaMask's cached nonce. Settings, Advanced, "Clear activity tab data" for that network (standard MetaMask behaviour) |
| `git status` shows `web/next-env.d.ts` modified | Next regenerates it on `dev` and `build`. It is generated; do not commit that change |
| Chromium test tooling: "error while loading shared libraries" | Missing system libraries (WSL). See `docs/TESTING.md`, Troubleshooting |

Everything else, with diagnosis steps, is in [`docs/TESTING.md`](docs/TESTING.md#e-troubleshooting-and-faq).

## Safety notes
- Anvil's default accounts, keys and mnemonic are **publicly known**. Use them only on local, disposable chains and never put real assets in them. No private key or seed phrase is stored in this repository.
- Never put a private key in a `NEXT_PUBLIC_` variable: those are shipped to the browser.
