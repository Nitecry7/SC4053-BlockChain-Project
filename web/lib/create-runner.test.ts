import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { marketSpec, runCreate, tokenSpec, type CreateDeps, type CreateSpec } from "./create-runner";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import type { ReceiptLike } from "./order-runner";
import { ALICE, BOB, EVIL, MARKET_FACTORY, NEW_MARKET, NEW_TOKEN, NTU, SGDX, TOKEN_FACTORY, dec, marketCreated, resetLogIndex, tokenCreated } from "./test-logs";

// FAKE chain and wallet: these tests prove the order of operations, the binding to the request and the refusal paths.
// creation.integration.test.ts runs the same code against a real scratch Anvil.

const ctx: FlowContext = { account: ALICE, chainId: 31337, market: TOKEN_FACTORY };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const rejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const SUPPLY = dec("1000000");
const request = { name: "Demo Coin", symbol: "DMO", supply: SUPPLY };

const receiptOf = (logs: ReceiptLike["logs"], over: Partial<ReceiptLike> = {}): ReceiptLike => ({ transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 900_000n, logs, ...over });
const goodTokenReceipt = () => {
  resetLogIndex();
  return receiptOf([tokenCreated(TOKEN_FACTORY, NEW_TOKEN, ALICE, "Demo Coin", "DMO", SUPPLY)]);
};
const goodMarketReceipt = () => {
  resetLogIndex();
  return receiptOf([marketCreated(MARKET_FACTORY, NEW_MARKET, NTU, SGDX, ALICE)]);
};

const tokenWorld = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  isFactoryToken: true,
  name: "Demo Coin",
  symbol: "DMO",
  decimals: 18,
  totalSupply: SUPPLY,
  balanceOf: SUPPLY,
  tokenCount: 3n,
  getTokens: [NTU, SGDX, NEW_TOKEN],
  ...over,
});
const marketWorld = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  getMarket: NEW_MARKET,
  isMarket: true,
  baseToken: NTU,
  quoteToken: SGDX,
  marketCount: 2n,
  getMarkets: ["0xCafac3dD18aC6c6e92c921884f9E4176737C052c", NEW_MARKET],
  ...over,
});

type Calls = { simulate: { block?: bigint }[]; write: number; reads: string[] };
function fakeDeps(world: Record<string, unknown>, receipt: ReceiptLike, over: Partial<CreateDeps> = {}) {
  const calls: Calls = { simulate: [], write: 0, reads: [] };
  const deps: CreateDeps = {
    simulate: async (_c, _a, block) => void calls.simulate.push({ block }),
    write: async () => {
      calls.write++;
      return H(1);
    },
    waitForReceipt: async () => receipt,
    read: async (c) => {
      calls.reads.push(c.functionName);
      if (!(c.functionName in world)) throw new Error(`unexpected read: ${c.functionName}`);
      return world[c.functionName];
    },
    ...over,
  };
  return { deps, calls };
}

async function run<D, R>(deps: CreateDeps, spec: CreateSpec<D, R>, opts: { current?: () => boolean; maxWindows?: number } = {}) {
  const events: FlowEvent<R>[] = [];
  const start = flowReducer(initialFlowState<R>(), { type: "START_ORDER", attempt: 1, ctx });
  await runCreate(deps, spec, { ctx, attempt: 1, windowMs: 10, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<R>, start) as FlowState<R>;
  return { events, final, types: events.map((e) => e.type) };
}

const tokenReq = { factory: TOKEN_FACTORY, creator: ALICE, token: request };
const marketReq = { factory: MARKET_FACTORY, creator: ALICE, base: NTU, quote: SGDX };

describe("runCreate: token issuance", () => {
  it("simulate -> wallet -> submitted -> mined -> verified, with the token address taken from the event", async () => {
    const { deps, calls } = fakeDeps(tokenWorld(), goodTokenReceipt());
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(r.final.phase).toBe("done");
    expect(r.final.result).toMatchObject({
      token: NEW_TOKEN,
      name: "Demo Coin",
      symbol: "DMO",
      decimals: 18,
      totalSupply: SUPPLY,
      creatorBalanceAtBlock: SUPPLY,
      creatorBalanceNow: SUPPLY,
      registryIndex: 2n,
      registryCount: 3n,
      hash: H(1),
    });
    expect(calls.write).toBe(1);
  });

  it("simulates before the wallet is asked, and a named revert never reaches the wallet", async () => {
    const named = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "SupplyTooLarge" } }) });
    const { deps, calls } = fakeDeps(tokenWorld(), goodTokenReceipt(), { simulate: async () => Promise.reject(named) });
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.types).toEqual(["FAILED"]);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "SupplyTooLarge", step: "order" });
    expect(calls.write).toBe(0);
  });

  it("a wallet rejection leaves no hash and is a rejection", async () => {
    const { deps } = fakeDeps(tokenWorld(), goodTokenReceipt(), { write: async () => Promise.reject(rejected()) });
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.types).toEqual(["SIMULATION_OK", "FAILED"]);
    expect(r.final.failure?.kind).toBe("rejected");
    expect(r.final.orderHash).toBeUndefined();
  });

  it("a reverted receipt says nothing was created and keeps the hash", async () => {
    const { deps } = fakeDeps(tokenWorld(), receiptOf([], { status: "reverted", blockNumber: 9n }));
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(1) });
    expect(r.final.failure?.detail).toMatch(/nothing was created/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a successful receipt with no TokenCreated is not reported as a token", async () => {
    const { deps } = fakeDeps(tokenWorld(), receiptOf([]));
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.title).toMatch(/could not be found/);
  });

  it("a TokenCreated forged by another contract, or created by another account, is not accepted", async () => {
    resetLogIndex();
    const forged = receiptOf([tokenCreated(EVIL, NEW_TOKEN, ALICE, "Demo Coin", "DMO", SUPPLY)]);
    expect((await run(fakeDeps(tokenWorld(), forged).deps, tokenSpec(tokenReq))).final.phase).toBe("failed");
    resetLogIndex();
    const other = receiptOf([tokenCreated(TOKEN_FACTORY, NEW_TOKEN, BOB, "Demo Coin", "DMO", SUPPLY)]);
    expect((await run(fakeDeps(tokenWorld(), other).deps, tokenSpec(tokenReq))).final.phase).toBe("failed");
  });

  it.each([
    ["name", ["Other Coin", "DMO", SUPPLY]],
    ["symbol", ["Demo Coin", "XYZ", SUPPLY]],
    ["supply", ["Demo Coin", "DMO", SUPPLY + 1n]],
  ] as const)("refuses an event whose %s is not what was requested", async (_what, [name, symbol, supply]) => {
    resetLogIndex();
    const { deps } = fakeDeps(tokenWorld(), receiptOf([tokenCreated(TOKEN_FACTORY, NEW_TOKEN, ALICE, name, symbol, supply)]));
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.title).toMatch(/not the token you requested/);
    expect(r.final.result).toBeUndefined();
  });

  it.each([
    ["TokenFactory does not recognise the token", { isFactoryToken: false }, /does not recognise/],
    ["the token's name() differs", { name: "Different" }, /name\(\)/],
    ["the token's symbol() differs", { symbol: "OTHER" }, /symbol\(\)/],
    ["the token is not 18 decimals", { decimals: 6 }, /6 decimals/],
    ["totalSupply differs", { totalSupply: SUPPLY - 1n }, /totalSupply/],
    ["the creator does not hold the whole supply", { balanceOf: SUPPLY - 1n }, /balance/],
    ["the token is not in the registry", { getTokens: [NTU, SGDX] }, /not in TokenFactory's registry/],
  ])("does not report success when %s", async (_what, change, message) => {
    const { deps } = fakeDeps(tokenWorld(change), goodTokenReceipt());
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "FAILED"]);
    expect(r.final.failure?.title).toMatch(/could not be verified/);
    expect(r.final.failure?.detail).toMatch(message);
    expect(r.final.result).toBeUndefined();
  });

  it("a read failure after mining says the transaction was confirmed and to check the pages", async () => {
    const { deps } = fakeDeps(tokenWorld(), goodTokenReceipt(), { read: async () => Promise.reject(Object.assign(new Error("fetch failed"), { name: "HttpRequestError" })) });
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.failure?.title).toMatch(/could not be read back/);
    expect(r.final.failure?.detail).toMatch(/was confirmed/);
    expect(r.final.failure?.hash).toBe(H(1));
  });

  it("finds the token in the NEWEST page when the registry is larger than one window", async () => {
    const many = Array.from({ length: 60 }, (_, i) => (`0x${(i + 1).toString(16).padStart(40, "0")}`) as `0x${string}`);
    const window = [...many.slice(10, 59), NEW_TOKEN]; // entries 10..59 (50 of them); the new token is the last
    const { deps } = fakeDeps(tokenWorld({ tokenCount: 60n, getTokens: window }), goodTokenReceipt());
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.result).toMatchObject({ registryIndex: 59n, registryCount: 60n });
  });

  it("a cancelled or replaced transaction is a failure although viem resolves with the replacement's receipt", async () => {
    for (const reason of ["cancelled", "replaced"] as const) {
      const { deps } = fakeDeps(tokenWorld(), receiptOf([]), {
        waitForReceipt: async (_h, { onReplaced }) => {
          onReplaced(reason, H(5));
          return receiptOf([], { transactionHash: H(5) });
        },
      });
      const r = await run(deps, tokenSpec(tokenReq));
      expect(r.final.failure?.kind).toBe(reason);
      expect(r.final.result).toBeUndefined();
    }
  });

  it("a receipt timeout marks the flow delayed, keeps waiting, then completes", async () => {
    let n = 0;
    const { deps } = fakeDeps(tokenWorld(), goodTokenReceipt(), {
      waitForReceipt: async () => {
        if (n++ === 0) throw Object.assign(new Error("t"), { name: "WaitForTransactionReceiptTimeoutError" });
        return goodTokenReceipt();
      },
    });
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "DELAYED", "ORDER_MINED", "RECONCILED"]);
  });

  it("when the account changes while the wallet is open: the hash is recorded, then nothing more is done or applied", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(tokenWorld(), goodTokenReceipt(), {
      write: async () => {
        current = false;
        return H(7);
      },
    });
    const r = await run(deps, tokenSpec(tokenReq), { current: () => current });
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED"]);
    expect(calls.reads).toEqual([]); // it never read the chain on behalf of a context that has moved on
  });

  it("does not open the wallet when the context changed during the simulation", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(tokenWorld(), goodTokenReceipt(), { simulate: async () => void (current = false) });
    await run(deps, tokenSpec(tokenReq), { current: () => current });
    expect(calls.write).toBe(0);
  });

  it("calls createToken with the RAW supply, exactly as validated", () => {
    expect(tokenSpec(tokenReq).call).toMatchObject({ address: TOKEN_FACTORY, functionName: "createToken", args: ["Demo Coin", "DMO", SUPPLY] });
  });

  it("a second start while the first is in flight is ignored by the reducer, so the wallet opens once", () => {
    const s = flowReducer(initialFlowState(), { type: "START_ORDER", attempt: 1, ctx });
    expect(flowReducer(s, { type: "START_ORDER", attempt: 2, ctx })).toBe(s);
  });
});

describe("runCreate: a re-priced transaction", () => {
  it("a failure after a speed-up links the replacement hash, not the replaced one", async () => {
    const { deps } = fakeDeps(tokenWorld({ name: "Other" }), { ...goodTokenReceipt(), transactionHash: H(2) }, {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return { ...goodTokenReceipt(), transactionHash: H(2) };
      },
    });
    const r = await run(deps, tokenSpec(tokenReq));
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.hash).toBe(H(2));
  });
});

describe("runCreate: market listing", () => {
  it("verifies the market in both orientations of getMarket, its own tokens and the registry", async () => {
    const { deps } = fakeDeps(marketWorld(), goodMarketReceipt());
    const r = await run(deps, marketSpec(marketReq));
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(r.final.result).toMatchObject({ market: NEW_MARKET, base: NTU, quote: SGDX, registryIndex: 1n, registryCount: 2n });
  });

  it("calls createMarket with base first, then quote (orientation is the call's argument order)", () => {
    expect(marketSpec(marketReq).call.args).toEqual([NTU, SGDX]);
    expect(marketSpec({ ...marketReq, base: SGDX, quote: NTU }).call.args).toEqual([SGDX, NTU]);
  });

  it("refuses a market created in the OPPOSITE orientation to the one requested", async () => {
    resetLogIndex();
    const reversed = receiptOf([marketCreated(MARKET_FACTORY, NEW_MARKET, SGDX, NTU, ALICE)]);
    const r = await run(fakeDeps(marketWorld(), reversed).deps, marketSpec(marketReq));
    expect(r.final.failure?.title).toMatch(/not the market you requested/);
    expect(r.final.result).toBeUndefined();
  });

  it("refuses a different token pair", async () => {
    resetLogIndex();
    const other = receiptOf([marketCreated(MARKET_FACTORY, NEW_MARKET, NTU, NEW_TOKEN, ALICE)]);
    expect((await run(fakeDeps(marketWorld(), other).deps, marketSpec(marketReq))).final.phase).toBe("failed");
  });

  it.each([
    ["getMarket returns another market", { getMarket: "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" }, /getMarket/],
    ["the factory does not know the market", { isMarket: false }, /does not recognise/],
    ["the market's baseToken() differs", { baseToken: NEW_TOKEN }, /baseToken/],
    ["the market's quoteToken() differs", { quoteToken: NEW_TOKEN }, /quoteToken/],
    ["the market is not in the registry", { getMarkets: ["0xCafac3dD18aC6c6e92c921884f9E4176737C052c"] }, /not in MarketFactory's registry/],
  ])("does not report success when %s", async (_what, change, message) => {
    const r = await run(fakeDeps(marketWorld(change), goodMarketReceipt()).deps, marketSpec(marketReq));
    expect(r.final.failure?.title).toMatch(/could not be verified/);
    expect(r.final.failure?.detail).toMatch(message);
  });

  it("a MarketExists revert from the simulation is named and nothing is sent (a race lost after the pre-check)", async () => {
    const named = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "MarketExists" } }) });
    const { deps, calls } = fakeDeps(marketWorld(), goodMarketReceipt(), { simulate: async () => Promise.reject(named) });
    const r = await run(deps, marketSpec(marketReq));
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "MarketExists" });
    expect(calls.write).toBe(0);
  });

  it("an empty simulation revert gets the 'not an ERC-20' hint, while a named revert keeps its own text", async () => {
    const empty = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("reverted"), { name: "ContractFunctionRevertedError" }) });
    const r = await run(fakeDeps(marketWorld(), goodMarketReceipt(), { simulate: async () => Promise.reject(empty) }).deps, marketSpec(marketReq));
    expect(r.final.failure?.detail).toMatch(/not an ERC-20/);
    const named = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "UnsupportedDecimals" } }) });
    const r2 = await run(fakeDeps(marketWorld(), goodMarketReceipt(), { simulate: async () => Promise.reject(named) }).deps, marketSpec(marketReq));
    expect(r2.final.failure?.detail).toMatch(/18-decimal/);
  });

  it("a wallet rejection and a mined revert behave like token issuance", async () => {
    const rej = await run(fakeDeps(marketWorld(), goodMarketReceipt(), { write: async () => Promise.reject(rejected()) }).deps, marketSpec(marketReq));
    expect(rej.final.failure?.kind).toBe("rejected");
    const rev = await run(fakeDeps(marketWorld(), receiptOf([], { status: "reverted" })).deps, marketSpec(marketReq));
    expect(rev.final.failure?.detail).toMatch(/nothing was created/i);
  });
});
