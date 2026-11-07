/**
 * Integration tests of the P2-7 transaction-lifecycle hardening against a REAL local chain (Anvil, auto-mining switched
 * off so a transaction can be held pending, re-priced, cancelled, replaced, dropped or orphaned by a snapshot revert).
 * The same runners and `viemDeps` the UI uses; the wallet is a viem wallet on Anvil's unlocked dev accounts. NOT MetaMask.
 *
 *   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run lib/hardening.integration.test.ts --no-file-parallelism
 * Refuses port 8545 (the developer's chain). Each test runs inside evm_snapshot / evm_revert and restores auto-mining.
 */
import { appendFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseGwei, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import type { ValidOrder } from "./order-input";
import { runApproval, runOrder, viemDeps, type ContractCall, type OrderOutcome } from "./order-runner";
import { marketSpec, runCreate, tokenSpec, viemCreateDeps, type CreateSpec } from "./create-runner";
import type { OrderSnapshot } from "./order-status";

const RPC = process.env.E2E_RPC_URL;
const D = PRIMARY_DEPLOYMENT;
const MARKET = D.market as Address;
const NTU = D.baseToken.address as Address;
const SGDX = D.quoteToken.address as Address;
const TOKEN_FACTORY = D.tokenFactory as Address;
const MARKET_FACTORY = D.marketFactory as Address;
const E18 = 10n ** 18n;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
// Anvil's public dev accounts, unlocked on the scratch chain. Alice and Bob are funded with NTU and SGDx by Deploy.s.sol.
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;

let pub: PublicClient;
let snapshot: string | undefined;
const rpc = <T,>(method: string, params: unknown[] = []) => pub.request({ method: method as never, params: params as never }) as Promise<T>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const note = (label: string, data: Record<string, unknown>) => {
  const file = process.env.E2E_EVIDENCE_FILE;
  if (file) appendFileSync(file, JSON.stringify({ label, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
};

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const FEE = { maxFeePerGas: parseGwei("2"), maxPriorityFeePerGas: parseGwei("1") };
const BUMPED = { maxFeePerGas: parseGwei("4"), maxPriorityFeePerGas: parseGwei("3") };

type Sent = { hash: Hex; nonce: number; to: Address; data: Hex };

/** The wallet: signs and sends at a LOW fee with an explicit nonce, and reports what it sent so a test can replace it. */
const pendingWallet = (account: Address, onSent: (s: Sent) => void) => async (req: unknown) => {
  const c = req as ContractCall;
  const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args } as never);
  const nonce = await pub.getTransactionCount({ address: account, blockTag: "pending" });
  const hash = await walletFor(account).sendTransaction({ to: c.address, data, nonce, ...FEE, account, chain: foundry } as never);
  onSent({ hash, nonce, to: c.address, data });
  return hash;
};

const instantWallet = (account: Address) => async (req: unknown) => {
  const c = req as ContractCall;
  return walletFor(account).writeContract({ address: c.address, abi: c.abi, functionName: c.functionName, args: c.args, account, chain: foundry } as never);
};

let attemptCounter = 0;
const ctxFor = (account: Address, target: Address): FlowContext => ({ account, chainId: 31337, market: target });
const pairFor = (market: Address, baseToken: Address, quoteToken: Address) => ({ market, baseToken, quoteToken });
const sellOrder: ValidOrder = { side: "sell", price: dec("2"), amount: dec("10"), collateralToken: "base", collateral: dec("10") };

/** Starts one runner step with the given wallet. Returns the pending run and a live view of its events and state. */
function start(step: typeof runApproval | typeof runOrder, account: Address, wallet: (req: unknown) => Promise<Hex>, order = sellOrder, p: { windowMs?: number; maxWindows?: number } = {}) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account, MARKET);
  const run = { events: [] as FlowEvent<OrderOutcome>[], state: flowReducer(initialFlowState<OrderOutcome>(), { type: step === runApproval ? "START_APPROVAL" : "START_ORDER", attempt, ctx }) as FlowState<OrderOutcome> };
  const done = step(
    viemDeps(pub, wallet as never),
    { ctx, pair: pairFor(MARKET, NTU, SGDX), order, attempt, windowMs: p.windowMs ?? 600, maxWindows: p.maxWindows ?? 4 },
    (e) => {
      run.events.push(e);
      run.state = flowReducer(run.state, e);
    },
    () => true,
  );
  return { run, done, types: () => run.events.map((e) => e.type) };
}

const nextSent = (box: { sent?: Sent }) => async () => {
  for (let i = 0; i < 100 && !box.sent; i++) await sleep(50);
  expect(box.sent, "the wallet never sent the transaction").toBeDefined();
  return box.sent!;
};

const userOrders = (who: Address) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] }) as Promise<bigint[]>;
const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const allowance = (token: Address, owner: Address, spender: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, spender] }) as Promise<bigint>;
const mine = () => rpc("evm_mine");
/**
 * A speed-up is pending for a while before it mines. Several receipt windows start AFTER the original was dropped from the
 * pool, which is exactly when the runner must find the replacement by sender and nonce (the original is no longer by hash).
 */
const settleThenMine = async () => {
  await sleep(1300);
  await mine();
};

/** Alice approves the market for her NTU (mined immediately, auto-mining on). */
async function approveSell() {
  await start(runApproval, ALICE, instantWallet(ALICE)).done;
  expect(await allowance(NTU, ALICE, MARKET)).toBeGreaterThanOrEqual(dec("10"));
}

describe.skipIf(!RPC)("transaction-lifecycle hardening on a real scratch chain (Anvil; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8546).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 150 });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET });
    expect(code && code !== "0x", "deploy to the scratch chain first").toBe(true);
  });
  beforeEach(async () => {
    snapshot = await rpc<string>("evm_snapshot");
  });
  afterEach(async () => {
    await rpc("evm_setAutomine", [true]).catch(() => undefined);
    await rpc("anvil_dropAllTransactions").catch(() => undefined);
    if (snapshot) await rpc("evm_revert", [snapshot]);
  });

  it("a sped-up (re-priced) order is followed across several timed-out windows and confirmed under the new hash", async () => {
    await approveSell();
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runOrder, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 500, maxWindows: 9 });
    const original = await nextSent(box)();
    await sleep(1400); // at least two receipt windows elapse with the original still pending
    expect(r.types().filter((t) => t === "DELAYED").length).toBeGreaterThanOrEqual(2);
    const replacementHash = await walletFor(ALICE).sendTransaction({ to: original.to, data: original.data, nonce: original.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
    await settleThenMine();
    await r.done;

    expect(r.run.state.phase, JSON.stringify(r.run.state.failure)).toBe("done");
    expect(r.types()).toContain("HASH_REPLACED");
    expect(r.run.state.result?.hash).toBe(replacementHash);
    expect(r.run.state.result?.hash).not.toBe(original.hash);
    expect(r.run.state.result?.problems).toEqual([]);
    expect(await userOrders(ALICE)).toHaveLength(1); // exactly one order, not two
    note("repriced-order", { original: original.hash, replacement: replacementHash, delayedWindows: r.types().filter((t) => t === "DELAYED").length });
  });

  it("a cancelled order fails under the cancelling hash; no order exists and no collateral moved", async () => {
    await approveSell();
    const ntuBefore = await bal(NTU, ALICE);
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runOrder, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 500, maxWindows: 9 });
    const original = await nextSent(box)();
    await sleep(1100);
    const cancelHash = await walletFor(ALICE).sendTransaction({ to: ALICE, value: 0n, nonce: original.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
    await settleThenMine();
    await r.done;

    expect(r.run.state.phase).toBe("failed");
    expect(r.run.state.failure).toMatchObject({ kind: "cancelled", hash: cancelHash });
    expect(r.run.state.result).toBeUndefined();
    expect(await userOrders(ALICE)).toEqual([]);
    expect(await bal(NTU, ALICE)).toBe(ntuBefore);
    note("cancelled-order", { original: original.hash, cancel: cancelHash });
  });

  it("a transaction replaced by a different action is a 'replaced' failure, never an order", async () => {
    await approveSell();
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runOrder, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 500, maxWindows: 9 });
    const original = await nextSent(box)();
    await sleep(1100);
    const other = encodeFunctionData({ abi: demoTokenAbi, functionName: "approve", args: [BOB, 1n] } as never);
    const replacementHash = await walletFor(ALICE).sendTransaction({ to: NTU, data: other, nonce: original.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
    await settleThenMine();
    await r.done;

    expect(r.run.state.failure).toMatchObject({ kind: "replaced", hash: replacementHash });
    expect(r.run.state.failure?.detail).toMatch(/did not place anything/i);
    expect(await userOrders(ALICE)).toEqual([]);
    expect(await allowance(NTU, ALICE, BOB)).toBe(1n); // what actually happened on chain
    note("replaced-order", { original: original.hash, replacement: replacementHash });
  });

  it("a re-priced approval is followed to its new hash and the allowance is re-read", async () => {
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runApproval, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 500, maxWindows: 9 });
    const original = await nextSent(box)();
    await sleep(1100);
    const replacementHash = await walletFor(ALICE).sendTransaction({ to: original.to, data: original.data, nonce: original.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
    await settleThenMine();
    await r.done;
    expect(r.types()).toContain("HASH_REPLACED");
    expect(r.run.state.approvalHash).toBe(replacementHash);
    expect(r.run.state.approvedAmount).toBe(dec("10"));
  });

  it("a speed-up that lands before the app's first lookup cannot be followed: no false success, no reset claim, and the order IS on-chain", async () => {
    await approveSell();
    await rpc("evm_setAutomine", [false]);
    // The wallet sends the original, then the user speeds it up instantly; the app is only handed the ORIGINAL hash.
    const wallet = async (req: unknown) => {
      const sent = await pendingWallet(ALICE, () => undefined)(req);
      const orig = await pub.getTransaction({ hash: sent });
      await walletFor(ALICE).sendTransaction({ to: orig.to!, data: orig.input, nonce: orig.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
      return sent;
    };
    const r = start(runOrder, ALICE, wallet, sellOrder, { windowMs: 400, maxWindows: 3 });
    await sleep(500);
    await mine();
    await r.done;
    expect(r.run.state.phase).toBe("failed");
    expect(r.run.state.failure?.kind).toBe("timeout");
    expect(r.run.state.failure?.detail).toMatch(/no longer lists|check My orders/i);
    expect(r.run.state.failure?.detail).not.toMatch(/reset/i);
    expect(r.run.state.result).toBeUndefined();
    expect(await userOrders(ALICE)).toHaveLength(1); // the order exists; the app must send the user to My orders, not claim success
    note("speedup-before-first-lookup", { detail: r.run.state.failure?.detail });
  });

  it("a transaction the node dropped (chain intact) is reported as unlisted, NOT as a reset", async () => {
    await approveSell();
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runOrder, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 400, maxWindows: 3 });
    const original = await nextSent(box)();
    await rpc("anvil_dropTransaction", [original.hash]);
    await r.done;
    expect(r.run.state.failure?.kind).toBe("timeout");
    expect(r.run.state.failure?.detail).toMatch(/no longer lists/i);
    expect(r.run.state.failure?.detail).not.toMatch(/reset/i);
    expect(await userOrders(ALICE)).toEqual([]);
  });

  it("a snapshot revert under a waiting transaction is detected as a reset from block identity, and never as success", async () => {
    await approveSell();
    const before = await rpc<string>("evm_snapshot");
    await mine();
    await mine(); // the head the runner will anchor to
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const r = start(runOrder, ALICE, pendingWallet(ALICE, (s) => (box.sent = s)), sellOrder, { windowMs: 500, maxWindows: 4 });
    await nextSent(box)();
    await sleep(100);
    await rpc("evm_revert", [before]); // blocks the runner anchored to are gone
    await r.done;

    expect(r.run.state.phase).toBe("failed");
    expect(r.run.state.failure?.kind).toBe("chain-reset");
    expect(r.run.state.failure?.detail).toMatch(/below block|different hash|genesis/i);
    expect(r.run.state.result).toBeUndefined();
    note("reset-detected", { detail: r.run.state.failure?.detail });
  });

  it("token creation follows a re-priced transaction too (P2-6 path, shared waitBounded)", async () => {
    await rpc("evm_setAutomine", [false]);
    const box: { sent?: Sent } = {};
    const attempt = ++attemptCounter;
    const ctx = ctxFor(ALICE, TOKEN_FACTORY);
    const spec = tokenSpec({ factory: TOKEN_FACTORY, creator: ALICE, token: { name: "Hardening Coin", symbol: "HRD", supply: dec("1000") } }) as CreateSpec<unknown, unknown>;
    let state = flowReducer(initialFlowState<unknown>(), { type: "START_ORDER", attempt, ctx });
    const types: string[] = [];
    const done = runCreate(
      viemCreateDeps(pub, pendingWallet(ALICE, (s) => (box.sent = s)) as never),
      spec,
      { ctx, attempt, windowMs: 500, maxWindows: 9 },
      (e) => {
        types.push(e.type);
        state = flowReducer(state, e as FlowEvent<unknown>);
      },
      () => true,
    );
    const original = await nextSent(box)();
    await sleep(1100);
    const replacementHash = await walletFor(ALICE).sendTransaction({ to: original.to, data: original.data, nonce: original.nonce, ...BUMPED, account: ALICE, chain: foundry } as never);
    await settleThenMine();
    await done;
    expect(state.phase, JSON.stringify(state.failure)).toBe("done");
    expect(types).toContain("HASH_REPLACED");
    expect((state.result as { hash: Hex }).hash).toBe(replacementHash);
  });
});

describe.skipIf(!RPC)("two markets on one chain stay separate (real chain; NOT MetaMask)", () => {
  beforeAll(() => {
    pub ??= createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 150 });
  });
  beforeEach(async () => {
    snapshot = await rpc<string>("evm_snapshot");
  });
  afterEach(async () => {
    if (snapshot) await rpc("evm_revert", [snapshot]);
  });

  it("DTT/SGDx and NTU/SGDx: each order approves and escrows on its OWN order book, and the other book is untouched", async () => {
    const driveCreate = async <R,>(account: Address, target: Address, spec: CreateSpec<unknown, R>) => {
      const attempt = ++attemptCounter;
      const ctx = ctxFor(account, target);
      let state = flowReducer(initialFlowState<R>(), { type: "START_ORDER", attempt, ctx });
      await runCreate(viemCreateDeps(pub, instantWallet(account) as never), spec, { ctx, attempt }, (e) => (state = flowReducer(state, e as FlowEvent<R>)), () => true);
      expect(state.phase, JSON.stringify(state.failure)).toBe("done");
      return state.result as R;
    };
    const token = await driveCreate(ALICE, TOKEN_FACTORY, tokenSpec({ factory: TOKEN_FACTORY, creator: ALICE, token: { name: "Demo Token", symbol: "DTT", supply: dec("10000") } }) as CreateSpec<unknown, { token: Address }>);
    const market = await driveCreate(ALICE, MARKET_FACTORY, marketSpec({ factory: MARKET_FACTORY, creator: ALICE, base: token.token, quote: SGDX }) as CreateSpec<unknown, { market: Address; base: Address; quote: Address }>);
    expect(market.market.toLowerCase()).not.toBe(MARKET.toLowerCase());

    const dttMarket = pairFor(market.market, market.base, market.quote);
    const dtt = market.base;
    const order: ValidOrder = { side: "sell", price: dec("2"), amount: dec("10"), collateralToken: "base", collateral: dec("10") };
    const attempt = ++attemptCounter;
    const ctx = ctxFor(ALICE, market.market);
    let state = flowReducer(initialFlowState<OrderOutcome>(), { type: "START_APPROVAL", attempt, ctx });
    const send = (e: FlowEvent<OrderOutcome>) => (state = flowReducer(state, e));
    await runApproval(viemDeps(pub, instantWallet(ALICE) as never), { ctx, pair: dttMarket, order, attempt }, send, () => true);
    expect(await allowance(dtt, ALICE, market.market)).toBeGreaterThanOrEqual(dec("10")); // approved the DTT order book
    expect(await allowance(dtt, ALICE, MARKET)).toBe(0n); // and not the NTU one
    expect(await allowance(dtt, ALICE, MARKET_FACTORY)).toBe(0n); // never a factory

    state = flowReducer(state, { type: "START_ORDER", attempt: attempt + 1000, ctx });
    await runOrder(viemDeps(pub, instantWallet(ALICE) as never), { ctx, pair: dttMarket, order, attempt: attempt + 1000 }, send, () => true);
    expect(state.phase, JSON.stringify(state.failure)).toBe("done");
    expect(state.result?.decoded.orderId).toBe(1n);

    const dttBook = (await pub.readContract({ address: market.market, abi: orderBookAbi, functionName: "getBook", args: [1, 10n] })) as OrderSnapshot[];
    const ntuBook = (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBook", args: [1, 10n] })) as OrderSnapshot[];
    expect(dttBook).toHaveLength(1);
    expect(ntuBook).toHaveLength(0);
    expect(await bal(dtt, market.market)).toBe(dec("10")); // escrow sits in the DTT book
    expect(await bal(NTU, MARKET)).toBe(0n);

    void tokenFactoryAbi;
    void marketFactoryAbi;
  });
});
