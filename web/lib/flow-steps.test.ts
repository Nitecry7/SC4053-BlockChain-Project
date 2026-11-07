import { describe, expect, it } from "vitest";
import { flowSteps } from "./flow-steps";

const statuses = (s: ReturnType<typeof flowSteps>) => s.map((x) => x.status);

describe("flowSteps", () => {
  it("shows nothing while idle or stale", () => {
    expect(flowSteps("order", "idle")).toEqual([]);
    expect(flowSteps("order", "stale")).toEqual([]);
  });

  it("walks the order lifecycle: simulate, wallet, block, receipt", () => {
    expect(statuses(flowSteps("order", "simulating"))).toEqual(["active", "todo", "todo", "todo"]);
    expect(statuses(flowSteps("order", "order-wallet"))).toEqual(["done", "active", "todo", "todo"]);
    expect(statuses(flowSteps("order", "order-confirming"))).toEqual(["done", "done", "active", "todo"]);
    expect(statuses(flowSteps("order", "reconciling"))).toEqual(["done", "done", "done", "active"]);
    expect(statuses(flowSteps("order", "done"))).toEqual(["done", "done", "done", "done"]);
  });

  it("marks the step that failed and leaves earlier steps done", () => {
    expect(statuses(flowSteps("order", "failed", "simulating"))).toEqual(["failed", "todo", "todo", "todo"]);
    expect(statuses(flowSteps("order", "failed", "order-wallet"))).toEqual(["done", "failed", "todo", "todo"]);
    expect(statuses(flowSteps("order", "failed", "order-confirming"))).toEqual(["done", "done", "failed", "todo"]);
    expect(statuses(flowSteps("order", "failed", "reconciling"))).toEqual(["done", "done", "done", "failed"]);
  });

  it("an unknown failing phase shows no steps rather than inventing one", () => {
    expect(flowSteps("order", "failed", undefined)).toEqual([]);
    expect(flowSteps("order", "failed", "idle")).toEqual([]);
  });

  it("walks the approval lifecycle", () => {
    expect(statuses(flowSteps("approval", "approve-wallet"))).toEqual(["active", "todo", "todo"]);
    expect(statuses(flowSteps("approval", "approve-confirming"))).toEqual(["done", "active", "todo"]);
    expect(statuses(flowSteps("approval", "failed", "approve-wallet"))).toEqual(["failed", "todo", "todo"]);
  });
});
