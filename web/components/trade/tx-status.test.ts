import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FlowState } from "@/lib/order-flow";
import { TxStatus } from "./tx-status";

// P2-8A.2 (R6b): axe flagged `aria-label` on a role-less <div> ("not well supported"). The name now sits on the <ol>,
// a list, which can be named. The step text and the "submitted, not confirmed" wording are unchanged.
const state = { phase: "approve-wallet", attempt: 1, ctx: undefined, delayed: false } as unknown as FlowState;
const html = (kind: "order" | "approval") => renderToStaticMarkup(createElement(TxStatus, { state, kind }));

describe("TxStatus accessible name", () => {
  it("names the list, not a generic div", () => {
    const h = html("approval");
    expect(h).toMatch(/<ol[^>]*aria-label="Approval progress"/);
    expect(h).not.toMatch(/<div[^>]*aria-label=/);
  });
  it("uses the order name for an order", () => {
    const h = renderToStaticMarkup(createElement(TxStatus, { state: { ...state, phase: "order-wallet" } as unknown as FlowState, kind: "order" }));
    expect(h).toMatch(/<ol[^>]*aria-label="Order progress"/);
  });
});
