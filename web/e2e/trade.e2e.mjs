// Browser test of the trading UI against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. The wallet is an injected stand-in that forwards to Anvil's unlocked dev accounts.
// What it does prove: the UI drives validation, approval, simulation, signing requests, receipt decoding and
// reconciliation correctly against the deployed contracts, in a real browser.
//
// Run (the scratch chain must be deployed; the app must be a build made with NEXT_PUBLIC_RPC_URL pointing at it):
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e
// Chromium also needs libnss3 and libnspr4 on the system.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, http, parseEventLogs } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, orderBookAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-5-screens");
const QUICK = process.env.E2E_QUICK === "1"; // skips the 20 s wait for the escalated recovery steps

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
const WAIT_TEXT =
  "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request.";

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const bal = (token, who) => chain.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] });
const getOrder = (id) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] });
const orderIds = (who) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] });

const results = [];
const consoleErrors = [];
let snapshotId;

// Evidence screenshots are JPEGs (Chromium encodes them directly; no image tools are needed) to keep the repo small.
const shot = (name, opts = {}) => page.screenshot({ path: join(SHOTS, name.replace(/\.png$/, ".jpg")), type: "jpeg", quality: 68, ...opts });

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

let browser;
let context;
let page;
const ticket = () => page.locator("#order");
const mock = (fn, arg) => page.evaluate(fn, arg);
// Visible text: the visually hidden exact values (`.sr-only`, added in P2-8A.1 for assistive technology) are left out, so these
// assertions still check what is drawn on screen.
const text = async (locator) =>
  (await locator.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }))?.replace(/\s+/g, " ").trim() ?? "";

async function placeOrderThroughUi({ side, price, amount, approveClicks = 1 }) {
  const t = ticket();
  await t.getByRole("radio", { name: side === "buy" ? /Buy NTU/ : /Sell NTU/ }).click();
  await t.getByLabel("Limit price").fill(price);
  await t.getByLabel("Amount", { exact: true }).fill(amount);
  await t.getByRole("button", { name: "Review order" }).click();
  const next = t.getByRole("button", { name: /^(Approve |Place (buy|sell) order)/ });
  await next.first().waitFor({ timeout: 15000 });
  let approvedWith;
  if (/^Approve /.test(await text(next.first()))) {
    approvedWith = await text(next.first());
    if (approveClicks === 2) await next.first().dblclick();
    else await next.first().click();
    await t.getByRole("button", { name: /^Place (buy|sell) order/ }).waitFor({ timeout: 30000 });
  }
  return { approvedWith };
}
const submitOrder = async () => {
  await ticket().getByRole("button", { name: /^Place (buy|sell) order/ }).click();
};
const waitForResult = () => page.getByTestId("order-result").waitFor({ timeout: 30000 });

async function main() {
  snapshotId = await chain.request({ method: "evm_snapshot" });
  const existing = await orderIds(ALICE);
  assert(existing.length === 0, "the scratch chain already has orders for Alice; restart the scratch Anvil and redeploy first");
  // Test isolation (P2-8B.2): the steps below expect to be asked for an approval. A leftover allowance from an earlier
  // run, or from anything else on a reused scratch chain, silently skips that step and cascades into six failures
  // (found in P2-8B.1, docs/ai-audit/test-evidence/person2/p2-8b01-preflight.md). Check it explicitly instead of assuming it.
  const leftovers = [];
  for (const [name, who] of [["Alice", ALICE], ["Bob", BOB], ["Carol", CAROL]]) {
    for (const [symbol, token] of [["NTU", NTU], ["SGDx", SGDX]]) {
      const a = await chain.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [who, MARKET] });
      if (a !== 0n) leftovers.push(`${name} has a leftover ${symbol} allowance of ${a} for the market`);
    }
  }
  assert(leftovers.length === 0, `the scratch chain is not freshly deployed (${leftovers.join("; ")}); restart the scratch Anvil and redeploy first`);

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1000 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB, CAROL] }) });
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("trade page renders, reads the registry market and asks the visitor to connect", async () => {
    await page.goto(`${BASE}/trade`);
    await page.getByRole("heading", { name: "Trade", exact: true }).waitFor({ timeout: 20000 });
    await page.locator("#market-picker").waitFor();
    await page.waitForFunction(() => document.querySelector("#market-picker")?.textContent?.includes("NTU / SGDx"));
    assert((await text(ticket().getByRole("button", { name: /Connect wallet/ }))) === "Connect wallet", "ticket offers Connect wallet");
    assert(!(await page.getByText("Cancel order").count()), "there is no cancel control");
    await shot("trade-disconnected-desktop.png");
  });

  await test("connect: the pending-wallet guidance sits above the RainbowKit dialog, escalates after 20 s, then connects", async () => {
    await mock((ms) => window.__mock.setDelay("connect", ms), QUICK ? 3000 : 23000);
    await page.getByRole("button", { name: /Connect wallet/ }).first().click();
    await page.getByRole("button", { name: /Browser Wallet/ }).click();
    const notice = page.getByTestId("connect-pending");
    await notice.waitFor({ timeout: 10000 });
    assert((await text(notice)).includes(WAIT_TEXT), "the exact guidance text is shown");
    const onTop = await notice.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(top);
    });
    assert(onTop, "the notice is the topmost element, not hidden behind the connect dialog");
    assert(!(await text(notice)).includes("Try again"), "no retry offered in the first seconds");
    await shot("connect-pending-desktop.png");
    if (!QUICK) {
      await page.waitForFunction(() => /Reject it there first/.test(document.querySelector('[data-testid="connect-pending"]')?.textContent ?? ""), null, { timeout: 25000 });
      assert((await text(notice)).includes("Try again"), "the recovery steps and Try again appear after 20 s");
      await shot("connect-pending-escalated-desktop.png");
    }
    await page.getByTestId("connect-pending").waitFor({ state: "detached", timeout: 30000 });
    await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
    await mock(() => window.__mock.setDelay("connect", 0));
  });

  await test("validation: malformed, zero, lot, tick and insufficient-balance inputs show messages and never open the wallet", async () => {
    const t = ticket();
    const sentBefore = await mock(() => window.__mock.sentCount());
    await t.getByRole("radio", { name: /Sell NTU/ }).click();
    await t.getByLabel("Limit price").fill("abc");
    await t.getByLabel("Amount", { exact: true }).fill("1");
    await t.locator("#order-price-error").waitFor();
    assert((await text(t.locator("#order-price-error"))).includes("digits"), "malformed price is explained");
    await t.getByLabel("Limit price").fill("0");
    assert((await text(t.locator("#order-price-error"))).includes("greater than zero"), "zero price is refused");
    await t.getByLabel("Limit price").fill("0.0000000001");
    assert((await text(t.locator("#order-price-error"))).includes("tick"), "non-tick price is refused");
    await t.getByLabel("Limit price").fill("2");
    await t.getByLabel("Amount", { exact: true }).fill("0.0000000001");
    assert((await text(t.locator("#order-amount-error"))).includes("lot"), "non-lot amount is refused");
    await t.getByLabel("Amount", { exact: true }).fill("1000000000");
    await t.getByRole("alert").waitFor();
    assert((await text(t.getByRole("alert"))).includes("wallet balance"), "insufficient balance is explained");
    assert(await t.getByRole("button", { name: "Fix the highlighted fields" }).isDisabled(), "the primary button is disabled");
    assert((await mock(() => window.__mock.sentCount())) === sentBefore, "no transaction was requested");
    await t.getByLabel("Limit price").fill("");
    await t.getByLabel("Amount", { exact: true }).fill("");
  });

  await test("Alice sells 10 NTU @ 2: exact approval to the order book, wallet-waiting guidance, then a resting order", async () => {
    await mock((ms) => window.__mock.setDelay("tx", ms), 2500);
    const aliceNtu = await bal(NTU, ALICE);
    const { approvedWith } = await placeOrderThroughUi({ side: "sell", price: "2", amount: "10" });
    // (the wallet delay applies to the approval request too; the guidance was visible while it waited)
    assert(approvedWith === "Approve 10 NTU", `approval button states the exact collateral (got ${approvedWith})`);
    const approvalTx = await mock(() => window.__mock.lastSent());
    const receipt = await chain.getTransactionReceipt({ hash: approvalTx.hash });
    const [approval] = parseEventLogs({ abi: demoTokenAbi, logs: receipt.logs, eventName: "Approval" });
    assert(approval.args.spender.toLowerCase() === MARKET.toLowerCase(), "the spender is the order book, not a factory");
    assert(approval.args.value === 10n * E18, "the approval is exactly the collateral, not unlimited");
    assert(approval.address.toLowerCase() === NTU.toLowerCase(), "a sell approves the base token");

    await submitOrder();
    await page.getByText(WAIT_TEXT).first().waitFor({ timeout: 10000 });
    assert(await page.locator("#market-picker").isDisabled(), "the market cannot be switched while a wallet request is open");
    await shot("order-wallet-pending-desktop.png", { fullPage: true });
    await waitForResult();
    assert((await text(page.getByTestId("order-status"))) === "Resting", "an uncrossed sell rests on the book");
    assert((await bal(NTU, ALICE)) === aliceNtu - 10n * E18, "10 NTU left Alice's wallet into escrow");
    const o = await getOrder(1n);
    assert(o.status === 0 && o.trader.toLowerCase() === ALICE.toLowerCase(), "order #1 is open on-chain");
    await mock(() => window.__mock.setDelay("tx", 0));
    await shot("order-result-resting-desktop.png", { fullPage: true });
    await page.locator('tr[data-order-id="1"]').waitFor({ timeout: 20000 });
  });

  await test("account switch: Bob sees none of Alice's orders and the ticket is reset", async () => {
    await mock(() => window.__mock.setAccount(1));
    await page.waitForFunction(() => document.querySelector("#order")?.textContent?.includes("Review order") || document.querySelector("#order")?.textContent?.includes("Enter a price"));
    await page.getByText(/No orders yet on NTU/).waitFor({ timeout: 15000 });
    assert((await page.locator('tr[data-order-id="1"]').count()) === 0, "Alice's order is not shown for Bob");
    assert((await page.getByTestId("order-result").count()) === 0, "Alice's result card is gone");
  });

  await test("SPEC example through the UI: Bob buys 4 NTU @ limit 2.2: approval of 8.8 SGDx, trade at 2, refund 0.8, Alice paid 8", async () => {
    const before = { aliceSgdx: await bal(SGDX, ALICE), bobNtu: await bal(NTU, BOB), bobSgdx: await bal(SGDX, BOB), marketNtu: await bal(NTU, MARKET) };
    const { approvedWith } = await placeOrderThroughUi({ side: "buy", price: "2.2", amount: "4" });
    assert(approvedWith === "Approve 8.8 SGDx", `approval is the ceil'd escrow in the quote token (got ${approvedWith})`);
    await submitOrder();
    await waitForResult();
    const result = page.getByTestId("order-result");
    assert((await text(page.getByTestId("order-status"))) === "Filled", "an immediately crossing buy ends Filled");
    const body = await text(result);
    assert(/Refunded \(price improvement\)\s*0\.8000/.test(body), `refund of 0.8 shown (got: ${body.slice(0, 400)})`);
    assert(/vs #1/.test(body) && /4\.0000 @ 2\.0000/.test(body), "the trade against order #1 at the maker price 2 is listed");
    assert(/Quote paid at maker prices\s*8\.0000/.test(body), "8 SGDx paid at the maker price");
    await shot("order-result-filled-desktop.png", { fullPage: true });

    // The chain agrees
    assert((await bal(SGDX, ALICE)) - before.aliceSgdx === 8n * E18, "Alice received exactly 8 SGDx");
    assert((await bal(NTU, BOB)) - before.bobNtu === 4n * E18, "Bob received exactly 4 NTU");
    assert(before.bobSgdx - (await bal(SGDX, BOB)) === 8n * E18, "Bob net paid 8 SGDx (8.8 escrowed, 0.8 refunded)");
    assert(before.marketNtu - (await bal(NTU, MARKET)) === 4n * E18 && (await bal(NTU, MARKET)) === 6n * E18, "the order book now holds exactly Alice's remaining 6 NTU (4 left for Bob)");
    const alice = await getOrder(1n);
    assert(alice.filled === 4n * E18 && alice.status === 1, "Alice's order is partly filled, 4 of 10");
  });

  await test("My orders and the transaction page show the same facts as the chain", async () => {
    const row = page.locator('tr[data-order-id="2"]');
    await row.waitFor({ timeout: 20000 });
    assert((await text(row.getByTestId("order-row-status"))) === "Filled", "Bob's order #2 is Filled in the table");
    await row.locator('a[href^="/tx/"]').first().click();
    await page.getByTestId("tx-status").waitFor({ timeout: 20000 });
    assert((await page.getByTestId("tx-status").getAttribute("data-status")) === "success", "the receipt status is success");
    const events = await text(page.getByTestId("tx-events"));
    assert(/Order #2 placed/.test(events) && /Trade/.test(events) && /transfer/i.test(events), "OrderPlaced, Trade and Transfer events are decoded");
    await shot("tx-page-desktop.png");
    await page.goBack();
    await page.getByRole("heading", { name: "Trade", exact: true }).waitFor();
  });

  await test("switching back to Alice shows her partly-filled order with 6 NTU still locked", async () => {
    await mock(() => window.__mock.setAccount(0));
    const row = page.locator('tr[data-order-id="1"]');
    await row.waitFor({ timeout: 20000 });
    // Alice's own cached rows may show for an instant while the next block's read lands; wait for the refresh.
    await page.waitForFunction(
      () => document.querySelector('tr[data-order-id="1"] [data-testid="order-row-status"]')?.textContent === "Partly filled",
      null,
      { timeout: 20000 },
    );
    assert((await text(row.getByTestId("order-row-status"))) === "Partly filled", "status Partly filled");
    assert(/6\.0000\s*NTU/.test(await text(row)), "6 NTU locked collateral");
    await shot("my-orders-desktop.png");
  });

  await test("a rejection in the wallet is reported as a rejection, nothing is sent, and Try again recovers", async () => {
    await placeOrderThroughUi({ side: "sell", price: "3", amount: "1" });
    const sent = await mock(() => window.__mock.sentCount());
    await mock(() => window.__mock.rejectNext());
    await submitOrder();
    await page.getByText("You rejected the order request").waitFor({ timeout: 10000 });
    assert((await mock(() => window.__mock.sentCount())) === sent, "no transaction was sent");
    await shot("order-rejected-desktop.png", { fullPage: true });
    await ticket().getByRole("button", { name: "Try again" }).first().click();
    await ticket().getByRole("button", { name: /^Place sell order/ }).waitFor();
    await submitOrder();
    await waitForResult();
    assert((await text(page.getByTestId("order-status"))) === "Resting", "the retried order rests");
    await ticket().getByRole("button", { name: "Place another order" }).click();
  });

  await test("a double click sends exactly one wallet request", async () => {
    await mock((ms) => window.__mock.setDelay("tx", ms), 1500);
    const sent = await mock(() => window.__mock.sentCount());
    await placeOrderThroughUi({ side: "sell", price: "4", amount: "1", approveClicks: 2 });
    assert((await mock(() => window.__mock.sentCount())) === sent + 1, "one approval transaction for a double click");
    const sentAfterApproval = await mock(() => window.__mock.sentCount());
    await ticket().getByRole("button", { name: /^Place sell order/ }).dblclick();
    await waitForResult();
    assert((await mock(() => window.__mock.sentCount())) === sentAfterApproval + 1, "one order transaction for a double click");
    await mock(() => window.__mock.setDelay("tx", 0));
    await ticket().getByRole("button", { name: "Place another order" }).click();
  });

  await test("account change while the wallet request is open: dropped, flagged as stale, and nothing is attributed to the new account", async () => {
    await placeOrderThroughUi({ side: "sell", price: "5", amount: "1" });
    const aliceBefore = (await orderIds(ALICE)).length;
    await mock((ms) => window.__mock.setDelay("tx", ms), 3000);
    await submitOrder();
    await page.getByText(WAIT_TEXT).first().waitFor();
    await mock(() => window.__mock.setAccount(1)); // the user switches account in the wallet while it is open
    await page.getByText("Your account, network or market changed").waitFor({ timeout: 10000 });
    await page.waitForTimeout(3500);
    assert((await page.getByTestId("order-result").count()) === 0, "no result card for the abandoned request");
    assert((await orderIds(ALICE)).length === aliceBefore, "the wallet refused the stale sender, so nothing was placed");
    await shot("order-stale-desktop.png", { fullPage: true });
    await ticket().getByRole("button", { name: "Dismiss" }).first().click();
    await mock(() => window.__mock.setDelay("tx", 0));
    await mock(() => window.__mock.setAccount(0));
  });

  await test("wrong network: the banner and the ticket offer Switch to Anvil, with the pending-wallet guidance and recovery", async () => {
    await mock(() => window.__mock.setChain(1));
    await page.getByText(/Your wallet is on chain 1/).waitFor({ timeout: 10000 });
    assert(await ticket().getByRole("button", { name: "Switch to Anvil" }).isVisible(), "the ticket offers Switch to Anvil");
    await mock((ms) => window.__mock.setDelay("switch", ms), 2500);
    await ticket().getByRole("button", { name: "Switch to Anvil" }).click();
    await page.getByText("Network switch request sent to your wallet").first().waitFor({ timeout: 5000 });
    await shot("switch-pending-desktop.png", { fullPage: true });
    await page.getByText(/Your wallet is on chain 1/).waitFor({ state: "detached", timeout: 15000 });
    await mock(() => window.__mock.setDelay("switch", 0));
  });

  await test("layout at desktop, tablet and mobile: no horizontal overflow and no console errors", async () => {
    const hash = (await mock(() => window.__mock.lastSent())).hash;
    for (const [w, h, label] of [[1586, 1000, "desktop"], [768, 1024, "tablet"], [375, 812, "mobile"]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const [path, name] of [["/trade", "trade"], ["/", "overview"], [`/tx/${hash}`, "tx"]]) {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `${name} at ${label} overflows horizontally by ${overflow}px`);
        await shot(`${name}-${label}.png`, { fullPage: true });
      }
    }
    const real = consoleErrors.filter((m) => !/favicon|Download the React DevTools/i.test(m));
    assert(real.length === 0, `console errors: ${real.slice(0, 3).join(" | ")}`);
  });
}

try {
  await main();
} finally {
  try {
    if (snapshotId) await chain.request({ method: "evm_revert", params: [snapshotId] });
  } catch {}
  await browser?.close();
  const failed = results.filter((r) => r.status === "fail");
  writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ wallet: "MOCK (not MetaMask)", rpc: RPC, base: BASE, passed: results.length - failed.length, failed: failed.length, results, consoleErrors }, null, 2));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (mock wallet, scratch chain)`);
  process.exitCode = failed.length ? 1 : 0;
}
