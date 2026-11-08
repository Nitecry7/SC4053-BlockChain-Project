// Browser test of the P2-8C usability work against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. What it proves: Title Case headings and column headers on every page, the glass information
// tips (hover, keyboard focus, Escape, outside click, touch tap, no clipping at 375 px, reduced motion, accessible names),
// the semantic status badges and the separate "Eligible Now" chip, the Trigger Price shown in My Orders for the whole life of a
// stop, the stop-history wording (a stop cancelled before activation is never "Activated"; activated, then filled or cancelled;
// unreadable history is neutral), the history request economy (no repeated requests), the account chip and "Sending From"
// rows, badge contrast, no horizontal overflow, and axe-core on the changed states. The engine's own auto-cancel at activation
// is covered by the real-chain suite (`lib/stop.integration.test.ts`) and the unit tests, not by this browser suite.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8548 npx next build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8548 npx next start -p 3102
//   E2E_RPC_URL=http://127.0.0.1:8548 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3102 npm run e2e:ux
// The scratch chain must be freshly deployed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { createPublicClient, createWalletClient, http, toEventSelector } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, orderBookAbi } from "../lib/contracts/abis.ts";
import { GLOSSARY } from "../lib/glossary.ts";
import { isTitleCase } from "../lib/labels.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3102";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-8c-screens");
const AXE = resolve(HERE, "../node_modules/axe-core/axe.min.js");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (["8546", "8547"].includes(new URL(RPC).port)) throw new Error("Refusing to run: 8546 and 8547 hold the Bonus 2 and Bonus 3 evidence.");
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
const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const ACCOUNTS = [DEPLOYER, ALICE, BOB, CAROL, KEEPER];
const E18 = 10n ** 18n;
const dec = (s) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const TRIGGERED = toEventSelector(orderBookAbi.find((e) => e.type === "event" && e.name === "StopOrderTriggered"));

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const rpc = (method, params = []) => chain.request({ method, params });
const getOrder = (id) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] });
const orderIds = (who) => chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] });
const allowanceOf = (token, who) => chain.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [who, MARKET] });
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
async function tradeAt(price) {
  await place(CAROL, 1, price, "1", "1");
  await place(BOB, 0, price, "1", price);
}
async function placeStop(who, side, trigger, limit, amount, escrow) {
  await approve(who, side === 0 ? SGDX : NTU, dec(escrow));
  await send(who, MARKET, orderBookAbi, "placeStopLimitOrder", [side, dec(trigger), dec(limit), dec(amount)]);
  const all = await orderIds(who);
  return all[all.length - 1];
}
const simTrigger = async () => (await chain.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "triggerStopOrders", args: [10n] })).result;
const trigger = () => send(KEEPER, MARKET, orderBookAbi, "triggerStopOrders", [10n]);
const cancelOnChain = (who, id) => send(who, MARKET, orderBookAbi, "cancelOrder", [id]);
async function isCrossed() {
  const [bid, ask] = await Promise.all([
    chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestBid" }),
    chain.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestAsk" }),
  ]);
  return bid[0] !== 0n && ask[0] !== 0n && bid[1] >= ask[1];
}
async function resetBook() {
  for (let i = 0; i < 6 && (await simTrigger()) > 0n; i++) await trigger();
  for (let i = 0; i < 6 && (await isCrossed()); i++) await send(KEEPER, MARKET, orderBookAbi, "matchOrders", [10n]);
  for (const who of ACCOUNTS) for (const id of await orderIds(who)) {
    const o = await getOrder(id);
    if (o.status === 0 || o.status === 1 || o.status === 4) await cancelOnChain(who, id);
  }
}

const results = [];
const consoleErrors = [];
const measured = []; // contrast ratios measured from rendered pixels, written to the results file as evidence
const historyRequests = []; // eth_getLogs requests that ask for StopOrderTriggered, counted for Alice's desktop page only (the mobile page stays open and is not counted)
let failHistory = false;
let snapshotId;
let browser;
let pn; // no wallet
let pa; // Alice
let pm; // Alice on a 375 px touch device
const shot = (p, name, opts = {}) => p.screenshot({ path: join(SHOTS, name.replace(/\.png$/, ".jpg")), type: "jpeg", quality: 70, ...opts });
const assert = (cond, message) => {
  if (!cond) throw new Error(`assertion failed: ${message}`);
};
async function test(name, fn) {
  if (process.env.UX_ONLY && !new RegExp(process.env.UX_ONLY, "i").test(name)) return; // debugging aid: run only the matching tests
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
    failHistory = false;
    try {
      await pa.evaluate(() => window.__mock.setAccount(0));
    } catch {}
    try {
      await resetBook();
    } catch (e) {
      results.push({ name: `cleanup after "${name}"`, status: "fail", ms: 0, error: String(e.message).split("\n")[0] });
    }
  }
}
// Visible text only (the exact values in `.sr-only` are left out).
const text = async (locator) =>
  (await locator.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }))?.replace(/\s+/g, " ").trim() ?? "";
async function connect(p) {
  await p.getByRole("button", { name: /Connect wallet|Connect$/ }).first().click();
  await p.getByRole("button", { name: /Browser Wallet/ }).click();
  await p.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
}
async function open(p, path, wallet = true) {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  if (!wallet) return;
  await p.getByRole("button", { name: /Connect wallet|Connect$|open account menu/ }).first().waitFor({ timeout: 30000 });
  if ((await p.getByRole("button", { name: /open account menu/ }).count()) === 0) await connect(p);
}
const row = (p, id) => p.locator(`[data-order-id="${id}"]`);
const waitRow = async (p, id) => {
  await row(p, id).waitFor({ timeout: 30000 });
};
/** Waits for the state line of a stop to have exactly this kind (or, with a trailing "*", this prefix). */
const waitKind = (p, id, kind, timeout = 30000) =>
  p.waitForFunction(([i, k]) => {
    const v = document.querySelector(`[data-testid="stop-state-${i}"]`)?.getAttribute("data-kind");
    return v != null && (k.endsWith("*") ? v.startsWith(k.slice(0, -1)) : v === k);
  }, [String(id), kind], { timeout });

/** Contrast of the text inside an element, measured from its rendered pixels: the most common colour is the background, the colour farthest from it (inside a 3 px inset, away from borders) the text. */
async function contrastOf(locator) {
  const png = PNG.sync.read(await locator.screenshot({ type: "png" }));
  const lum = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const inset = 3;
  const counts = new Map();
  const px = [];
  for (let y = inset; y < png.height - inset; y++) for (let x = inset; x < png.width - inset; x++) {
    const i = (y * png.width + x) * 4;
    const key = `${png.data[i] >> 2},${png.data[i + 1] >> 2},${png.data[i + 2] >> 2}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    px.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
  }
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = bgKey.split(",").map((v) => Number(v) * 4 + 2);
  const lb = lum(...bg);
  let fg = px[0];
  let best = -1;
  for (const p of px) {
    const d = Math.abs(lum(...p) - lb);
    if (d > best) { best = d; fg = p; }
  }
  const [a, b] = [lum(...fg), lb].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
async function axe(p, label) {
  await p.addScriptTag({ path: AXE });
  const r = await p.evaluate(async () => {
    const out = await window.axe.run(document, { resultTypes: ["violations"] });
    return out.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) }));
  });
  assert(r.length === 0, `axe violations on ${label}: ${JSON.stringify(r)}`);
}
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function main() {
  snapshotId = await rpc("evm_snapshot");
  const dirty = [];
  for (const who of ACCOUNTS) {
    if ((await allowanceOf(NTU, who)) !== 0n || (await allowanceOf(SGDX, who)) !== 0n) dirty.push("an allowance");
    if ((await orderIds(who)).length !== 0) dirty.push("orders");
  }
  assert(dirty.length === 0, `the scratch chain is not freshly deployed (leftover: ${dirty.join(", ")})`);

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const rpcOrigin = new URL(RPC).origin;
  const hook = (p) => {
    if (process.env.UX_DEBUG) p.on("console", (m) => /sh-debug/.test(m.text()) && console.log(`        ${m.text()}`));
    p.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
    p.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
    p.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  };
  const make = async (opts, wallet, counted = false) => {
    const c = await browser.newContext(opts);
    if (wallet) await c.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: wallet }) });
    if (wallet) {
      await c.route(`${rpcOrigin}/**`, async (route) => {
        const body = route.request().postData() ?? "";
        const asks = body.includes(TRIGGERED);
        if (asks && counted) {
          historyRequests.push(body.length);
          if (process.env.UX_DEBUG) console.log(`        [history request ${historyRequests.length} at +${Date.now() % 100000}ms] ${body.slice(0, 260)}`);
        }
        if (!asks || !failHistory) return route.continue();
        // The history read fails (an RPC error); every other call in the same request is left alone.
        const res = await route.fetch();
        const json = await res.json();
        const reqs = JSON.parse(body);
        const fail = (item, req) => (JSON.stringify(req).includes(TRIGGERED) ? { jsonrpc: "2.0", id: req.id ?? item.id, error: { code: -32000, message: "simulated history failure" } } : item);
        const out = Array.isArray(json) ? json.map((item, i) => fail(item, Array.isArray(reqs) ? reqs.find((r) => r.id === item.id) ?? reqs[i] : reqs)) : fail(json, reqs);
        return route.fulfill({ response: res, json: out });
      });
    }
    const p = await c.newPage();
    hook(p);
    return p;
  };
  pn = await make({ viewport: { width: 1586, height: 1100 } }, undefined);
  pa = await make({ viewport: { width: 1586, height: 1100 } }, [ALICE, BOB], true);
  pm = await make({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true }, [ALICE, BOB]);

  await test("Title Case: every page's headings and column headers follow the convention, and nothing relies on CSS capitalize", async () => {
    const hash = await approve(ALICE, NTU, dec("1"));
    for (const path of ["/", "/markets", "/tokens", "/trade", "/create-token", "/list-market", `/tx/${hash}`]) {
      await open(pn, path, false);
      await pn.waitForTimeout(2500);
      const found = await pn.evaluate(() => {
        const vis = (el) => !el.closest(".sr-only") && el.getClientRects().length > 0;
        const clean = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only,[data-slot],button").forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
        const heads = [...document.querySelectorAll(location.pathname === "/" ? "h2" : "h2, h1")].filter(vis).map((el) => ({ t: clean(el), tt: getComputedStyle(el).textTransform }));
        const ths = [...document.querySelectorAll("th")].filter(vis).map((el) => ({ t: clean(el), tt: getComputedStyle(el).textTransform }));
        return [...heads, ...ths].filter((x) => x.t);
      });
      for (const f of found) {
        assert(f.tt === "none", `${path}: "${f.t}" uses text-transform ${f.tt}`);
        if (/[“”]/.test(f.t)) continue;
        assert(isTitleCase(f.t), `${path}: "${f.t}" is not Title Case`);
      }
      assert(found.length > 0 || path.startsWith("/tx/"), `${path}: no headings found`);
    }
  });

  await test("information tips: hover opens and leaving closes; the popup is labelled and described, and shows the glossary wording", async () => {
    await open(pa, "/trade");
    const tip = pa.locator('#order [data-info="limitOrder"]');
    await tip.waitFor({ timeout: 30000 });
    assert((await tip.getAttribute("aria-label")) === "About Limit Order", "the button's accessible name names the concept");
    assert((await pa.locator("#order-title").innerText()).trim() === "Limit Order", "the heading's own text is not polluted by the icon");
    await tip.hover();
    const pop = pa.getByTestId("info-tip-popup");
    await pop.waitFor({ timeout: 5000 });
    assert((await text(pop)).includes(GLOSSARY.limitOrder.text), "the popup shows the glossary text");
    const labelled = await pop.evaluate((el) => { const t = document.getElementById(el.getAttribute("aria-labelledby") ?? ""); return t?.textContent; });
    assert(labelled === "Limit Order", `the popup is labelled by its title (got ${labelled})`);
    await pa.mouse.move(5, 5);
    await pop.waitFor({ state: "detached", timeout: 5000 });
  });

  await test("information tips: keyboard focus opens, Escape closes, moving focus away closes", async () => {
    await open(pa, "/trade");
    const tip = pa.locator('#order [data-info="limitOrder"]');
    await tip.waitFor({ timeout: 30000 });
    await pa.getByRole("link", { name: /Trade/ }).first().focus();
    for (let i = 0; i < 40; i++) {
      await pa.keyboard.press("Tab");
      if ((await pa.evaluate(() => document.activeElement?.getAttribute("data-info"))) === "limitOrder") break;
    }
    assert((await pa.evaluate(() => document.activeElement?.getAttribute("data-info"))) === "limitOrder", "Tab reaches the information button");
    const pop = pa.getByTestId("info-tip-popup");
    await pa.waitForFunction(() => document.querySelectorAll('[data-testid="info-tip-popup"]').length === 1, null, { timeout: 5000 }); // tips passed on the way have faded out
    const ring = await tip.evaluate((el) => getComputedStyle(el).boxShadow);
    assert(ring && ring !== "none", "the focused button has a visible focus ring");
    await pa.keyboard.press("Escape");
    await pop.waitFor({ state: "detached", timeout: 5000 });
    await pa.keyboard.press("Enter");
    await pop.waitFor({ timeout: 5000 });
    await pa.keyboard.press("Tab");
    await pa.waitForFunction(() => document.querySelectorAll('[data-testid="info-tip-popup"]').length === 0, null, { timeout: 5000 });
  });

  await test("information tips: a click outside closes an open tip", async () => {
    await open(pa, "/trade");
    const tip = pa.locator('#order [data-info="limitOrder"]');
    await tip.waitFor({ timeout: 30000 });
    await tip.click();
    const pop = pa.getByTestId("info-tip-popup");
    await pop.waitFor({ timeout: 5000 });
    await pa.mouse.click(5, 400);
    await pop.waitFor({ state: "detached", timeout: 5000 });
  });

  await test("information tips on a 375 px touch device: a tap opens, the popup stays inside the viewport, a tap outside closes; reduced motion removes the fade", async () => {
    await open(pm, "/trade");
    await pm.emulateMedia({ reducedMotion: "reduce" });
    const tips = pm.locator("[data-info]");
    await tips.first().waitFor({ timeout: 30000 });
    const n = await tips.count();
    assert(n >= 1, "tips are present on mobile");
    for (let i = 0; i < Math.min(n, 6); i++) {
      const t = tips.nth(i);
      await t.scrollIntoViewIfNeeded();
      await t.tap();
      const pop = pm.getByTestId("info-tip-popup");
      await pop.waitFor({ timeout: 5000 });
      const box = await pop.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= 375 && box.y >= 0, `the popup of tip ${i} is inside the viewport (${JSON.stringify(box)})`);
      const dur = await pop.evaluate((el) => getComputedStyle(el).transitionDuration);
      assert(/^0(\.0+1?)?m?s/.test(dur) || dur === "1e-05s", `reduced motion shortens the transition (got ${dur})`);
      await pm.touchscreen.tap(8, 8);
      await pop.waitFor({ state: "detached", timeout: 5000 });
    }
    await pm.emulateMedia({ reducedMotion: "no-preference" });
    assert(await noOverflow(pm), "no horizontal overflow on /trade at 375 px");
  });

  await test("ticket: the mode switch and the field labels follow the convention, with tips on the concepts that need them", async () => {
    await open(pa, "/trade");
    await pa.getByTestId("mode-stop").waitFor({ timeout: 30000 });
    assert((await pa.getByRole("radio", { name: "Stop-Limit" }).count()) === 1, "the segment is named Stop-Limit");
    await pa.getByTestId("mode-stop").click();
    assert((await pa.locator("#order-title").innerText()).trim() === "Stop-Limit Order", "the panel is titled Stop-Limit Order");
    assert((await pa.locator('label[for="order-trigger"]').innerText()).trim() === "Trigger Price", "Trigger Price label");
    assert((await pa.locator('label[for="order-price"]').innerText()).trim() === "Limit Price", "Limit Price label");
    for (const k of ["stopLimitOrder", "triggerPrice", "limitPrice"]) assert((await pa.locator(`[data-info="${k}"]`).count()) === 1, `a tip for ${k}`);
    assert((await pa.locator('[data-info="limitOrder"]').count()) === 0, "no Limit Order tip while in Stop-Limit mode");
    await pa.getByTestId("mode-limit").click();
    assert((await pa.locator('[data-info="limitOrder"]').count()) === 1, "the Limit Order tip returns in Limit mode");
  });

  await test("dashboard: Market Board, Market Depth and Order Book carry tips; the last trade price has one", async () => {
    await tradeAt("2");
    await open(pn, "/", false);
    for (const k of ["marketBoard", "marketDepth", "orderBook", "lastTradePrice"]) await pn.locator(`[data-info="${k}"]`).first().waitFor({ timeout: 30000 });
    await shot(pn, "dashboard-after.png", { fullPage: true });
  });

  await test("My Orders: a pending stop shows Trigger Price and Limit Price and an amber Pending Trigger badge; a limit order shows only its limit price", async () => {
    const stop = await placeStop(ALICE, 1, "1.8", "1.7", "10", "10");
    const lim = await place(ALICE, 0, "1.5", "2", "3");
    await open(pa, "/trade");
    await waitRow(pa, stop);
    await waitRow(pa, lim);
    assert((await text(pa.getByTestId(`order-type-${stop}`))) === "Stop-Limit Order", "the stop is tagged Stop-Limit Order");
    assert((await text(pa.getByTestId(`order-type-${lim}`))) === "Limit Order", "the limit order is tagged Limit Order");
    assert(/^Trigger Price 1\.8/.test(await text(pa.getByTestId(`trigger-price-${stop}`))), "Trigger Price 1.8 is shown");
    assert(/^Limit Price 1\.7/.test(await text(pa.getByTestId(`limit-price-${stop}`))), "Limit Price 1.7 is shown");
    assert((await pa.getByTestId(`trigger-price-${lim}`).count()) === 0, "a limit order has no trigger field");
    const badge = row(pa, stop).getByTestId("order-row-status");
    assert((await text(badge)) === "Pending Trigger" && (await badge.getAttribute("data-status-tone")) === "pending", "Pending Trigger is the pending tone");
    const fg = await badge.evaluate((el) => getComputedStyle(el).color);
    assert(/^(rgb\(242, 193, 78\)|oklab\(0\.834)/.test(fg), `the badge text is the amber token (got ${fg})`);
    assert((await text(pa.getByTestId(`stop-state-${stop}`))).startsWith("Waiting for price"), "the stop is waiting for price");
    assert((await row(pa, stop).locator("[data-testid^=eligible-chip]").count()) === 0, "no Eligible Now chip while waiting");
    await shot(pa, "my-orders-pending-after.png", { fullPage: true });
  });

  await test("semantic badges: Resting, Partially Filled, Filled and Cancelled differ by tone, icon and text, and all are readable (>= 4.5:1)", async () => {
    const resting = await place(ALICE, 1, "3", "2", "2"); // sells 2 at 3, rests
    const partly = await place(ALICE, 1, "2.5", "2", "2"); // sells 2 at 2.5, then Bob buys 1
    await place(BOB, 0, "2.5", "1", "2.5");
    const filled = await place(ALICE, 1, "2.2", "1", "1");
    await place(BOB, 0, "2.2", "1", "2.2");
    const cancelled = await place(ALICE, 1, "4", "1", "1");
    await cancelOnChain(ALICE, cancelled);
    const pend = await placeStop(ALICE, 1, "1.5", "1.4", "1", "1");
    await open(pa, "/trade");
    for (const id of [resting, partly, filled, cancelled, pend]) await waitRow(pa, id);
    const expect = [[resting, "Resting", "resting"], [partly, "Partially Filled", "partial"], [filled, "Filled", "filled"], [cancelled, "Cancelled", "cancelled"], [pend, "Pending Trigger", "pending"]];
    const colours = new Set();
    for (const [id, label, tone] of expect) {
      const b = row(pa, id).getByTestId("order-row-status");
      assert((await text(b)) === label && (await b.getAttribute("data-status-tone")) === tone, `${label} has tone ${tone}`);
      assert((await b.locator("svg").count()) === 1, `${label} has an icon`);
      colours.add(await b.evaluate((el) => getComputedStyle(el).color));
      const c = await contrastOf(b);
      measured.push(`${label} ${c.toFixed(2)}:1`);
      assert(c >= 4.5, `${label} badge contrast ${c.toFixed(2)}:1 is below 4.5:1`);
    }
    assert(colours.size >= 4, `the statuses are visually distinct (${colours.size} text colours)`);
    await shot(pa, "my-orders-badges-after.png", { fullPage: true });
  });

  await test("Eligible Now is a separate chip: the order stays Pending Trigger, escrowed, and is never shown as another status", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "1.8", "1.7", "10", "10");
    await tradeAt("1.8");
    await open(pa, "/trade");
    await waitRow(pa, stop);
    const chip = pa.getByTestId(`eligible-chip-${stop}`);
    await chip.waitFor({ timeout: 30000 });
    assert((await text(chip)) === "Eligible Now", "the chip says Eligible Now");
    assert((await text(row(pa, stop).getByTestId("order-row-status"))) === "Pending Trigger", "the status badge still says Pending Trigger");
    const t = await text(pa.getByTestId(`stop-state-${stop}`));
    assert(/Eligible now/.test(t) && /does not need another trade/.test(t) && !/Activated/.test(t), `eligible wording (got ${t})`);
    assert((await getOrder(stop)).status === 4, "on-chain it is still PendingTrigger");
    const c = await contrastOf(chip);
    measured.push(`Eligible Now chip ${c.toFixed(2)}:1`);
    assert(c >= 4.5, `the Eligible Now chip contrast ${c.toFixed(2)}:1`);
    await shot(pa, "my-orders-eligible-after.png", { fullPage: true });
  });

  await test("REGRESSION (order #3 of the Bonus 3 MetaMask run): a stop cancelled in the UI before activation is never described as activated, and keeps its Trigger Price", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 0, "1.8", "1.7", "10", "17"); // a buy stop: trigger 1.8, limit 1.7, 10 NTU, escrow 17 SGDx
    await open(pa, "/trade");
    await waitRow(pa, stop);
    await pa.getByTestId(`cancel-order-${stop}`).click();
    await pa.getByTestId("cancel-confirm-button").click();
    await pa.getByTestId("cancel-result").waitFor({ timeout: 40000 });
    assert((await getOrder(stop)).status === 3, "on-chain it is Cancelled");
    const events = await chain.getContractEvents({ address: MARKET, abi: orderBookAbi, eventName: "StopOrderTriggered", fromBlock: 0n });
    assert(!events.some((e) => e.args.orderId === stop), "the chain has no StopOrderTriggered for it");
    await waitKind(pa, stop, "cancelled-before-activation");
    const t = await text(pa.getByTestId(`stop-state-${stop}`));
    assert(/cancelled it before it activated/i.test(t) && /never triggered/i.test(t), `wording (got ${t})`);
    assert(!/Activated:|ordinary order/i.test(t) && !/^Activated/.test(t), "it never says Activated");
    assert(/^Trigger Price 1\.8/.test(await text(pa.getByTestId(`trigger-price-${stop}`))), "the Trigger Price is still shown after cancellation");
    assert((await text(row(pa, stop).getByTestId("order-row-status"))) === "Cancelled", "the badge says Cancelled");
    await shot(pa, "my-orders-cancelled-before-activation-after.png", { fullPage: true });
  });

  await test("activated stops: a traded stop says Activated and keeps its Trigger Price; one that rests and is then cancelled by its owner is an owner cancellation", async () => {
    await tradeAt("2");
    const tradedStop = await placeStop(ALICE, 1, "1.8", "1.7", "4", "4"); // fills against the 1.9 bid
    const restStop = await placeStop(ALICE, 1, "1.9", "2", "3", "3"); // its limit 2 is above the 1.9 bid: it activates but cannot fill
    await tradeAt("1.8");
    await place(BOB, 0, "1.9", "4", "7.6");
    await trigger();
    const [t, r] = await Promise.all([getOrder(tradedStop), getOrder(restStop)]);
    assert(t.status === 2 && r.status === 0, `setup: the traded stop filled (${t.status}) and the other rests (${r.status})`);
    await cancelOnChain(ALICE, restStop);
    await open(pa, "/trade");
    await waitRow(pa, tradedStop);
    await waitRow(pa, restStop);
    await waitKind(pa, tradedStop, "activated-filled");
    assert(/^Activated/.test(await text(pa.getByTestId(`stop-state-${tradedStop}`))), "the traded stop says Activated");
    assert(/^Trigger Price 1\.8/.test(await text(pa.getByTestId(`trigger-price-${tradedStop}`))), "its Trigger Price is still shown after activation and fill");
    assert(/^Limit Price 1\.7/.test(await text(pa.getByTestId(`limit-price-${tradedStop}`))), "its Limit Price is still shown");
    await waitKind(pa, restStop, "activated-then-cancelled");
    const tx = await text(pa.getByTestId(`stop-state-${restStop}`));
    assert(/It activated, then you cancelled/.test(tx), `owner cancel after activation (got ${tx})`);
    assert(/^Trigger Price 1\.9/.test(await text(pa.getByTestId(`trigger-price-${restStop}`))), "the cancelled-after-activation stop keeps its Trigger Price");
    await shot(pa, "my-orders-activated-after.png", { fullPage: true });
  });

  await test("history unreadable: a stop cancelled before activation gets neutral wording and the list still works; it recovers on the next mount", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 0, "1.8", "1.7", "10", "17");
    await cancelOnChain(ALICE, stop);
    failHistory = true;
    await open(pa, "/trade");
    await waitRow(pa, stop);
    await waitKind(pa, stop, "cancelled-unknown", 40000);
    const t = await text(pa.getByTestId(`stop-state-${stop}`));
    assert(/could not be read/.test(t) && !/Activated/.test(t) && !/before it activated/.test(t), `neutral wording (got ${t})`);
    assert((await text(row(pa, stop).getByTestId("order-row-status"))) === "Cancelled", "the list itself is intact");
    failHistory = false;
    await open(pa, "/trade");
    await waitKind(pa, stop, "cancelled-before-activation", 40000);
  });

  await test("history request economy: none for pending stops, one request for a stable set, nothing on later blocks, one more only when a status changes", async () => {
    await tradeAt("2");
    const oldStop = await placeStop(ALICE, 1, "1.5", "1.4", "1", "1");
    await cancelOnChain(ALICE, oldStop); // Alice now has at least one cancelled stop in her history
    // The page of the previous test is still open while the chain was cleaned up; it may be reading history for orders whose status
    // changed in that clean-up. Close it first so only this test's requests are counted.
    await pa.goto("about:blank");
    await pa.waitForTimeout(1500);
    historyRequests.length = 0;
    await open(pa, "/trade");
    await waitKind(pa, oldStop, "cancelled-before-activation", 40000);
    await pa.waitForTimeout(2500);
    const first = historyRequests.length;
    assert(first === 1, `exactly one history request for the stable set of orders (saw ${first})`);
    for (let i = 0; i < 4; i++) {
      await rpc("evm_mine");
      await pa.waitForTimeout(1500);
    }
    assert(historyRequests.length === first, `no history request on later blocks (before ${first}, after ${historyRequests.length})`);
    // Bob has only a PENDING stop: switching to him asks for no history at all
    const bobStop = await placeStop(BOB, 1, "1.5", "1.4", "1", "1");
    await pa.evaluate(() => window.__mock.setAccount(1));
    await waitRow(pa, bobStop);
    await pa.waitForTimeout(2500);
    assert(historyRequests.length === first, `no history request while every stop of the account is pending (before ${first}, after ${historyRequests.length})`);
    // when that stop is cancelled its status changes, so exactly one new request is made
    await cancelOnChain(BOB, bobStop);
    await waitKind(pa, bobStop, "cancelled-before-activation", 40000);
    assert(historyRequests.length === first + 1, `one new request after the status change (before ${first}, after ${historyRequests.length})`);
    await pa.evaluate(() => window.__mock.setAccount(0));
  });

  await test("account switching: the account chip follows the connected account, My Orders shows only that account's orders, and a review states who sends", async () => {
    await tradeAt("2");
    const aliceOrder = await place(ALICE, 1, "5", "1", "1");
    const bobOrder = await place(BOB, 0, "1", "1", "1");
    await open(pa, "/trade");
    await waitRow(pa, aliceOrder);
    assert((await text(pa.getByTestId("orders-account"))).includes(short(ALICE)), "the chip shows Alice");
    assert((await row(pa, bobOrder).count()) === 0, "Bob's order is not listed for Alice");
    await pa.locator("#order-price").fill("2");
    await pa.locator("#order-amount").fill("1");
    await pa.getByRole("button", { name: /^Review order$/ }).click();
    assert((await text(pa.getByTestId("acting-as"))).includes(short(ALICE)), "the review names Alice as the sender");
    await pa.evaluate(() => window.__mock.setAccount(1));
    await waitRow(pa, bobOrder);
    assert((await text(pa.getByTestId("orders-account"))).includes(short(BOB)), "the chip switches to Bob");
    assert((await row(pa, aliceOrder).count()) === 0, "Alice's order is no longer listed after switching to Bob");
    assert((await pa.getByTestId("review").count()) === 0 || (await pa.getByRole("alert").count()) > 0, "the open review did not carry over to the other account");
    await pa.evaluate(() => window.__mock.setAccount(0));
  });

  await test("the shared primary button (Approve) is readable: at least 4.5:1", async () => {
    await open(pa, "/trade");
    await pa.locator("#order-price").fill("2");
    await pa.locator("#order-amount").fill("1");
    const review = pa.getByRole("button", { name: /^Review order$/ });
    await review.click();
    const approve = pa.locator("#order").getByRole("button", { name: /^Approve / });
    await approve.waitFor({ timeout: 30000 });
    const c = await contrastOf(approve);
    measured.push(`Approve button ${c.toFixed(2)}:1`);
    assert(c >= 4.5, `Approve button contrast ${c.toFixed(2)}:1`);
    // The hover state lightens the button (`hover:brightness-110`): that is the state in which the earlier ~4.4:1 reading was most likely taken.
    await approve.hover();
    await pa.waitForTimeout(400);
    const hovered = await contrastOf(approve);
    measured.push(`Approve button while hovered ${hovered.toFixed(2)}:1`);
    assert(hovered >= 4.5, `Approve button while hovered is ${hovered.toFixed(2)}:1`);
    await pa.mouse.move(5, 5);
  });

  await test("layout: no horizontal overflow on any page at 375, 768 and 1280 px", async () => {
    for (const [w, h] of [[375, 800], [768, 1000], [1280, 900]]) {
      await pn.setViewportSize({ width: w, height: h });
      for (const path of ["/", "/markets", "/tokens", "/trade", "/create-token", "/list-market"]) {
        await open(pn, path, false);
        await pn.waitForTimeout(1500);
        assert(await noOverflow(pn), `${path} overflows horizontally at ${w}px`);
      }
    }
    await pn.setViewportSize({ width: 1586, height: 1100 });
  });

  await test("accessibility: axe-core finds no violations in My Orders with stops, the stop ticket review, and the pages, at 1280 and 375 px", async () => {
    await tradeAt("2");
    const stop = await placeStop(ALICE, 1, "1.8", "1.7", "2", "2");
    await tradeAt("1.8");
    await placeStop(ALICE, 0, "1.8", "1.7", "1", "1.7").then(cancelOnChain.bind(null, ALICE));
    for (const p of [pa, pm]) {
      await open(p, "/trade");
      await waitRow(p, stop);
      await p.getByTestId(`eligible-chip-${stop}`).waitFor({ timeout: 30000 });
      await axe(p, "/trade My Orders");
      await p.getByTestId("mode-stop").click();
      await p.locator("#order-trigger").fill("1.8");
      await p.locator("#order-price").fill("1.7");
      await p.locator("#order-amount").fill("1");
      await p.getByRole("button", { name: /Review stop-limit order/ }).click();
      await p.getByTestId("review").waitFor({ timeout: 15000 });
      await axe(p, "/trade stop review");
      await shot(p, `trade-stop-review-${p === pm ? "mobile" : "desktop"}-after.png`, { fullPage: true });
    }
    for (const path of ["/", "/markets", "/tokens", "/create-token", "/list-market"]) {
      await open(pn, path, false);
      await pn.waitForTimeout(2000);
      await axe(pn, path);
    }
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
  writeFileSync(join(SHOTS, "results-ux.json"), JSON.stringify({ results, consoleErrors, measuredContrast: measured }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (mock wallet, scratch chain)`);
  process.exit(failed ? 1 : 0);
}
