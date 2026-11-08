# Local deployment and ABI export (Person 2)

Local Anvil only (chain id 31337). `run()` refuses any other chain: it checks Forge's chain id **and** asks the node itself (`eth_chainId`), because Forge's `--chain 31337` flag alone can make Forge report 31337 against any node. The independent reviewer reproduced that bypass against a node reporting chain id 1 (11 transactions were broadcast). I re-ran the same command after the fix and it fails with `WrongChain(1)` and sends nothing. No private key is used anywhere: Anvil's accounts are unlocked, so the node signs for its own account. `--rpc-url` is required, because the node is queried.

**Integration status:** `MarketFactory` is the accepted way to create markets. The script creates the seed NTU/SGDx market through it, and the frontend lists and trades markets from its registry. Person 1 has been notified of this decision; no separate review is recorded. `CONTRACT_INTERFACE.md`'s deployment handoff describes this flow. See `docs/MARKET_FACTORY.md`.

## What gets deployed
| Contract | Role |
|---|---|
| `TokenFactory` | issues ERC20 tokens (`DemoToken`, 18 decimals, fixed supply) |
| `MarketFactory` | creates and registers `OrderBook` markets, one per unordered token pair |
| `NTU` ("NTU Token") | base token, 1,000,000 issued to the deployer |
| `SGDx` ("Singapore Dollar X") | quote token, 1,000,000 issued to the deployer |
| NTU/SGDx `OrderBook` | created through `MarketFactory.createMarket(NTU, SGDx)` |

Demo wallets: each receives 10,000 NTU and 10,000 SGDx. Default wallets are Anvil accounts 1 to 3. The deployer (account 0) keeps the rest.

## Reproduce on a fresh Anvil
Prerequisites: Foundry (`forge`, `anvil`, `cast`) and Node 22.18 or newer on `PATH` (`export PATH="$HOME/.foundry/bin:$PATH"`). The exporter itself is plain ESM. Node 22.18 or newer (type stripping on by default) is only needed because the exporter's tests import the generated TypeScript.

```bash
# 1. A fresh chain (a new Anvil starts at block 0 with all accounts funded and unlocked)
anvil

# 2. Deploy (from the repo root). DEPLOYER is Anvil account 0's public address.
export RPC_URL=http://127.0.0.1:8545
export DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"
cd ..

# 3. Export ABIs and addresses for the front end
node contracts/script/export-web.mjs --rpc-url "$RPC_URL"
```
Omit `--broadcast` for a simulation only. `--unlocked --sender` replaces any private key. Never put a key in a file, a command or a log.

On a fresh Anvil with account 0 at nonce 0, addresses are deterministic. These are the values observed in this project's runs on a fresh chain:

| | Address |
|---|---|
| TokenFactory | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| MarketFactory | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| NTU | `0xa16E02E87b7454126E5E10d957A927A7F5B5d2be` |
| SGDx | `0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968` |
| NTU/SGDx market | `0xCafac3dD18aC6c6e92c921884f9E4176737C052c` |

On a chain where the deployer has already sent transactions, addresses differ. Always use what the exporter writes, not this table.

### Options
- `DEPLOYER`: public address that deploys (default Anvil account 0). It must be unlocked on the node.
- `DEMO_WALLETS`: comma-separated wallets to fund (default Anvil accounts 1 to 3), for example `DEMO_WALLETS=0xAbc...,0xDef... forge script ...`. The list may not contain the zero address, the deployer or duplicates.
- Fund another wallet later (account 0 holds the remainder):
  ```bash
  cast send "$NTU"  "transfer(address,uint256)" "$WALLET" 10000ether --from "$DEPLOYER" --unlocked --rpc-url "$RPC_URL"
  cast send "$SGDX" "transfer(address,uint256)" "$WALLET" 10000ether --from "$DEPLOYER" --unlocked --rpc-url "$RPC_URL"
  ```
  (`ether` here is just the 1e18 multiplier, since both tokens have 18 decimals.)

## Export mechanism
`contracts/script/export-web.mjs` is dependency-free Node. It writes two generated files to `web/lib/contracts/`:
- `abis.ts`: `tokenFactoryAbi`, `demoTokenAbi`, `marketFactoryAbi`, `orderBookAbi`, each `as const` for viem and wagmi type inference. They are copied from Foundry's `contracts/out/` artifacts, never written by hand.
- `deployments.ts`: chain id, deploy block, deployer, both factories, the market, and both tokens (address, name, symbol, decimals). It holds no timestamp and no block hash, so a second fresh Anvil produces the same bytes.

How it stays honest:
1. Only the two factory addresses come from Forge's broadcast file (`contracts/broadcast/Deploy.s.sol/31337/run-latest.json`). The market and tokens are read back from the chain through the factories' registries.
2. The broadcast must be **complete**: nothing pending, one receipt per transaction, every receipt successful. An interrupted or partly failed deployment is refused. (The independent reviewer reproduced an interrupted `--slow` broadcast being exported as if complete before this check existed.)
3. It checks the live chain id, that the recorded deployment block still exists with the same hash, and that every contract has code.
4. The **deployed bytecode must equal the current build artifacts** (`contracts/out`) for both factories, the market and both tokens, with `OrderBook`'s immutable slots masked because they hold the token addresses. So if the contracts change and are rebuilt without a redeploy, the exporter refuses instead of pairing a new ABI with old addresses.
5. The market must be the **seed market**: built from the first two tokens issued by the `TokenFactory`, base first. A market someone else listed first (for example the opposite orientation) is refused even though it is registered. It also checks that both tokens came from the `TokenFactory`, that both have 18 decimals, and that `MarketFactory.getMarket(base, quote)` returns the market.
6. Every check happens before anything is written. A failure writes nothing.
7. Output has no timestamps, so re-running without a redeployment changes nothing.
8. `--check` writes nothing and exits non-zero if the files differ from what the exporter would generate.

### Redeployment and stale addresses
- After a redeploy, run the exporter again. The broadcast file is overwritten, and the exporter reads the latest deployment.
- After an Anvil restart without a redeploy, the exporter stops with `stale deployment ...` and tells you to redeploy. This covers both a chain that is shorter than the recorded block and a chain whose block at that height has a different hash.
- MetaMask caches nonces per network, so after restarting Anvil you will probably need MetaMask's "Clear activity tab data" for the 31337 network. This is standard MetaMask behaviour and has **not been tested in this project**.
- `contracts/broadcast/*/31337/` is gitignored. `web/lib/contracts/*.ts` is not. Whether to commit `deployments.ts` is your decision: it is only correct for a chain deployed the same way (a fresh Anvil, deployer at nonce 0). On such a chain it is byte-identical every time, which was checked on three separate fresh chains, so `--check` works as a CI-style guard there.

## The local flow, one step at a time
Each step does one job. None of them does the job of another.

| Step | Command (directory) | What it does | What it does **not** do |
|---|---|---|---|
| 1. Start the chain | `anvil` (anywhere) | Starts an empty local chain at block 0 with funded, unlocked accounts | Deploy anything. A fresh Anvil has no contracts, no tokens and no markets |
| 2. Compile | `forge build` (`contracts/`) | Writes `contracts/out/` artifacts from the Solidity source | Change any contract already on a chain. Compiling, pulling or merging source never upgrades deployed contracts |
| 3. Deploy | `forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --unlocked --sender "$DEPLOYER"` (`contracts/`) | Creates the factories, NTU, SGDx and the seed market on **that** chain | Tell the frontend where they are |
| 4. Export | `node contracts/script/export-web.mjs --rpc-url "$RPC_URL"` (repo root) | Writes `web/lib/contracts/abis.ts` and `deployments.ts` after checking the chain | Deploy, or change the chain |
| 5. Check | `scripts/check-local.sh` (repo root) | Read-only: tools, chain id, code at each exported address, export current, app answering | Fix anything. It prints PASS, WARN or FAIL and an exit status |
| 6. Frontend | `npm run dev` (`web/`) | Serves the app, which reads the chain over `NEXT_PUBLIC_RPC_URL` (default `http://127.0.0.1:8545`) | Deploy, or reach a chain its RPC URL does not point at |

**Restarting Anvil** without restoring persisted state removes everything from the former chain: contracts, custom tokens, market listings, balances, orders and trades. The new chain is at block 0. Redeploy and export, then expect the wallet to need a nonce reset (below). **Rebuilding or merging source code** changes `contracts/out/` and nothing on the chain: a market keeps the engine it was deployed with, which is why the exporter compares deployed bytecode with the current build.

## Troubleshooting a local chain
Diagnose first. Every command here is read-only. Replace `RPC_URL` (for example `http://127.0.0.1:8545`) and use the addresses from `web/lib/contracts/deployments.ts`.

| Symptom | Likely cause | How to confirm (read-only) |
|---|---|---|
| App says "No SC4053 DEX deployment on this chain" | Anvil restarted, or the app points at another node | `scripts/check-local.sh` |
| Exporter or check reports a contract address has no bytecode | Same: those addresses are from a chain that no longer exists, or the RPC is a different node | `cast code <address> --rpc-url "$RPC_URL"` prints `0x` |
| MetaMask transaction pending indefinitely | A nonce gap: MetaMask used a nonce higher than the chain's next nonce, so Anvil holds the transaction until the earlier nonces are filled | Compare `latest` and `pending` nonces (below) with the nonce shown in MetaMask's transaction details |
| Nonce gap after a local Anvil restart | MetaMask keeps its own per-network nonce and activity from the former chain; the new chain started again at nonce 0 for each account | `cast nonce <account> --rpc-url "$RPC_URL"` is lower than the nonce MetaMask used |
| Same chain id, different RPC URL | `31337` identifies the network type, not the node. Two Anvils (for example 8545 and 8546) both say 31337 but hold different state | `cast block-number --rpc-url` on each URL, and `cast code` for the market on each |
| Frontend and MetaMask disagree | The app reads `NEXT_PUBLIC_RPC_URL`; MetaMask uses the RPC set on its own network entry. They can be different nodes | Compare the two URLs. Run `cast code` and `cast block-number` against **both** |

**Safe diagnostics.** None of these sends a transaction or changes the chain.
```bash
cast chain-id      --rpc-url "$RPC_URL"                      # expect 31337
cast block-number  --rpc-url "$RPC_URL"                      # a fresh Anvil is near 0
cast nonce <account> --rpc-url "$RPC_URL"                    # next nonce the chain will accept (latest)
cast nonce <account> --block pending --rpc-url "$RPC_URL"    # includes transactions waiting in the pool
cast tx <txHash>   --rpc-url "$RPC_URL"                      # blockNumber empty or null: still pending
cast code <MarketFactory address> --rpc-url "$RPC_URL"       # 0x means nothing is deployed there
cast call <MarketFactory address> "marketCount()(uint256)" --rpc-url "$RPC_URL"   # read-only registry read (observed on 8545 for this session: 1)
```
`pending` greater than `latest` means transactions are waiting. A transaction with a nonce above `latest` is **blocked by a gap**, not slow.

**Recovering from a nonce gap.** In this order:
1. **Confirm which node and which network.** Check the chain id, block number and the RPC URL MetaMask is using. Make sure you are looking at the same node as the app.
2. **Inspect the pending transactions** with `cast tx` and the nonce commands above. Do not act on a transaction you have not identified by hash, sender and nonce.
3. **Decide whether the chain is disposable.** Everything below applies only to a local development chain. Never reset or restart a chain someone else is using just to fix MetaMask.
4. On a disposable Anvil, after you have confirmed a specific transaction is still pending, you may remove it from the node's pool: `cast rpc anvil_dropTransaction <txHash> --rpc-url "$RPC_URL"`. This is an Anvil-only method; it does not exist on a real network. (Checked on 2026-11-08 against a scratch Anvil with a hash that was not in the pool: it answered `null` and changed nothing.)
5. In MetaMask use *Settings, Advanced, Clear activity tab data* for the local network (the wording varies by version). It clears MetaMask's cached nonces and activity for the selected account only; it does not touch the chain or your keys.
6. Retry the transaction. Do not change the application to compensate for stale wallet state.

This is a wallet synchronisation problem in the local development environment. It is not a Solidity defect. It is also separate from the P2-8B preflight test contamination, which came from a leftover ERC20 allowance on a scratch chain (`docs/ai-audit/test-evidence/person2/p2-8b01-preflight.md`).

## What each kind of change does to state
| Action | What happens on the chain | What happens to the app |
|---|---|---|
| **Restart Anvil with fresh state** (no persistence) | The earlier chain is gone: every contract, token balance, order and trade. The new chain starts at block 0 | Run the deploy and export again. Until then the app reports no deployment |
| **Deploy more contracts on the same chain** | Existing contracts, balances, orders and trades stay where they are. Nothing is deleted | `deployments.ts` is unchanged unless the exporter's seed addresses change. Other markets are found through the registry |
| **Change the exported addresses** (a redeploy on the same chain) | The new deployment is new state. Old contracts and orders do **not** move to it | The app reads only the addresses in `deployments.ts`, so it shows the new set |
| **Change OrderBook and redeploy MarketFactory** | Existing markets keep their deployed bytecode. Only markets created by the new factory use the new engine. Nothing migrates | Run the exporter again. Old markets stay registered in the old factory |

**Create more markets** through `MarketFactory.createMarket`, from the app's **List market** page or with `cast send`. Each new market is a separate, immutable OrderBook with its own empty book and its own escrow. The exporter records only the seed NTU/SGDx market; other markets are discovered from the registry.

**Size and gas after engine changes.** The factory embeds OrderBook's creation code, so bonus features may increase factory size. Run `forge build --sizes` after each engine change (the factory must stay below 24,576 B runtime and 49,152 B initcode), and measure deployment gas with `forge test --gas-report` before relying on a figure.

## Size check
`MarketFactory` embeds `OrderBook`'s creation code, so it grows with the engine. After any engine change run:
```bash
cd contracts && forge build --root . --sizes
```
Observed on 2026-11-08 (P2-8B.1, with all four bonus functions implemented): `OrderBook` 8,461 B runtime and 9,124 B initcode; `MarketFactory` 10,508 B runtime and 10,537 B initcode (limits: 24,576 B runtime, 49,152 B initcode). Earlier, with the bonus functions still stubs, they were 6,325 / 6,974 B and 8,358 / 8,387 B. `Deploy.t.sol` also asserts these limits.

## Smoke trade on the deployed market (no wallet needed)
SPEC section 3 worked example with real transactions. Set `NTU`, `SGDX` and `MKT` from `web/lib/contracts/deployments.ts` (`baseToken.address`, `quoteToken.address`, `market`). Account 1 sells 10 NTU at 2.0. Account 2 buys 4 NTU at a limit of 2.2.
```bash
NTU=0x...   # baseToken.address
SGDX=0x...  # quoteToken.address
MKT=0x...   # market
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8; A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
REQ=$(cast call "$MKT" "requiredQuote(uint256,uint256)(uint256)" 4000000000000000000 2200000000000000000 --rpc-url "$RPC_URL" | cut -d' ' -f1)
cast send "$NTU"  "approve(address,uint256)" "$MKT" 10000000000000000000 --from $A1 --unlocked --rpc-url "$RPC_URL"
cast send "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 1 2000000000000000000 10000000000000000000 --from $A1 --unlocked --rpc-url "$RPC_URL"   # side 1 = Sell
cast send "$SGDX" "approve(address,uint256)" "$MKT" "$REQ" --from $A2 --unlocked --rpc-url "$RPC_URL"
cast send "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 0 2200000000000000000 4000000000000000000 --from $A2 --unlocked --rpc-url "$RPC_URL"    # side 0 = Buy
```
Expected afterwards: account 1 holds 9,990 NTU and 10,008 SGDx; account 2 holds 10,004 NTU and 9,992 SGDx (paid 8, refunded 0.8 of the 8.8 escrow); the market holds 6 NTU and 0 SGDx; `lastTradePrice()` is 2e18.

## What this does and does not prove
- **Checked with `forge`, `anvil` and `cast` (commands run by hand in this project, not an automated pipeline):** the deploy script, the export, redeploy, stale-chain detection, the chain-id guard bypass and its fix, custom `DEPLOYER` and `DEMO_WALLETS`, and the smoke trade, all on scratch Anvils. See `docs/ai-audit/test-evidence/person2/p2-3-deployment.md` for exact commands and results.
- **Not verified:** any MetaMask or browser flow, any UI, and any chain other than a local Anvil.
- The script's post-deployment checks run against the state the script just built. Under `--broadcast` that is Forge's simulation. The exporter and the checks above are what confirm the live chain.
- The four bonus functions are now implemented and the compiled `OrderBook` ABI names their parameters (`cancelOrder(orderId)`, `matchOrders(maxMatches)`, `placeStopLimitOrder(side, triggerPrice, limitPrice, amount)`, `triggerStopOrders(maxCount)`); checked on 2026-11-08 against `contracts/out`, and the committed `web/lib/contracts/abis.ts` is byte-identical to a fresh scratch export (`p2-8b01-preflight.md`). Earlier versions of this file said these parameters were unnamed while the functions were stubs.
