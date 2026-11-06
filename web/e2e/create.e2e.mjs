// Browser test of token issuance and market listing against a SCRATCH Anvil, using a MOCK wallet (see mock-wallet.mjs).
//
// This is NOT a MetaMask test. The wallet is an injected stand-in that forwards to Anvil's unlocked dev accounts.
// What it does prove: the forms validate, review, simulate, request signatures, wait for receipts, decode the factory
// events, verify the result on-chain, refresh the registries without a reload, block duplicates, and hand over to the
// Trade page, in a real browser against the deployed contracts.
//
// Run (scratch chain deployed; app built with NEXT_PUBLIC_RPC_URL pointing at it; see docs/TESTING.md):
//   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npm run build && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546 npx next start -p 3100
//   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 CHROMIUM_PATH=<chrome> BASE_URL=http://localhost:3100 npm run e2e:create
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { deployments } from "../lib/contracts/deployments.ts";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "../lib/contracts/abis.ts";
import { mockWalletScript } from "./mock-wallet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.E2E_RPC_URL;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROMIUM = process.env.CHROMIUM_PATH;
const SHOTS = process.env.SCREENSHOT_DIR ?? resolve(HERE, "../../docs/ai-audit/test-evidence/person2/p2-6-screens");

if (!RPC) throw new Error("Set E2E_RPC_URL to a scratch Anvil (not the developer's chain on port 8545).");
if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain.");
if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
if (!CHROMIUM) throw new Error("Set CHROMIUM_PATH to a Chromium/Chrome executable.");
mkdirSync(SHOTS, { recursive: true });

const D = deployments[31337];
const TOKEN_FACTORY = D.tokenFactory;
const MARKET_FACTORY = D.marketFactory;
const SGDX = D.quoteToken.address;
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const E18 = 10n ** 18n;

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const read = (address, abi, functionName, args = []) => chain.readContract({ address, abi, functionName, args });
const results = [];
const consoleErrors = [];
let snapshotId;
let browser;
let context;
let page;
let newToken;
let newMarket;

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
const mock = (fn, arg) => page.evaluate(fn, arg);
const text = async (locator) => (await locator.textContent())?.replace(/\s+/g, " ").trim() ?? "";
const sent = () => mock(() => window.__mock.sentCount());

async function connect() {
  await page.getByRole("button", { name: /Connect wallet/ }).first().click();
  await page.getByRole("button", { name: /Browser Wallet/ }).click();
  await page.getByRole("button", { name: /Wallet 0x/ }).waitFor({ timeout: 15000 });
}
async function fillToken(name, symbol, supply) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Symbol", { exact: true }).fill(symbol);
  await page.getByLabel("Total supply").fill(supply);
}
const lastTokenCreated = async () => {
  const count = await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount");
  const [token] = await read(TOKEN_FACTORY, tokenFactoryAbi, "getTokens", [count - 1n, 1n]);
  return { count, token };
};

async function main() {
  snapshotId = await chain.request({ method: "evm_snapshot" });
  const startCount = await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount");
  const startMarkets = await read(MARKET_FACTORY, marketFactoryAbi, "marketCount");

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1586, height: 1000 } });
  await context.addInitScript({ content: mockWalletScript({ rpcUrl: RPC, accounts: [ALICE, BOB] }) });
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await test("create-token page: disconnected visitors are asked to connect, and nothing can be submitted", async () => {
    await page.goto(`${BASE}/create-token`);
    await page.getByRole("heading", { name: "Create token", exact: true }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Connect wallet" }).last().waitFor({ timeout: 15000 });
    assert(await page.getByRole("button", { name: "Connect wallet" }).last().isVisible(), "the form offers Connect wallet");
    assert((await sent()) === 0, "no wallet request");
    await shot("create-token-disconnected-desktop.png", { fullPage: true });
  });

  await test("connect through the wallet", async () => {
    await connect();
  });

  await test("validation: empty, whitespace, control characters, zero, too many decimals and over-MAX supply are refused with no wallet request", async () => {
    const before = await sent();
    const submit = () => page.getByRole("button", { name: /^(Review token|Create token|Enter a name|Fix the highlighted)/ }).last();
    await page.getByLabel("Name", { exact: true }).fill("   ");
    await page.getByLabel("Symbol", { exact: true }).fill("OK");
    await page.getByLabel("Total supply").fill("1");
    assert(await submit().isDisabled(), "whitespace-only name disables submit");
    await page.getByLabel("Name", { exact: true }).fill("Bad‮name");
    assert(await submit().isDisabled(), "a bidi override character disables submit");
    await page.getByLabel("Name", { exact: true }).fill("Fine");
    for (const bad of ["0", "1.0000000000000000001", "1000000001", "-5", "abc", "1e3"]) {
      await page.getByLabel("Total supply").fill(bad);
      assert(await submit().isDisabled(), `supply "${bad}" disables submit`);
    }
    await page.getByLabel("Total supply").fill("1000000000"); // exactly MAX_SUPPLY in whole tokens
    assert(!(await submit().isDisabled()), "exactly the maximum supply is accepted");
    assert((await sent()) === before, "no transaction was requested during validation");
    await page.getByLabel("Name", { exact: true }).fill("");
    await page.getByLabel("Symbol", { exact: true }).fill("");
    await page.getByLabel("Total supply").fill("");
  });

  await test("issue Fizz Coin (FIZZ, 1,000,000): review, one wallet request, verified result card, chain agrees", async () => {
    await fillToken("Fizz Coin", "FIZZ", "1000000");
    await page.getByRole("button", { name: "Review token" }).click();
    const review = page.getByTestId("review");
    await review.waitFor();
    const body = await text(review);
    assert(/Fizz Coin/.test(body) && /FIZZ/.test(body) && /1,000,000/.test(body), `the review shows the entered values (got ${body.slice(0, 200)})`);
    await shot("create-token-review-desktop.png", { fullPage: true });
    const before = await sent();
    await page.getByRole("button", { name: "Create token" }).dblclick(); // double click: still one request
    await page.getByTestId("token-result").waitFor({ timeout: 30000 });
    assert((await sent()) === before + 1, "exactly one wallet request for a double click");
    const { count, token } = await lastTokenCreated();
    newToken = token;
    assert(count === startCount + 1n, "tokenCount grew by one");
    assert((await read(token, demoTokenAbi, "totalSupply")) === 1_000_000n * E18, "exact total supply");
    assert((await read(token, demoTokenAbi, "balanceOf", [ALICE])) === 1_000_000n * E18, "the creator holds the whole supply");
    assert((await read(token, demoTokenAbi, "decimals")) === 18, "18 decimals");
    assert((await read(TOKEN_FACTORY, tokenFactoryAbi, "isFactoryToken", [token])) === true, "recognised by the factory");
    const card = await text(page.getByTestId("token-result"));
    assert(/Fizz Coin/.test(card) && /FIZZ/.test(card) && /1,000,000/.test(card), "the card shows name, symbol and supply");
    assert(/issued by/i.test(card) && /TokenFactory/.test(card), "the card says it was issued by the TokenFactory");
    assert(/not unique/i.test(card), "the card explains that names and symbols are not unique");
    await shot("create-token-result-desktop.png", { fullPage: true });
  });

  await test("the Tokens page lists the new token without a reload", async () => {
    await page.getByRole("link", { name: "View on Tokens" }).click();
    await page.getByRole("heading", { name: "Tokens", exact: true }).waitFor({ timeout: 20000 });
    await page.getByText("FIZZ", { exact: false }).first().waitFor({ timeout: 20000 });
    assert((await page.getByText("Fizz Coin").count()) > 0, "the new token is on the Tokens page");
    await shot("tokens-with-new-desktop.png", { fullPage: true });
  });

  await test("list market from the result: the new token is pre-selected as base; choose SGDx as quote; review and orientation warning; ack gates the button", async () => {
    await page.goto(`${BASE}/list-market?base=${newToken}`);
    await page.getByRole("heading", { name: "List market", exact: true }).waitFor({ timeout: 20000 });
    await connect(); // a full page load resets the mock wallet, like a fresh wallet session
    await page.locator("#market-quote").selectOption(SGDX);
    const review = page.getByTestId("review");
    await review.waitFor({ timeout: 20000 });
    assert((await text(page.getByTestId("review-pair"))) === "FIZZ / SGDx", "the review names the pair FIZZ / SGDx");
    assert(/quoted in SGDx per 1 FIZZ/.test(await text(review)), "the unit reading is spelled out");
    assert(await page.getByTestId("orientation-warning").isVisible(), "the permanence warning is shown");
    const submit = page.getByRole("button", { name: /^(List market|Acknowledge)/ }).last();
    assert(await submit.isDisabled(), "listing is disabled until the acknowledgement is ticked");
    const before = await sent();
    await page.getByRole("checkbox").check();
    assert(!(await submit.isDisabled()), "ticking the acknowledgement enables listing");
    assert((await sent()) === before, "no wallet request before the click");
    await shot("list-market-review-desktop.png", { fullPage: true });
  });

  await test("rejection in the wallet is reported, nothing is sent, and Try again recovers", async () => {
    const before = await sent();
    await mock(() => window.__mock.rejectNext());
    await page.getByRole("button", { name: "List market" }).click();
    await page.getByText(/rejected/i).first().waitFor({ timeout: 10000 });
    assert((await sent()) === before, "no transaction was sent");
    assert((await read(MARKET_FACTORY, marketFactoryAbi, "marketCount")) === startMarkets, "no market exists yet");
    await shot("list-market-rejected-desktop.png", { fullPage: true });
    await page.getByRole("button", { name: "Try again" }).first().click();
    await page.getByRole("button", { name: /^(List market|Acknowledge)/ }).last().waitFor();
  });

  await test("list FIZZ / SGDx: result card verified on-chain, registry and book honest", async () => {
    const ack = page.getByRole("checkbox");
    if (!(await ack.isChecked())) await ack.check();
    await page.getByRole("button", { name: "List market" }).dblclick();
    await page.getByTestId("market-result").waitFor({ timeout: 30000 });
    newMarket = await read(MARKET_FACTORY, marketFactoryAbi, "getMarket", [newToken, SGDX]);
    assert(newMarket !== "0x0000000000000000000000000000000000000000", "the factory registered the market");
    assert((await read(MARKET_FACTORY, marketFactoryAbi, "getMarket", [SGDX, newToken])) === newMarket, "both orders resolve to the same market");
    assert((await read(newMarket, orderBookAbi, "baseToken")).toLowerCase() === newToken.toLowerCase(), "the market's base is FIZZ");
    assert((await read(newMarket, orderBookAbi, "quoteToken")).toLowerCase() === SGDX.toLowerCase(), "the market's quote is SGDx");
    assert((await read(MARKET_FACTORY, marketFactoryAbi, "marketCount")) === startMarkets + 1n, "marketCount grew by one");
    assert((await text(page.getByTestId("market-created-pair"))) === "FIZZ / SGDx", "the card names the pair");
    await shot("list-market-result-desktop.png", { fullPage: true });
  });

  await test("Trade this market: the new market loads through the registry with an honest empty book, and an order can be placed and rests", async () => {
    await page.getByRole("link", { name: "Trade this market" }).click();
    await page.getByRole("heading", { name: "Trade", exact: true }).waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#market-picker")?.textContent?.includes("FIZZ / SGDx"), null, { timeout: 20000 });
    assert(!(await page.getByText("Cancel order").count()), "no cancel control");
    const ticket = page.locator("#order");
    await ticket.getByRole("radio", { name: /Sell FIZZ/ }).click();
    await ticket.getByLabel("Limit price").fill("2");
    await ticket.getByLabel("Amount", { exact: true }).fill("10");
    await ticket.getByRole("button", { name: "Review order" }).click();
    const next = ticket.getByRole("button", { name: /^(Approve |Place sell order)/ });
    await next.first().waitFor({ timeout: 15000 });
    if (/^Approve /.test(await text(next.first()))) {
      assert((await text(next.first())) === "Approve 10 FIZZ", "approval states the exact collateral in the new token");
      await next.first().click();
      await ticket.getByRole("button", { name: /^Place sell order/ }).waitFor({ timeout: 30000 });
    }
    await ticket.getByRole("button", { name: /^Place sell order/ }).click();
    await page.getByTestId("order-result").waitFor({ timeout: 30000 });
    assert((await text(page.getByTestId("order-status"))) === "Resting", "the sell rests on the new market");
    assert((await read(newToken, demoTokenAbi, "balanceOf", [newMarket])) === 10n * E18, "10 FIZZ escrowed in the new order book");
    await shot("trade-new-market-desktop.png", { fullPage: true });
  });

  await test("duplicate and reversed pairs are blocked before any signature, with a link to the existing market", async () => {
    await page.goto(`${BASE}/list-market?base=${SGDX}&quote=${newToken}`);
    await connect();
    const panel = page.getByTestId("duplicate-panel");
    await panel.waitFor({ timeout: 20000 });
    const body = await text(panel);
    assert(/already has a market/.test(body) && /the other way round/.test(body), `the reversed pair is explained (got ${body.slice(0, 240)})`);
    const open = panel.getByRole("link", { name: "Open the existing market" });
    assert((await open.getAttribute("href")).toLowerCase().endsWith(newMarket.toLowerCase()), "the link points at the existing market");
    assert(await page.getByRole("button", { name: "Already listed" }).isDisabled(), "listing is disabled");
    assert((await page.getByTestId("review").count()) === 0, "no review is offered");
    await shot("list-market-duplicate-desktop.png", { fullPage: true });
    // the same orientation
    await page.goto(`${BASE}/list-market?base=${newToken}&quote=${SGDX}`);
    await page.getByTestId("duplicate-panel").waitFor({ timeout: 20000 });
    assert(!/the other way round/.test(await text(page.getByTestId("duplicate-panel"))), "the same orientation is not called reversed");
  });

  await test("pair validation: same token twice, a non-token address and a 6-decimal-style bad address are refused with messages", async () => {
    await page.goto(`${BASE}/list-market`);
    await connect();
    await page.locator("#market-base").selectOption(SGDX);
    await page.locator("#market-quote").selectOption(SGDX);
    await page.getByTestId("pair-message").waitFor();
    assert(/different|same/i.test(await text(page.getByTestId("pair-message"))), "the same token twice is explained");
    await page.locator("#market-quote").selectOption({ label: "Other address…" });
    await page.getByLabel(/Quote token contract address/).fill(ALICE); // an account, not a token
    await page.getByText(/does not answer like an ERC-20/).first().waitFor({ timeout: 15000 });
    assert(await page.getByRole("button", { name: "Choose a valid pair" }).isDisabled(), "listing stays disabled");
    assert((await page.getByTestId("review").count()) === 0, "no review for an invalid pair");
  });

  await test("wrong network: the create forms offer Switch to Anvil and send nothing", async () => {
    await page.goto(`${BASE}/create-token`);
    await connect();
    await fillToken("Net Test", "NET", "5");
    await mock(() => window.__mock.setChain(1));
    await page.getByText(/Your wallet is on chain 1/).waitFor({ timeout: 10000 });
    assert(await page.getByRole("button", { name: "Switch to Anvil" }).last().isVisible(), "the form offers Switch to Anvil");
    const before = await sent();
    assert((await sent()) === before, "no request while on the wrong network");
    await page.getByRole("button", { name: "Switch to Anvil" }).last().click();
    await page.getByText(/Your wallet is on chain 1/).waitFor({ state: "detached", timeout: 15000 });
  });

  await test("account change while the wallet request is open: flagged stale, nothing attributed to the new account", async () => {
    await page.goto(`${BASE}/create-token`);
    await connect();
    await fillToken("Stale Test", "STALE", "5");
    await page.getByRole("button", { name: "Review token" }).click();
    const countBefore = await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount");
    await mock((ms) => window.__mock.setDelay("tx", ms), 3000);
    await page.getByRole("button", { name: "Create token" }).click();
    await page.getByText(/Waiting for MetaMask confirmation/).first().waitFor({ timeout: 10000 });
    await mock(() => window.__mock.setAccount(1));
    await page.getByText(/changed/).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(3500);
    assert((await page.getByTestId("token-result").count()) === 0, "no result card for the abandoned request");
    assert((await read(TOKEN_FACTORY, tokenFactoryAbi, "tokenCount")) === countBefore, "the wallet refused the stale sender, so nothing was created");
    await shot("create-token-stale-desktop.png", { fullPage: true });
    await mock(() => window.__mock.setDelay("tx", 0));
    await mock(() => window.__mock.setAccount(0));
  });

  await test("layout at desktop, tablet and mobile: no horizontal overflow, no console errors", async () => {
    for (const [w, h, label] of [[1586, 1000, "desktop"], [768, 1024, "tablet"], [375, 812, "mobile"]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const [path, name] of [["/create-token", "create-token"], [`/list-market?base=${newToken}`, "list-market"], ["/tokens", "tokens"], ["/markets", "markets"], [`/trade?market=${newMarket}`, "trade-new"], ["/", "overview"]]) {
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
