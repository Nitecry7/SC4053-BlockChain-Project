// Browser test of batch matching (P2-8B.3) against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. The wallet is an injected stand-in that forwards to Anvil's unlocked dev accounts. What it
// does prove: the Match orders panel appears only while the market itself reports a crossed book, explains what matching
// is, asks the wallet for exactly one matchOrders transaction (no approval) from a token-less keeper, reports success
// only from the confirmed receipt's Trade events, never repeats by itself, and handles rejection, a book settled
// elsewhere, an account switch, a speed-up, a wallet-cancelled request, an RPC outage and a chain reset.
//
// Crossed books are SET UP directly through the contracts (viem, unlocked dev accounts): a placement hits the engine's
// 10-fill cap and rests a crossed remainder. Placing orders through the ticket is covered by trade.e2e.mjs.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:match
// The scratch chain must be freshly deployed: the suite checks allowances, orders and the book, and cleans up in `finally`.
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
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-8b3-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const MARKET = D.market;
const NTU = D.baseToken.address;
const SGDX = D.quoteToken.address;
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // account 0
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // account 1
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // account 2
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // account 3
const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"; // account 4: holds no trading tokens
const E18 = 10n ** 18n;
const dec = (s) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
const WAIT_TEXT =
  "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request.";
const MATCH_INPUT = encodeFunctionData({ abi: orderBookAbi, functionName: "matchOrders", args: [10n] });

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
const sell = (who, price, amount) => place(who, 1, price, amount, amount);
/** Eleven 1-NTU asks at 2 (Alice) and a bid for 11 at 3 (Bob): the bid hits the 10-fill cap and rests 1 NTU crossed with 1 ask. */
async function seedSmall() {
  const asks = [];
  for (let i = 0; i < 11; i++) asks.push(await sell(ALICE, "2", "1"));
  const bid = await place(BOB, 0, "3", "11", "33");
  return { asks, bid };
}
/** 22 asks from Alice and Carol (alternating), Bob bids 11 at 3 and the deployer bids 11 at 2.5: the engine's handoff scenario. */
async function seedMultiParty() {
  const asks = [];
  for (let i = 0; i < 22; i++) asks.push(await sell(i % 2 === 0 ? ALICE : CAROL, "2", "1"));
  const bobBid = await place(BOB, 0, "3", "11", "33");
  const deployerBid = await place(DEPLOYER, 0, "2.5", "11", "27.5");
  return { asks, bobBid, deployerBid };
}
/** Clears whatever a test left: match what crosses, then cancel whatever still rests. Runs in `finally`, even after a failure. */
async function resetBook() {
  await rpc("evm_setAutomine", [true]);
  for (let i = 0; i < 6 && (await isCrossed()); i++) await send(KEEPER, MARKET, orderBookAbi, "matchOrders", [10n]);
  for (const who of [DEPLOYER, ALICE, BOB, CAROL]) {
    for (const id of await orderIds(who)) {
      const o = await getOrder(id);
      if (o.status === 0 || o.status === 1) await send(who, MARKET, orderBookAbi, "cancelOrder", [id]);
    }
  }
  const b = await bestPrices();
  if (b.bid.id !== 0n || b.ask.id !== 0n) throw new Error("the book could not be cleared between tests");
}
const snapshotBalances = async () => {
  const out = {};
  for (const who of [DEPLOYER, ALICE, BOB, CAROL, KEEPER, MARKET]) out[who] = { ntu: await bal(NTU, who), sgd: await bal(SGDX, who) };
  return out;
};
const diff = (a, b, who) => ({ ntu: b[who].ntu - a[who].ntu, sgd: b[who].sgd - a[who].sgd });

const results = [];
const consoleErrors = [];
let snapshotId;
let page;
let context;
let browser;
let blocked = false;

const shot = (name, opts = {}) => page.screenshot({ path: join(SHOTS, name.replace(/\.png$/, ".jpg")), type: "jpeg", quality: 66, ...opts });
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
      await shot(`FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`);
    } catch {}
  } finally {
    blocked = false;
    try {
      await mock(() => { window.__mock.setDelay("tx", 0); window.__mock.setAccount(0); });
    } catch {}
    try {
      await resetBook();
    } catch (e) {
      results.push({ name: `cleanup after "${name}"`, status: "fail", ms: 0, error: String(e.message).split("\n")[0] });
      console.log(`  FAIL  cleanup after "${name}"\n        ${String(e.message).split("\n")[0]}`);
    }
  }
}
const mock = (fn, arg) => page.evaluate(fn, arg);
// Visible text only: the visually hidden exact values (`.sr-only`) are left out, so assertions check what is drawn.
const text = async (locator) =>
  (await locator.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }))?.replace(/\s+/g, " ").trim() ?? "";
const sentCount = () => mock(() => window.__mock.sentCount());
const lastSent = () => mock(() => window.__mock.lastSent());
const reviewButton = () => page.getByTestId("match-review-button");
const panelCount = () => page.getByTestId("match-panel").count();

const gotoTrade = () => page.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
async function connect() {
  await page.getByRole("button", { name: /Connect wallet/ }).first().click();
  await page.getByRole("button", { name: /Browser Wallet/ }).click();
  await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
}
/** A fresh page load forgets the mock wallet's connection, so connect again (as the keeper, account 0 of the mock). */
async function openTrade() {
  await gotoTrade();
  await page.getByRole("button", { name: /Connect wallet|open account menu/ }).first().waitFor({ timeout: 30000 });
  if ((await page.getByRole("button", { name: /open account menu/ }).count()) === 0) await connect();
}
async function openReview() {
  await reviewButton().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="match-review-button"]')?.disabled, null, { timeout: 15000 });
  await reviewButton().click();
  await page.getByTestId("match-confirm").waitFor({ timeout: 15000 });
}
async function confirmAndWaitForResult() {
  await page.getByTestId("match-confirm-button").click();
  await page.getByTestId("match-result").waitFor({ timeout: 40000 });
}
const closeResult = () => page.getByTestId("match-result").getByRole("button", { name: "Close" }).click();

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
  if ((await bal(NTU, KEEPER)) !== 0n || (await bal(SGDX, KEEPER)) !== 0n) dirty.push("a keeper that holds trading tokens");
  assert(dirty.length === 0, `the scratch chain is not freshly deployed (leftover: ${dirty.join(", ")}); restart the scratch Anvil and redeploy first`);

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1100 } });
  // Account 0 of the mock wallet is the keeper: it holds no NTU and no SGDx, only gas money.
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [KEEPER, ALICE, BOB] }) });
  const rpcOrigin = new URL(RPC).origin;
  await context.route(`${rpcOrigin}/**`, (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("an uncrossed book (empty, then asks only): no Match orders panel, with or without a wallet", async () => {
    await gotoTrade();
    await page.getByText("Order book").first().waitFor({ timeout: 30000 });
    await page.getByText("The book is empty").first().waitFor({ timeout: 30000 });
    assert((await panelCount()) === 0, "no panel on an empty book");
    await sell(ALICE, "2", "1"); // asks only: nothing crosses
    await page.getByText(/Sell \(ask\)/).first().waitFor({ timeout: 30000 });
    assert((await panelCount()) === 0, "no panel when only one side exists");
    await bestPrices();
    assert(!(await isCrossed()), "on-chain: the book is not crossed");
    assert((await page.getByRole("button", { name: /Match orders|Review match|Confirm match/ }).count()) === 0, "no misleading Match button");
  });

  await test("a crossed book while DISCONNECTED: the panel explains matching, the action is disabled and asks for a wallet", async () => {
    await resetBook();
    await seedSmall();
    assert(await isCrossed(), "on-chain: the seeded book is crossed");
    await gotoTrade();
    await page.getByTestId("match-crossed").waitFor({ timeout: 30000 });
    const t = await text(page.getByTestId("match-crossed"));
    assert(/can be matched/.test(t) && /Anyone can/.test(t) && /no token approval is needed/.test(t) && /at most 10 fills/.test(t) && /another one/.test(t), `the explanation covers the points (got: ${t.slice(0, 260)})`);
    assert(!/\b\d+ (orders|fills) can (be )?(match|settle)/i.test(t), "no final count is promised before the transaction");
    assert(await reviewButton().isDisabled(), "Review match is disabled without a wallet");
    assert(/Connect your wallet/.test(t), "it says a wallet is needed");
    // axe found a duplicate id here once (the inner heading reused the Panel's own heading id): ids on the page must be unique.
    const dup = await page.evaluate(() => { const seen = new Map(); document.querySelectorAll("[id]").forEach((n) => seen.set(n.id, (seen.get(n.id) ?? 0) + 1)); return [...seen].filter(([, c]) => c > 1).map(([id]) => id); });
    assert(dup.length === 0, `no duplicate element ids on the page (found ${dup.join(", ")})`);
    await shot("match-crossed-disconnected-desktop.png", { fullPage: true });
  });

  await test("connect the keeper (no trading tokens): review shows the estimate and gas, no wallet request yet; keyboard opens it", async () => {
    await seedSmall();
    await openTrade();
    await reviewButton().waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="match-review-button"]')?.disabled, null, { timeout: 15000 });
    assert((await page.getByRole("button", { name: "Review match" }).count()) === 1, "the accessible name equals the visible text");
    const sentBefore = await sentCount();
    await reviewButton().focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("match-confirm").waitFor({ timeout: 15000 });
    await page.getByText(/about 1 fill/).waitFor({ timeout: 15000 });
    const t = await text(page.getByTestId("match-confirm"));
    assert(/matchOrders\(10\)/.test(t) && /Settles at Most\s*10 fills/.test(t), "it states the call and the limit");
    assert(/Simulated now \(an estimate\)/.test(t) && /only an estimate/.test(t), "the simulation is labelled an estimate");
    assert(/Gas Estimate\s*\d+/.test(t), "a gas estimate is shown when the node gives one");
    assert(/No token approval is needed/.test(t), "it says no approval is needed");
    assert((await sentCount()) === sentBefore, "opening the review sent nothing to the wallet");
    await shot("match-review-desktop.png", { fullPage: true });
    await page.getByTestId("match-confirm").getByRole("button", { name: "Not now" }).click();
    await page.getByTestId("match-crossed").waitFor();
    assert((await sentCount()) === sentBefore, "Not now sent nothing");
  });

  await test("MATCH from the keeper: one wallet request (matchOrders(10), no approval), then the result from the receipt; exact on-chain movements", async () => {
    await seedSmall();
    const before = await snapshotBalances();
    const keeperEth = await chain.getBalance({ address: KEEPER });
    await openTrade();
    await openReview();
    await mock((ms) => window.__mock.setDelay("tx", ms), 2500);
    const sentBefore = await sentCount();
    await page.getByTestId("match-confirm-button").click();
    await page.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    assert((await page.getByTestId("match-result").count()) === 0, "no success is claimed while the wallet is still asked");
    await shot("match-wallet-pending-desktop.png", { fullPage: true });
    await page.getByTestId("match-result").waitFor({ timeout: 40000 });
    await mock(() => window.__mock.setDelay("tx", 0));
    assert((await sentCount()) === sentBefore + 1, "exactly one wallet request (no approval)");
    const sent = await lastSent();
    assert(sent.to.toLowerCase() === MARKET.toLowerCase() && sent.from.toLowerCase() === KEEPER.toLowerCase(), "from the keeper, to the order book");
    const tx = await rpc("eth_getTransactionByHash", [sent.hash]);
    assert(tx.input === MATCH_INPUT, "the calldata is matchOrders(10)");
    const result = page.getByTestId("match-result");
    assert(/Matched: 1 fill settled/.test(await text(page.getByTestId("match-headline"))), `the headline reports the fill (got ${await text(page.getByTestId("match-headline"))})`);
    assert((await text(page.getByTestId("match-count"))) === "1", "one fill");
    assert(!/checks disagree/.test(await text(result)), "no reconciliation problems");
    assert(/No/.test(await text(page.getByTestId("match-still-crossed"))), "not crossed afterwards");
    assert((await result.locator(`a[title="${sent.hash}"]`).count()) === 1, "the result links the transaction that mined");
    const after = await snapshotBalances();
    assert(diff(before, after, KEEPER).ntu === 0n && diff(before, after, KEEPER).sgd === 0n, "on-chain: the keeper's trading balances did not change");
    assert((await chain.getBalance({ address: KEEPER })) < keeperEth, "on-chain: the keeper paid gas");
    assert(diff(before, after, ALICE).sgd === dec("2") && diff(before, after, BOB).ntu === dec("1"), "on-chain: Alice was paid 2 SGDx and Bob received 1 NTU");
    assert(!(await isCrossed()), "on-chain: the book is no longer crossed");
    await shot("match-result-desktop.png", { fullPage: true });
    await closeResult();
    await page.getByTestId("match-panel").waitFor({ state: "detached", timeout: 20000 });
  });

  await test("the engine's multi-party scenario: ONE transaction settles four traders, and the table lists the real Trade events", async () => {
    const { asks, bobBid, deployerBid } = await seedMultiParty();
    const before = await snapshotBalances();
    await openTrade();
    await openReview();
    await page.getByText(/about 2 fills/).waitFor({ timeout: 15000 });
    await confirmAndWaitForResult();
    assert(/Matched: 2 fills settled/.test(await text(page.getByTestId("match-headline"))), "two fills settled");
    const rows = await page.getByTestId("match-fills").locator("tbody tr").count();
    assert(rows === 2, `the table lists both fills (got ${rows})`);
    const table = await text(page.getByTestId("match-fills"));
    assert(table.includes(`#${asks[20]}`) && table.includes(`#${bobBid}`) && table.includes(`#${asks[21]}`) && table.includes(`#${deployerBid}`), "the table names the maker and taker orders");
    const after = await snapshotBalances();
    assert(diff(before, after, ALICE).sgd === dec("2") && diff(before, after, CAROL).sgd === dec("2"), "on-chain: both sellers were paid 2 SGDx");
    assert(diff(before, after, BOB).ntu === dec("1") && diff(before, after, BOB).sgd === dec("1"), "on-chain: Bob got 1 NTU and 1 SGDx back");
    assert(diff(before, after, DEPLOYER).ntu === dec("1") && diff(before, after, DEPLOYER).sgd === dec("0.5"), "on-chain: the deployer got 1 NTU and 0.5 SGDx back");
    assert(diff(before, after, KEEPER).ntu === 0n && diff(before, after, KEEPER).sgd === 0n, "on-chain: the keeper's trading balances did not change");
    assert(after[MARKET].ntu === 0n && after[MARKET].sgd === 0n, "on-chain: nothing is left in escrow");
    for (const id of [asks[20], asks[21], bobBid, deployerBid]) assert((await getOrder(id)).status === 2, `on-chain: order #${id} is Filled`);
    await shot("match-multiparty-result-desktop.png", { fullPage: true });
    await closeResult();
  });

  await test("REPEATED matching is deliberate: 10 fills, the book is still crossed, nothing is sent until the user clicks again, then 2 fills", async () => {
    for (let i = 0; i < 22; i++) await sell(i % 2 === 0 ? ALICE : CAROL, "2", "1");
    const bid = await place(BOB, 0, "2", "22", "44"); // matches 10, rests 12 still crossing 12 asks
    await openTrade();
    await openReview();
    const sentBefore = await sentCount();
    await confirmAndWaitForResult();
    assert(/10 fills settled/.test(await text(page.getByTestId("match-headline"))), "the first call settled the engine's maximum of 10");
    assert(/Yes: another match is needed/.test(await text(page.getByTestId("match-still-crossed"))), "it says the book is still crossed");
    assert((await sentCount()) === sentBefore + 1, "one request so far");
    await page.waitForTimeout(4000);
    assert((await sentCount()) === sentBefore + 1, "nothing was sent by itself afterwards (no loop, no keeper)");
    assert((await getOrder(bid)).filled === dec("20") && (await isCrossed()), "on-chain: 20 of 22 filled, still crossed");
    await shot("match-still-crossed-desktop.png", { fullPage: true });
    await page.getByTestId("match-again-button").click();
    await page.getByTestId("match-confirm").waitFor({ timeout: 15000 });
    assert((await sentCount()) === sentBefore + 1, "Review another match sent nothing yet");
    await confirmAndWaitForResult();
    assert(/2 fills settled/.test(await text(page.getByTestId("match-headline"))), "the second call settled the last 2");
    assert(/No/.test(await text(page.getByTestId("match-still-crossed"))), "no longer crossed");
    assert((await getOrder(bid)).status === 2 && (await sentCount()) === sentBefore + 2, "on-chain: Filled after exactly two deliberate requests");
    await closeResult();
  });

  await test("a rejection in the wallet is reported as a rejection: nothing sent, still crossed, Try again recovers", async () => {
    await seedSmall();
    await openTrade();
    await openReview();
    await mock(() => window.__mock.rejectNext());
    const sentBefore = await sentCount();
    await page.getByTestId("match-confirm-button").click();
    await page.getByText("You rejected the match request").waitFor({ timeout: 15000 });
    assert((await sentCount()) === sentBefore, "nothing was sent");
    assert((await page.getByTestId("match-result").count()) === 0, "no success is claimed");
    assert(await isCrossed(), "on-chain: the book is still crossed");
    await page.getByTestId("match-panel").getByRole("button", { name: "Try again" }).click();
    await page.getByTestId("match-crossed").waitFor({ timeout: 15000 });
    await openReview();
    await confirmAndWaitForResult();
    assert(!(await isCrossed()), "after Try again the matching succeeds");
    await closeResult();
  });

  await test("a book settled by someone else while the review is open: the panel disappears and the wallet is never asked", async () => {
    await seedSmall();
    await openTrade();
    await openReview();
    const sentBefore = await sentCount();
    await send(CAROL, MARKET, orderBookAbi, "matchOrders", [10n]); // another tab, or the CLI
    await page.getByTestId("match-panel").waitFor({ state: "detached", timeout: 30000 });
    assert((await sentCount()) === sentBefore, "the wallet was never asked");
    assert(!(await isCrossed()), "on-chain: settled");
  });

  await test("an account switch while the wallet request is open: dropped, flagged, nothing attributed", async () => {
    await seedSmall();
    await openTrade();
    await openReview();
    await mock((ms) => window.__mock.setDelay("tx", ms), 3000);
    const sentBefore = await sentCount();
    await page.getByTestId("match-confirm-button").click();
    await page.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    await mock(() => window.__mock.setAccount(1)); // Alice
    await page.getByText("Your account or network changed").waitFor({ timeout: 10000 });
    await page.waitForTimeout(4000);
    assert((await page.getByTestId("match-result").count()) === 0, "no result is attributed to the new account");
    assert(await isCrossed(), "on-chain: nothing was matched");
    assert((await sentCount()) === sentBefore, "the wallet sent nothing for the new account");
    await mock(() => { window.__mock.setDelay("tx", 0); window.__mock.setAccount(0); });
    await page.getByRole("button", { name: "Dismiss" }).first().click();
  });

  await test("a speed-up that stays pending is followed to its new hash and confirmed once", async () => {
    await seedSmall();
    await openTrade();
    await openReview();
    const before = await snapshotBalances();
    await rpc("evm_setAutomine", [false]);
    try {
      const sentBefore = await sentCount();
      await page.getByTestId("match-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount()) === sentBefore; i++) await page.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent()).hash]);
      assert(original && original.blockNumber === null, "the wallet's transaction is pending (auto-mining is off)");
      const replacement = await rpc("eth_sendTransaction", [
        { from: original.from, to: original.to, data: original.input, value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) },
      ]);
      await page.waitForTimeout(1500);
      assert((await page.getByTestId("match-result").count()) === 0, "no result while only a pending speed-up exists");
      await rpc("evm_mine");
      await page.getByTestId("match-result").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("match-result").locator(`a[title="${replacement}"]`).count()) === 1, "the result links the transaction that actually mined");
      assert((await page.getByTestId("match-result").locator(`a[title="${original.hash}"]`).count()) === 0, "the dropped original hash is not presented as the result");
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    const after = await snapshotBalances();
    assert(diff(before, after, ALICE).sgd === dec("2"), "on-chain: settled exactly once");
    await closeResult();
  });

  await test("a match request that the wallet itself cancels is reported as cancelled, and the book is still crossed", async () => {
    await seedSmall();
    await openTrade();
    await openReview();
    await rpc("evm_setAutomine", [false]);
    try {
      const sentBefore = await sentCount();
      await page.getByTestId("match-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount()) === sentBefore; i++) await page.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent()).hash]);
      const cancelTx = await rpc("eth_sendTransaction", [
        { from: original.from, to: original.from, data: "0x", value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) },
      ]);
      await page.waitForTimeout(1500);
      await rpc("evm_mine");
      await page.getByText("The match request was itself cancelled").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("match-result").count()) === 0, "no success card");
      assert(await isCrossed(), "on-chain: the book is still crossed");
      assert((await page.locator(`a[title="${cancelTx}"]`).count()) >= 1, "the failure links the cancelling transaction");
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
  });

  await test("an RPC outage: the terminal is replaced by 'Node unreachable' (no Match control); after verified recovery the action returns and works", async () => {
    await seedSmall();
    await openTrade();
    await reviewButton().waitFor({ timeout: 30000 });
    blocked = true;
    try {
      await page.getByTestId("rpc-offline").waitFor({ timeout: 40000 });
      assert((await panelCount()) === 0 && (await page.getByRole("button", { name: /Review match|Confirm match/ }).count()) === 0, "no Match control while the node is unreachable");
      assert((await page.getByText("Node unreachable").count()) >= 1, "the page says the node is unreachable instead of presenting the book as current");
      await shot("match-outage-desktop.png", { fullPage: true });
    } finally {
      blocked = false;
    }
    await page.getByTestId("rpc-offline").waitFor({ state: "detached", timeout: 60000 });
    await page.getByTestId("rpc-verifying").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
    await openReview();
    await confirmAndWaitForResult();
    assert(!(await isCrossed()), "matching works after recovery");
    await closeResult();
  });

  await test("a chain reset while the review is open: the notice appears, the crossed book is gone and nothing can be sent", async () => {
    const s = await rpc("evm_snapshot");
    await seedSmall(); // exists only on the chain that is about to be replaced
    await openTrade();
    await openReview();
    await rpc("evm_revert", [s]); // the chain the page was reading is gone
    await page.getByTestId("chain-reset-notice").waitFor({ timeout: 25000 });
    await page.getByTestId("match-panel").waitFor({ state: "detached", timeout: 25000 });
    assert((await page.getByTestId("match-confirm-button").count()) === 0, "no Confirm button for a book the chain no longer has");
    await page.getByTestId("chain-reset-notice").getByRole("button", { name: "Dismiss" }).click();
  });

  await test("mobile (375 px): the panel, the review and the result fit without horizontal overflow", async () => {
    await seedMultiParty();
    await openTrade();
    await page.setViewportSize({ width: 375, height: 800 });
    await reviewButton().scrollIntoViewIfNeeded();
    const o1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(o1 <= 0, `no horizontal overflow with the notice (overflow ${o1})`);
    await openReview();
    const box = await page.getByTestId("match-confirm-button").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 375 && box.height >= 36, "the Confirm button is fully on screen and at least 36 px tall");
    assert((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal overflow in the review");
    await shot("match-review-mobile.jpg", { fullPage: true });
    await confirmAndWaitForResult();
    assert((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal overflow in the result with its table");
    await shot("match-result-mobile.jpg", { fullPage: true });
    await closeResult();
    await page.setViewportSize({ width: 1586, height: 1100 });
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
  writeFileSync(join(SHOTS, "results-match.json"), JSON.stringify({ results, consoleErrors }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (mock wallet, scratch chain)`);
  process.exit(failed ? 1 : 0);
}
