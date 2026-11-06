/**
 * Integration tests against a REAL local chain: the same validation, planner, runner (simulate, sign, receipt wait,
 * decode, reconcile) and estimator the UI uses, driven with Anvil's unlocked dev accounts through viem.
 *
 * This is NOT MetaMask and NOT a browser. It proves the lifecycle logic against the deployed contracts.
 *
 * It mutates the chain, so it only runs when explicitly enabled and refuses the default development chain:
 *   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run lib/trading.integration.test.ts
 * Each test runs inside evm_snapshot / evm_revert. Optional: E2E_EVIDENCE_FILE=<path> appends real tx hashes.
 */
import { appendFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, orderBookAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import { validateOrderInput, type Side } from "./order-input";
import { TICKET_BOOK_DEPTH, allowanceStep, estimateExecution, type ExecutionEstimate } from "./order-plan";
import { runApproval, runOrder, viemDeps, type ContractCall, type OrderOutcome } from "./order-runner";
import { collateralHeld, type OrderSnapshot } from "./order-status";
import { requiredQuote } from "./units";

const RPC = process.env.E2E_RPC_URL;
const ENABLED = Boolean(RPC);
const D = PRIMARY_DEPLOYMENT;
const MARKET = D.market as Address;
const NTU = D.baseToken.address as Address;
const SGDX = D.quoteToken.address as Address;
const E18 = 10n ** 18n;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};

// Anvil's public dev accounts (unlocked on the scratch chain). No private keys are used anywhere.
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address; // funded 10,000 NTU + SGDx by Deploy.s.sol
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const UNFUNDED = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address; // Anvil account 5: holds no NTU/SGDx

let pub: PublicClient;
let snapshot: string | undefined;

function note(label: string, data: Record<string, unknown>) {
  const file = process.env.E2E_EVIDENCE_FILE;
  if (!file) return;
  appendFileSync(file, JSON.stringify({ label, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
}

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const depsFor = (account: Address) =>
  viemDeps(pub, async (req) => {
    const call = req as ContractCall & { account: Address };
    return walletFor(account).writeContract({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, account, chain: foundry } as never);
  });

const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const getOrder = (id: bigint) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] }) as Promise<OrderSnapshot>;
const allowance = (token: Address, owner: Address) =>
  pub.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, MARKET] }) as Promise<bigint>;
const call = <T,>(functionName: string, args: readonly unknown[] = []) =>
  pub.readContract({ address: MARKET, abi: orderBookAbi, functionName, args } as never) as Promise<T>;

async function snapshotBalances(who: Address[]) {
  const out: Record<string, { ntu: bigint; sgdx: bigint }> = {};
  for (const a of [...who, MARKET]) out[a] = { ntu: await bal(NTU, a), sgdx: await bal(SGDX, a) };
  return out;
}

const ctxFor = (account: Address): FlowContext => ({ account, chainId: 31337, market: MARKET });
let attemptCounter = 0;

/** Drives one step through the real reducer, exactly as the hook does, and returns the final flow state. */
async function drive(step: typeof runApproval | typeof runOrder, account: Address, order: Parameters<typeof runOrder>[1]["order"], from?: FlowState<OrderOutcome>) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state = flowReducer(from ?? initialFlowState<OrderOutcome>(), {
    type: step === runApproval ? "START_APPROVAL" : "START_ORDER",
    attempt,
    ctx,
  });
  const events: FlowEvent<OrderOutcome>[] = [];
  await step(
    depsFor(account),
    { ctx, pair: { market: MARKET, baseToken: NTU, quoteToken: SGDX }, order, attempt },
    (e) => {
      events.push(e);
      state = flowReducer(state, e);
    },
    () => true,
  );
  return { state, types: events.map((e) => e.type) };
}

/** What the ticket does for a click on "Place order": validate, check allowance, approve if needed, then place. */
async function placeLikeTheUi(account: Address, side: Side, priceText: string, amountText: string) {
  const [lotSize, tickSize, ntu, sgdx] = await Promise.all([call<bigint>("LOT_SIZE"), call<bigint>("TICK_SIZE"), bal(NTU, account), bal(SGDX, account)]);
  const v = validateOrderInput({ side, priceText, amountText, lotSize, tickSize, balances: { base: ntu, quote: sgdx } });
  if (!v.ok) throw new Error(`validation failed: ${JSON.stringify(v.errors)}`);

  // Estimate from the book as it is right now (the opposite side), exactly as the ticket shows it.
  const opposite = (await call<OrderSnapshot[]>("getBook", [side === "buy" ? 1 : 0, BigInt(TICKET_BOOK_DEPTH)])).map((o) => ({ id: o.id, price: o.price, remaining: o.amount - o.filled }));
  const estimate = estimateExecution({ side, price: v.order.price, amount: v.order.amount, book: opposite, maxMatches: Number(await call<bigint>("MAX_MATCHES_PER_TX")), snapshotDepth: TICKET_BOOK_DEPTH });

  const token = v.order.collateralToken === "quote" ? SGDX : NTU;
  let approvalHash: Hex | undefined;
  if (allowanceStep(v.order.collateral, await allowance(token, account)) === "approval-required") {
    const a = await drive(runApproval, account, v.order);
    expect(a.state.phase, `approval failed: ${JSON.stringify(a.state.failure)}`).toBe("idle");
    approvalHash = a.state.approvalHash;
  }
  const o = await drive(runOrder, account, v.order);
  return { ...o, order: v.order, estimate, approvalHash };
}

const outcomeOf = (r: { state: FlowState<OrderOutcome> }) => {
  expect(r.state.phase, `order did not finish: ${JSON.stringify(r.state.failure)}`).toBe("done");
  return r.state.result!;
};

describe.skipIf(!ENABLED)("trading lifecycle on a real scratch chain (Anvil, unlocked dev accounts; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    const port = new URL(RPC).port;
    if (port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8546).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET });
    expect(code && code !== "0x", "the exported market has no code on this chain: deploy to the scratch chain first").toBe(true);
  });

  beforeEach(async () => {
    snapshot = (await pub.request({ method: "evm_snapshot" as never })) as string;
  });
  afterEach(async () => {
    if (snapshot) await pub.request({ method: "evm_revert" as never, params: [snapshot] as never });
  });
  afterAll(() => undefined);

  it("SPEC worked example: Alice sells 10 NTU @ 2, Bob buys 4 @ limit 2.2: trade at 2, Alice +8 SGDx, Bob +4 NTU, 0.8 SGDx refunded, 6 NTU stays escrowed", async () => {
    const before = await snapshotBalances([ALICE, BOB]);

    const a = await placeLikeTheUi(ALICE, "sell", "2", "10");
    const alice = outcomeOf(a);
    expect(alice.decoded.orderId).toBe(1n);
    expect(alice.atBlock.status).toBe(0); // resting
    expect(alice.problems).toEqual([]);

    const b = await placeLikeTheUi(BOB, "buy", "2.2", "4");
    const bob = outcomeOf(b);

    // The decoded receipt (what the UI shows)
    expect(bob.decoded.orderId).toBe(2n);
    expect(bob.decoded.trades).toHaveLength(1);
    expect(bob.decoded.trades[0]).toMatchObject({ makerOrderId: 1n, takerOrderId: 2n, price: dec("2"), baseAmount: dec("4"), quoteAmount: dec("8") });
    expect(bob.decoded.escrowPulled).toBe(dec("8.8"));
    expect(bob.decoded.refundQuote).toBe(dec("0.8"));
    expect(bob.problems).toEqual([]);

    // The actual on-chain balances (what really happened)
    const after = await snapshotBalances([ALICE, BOB]);
    const d = (who: Address, k: "ntu" | "sgdx") => after[who]![k] - before[who]![k];
    expect(d(ALICE, "ntu")).toBe(-dec("10")); // 10 NTU escrowed
    expect(d(ALICE, "sgdx")).toBe(dec("8")); // paid 8 at the maker price
    expect(d(BOB, "ntu")).toBe(dec("4"));
    expect(d(BOB, "sgdx")).toBe(-dec("8")); // 8.8 escrowed, 0.8 refunded
    expect(d(MARKET, "ntu")).toBe(dec("6")); // Alice's remaining 6 NTU
    expect(d(MARKET, "sgdx")).toBe(0n);

    // Order state
    const aliceNow = await getOrder(1n);
    expect(aliceNow).toMatchObject({ filled: dec("4"), status: 1 });
    expect(collateralHeld(aliceNow)).toEqual({ token: "base", amount: dec("6") });
    expect(await getOrder(2n)).toMatchObject({ filled: dec("4"), status: 2, lockedQuote: 0n });
    expect(alice.atBlock.filled).toBe(0n); // Alice's own receipt-time view is not rewritten by later trades
    expect(await call<bigint>("lastTradePrice")).toBe(dec("2"));

    // The ticket's estimate matched what the chain executed
    expect(b.estimate.filledBase).toBe(bob.decoded.filledBase);
    expect(b.estimate.tradedQuote).toBe(bob.decoded.tradedQuote);
    expect(b.estimate.refundQuote).toBe(bob.decoded.refundQuote);

    note("spec-example", {
      aliceOrderTx: alice.hash,
      bobApprovalTx: b.approvalHash,
      bobOrderTx: bob.hash,
      blockNumber: bob.blockNumber,
      deltas: { aliceNtu: d(ALICE, "ntu"), aliceSgdx: d(ALICE, "sgdx"), bobNtu: d(BOB, "ntu"), bobSgdx: d(BOB, "sgdx"), marketNtu: d(MARKET, "ntu"), marketSgdx: d(MARKET, "sgdx") },
      refund: bob.decoded.refundQuote,
    });
  });

  it("a buy that does not cross rests with its full escrow (requiredQuote) and nothing is refunded", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "10"));
    const r = outcomeOf(await placeLikeTheUi(BOB, "buy", "1.9", "5"));
    expect(r.decoded.trades).toEqual([]);
    expect(r.atBlock).toMatchObject({ status: 0, filled: 0n, lockedQuote: requiredQuote(dec("5"), dec("1.9")) });
    expect(r.decoded.escrowPulled).toBe(dec("9.5"));
    expect(r.decoded.refundQuote).toBe(0n);
    expect(r.problems).toEqual([]);
  });

  it("a buy that partly fills rests the remainder: 22 escrowed = 8 traded + 0.8 refunded + 13.2 locked", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "4"));
    const run = await placeLikeTheUi(BOB, "buy", "2.2", "10");
    const r = outcomeOf(run);
    expect(r.atBlock).toMatchObject({ status: 1, filled: dec("4"), lockedQuote: dec("13.2") });
    expect(r.decoded.refundQuote).toBe(dec("0.8"));
    expect(r.decoded.escrowPulled).toBe(dec("22"));
    expect(r.problems).toEqual([]);
    expect(run.estimate.lockedAfter).toBe(r.atBlock.lockedQuote);
  });

  it("a taker sweeps several makers at their own prices (price priority, best first)", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2.1", "3"));
    await outcomeOf(await placeLikeTheUi(CAROL, "sell", "2", "4"));
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2.05", "2"));
    const run = await placeLikeTheUi(BOB, "buy", "2.2", "9");
    const r = outcomeOf(run);
    expect(r.decoded.trades.map((t) => [t.price, t.baseAmount])).toEqual([
      [dec("2"), dec("4")],
      [dec("2.05"), dec("2")],
      [dec("2.1"), dec("3")],
    ]);
    expect(r.decoded.tradedQuote).toBe(dec("8") + dec("4.1") + dec("6.3"));
    expect(r.atBlock.status).toBe(2);
    expect(r.decoded.refundQuote).toBe(dec("19.8") - dec("18.4"));
    expect(run.estimate.tradedQuote).toBe(r.decoded.tradedQuote);
    expect(run.estimate.refundQuote).toBe(r.decoded.refundQuote);
    expect(r.problems).toEqual([]);
  });

  it("a sell fills against bids at the makers' prices and the seller is paid exactly the traded quote", async () => {
    await outcomeOf(await placeLikeTheUi(BOB, "buy", "2", "4"));
    await outcomeOf(await placeLikeTheUi(CAROL, "buy", "1.95", "3"));
    const before = await snapshotBalances([ALICE]);
    const run = await placeLikeTheUi(ALICE, "sell", "1.9", "10");
    const r = outcomeOf(run);
    const after = await snapshotBalances([ALICE]);
    expect(r.decoded.tradedQuote).toBe(dec("8") + dec("5.85"));
    expect(r.decoded.quoteReceived).toBe(dec("13.85"));
    expect(after[ALICE]!.sgdx - before[ALICE]!.sgdx).toBe(dec("13.85"));
    expect(r.atBlock).toMatchObject({ status: 1, filled: dec("7") });
    expect(run.estimate.lockedAfter).toBe(dec("3"));
    expect(r.problems).toEqual([]);
  });

  it("an order that fills immediately in full ends Filled with nothing locked", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "4"));
    const r = outcomeOf(await placeLikeTheUi(BOB, "buy", "2", "4"));
    expect(r.atBlock).toMatchObject({ status: 2, lockedQuote: 0n });
    expect(r.decoded.refundQuote).toBe(0n);
  });

  it("the fill cap: 12 crossing makers, only 10 are matched and the remainder rests crossed (matchOrders is a stub)", async () => {
    // One approval, then 12 one-NTU sells at 2 from Alice (so no per-order approvals are needed).
    await drive(runApproval, ALICE, { side: "sell", price: dec("2"), amount: dec("12"), collateralToken: "base", collateral: dec("12") });
    for (let i = 0; i < 12; i++) outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "1"));
    const run = await placeLikeTheUi(BOB, "buy", "2", "12");
    const r = outcomeOf(run);
    expect(r.decoded.trades).toHaveLength(10);
    expect(r.decoded.filledBase).toBe(dec("10"));
    expect(r.atBlock).toMatchObject({ status: 1, filled: dec("10"), lockedQuote: dec("4") });
    expect(run.estimate.crossedRemainder).toBe(true);
    expect(run.estimate.fills).toHaveLength(10);
    const [bestBid, bestAsk] = await Promise.all([call<[bigint, bigint]>("getBestBid"), call<[bigint, bigint]>("getBestAsk")]);
    expect(bestBid[1]).toBeGreaterThanOrEqual(bestAsk[1]); // the book is left crossed
    expect(r.problems).toEqual([]);
    note("fill-cap", { orderTx: r.hash, fills: r.decoded.trades.length, remainingBase: dec("12") - r.decoded.filledBase });
  });

  it("a self trade does not turn the payment to oneself into a refund", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "10"));
    const r = outcomeOf(await placeLikeTheUi(ALICE, "buy", "2.2", "4"));
    expect(r.decoded.selfTrade).toBe(true);
    expect(r.decoded.refundQuote).toBe(dec("0.8"));
    expect(r.problems).toEqual([]);
  });

  it("an approval is exactly the collateral and is not requested again when sufficient", async () => {
    const before = await allowance(SGDX, BOB);
    expect(before).toBe(0n);
    const first = await placeLikeTheUi(BOB, "buy", "1.9", "5");
    expect(first.approvalHash).toBeDefined();
    // Spent by the order's own transferFrom: back to zero, so the next order approves again.
    expect(await allowance(SGDX, BOB)).toBe(0n);

    // Pre-approve more than needed: no approval request for a smaller order.
    await drive(runApproval, BOB, { side: "buy", price: dec("1.9"), amount: dec("10"), collateralToken: "quote", collateral: dec("19") });
    expect(await allowance(SGDX, BOB)).toBe(dec("19"));
    const second = await placeLikeTheUi(BOB, "buy", "1.9", "5");
    expect(second.approvalHash).toBeUndefined();
    outcomeOf(second);
  });

  describe("failures are decoded by name, and the wallet is never asked after a failed simulation", () => {
    const bad = (over: Partial<Parameters<typeof runOrder>[1]["order"]>) => ({ side: "buy" as Side, price: dec("2"), amount: dec("1"), collateralToken: "quote" as const, collateral: dec("2"), ...over });

    it.each([
      ["InvalidLotSize", { amount: 10n ** 9n + 1n, collateral: requiredQuote(10n ** 9n + 1n, dec("2")) }],
      ["InvalidTickSize", { price: 10n ** 9n + 1n }],
      ["ZeroAmount", { amount: 0n, collateral: 0n }],
      ["ZeroPrice", { price: 0n, collateral: 0n }],
    ] as const)("%s", async (name, over) => {
      await drive(runApproval, ALICE, bad({ collateral: dec("100") }));
      const head = await pub.getBlockNumber();
      const r = await drive(runOrder, ALICE, bad(over));
      expect(r.state.phase).toBe("failed");
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: name, step: "order" });
      expect(r.types).toEqual(["FAILED"]); // never SIMULATION_OK, never ORDER_SUBMITTED
      expect(await pub.getBlockNumber()).toBe(head); // nothing was sent
    });

    it("without allowance, the simulation fails by name instead of sending a doomed transaction", async () => {
      const head = await pub.getBlockNumber();
      const r = await drive(runOrder, BOB, bad({}));
      expect(r.state.phase).toBe("failed");
      expect(["ERC20InsufficientAllowance", "SafeERC20FailedOperation"]).toContain(r.state.failure?.errorName);
      expect(await pub.getBlockNumber()).toBe(head);
      note("insufficient-allowance-error", { errorName: r.state.failure?.errorName });
    });

    it("without balance, the simulation fails by name", async () => {
      await drive(runApproval, UNFUNDED, bad({}));
      const r = await drive(runOrder, UNFUNDED, bad({}));
      expect(r.state.phase).toBe("failed");
      expect(["ERC20InsufficientBalance", "SafeERC20FailedOperation"]).toContain(r.state.failure?.errorName);
      note("insufficient-balance-error", { errorName: r.state.failure?.errorName });
    });
  });

  it("my orders: getUserOrderIds lists every order of the account across statuses", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "4"));
    await outcomeOf(await placeLikeTheUi(BOB, "buy", "2", "4")); // fills Alice's order
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "3", "1"));
    const ids = await call<bigint[]>("getUserOrderIds", [ALICE]);
    expect(ids).toEqual([1n, 3n]);
    const orders = await Promise.all(ids.map(getOrder));
    expect(orders.map((o) => o.status)).toEqual([2, 0]); // Filled, Open
    expect(await call<bigint[]>("getUserOrderIds", [BOB])).toEqual([2n]);
    expect(await call<bigint[]>("getUserOrderIds", [CAROL])).toEqual([]);
  });

  it("estimateExecution agrees with the chain for the exact execution it mirrors", async () => {
    await outcomeOf(await placeLikeTheUi(ALICE, "sell", "2", "4"));
    const run = await placeLikeTheUi(BOB, "buy", "2.2", "10");
    const r = outcomeOf(run);
    const e: ExecutionEstimate = run.estimate;
    expect({ filled: e.filledBase, traded: e.tradedQuote, refund: e.refundQuote, remaining: e.remainingBase, locked: e.lockedAfter }).toEqual({
      filled: r.decoded.filledBase,
      traded: r.decoded.tradedQuote,
      refund: r.decoded.refundQuote,
      remaining: r.atBlock.amount - r.atBlock.filled,
      locked: r.atBlock.lockedQuote,
    });
  });

  it("deployer account sanity: the scratch deployment is the exported one", async () => {
    expect(DEPLOYER).toBe(D.deployer);
    expect(await call<Address>("baseToken")).toBe(NTU);
    expect(await call<Address>("quoteToken")).toBe(SGDX);
  });
});
