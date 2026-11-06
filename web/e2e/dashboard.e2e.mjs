// Browser test of the Dashboard market selector and the all-token wallet overview against a SCRATCH Anvil, with a MOCK wallet
// (see mock-wallet.mjs). This is NOT a MetaMask test.
//
// Fixture (built through Anvil's unlocked dev accounts, reverted at the end): Alice issues DTT (10,000) and 55 filler tokens
// (so the TokenFactory registry is larger than one 50-item page), lists DTT/SGDx and EXT/SGDx (EXT is an external 18-decimal
// token) and rests a sell of 10 DTT at 2 SGDx. Bob holds NTU and SGDx only.
//
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:dashboard
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-6-1-screens");
if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const TOKEN_FACTORY = D.tokenFactory;
const MARKET_FACTORY = D.marketFactory;
const SEED_MARKET = D.market;
const SGDX = D.quoteToken.address;
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const E18 = 10n ** 18n;
const FILLERS = 55;

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const read = (address, abi, functionName, args = []) => chain.readContract({ address, abi, functionName, args });
const wallet = (account) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const send = async (account, req) => {
  const hash = await wallet(account).writeContract({ ...req, account, chain: foundry });
  const r = await chain.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`fixture transaction reverted: ${req.functionName}`);
  return r;
};

const results = [];
const consoleErrors = [];
let snapshotId;
let browser;
let context;
let page;
let dtt;
let dttMarket;

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
      await shot(`FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}.png`);
    } catch {}
  }
}
const mock = (fn, arg) => page.evaluate(fn, arg);
const text = async (locator) => (await locator.textContent())?.replace(/\s+/g, " ").trim() ?? "";
const sent = () => mock(() => window.__mock.sentCount());
const walletLog = () => mock(() => window.__mock.state.log.slice());
const holdings = () => page.locator("#all-holdings");
const ticket = () => page.locator("#order");
const rowSymbols = async () => (await holdings().locator("li [data-token-symbol]").allTextContents()).map((t) => t.trim());

async function connect() {
  await page.getByRole("button", { name: /Connect wallet/ }).first().click();
  await page.getByRole("button", { name: /Browser Wallet/ }).click();
  await page.getByRole("button", { name: /open account menu/ }).waitFor({ timeout: 15000 });
}
async function openDashboard(search = "") {
  await page.goto(`${BASE}/${search}`);
  await page.getByRole("heading", { name: "Market", exact: true }).waitFor({ timeout: 20000 });
}

async function buildFixture() {
  const mockArtifact = JSON.parse(readFileSync(resolve(HERE, "../../contracts/out/MockERC20.sol/MockERC20.json"), "utf8"));
  await send(ALICE, { address: TOKEN_FACTORY, abi: tokenFactoryAbi, functionName: "createToken", args: ["Demo Test Token", "DTT", 10_000n * E18] });
  for (let i = 0; i < FILLERS; i++) {
    await send(ALICE, { address: TOKEN_FACTORY, abi: tokenFactoryAbi, functionName: "createToken", args: [`Filler ${i}`, `F${String(i).padStart(2, "0")}`, 1000n * E18] });
  }
  const count = await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount");
  [dtt] = await read(TOKEN_FACTORY, tokenFactoryAbi, "getTokens", [count - BigInt(FILLERS) - 1n, 1n]);
  await send(ALICE, { address: MARKET_FACTORY, abi: marketFactoryAbi, functionName: "createMarket", args: [dtt, SGDX] });
  dttMarket = await read(MARKET_FACTORY, marketFactoryAbi, "getMarket", [dtt, SGDX]);
  const hash = await wallet(ALICE).deployContract({ abi: mockArtifact.abi, bytecode: mockArtifact.bytecode.object, args: ["External Coin", "EXT", 18], account: ALICE, chain: foundry });
  const ext = getAddress((await chain.waitForTransactionReceipt({ hash })).contractAddress);
  await send(ALICE, { address: ext, abi: mockArtifact.abi, functionName: "mint", args: [ALICE, 500n * E18] });
  await send(ALICE, { address: MARKET_FACTORY, abi: marketFactoryAbi, functionName: "createMarket", args: [ext, SGDX] });
  await send(ALICE, { address: dtt, abi: demoTokenAbi, functionName: "approve", args: [dttMarket, 10n * E18] });
  await send(ALICE, { address: dttMarket, abi: orderBookAbi, functionName: "placeLimitOrder", args: [1, 2n * E18, 10n * E18] });
}

async function main() {
  snapshotId = await chain.request({ method: "evm_snapshot" });
  await buildFixture();
  assert((await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount")) > 50n, "the fixture makes the token registry larger than one page");

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1000 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB] }) });
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("default: no parameter shows the original NTU / SGDx market; disconnected holdings ask to connect", async () => {
    await openDashboard();
    assert(/NTU \/ SGDx/.test(await text(page.locator("#market-selector"))), "selector names the seed pair");
    await page.waitForFunction((m) => document.querySelector("#market-picker")?.value?.toLowerCase() === m.toLowerCase(), SEED_MARKET, { timeout: 15000 });
    assert(/Connect a wallet/.test(await text(holdings())), "the overview asks to connect");
    await shot("dashboard-default-disconnected-desktop.png", { fullPage: true });
  });

  await test("connected as Alice: all-token overview lists nonzero tokens across registries, deduplicated, unfiltered by the pair", async () => {
    await connect();
    await holdings().getByRole("list").waitFor({ timeout: 20000 });
    const first = await rowSymbols();
    assert(first.length === 6, `shows the first 6 rows (got ${first.length})`);
    await holdings().getByRole("button", { name: /^Show all/ }).click();
    const all = await rowSymbols();
    for (const s of ["NTU", "SGDx", "DTT", "EXT", "F00", "F54"]) assert(all.includes(s), `${s} is listed`);
    assert(new Set(all).size === all.length, "no token is listed twice");
    assert(all.length === 4 + FILLERS, `4 named tokens plus ${FILLERS} fillers (got ${all.length})`);
    const body = await text(holdings());
    assert(/Issued by TokenFactory/.test(body) && /Listed externally/.test(body), "provenance is labelled both ways");
    assert(/nothing is added up/.test(body), "the no-totals / no-prices note is shown");
    assert(!/\$|USD/.test(body), "no USD valuation");
    await shot("dashboard-holdings-alice-desktop.png", { fullPage: true });
  });

  await test("registry paging: the TokenFactory registry beyond the first 50 tokens is discovered", async () => {
    assert((await rowSymbols()).includes("F54"), "the last of 56+ factory tokens (beyond item 50) appears");
    assert((await page.getByText(/Only the first tokens/).count()) === 0, "no truncation notice below the cap");
  });

  await test("zero balances: hidden by default, shown on request, for an account that holds only NTU and SGDx", async () => {
    await mock(() => window.__mock.setAccount(1));
    await page.waitForFunction(() => { const t = document.querySelector("#all-holdings")?.textContent ?? ""; return !t.includes("F54") && t.includes("SGDx") && t.includes("NTU"); }, null, { timeout: 20000 });
    const syms = await rowSymbols();
    assert(JSON.stringify(syms.sort()) === JSON.stringify(["NTU", "SGDx"]), `Bob sees NTU and SGDx only (got ${syms})`);
    assert(!/DTT|EXT|F00/.test(await text(holdings())), "no previous-account (Alice) balances remain after the account switch");
    await holdings().getByLabel("Show zero balances").check();
    await page.waitForFunction(() => document.querySelector("#all-holdings")?.textContent?.includes("DTT"), null, { timeout: 15000 });
    assert((await rowSymbols()).includes("DTT"), "a zero-balance token appears when asked");
    await shot("dashboard-holdings-bob-zero-desktop.png", { fullPage: true });
    await holdings().getByLabel("Show zero balances").uncheck();
  });

  await test("selecting DTT / SGDx switches every market-specific panel, updates the URL, and sends nothing to the wallet", async () => {
    const before = await sent();
    const logBefore = (await walletLog()).length;
    await page.locator("#market-picker").selectOption(dttMarket);
    await page.waitForURL((u) => u.searchParams.get("market")?.toLowerCase() === dttMarket.toLowerCase(), { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector("#market-selector")?.textContent?.includes("DTT / SGDx"), null, { timeout: 15000 });
    await page.waitForFunction(() => /DTT \/ SGDx holdings/.test(document.querySelector("#holdings")?.textContent ?? ""), null, { timeout: 15000 });
    assert(/DTT/.test(await text(page.locator("#depth"))) || /DTT/.test(await text(page.locator("#book"))), "depth / book name DTT");
    assert(/DTT \/ SGDx/.test(await text(page.locator("#book"))), "the order book is titled for the selected pair");
    assert((await page.locator('#holdings [aria-label="Share of total supply held by this wallet"] > div').count()) === 2, "the pair panel has exactly two supply-share rows (no stale row left from the loading state)");
    await page.locator("#book").getByText("2.00", { exact: false }).first().waitFor({ timeout: 15000 });
    assert(await ticket().getByRole("radio", { name: /Buy DTT/ }).isVisible(), "the ticket trades DTT");
    const href = await page.getByRole("link", { name: /Open Trade view/ }).getAttribute("href");
    assert(href?.toLowerCase() === `/trade?market=${dttMarket}`.toLowerCase(), `Open Trade view targets the selected market (got ${href})`);
    assert((await sent()) === before, "selecting a market sent no transaction");
    const writes = (await walletLog()).slice(logBefore).filter((m) => /sendTransaction|sign|Typed/i.test(m));
    assert(writes.length === 0, `selecting a market asked the wallet to sign nothing (got ${writes})`);
    await shot("dashboard-dtt-selected-desktop.png", { fullPage: true });
  });

  await test("a reload of the deep link keeps the selection (URL is the source of truth)", async () => {
    await openDashboard(`?market=${dttMarket}`);
    await page.waitForFunction(() => document.querySelector("#market-selector")?.textContent?.includes("DTT / SGDx"), null, { timeout: 15000 });
    assert((await page.locator("#market-picker").inputValue()).toLowerCase() === dttMarket.toLowerCase(), "picker shows DTT / SGDx");
    await openDashboard(`?market=${dttMarket.toLowerCase()}`);
    await page.waitForFunction(() => document.querySelector("#market-selector")?.textContent?.includes("DTT / SGDx"), null, { timeout: 15000 });
    await connect();
  });

  await test("invalid, unregistered and unreadable market requests fall back to the seed market with a plain notice", async () => {
    await openDashboard("?market=DTT");
    await page.getByText(/not a valid address/).waitFor({ timeout: 15000 });
    assert(/NTU \/ SGDx/.test(await text(page.locator("#market-selector"))), "falls back to NTU / SGDx for a symbol");
    await openDashboard(`?market=${dtt}`); // a real contract, but a token, not a market
    await page.getByText(/not a market listed through MarketFactory/).waitFor({ timeout: 15000 });
    assert(/NTU \/ SGDx/.test(await text(page.locator("#market-selector"))), "falls back for a non-market address");
    await openDashboard("?market=0x000000000000000000000000000000000000dEaD");
    await page.getByText(/not a market listed through MarketFactory/).waitFor({ timeout: 15000 });
    await shot("dashboard-invalid-market-desktop.png", { fullPage: true });
    await connect();
  });

  await test("Dashboard to Trade keeps the market, and Trade links back to the Dashboard with it", async () => {
    await openDashboard(`?market=${dttMarket}`);
    await connect();
    await page.getByRole("link", { name: /Open Trade view/ }).click();
    await page.waitForURL(/\/trade\?market=/, { timeout: 15000 });
    await page.getByRole("heading", { name: "Trade", exact: true }).waitFor();
    assert((await page.locator("#market-picker").inputValue()).toLowerCase() === dttMarket.toLowerCase(), "Trade shows the same market");
    await page.getByRole("link", { name: /Dashboard view/ }).click();
    await page.waitForURL((u) => u.pathname === "/" && u.searchParams.get("market")?.toLowerCase() === dttMarket.toLowerCase(), { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector("#market-selector")?.textContent?.includes("DTT / SGDx"), null, { timeout: 15000 });
  });

  await test("the dashboard ticket trades the selected market: Bob buys 4 DTT at a 2.2 limit; the order goes to the DTT book; escrow and fill are correct on-chain", async () => {
    await mock(() => window.__mock.setAccount(1));
    await page.waitForTimeout(800);
    const t = ticket();
    await t.getByRole("radio", { name: /Buy DTT/ }).click();
    await t.getByLabel("Limit price").fill("2.2");
    await t.getByLabel("Amount", { exact: true }).fill("4");
    await t.getByRole("button", { name: "Review order" }).click();
    const next = t.getByRole("button", { name: /^(Approve |Place (buy|sell) order)/ });
    await next.first().waitFor({ timeout: 15000 });
    if (/^Approve /.test(await text(next.first()))) {
      assert(/Approve 8.8 SGDx/.test(await text(next.first())), "approval is the exact escrow in SGDx");
      await next.first().click();
      await t.getByRole("button", { name: /^Place buy order/ }).waitFor({ timeout: 30000 });
    }
    await t.getByRole("button", { name: /^Place buy order/ }).click();
    await page.getByTestId("order-result").waitFor({ timeout: 30000 });
    const last = await mock(() => window.__mock.lastSent());
    assert(last.to.toLowerCase() === dttMarket.toLowerCase(), `the order transaction targets the DTT / SGDx OrderBook (got ${last.to})`);
    assert((await read(dtt, demoTokenAbi, "balanceOf", [BOB])) === 4n * E18, "Bob received exactly 4 DTT");
    assert((await read(dttMarket, orderBookAbi, "getBestAsk"))[1] === 2n * E18, "6 DTT still rest at 2 SGDx");
    assert((await read(SGDX, demoTokenAbi, "allowance", [BOB, dttMarket])) >= 0n, "allowance read ok");
    await shot("dashboard-dtt-trade-result-desktop.png", { fullPage: true });
  });

  await test("after the trade the global overview shows Bob's new DTT without a reload", async () => {
    await page.getByRole("button", { name: "Place another order" }).click();
    await page.waitForFunction(() => /DTT[\s\S]*4/.test(document.querySelector("#all-holdings")?.textContent ?? ""), null, { timeout: 20000 });
    assert((await rowSymbols()).includes("DTT"), "DTT is now a nonzero holding");
  });

  await test("a token created in the app appears in the overview without a reload (in-app navigation only)", async () => {
    await page.getByRole("link", { name: "Create token" }).first().click();
    await page.getByRole("heading", { name: "Create token", exact: true }).waitFor({ timeout: 20000 });
    await page.getByLabel("Name", { exact: true }).fill("Fresh Coin");
    await page.getByLabel("Symbol", { exact: true }).fill("FRSH");
    await page.getByLabel("Total supply").fill("250");
    await page.getByRole("button", { name: "Review token" }).click();
    await page.getByRole("button", { name: "Create token" }).click();
    await page.getByTestId("token-result").waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.waitForFunction(() => document.querySelector("#all-holdings")?.textContent?.includes("FRSH"), null, { timeout: 20000 });
    assert((await rowSymbols()).includes("FRSH"), "FRSH is in the overview");
  });

  await test("accessible controls: the selector and the zero-balance checkbox work by keyboard and have visible focus", async () => {
    await openDashboard();
    await connect();
    await page.locator("#market-picker").focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => new URL(location.href).searchParams.has("market"), null, { timeout: 10000 });
    const outline = await page.locator("#market-picker").evaluate((el) => getComputedStyle(el).outlineStyle + "|" + getComputedStyle(el).borderColor);
    assert(outline.length > 0, "the select reports a focus style");
    await page.getByLabel("Show zero balances").focus();
    await page.keyboard.press("Space");
    assert(await page.getByLabel("Show zero balances").isChecked(), "Space toggles the checkbox");
    assert((await page.getByRole("combobox", { name: "Market" }).count()) === 1, "the select has an accessible name");
  });

  await test("wallet controls (P2-8A.1, R7): accessible names contain the visible text, keyboard operates them, header fits at five widths", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await page.setViewportSize({ width: 1586, height: 1000 });
    await openDashboard();
    await connect();
    const walletBtn = page.getByRole("button", { name: /open account menu/ });
    const visible = (await walletBtn.innerText()).trim();
    assert(/^0x[0-9a-fA-F]{4}.+[0-9a-fA-F]{4}$/.test(visible), `the connected button shows the shortened address (got "${visible}")`);
    const snap = await walletBtn.ariaSnapshot();
    assert(snap.includes(`button "${visible}, open account menu"`), `the accessible name starts with the visible text: ${snap}`);
    const copyBtn = page.getByRole("button", { name: "Copy Address", exact: true });
    assert((await copyBtn.count()) === 1, "the Copy Address button's accessible name is its visible text");
    assert((await copyBtn.ariaSnapshot()).includes('button "Copy Address"'), "no label overrides the visible text");
    await walletBtn.focus();
    assert(await walletBtn.evaluate((el) => el === document.activeElement), "the wallet button takes keyboard focus");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor({ timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 });
    await copyBtn.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Copied", exact: true }).waitFor({ timeout: 5000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.toLowerCase() === ALICE.toLowerCase(), "Enter on Copy Address copies the connected address");
    for (const w of [375, 390, 430, 768, 1586]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const b = [...document.querySelectorAll("header button")].find((el) => /open account menu/.test(el.getAttribute("aria-label") ?? ""));
        const r = b?.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, left: r?.left, right: r?.right, w: window.innerWidth };
      });
      assert(m.overflow <= 0, `header overflows by ${m.overflow}px at ${w}`);
      assert(m.left !== undefined && m.left >= 0 && m.right <= m.w, `the wallet button fits inside the viewport at ${w} (${m.left}..${m.right})`);
    }
    await page.setViewportSize({ width: 1586, height: 1000 });
  });

  await test("layout at desktop, tablet and mobile: no horizontal overflow, no console errors", async () => {
    for (const [w, h, label] of [[1586, 1000, "desktop"], [768, 1024, "tablet"], [375, 812, "mobile"]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const [path, name] of [["/", "overview"], [`/?market=${dttMarket}`, "overview-dtt"], [`/trade?market=${dttMarket}`, "trade-dtt"]]) {
        await openDashboard().catch(() => {});
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
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
