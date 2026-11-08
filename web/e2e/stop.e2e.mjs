// Browser test of stop-limit orders (P2-8B.4) against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. The wallet is an injected stand-in that forwards to Anvil's unlocked dev accounts. What it
// does prove: the ticket's Stop-limit mode (trigger and limit prices, escrow at the LIMIT price, exact approval, review,
// two wallet requests with an allowance gap and one without), the pending order in My orders ("Waiting for price" versus
// "Eligible now: needs a Trigger stops transaction"), cancelling a pending stop, the Trigger stops panel for a token-less
// keeper (one request, no approval, result only from the confirmed receipt, activation never called a fill), and the
// failure and recovery states (rejection, a book changed elsewhere, account switch, speed-up, wallet-cancelled request,
// RPC outage, chain reset, a crossed remainder handed to Match orders, mobile layout).
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8547 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8547 npx next start -p 3101
//   E2E_RPC_URL=http://127.0.0.1:8547 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3101 npm run e2e:stop
// The scratch chain must be freshly deployed: the suite checks allowances, orders, the book and the trade price.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseGwei, toHex } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, orderBookAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-8b4-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const MARKET = D.market;
const NTU = D.baseToken.address;
const SGDX = D.quoteToken.address;
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"; // holds no trading tokens
const ACCOUNTS = [DEPLOYER, ALICE, BOB, CAROL, KEEPER];
const E18 = 10n ** 18n;
const dec = (s) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
const WAIT_TEXT =
  "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request.";

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const rpc = (method, params = []) => chain.request({ method, params });
const bal = (token, who) => chain.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] });
const allowanceOf = (token, who) => chain.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [who, MARKET] });
const getOrder = (id) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] });
const orderIds = (who) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] });
const bestPrices = async () => {
  const [bid, ask] = await Promise.all([
    chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestBid" }),
    chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestAsk" }),
  ]);
  return { bid: { id: bid[0], price: bid[1] }, ask: { id: ask[0], price: ask[1] } };
};
const hasTrade = () => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "hasTradePrice" });
const simTrigger = async (count = 10n) => (await chain.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "triggerStopOrders", args: [count] })).result;
const isCrossed = async () => {
  const b = await bestPrices();
  return b.bid.id !== 0n && b.ask.id !== 0n && b.bid.price >= b.ask.price;
};
const walletFor = (account) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
async function send(account, address, abi, functionName, args) {
  const { request } = await chain.simulateContract({ account, address, abi, functionName, args });
  const hash = await walletFor(account).writeContract(request);
  const rc = await chain.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${functionName} reverted during test setup`);
  return hash;
}
const approve = (who, token, amount) => send(who, token, demoTokenAbi, "approve", [MARKET, amount]);
async function place(who, side, price, amount, escrow) {
  await approve(who, side === 0 ? SGDX : NTU, dec(escrow));
  await send(who, MARKET, orderBookAbi, "placeLimitOrder", [side, dec(price), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}
/** A trade at `price` between Carol (sells 1 NTU) and Bob (buys it): sets the market's last trade price. */
async function tradeAt(price) {
  await place(CAROL, 1, price, "1", "1");
  await place(BOB, 0, price, "1", price);
}
/** A stop placed through the contract (fast setup). Returns its id. */
async function placeStop(who, side, trigger, limit, amount, escrow) {
  await approve(who, side === 0 ? SGDX : NTU, dec(escrow));
  await send(who, MARKET, orderBookAbi, "placeStopLimitOrder", [side, dec(trigger), dec(limit), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}
/** Clears whatever a test left: trigger and match what is eligible or crossed, then cancel whatever still rests or waits. Runs in `finally`. */
async function resetBook() {
  await rpc("evm_setAutomine", [true]);
  for (let i = 0; i < 6 && (await simTrigger()) > 0n; i++) await send(KEEPER, MARKET, orderBookAbi, "triggerStopOrders", [10n]);
  for (let i = 0; i < 6 && (await isCrossed()); i++) await send(KEEPER, MARKET, orderBookAbi, "matchOrders", [10n]);
  for (const who of ACCOUNTS) {
    for (const id of await orderIds(who)) {
      const o = await getOrder(id);
      if (o.status === 0 || o.status === 1 || o.status === 4) await send(who, MARKET, orderBookAbi, "cancelOrder", [id]);
    }
  }
  const b = await bestPrices();
  if (b.bid.id !== 0n || b.ask.id !== 0n) throw new Error("the book could not be cleared between tests");
}
const balances = async () => {
  const out = {};
  for (const who of [...ACCOUNTS, MARKET]) out[who] = { ntu: await bal(NTU, who), sgd: await bal(SGDX, who) };
  return out;
};
const diff = (a, b, who) => ({ ntu: b[who].ntu - a[who].ntu, sgd: b[who].sgd - a[who].sgd });

const results = [];
const consoleErrors = [];
let snapshotId;
let browser;
let pa; // Alice's page
let pk; // the keeper's page
let blocked = false;

const shot = (p, name, opts = {}) => p.screenshot({ path: join(SHOTS, name.replace(/\.png$/, ".jpg")), type: "jpeg", quality: 66, ...opts });
const assert = (cond, message) => {
  if (!cond) throw new Error(`assertion failed: ${message}`);
};
async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, status: "pass", ms: Date.now() - started });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, status: "fail", ms: Date.now() - started, error: String(e.message).split("\n")[0] });
    console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`);
    try {
      await shot(pa, `FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`);
    } catch {}
  } finally {
    blocked = false;
    for (const p of [pa, pk]) {
      try {
        await mock(p, () => {
          window.__mock.setDelay("tx", 0);
          window.__mock.setAccount(0);
        });
      } catch {}
    }
    try {
      await resetBook();
    } catch (e) {
      results.push({ name: `cleanup after "${name}"`, status: "fail", ms: 0, error: String(e.message).split("\n")[0] });
      console.log(`  FAIL  cleanup after "${name}"\n        ${String(e.message).split("\n")[0]}`);
    }
  }
}
const mock = (p, fn, arg) => p.evaluate(fn, arg);
// Visible text only: the visually hidden exact values (`.sr-only`) are left out, so assertions check what is drawn.
const text = async (locator) =>
  (await locator.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }))?.replace(/\s+/g, " ").trim() ?? "";
const sentCount = (p) => mock(p, () => window.__mock.sentCount());
const lastSent = (p) => mock(p, () => window.__mock.lastSent());
const gotoTrade = (p) => p.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
async function connect(p) {
  await p.getByRole("button", { name: /Connect wallet/ }).first().click();
  await p.getByRole("button", { name: /Browser Wallet/ }).click();
  await p.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
}
/** A fresh page load forgets the mock wallet's connection, so connect again. */
async function openTrade(p) {
  await gotoTrade(p);
  await p.getByRole("button", { name: /Connect wallet|open account menu/ }).first().waitFor({ timeout: 30000 });
  if ((await p.getByRole("button", { name: /open account menu/ }).count()) === 0) await connect(p);
}
const cta = (p, name) => p.locator("#order").getByRole("button", { name });
const row = (p, id) => p.locator(`[data-order-id="${id}"]`);
const triggerCalldata = (n) => encodeFunctionData({ abi: orderBookAbi, functionName: "triggerStopOrders", args: [n] });

async function fillStop(p, { trigger, limit, amount, side = "sell" }) {
  await p.getByTestId("mode-stop").click();
  await p.getByRole("radio", { name: side === "sell" ? /^Sell NTU$/ : /^Buy NTU$/ }).click();
  await p.locator("#order-trigger").fill(trigger);
  await p.locator("#order-price").fill(limit);
  await p.locator("#order-amount").fill(amount);
}
async function openTriggerReview(p) {
  await p.getByTestId("trigger-review-button").waitFor({ timeout: 30000 });
  await p.waitForFunction(() => !document.querySelector('[data-testid="trigger-review-button"]')?.disabled, null, { timeout: 15000 });
  await p.getByTestId("trigger-review-button").click();
  await p.getByTestId("trigger-confirm").waitFor({ timeout: 15000 });
}

async function main() {
  snapshotId = await rpc("evm_snapshot");
  // State is verified, not assumed (P2-8B.1: a leftover allowance on a reused scratch chain broke a suite).
  const dirty = [];
  for (const [name, who] of [["Deployer", DEPLOYER], ["Alice", ALICE], ["Bob", BOB], ["Carol", CAROL], ["Keeper", KEEPER]]) {
    if ((await allowanceOf(NTU, who)) !== 0n) dirty.push(`${name} NTU allowance`);
    if ((await allowanceOf(SGDX, who)) !== 0n) dirty.push(`${name} SGDx allowance`);
    if ((await orderIds(who)).length !== 0) dirty.push(`${name} orders`);
  }
  const b0 = await bestPrices();
  if (b0.bid.id !== 0n || b0.ask.id !== 0n) dirty.push("a non-empty book");
  if (await hasTrade()) dirty.push("a market that already has a trade price");
  if ((await bal(NTU, KEEPER)) !== 0n || (await bal(SGDX, KEEPER)) !== 0n) dirty.push("a keeper that holds trading tokens");
  assert(dirty.length === 0, `the scratch chain is not freshly deployed (leftover: ${dirty.join(", ")}); restart the scratch Anvil and redeploy first`);

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const rpcOrigin = new URL(RPC).origin;
  const make = async (accounts) => {
    const c = await browser.newContext({ viewport: { width: 1586, height: 1100 } });
    await c.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts }) });
    await c.route(`${rpcOrigin}/**`, (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
    const p = await c.newPage();
    p.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
    p.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
    p.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    return [c, p];
  };
  // Alice's wallet (account 1 of the mock is Bob, for account switching) and the keeper's wallet (account 1 is Alice).
  [, pa] = await make([ALICE, BOB]);
  [, pk] = await make([KEEPER, ALICE]);

  await test("the normal limit ticket is unchanged; Stop-limit mode adds a trigger field and the plain-language explanation, and switches back", async () => {
    await openTrade(pa);
    await pa.locator("#order-price").waitFor({ timeout: 30000 });
    assert((await text(pa.locator("#order-title"))) === "Limit order", "the panel is titled Limit order");
    assert((await pa.getByTestId("mode-limit").getAttribute("aria-checked")) === "true", "Limit is the default mode");
    assert((await pa.locator("#order-trigger").count()) === 0, "no trigger field in limit mode");
    assert((await pa.getByRole("radio", { name: "Stop-limit" }).count()) === 1, "the mode switch has an accessible name equal to its visible text");
    await pa.getByTestId("mode-stop").click();
    await pa.locator("#order-trigger").waitFor();
    assert((await text(pa.locator("#order-title"))) === "Stop-limit order", "the panel is titled Stop-limit order");
    const t = await text(pa.getByTestId("stop-explainer"));
    assert(/trigger price.*market condition.*eligible/.test(t) && /limit price.*boundary.*activated/.test(t), `the explainer separates the two prices (got: ${t})`);
    assert(/No trade yet/.test(await text(pa.getByTestId("last-trade-hint"))), "before any trade it says stops cannot trigger yet");
    await shot(pa, "stop-ticket-desktop.png", { fullPage: true });
    await pa.getByTestId("mode-limit").click();
    assert((await pa.locator("#order-trigger").count()) === 0, "switching back removes the trigger field");
  });

  await test("PLACE a sell stop through the UI with an allowance gap: review, exact approval (request 1), then placeStopLimitOrder (request 2); result is PENDING, outside the book", async () => {
    await openTrade(pa);
    await fillStop(pa, { trigger: "1.8", limit: "1.7", amount: "10" });
    await cta(pa, "Review stop-limit order").click();
    const review = pa.getByTestId("review");
    await review.waitFor();
    const t = await text(review);
    assert(/Trigger price/.test(t) && /Limit price/.test(t) && /1\.8/.test(t) && /1\.7/.test(t), "the review shows both prices");
    assert(/stop-limit.*escrowed now, at the limit price.*pending.*not on the order book/i.test(await text(pa.getByTestId("stop-review-state"))), "the review says it is escrowed now and pending");
    assert(/no trade has happened/i.test(await text(pa.getByTestId("stop-review-state"))), "with no trade yet it says no stop can trigger");
    assert(/approve exactly\s*10(\.0+)? NTU/i.test(t), "step 1 is an exact approval of 10 NTU");
    await shot(pa, "stop-review-desktop.png", { fullPage: true });
    const sent0 = await sentCount(pa);
    await cta(pa, /^Approve 10/).click();
    for (let i = 0; i < 100 && (await sentCount(pa)) === sent0; i++) await pa.waitForTimeout(100);
    const approval = await rpc("eth_getTransactionByHash", [(await lastSent(pa)).hash]);
    assert(approval.to.toLowerCase() === NTU.toLowerCase(), "request 1 went to the NTU token");
    assert(approval.input.toLowerCase().endsWith(dec("10").toString(16).padStart(64, "0")), "the approval is exactly 10 NTU (never unlimited)");
    assert((await sentCount(pa)) === sent0 + 1, "exactly one request so far");
    await cta(pa, "Place sell stop-limit order").waitFor({ timeout: 30000 });
    assert((await allowanceOf(NTU, ALICE)) === dec("10"), "on-chain: the allowance is exactly 10");
    await mock(pa, (ms) => window.__mock.setDelay("tx", ms), 2000);
    await cta(pa, "Place sell stop-limit order").click();
    await pa.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    assert((await pa.getByTestId("stop-result").count()) === 0, "nothing is claimed while the wallet is asked");
    await pa.getByTestId("stop-result").waitFor({ timeout: 40000 });
    await mock(pa, () => window.__mock.setDelay("tx", 0));
    assert((await sentCount(pa)) === sent0 + 2, "exactly two requests: approval, then placement");
    const placed = await rpc("eth_getTransactionByHash", [(await lastSent(pa)).hash]);
    const want = encodeFunctionData({ abi: orderBookAbi, functionName: "placeStopLimitOrder", args: [1, dec("1.8"), dec("1.7"), dec("10")] });
    assert(placed.to.toLowerCase() === MARKET.toLowerCase() && placed.input === want, "request 2 is placeStopLimitOrder(Sell, trigger 1.8, limit 1.7, 10)");
    const res = pa.getByTestId("stop-result");
    assert(/placed and pending/.test(await text(res)) && (await text(pa.getByTestId("stop-result-status"))) === "Pending trigger", "the result says pending");
    assert(!/filled|activated/i.test(await text(res).then((t) => t.replace(/Nothing has been activated or filled/, ""))), "it never says filled or activated");
    assert(/no trade has happened/i.test(await text(pa.getByTestId("stop-result-state"))), "and says it waits for the first trade");
    const id = (await orderIds(ALICE)).at(-1);
    const o = await getOrder(id);
    assert(o.status === 4 && o.triggerPrice === dec("1.8") && o.price === dec("1.7") && o.amount === dec("10") && o.lockedQuote === 0n, "on-chain: PendingTrigger with the requested prices and amount");
    assert((await bal(NTU, MARKET)) === dec("10") && (await allowanceOf(NTU, ALICE)) === 0n, "on-chain: 10 NTU escrowed, the exact approval consumed");
    // pending stops are not book liquidity: not in the book panel, not in the depth
    await pa.getByText("The book is empty").first().waitFor({ timeout: 20000 });
    assert((await pa.locator("#book").getByText(/Sell \(ask\)/).count()) === 0, "the pending stop is not in the Order book panel");
    await row(pa, id).waitFor({ timeout: 30000 });
    assert((await text(row(pa, id).getByTestId("order-row-status"))) === "Pending trigger", "My orders lists it as Pending trigger");
    const info = await text(pa.getByTestId(`stop-info-${id}`));
    assert(/Stop-limit: trigger 1\.8.*limit 1\.7/.test(info) && /Waiting for price: no trade has happened/.test(info), `My orders shows trigger, limit and why it waits (got: ${info})`);
    await shot(pa, "stop-result-pending-desktop.png", { fullPage: true });
  });

  await test("PLACE with an allowance already in place: ONE wallet request (no approval); a BUY stop escrows quote at the LIMIT price", async () => {
    await approve(ALICE, SGDX, dec("10.4")); // requiredQuote(4, 2.6)
    await openTrade(pa);
    await fillStop(pa, { trigger: "2.5", limit: "2.6", amount: "4", side: "buy" });
    await cta(pa, "Review stop-limit order").click();
    await pa.getByTestId("review").waitFor();
    assert(/already approved/.test(await text(pa.getByTestId("review"))), "the review says only the order needs a signature");
    const sent0 = await sentCount(pa);
    await cta(pa, "Place buy stop-limit order").click();
    await pa.getByTestId("stop-result").waitFor({ timeout: 40000 });
    assert((await sentCount(pa)) === sent0 + 1, "exactly one wallet request");
    const id = (await orderIds(ALICE)).at(-1);
    const o = await getOrder(id);
    assert(o.status === 4 && o.lockedQuote === dec("10.4"), "on-chain: the locked quote is requiredQuote(4, LIMIT 2.6) = 10.4, not 4 x 2.5");
    assert((await bal(SGDX, MARKET)) === dec("10.4"), "on-chain: 10.4 SGDx escrowed");
  });

  await test("WAITING for price versus ELIGIBLE now: an eligible stop does not wait for another trade, it waits for a Trigger stops transaction (and stays pending and escrowed)", async () => {
    await tradeAt("2");
    const id = await placeStop(ALICE, 1, "1.8", "1.7", "10", "10");
    await openTrade(pa);
    await row(pa, id).waitFor({ timeout: 30000 });
    await pa.waitForFunction((id) => document.querySelector(`[data-testid="stop-state-${id}"]`)?.getAttribute("data-state") === "waiting", id, { timeout: 30000 });
    assert(/Waiting for price: it needs the last trade price to fall to or below 1\.8/.test(await text(pa.getByTestId(`stop-state-${id}`))), "last trade 2 > trigger 1.8: waits for a FALL");
    assert((await simTrigger()) === 0n, "the contract agrees: nothing would activate");
    await openTrade(pk);
    await pk.getByText("Order book").first().waitFor({ timeout: 30000 });
    assert((await pk.getByTestId("trigger-panel").count()) === 0, "no Trigger stops panel while no stop is eligible");
    await tradeAt("1.8"); // the price falls to exactly the trigger
    await pa.waitForFunction((id) => document.querySelector(`[data-testid="stop-state-${id}"]`)?.getAttribute("data-state") === "eligible", id, { timeout: 30000 });
    const st = await text(pa.getByTestId(`stop-state-${id}`));
    assert(/^Eligible now/.test(st) && /Trigger stops transaction/.test(st) && /does not need another trade/.test(st), `eligible wording (got: ${st})`);
    assert(!/filled|executed/i.test(st), "an eligible stop is not said to be filled");
    const o = await getOrder(id);
    assert(o.status === 4 && (await bal(NTU, MARKET)) >= dec("10"), "on-chain: still PendingTrigger, collateral still escrowed");
    await pk.getByTestId("trigger-eligible").waitFor({ timeout: 30000 });
    const t = await text(pk.getByTestId("trigger-eligible"));
    assert(/No other trade is needed/.test(t) && /Activation is not execution/.test(t) && /no token approval is needed/.test(t), `the panel explains eligible-versus-activated (got: ${t.slice(0, 200)})`);
    await shot(pk, "stop-eligible-panel-desktop.png", { fullPage: true });
  });

  await test("CANCEL a pending stop (the Bonus 1 flow): the refund is stated first and is the full escrow; the order stays in history", async () => {
    await tradeAt("2");
    const id = await placeStop(ALICE, 1, "1.8", "1.7", "10", "10");
    const before = await balances();
    await openTrade(pa);
    await row(pa, id).waitFor({ timeout: 30000 });
    await pa.getByTestId(`cancel-order-${id}`).click();
    await pa.getByTestId("cancel-confirm").waitFor();
    assert(/has not triggered/.test(await text(pa.getByTestId("cancel-confirm"))) && /\b10(\.0+)?\b/.test(await text(pa.getByTestId("cancel-expected"))), "the confirmation says it has not triggered and the refund is 10 NTU");
    await pa.getByTestId("cancel-confirm-button").click();
    await pa.getByTestId("cancel-result").waitFor({ timeout: 40000 });
    const after = await balances();
    assert(diff(before, after, ALICE).ntu === dec("10") && (await getOrder(id)).status === 3, "on-chain: 10 NTU refunded, order Cancelled");
    await pa.waitForFunction((id) => document.querySelector(`[data-order-id="${id}"] [data-testid="order-row-status"]`)?.textContent?.trim() === "Cancelled", id, { timeout: 20000 });
    assert((await row(pa, id).count()) === 1, "the cancelled stop stays in My orders as history");
    await pa.getByTestId("cancel-result").getByRole("button", { name: "Close" }).click();
  });

  await test("TRIGGER as a token-less KEEPER: review (estimate, gas, no approval), one request, then a result built from the receipt; the stop FILLED as a taker, the keeper's balances unchanged", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "4", "4"); // eligible at once, still pending
    await place(BOB, 0, "1.9", "4", "7.6"); // a resting bid above the stop's limit
    const before = await balances();
    await openTrade(pk);
    await openTriggerReview(pk);
    await pk.getByText(/about 1 stop/).waitFor({ timeout: 15000 });
    const t = await text(pk.getByTestId("trigger-confirm"));
    assert(/triggerStopOrders\(10\)/.test(t) && /Activates at most\s*10 stops/.test(t) && /Gas estimate\s*\d+/.test(t) && /No token approval is needed/.test(t), `the review (got: ${t.slice(0, 260)})`);
    assert((await sentCount(pk)) === 0, "opening the review sent nothing to the wallet");
    await shot(pk, "stop-trigger-review-desktop.png", { fullPage: true });
    await mock(pk, (ms) => window.__mock.setDelay("tx", ms), 2000);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    assert((await pk.getByTestId("trigger-result").count()) === 0, "no result while the wallet is asked");
    await pk.getByTestId("trigger-result").waitFor({ timeout: 40000 });
    await mock(pk, () => window.__mock.setDelay("tx", 0));
    assert((await sentCount(pk)) === 1, "exactly one wallet request (no approval)");
    const sent = await lastSent(pk);
    const tx = await rpc("eth_getTransactionByHash", [sent.hash]);
    assert(tx.to.toLowerCase() === MARKET.toLowerCase() && tx.from.toLowerCase() === KEEPER.toLowerCase() && tx.input === triggerCalldata(10n), "from the keeper, to the market, calldata triggerStopOrders(10)");
    const head = await text(pk.getByTestId("trigger-headline"));
    assert(/Triggered: 1 stop order activated/.test(head), `headline (got: ${head})`);
    const line = await text(pk.getByTestId(`trigger-stop-${stop}`));
    assert(/Activated and filled completely/.test(line) && /Filled/.test(line), `the stop's own line says what happened to it (got: ${line})`);
    assert((await pk.getByTestId(`trigger-stop-${stop}`).getAttribute("data-outcome")) === "filled", "outcome filled");
    assert(!/checks disagree/.test(await text(pk.getByTestId("trigger-result"))), "no reconciliation problems");
    const after = await balances();
    assert(diff(before, after, KEEPER).ntu === 0n && diff(before, after, KEEPER).sgd === 0n, "on-chain: the keeper's trading balances did not change");
    assert(diff(before, after, ALICE).sgd === dec("7.6") && diff(before, after, BOB).ntu === dec("4"), "on-chain: Alice was paid 7.6 SGDx at the MAKER's price 1.9, Bob received 4 NTU");
    assert((await getOrder(stop)).status === 2, "on-chain: the stop is Filled");
    await shot(pk, "stop-trigger-result-desktop.png", { fullPage: true });
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
    await pk.getByTestId("trigger-panel").waitFor({ state: "detached", timeout: 20000 });
  });

  await test("an activated stop that does NOT fill rests as an ordinary order: the result says so and never says filled", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "3", "3");
    await openTrade(pk);
    await openTriggerReview(pk);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByTestId("trigger-result").waitFor({ timeout: 40000 });
    assert((await pk.getByTestId(`trigger-stop-${stop}`).getAttribute("data-outcome")) === "resting", "outcome resting");
    const line = await text(pk.getByTestId(`trigger-stop-${stop}`));
    assert(/resting order at its limit price/.test(line) && /Nothing was filled/.test(line), `resting wording (got: ${line})`);
    const o = await getOrder(stop);
    assert(o.status === 0 && o.filled === 0n, "on-chain: Open, nothing filled");
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
  });

  await test("a stop triggered by someone else while the review is open: the panel disappears and the wallet is never asked", async () => {
    await tradeAt("2");
    await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await openTriggerReview(pk);
    await send(CAROL, MARKET, orderBookAbi, "triggerStopOrders", [10n]);
    await pk.getByTestId("trigger-panel").waitFor({ state: "detached", timeout: 30000 });
    assert((await sentCount(pk)) === 0, "the wallet was never asked");
  });

  await test("a wallet rejection is reported as a rejection: nothing sent, the stop stays pending, Try again recovers", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await openTriggerReview(pk);
    await mock(pk, () => window.__mock.rejectNext());
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByText("You rejected the trigger request").waitFor({ timeout: 15000 });
    assert((await sentCount(pk)) === 0 && (await pk.getByTestId("trigger-result").count()) === 0, "nothing sent, no result");
    assert((await getOrder(stop)).status === 4, "on-chain: still pending");
    await pk.getByTestId("trigger-panel").getByRole("button", { name: "Try again" }).click();
    await pk.getByTestId("trigger-eligible").waitFor({ timeout: 15000 });
    await openTriggerReview(pk);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByTestId("trigger-result").waitFor({ timeout: 40000 });
    assert((await getOrder(stop)).status === 0, "after Try again the trigger succeeds");
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
  });

  await test("an account switch while the wallet request is open: dropped, flagged, nothing attributed", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await openTriggerReview(pk);
    await mock(pk, (ms) => window.__mock.setDelay("tx", ms), 3000);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    await mock(pk, () => window.__mock.setAccount(1));
    await pk.getByText("Your account or network changed").waitFor({ timeout: 10000 });
    await pk.waitForTimeout(4000);
    assert((await pk.getByTestId("trigger-result").count()) === 0 && (await getOrder(stop)).status === 4, "no result is attributed, the stop is untouched");
    assert((await sentCount(pk)) === 0, "the wallet sent nothing for the new account");
    await mock(pk, () => {
      window.__mock.setDelay("tx", 0);
      window.__mock.setAccount(0);
    });
    await pk.getByRole("button", { name: "Dismiss" }).first().click();
  });

  await test("a speed-up that stays pending is followed to its new hash and confirmed once", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await openTriggerReview(pk);
    await rpc("evm_setAutomine", [false]);
    try {
      await pk.getByTestId("trigger-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount(pk)) === 0; i++) await pk.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent(pk)).hash]);
      assert(original && original.blockNumber === null, "the wallet's transaction is pending (auto-mining is off)");
      const replacement = await rpc("eth_sendTransaction", [
        { from: original.from, to: original.to, data: original.input, value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) },
      ]);
      await pk.waitForTimeout(1500);
      assert((await pk.getByTestId("trigger-result").count()) === 0, "no result while only a pending speed-up exists");
      await rpc("evm_mine");
      await pk.getByTestId("trigger-result").waitFor({ timeout: 30000 });
      assert((await pk.getByTestId("trigger-result").locator(`a[title="${replacement}"]`).count()) === 1, "the result links the transaction that actually mined");
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    assert((await getOrder(stop)).status === 0, "on-chain: activated exactly once");
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
  });

  await test("a trigger request that the wallet itself cancels is reported as cancelled; the stop is still pending", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await openTriggerReview(pk);
    await rpc("evm_setAutomine", [false]);
    try {
      await pk.getByTestId("trigger-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount(pk)) === 0; i++) await pk.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent(pk)).hash]);
      await rpc("eth_sendTransaction", [{ from: original.from, to: original.from, data: "0x", value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) }]);
      await pk.waitForTimeout(1500);
      await rpc("evm_mine");
      await pk.getByText("The trigger request was itself cancelled").waitFor({ timeout: 30000 });
      assert((await pk.getByTestId("trigger-result").count()) === 0 && (await getOrder(stop)).status === 4, "no success card, the stop is still pending");
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
  });

  await test("an RPC outage: the terminal is replaced by 'Node unreachable' (no Trigger control); after verified recovery the action returns and works", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await openTrade(pk);
    await pk.getByTestId("trigger-review-button").waitFor({ timeout: 30000 });
    blocked = true;
    try {
      await pk.getByTestId("rpc-offline").waitFor({ timeout: 40000 });
      assert((await pk.getByTestId("trigger-panel").count()) === 0 && (await pk.getByRole("button", { name: /Review trigger|Confirm trigger/ }).count()) === 0, "no Trigger control while the node is unreachable");
      assert((await pk.getByText("Node unreachable").count()) >= 1, "the page says the node is unreachable");
    } finally {
      blocked = false;
    }
    await pk.getByTestId("rpc-offline").waitFor({ state: "detached", timeout: 60000 });
    await pk.getByTestId("rpc-verifying").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
    await openTriggerReview(pk);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByTestId("trigger-result").waitFor({ timeout: 40000 });
    assert((await getOrder(stop)).status === 0, "triggering works after recovery");
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
  });

  await test("a chain reset while the review is open: the notice appears, the eligible stop is gone and nothing can be sent", async () => {
    const s = await rpc("evm_snapshot");
    await tradeAt("2");
    await placeStop(ALICE, 1, "2", "1.7", "2", "2"); // exists only on the chain that is about to be replaced
    await openTrade(pk);
    await openTriggerReview(pk);
    await rpc("evm_revert", [s]);
    await pk.getByTestId("chain-reset-notice").waitFor({ timeout: 25000 });
    await pk.getByTestId("trigger-panel").waitFor({ state: "detached", timeout: 25000 });
    assert((await pk.getByTestId("trigger-confirm-button").count()) === 0, "no Confirm button for a stop the chain no longer has");
    await pk.getByTestId("chain-reset-notice").getByRole("button", { name: "Dismiss" }).click();
  });

  await test("activation hits the engine's 10-fill budget and leaves a CROSSED book: the result says so and the Match orders panel (Bonus 2) takes over", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "2", "1.5", "15", "15");
    await approve(BOB, SGDX, dec("20"));
    await approve(CAROL, SGDX, dec("10"));
    for (let i = 0; i < 10; i++) await send(BOB, MARKET, orderBookAbi, "placeLimitOrder", [0, dec("2"), dec("1")]);
    for (let i = 0; i < 5; i++) await send(CAROL, MARKET, orderBookAbi, "placeLimitOrder", [0, dec("2"), dec("1")]);
    await openTrade(pk);
    await openTriggerReview(pk);
    await pk.getByTestId("trigger-confirm-button").click();
    await pk.getByTestId("trigger-result").waitFor({ timeout: 40000 });
    assert((await pk.getByTestId(`trigger-stop-${stop}`).getAttribute("data-outcome")) === "partly-filled", "the stop filled 10 and the rest rests");
    assert(/Yes: use Match orders/.test(await text(pk.getByTestId("trigger-crossed"))), "the result says the book is crossed");
    await pk.getByTestId("match-crossed").waitFor({ timeout: 30000 });
    await pk.getByTestId("match-review-button").waitFor();
    await pk.getByTestId("trigger-result").getByRole("button", { name: "Close" }).click();
    await pk.waitForFunction(() => !document.querySelector('[data-testid="match-review-button"]')?.disabled, null, { timeout: 15000 });
    await pk.getByTestId("match-review-button").click();
    await pk.getByTestId("match-confirm-button").click();
    await pk.getByTestId("match-result").waitFor({ timeout: 40000 });
    assert(!(await isCrossed()) && (await getOrder(stop)).status === 2, "on-chain: Match orders cleared the remainder and the stop is Filled");
    await pk.getByTestId("match-result").getByRole("button", { name: "Close" }).click();
  });

  await test("mobile (375 px): the stop-limit ticket, its review and the Trigger stops panel fit without horizontal overflow; keyboard reaches the mode switch", async () => {
    await tradeAt("2");
    await placeStop(ALICE, 1, "2", "1.7", "2", "2");
    await pa.setViewportSize({ width: 375, height: 800 });
    await pk.setViewportSize({ width: 375, height: 800 });
    await openTrade(pa);
    await fillStop(pa, { trigger: "1.8", limit: "1.7", amount: "1" });
    await cta(pa, "Review stop-limit order").click();
    await pa.getByTestId("review").waitFor();
    assert((await pa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal overflow in the stop-limit review");
    await shot(pa, "stop-review-mobile.jpg", { fullPage: true });
    await openTrade(pk);
    await openTriggerReview(pk);
    assert((await pk.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal overflow in the trigger review");
    const box = await pk.getByTestId("trigger-confirm-button").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 375 && box.height >= 36, "the Confirm button is fully on screen and at least 36 px tall");
    await shot(pk, "stop-trigger-review-mobile.jpg", { fullPage: true });
    await pa.setViewportSize({ width: 1586, height: 1100 });
    await pk.setViewportSize({ width: 1586, height: 1100 });
    await openTrade(pa);
    await pa.getByTestId("mode-limit").focus();
    await pa.keyboard.press("Tab");
    assert((await pa.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "mode-stop" || (await pa.evaluate(() => document.activeElement?.textContent)) !== "", "Tab moves focus along the mode switch");
  });

  await test("no unexpected console errors", async () => {
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  });
}

try {
  await main();
} catch (e) {
  results.push({ name: "setup", status: "fail", ms: 0, error: String(e.message).split("\n")[0] });
  console.log(`  FAIL  setup\n        ${String(e.message).split("\n")[0]}`);
} finally {
  try {
    await rpc("evm_setAutomine", [true]);
    if (snapshotId) await rpc("evm_revert", [snapshotId]);
  } catch {}
  await browser?.close();
  writeFileSync(join(SHOTS, "results-stop.json"), JSON.stringify({ results, consoleErrors }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (mock wallet, scratch chain)`);
  process.exit(failed ? 1 : 0);
}
