import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RpcHealthContext } from "@/hooks/use-rpc-health";
import type { RpcHealthSnapshot } from "@/lib/rpc-health";
import { Panel } from "@/components/dashboard/panel";
import { RpcHealthBanner } from "./rpc-health-banner";

const base: RpcHealthSnapshot = { state: "online", lastOkAt: 1_700_000_000_000, everRead: true, resetEvidence: undefined };
const render = (s: Partial<RpcHealthSnapshot>, node: Parameters<typeof createElement>[0] = RpcHealthBanner as never) =>
  renderToStaticMarkup(createElement(RpcHealthContext.Provider, { value: { ...base, ...s, dismissReset: () => {} } }, createElement(node as never, { title: "Balances" }, "x")));

describe("RpcHealthBanner", () => {
  it("is silent while healthy and before the first probe", () => {
    expect(render({ state: "online" })).toBe("");
    expect(render({ state: "unknown" })).toBe("");
  });
  it("an outage is an alert that calls the data last known and says transactions are off", () => {
    const html = render({ state: "offline" });
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/last known/);
    expect(html).toMatch(/not current/);
    expect(html).toMatch(/Transactions are disabled/);
    expect(html).not.toMatch(/reload\b.*then/i);
  });
  it("before anything was ever read it does not claim there is last-known data", () => {
    const html = render({ state: "offline", everRead: false, lastOkAt: undefined });
    expect(html).toMatch(/Nothing has been read from the chain yet/);
    expect(html).not.toMatch(/last known/);
  });
  it("unverified on a first load does not claim that nothing was read, only that identity is unconfirmed", () => {
    const html = render({ state: "unverified", everRead: false, lastOkAt: undefined });
    expect(html).toMatch(/identity has not been confirmed/);
    expect(html).not.toMatch(/Nothing has been read/);
  });
  it("verifying and refreshing are a status, not success, and keep transactions off", () => {
    for (const state of ["verifying", "refreshing"] as const) {
      const html = render({ state });
      expect(html).toContain('role="status"');
      expect(html).toMatch(/Verifying the chain/);
      expect(html).toMatch(/stay off/);
    }
  });
  it("unverified is an alert and says the chain could not be verified", () => {
    const html = render({ state: "unverified" });
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/could not be verified/);
  });
});

describe("Panel last-known chip", () => {
  it("appears when offline with data previously read, not when online or never read", () => {
    expect(render({ state: "offline" }, Panel as never)).toContain("Last known, not current");
    expect(render({ state: "unverified" }, Panel as never)).toContain("Last known, not current");
    expect(render({ state: "online" }, Panel as never)).not.toContain("Last known");
    expect(render({ state: "offline", everRead: false }, Panel as never)).not.toContain("Last known");
  });
});
