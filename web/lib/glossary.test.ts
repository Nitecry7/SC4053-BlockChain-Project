import { describe, expect, it } from "vitest";
import { GLOSSARY } from "./glossary";

const t = (k: keyof typeof GLOSSARY) => GLOSSARY[k].text;

describe("glossary wording (P2-8C), pinned to the engine's rules", () => {
  it("every entry is a concise, finished sentence group with a Title Case term", () => {
    for (const [key, e] of Object.entries(GLOSSARY)) {
      expect(e.text.length, key).toBeLessThanOrEqual(260);
      expect(e.text.length, key).toBeGreaterThan(30);
      expect(e.text.endsWith("."), key).toBe(true);
      expect(/^[A-Z][A-Za-z0-9-]*( (and|or|of|to|the|a|[A-Z][A-Za-z0-9-]*))*$/.test(e.term), `${key}: ${e.term}`).toBe(true);
    }
  });

  it("keeps eligibility, activation and execution apart", () => {
    expect(t("stopLimitOrder")).toMatch(/only makes the order eligible/);
    expect(t("stopLimitOrder")).toMatch(/may not trade/);
    expect(t("triggerPrice")).toMatch(/Eligible is not activated/);
    expect(t("eligibleNow")).toMatch(/still Pending Trigger/);
    expect(t("eligibleNow")).toMatch(/does not need another trade/);
    expect(t("triggerStops")).toMatch(/Activation is not execution/);
  });

  it("states the trigger rule per side exactly as the engine does (sell at or below, buy at or above)", () => {
    expect(t("triggerPrice")).toMatch(/sell stop at or below it, a buy stop at or above it/);
  });

  it("Trigger Stops: the caller pays gas and needs neither ownership nor tokens; Match Orders: anyone, gas, crossed book", () => {
    expect(t("triggerStops")).toMatch(/pays gas/);
    expect(t("triggerStops")).toMatch(/does not need to own the orders or hold any trading tokens/);
    expect(t("matchOrders")).toMatch(/anyone/i);
    expect(t("matchOrders")).toMatch(/gas/);
    expect(t("matchOrders")).toMatch(/10 fills/);
  });

  it("escrow and prices: a buy escrows quote at the limit; the limit price is a bound, not the execution price", () => {
    expect(t("escrow")).toMatch(/sell escrows the base token/);
    expect(t("escrow")).toMatch(/quote token, worked out at your limit price/);
    expect(t("limitPrice")).toMatch(/can be better than your limit/);
  });

  it("a pending stop is never described as being on the Order Book, and the connected-account tip separates MetaMask's selection from the site's", () => {
    expect(t("pendingTrigger")).toMatch(/not on the Order Book/);
    expect(t("orderBook")).toMatch(/Pending stop-limit orders are not part of it/);
    expect(t("connectedAccount")).toMatch(/Choosing another account in MetaMask does not change it/);
  });
});
