// Browser test of the P2-8A.2 RPC liveness and recovery verification, against a SCRATCH Anvil, with a MOCK wallet
// (see mock-wallet.mjs). This is NOT a MetaMask test.
//
// An outage is simulated by making the browser's requests to the node fail (Playwright `route.abort`), so the chain can be
// changed behind the page while it cannot see it (revert, mine). That is a stand-in for a node that died and came back;
// a real stop and restart of a scratch Anvil (same chain via --state, and a fresh chain) was run separately and is
// recorded in docs/ai-audit/test-evidence/person2/p2-8a2-liveness.md.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:liveness
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-8a2-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const rpc = async (method, params = []) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
const assert = (cond, message) => {
  if (!cond) throw new Error(`assertion failed: ${message}`);
};

const results = [];
const consoleErrors = [];
let browser;
let context;
let page;
let blocked = false;
let rpcOps = 0;
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
    await unblock().catch(() => {});
  }
}

const rpcOrigin = new URL(RPC).origin;
async function attachRouting(ctx) {
  await ctx.route(`${rpcOrigin}/**`, (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
}
const block = () => (blocked = true);
const unblock = async () => (blocked = false);

const offlineBanner = () => page.getByTestId("rpc-offline");
const verifyingBanner = () => page.getByTestId("rpc-verifying");
const resetNotices = () => page.getByTestId("chain-reset-notice");
const cta = () => page.locator("#order").getByRole("button").filter({ hasText: /^(Review order|Approve |Place |Node unreachable|Verifying chain|Market unavailable|Enter a price|Fix the highlighted|Reading|Checking)/ });
const ctaEnabled = async () => (await cta().first().isEnabled());

/** Waits until the page reports a healthy, verified node: no outage or verification banner and the trade ticket is back. */
async function healthy(timeout = 40000) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="rpc-offline"],[data-testid="rpc-verifying"]') && !!document.querySelector("#order"), undefined, { timeout });
}
/** Offline the whole terminal is replaced by an empty state; a ticket that is still there must be disabled. */
const ticketBlocked = async () => (await page.locator("#order").count()) === 0 || !(await ctaEnabled());
/** After a recovery the terminal has remounted and the draft is gone: refill it and expect a usable ticket. */
async function usableAgain() {
  await fillTicket();
  await page.locator("#order").getByRole("button", { name: "Review order" }).waitFor({ timeout: 20000 });
  assert(await ctaEnabled(), "the ticket is usable again after verification");
}

async function fillTicket() {
  const t = page.locator("#order");
  await t.getByLabel("Limit price").fill("2");
  await t.getByLabel("Amount", { exact: true }).fill("10");
}

async function main() {
  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1000 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB] }) });
  await attachRouting(context);
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("request", (req) => {
    if (new URL(req.url()).origin === rpcOrigin && req.method() === "POST") {
      try {
        const b = JSON.parse(req.postData() || "null");
        rpcOps += Array.isArray(b) ? b.length : 1;
      } catch {}
    }
  });

  await test("connect Alice on the trade page, fill a valid order", async () => {
    await page.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Connect wallet/ }).first().click();
    await page.getByRole("button", { name: /Browser Wallet/ }).click();
    await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
    await fillTicket();
    await healthy();
    // Invariant for every test below: while an outage or verification banner is up, no ticket button that could start a
    // transaction is enabled. Checked on every DOM mutation, not just at the end.
    await page.evaluate(() => {
      window.__inv = { violations: [], sawVerifying: false, sawOffline: false };
      const check = () => {
        const off = document.querySelector('[data-testid="rpc-offline"]');
        const ver = document.querySelector('[data-testid="rpc-verifying"]');
        if (off) window.__inv.sawOffline = true;
        if (ver) window.__inv.sawVerifying = true;
        if (!off && !ver) return;
        for (const b of document.querySelectorAll("#order button")) {
          if (/^(Review order|Approve |Place )/.test(b.innerText.trim()) && !b.disabled) window.__inv.violations.push(b.innerText.trim());
        }
      };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
  });

  await test("healthy node with no new block stays online: no banner, no last-known chips, no reset notice", async () => {
    await page.waitForTimeout(16000);
    assert((await offlineBanner().count()) === 0 && (await verifyingBanner().count()) === 0, "no outage banner");
    assert((await page.getByTestId("last-known").count()) === 0, "no last-known chip while healthy");
    assert((await resetNotices().count()) === 0, "no reset notice");
    assert(await ctaEnabled(), "the ticket is usable");
  });

  await test("a brief RPC failure (under one probe cycle) does not flicker the page offline", async () => {
    block();
    await page.waitForTimeout(3000);
    await unblock();
    await page.waitForTimeout(9000);
    assert((await offlineBanner().count()) === 0, "no outage banner after a brief failure");
    assert(await ctaEnabled(), "the ticket stays usable");
  });

  await test("persistent outage: alert, last-known labels, no usable ticket, truthful empty state", async () => {
    block();
    const before = rpcOps;
    await offlineBanner().waitFor({ timeout: 25000 });
    const alert = (await offlineBanner().textContent()) ?? "";
    assert(/last known/i.test(alert) && /not current/i.test(alert), `the alert calls the data last known (got: ${alert.slice(0, 120)})`);
    assert(/Transactions are disabled/.test(alert), "the alert says transactions are disabled");
    assert((await offlineBanner().getAttribute("role")) === "alert", "the outage is announced as an alert");
    assert((await page.getByTestId("last-known").count()) > 0, "panels are marked as last known");
    assert(await ticketBlocked(), "no usable order ticket while the node is unreachable");
    assert(/Node unreachable/.test((await page.locator("main").textContent()) ?? ""), "the trade area says the node is unreachable (not 'no deployment')");
    await shot("outage-trade-desktop.png", { fullPage: true });
    await page.waitForTimeout(30000);
    const ops = rpcOps - before;
    console.log(`        RPC operations during ~55 s of outage: ${ops}`);
    assert(ops < 200, `an outage does not cause a request storm (${ops} operations)`);
  });

  await test("account and network switches while offline keep the page offline and the ticket disabled", async () => {
    await page.evaluate(() => window.__mock.setAccount(1));
    await page.waitForTimeout(1500);
    assert(await ticketBlocked(), "still no usable ticket after an account switch while offline");
    await page.evaluate(() => window.__mock.setChain(1));
    await page.waitForTimeout(1500);
    assert((await offlineBanner().count()) === 1 && (await ticketBlocked()), "still offline with no usable ticket after a network switch");
    await page.evaluate(() => window.__mock.setChain(31337));
    await page.evaluate(() => window.__mock.setAccount(0));
  });

  await test("recovery of an unchanged chain: verification shown, ticket enabled only afterwards, no reset claimed", async () => {
    await rpc("evm_mine"); // the chain moved on while the page could not see it: still the same chain
    await unblock();
    await healthy(40000);
    assert((await resetNotices().count()) === 0, "an unchanged chain is not reported as reset");
    await usableAgain();
    const inv = await page.evaluate(() => window.__inv);
    assert(inv.sawOffline, "the outage banner was shown");
    assert(inv.violations.length === 0, `no transaction button was enabled during an outage or verification (${inv.violations.join(", ")})`);
  });

  await test("same block height with a different hash after an outage is a reset: one notice, then verified and usable", async () => {
    const snap = await rpc("evm_snapshot");
    await rpc("evm_mine");
    await page.waitForTimeout(8000); // the page records the new head (number and hash) while healthy
    block();
    await offlineBanner().waitFor({ timeout: 25000 });
    await rpc("evm_revert", [snap]); // that head is gone...
    await rpc("evm_mine"); // ...and another block with the same number, a different hash, takes its place
    const before = rpcOps;
    await unblock();
    await resetNotices().first().waitFor({ timeout: 40000 });
    const evidence = (await resetNotices().first().textContent()) ?? "";
    assert(/different hash|genesis|below block/i.test(evidence), `the notice states its evidence (got: ${evidence.slice(0, 140)})`);
    await healthy(40000);
    await page.waitForTimeout(6000); // let the chain watcher's own detection of the same reset arrive
    assert((await resetNotices().count()) === 1, `exactly one reset notice (got ${await resetNotices().count()})`);
    await usableAgain();
    const ops = rpcOps - before;
    console.log(`        RPC operations in the ~50 s after a recovered reset: ${ops}`);
    assert(ops < 400, `no refresh storm after a reset (${ops} operations)`);
    const inv = await page.evaluate(() => window.__inv);
    assert(inv.violations.length === 0, `no transaction button enabled while unverified (${inv.violations.join(", ")})`);
    await shot("recovered-reset-desktop.png", { fullPage: true });
    await resetNotices().first().getByRole("button", { name: "Dismiss" }).click();
    await page.waitForTimeout(500);
    assert((await resetNotices().count()) === 0, "one dismissal clears the notice (no second copy appears)");
  });

  await test("head below the last seen block after an outage is a reset too", async () => {
    const snap = await rpc("evm_snapshot");
    await rpc("evm_mine");
    await rpc("evm_mine");
    await rpc("evm_mine");
    await page.waitForTimeout(8000);
    block();
    await offlineBanner().waitFor({ timeout: 25000 });
    await rpc("evm_revert", [snap]);
    await unblock();
    await resetNotices().first().waitFor({ timeout: 40000 });
    await healthy(40000);
    assert((await resetNotices().first().textContent())?.match(/below block|different hash/i), "evidence names the head below the earlier block");
    await resetNotices().first().getByRole("button", { name: "Dismiss" }).click();
  });

  await test("initial load with the node unreachable: reported, nothing claimed as read, recovers by itself", async () => {
    const p2 = await context.newPage();
    block();
    await p2.goto(`${BASE}/trade`, { waitUntil: "domcontentloaded" });
    await p2.getByTestId("rpc-offline").waitFor({ timeout: 25000 });
    const alert = (await p2.getByTestId("rpc-offline").textContent()) ?? "";
    assert(/Nothing has been read from the chain yet/.test(alert), `first-load wording (got: ${alert.slice(0, 120)})`);
    assert(!/last known/i.test(alert), "no last-known claim when nothing was ever read");
    assert((await p2.getByTestId("last-known").count()) === 0, "no last-known chips without data");
    await unblock();
    await p2.waitForFunction(() => !document.querySelector('[data-testid="rpc-offline"],[data-testid="rpc-verifying"]'), undefined, { timeout: 40000 });
    await p2.getByText(/NTU/).first().waitFor({ timeout: 20000 });
    await p2.close();
  });

  await test("after recovery the market pair and metadata are the chain's, not a stale cache", async () => {
    await healthy();
    const main = (await page.locator("main").textContent()) ?? "";
    assert(/NTU/.test(main) && /SGDx/.test(main), "the NTU / SGDx pair is shown");
    assert((await page.getByTestId("last-known").count()) === 0, "nothing is still marked last known");
  });

  await test("no unexpected console errors", async () => {
    const real = consoleErrors.filter((e) => !/WalletConnect|projectId|Failed to fetch|net::ERR|ERR_CONNECTION|connection refused|HTTP|fetch/i.test(e));
    assert(real.length === 0, `console errors: ${real.slice(0, 3).join(" | ")}`);
  });
}

try {
  await main();
} finally {
  try {
    await unblock();
  } catch {}
  await browser?.close();
  const failed = results.filter((r) => r.status === "fail");
  writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ wallet: "MOCK (not MetaMask)", rpc: RPC, base: BASE, passed: results.length - failed.length, failed: failed.length, results, consoleErrors }, null, 2));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (mock wallet, scratch chain, outage simulated by blocking requests)`);
  process.exitCode = failed.length ? 1 : 0;
}
