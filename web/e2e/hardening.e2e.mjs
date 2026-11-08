// Browser test of the P2-7 transaction-lifecycle hardening against a SCRATCH Anvil, with a MOCK wallet (see mock-wallet.mjs).
// This is NOT a MetaMask test. "Speed up", "Cancel" and "replace" are performed by sending a same-nonce transaction from the
// unlocked dev account straight to Anvil while auto-mining is off, which is what a wallet does on the network, but the wallet
// UI itself is not exercised.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:hardening
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, encodeFunctionData, http, parseGwei, toHex } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, orderBookAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-7-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const MARKET = D.market;
const NTU = D.baseToken.address;
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const rpc = async (method, params = []) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
const orderIds = (who) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] });
const allowance = (owner, spender) => chain.readContract({ address: NTU, abi: demoTokenAbi, functionName: "allowance", args: [owner, spender] });
const assert = (cond, message) => {
  if (!cond) throw new Error(`assertion failed: ${message}`);
};

const results = [];
const consoleErrors = [];
let snapshotId;
let browser;
let context;
let page;
const shot = (name, opts = {}) => page.screenshot({ path: join(SHOTS, name.replace(/\.png$/, ".jpg")), type: "jpeg", quality: 66, ...opts });
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
  }
}

const ticket = () => page.locator("#order");
const mock = (fn, arg) => page.evaluate(fn, arg);
const text = async (locator) => (await locator.textContent())?.replace(/\s+/g, " ").trim() ?? "";

/** Fills the ticket and gets as far as the "Place sell order" button (approving first when asked, with auto-mining ON). */
async function readyToPlaceSell({ price, amount }) {
  const t = ticket();
  await t.getByRole("radio", { name: /Sell NTU/ }).click();
  await t.locator("#order-price").fill(price);
  await t.getByLabel("Amount", { exact: true }).fill(amount);
  await t.getByRole("button", { name: "Review order" }).click();
  const next = t.getByRole("button", { name: /^(Approve |Place (buy|sell) order)/ });
  await next.first().waitFor({ timeout: 15000 });
  if (/^Approve /.test(await text(next.first()))) {
    await next.first().click();
    await t.getByRole("button", { name: /^Place (buy|sell) order/ }).waitFor({ timeout: 30000 });
  }
}
const submit = () => ticket().getByRole("button", { name: /^Place (buy|sell) order/ }).click();

/** Clicks submit and returns the transaction the wallet then sent, as the node holds it while auto-mining is off. */
async function submitAndGetPending() {
  const sentBefore = await mock(() => window.__mock.sentCount());
  await submit();
  for (let i = 0; i < 100; i++) {
    if ((await mock(() => window.__mock.sentCount())) > sentBefore) break;
    await page.waitForTimeout(100);
  }
  const sent = await mock(() => window.__mock.lastSent());
  const tx = await rpc("eth_getTransactionByHash", [sent.hash]);
  assert(tx && tx.blockNumber === null, "the wallet's transaction is pending on the node (auto-mining is off)");
  return tx;
}
/** Replaces a pending transaction: same sender and nonce, higher fee, the given target and calldata. */
const replaceTx = (tx, { to, input, value = "0x0" }) =>
  rpc("eth_sendTransaction", [{ from: tx.from, to, data: input, value, nonce: tx.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) }]);

async function main() {
  snapshotId = await chain.request({ method: "evm_snapshot" });
  assert((await orderIds(ALICE)).length === 0, "the scratch chain already has orders for Alice; restart the scratch Anvil and redeploy first");

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1000 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB, CAROL] }) });
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("connect Alice on the trade page", async () => {
    await page.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Connect wallet/ }).first().click();
    await page.getByRole("button", { name: /Browser Wallet/ }).click();
    await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
  });

  await test("a sped-up order that stays pending is followed to its new hash and confirmed, once", async () => {
    await readyToPlaceSell({ price: "2", amount: "10" });
    await rpc("evm_setAutomine", [false]);
    try {
      const original = await submitAndGetPending();
      const replacement = await replaceTx(original, { to: original.to, input: original.input });
      await page.waitForTimeout(1500); // the speed-up is pending; the original is gone from the pool
      await shot("order-speedup-pending-desktop.png", { fullPage: true });
      assert((await page.getByTestId("order-result").count()) === 0, "no result while only a pending speed-up exists");
      await rpc("evm_mine");
      await page.getByTestId("order-result").waitFor({ timeout: 30000 });
      assert((await text(page.getByTestId("order-status"))) === "Resting", "the confirmed order rests");
      assert((await page.getByTestId("order-result").locator(`a[title="${replacement}"]`).count()) === 1, "the result links the transaction that actually mined");
      assert((await page.getByTestId("order-result").locator(`a[title="${original.hash}"]`).count()) === 0, "the dropped original hash is not presented as the result");
      assert((await orderIds(ALICE)).length === 1, "exactly one order exists on-chain");
      await shot("order-speedup-confirmed-desktop.png", { fullPage: true });
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    await ticket().getByRole("button", { name: "Place another order" }).click();
  });

  await test("a cancelled order is reported as cancelled (never as placed), and nothing was placed", async () => {
    await readyToPlaceSell({ price: "3", amount: "1" });
    const before = (await orderIds(ALICE)).length;
    await rpc("evm_setAutomine", [false]);
    try {
      const original = await submitAndGetPending();
      const cancel = await replaceTx(original, { to: original.from, input: "0x" });
      await page.waitForTimeout(1500);
      await rpc("evm_mine");
      await page.getByText("The transaction was cancelled").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("order-result").count()) === 0, "no result card for a cancelled order");
      assert((await orderIds(ALICE)).length === before, "no order was placed");
      assert((await page.locator(`a[title="${cancel}"]`).count()) >= 1, "the failure links the cancelling transaction");
      await shot("order-cancelled-desktop.png", { fullPage: true });
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    await ticket().getByRole("button", { name: "Try again" }).first().click();
  });

  await test("an order replaced by a different action is reported as replaced, and the real outcome is on-chain", async () => {
    const place = ticket().getByRole("button", { name: /^Place (buy|sell) order/ });
    if (!(await place.isVisible())) await readyToPlaceSell({ price: "3", amount: "1" });
    const before = (await orderIds(ALICE)).length;
    await rpc("evm_setAutomine", [false]);
    try {
      const original = await submitAndGetPending();
      const other = encodeFunctionData({ abi: demoTokenAbi, functionName: "approve", args: [BOB, 7n] });
      await replaceTx(original, { to: NTU, input: other });
      await page.waitForTimeout(1500);
      await rpc("evm_mine");
      await page.getByText("The transaction was replaced").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("order-result").count()) === 0, "no result card for a replaced order");
      assert((await orderIds(ALICE)).length === before, "the original request placed nothing");
      assert((await allowance(ALICE, BOB)) === 7n, "what the replacement did is what is on-chain");
      await shot("order-replaced-desktop.png", { fullPage: true });
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
  });

  await test("a local chain reset is detected from block identity: a notice with the evidence, everything re-read, no success claim", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 }).catch(async () => {
      await page.getByRole("button", { name: /Connect wallet/ }).first().click();
      await page.getByRole("button", { name: /Browser Wallet/ }).click();
      await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
    });
    const before = await rpc("evm_snapshot");
    await rpc("evm_mine");
    await rpc("evm_mine");
    await page.waitForTimeout(8000); // the watcher advances its anchor to the new head
    assert((await page.getByTestId("chain-reset-notice").count()) === 0, "no reset is claimed while the chain is intact");
    await rpc("evm_revert", [before]); // the blocks the page last saw are gone
    await page.getByTestId("chain-reset-notice").waitFor({ timeout: 15000 });
    const t = await text(page.getByTestId("chain-reset-notice"));
    assert(/below block|different hash|genesis/i.test(t), `the notice states its evidence (got: ${t})`);
    assert(!/success|confirmed/i.test(t.replace(/cannot be confirmed/i, "")), "the notice claims no success");
    const head = BigInt(await rpc("eth_blockNumber"));
    await page.getByText(`block ${head}`, { exact: false }).first().waitFor({ timeout: 15000 });
    await shot("chain-reset-notice-desktop.png", { fullPage: true });
    await page.getByTestId("chain-reset-notice").getByRole("button", { name: "Dismiss" }).click();
    assert((await page.getByTestId("chain-reset-notice").count()) === 0, "the notice can be dismissed");
  });

  await test("an intact chain that merely mines new blocks never shows the reset notice (no false positive)", async () => {
    for (let i = 0; i < 3; i++) {
      await rpc("evm_mine");
      await page.waitForTimeout(3500);
    }
    assert((await page.getByTestId("chain-reset-notice").count()) === 0, "no notice on a healthy chain");
  });

  await test("header with a connected wallet fits at 375, 390, 768 and 1586 px: no overflow, a 40 px menu button, the whole address visible", async () => {
    for (const width of [375, 390, 768, 1586]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const wallet = document.querySelector('header button[aria-label$="open account menu"]').getBoundingClientRect();
        const menu = document.querySelector('header button[aria-label="Open navigation"]')?.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: wallet.right, menuWidth: menu?.width ?? 0 };
      });
      assert(m.overflow <= 0, `no horizontal overflow at ${width}px (got ${m.overflow}px)`);
      assert(m.right <= width, `the wallet control is fully inside the viewport at ${width}px`);
      if (width < 768) assert(m.menuWidth >= 40, `the menu button keeps its 40 px touch target at ${width}px (got ${m.menuWidth})`);
    }
    await page.setViewportSize({ width: 1586, height: 1000 });
  });

  await test("mobile layout: the reset notice fits and nothing overflows horizontally", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const baseline = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(baseline <= 0, `the header has no overflow before any notice (got ${baseline}px)`);
    const before = await rpc("evm_snapshot");
    await rpc("evm_mine");
    await rpc("evm_mine");
    await page.waitForTimeout(8000);
    await rpc("evm_revert", [before]);
    await page.getByTestId("chain-reset-notice").waitFor({ timeout: 15000 });
    await shot("chain-reset-notice-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 2).join(".")}`),
    );
    const box = await page.getByTestId("chain-reset-notice").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390 + 0.5, "the notice itself fits inside the viewport");
    assert(overflow <= baseline, `the notice adds no horizontal overflow (page ${overflow}px vs ${baseline}px before it; wide elements: ${wide.join(", ")})`);
    await page.setViewportSize({ width: 1586, height: 1000 });
  });

  await test("no unexpected console errors", async () => {
    const real = consoleErrors.filter((e) => !/WalletConnect|projectId|Failed to fetch|net::ERR/i.test(e));
    assert(real.length === 0, `console errors: ${real.slice(0, 3).join(" | ")}`);
  });
}

try {
  await main();
} finally {
  try {
    await rpc("evm_setAutomine", [true]);
    if (snapshotId) await chain.request({ method: "evm_revert", params: [snapshotId] });
  } catch {}
  await browser?.close();
  const failed = results.filter((r) => r.status === "fail");
  writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ wallet: "MOCK (not MetaMask)", rpc: RPC, base: BASE, passed: results.length - failed.length, failed: failed.length, results, consoleErrors }, null, 2));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (mock wallet, scratch chain)`);
  process.exitCode = failed.length ? 1 : 0;
}
