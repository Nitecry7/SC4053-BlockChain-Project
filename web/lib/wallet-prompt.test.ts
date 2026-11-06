import { describe, expect, it } from "vitest";
import { ESCALATION_MS, RECOVERY_STEPS, WALLET_WAIT_MESSAGE, failureCopy, isEscalated, successCopy, waitingCopy } from "./wallet-prompt";

describe("wallet pending guidance", () => {
  it("uses the required wording verbatim", () => {
    expect(WALLET_WAIT_MESSAGE).toBe(
      "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request.",
    );
  });

  it.each(["connect", "approve", "order", "switch"] as const)("shows the message immediately for %s, with no recovery steps yet", (kind) => {
    const c = waitingCopy(kind, 0);
    expect(c.state).toBe("waiting");
    if (c.state === "waiting") {
      expect(c.body).toBe(WALLET_WAIT_MESSAGE);
      expect(c.recovery).toEqual([]);
      expect(c.escalated).toBe(false);
    }
  });

  it("adds recovery steps once the request has waited long enough, and not a moment before", () => {
    expect(isEscalated(ESCALATION_MS - 1)).toBe(false);
    expect(isEscalated(ESCALATION_MS)).toBe(true);
    const c = waitingCopy("order", ESCALATION_MS);
    if (c.state === "waiting") {
      expect(c.recovery).toEqual(RECOVERY_STEPS);
      expect(c.escalated).toBe(true);
    }
  });

  it("tells the user to reject a still-open request before retrying, instead of promising a cancel", () => {
    const text = RECOVERY_STEPS.join(" ");
    expect(text).toMatch(/Reject it there first/);
    expect(text).not.toMatch(/detect|visible|cancelled for you/i);
  });

  it("never claims the page can see the popup", () => {
    for (const kind of ["connect", "approve", "order", "switch"] as const) {
      const c = waitingCopy(kind, ESCALATION_MS);
      if (c.state === "waiting") expect(`${c.title} ${c.body} ${c.recovery.join(" ")}`).not.toMatch(/popup (is|was) (open|visible|hidden)|we (can )?(see|detect)/i);
    }
  });

  it("has distinct rejected, error and success states", () => {
    const rejected = failureCopy("approve", { kind: "rejected", title: "t", detail: "d" });
    const error = failureCopy("approve", { kind: "reverted", title: "Allowance is too low", detail: "Approve first." });
    const ok = successCopy("approve", "880 NTU allowed");
    expect([rejected.state, error.state, ok.state]).toEqual(["rejected", "error", "success"]);
    expect(rejected.title).toMatch(/rejected the approval/);
    expect(error.title).toBe("Allowance is too low");
    expect(ok.body).toBe("880 NTU allowed");
  });

  it("words rejection per request kind", () => {
    expect(failureCopy("connect", { kind: "rejected", title: "", detail: "" }).title).toMatch(/connection/);
    expect(failureCopy("order", { kind: "rejected", title: "", detail: "" }).title).toMatch(/order/);
    expect(failureCopy("switch", { kind: "rejected", title: "", detail: "" }).title).toMatch(/network switch/);
  });
});
