# DEX Project: Trading Engine Plan (Person 1, built with Claude Code)

> **Who this is for:** Person 1, who owns the trading engine: `OrderBook.sol`, matching, escrow, settlement, cancellation, batch matching, stop-limit orders, engine security and contract tests.
> **Person 2** owns TokenFactory and demo tokens, deployment scripts, the Next.js frontend, wallet integration, frontend and end-to-end tests, README and docs.
> **Source of truth:** the official SC4053 brief (`project.pdf`, Section 5.1 and Section 2). The requirements quoted in section 3 below are checked against it. Design defaults are proposals until both teammates agree.
> **Deadline:** 8 Nov 2026 per the team plan (the brief itself does not state a date, so confirm on NTULearn). Internal target: engine feature-complete by 31 Oct.

## Contents

1. [How to use this file](#1-how-to-use-this-file)
2. [The 5-minute DEX primer (engine view)](#2-the-5-minute-dex-primer-engine-view)
3. [What you are building](#3-what-you-are-building)
4. [Engine design decisions](#4-engine-design-decisions)
5. [Contract interface (agree with Person 2 first)](#5-contract-interface-agree-with-person-2-first)
6. [Accounting rules and worked example](#6-accounting-rules-and-worked-example)
7. [Solidity you actually need](#7-solidity-you-actually-need)
8. [Repo layout and setup](#8-repo-layout-and-setup)
9. [CLAUDE.md for the repo](#9-claudemd-for-the-repo)
10. [Claude Code workflow](#10-claude-code-workflow)
11. [Build phases with ready-to-paste prompts](#11-build-phases-with-ready-to-paste-prompts)
12. [Testing plan](#12-testing-plan)
13. [Security checklist](#13-security-checklist)
14. [AI Audit Report: your sections and evidence](#14-ai-audit-report-your-sections-and-evidence)
15. [Integration with Person 2](#15-integration-with-person-2)
16. [Schedule from 28 Oct](#16-schedule-from-28-oct)
17. [If time runs out](#17-if-time-runs-out)
18. [Open decisions to confirm](#18-open-decisions-to-confirm)
19. [References](#19-references)

---

## 1. How to use this file

1. Read sections 2 to 6 once so you understand what the engine must do. You need to be able to explain every rule in the demo and report.
2. Copy section 9 into `CLAUDE.md` at the repo root, and copy sections 4 to 6 into `SPEC.md` and `CONTRACT_INTERFACE.md`. Claude Code reads `CLAUDE.md` automatically every session; the spec files are what it should build against.
3. Work through section 11 one phase at a time. Each phase has a prompt to paste into Claude Code, plus acceptance criteria. Do not move on until `forge test` is green and you understand the diff.
4. Log prompts, AI mistakes and fixes as you go (section 14). This is graded evidence, not an afterthought.

---

## 2. The 5-minute DEX primer (engine view)

| Term | Meaning in this project |
|---|---|
| Base token | The asset being bought or sold (e.g. NTU) |
| Quote token | The asset used to pay (e.g. SGDx) |
| Bid | Buy order: "I pay at most P quote per base" |
| Ask | Sell order: "I accept at least P quote per base" |
| Limit order | Order with a price bound; may rest on the book until filled or cancelled |
| Crossing | Best bid price >= best ask price, so a trade is possible |
| Maker / resting order | Order already on the book |
| Taker / incoming order | New order that hits resting orders |
| Price-time priority | Better price first; at equal price, earlier order first |
| Partial fill | Only part of an order trades; the rest stays open |
| Escrow | Tokens the contract holds on behalf of open orders |
| Stop-limit | Order that sits dormant until a trigger price is reached, then becomes a normal limit order |

Key facts the engine must respect:

- A smart contract never runs on its own. Matching only happens inside a transaction someone sends (placing an order, or calling the batch or trigger functions).
- A contract can only take a user's ERC20 tokens if the user first called `approve(orderBook, amount)` on the token. The engine then uses `transferFrom`.
- ERC20 amounts are integers in base units. With 18 decimals, 1 token = `1e18` units. There are no floats in Solidity.
- Every loop costs gas, so every loop over orders must have a hard upper bound.

---

## 3. What you are building

One contract, `OrderBook.sol`, for one trading pair (base/quote), deployed with the two token addresses. Person 2's tokens and frontend plug into it.

```text
Trader --approve()--> ERC20 (Person 2)
Trader --placeLimitOrder()--> OrderBook (you)
                               |- validate input
                               |- pull escrow via transferFrom
                               |- match against opposite side (price-time, bounded)
                               |- settle each fill, refund buyer price improvement
                               |- rest any remainder on the book
                               |- update lastTradePrice, emit events
Frontend (Person 2) <--events + view functions--
```

Engine features, in priority order:

| # | Feature | Type |
|---|---|---|
| 1 | Limit buy and sell orders with full escrow | Core |
| 2 | Automatic matching on placement, price-time priority | Core |
| 3 | Partial fills | Core |
| 4 | Correct settlement and refunds | Core |
| 5 | View functions for order book, user orders, best bid/ask | Core (frontend needs it) |
| 6 | Order cancellation with refund of unfilled escrow | Bonus |
| 7 | Bounded batch matching `matchOrders(maxMatches)` | Bonus |
| 8 | Stop-limit conditional orders | Bonus |

### What the brief actually requires (Section 5.1 of `project.pdf`)

| Brief wording | How the engine answers it |
|---|---|
| Submit buy and sell orders (limit orders required as baseline) | `placeLimitOrder` |
| Automatic execution of matched orders, supporting partial fulfillment | Matching runs inside `placeLimitOrder`; partial fills tracked by `filled` |
| Bonus 1: order cancellation for remaining unfulfilled token amounts | `cancelOrder` refunds only the unfilled part |
| Bonus 2: batched execution of multi-party order matching | `matchOrders(maxMatches)` settles many fills across many traders in one transaction |
| Bonus 3: conditional order support | Stop-limit orders via `placeStopLimitOrder` and `triggerStopOrders` |
| Users keep self-custody; contract is a non-custodial marketplace | No admin can move escrow; tokens only leave escrow to the counterparty or back to the owner |

The brief's two "tricky points" are questions the report should answer explicitly:

1. **How, how often, and who triggers on-chain execution?** Execution happens inside the taker's own `placeLimitOrder` transaction (taker pays the gas). Leftover crossings and triggered stop orders are cleared by `matchOrders` and `triggerStopOrders`, which anyone can call. Explain this in report Section 4.
2. **Should older orders get priority at equal price?** Yes: price-time priority, so the lower order ID fills first. Test it explicitly.

Flag: "multi-party" in Bonus 2 could be read more strictly (for example, ring or CoW-style matching among three or more traders). The design here is the simpler reading. Ask the TA on NTULearn if unsure, and state your interpretation in the report.

Out of scope: AMMs and liquidity pools, multiple pairs in one contract, fees, market orders, external oracles, upgradeability, off-chain matching.

---

## 4. Engine design decisions

Proposed defaults. Confirm with Person 2, then freeze them in `SPEC.md`.

| Decision | Default | Why |
|---|---|---|
| Pairs | One OrderBook per pair; base and quote set in constructor (immutable) | Removes pair-routing complexity |
| Decimals | Both demo tokens use 18 decimals; constructor reverts otherwise | Keeps price math simple; documented limitation |
| Price unit | Quote base units per 1 whole base token, scaled by `1e18` (`PRICE_SCALE = 1e18`) | Integer math with fractional prices |
| Amount unit | Base token base units | Matches ERC20 |
| Quote cost of a fill | `fillAmount * price / PRICE_SCALE` | Single formula used everywhere |
| Sell escrow | Lock `amount` of base | Seller can always deliver |
| Buy escrow | Lock `ceil(amount * limitPrice / PRICE_SCALE)` of quote | Buyer can always pay |
| Execution price | Resting (maker) order's price | Deterministic, standard |
| Price improvement | Buyer refunded the difference between locked and actual cost on each fill | No stuck funds |
| Priority | Best price first, then lowest order ID (earlier) | Price-time |
| Book storage | Per side, a sorted doubly linked list of order IDs (bids descending, asks ascending; ties by ID) | Best order is always the head; easy to remove on cancel |
| Insertion | Walk from head to find position, bounded by `MAX_INSERT_SCAN` | Bounded gas; revert if book is too deep (documented demo limit) |
| Matching on placement | Up to `MAX_MATCHES_PER_TX` fills, then rest remainder | Bounded gas |
| Batch matching | `matchOrders(maxMatches)` matches the heads of both sides while crossed, capped | Clears crossings left by the cap or by triggered stop orders |
| Cancellation | Owner only; refund remaining escrow; Open or PartiallyFilled only | No double refunds, no reversing trades |
| Stop-limit trigger | Uses `lastTradePrice`. Buy stop triggers when `lastTradePrice >= triggerPrice`; sell stop when `lastTradePrice <= triggerPrice` | Standard stop semantics, no oracle |
| Trigger initialisation | `hasTradePrice` bool; no trigger ever fires before the first trade | Zero is not a real price |
| Stop escrow | Escrow taken when the stop order is placed (same rules as a limit order) | Order is always funded when it activates |
| Triggering | `triggerStopOrders(maxCount)`, callable by anyone, bounded; activated orders go through normal matching | No background execution exists on-chain |
| Token transfers | OpenZeppelin `SafeERC20`, `ReentrancyGuard` on all state-changing externals | Defensive against odd tokens and reentrancy |
| Errors | Custom errors, not strings | Cheaper, easy to test with `vm.expectRevert` |
| Fees | None | Simpler accounting |

Known limitations to state honestly in the report: thin-market `lastTradePrice` is easy to manipulate, so stop orders are educational only; bounded scans mean a very deep book can make placement revert; 18-decimal assumption.

---

## 5. Contract interface (agree with Person 2 first)

Put this in `CONTRACT_INTERFACE.md` and treat it as frozen once agreed. Changing it later breaks the frontend.

```solidity
enum Side { Buy, Sell }
enum Status { Open, PartiallyFilled, Filled, Cancelled, PendingTrigger }

struct Order {
    uint256 id;
    address trader;
    Side side;
    uint256 price;          // limit price, PRICE_SCALE units
    uint256 triggerPrice;   // 0 for plain limit orders
    uint256 amount;         // original base amount
    uint256 filled;         // base amount filled so far
    uint256 lockedQuote;    // remaining quote escrow (buy orders only)
    uint64  createdAt;
    Status  status;
}

// Writes
function placeLimitOrder(Side side, uint256 price, uint256 amount) external returns (uint256 orderId);
function cancelOrder(uint256 orderId) external;
function matchOrders(uint256 maxMatches) external returns (uint256 matchesDone);
function placeStopLimitOrder(Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount) external returns (uint256 orderId);
function triggerStopOrders(uint256 maxCount) external returns (uint256 triggered);

// Views (for the frontend)
function getOrder(uint256 orderId) external view returns (Order memory);
function getBestBid() external view returns (uint256 orderId, uint256 price);
function getBestAsk() external view returns (uint256 orderId, uint256 price);
function getBook(Side side, uint256 maxOrders) external view returns (Order[] memory);
function getUserOrderIds(address trader) external view returns (uint256[] memory);
function lastTradePrice() external view returns (uint256);
function hasTradePrice() external view returns (bool);
function baseToken() external view returns (address);
function quoteToken() external view returns (address);

// Events (frontend listens to these)
event OrderPlaced(uint256 indexed orderId, address indexed trader, Side side, uint256 price, uint256 amount);
event Trade(uint256 indexed makerOrderId, uint256 indexed takerOrderId, address maker, address taker, uint256 price, uint256 baseAmount, uint256 quoteAmount);
event OrderCancelled(uint256 indexed orderId, address indexed trader, uint256 refundBase, uint256 refundQuote);
event StopOrderPlaced(uint256 indexed orderId, address indexed trader, Side side, uint256 triggerPrice, uint256 limitPrice, uint256 amount);
event StopOrderTriggered(uint256 indexed orderId, uint256 lastTradePrice);

// Errors
error ZeroAmount();
error ZeroPrice();
error NotOrderOwner();
error OrderNotActive();
error BookTooDeep();
error InvalidMaxCount();
error UnsupportedDecimals();
```

Also agree: who deploys what in `Deploy.s.sol`, where the ABI and addresses go for the frontend (e.g. `web/lib/contracts/`), and which order IDs start at 1 (so 0 means "none").

---

## 6. Accounting rules and worked example

### Rules

1. Placing a sell order pulls `amount` base into the contract.
2. Placing a buy order pulls `ceil(amount * limitPrice / 1e18)` quote into the contract and stores it in `lockedQuote`.
3. Each fill of size `q` at maker price `p`:
   - `cost = q * p / 1e18` (rounded down).
   - Seller receives `cost` quote. Buyer receives `q` base.
   - Buyer's `lockedQuote` decreases by the quote that this fill used up. Any price improvement is refunded to the buyer.
4. When a buy order becomes Filled or Cancelled, any remaining `lockedQuote` (including rounding dust) is refunded.
5. Cancelling refunds `amount - filled` base (sell) or remaining `lockedQuote` (buy).

### Worked example (both tokens 18 decimals; numbers in whole tokens for readability)

- Alice: sell 10 NTU at 2.0. Escrow: 10 NTU.
- Bob: buy 4 NTU at limit 2.2. Escrow: 4 x 2.2 = 8.8 SGDx.
- Bob's order crosses Alice's ask. Fill 4 NTU at maker price 2.0. Cost = 8 SGDx.
- Bob receives 4 NTU. Alice receives 8 SGDx. Bob is refunded 0.8 SGDx.
- Alice's order: filled 4 of 10, status PartiallyFilled, 6 NTU still escrowed.
- Contract holds exactly 6 NTU and 0 SGDx afterwards.

That last line is the invariant your tests should check after every operation.

---

## 7. Solidity you actually need

Learn these in order, and have Claude Code explain any line you don't understand before you accept it.

| Topic | Where it shows up in the engine |
|---|---|
| `uint256`, integer division, overflow (checked by default in 0.8) | All price math, rounding |
| `struct`, `mapping`, `enum` | `Order`, `orders[id]`, `Side`, `Status` |
| `storage` vs `memory` | Editing an order must use `storage`, or the change is lost |
| `msg.sender`, `external`/`internal`/`view` | Ownership checks, view functions |
| `require` / custom errors / `revert` | Input validation |
| `event` / `emit` / `indexed` | Frontend updates |
| ERC20 `approve` / `transferFrom` / `SafeERC20` | Escrow |
| Reentrancy, checks-effects-interactions, `nonReentrant` | Every function that transfers tokens |
| Bounded loops | Matching, insertion, batch, trigger |
| Foundry tests: `setUp`, `vm.prank`, `vm.expectRevert`, `assertEq`, fuzz params, invariants | Your test suite |

Checks-effects-interactions in one line: validate inputs, update all your state, then make external token calls last.

---

## 8. Repo layout and setup

```text
dex-project/
  CLAUDE.md                 # project rules for Claude Code (section 9)
  SPEC.md                   # sections 4 and 6
  CONTRACT_INTERFACE.md     # section 5
  README.md                 # Person 2
  .claude/
    commands/               # your reusable prompts (section 10)
  contracts/
    foundry.toml
    src/
      OrderBook.sol         # YOU
      interfaces/IOrderBook.sol  # YOU, written first from section 5
      TokenFactory.sol      # Person 2
      DemoToken.sol         # Person 2
    test/
      OrderBook.Place.t.sol
      OrderBook.Match.t.sol
      OrderBook.Cancel.t.sol
      OrderBook.Batch.t.sol
      OrderBook.Stop.t.sol
      OrderBook.Fuzz.t.sol
      invariant/OrderBookInvariant.t.sol
      invariant/Handler.sol
      mocks/MockERC20.sol   # so you are not blocked on Person 2's tokens
    script/
      Deploy.s.sol          # Person 2, you review
  web/                      # Person 2
  docs/
    ai-audit/
      prompt-log.md
      issues/               # one file per real bug found
      test-evidence/
```

### Setup checks (Git Bash on Windows)

```bash
git --version
forge --version
anvil --version
cast --version
claude --version
```

If Foundry is missing, follow the install steps in the Foundry Book for Windows. Then, inside `contracts/`:

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge build
forge test
```

Check how the repo already pins OpenZeppelin before installing a second copy. Slither needs Python; install it only when you reach the security phase.

---

## 9. CLAUDE.md for the repo

Copy this to `CLAUDE.md` at the repo root. Both teammates' Claude Code sessions will read it. Person 2 can add a frontend section below yours.

```markdown
# DEX project (SC4053): rules for Claude Code

## Source of truth
- SPEC.md and CONTRACT_INTERFACE.md define behaviour. Do not invent functions, events,
  or errors that are not in CONTRACT_INTERFACE.md. If a change seems needed, stop and
  propose it instead of implementing it.
- The official assignment brief overrides everything.

## Ownership
- Person 1: contracts/src/OrderBook.sol, contracts/src/interfaces/, contracts/test/OrderBook*,
  contracts/test/invariant/, contracts/test/mocks/.
- Person 2: TokenFactory, DemoToken, script/, web/, README.
- Only edit files owned by the person running this session unless explicitly asked.

## Commands
- Build: `cd contracts && forge build`
- Test: `cd contracts && forge test`
- Verbose trace for one test: `forge test --match-test <name> -vvvv`
- Format: `forge fmt`
- Gas: `forge test --gas-report`

## Engine rules
- Solidity ^0.8.20, OpenZeppelin SafeERC20 and ReentrancyGuard.
- PRICE_SCALE = 1e18. Quote cost = amount * price / PRICE_SCALE.
- Buy escrow rounds up; payments to sellers round down; leftover quote is refunded on close.
- Execution at the maker price. Price-time priority (lower order ID wins ties).
- Every loop over orders has an explicit upper bound.
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
- When you find a real bug in earlier AI-written code, add an entry to
  docs/ai-audit/issues/ using the brief's format: why the AI made the mistake,
  why it is problematic, how it was fixed, evidence the fix works (test output).
```

---

## 10. Claude Code workflow

### Session pattern for every feature

1. **Plan first.** Start in plan mode (Shift+Tab cycles modes) and ask for a plan before any edits. Read the plan and push back if it skips tests, adds unagreed functions, or has unbounded loops.
2. **Implement one scoped step.** Accept edits for one feature only.
3. **Make it prove it.** It runs `forge test` itself; you read the output, not its summary.
4. **Independent review.** Ask Claude Code to spawn a separate subagent that has not seen the implementation reasoning to review the diff against `SPEC.md` (prompt in section 11). This is also strong audit evidence.
5. **You review the diff** and make sure you can explain it, then commit yourself.
6. **Log it** in `docs/ai-audit/prompt-log.md`.

### Useful habits

- Use `/clear` between features so old context does not leak in. `CLAUDE.md` reloads automatically.
- Put repeat prompts in `.claude/commands/` as markdown files, so typing `/review-engine` runs your standard review. Suggested commands:
  - `review-engine.md`: the review prompt from Phase 7.
  - `log-issue.md`: "Write a docs/ai-audit/issues/ entry for the bug we just fixed, in the brief's 4-part format: (1) why the AI made the mistake, (2) why it is problematic (real-world impact), (3) how we fixed it, (4) evidence: regression test name plus forge test output before and after."
  - `explain-diff.md`: "Explain the current uncommitted diff line by line for someone learning Solidity, and point out anything risky."
- Ask "why" questions freely. You need to defend this code in the report and demo.
- Keep `CLAUDE.md` short and true. If Claude repeatedly makes the same mistake, add one rule for it.

---

## 11. Build phases with ready-to-paste prompts

Each phase ends with green `forge test` and a commit.

### Phase 0: Investigate (no edits)

```text
Read CLAUDE.md, SPEC.md, CONTRACT_INTERFACE.md and everything under contracts/.
Do not modify any files.
Report: what exists and is tested, what is missing versus the spec, any mismatch between
the interface and existing code, and any spec ambiguity that needs a human decision.
Separate verified facts from assumptions.
```

### Phase 1: Interface, mocks and skeleton

```text
Create contracts/src/interfaces/IOrderBook.sol exactly from CONTRACT_INTERFACE.md.
Create contracts/test/mocks/MockERC20.sol (18 decimals, public mint for tests).
Create OrderBook.sol implementing IOrderBook with constructor(base, quote), immutables,
PRICE_SCALE, MAX_MATCHES_PER_TX, MAX_INSERT_SCAN, order storage, and empty function
bodies that revert. Add a test file with a setUp that deploys mocks and the OrderBook,
mints to alice/bob/carol, and approves. forge build and forge test must pass.
```

Accept when: it compiles, the interface matches the doc exactly, setUp works.

### Phase 2: Place orders, escrow, resting on the book

```text
Implement placeLimitOrder WITHOUT matching yet: validation, escrow pull via SafeERC20
(buy escrow rounds up), insertion into the sorted linked list for that side
(bids descending, asks ascending, ties by order ID, bounded by MAX_INSERT_SCAN),
getOrder, getBestBid, getBestAsk, getBook, getUserOrderIds, OrderPlaced event.
Tests: zero amount/price revert, missing allowance reverts, escrow balances exact,
book ordering for several prices and equal-price ties, events emitted.
```

### Phase 3: Matching, settlement, partial fills

```text
Add matching inside placeLimitOrder: while the incoming order crosses the best opposite
order and fewer than MAX_MATCHES_PER_TX fills have happened, fill at the maker price,
settle per SPEC.md section "Accounting rules", refund buyer price improvement, update
filled/status, remove fully filled makers from the list, update lastTradePrice and
hasTradePrice, emit Trade. Rest any remainder.
Tests: exact match, taker partially fills maker, taker sweeps several makers at
different prices, equal-price FIFO, buyer price improvement refund, non-crossing order
rests, worked example from SPEC.md with exact balances, contract holds exactly the
outstanding escrow after every test.
```

### Phase 4: Cancellation (bonus 1)

```text
Implement cancelOrder per SPEC.md: owner only, Open or PartiallyFilled only, unlink from
the book, refund remaining escrow, status Cancelled, OrderCancelled event,
checks-effects-interactions.
Tests: cancel open order, cancel partially filled (refund only remainder), cancel filled
reverts, cancel twice reverts, cancel someone else's reverts, book links stay valid after
cancelling head, middle and tail.
```

### Phase 5: Batch matching (bonus 2)

```text
Implement matchOrders(maxMatches): revert if 0 or above MAX_MATCHES_PER_TX; while best bid
crosses best ask and under the cap, fill at the earlier (maker) order's price with the
same settlement code as Phase 3 (refactor into one internal function, do not duplicate).
Tests: set up a crossed book by placing orders that exceed the per-tx cap, then batch
clears it; cap is respected; multiple counterparties settle correctly; no-op when not
crossed.
```

### Phase 6: Stop-limit orders (bonus 3)

```text
Implement placeStopLimitOrder and triggerStopOrders per SPEC.md. Escrow at placement,
status PendingTrigger, stored outside the live book. No trigger before hasTradePrice.
triggerStopOrders(maxCount) activates eligible orders (buy: lastTradePrice >= trigger,
sell: lastTradePrice <= trigger), inserts them as normal limit orders and runs normal
matching. cancelOrder must also work for PendingTrigger orders.
Tests: cannot trigger before first trade, does not trigger on the wrong side of the
price, triggers and fills, triggers but rests when no liquidity, maxCount respected,
cancel pending stop refunds escrow.
```

### Phase 7: Independent review (repeat after every phase from 3 onward)

```text
Spawn a subagent to review OrderBook.sol and its tests against SPEC.md and
CONTRACT_INTERFACE.md. It must not rely on any explanation from this session.
Check: escrow accounting and rounding, refunds, reentrancy and CEI, access control,
unbounded loops, linked-list corruption, status transitions, interface drift, missing
tests. Return findings ranked by severity with a failing test idea for each.
Do not fix anything yet.
```

Then fix real findings one at a time, each with a regression test, and log them with `/log-issue`.

### Phase 8: Fuzz, invariants, static analysis

```text
Add fuzz tests for placement amounts and prices within sane bounds, and a Foundry
invariant test with a Handler that randomly places, cancels, batch matches and triggers
using alice/bob/carol. Invariants: base held by contract == sum of unfilled base on open
sell orders (including pending stops); quote held by contract == sum of lockedQuote on
open buy orders; filled <= amount for every order; bid list sorted descending, ask list
ascending; no order in the list has status Filled or Cancelled. Run them and report.
```

Then run `slither .` in `contracts/`, and have Claude Code triage each finding as real, false positive, or accepted risk with a reason. Keep the output for the report.

---

## 12. Testing plan

| Scenario | Expected |
|---|---|
| Zero amount or price | Reverts with custom error |
| No allowance / insufficient balance | Reverts, no state change |
| Non-crossing order | Rests, escrow held |
| Exact match | Both filled, exact balances |
| Partial fill (maker or taker) | Remaining amount and escrow correct |
| Sweep multiple price levels | Fills at each maker price, in priority order |
| Equal price | Earlier order fills first |
| Price improvement | Buyer refunded difference |
| Rounding dust | Refunded on close; contract never short |
| Match cap hit | Remainder rests; batch can clear later |
| Cancel open / partial | Only remainder refunded |
| Cancel filled / twice / not owner | Reverts |
| Batch with cap | Never exceeds cap |
| Stop before first trade | Never triggers |
| Stop triggered | Activates and matches normally |
| Book too deep | Reverts with `BookTooDeep` (documented limit) |
| Invariants after random sequences | All hold |

Run `forge coverage` near the end and aim for high line and branch coverage on `OrderBook.sol`. Coverage is a hint, not proof.

---

## 13. Security checklist

- [ ] All token movement uses `SafeERC20`.
- [ ] All state-changing externals are `nonReentrant` and follow CEI.
- [ ] Only the owner can cancel; statuses prevent double refunds.
- [ ] Every loop is bounded by a constant or a validated argument.
- [ ] Linked-list removal handles head, tail, middle and single-element cases.
- [ ] Rounding always favours the contract staying solvent.
- [ ] `hasTradePrice` guards all trigger logic.
- [ ] No admin backdoor that can move user escrow.
- [ ] Constructor rejects non-18-decimal tokens and identical base/quote.
- [ ] Slither findings triaged and recorded.
- [ ] Known limitations listed in the report (stop price manipulation, book depth cap, fee-on-transfer tokens unsupported).

---

## 14. AI Audit Report: your sections and evidence

From the team brief (confirm against the official headings):

| Section | Topic | Lead |
|---|---|---|
| 2 | Development Methodology and AI Tooling | You |
| 4 | AI-Generated Architecture | You |
| 5 | Problems Discovered and Vulnerability Analysis | Shared |
| 6 | Validation Process and Testing Strategy | You |
| 8 | Lessons Learned | Shared |

What to collect while building:

- **Section 2:** the brief asks for the AI tools used, any custom agents, scripts or spec files (your `CLAUDE.md`, `SPEC.md`, `.claude/commands/`), and how AI fitted into your division of labour. Describe the plan, implement, review, validate loop from section 10 and how subagent review was used.
- **Section 4:** Claude Code's Phase 0 to 1 design (data structures, linked list, accounting), what you accepted, what you changed and why.
- **Section 5:** every real bug from review, fuzzing, invariants or Slither, in `docs/ai-audit/issues/`. The brief (Section 2.2) requires this exact 4-part breakdown for every major issue:
  1. Why the AI made the mistake (e.g. lacked context on reentrancy, misread rounding direction).
  2. Why it is problematic (e.g. drainable funds, stuck tokens, wrong price).
  3. How you fixed it (code change, re-prompt or spec update).
  4. Evidence the fix works (failing then passing test logs, Slither output).
- **Section 6:** test matrix (section 12), invariant list, coverage numbers, Slither triage.
- **Also feed Person 2:** Section 3 (Specification Engineering and Prompt Logs) wants your formal spec files and representative prompt chains, so share your phase prompts and prompt log with them.
- **Prompt log:** date, phase, prompt summary, what the AI got wrong, what you did. Export or copy key session excerpts as you go.

Do not invent bugs or plant weaknesses to fill the report. Real issues from review and fuzzing are enough.

---

## 15. Integration with Person 2

What Person 2 needs from you, and when:

| Item | When |
|---|---|
| Agreed `CONTRACT_INTERFACE.md` | Day 1 (before either of you codes) |
| `IOrderBook.sol` compiled, so the ABI exists | End of Phase 1 |
| Working place/match on Anvil | End of Phase 3 |
| Final ABI (no more signature changes) | 31 Oct |
| Bug fixes from their end-to-end testing | Nov 3 to 4 |

What you need from Person 2: confirmed token decimals and names, the deploy script (you review the OrderBook part), and reports of any frontend call that hits an unexpected revert.

Integration risks to check together: frontend sending whole-token numbers instead of base units, price scaling mismatch, frontend showing success before confirmation, and approval amount for buys not matching the rounded-up escrow.

---

## 16. Schedule from 28 Oct

| Date | Your work |
|---|---|
| Wed 28 Oct | Agree interface and spec with Person 2, write CLAUDE.md, Phase 0 and 1 |
| Thu 29 Oct | Phase 2 and 3 (placing, matching, partial fills) |
| Fri 30 Oct | Phase 4 and 5 (cancel, batch), review pass |
| Sat 31 Oct | Phase 6 (stop-limit), freeze ABI. Internal feature-complete target |
| Sun 1 to Mon 2 Nov | Phase 8 (fuzz, invariants, Slither), fix findings |
| Tue 3 to Wed 4 Nov | Integration on Anvil with Person 2's frontend, fix integration bugs |
| Thu 5 to Fri 6 Nov | Write report sections 2, 4, 6 and your parts of 5, 8 |
| Sat 7 Nov | Clean deploy and full demo rehearsal together |
| Sun 8 Nov | Submit |

---

## 17. If time runs out

Cut from the bottom up:

1. Must ship: place, escrow, match, partial fills, settlement, views, tests.
2. Then cancellation.
3. Then batch matching.
4. Then stop-limit orders.
5. Invariant tests are worth more than polishing the stop-limit feature.

A correct, tested engine with two bonuses beats an untested one with three.

---

## 18. Open decisions to confirm

1. Whether the simple reading of Bonus 2 "multi-party" batch matching is acceptable (ask on NTULearn).
2. Whether a local Anvil demo is enough or a testnet deploy is expected.
3. Token decimals (default: 18 for both).
4. Whether Person 2 is fine with one OrderBook per pair and the interface in section 5.
5. Values for `MAX_MATCHES_PER_TX` and `MAX_INSERT_SCAN` (suggest 10 and 100, tune with `forge test --gas-report`).

---

## 19. References

- [NTU BlockchainCourseNTU resource repository](https://github.com/BlockchainCourseNTU/resource)
- [Foundry Book](https://book.getfoundry.sh/)
- [OpenZeppelin ERC20 and SafeERC20 docs](https://docs.openzeppelin.com/contracts/5.x/erc20)
- [OpenZeppelin ReentrancyGuard](https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard)
- [Solidity documentation](https://docs.soliditylang.org/)
- [Slither](https://github.com/crytic/slither)
- [Claude Code documentation](https://docs.claude.com/en/docs/claude-code/overview)

**Principle:** the engine is done when its accounting is provably correct, every loop is bounded, the tests and invariants pass, and you can explain every line.
