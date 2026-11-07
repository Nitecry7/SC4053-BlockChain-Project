// Browser test of order cancellation (P2-8B.2) against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. The wallet is an injected stand-in that forwards to Anvil's unlocked dev accounts. What it
// does prove: the UI offers Cancel only on eligible orders, states the refund first, asks the wallet for exactly one
// cancelOrder transaction (no approval), reports success only from the confirmed receipt, and handles rejection, a
// stale order, an account switch, speed-up, a wallet-cancelled request, an RPC outage and a chain reset.
//
// Orders are SET UP directly through the contracts (viem, unlocked dev accounts) so each case starts from a known book;
// placing orders through the ticket is covered by trade.e2e.mjs.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:cancel
// The scratch chain must be freshly deployed: the suite checks that no test account has an allowance or an order.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, createWalletClient, http, parseGwei, toHex } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, orderBookAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-8b2-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const MARKET = D.market;
const NTU = D.baseToken.address;
const SGDX = D.quoteToken.address;
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
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
const getBook = (side) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBook", args: [side, 50n] });
const walletFor = (account) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
async function send(account, address, abi, functionName, args) {
  const { request } = await chain.simulateContract({ account, address, abi, functionName, args });
  const hash = await walletFor(account).writeContract(request);
  const rc = await chain.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${functionName} reverted during test setup`);
  return hash;
}
const approve = (who, token, amount) => send(who, token, demoTokenAbi, "approve", [MARKET, amount]);
async function placeSell(who, price, amount) {
  await approve(who, NTU, dec(amount));
  await send(who, MARKET, orderBookAbi, "placeLimitOrder", [1, dec(price), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}
async function placeBuy(who, price, amount, escrow) {
  await approve(who, SGDX, dec(escrow));
  await send(who, MARKET, orderBookAbi, "placeLimitOrder", [0, dec(price), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}
async function placeSellStop(who, trigger, limit, amount) {
  await approve(who, NTU, dec(amount));
  await send(who, MARKET, orderBookAbi, "placeStopLimitOrder", [1, dec(trigger), dec(limit), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}

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
  }
}
const mock = (fn, arg) => page.evaluate(fn, arg);
// Visible text only: the visually hidden exact values (`.sr-only`) are left out, so assertions check what is drawn.
const text = async (locator) =>
  (await locator.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }))?.replace(/\s+/g, " ").trim() ?? "";
const cancelButton = (id) => page.getByTestId(`cancel-order-${id}`);
const row = (id) => page.locator(`[data-order-id="${id}"]`);
const rowStatus = async (id) => text(row(id).getByTestId("order-row-status"));
const sentCount = () => mock(() => window.__mock.sentCount());
const lastSent = () => mock(() => window.__mock.lastSent());

async function openConfirm(id) {
  await cancelButton(id).click();
  await page.getByTestId("cancel-confirm").waitFor({ timeout: 15000 });
}
async function confirmAndWaitForResult(id) {
  await page.getByTestId("cancel-confirm-button").click();
  await page.getByTestId("cancel-result").waitFor({ timeout: 40000 });
  assert(new RegExp(`Order #${id} cancelled`).test(await text(page.getByTestId("cancel-result"))), "the result names the order");
}
const closeResult = async () => page.getByTestId("cancel-result").getByRole("button", { name: "Close" }).click();

async function main() {
  snapshotId = await rpc("evm_snapshot");
  // Initial state is verified, not assumed (P2-8B.1: a leftover allowance on a reused scratch chain broke a suite).
  const dirty = [];
  for (const [name, who] of [["Alice", ALICE], ["Bob", BOB], ["Carol", CAROL]]) {
    if ((await allowanceOf(NTU, who)) !== 0n) dirty.push(`${name} NTU allowance`);
    if ((await allowanceOf(SGDX, who)) !== 0n) dirty.push(`${name} SGDx allowance`);
    if ((await orderIds(who)).length !== 0) dirty.push(`${name} orders`);
  }
  assert(dirty.length === 0, `the scratch chain is not freshly deployed (leftover: ${dirty.join(", ")}); restart the scratch Anvil and redeploy first`);

  // ---- the book every case starts from ----
  const ids = {};
  ids.filled = await placeSell(ALICE, "3", "10"); //                     A: sells 10 @ 3 ...
  await placeBuy(BOB, "3", "10", "30"); //                                ... Bob buys all of it: Filled
  ids.partial = await placeSell(ALICE, "2", "100"); //                    B: sell 100 @ 2, then Bob buys 40 -> Partly filled
  await placeBuy(BOB, "2", "40", "80");
  ids.buy = await placeBuy(ALICE, "1.5", "5", "7.5"); //                  C: open buy 5 @ 1.5 (7.5 SGDx locked)
  ids.stop = await placeSellStop(ALICE, "1.8", "1.7", "10"); //           D: pending sell stop
  ids.reject = await placeSell(ALICE, "4", "20"); //                      E: wallet rejection, then success
  ids.stale = await placeSell(ALICE, "5", "5"); //                        F: cancelled elsewhere while the confirmation is open
  ids.switch = await placeSell(ALICE, "6", "3"); //                       G: account switch during the wallet request
  ids.speedup = await placeSell(ALICE, "7", "2"); //                      H: speed-up
  ids.walletCancel = await placeSell(ALICE, "8", "2"); //                 I: the wallet cancels the cancel request
  ids.outage = await placeSell(ALICE, "9", "2"); //                       J: cancelled after an RPC outage
  ids.mobile = await placeSell(ALICE, "10", "1"); //                      K: left open for the 375 px check
  assert((await getOrder(ids.filled)).status === 2 && (await getOrder(ids.partial)).status === 1 && (await getOrder(ids.stop)).status === 4, "the seeded book has the expected statuses");

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1100 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB, CAROL] }) });
  const rpcOrigin = new URL(RPC).origin;
  await context.route(`${rpcOrigin}/**`, (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("connect Alice: My orders lists her orders and offers Cancel only on open, partly filled and pending ones", async () => {
    await page.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
    assert((await page.getByRole("button", { name: /^Cancel order #/ }).count()) === 0, "no Cancel control while disconnected");
    await page.getByRole("button", { name: /Connect wallet/ }).first().click();
    await page.getByRole("button", { name: /Browser Wallet/ }).click();
    await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
    await row(ids.partial).waitFor({ timeout: 30000 });
    for (const [label, id] of Object.entries({ partial: ids.partial, buy: ids.buy, stop: ids.stop, reject: ids.reject })) {
      assert((await cancelButton(id).count()) === 1, `${label} order #${id} has a Cancel button`);
    }
    assert((await cancelButton(ids.filled).count()) === 0, "a filled order has no Cancel button");
    assert((await rowStatus(ids.filled)) === "Filled", "the filled order is listed as Filled (history)");
    assert((await rowStatus(ids.stop)) === "Pending trigger", "the stop order is labelled Pending trigger");
    const name = await cancelButton(ids.partial).getAttribute("aria-label");
    assert(/^Cancel order #\d+$/.test(name ?? "") && (await text(cancelButton(ids.partial))) === "Cancel", "the accessible name contains the visible text");
    await shot("cancel-my-orders-desktop.png", { fullPage: true });
  });

  await test("cancel a PARTLY FILLED sell: refund stated first (60 NTU), one wallet request, no approval, exact result from the receipt", async () => {
    const id = ids.partial;
    const before = { ntu: await bal(NTU, ALICE), market: await bal(NTU, MARKET) };
    await openConfirm(id);
    const confirm = page.getByTestId("cancel-confirm");
    assert(/\b60(\.0+)?\b/.test(await text(page.getByTestId("cancel-expected"))), `the expected refund is 60 NTU (got ${await text(page.getByTestId("cancel-expected"))})`);
    assert(/No token approval is needed/.test(await text(confirm)), "the panel says no approval is needed");
    await shot("cancel-confirm-desktop.png", { fullPage: true });
    await mock((ms) => window.__mock.setDelay("tx", ms), 2500);
    const sentBefore = await sentCount();
    await page.getByTestId("cancel-confirm-button").click();
    await page.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    assert((await page.getByTestId("cancel-result").count()) === 0, "no success is claimed while the wallet is still asked");
    await shot("cancel-wallet-pending-desktop.png", { fullPage: true });
    await page.getByTestId("cancel-result").waitFor({ timeout: 40000 });
    await mock(() => window.__mock.setDelay("tx", 0));
    assert((await sentCount()) === sentBefore + 1, "exactly one wallet request (no approval)");
    const sent = await lastSent();
    assert(sent.to.toLowerCase() === MARKET.toLowerCase(), "the transaction went to the order book");
    const result = page.getByTestId("cancel-result");
    assert((await text(page.getByTestId("cancel-status"))) === "Cancelled", "the result reads Cancelled");
    assert(/\b60(\.0+)?\b/.test(await text(page.getByTestId("cancel-refund"))), "the refund from the OrderCancelled event is 60 NTU");
    assert(!/checks disagree/.test(await text(result)), "no reconciliation problems");
    assert((await result.locator(`a[title="${sent.hash}"]`).count()) === 1, "the result links the transaction that mined");
    assert((await getOrder(id)).status === 3, "on-chain: the order is Cancelled");
    assert((await bal(NTU, ALICE)) - before.ntu === dec("60"), "on-chain: Alice's NTU rose by exactly 60");
    assert(before.market - (await bal(NTU, MARKET)) === dec("60"), "on-chain: the market's escrow fell by exactly 60");
    assert((await getBook(1)).every((o) => o.id !== id), "on-chain: it is no longer book liquidity");
    await page.waitForFunction((id) => document.querySelector(`[data-order-id="${id}"] [data-testid="order-row-status"]`)?.textContent?.trim() === "Cancelled", id, { timeout: 20000 });
    assert((await cancelButton(id).count()) === 0, "a cancelled order has no Cancel button");
    assert((await row(id).count()) === 1, "but it stays in My orders as history");
    await shot("cancel-result-desktop.png", { fullPage: true });
    await closeResult();
  });

  await test("cancel an OPEN BUY: the refund is the locked quote (7.5 SGDx), not base tokens", async () => {
    const id = ids.buy;
    const before = await bal(SGDX, ALICE);
    await openConfirm(id);
    const exp = await text(page.getByTestId("cancel-expected"));
    assert(/7\.5/.test(exp) && /SGDx/.test(exp), `the expected refund is 7.5 SGDx (got ${exp})`);
    await confirmAndWaitForResult(id);
    const refund = await text(page.getByTestId("cancel-refund"));
    assert(/7\.5/.test(refund) && /SGDx/.test(refund), `the event refund is 7.5 SGDx (got ${refund})`);
    assert((await bal(SGDX, ALICE)) - before === dec("7.5"), "on-chain: Alice's SGDx rose by exactly 7.5");
    const o = await getOrder(id);
    assert(o.status === 3 && o.lockedQuote === 0n, "on-chain: Cancelled with no locked quote");
    await closeResult();
  });

  await test("cancel a PENDING STOP order: said to be untriggered, full escrow refunded, never on the book", async () => {
    const id = ids.stop;
    const before = await bal(NTU, ALICE);
    await openConfirm(id);
    assert(/has not triggered/.test(await text(page.getByTestId("cancel-confirm"))), "the panel explains the order is a stop that has not triggered");
    await confirmAndWaitForResult(id);
    assert((await bal(NTU, ALICE)) - before === dec("10"), "on-chain: the full 10 NTU escrow came back");
    assert((await getOrder(id)).status === 3, "on-chain: Cancelled");
    await closeResult();
    await page.waitForFunction((id) => document.querySelector(`[data-order-id="${id}"] [data-testid="order-row-status"]`)?.textContent?.trim() === "Cancelled", id, { timeout: 20000 });
  });

  await test("a rejection in the wallet is reported as a rejection: nothing sent, the order stays open, Try again recovers", async () => {
    const id = ids.reject;
    await openConfirm(id);
    await mock(() => window.__mock.rejectNext());
    const sentBefore = await sentCount();
    await page.getByTestId("cancel-confirm-button").click();
    await page.getByText("You rejected the cancel request").waitFor({ timeout: 15000 });
    assert((await sentCount()) === sentBefore, "nothing was sent");
    assert((await page.getByTestId("cancel-result").count()) === 0, "no success is claimed");
    assert((await getOrder(id)).status === 0, "on-chain: the order is still open");
    await page.getByTestId("cancel-panel").getByRole("button", { name: "Try again" }).click();
    await page.getByTestId("cancel-confirm").waitFor();
    await confirmAndWaitForResult(id);
    assert((await getOrder(id)).status === 3, "after Try again the cancellation succeeds");
    await closeResult();
  });

  await test("an order cancelled elsewhere while the confirmation is open: the panel says it can no longer be cancelled", async () => {
    const id = ids.stale;
    await openConfirm(id);
    await send(ALICE, MARKET, orderBookAbi, "cancelOrder", [id]); // another tab, or the CLI
    await page.getByText(new RegExp(`Order #${id} is cancelled and can no longer be cancelled`)).waitFor({ timeout: 30000 });
    assert((await page.getByTestId("cancel-confirm-button").count()) === 0, "there is no Confirm button for it any more");
    await page.getByTestId("cancel-confirm").getByRole("button", { name: "Close" }).click();
  });

  await test("an account switch while the wallet request is open: dropped, flagged, nothing attributed; the other account has no Cancel control for it", async () => {
    const id = ids.switch;
    await openConfirm(id);
    await mock((ms) => window.__mock.setDelay("tx", ms), 3000);
    const sentBefore = await sentCount();
    await page.getByTestId("cancel-confirm-button").click();
    await page.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    await mock(() => window.__mock.setAccount(1)); // Bob
    await page.getByText("Your account or network changed").waitFor({ timeout: 10000 });
    await page.waitForTimeout(4000);
    assert((await page.getByTestId("cancel-result").count()) === 0, "no result is attributed to the new account");
    assert((await getOrder(id)).status === 0, "on-chain: Alice's order was not cancelled");
    assert((await sentCount()) === sentBefore, "the wallet sent nothing for the new account");
    await mock(() => window.__mock.setDelay("tx", 0));
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    assert((await page.getByRole("button", { name: /^Cancel order #/ }).count()) === 0, "Bob (whose orders are all filled) sees no Cancel control, and none for Alice's orders");
    await mock(() => window.__mock.setAccount(0));
    await row(ids.walletCancel).waitFor({ timeout: 20000 });
  });

  await test("a speed-up that stays pending is followed to its new hash and confirmed once, with the exact refund", async () => {
    const id = ids.speedup;
    const before = await bal(NTU, ALICE);
    await openConfirm(id);
    await rpc("evm_setAutomine", [false]);
    try {
      const sentBefore = await sentCount();
      await page.getByTestId("cancel-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount()) === sentBefore; i++) await page.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent()).hash]);
      assert(original && original.blockNumber === null, "the wallet's transaction is pending (auto-mining is off)");
      const replacement = await rpc("eth_sendTransaction", [
        { from: original.from, to: original.to, data: original.input, value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) },
      ]);
      await page.waitForTimeout(1500);
      assert((await page.getByTestId("cancel-result").count()) === 0, "no result while only a pending speed-up exists");
      await rpc("evm_mine");
      await page.getByTestId("cancel-result").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("cancel-result").locator(`a[title="${replacement}"]`).count()) === 1, "the result links the transaction that actually mined");
      assert((await page.getByTestId("cancel-result").locator(`a[title="${original.hash}"]`).count()) === 0, "the dropped original hash is not presented as the result");
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    assert((await bal(NTU, ALICE)) - before === dec("2"), "on-chain: refunded exactly once");
    await closeResult();
  });

  await test("a cancel request that the wallet itself cancels is reported as cancelled, and the order is still open", async () => {
    const id = ids.walletCancel;
    await openConfirm(id);
    await rpc("evm_setAutomine", [false]);
    try {
      const sentBefore = await sentCount();
      await page.getByTestId("cancel-confirm-button").click();
      for (let i = 0; i < 100 && (await sentCount()) === sentBefore; i++) await page.waitForTimeout(100);
      const original = await rpc("eth_getTransactionByHash", [(await lastSent()).hash]);
      const cancelTx = await rpc("eth_sendTransaction", [
        { from: original.from, to: original.from, data: "0x", value: "0x0", nonce: original.nonce, maxFeePerGas: toHex(parseGwei("60")), maxPriorityFeePerGas: toHex(parseGwei("20")) },
      ]);
      await page.waitForTimeout(1500);
      await rpc("evm_mine");
      await page.getByText("The cancel request was itself cancelled").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("cancel-result").count()) === 0, "no success card");
      assert((await getOrder(id)).status === 0, "on-chain: the order is still open");
      assert((await page.locator(`a[title="${cancelTx}"]`).count()) >= 1, "the failure links the cancelling transaction");
      await shot("cancel-wallet-cancelled-desktop.png", { fullPage: true });
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    await page.getByTestId("cancel-panel").getByRole("button", { name: "Close" }).click();
    await page.getByTestId("cancel-panel").waitFor({ state: "detached", timeout: 10000 });
  });

  await test("an RPC outage: the terminal is replaced by 'Node unreachable' (no Cancel control), recovery brings Cancel back after verification, then cancelling works", async () => {
    const id = ids.outage;
    assert((await cancelButton(id).count()) === 1, "Cancel is offered while healthy");
    blocked = true;
    try {
      await page.getByTestId("rpc-offline").waitFor({ timeout: 40000 });
      assert((await page.getByRole("button", { name: /^Cancel order #/ }).count()) === 0, "no Cancel control while the node is unreachable");
      assert((await page.getByText("Node unreachable").count()) >= 1, "the trade page says the node is unreachable instead of presenting orders as current");
      await shot("cancel-outage-desktop.png", { fullPage: true });
    } finally {
      blocked = false;
    }
    await page.getByTestId("rpc-offline").waitFor({ state: "detached", timeout: 60000 });
    await page.getByTestId("rpc-verifying").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
    await cancelButton(id).waitFor({ timeout: 30000 });
    assert(!(await cancelButton(id).isDisabled()), "Cancel is enabled again once the chain is verified");
    await openConfirm(id);
    await confirmAndWaitForResult(id);
    assert((await getOrder(id)).status === 3, "cancelling works after recovery");
    await closeResult();
  });

  await test("a chain reset while the confirmation is open: the notice appears, the order is gone from the list and nothing can be sent for it", async () => {
    const s = await rpc("evm_snapshot");
    const late = await placeSell(ALICE, "11", "1"); // exists only on the chain that is about to be replaced
    await row(late).waitFor({ timeout: 30000 });
    await openConfirm(late);
    await rpc("evm_revert", [s]); // the chain the page was reading is gone
    await page.getByTestId("chain-reset-notice").waitFor({ timeout: 25000 });
    await page.getByText(/no longer in your list/).waitFor({ timeout: 25000 });
    assert((await page.getByTestId("cancel-confirm-button").count()) === 0, "no Confirm button for an order the chain no longer has");
    await page.getByTestId("cancel-confirm").getByRole("button", { name: "Close" }).click();
    await page.getByTestId("chain-reset-notice").getByRole("button", { name: "Dismiss" }).click();
  });

  await test("mobile (375 px): the Cancel button and the confirmation fit without horizontal overflow", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    const id = ids.mobile;
    await cancelButton(id).scrollIntoViewIfNeeded();
    await openConfirm(id);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `no horizontal overflow at 375 px (overflow ${overflow})`);
    const box = await page.getByTestId("cancel-confirm-button").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 375 && box.height >= 36, "the Confirm button is fully on screen and at least 36 px tall");
    await shot("cancel-confirm-mobile.jpg", { fullPage: true });
    await page.getByTestId("cancel-confirm").getByRole("button", { name: "Keep order" }).click();
    assert((await getOrder(id)).status === 0, "Keep order sends nothing");
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
  writeFileSync(join(SHOTS, "results-cancel.json"), JSON.stringify({ results, consoleErrors }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (mock wallet, scratch chain)`);
  process.exit(failed ? 1 : 0);
}
