# DEX project (SC4053): rules for Claude Code

## Source of truth
- SPEC.md and CONTRACT_INTERFACE.md define behaviour. Do not invent functions, events,
  or errors that are not in CONTRACT_INTERFACE.md. If a change seems needed, stop and
  propose it instead of implementing it.
- CONTRACT_INTERFACE.md is a DRAFT until Person 2 confirms it; after that it is frozen.
- The official assignment brief (docs/project.pdf) overrides everything.
- docs/ENGINE_PHASES.md is the engine build order. Work one phase at a time.

## Ownership
- Person 1: contracts/src/OrderBook.sol, contracts/src/interfaces/, contracts/test/OrderBook*,
  contracts/test/invariant/, contracts/test/mocks/, SPEC.md, docs/ENGINE_PHASES.md.
- Person 2: TokenFactory, DemoToken, contracts/script/, web/, README.
- Shared (both must agree to changes): CLAUDE.md, CONTRACT_INTERFACE.md, contracts/foundry.toml.
- Only edit files owned by the person running this session unless explicitly asked.

## Commands
- Windows / Git Bash: Foundry lives in `~/.foundry/bin`. `~/.bashrc` adds it to PATH
  (`export PATH="$HOME/.foundry/bin:$PATH"`). If `forge` is not found, run that line first.
- Build: `cd contracts && forge build`
- Test: `cd contracts && forge test`
- Verbose trace for one test: `forge test --match-test <name> -vvvv`
- Format: `forge fmt`
- Gas: `forge test --gas-report`

## Engine rules
- Solidity ^0.8.20, OpenZeppelin SafeERC20 and ReentrancyGuard.
- PRICE_SCALE = 1e18. Quote cost = amount * price / PRICE_SCALE.
- LOT_SIZE = TICK_SIZE = 1e9: amount % LOT_SIZE == 0 and every price % TICK_SIZE == 0,
  so every cost is exact. Still: buy escrow rounds up, payments to sellers round down,
  leftover quote is refunded on close (safety net, see SPEC.md rule A6).
- Execution at the maker price. Price-time priority: ties at equal price go to the lower internal
  `bookSeq`, stamped when an order enters the book (at placement, or at stop activation). Never
  use the order ID for priority. `bookSeq` stays internal: it is not in the interface or the Order struct.
- Every loop over orders has an explicit upper bound. triggerStopOrders shares ONE fill
  budget of MAX_MATCHES_PER_TX across the whole call.
- Checks-effects-interactions in every function that moves tokens; all external writes nonReentrant.
- Custom errors only, no revert strings.

## Working rules
- Small, scoped changes. One feature per task.
- Write or update tests in the same task as the code. Run `forge test` before saying done,
  and report the actual result.
- Never weaken or delete a failing test to make it pass; explain the failure instead.
- Never claim something was run or verified unless you ran it in this session.
- Do not commit, push, or switch branches unless asked.
- Never print or commit private keys. Anvil keys are local-only.
- Log each session in docs/ai-audit/prompt-log.md (date, phase, prompt summary,
  what the AI got wrong, what the human did).
- When you find a real bug in earlier AI-written code, add an entry to
  docs/ai-audit/issues/ using the brief's format: why the AI made the mistake,
  why it is problematic, how it was fixed, evidence the fix works (test output).
