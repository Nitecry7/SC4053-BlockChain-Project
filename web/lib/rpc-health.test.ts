import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessChain, type ChainAnchor } from "@/lib/chain-reset";
import { createRpcHealthMonitor, dataReadsAllowed, transactionsAllowed, type Head, type RpcHealthDeps, type RpcHealthSnapshot } from "@/lib/rpc-health";

// P2-8A.2: the liveness state machine on fake timers and a scripted node. No network.
const H = (n: number, tag = "a") => ({ number: BigInt(n), hash: ("0x" + tag.repeat(64).slice(0, 64)) as `0x${string}` });
const GENESIS = ("0x" + "9".repeat(64)) as `0x${string}`;

type Script = {
  head: Head | Error;
  /** Hash at the anchor height as the "node" reports it; used by the verify stub through the real assessChain. */
  hashAtAnchor?: (n: bigint) => `0x${string}` | null;
  genesis?: `0x${string}`;
  settle?: "ok" | "fail";
  readsFail?: boolean;
};

function setup() {
  const script: Script = { head: H(10) };
  const log = { probes: 0, verifies: 0, invalidations: [] as boolean[], states: [] as string[], overlap: 0, settles: 0 };
  let inflight = 0;
  const deps: RpcHealthDeps = {
    async probe() {
      log.probes++;
      inflight++;
      if (inflight > 1) log.overlap++;
      try {
        await Promise.resolve();
        if (script.head instanceof Error) throw script.head;
        return script.head;
      } finally {
        inflight--;
      }
    },
    async genesisHash() {
      return script.genesis ?? GENESIS;
    },
    // The same shape as the real verify in the hook: assessChain decides, reads must succeed.
    async verify(anchor: ChainAnchor | undefined, head: Head) {
      log.verifies++;
      if (script.readsFail) throw new Error("read failed");
      const genesisHash = script.genesis ?? GENESIS;
      if (!anchor) return { reset: false, evidence: [], anchor: { genesisHash, blockNumber: head.number, blockHash: head.hash } };
      const hashAtAnchor = script.hashAtAnchor ? script.hashAtAnchor(anchor.blockNumber) : anchor.blockHash;
      const v = assessChain(anchor, { genesisHash, latestNumber: head.number, hashAtAnchor });
      if (v.verdict === "unknown") throw new Error("unknown");
      return { reset: v.verdict === "reset", evidence: v.evidence, anchor: { genesisHash, blockNumber: head.number, blockHash: head.hash } };
    },
    invalidate(reset) {
      log.invalidations.push(reset);
    },
    async settle() {
      log.settles++;
      if (script.settle === "fail") throw new Error("still failing");
    },
    now: () => Date.now(),
    onChange: (s: RpcHealthSnapshot) => log.states.push(s.state),
  };
  const monitor = createRpcHealthMonitor(deps);
  return { script, log, monitor };
}

const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("rpc health: reachability", () => {
  it("a healthy node with no new block stays online and never invalidates anything", async () => {
    const { monitor, log } = setup();
    monitor.start();
    await run(60_000);
    expect(monitor.snapshot().state).toBe("online");
    expect(log.invalidations).toEqual([]);
    expect(log.states).toEqual(["online"]);
    expect(log.probes).toBeLessThanOrEqual(13); // 5 s interval: 1 immediate + 12 in a minute
    expect(log.overlap).toBe(0);
    monitor.stop();
  });

  it("one failed probe does not flip an online page offline (no flicker); two in a row do", async () => {
    const { monitor, script, log } = setup();
    monitor.start();
    await run(1_000);
    script.head = new Error("econnrefused");
    await run(5_000); // first failure
    expect(monitor.snapshot().state).toBe("online");
    script.head = H(11);
    await run(5_000); // recovered before the second failure
    expect(monitor.snapshot().state).toBe("online");
    expect(log.states).toEqual(["online"]);
    script.head = new Error("econnrefused");
    await run(10_500); // two failures in a row
    expect(monitor.snapshot().state).toBe("offline");
    monitor.stop();
  });

  it("alternating success and failure never reaches offline", async () => {
    const { monitor, script, log } = setup();
    monitor.start();
    await run(1_000); // healthy first
    for (let i = 0; i < 8; i++) {
      script.head = i % 2 ? H(10 + i) : new Error("flap");
      await run(5_000);
    }
    expect(log.states).not.toContain("offline");
    monitor.stop();
  });

  it("an initial-load failure (never read) is reported after the first failed probe, without 'last known' data", async () => {
    const { monitor, script } = setup();
    script.head = new Error("econnrefused");
    monitor.start();
    await run(100);
    const s = monitor.snapshot();
    expect(s.state).toBe("offline");
    expect(s.everRead).toBe(false);
    expect(s.lastOkAt).toBeUndefined();
    monitor.stop();
  });

  it("a hung probe times out, counts as a failure and does not overlap the next one", async () => {
    const { monitor, log } = setup();
    let release: (h: Head) => void = () => {};
    const never = new Promise<Head>((r) => (release = r));
    const deps = {
      probe: () => never,
      genesisHash: async () => GENESIS,
      verify: async () => {
        throw new Error("x");
      },
      invalidate: () => {},
      settle: async () => {},
      now: () => Date.now(),
      onChange: (s: RpcHealthSnapshot) => log.states.push(s.state),
    } satisfies RpcHealthDeps;
    const m = createRpcHealthMonitor(deps);
    m.start();
    await run(3_100);
    expect(m.snapshot().state).toBe("offline"); // unknown + one timeout
    release(H(1));
    m.stop();
    monitor.stop();
  });

  it("while offline the probe backs off to a cap (no request storm)", async () => {
    const { monitor, script, log } = setup();
    monitor.start();
    await run(1_000);
    script.head = new Error("down");
    const before = log.probes;
    await run(60_000);
    expect(log.probes - before).toBeLessThanOrEqual(10); // 60 s at 5-10 s spacing
    expect(log.overlap).toBe(0);
    monitor.stop();
  });
});

describe("rpc health: first load", () => {
  it("a node that answers but whose genesis cannot be read never reaches online; it becomes unverified after two tries, then recovers", async () => {
    const { monitor, log } = setup();
    let genesisWorks = false;
    const deps = {
      probe: async () => H(10),
      genesisHash: async () => {
        if (!genesisWorks) throw new Error("genesis unreadable");
        return GENESIS;
      },
      verify: async (_a: ChainAnchor | undefined, head: Head) => ({ reset: false, evidence: [], anchor: { genesisHash: GENESIS, blockNumber: head.number, blockHash: head.hash } }),
      invalidate: () => {},
      settle: async () => {},
      now: () => Date.now(),
      onChange: (s: RpcHealthSnapshot) => log.states.push(s.state),
    } satisfies RpcHealthDeps;
    const m = createRpcHealthMonitor(deps);
    m.start();
    await run(1_000);
    expect(m.snapshot().state).toBe("unknown");
    expect(transactionsAllowed(m.snapshot().state)).toBe(false);
    await run(6_000);
    expect(m.snapshot().state).toBe("unverified");
    expect(log.states).not.toContain("online");
    genesisWorks = true;
    await run(25_000);
    expect(m.snapshot().state).toBe("online");
    m.stop();
    monitor.stop();
  });
});

describe("rpc health: recovery is verified before transactions return", () => {
  async function outage(script: Script, monitor: ReturnType<typeof createRpcHealthMonitor>) {
    monitor.start();
    await run(1_000);
    script.head = new Error("down");
    await run(25_000);
    expect(monitor.snapshot().state).toBe("offline");
  }

  it("unchanged chain: verifying, dynamic refresh only, then online", async () => {
    const { monitor, script, log } = setup();
    await outage(script, monitor);
    script.head = H(10); // same head, same hash
    await run(12_000);
    expect(log.states).toEqual(expect.arrayContaining(["offline", "verifying", "refreshing", "online"]));
    expect(log.states.indexOf("verifying")).toBeLessThan(log.states.indexOf("refreshing"));
    expect(log.invalidations).toEqual([false]);
    expect(monitor.snapshot().state).toBe("online");
    expect(monitor.snapshot().resetEvidence).toBeUndefined();
    monitor.stop();
  });

  it("fresh chain (head below the anchor): reset, full invalidation, evidence recorded", async () => {
    const { monitor, script, log } = setup();
    monitor.start();
    script.head = H(10);
    await run(6_000);
    script.head = new Error("down");
    await run(25_000);
    script.head = H(2, "c"); // new chain, lower head
    script.hashAtAnchor = () => null; // block 10 no longer exists
    script.genesis = ("0x" + "8".repeat(64)) as `0x${string}`;
    await run(12_000);
    expect(log.invalidations).toEqual([true]);
    expect(monitor.snapshot().state).toBe("online");
    expect(monitor.snapshot().resetEvidence?.length).toBeGreaterThan(0);
    monitor.stop();
  });

  it("same block height but a different hash is a reset", async () => {
    const { monitor, script, log } = setup();
    monitor.start();
    await run(6_000);
    script.head = new Error("down");
    await run(25_000);
    script.head = H(10, "d"); // same height, different hash
    script.hashAtAnchor = () => H(10, "d").hash;
    await run(12_000);
    expect(log.invalidations).toEqual([true]);
    expect(monitor.snapshot().resetEvidence?.join(" ")).toMatch(/different hash/);
    monitor.stop();
  });

  it("transactions stay disabled in every state except online", () => {
    for (const s of ["unknown", "offline", "verifying", "refreshing", "unverified"] as const) expect(transactionsAllowed(s)).toBe(false);
    expect(transactionsAllowed("online")).toBe(true);
    expect(dataReadsAllowed("unknown")).toBe(true); // reads still run on first load
    expect(dataReadsAllowed("verifying")).toBe(false);
    expect(dataReadsAllowed("unverified")).toBe(false);
    expect(dataReadsAllowed("refreshing")).toBe(true);
  });

  it("a failed verification read leaves the state unverified, never online", async () => {
    const { monitor, script, log } = setup();
    await outage(script, monitor);
    script.head = H(10);
    script.readsFail = true;
    await run(30_000);
    expect(monitor.snapshot().state).toBe("unverified");
    expect(log.states.slice(log.states.indexOf("verifying"))).not.toContain("online");
    monitor.stop();
  });

  it("reads that never settle (pending/failed queries) keep the state off online", async () => {
    const { monitor, script } = setup();
    await outage(script, monitor);
    script.head = H(10);
    script.settle = "fail";
    await run(30_000);
    expect(monitor.snapshot().state).toBe("unverified");
    monitor.stop();
  });

  it("recovers from unverified once verification succeeds", async () => {
    const { monitor, script } = setup();
    await outage(script, monitor);
    script.head = H(10);
    script.readsFail = true;
    await run(20_000);
    expect(monitor.snapshot().state).toBe("unverified");
    script.readsFail = false;
    await run(20_000);
    expect(monitor.snapshot().state).toBe("online");
    monitor.stop();
  });

  it("the node dying again during verification returns to offline", async () => {
    const { monitor, script } = setup();
    await outage(script, monitor);
    script.head = H(10);
    script.readsFail = true;
    await run(12_000);
    expect(monitor.snapshot().state).toBe("unverified");
    script.head = new Error("down again");
    await run(25_000);
    expect(monitor.snapshot().state).toBe("offline");
    monitor.stop();
  });

  it("an outage on a page that never read anything verifies without claiming a reset", async () => {
    const { monitor, script, log } = setup();
    script.head = new Error("down");
    monitor.start();
    await run(100);
    expect(monitor.snapshot().state).toBe("offline");
    script.head = H(5);
    await run(12_000);
    expect(monitor.snapshot().state).toBe("online");
    expect(log.invalidations).toEqual([false]);
    expect(monitor.snapshot().resetEvidence).toBeUndefined();
    monitor.stop();
  });

  it("dismissing the reset evidence clears it exactly once", async () => {
    const { monitor, script } = setup();
    monitor.start();
    await run(6_000);
    script.head = new Error("down");
    await run(25_000);
    script.head = H(10, "d");
    script.hashAtAnchor = () => H(10, "d").hash;
    await run(12_000);
    expect(monitor.snapshot().resetEvidence).toBeDefined();
    monitor.dismissReset();
    expect(monitor.snapshot().resetEvidence).toBeUndefined();
    monitor.stop();
  });
});
