import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { ChainAnchor } from "./chain-reset";
import type { BestOrder } from "./crossed-book";
import { previewMatch, runMatch, type MatchDeps, type MatchOutcome } from "./match-runner";
import type { FlowContext, FlowEvent, FlowState } from "./order-flow";
import { flowReducer, initialFlowState } from "./order-flow";
import type { ReceiptLike } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { ALICE, BOB, EVIL, MARKET, NTU, SGDX, dec, orderPlaced, resetLogIndex, trade, transfer } from "./test-logs";

// FAKE chain and wallet: these tests pin the orchestration order, the verification and the failure wording of the
// match runner. match.integration.test.ts runs the same code against a scratch Anvil.

const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address; // Anvil account 4: holds no trading tokens
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: KEEPER, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
const rpcRejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const named = (errorName: string) =>
  Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName } }) });
const anchor: ChainAnchor = { genesisHash: H(100), blockNumber: 9n, blockHash: H(109) };

const crossed = (): { bid: BestOrder; ask: BestOrder } => ({ bid: { id: 3n, price: dec("3") }, ask: { id: 1n, price: dec("2") } });
const spread = (): { bid: BestOrder; ask: BestOrder } => ({ bid: { id: 0n, price: 0n }, ask: { id: 0n, price: 0n } });

const order = (over: Partial<OrderSnapshot>): OrderSnapshot => ({
  id: 1n, trader: ALICE, side: 1, price: dec("2"), triggerPrice: 0n, amount: dec("1"), filled: 0n, lockedQuote: 0n, createdAt: 1n, status: 0, ...over,
});
// The scenario: two resting asks (Alice #1, Carol #2: 1 NTU at 2 each) and Bob's earlier-arriving? no: Bob's bid #3 for 2 NTU at 3.
const before = (id: bigint): OrderSnapshot =>
  id === 1n ? order({ id: 1n, trader: ALICE })
  : id === 2n ? order({ id: 2n, trader: CAROL })
  : order({ id: 3n, trader: BOB, side: 0, price: dec("3"), amount: dec("2"), lockedQuote: dec("6") });
const after = (id: bigint): OrderSnapshot =>
  id === 3n ? { ...before(3n), filled: dec("2"), lockedQuote: 0n, status: 2 } : { ...before(id), filled: dec("1"), status: 2 };

function twoFillReceipt(over: Partial<ReceiptLike> = {}): ReceiptLike {
  resetLogIndex();
  const logs = [
    trade(MARKET, 1n, 3n, ALICE, BOB, dec("2"), dec("1"), dec("2")),
    transfer(NTU, MARKET, BOB, dec("1")),
    transfer(SGDX, MARKET, ALICE, dec("2")),
    transfer(SGDX, MARKET, BOB, dec("1")),
    trade(MARKET, 2n, 3n, CAROL, BOB, dec("2"), dec("1"), dec("2")),
    transfer(NTU, MARKET, BOB, dec("1")),
    transfer(SGDX, MARKET, CAROL, dec("2")),
    transfer(SGDX, MARKET, BOB, dec("1")),
  ];
  return { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 223_001n, logs, ...over };
}

type Calls = { simulate: { count: bigint; account: Address; block?: bigint }[]; write: { functionName: string; args: readonly unknown[] }[]; waits: number; best: (bigint | undefined)[] };
function fakeDeps(receipt: ReceiptLike, over: Partial<MatchDeps> = {}, bestQueue: { bid: BestOrder; ask: BestOrder }[] = [crossed(), spread()]): { deps: MatchDeps; calls: Calls } {
  const calls: Calls = { simulate: [], write: [], waits: 0, best: [] };
  let i = 0;
  const deps: MatchDeps = {
    simulateMatches: async (_m, count, account, block) => {
      calls.simulate.push({ count, account, block });
      return 2n;
    },
    readBestPrices: async (_m, block) => {
      calls.best.push(block);
      return bestQueue[Math.min(i++, bestQueue.length - 1)]!;
    },
    write: async (call) => {
      calls.write.push({ functionName: call.functionName, args: call.args });
      return H(1);
    },
    waitForReceipt: async () => {
      calls.waits++;
      return receipt;
    },
    readOrder: async (_m, id, block) => (block !== undefined && block < receipt.blockNumber ? before(id) : after(id)),
    ...over,
  };
  return { deps, calls };
}

async function run(deps: MatchDeps, opts: { current?: () => boolean; windowMs?: number; maxWindows?: number; limit?: bigint } = {}) {
  const events: FlowEvent<MatchOutcome>[] = [];
  const start: FlowState<MatchOutcome> = flowReducer(initialFlowState<MatchOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
  await runMatch(deps, { ctx, pair, limit: opts.limit ?? 10n, attempt: 1, windowMs: opts.windowMs, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<MatchOutcome>, start);
  return { events, final, types: events.map((e) => e.type) };
}

describe("runMatch: success needs the receipt and the chain", () => {
  it("re-reads the book, simulates matchOrders(10) from the caller, asks the wallet once (no approval), then reports the real fills", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt());
    const r = await run(deps);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(calls.simulate[0]).toMatchObject({ count: 10n, account: KEEPER });
    expect(calls.write).toEqual([{ functionName: "matchOrders", args: [10n] }]); // exactly one request, never an approve
    expect(r.final.phase).toBe("done");
    const out = r.final.result!;
    expect(out.problems).toEqual([]);
    expect(out).toMatchObject({ hash: H(1), requested: 10n, simulatedFills: 2n, totalBase: dec("2"), totalQuote: dec("4"), baseOut: dec("2"), quoteOut: dec("6"), quoteReturned: dec("2"), noop: false, stillCrossed: false });
    expect(out.fills.map((f) => [f.makerOrderId, f.takerOrderId])).toEqual([[1n, 3n], [2n, 3n]]);
    expect(out.effects.map((e) => [e.orderId, e.tradedBase, e.after.status])).toEqual([[1n, dec("1"), 2], [3n, dec("2"), 2], [2n, dec("1"), 2]]);
  });

  it("reads each touched order in the block BEFORE and in the receipt block", async () => {
    const reads: (bigint | undefined)[] = [];
    const { deps } = fakeDeps(twoFillReceipt(), { readOrder: async (_m, id, b) => (reads.push(b), b !== undefined && b < 5n ? before(id) : after(id)) });
    await run(deps);
    expect(reads).toContain(4n);
    expect(reads).toContain(5n);
  });

  it("says the book is still crossed when it is (another deliberate click may follow), and never loops by itself", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), {}, [crossed(), crossed()]);
    const r = await run(deps);
    expect(r.final.result?.stillCrossed).toBe(true);
    expect(calls.write).toHaveLength(1);
  });

  it("a mined transaction with zero Trade events is a no-op: success with no fills, nothing invented", async () => {
    resetLogIndex();
    const { deps } = fakeDeps(twoFillReceipt({ logs: [] }));
    const r = await run(deps);
    expect(r.final.phase).toBe("done");
    expect(r.final.result).toMatchObject({ noop: true, fills: [], totalBase: 0n, totalQuote: 0n, effects: [], problems: [] });
  });

  it("another market's Trade in the logs is not reported as a fill here", async () => {
    resetLogIndex();
    const other = { ...twoFillReceipt(), logs: [trade(EVIL, 1n, 3n, ALICE, BOB, dec("2"), dec("1"), dec("2"))] };
    const r = await run(fakeDeps(other).deps);
    expect(r.final.result).toMatchObject({ noop: true, fills: [] });
  });

  it("the simulated count is an estimate: a different actual count is reported as it is, not as a problem", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), { simulateMatches: async () => 5n });
    const out = (await run(deps)).final.result!;
    expect(out.simulatedFills).toBe(5n);
    expect(out.fills).toHaveLength(2);
    expect(out.problems).toEqual([]);
  });

  it("follows a speed-up to the re-priced hash and reports that one", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return twoFillReceipt({ transactionHash: H(2) });
      },
    });
    const r = await run(deps);
    expect(r.types).toContain("HASH_REPLACED");
    expect(r.final.result?.hash).toBe(H(2));
  });
});

describe("runMatch: the chain and the logs must agree", () => {
  it("base paid out that differs from the Trade events is reported", async () => {
    resetLogIndex();
    const bad = twoFillReceipt();
    const logs = bad.logs.filter((l, i) => i !== 1); // drop the first NTU transfer to Bob
    const r = await run(fakeDeps({ ...bad, logs }).deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/base tokens the market paid out differ/);
  });

  it("less quote paid out than the Trade events report is reported", async () => {
    const bad = twoFillReceipt();
    const logs = bad.logs.filter((l, i) => i !== 2); // drop Alice's payment
    const r = await run(fakeDeps({ ...bad, logs }).deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/Seller 0xf39F|Seller 0xf39f|was paid a different amount of quote token/);
  });

  it("a buyer that received a different amount of base than its trades is reported", async () => {
    const bad = twoFillReceipt();
    const logs = bad.logs.map((l, i) => (i === 1 ? transfer(NTU, MARKET, BOB, dec("0.5")) : l)); // Bob got 0.5 for the first fill
    const r = await run(fakeDeps({ ...bad, logs }).deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/Buyer .* received a different amount of base token/);
  });

  it("an order whose filled amount did not change by its trades is reported", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), { readOrder: async (_m, id, b) => (b !== undefined && b < 5n ? before(id) : before(id)) });
    const r = await run(deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/filled amount changed by a different amount/);
  });

  it("a fill at a price that is not the maker order's is reported", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), { readOrder: async (_m, id, b) => (b !== undefined && b < 5n ? { ...before(id), price: id === 1n ? dec("2.5") : before(id).price } : after(id)) });
    const r = await run(deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/not the maker order's price/);
  });

  it("more Trade events than the allowed count is reported", async () => {
    const r = await run(fakeDeps(twoFillReceipt()).deps, { limit: 1n });
    expect(r.final.result?.problems.join(" ")).toMatch(/more Trade events than the 1 fills/);
  });
});

describe("runMatch: nothing is sent when there is nothing to match", () => {
  it("a book that is no longer crossed stops before the simulation and the wallet", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), {}, [spread()]);
    const r = await run(deps);
    expect(calls.simulate).toHaveLength(0);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ title: "The book is no longer crossed", step: "order" });
    expect(r.final.result).toBeUndefined();
  });

  it("a simulation that returns zero fills never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), { simulateMatches: async () => 0n });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure?.title).toMatch(/No eligible orders to settle/);
    expect(r.final.failure?.detail).toMatch(/no gas was spent/);
  });

  it("an unusable per-transaction limit (0) sends nothing", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt());
    const r = await run(deps, { limit: 0n });
    expect(calls.write).toHaveLength(0);
    expect(calls.best).toHaveLength(0);
    expect(r.final.failure?.title).toBe("Invalid match count");
  });

  it("InvalidMaxCount from the simulation is named and never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), { simulateMatches: async () => Promise.reject(named("InvalidMaxCount")) });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "InvalidMaxCount", title: "Invalid match count" });
  });
});

describe("runMatch: failures never claim success", () => {
  it("a wallet rejection is a rejection: nothing waits, nothing is claimed", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), { write: async () => Promise.reject(rpcRejected()) });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "rejected" });
    expect(calls.waits).toBe(0);
    expect(r.final.result).toBeUndefined();
  });

  it("a transaction mined as reverted fails, names the reason from the block before, and says nothing was matched", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt({ status: "reverted", logs: [] }), {
      simulateMatches: async (_m, count, account, block) => {
        calls.simulate.push({ count, account, block });
        if (block !== undefined) throw named("InvalidMaxCount");
        return 2n;
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(1) });
    expect(r.final.failure?.title).toMatch(/Reverted on-chain: Invalid match count/);
    expect(r.final.failure?.detail).toMatch(/nothing was matched/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a REPLACED match fails under the replacement's hash with matching-specific wording", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("replaced", H(5));
        return twoFillReceipt({ transactionHash: H(5), logs: [] });
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "replaced", hash: H(5), title: "The match request was replaced" });
    expect(r.final.failure?.detail).not.toMatch(/ordered|place the order|cancel/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a CANCELLED match request fails under the cancelling hash", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("cancelled", H(6));
        return twoFillReceipt({ transactionHash: H(6), logs: [] });
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "cancelled", hash: H(6), title: "The match request was itself cancelled" });
    expect(r.final.failure?.detail).toMatch(/may still be crossed/);
  });

  it("a confirmed chain reset ends the wait with matching wording and never success", async () => {
    let waits = 0;
    const { deps } = fakeDeps(twoFillReceipt(), {
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "reset", evidence: ["the genesis block hash changed"] } }),
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await run(deps, { maxWindows: 3 });
    expect(waits).toBe(1);
    expect(r.final.failure).toMatchObject({ kind: "chain-reset", hash: H(1) });
    expect(r.final.failure?.detail).toMatch(/match again only if it is still crossed/);
    expect(r.final.failure?.detail).not.toMatch(/place the order again/);
    expect(r.final.result).toBeUndefined();
  });

  it("a timeout keeps the flow delayed and ends as 'not confirmed yet', never as success", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), { waitForReceipt: async () => Promise.reject(timeoutErr()) });
    const r = await run(deps, { maxWindows: 2 });
    expect(r.types).toContain("DELAYED");
    expect(r.final.failure).toMatchObject({ kind: "timeout", hash: H(1) });
    expect(r.final.result).toBeUndefined();
  });

  it("an RPC outage while reading the book before sending is a failure that sends nothing", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt(), { readBestPrices: async () => Promise.reject(new Error("fetch failed")) });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.phase).toBe("failed");
  });

  it("an RPC failure while reading the orders back is a failure, not a success", async () => {
    const { deps } = fakeDeps(twoFillReceipt(), { readOrder: async () => Promise.reject(new Error("fetch failed")) });
    const r = await run(deps);
    expect(r.final.phase).toBe("failed");
    expect(r.final.result).toBeUndefined();
  });

  it("a signature plus a mined receipt without anything else is only as good as the Trade events (no events, no fills)", async () => {
    resetLogIndex();
    const noise = twoFillReceipt({ logs: [orderPlaced(MARKET, 9n, BOB, 1, dec("2"), dec("1"))] });
    const r = await run(fakeDeps(noise).deps);
    expect(r.final.result).toMatchObject({ noop: true, fills: [] });
  });
});

describe("runMatch: account, network or market change", () => {
  it("after the account changes mid-request nothing further is waited on or applied", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(twoFillReceipt(), {
      write: async (call) => {
        calls.write.push({ functionName: call.functionName, args: call.args });
        current = false; // the account switched while the wallet was open
        return H(1);
      },
    });
    const r = await run(deps, { current: () => current });
    expect(calls.waits).toBe(0);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED"]); // the hash is still recorded
    expect(r.final.result).toBeUndefined();
  });

  it("a request that is no longer current never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(twoFillReceipt());
    const r = await run(deps, { current: () => false });
    expect(calls.write).toHaveLength(0);
    expect(r.types).toEqual([]);
  });

  it("a flow that is already busy ignores a second start (the reducer refuses a second START_ORDER)", () => {
    const s1 = flowReducer(initialFlowState<MatchOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
    const s2 = flowReducer(s1, { type: "START_ORDER", attempt: 2, ctx });
    expect(s2.attempt).toBe(s1.attempt);
    expect(s2.phase).toBe(s1.phase);
  });
});

describe("previewMatch", () => {
  it("returns the simulated count and a gas estimate, both read-only", async () => {
    const seen: bigint[] = [];
    const p = await previewMatch({ simulateMatches: async (_m, c) => (seen.push(c), 2n), estimateGas: async () => 223_001n }, MARKET, 10n, KEEPER);
    expect(p).toEqual({ fills: 2n, gas: 223_001n });
    expect(seen).toEqual([10n]);
  });
  it("a failed gas estimate only hides the gas; the simulated count stays", async () => {
    const p = await previewMatch({ simulateMatches: async () => 2n, estimateGas: async () => Promise.reject(new Error("no")) }, MARKET, 10n, KEEPER);
    expect(p).toEqual({ fills: 2n });
  });
  it("a simulation that would revert is an error, not a preview", async () => {
    await expect(previewMatch({ simulateMatches: async () => Promise.reject(named("InvalidMaxCount")) }, MARKET, 10n, KEEPER)).rejects.toBeDefined();
  });
});
