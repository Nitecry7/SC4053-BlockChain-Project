import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { FlowContext, FlowEvent } from "./order-flow";
import { flowReducer, initialFlowState, type FlowState } from "./order-flow";
import type { ValidOrder } from "./order-input";
import { runApproval, runOrder, type OrderOutcome, type ReceiptLike, type RunnerDeps, type TxFields } from "./order-runner";
import type { ChainAnchor } from "./chain-reset";
import { BOB, MARKET, NTU, SGDX, dec, specExampleLogs } from "./test-logs";

// FAKE chain and wallet. Real viem behaviour was measured separately on a scratch Anvil
// (docs/ai-audit/test-evidence/person2/p2-7-hardening.md); these tests pin how the runner uses it.

const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: BOB, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
const buyOrder: ValidOrder = { side: "buy", price: dec("2.2"), amount: dec("4"), collateralToken: "quote", collateral: dec("8.8") };
const okReceipt = (over: Partial<ReceiptLike> = {}): ReceiptLike => ({ transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 1n, logs: specExampleLogs(), ...over });
const filledOrder = { id: 2n, trader: BOB, side: 0, price: dec("2.2"), triggerPrice: 0n, amount: dec("4"), filled: dec("4"), lockedQuote: 0n, createdAt: 1n, status: 2 };
const tx: TxFields = { from: BOB, nonce: 7, input: "0xabcdef", to: MARKET, value: 0n };
const anchor: ChainAnchor = { genesisHash: H(100), blockNumber: 9n, blockHash: H(109) };

function fakeDeps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    simulate: async () => {},
    write: async () => H(1),
    waitForReceipt: async () => okReceipt(),
    readAllowance: async () => dec("8.8"),
    readOrder: async () => filledOrder,
    ...over,
  };
}

async function run(step: typeof runApproval | typeof runOrder, deps: RunnerDeps, opts: { maxWindows?: number } = {}) {
  const events: FlowEvent<OrderOutcome>[] = [];
  const start: FlowState<OrderOutcome> = flowReducer(initialFlowState<OrderOutcome>(), { type: step === runApproval ? "START_APPROVAL" : "START_ORDER", attempt: 1, ctx });
  await step(deps, { ctx, pair, order: buyOrder, attempt: 1, maxWindows: opts.maxWindows }, (e) => events.push(e), () => true);
  return { events, final: events.reduce(flowReducer<OrderOutcome>, start), types: events.map((e) => e.type) };
}

describe("replacement detection needs the transaction's sender and nonce (measured on Anvil)", () => {
  it("reads the submitted transaction ONCE and hands the same fields to every wait window", async () => {
    let reads = 0;
    const seen: (TxFields | undefined)[] = [];
    const deps = fakeDeps({
      readTransaction: async () => (reads++, tx),
      waitForReceipt: async (_h, o) => {
        seen.push(o.replacement);
        if (seen.length < 3) throw timeoutErr();
        return okReceipt();
      },
    });
    const r = await run(runOrder, deps, { maxWindows: 3 });
    expect(r.final.phase).toBe("done");
    expect(reads).toBe(1);
    expect(seen).toEqual([tx, tx, tx]);
  });

  it("a transaction lookup that fails does not break the wait: it proceeds without replacement fields", async () => {
    const seen: (TxFields | undefined)[] = [];
    const deps = fakeDeps({
      readTransaction: async () => Promise.reject(new Error("rpc down")),
      waitForReceipt: async (_h, o) => (seen.push(o.replacement), okReceipt()),
    });
    const r = await run(runOrder, deps);
    expect(r.final.phase).toBe("done");
    expect(seen).toEqual([undefined]);
  });

  it("the approval step passes the same fields", async () => {
    const seen: (TxFields | undefined)[] = [];
    const deps = fakeDeps({ readTransaction: async () => tx, waitForReceipt: async (_h, o) => (seen.push(o.replacement), okReceipt({ logs: [] })) });
    await run(runApproval, deps);
    expect(seen).toEqual([tx]);
  });
});

describe("the hash shown is the transaction that actually matters", () => {
  it("a re-priced transaction that mines and REVERTS is reported under its new hash", async () => {
    const deps = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return okReceipt({ transactionHash: H(2), status: "reverted", logs: [] });
      },
      simulate: async (_c, _a, block) => {
        if (block !== undefined) throw Object.assign(new Error("no"), { name: "ContractFunctionRevertedError" });
      },
    });
    const r = await run(runOrder, deps);
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(2) });
  });

  it("a re-priced approval that REVERTS is reported under its new hash", async () => {
    const deps = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return okReceipt({ transactionHash: H(2), status: "reverted", logs: [] });
      },
    });
    const r = await run(runApproval, deps);
    expect(r.final.failure).toMatchObject({ step: "approve", hash: H(2) });
  });

  it("a REPLACED order fails under the replacement's hash and says the original did not place the order", async () => {
    const deps = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("replaced", H(5));
        return okReceipt({ transactionHash: H(5), logs: [] });
      },
    });
    const r = await run(runOrder, deps);
    expect(r.final.failure).toMatchObject({ kind: "replaced", hash: H(5) });
    expect(r.final.failure?.detail).toMatch(/not placed|did not place/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a CANCELLED approval fails under the cancelling hash and never confirms", async () => {
    const deps = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("cancelled", H(6));
        return okReceipt({ transactionHash: H(6), logs: [] });
      },
    });
    const r = await run(runApproval, deps);
    expect(r.final.failure).toMatchObject({ kind: "cancelled", step: "approve", hash: H(6) });
    expect(r.types).not.toContain("APPROVAL_CONFIRMED");
  });
});

describe("local chain reset: evidence, not a guess", () => {
  const confirmedReset = { verdict: { verdict: "reset" as const, evidence: ["the genesis block hash changed"] } };

  it("a confirmed reset after a timeout window ends the wait with a chain-reset failure, never success", async () => {
    let waits = 0;
    const deps = fakeDeps({
      readChainAnchor: async () => anchor,
      inspectChain: async () => confirmedReset,
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await run(runOrder, deps, { maxWindows: 3 });
    expect(waits).toBe(1); // stopped waiting for a transaction that cannot arrive
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure).toMatchObject({ kind: "chain-reset", hash: H(1) });
    expect(r.final.failure?.detail).toMatch(/genesis block hash changed/i);
    expect(r.final.result).toBeUndefined();
  });

  it("the evidence list is what the user is shown (no invented cause)", async () => {
    const deps = fakeDeps({
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "reset", evidence: ["block 9 now has a different hash"] } }),
      waitForReceipt: async () => Promise.reject(timeoutErr()),
    });
    const r = await run(runOrder, deps);
    expect(r.final.failure?.detail).toContain("block 9 now has a different hash");
  });

  it("a transaction the node no longer lists is NOT a reset: it keeps waiting and the final timeout says so", async () => {
    let waits = 0;
    const deps = fakeDeps({
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "continuous", evidence: [] }, txKnown: false }),
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await run(runOrder, deps, { maxWindows: 3 });
    expect(waits).toBe(3);
    expect(r.final.failure?.kind).toBe("timeout");
    expect(r.final.failure?.detail).toMatch(/no longer lists/i);
    expect(r.final.failure?.detail).not.toMatch(/reset/i);
    expect(r.final.failure?.detail).toMatch(/do not resubmit|check My orders/i);
  });

  it("an unknown verdict, or a failing inspection, keeps waiting and claims nothing", async () => {
    for (const inspectChain of [async () => ({ verdict: { verdict: "unknown" as const, evidence: [] } }), async () => Promise.reject(new Error("rpc"))]) {
      let waits = 0;
      const deps = fakeDeps({ readChainAnchor: async () => anchor, inspectChain, waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())) });
      const r = await run(runOrder, deps, { maxWindows: 2 });
      expect(waits).toBe(2);
      expect(r.final.failure?.kind).toBe("timeout");
    }
  });

  it("without an anchor there is no inspection, and behaviour is the existing bounded wait", async () => {
    let inspected = 0;
    const deps = fakeDeps({ readChainAnchor: async () => undefined, inspectChain: async () => (inspected++, confirmedReset), waitForReceipt: async () => Promise.reject(timeoutErr()) });
    const r = await run(runOrder, deps, { maxWindows: 2 });
    expect(inspected).toBe(0);
    expect(r.final.failure?.kind).toBe("timeout");
  });

  it("a mined receipt is never second-guessed by the reset check", async () => {
    let inspected = 0;
    const deps = fakeDeps({ readChainAnchor: async () => anchor, inspectChain: async () => (inspected++, confirmedReset) });
    const r = await run(runOrder, deps);
    expect(r.final.phase).toBe("done");
    expect(inspected).toBe(0);
  });

  it("a reset during an approval fails the approval step too", async () => {
    const deps = fakeDeps({ readChainAnchor: async () => anchor, inspectChain: async () => confirmedReset, waitForReceipt: async () => Promise.reject(timeoutErr()) });
    const r = await run(runApproval, deps);
    expect(r.final.failure).toMatchObject({ kind: "chain-reset", step: "approve" });
  });
});

describe("every flow shares the same wait logic (token creation and market listing included)", () => {
  it("the real creation dependencies expose replacement fields and the chain check, like the order ones", async () => {
    const { viemCreateDeps } = await import("./create-runner");
    const deps = viemCreateDeps({} as never, (async () => H(1)) as never);
    expect(typeof deps.readTransaction).toBe("function");
    expect(typeof deps.readChainAnchor).toBe("function");
    expect(typeof deps.inspectChain).toBe("function");
  });
});
