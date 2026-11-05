/**
 * Integration tests of token issuance and market listing against a REAL local chain: the same validation, pair
 * classification, runner (simulate, sign, receipt wait, event decode, on-chain verification) and trading code the UI uses,
 * driven with Anvil's unlocked dev accounts through viem. NOT MetaMask and NOT a browser.
 *
 * It mutates the chain, so it only runs when explicitly enabled and refuses the default development chain:
 *   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run lib/creation.integration.test.ts
 * Each test runs inside evm_snapshot / evm_revert. Optional: E2E_EVIDENCE_FILE=<path> appends real tx hashes.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, getAddress, http, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { classifyPair, type TokenProbe } from "./create-plan";
import { validateTokenInput } from "./create-input";
import { marketSpec, runCreate, tokenSpec, viemCreateDeps, type CreateSpec } from "./create-runner";
import { describeTxError } from "./errors";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import { validateOrderInput } from "./order-input";
import { allowanceStep } from "./order-plan";
import { runApproval, runOrder, viemDeps, type OrderOutcome } from "./order-runner";

const RPC = process.env.E2E_RPC_URL;
const ENABLED = Boolean(RPC);
const D = PRIMARY_DEPLOYMENT;
const TOKEN_FACTORY = D.tokenFactory as Address;
const MARKET_FACTORY = D.marketFactory as Address;
const SEED_MARKET = D.market as Address;
const NTU = D.baseToken.address as Address;
const SGDX = D.quoteToken.address as Address;
const E18 = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};

// Anvil's public dev accounts (unlocked on the scratch chain). No private keys are used anywhere.
const CREATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address; // account 1: 10,000 NTU and SGDx from the deploy
const BUYER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address; // account 2: 10,000 SGDx
const NOBODY = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address; // account 5: an EOA with no code

let pub: PublicClient;
let snapshot: string | undefined;

function note(label: string, data: Record<string, unknown>) {
  const file = process.env.E2E_EVIDENCE_FILE;
  if (!file) return;
  appendFileSync(file, JSON.stringify({ label, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
}

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const writeFor = (account: Address) => async (req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) =>
  walletFor(account).writeContract({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, account, chain: foundry } as never) as Promise<Hex>;

const read = <T,>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => pub.readContract({ address, abi, functionName, args } as never) as Promise<T>;
const balance = (token: Address, who: Address) => read<bigint>(token, demoTokenAbi as Abi, "balanceOf", [who]);

let attemptCounter = 0;
const ctxFor = (account: Address, target: Address): FlowContext => ({ account, chainId: 31337, market: target });

/** Drives one creation through the real reducer, exactly as the hook does. */
async function driveCreate<D, R>(account: Address, target: Address, spec: CreateSpec<D, R>) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account, target);
  let state = flowReducer(initialFlowState<R>(), { type: "START_ORDER", attempt, ctx });
  const events: FlowEvent<R>[] = [];
  await runCreate(viemCreateDeps(pub, writeFor(account)), spec, { ctx, attempt }, (e) => { events.push(e); state = flowReducer(state, e); }, () => true);
  return { state: state as FlowState<R>, types: events.map((e) => e.type) };
}

const createToken = (account: Address, name: string, symbol: string, supply: bigint) => driveCreate(account, TOKEN_FACTORY, tokenSpec({ factory: TOKEN_FACTORY, creator: account, token: { name, symbol, supply } }));
const createMarket = (account: Address, base: Address, quote: Address) => driveCreate(account, MARKET_FACTORY, marketSpec({ factory: MARKET_FACTORY, creator: account, base, quote }));

const done = <R,>(r: { state: FlowState<R> }) => {
  expect(r.state.phase, `did not finish: ${JSON.stringify(r.state.failure)}`).toBe("done");
  return r.state.result!;
};

/** A deployed MockERC20 from the Foundry artifact (the test token with configurable decimals and an open mint). */
async function deployMock(account: Address, name: string, symbol: string, decimals: number): Promise<Address> {
  const artifact = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/out/MockERC20.sol/MockERC20.json"), "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  const hash = await walletFor(account).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [name, symbol, decimals], account, chain: foundry } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.contractAddress).toBeTruthy();
  return getAddress(receipt.contractAddress as Address); // checksum form, as the chain returns it
}

/** What the List market form reads for a candidate token, built from real chain reads. */
async function probe(token: Address): Promise<TokenProbe> {
  try {
    const decimals = await read<number>(token, demoTokenAbi as Abi, "decimals");
    const issued = await read<boolean>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "isFactoryToken", [token]);
    return { status: "ok", decimals: Number(decimals), issuedByFactory: issued };
  } catch {
    return { status: "not-a-token" };
  }
}
async function existingMarket(a: Address, b: Address) {
  const market = await read<Address>(MARKET_FACTORY, marketFactoryAbi as Abi, "getMarket", [a, b]);
  if (market === ZERO) return null;
  return { market, base: await read<Address>(market, orderBookAbi as Abi, "baseToken"), quote: await read<Address>(market, orderBookAbi as Abi, "quoteToken") };
}

describe.skipIf(!ENABLED)("token issuance and market listing on a real scratch chain (Anvil, unlocked dev accounts; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    const port = new URL(RPC).port;
    if (port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8546).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET_FACTORY });
    expect(code && code !== "0x", "the exported factories have no code on this chain: deploy to the scratch chain first").toBe(true);
  });
  beforeEach(async () => {
    snapshot = (await pub.request({ method: "evm_snapshot" as never })) as string;
  });
  afterEach(async () => {
    if (snapshot) await pub.request({ method: "evm_revert" as never, params: [snapshot] as never });
  });

  describe("issuing a token", () => {
    it("creates a fixed-supply token: exact supply, creator balance, decimals, registry and the factory's own recognition", async () => {
      const countBefore = await read<bigint>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "tokenCount");
      const v = validateTokenInput({ name: "Fizz Coin", symbol: "FIZZ", supplyText: "1000000", maxSupply: await read<bigint>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "MAX_SUPPLY"), lotSize: 10n ** 9n });
      if (!v.ok) throw new Error(JSON.stringify(v.errors));

      const r = await createToken(CREATOR, v.token.name, v.token.symbol, v.token.supply);
      const out = done(r);
      expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);

      // The result card's facts, against independent reads
      expect(out.token).not.toBe(ZERO);
      expect(await read<string>(out.token, demoTokenAbi as Abi, "name")).toBe("Fizz Coin");
      expect(await read<string>(out.token, demoTokenAbi as Abi, "symbol")).toBe("FIZZ");
      expect(Number(await read<number>(out.token, demoTokenAbi as Abi, "decimals"))).toBe(18);
      expect(await read<bigint>(out.token, demoTokenAbi as Abi, "totalSupply")).toBe(dec("1000000"));
      expect(await balance(out.token, CREATOR)).toBe(dec("1000000")); // the whole supply, nobody else
      expect(await balance(out.token, TOKEN_FACTORY)).toBe(0n); // the factory never holds tokens
      expect(await read<boolean>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "isFactoryToken", [out.token])).toBe(true);
      expect(await read<bigint>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "tokenCount")).toBe(countBefore + 1n);
      const page = await read<Address[]>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "getTokens", [countBefore, 5n]);
      expect(page).toEqual([out.token]);
      expect(out.registryIndex).toBe(countBefore);
      expect(out.creatorBalanceAtBlock).toBe(dec("1000000"));
      note("token-created", { tx: out.hash, token: out.token, supply: dec("1000000"), block: out.blockNumber });
    });

    it("accepts exactly MAX_SUPPLY and refuses one raw unit more, by name, with nothing sent", async () => {
      const max = await read<bigint>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "MAX_SUPPLY");
      expect(max).toBe(10n ** 27n);
      const ok = done(await createToken(CREATOR, "Max", "MAX", max));
      expect(await balance(ok.token, CREATOR)).toBe(max);

      const head = await pub.getBlockNumber();
      const r = await createToken(CREATOR, "Too Big", "BIG", max + 1n);
      expect(r.state.phase).toBe("failed");
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "SupplyTooLarge" });
      expect(r.types).toEqual(["FAILED"]); // never simulated OK, never signed
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it.each([
      ["EmptyName", "", "SYM", 1n],
      ["EmptySymbol", "Name", "", 1n],
      ["ZeroSupply", "Name", "SYM", 0n],
    ] as const)("%s is named by the contract and nothing is sent", async (errorName, name, symbol, supply) => {
      const head = await pub.getBlockNumber();
      const r = await createToken(CREATOR, name, symbol, supply);
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName, step: "order" });
      expect(r.types).toEqual(["FAILED"]);
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it("two tokens may share a name and symbol; only the address differs", async () => {
      const a = done(await createToken(CREATOR, "Same", "SAME", dec("1")));
      const b = done(await createToken(BUYER, "Same", "SAME", dec("2")));
      expect(a.token).not.toBe(b.token);
      expect(await read<string>(a.token, demoTokenAbi as Abi, "symbol")).toBe(await read<string>(b.token, demoTokenAbi as Abi, "symbol"));
    });

    it("an account other than the creator holds none of the new token", async () => {
      const out = done(await createToken(CREATOR, "Solo", "SOLO", dec("500")));
      expect(await balance(out.token, BUYER)).toBe(0n);
    });
  });

  describe("listing a market", () => {
    it("lists a new token against SGDx: registry, both getMarket orders, isMarket and the market's own tokens", async () => {
      const token = done(await createToken(CREATOR, "Fizz Coin", "FIZZ", dec("1000000")));
      const countBefore = await read<bigint>(MARKET_FACTORY, marketFactoryAbi as Abi, "marketCount");

      // What the form decides before the wallet is asked
      const state = classifyPair({ base: token.token, quote: SGDX, baseProbe: await probe(token.token), quoteProbe: await probe(SGDX), existing: await existingMarket(token.token, SGDX) });
      expect(state).toEqual({ kind: "ready", unverified: [] });

      const r = await createMarket(CREATOR, token.token, SGDX);
      const out = done(r);
      expect(await read<Address>(MARKET_FACTORY, marketFactoryAbi as Abi, "getMarket", [token.token, SGDX])).toBe(out.market);
      expect(await read<Address>(MARKET_FACTORY, marketFactoryAbi as Abi, "getMarket", [SGDX, token.token])).toBe(out.market);
      expect(await read<boolean>(MARKET_FACTORY, marketFactoryAbi as Abi, "isMarket", [out.market])).toBe(true);
      expect(await read<Address>(out.market, orderBookAbi as Abi, "baseToken")).toBe(token.token);
      expect(await read<Address>(out.market, orderBookAbi as Abi, "quoteToken")).toBe(SGDX);
      expect(await read<bigint>(MARKET_FACTORY, marketFactoryAbi as Abi, "marketCount")).toBe(countBefore + 1n);
      expect(out.registryIndex).toBe(countBefore);
      // The seed market is untouched
      expect(await read<Address>(MARKET_FACTORY, marketFactoryAbi as Abi, "getMarket", [NTU, SGDX])).toBe(SEED_MARKET);
      // A new book is honestly empty
      expect(await read<[bigint, bigint]>(out.market, orderBookAbi as Abi, "getBestBid")).toEqual([0n, 0n]);
      expect(await read<boolean>(out.market, orderBookAbi as Abi, "hasTradePrice")).toBe(false);
      note("market-created", { tx: out.hash, market: out.market, base: token.token, quote: SGDX });
    });

    it("the SAME pair is refused by name (race lost after the pre-check), and the pre-check reports it as a duplicate first", async () => {
      const token = done(await createToken(CREATOR, "Fizz", "FIZZ", dec("10")));
      const first = done(await createMarket(CREATOR, token.token, SGDX));
      const state = classifyPair({ base: token.token, quote: SGDX, baseProbe: await probe(token.token), quoteProbe: await probe(SGDX), existing: await existingMarket(token.token, SGDX) });
      expect(state).toMatchObject({ kind: "exists", market: first.market, orientation: "same" });

      const head = await pub.getBlockNumber();
      const again = await createMarket(CREATOR, token.token, SGDX);
      expect(again.state.failure).toMatchObject({ kind: "reverted", errorName: "MarketExists" });
      expect(again.types).toEqual(["FAILED"]);
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it("the REVERSED pair is a duplicate too: reported with the existing orientation, and refused by the factory", async () => {
      const token = done(await createToken(CREATOR, "Fizz", "FIZZ", dec("10")));
      const first = done(await createMarket(CREATOR, token.token, SGDX)); // base FIZZ, quote SGDx
      const state = classifyPair({ base: SGDX, quote: token.token, baseProbe: await probe(SGDX), quoteProbe: await probe(token.token), existing: await existingMarket(SGDX, token.token) });
      expect(state).toEqual({ kind: "exists", market: first.market, orientation: "reversed", existingBase: token.token, existingQuote: SGDX });

      const head = await pub.getBlockNumber();
      const rev = await createMarket(CREATOR, SGDX, token.token);
      expect(rev.state.failure).toMatchObject({ kind: "reverted", errorName: "MarketExists" });
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it("the first creator fixes the orientation: listing as (SGDx, new token) makes SGDx the base", async () => {
      const token = done(await createToken(CREATOR, "Quote Me", "QM", dec("10")));
      const out = done(await createMarket(CREATOR, SGDX, token.token));
      expect(await read<Address>(out.market, orderBookAbi as Abi, "baseToken")).toBe(SGDX);
      expect(await read<Address>(out.market, orderBookAbi as Abi, "quoteToken")).toBe(token.token);
      const reverse = await createMarket(CREATOR, token.token, SGDX);
      expect(reverse.state.failure?.errorName).toBe("MarketExists");
    });

    it.each([
      ["the zero address as base", ZERO, SGDX],
      ["the zero address as quote", SGDX, ZERO],
      ["the same token twice", SGDX, SGDX],
    ] as const)("%s is refused as InvalidTokens with nothing sent", async (_what, base, quote) => {
      const head = await pub.getBlockNumber();
      const r = await createMarket(CREATOR, base, quote);
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "InvalidTokens" });
      expect(r.types).toEqual(["FAILED"]);
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it("a 6-decimal token is refused as UnsupportedDecimals, and the pre-check says so before any signature", async () => {
      const six = await deployMock(CREATOR, "Six", "SIX", 6);
      const state = classifyPair({ base: six, quote: SGDX, baseProbe: await probe(six), quoteProbe: await probe(SGDX), existing: null });
      expect(state).toEqual({ kind: "wrong-decimals", side: "base", decimals: 6 });

      const head = await pub.getBlockNumber();
      const r = await createMarket(CREATOR, six, SGDX); // bypassing the pre-check on purpose: the contract is the last guard
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "UnsupportedDecimals" });
      expect(await pub.getBlockNumber()).toBe(head);
    });

    it("an address that is not a token reverts with no data; the pre-check reports not-a-token and the runner adds the hint", async () => {
      for (const notAToken of [NOBODY, TOKEN_FACTORY]) {
        const state = classifyPair({ base: notAToken, quote: SGDX, baseProbe: await probe(notAToken), quoteProbe: await probe(SGDX), existing: null });
        expect(state).toEqual({ kind: "not-a-token", side: "base" });
        const head = await pub.getBlockNumber();
        const r = await createMarket(CREATOR, notAToken, SGDX);
        expect(r.state.failure?.kind).toBe("reverted");
        expect(r.state.failure?.errorName).toBeUndefined();
        expect(r.state.failure?.detail).toMatch(/not an ERC-20/);
        expect(await pub.getBlockNumber()).toBe(head);
      }
    });

    it("an external 18-decimal token can be listed, and is reported as NOT issued by TokenFactory", async () => {
      const ext = await deployMock(CREATOR, "External", "EXT", 18);
      const state = classifyPair({ base: ext, quote: SGDX, baseProbe: await probe(ext), quoteProbe: await probe(SGDX), existing: null });
      expect(state).toEqual({ kind: "ready", unverified: ["base"] });
      expect(await read<boolean>(TOKEN_FACTORY, tokenFactoryAbi as Abi, "isFactoryToken", [ext])).toBe(false);
      const out = done(await createMarket(CREATOR, ext, SGDX));
      expect(await read<Address>(out.market, orderBookAbi as Abi, "baseToken")).toBe(ext);
    });

    it("the market a new token gets can be created by anyone, not only the token's creator", async () => {
      const token = done(await createToken(CREATOR, "Open", "OPEN", dec("10")));
      const out = done(await createMarket(BUYER, token.token, SGDX));
      expect(await read<Address>(out.market, orderBookAbi as Abi, "baseToken")).toBe(token.token);
    });
  });

  describe("a newly listed market trades like the seed market", () => {
    it("the creator approves and sells the new token; another account approves SGDx and buys: real fills, maker price, refund", async () => {
      const token = done(await createToken(CREATOR, "Fizz Coin", "FIZZ", dec("1000000")));
      const market = done(await createMarket(CREATOR, token.token, SGDX)).market;
      const pairInfo = { market, baseToken: token.token, quoteToken: SGDX };

      const lotSize = await read<bigint>(market, orderBookAbi as Abi, "LOT_SIZE");
      const tickSize = await read<bigint>(market, orderBookAbi as Abi, "TICK_SIZE");

      async function place(account: Address, side: "buy" | "sell", priceText: string, amountText: string) {
        const balances = { base: await balance(token.token, account), quote: await balance(SGDX, account) };
        const v = validateOrderInput({ side, priceText, amountText, lotSize, tickSize, balances });
        if (!v.ok) throw new Error(`validation failed: ${JSON.stringify(v.errors)}`);
        const collateralToken = v.order.collateralToken === "quote" ? SGDX : token.token;
        const allowance = await read<bigint>(collateralToken, demoTokenAbi as Abi, "allowance", [account, market]);
        let approvalHash: Hex | undefined;
        const ctx = ctxFor(account, market);
        const deps = viemDeps(pub, writeFor(account));
        const run = async (step: typeof runApproval | typeof runOrder, kind: "START_APPROVAL" | "START_ORDER") => {
          const attempt = ++attemptCounter;
          let state = flowReducer(initialFlowState<OrderOutcome>(), { type: kind, attempt, ctx });
          await step(deps, { ctx, pair: pairInfo, order: v.order, attempt }, (e) => { state = flowReducer(state, e); }, () => true);
          return state;
        };
        if (allowanceStep(v.order.collateral, allowance) === "approval-required") {
          const a = await run(runApproval, "START_APPROVAL");
          expect(a.phase, `approval failed: ${JSON.stringify(a.failure)}`).toBe("idle");
          approvalHash = a.approvalHash;
        }
        const o = await run(runOrder, "START_ORDER");
        expect(o.phase, `order failed: ${JSON.stringify(o.failure)}`).toBe("done");
        return { outcome: o.result!, approvalHash };
      }

      const creatorSgdxBefore = await balance(SGDX, CREATOR);
      const buyerFizzBefore = await balance(token.token, BUYER);
      const buyerSgdxBefore = await balance(SGDX, BUYER);

      const sell = await place(CREATOR, "sell", "2", "10");
      expect(sell.outcome.decoded.orderId).toBe(1n); // a brand-new book starts at order 1
      expect(sell.outcome.atBlock.status).toBe(0); // resting
      expect(await balance(token.token, market)).toBe(dec("10")); // escrowed

      const buy = await place(BUYER, "buy", "2.2", "4");
      expect(buy.outcome.decoded.trades).toHaveLength(1);
      expect(buy.outcome.decoded.trades[0]).toMatchObject({ price: dec("2"), baseAmount: dec("4"), quoteAmount: dec("8") }); // the maker's price
      expect(buy.outcome.decoded.refundQuote).toBe(dec("0.8"));
      expect(buy.outcome.problems).toEqual([]);

      expect((await balance(token.token, BUYER)) - buyerFizzBefore).toBe(dec("4"));
      expect(buyerSgdxBefore - (await balance(SGDX, BUYER))).toBe(dec("8")); // 8.8 escrowed, 0.8 refunded
      expect((await balance(SGDX, CREATOR)) - creatorSgdxBefore).toBe(dec("8"));
      expect(await balance(token.token, market)).toBe(dec("6")); // the seller's remainder
      expect(await read<bigint>(market, orderBookAbi as Abi, "lastTradePrice")).toBe(dec("2"));
      note("trade-on-new-market", { market, sellTx: sell.outcome.hash, buyTx: buy.outcome.hash, buyApprovalTx: buy.approvalHash, refund: buy.outcome.decoded.refundQuote });
    });

    it("the seed market is unaffected by activity on the new one", async () => {
      const token = done(await createToken(CREATOR, "Other", "OTH", dec("100")));
      done(await createMarket(CREATOR, token.token, SGDX));
      expect(await read<[bigint, bigint]>(SEED_MARKET, orderBookAbi as Abi, "getBestBid")).toEqual([0n, 0n]);
      expect(await balance(NTU, SEED_MARKET)).toBe(0n);
    });
  });

  it("describeTxError names the new factory errors in plain language", () => {
    for (const name of ["EmptyName", "EmptySymbol", "ZeroSupply", "SupplyTooLarge", "MarketExists", "InvalidTokens", "UnsupportedDecimals"]) {
      const e = Object.assign(new Error("x"), { name: "ContractFunctionRevertedError", data: { errorName: name } });
      const d = describeTxError(e);
      expect(d.kind).toBe("reverted");
      expect(d.errorName).toBe(name);
      expect(d.title).not.toMatch(/rejected this transaction/);
    }
  });
});
