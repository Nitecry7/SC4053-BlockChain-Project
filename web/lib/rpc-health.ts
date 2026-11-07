import type { Hex } from "viem";
import type { ChainAnchor } from "@/lib/chain-reset";

/**
 * Is the RPC endpoint answering, and, after an outage, is it still the chain the page was reading?
 *
 *  - `unknown`    no probe has finished yet. Data reads run (a normal first load is not delayed), transactions do not.
 *  - `online`     the last probe succeeded and any recovery has been verified. The only state that allows transactions.
 *  - `offline`    probes failed (twice in a row, or the node never answered). Data on screen is last known, not current.
 *  - `verifying`  the node answers again; its chain identity and the deployment are being re-read (P2-7 `assessChain`).
 *  - `refreshing` the chain is verified; the on-screen reads are being re-fetched. Transactions stay disabled.
 *  - `unverified` the node answers but the check failed or timed out. Treated like `offline`: nothing is claimed.
 *
 * A successful probe proves reachability only. It is never evidence that the chain is the same, that blocks are being
 * produced, or that any contract is valid.
 */
export type RpcHealthState = "unknown" | "online" | "offline" | "verifying" | "refreshing" | "unverified";

export type RpcHealthSnapshot = {
  state: RpcHealthState;
  /** Wall-clock ms of the last successful probe. Undefined if the node has never answered. */
  lastOkAt: number | undefined;
  /** True once some read has succeeded, so there can be "last known" data on screen. */
  everRead: boolean;
  /** Set when a recovery verification proved the chain was replaced; shown by the chain-reset notice. */
  resetEvidence: string[] | undefined;
};

export type Head = { number: bigint; hash: Hex };

export type RpcHealthDeps = {
  /** The latest block (number and hash in one request). Must reject on any transport or JSON-RPC failure. */
  probe(): Promise<Head>;
  /** The chain's genesis hash. Read once, on the first success. */
  genesisHash(): Promise<Hex>;
  /**
   * Re-read what must be true before transactions return: chain identity against `anchor` (P2-7 `assessChain`) and the
   * deployment's contracts and market. Resolves with the verdict, rejects if any read fails or the verdict is unknown.
   */
  verify(anchor: ChainAnchor | undefined, head: Head): Promise<{ reset: boolean; evidence: string[]; anchor: ChainAnchor }>;
  /** Invalidates the caches for the verdict (everything on a reset, the per-block set otherwise). */
  invalidate(reset: boolean): void;
  /** Resolves when the active reads have been re-fetched successfully; rejects on error or timeout. */
  settle(): Promise<void>;
  now(): number;
  onChange(snapshot: RpcHealthSnapshot): void;
};

export type RpcHealthOptions = {
  intervalMs?: number;
  maxBackoffMs?: number;
  probeTimeoutMs?: number;
  verifyTimeoutMs?: number;
  /** Consecutive failed probes before `online` becomes `offline`. */
  failuresToOffline?: number;
};

export const RPC_HEALTH_DEFAULTS = {
  intervalMs: 5_000,
  maxBackoffMs: 10_000,
  probeTimeoutMs: 3_000,
  verifyTimeoutMs: 10_000,
  failuresToOffline: 2,
} as const;

/** Rejects with `label` if `p` does not settle within `ms`. The underlying request is not cancelled. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * One probe at a time, scheduled after the previous one finishes (never overlapping, never a fixed-rate interval that
 * could pile up behind a slow node). While the node is not healthy the delay grows to `maxBackoffMs`.
 */
export function createRpcHealthMonitor(deps: RpcHealthDeps, options: RpcHealthOptions = {}) {
  const o = { ...RPC_HEALTH_DEFAULTS, ...options };
  let snap: RpcHealthSnapshot = { state: "unknown", lastOkAt: undefined, everRead: false, resetEvidence: undefined };
  let anchor: ChainAnchor | undefined;
  let failures = 0;
  let unhealthyRounds = 0;
  let anchorFailures = 0;
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (patch: Partial<RpcHealthSnapshot>) => {
    const next = { ...snap, ...patch };
    // `lastOkAt` moves on every probe; it is kept current but does not re-render consumers by itself.
    const visible = next.state !== snap.state || next.everRead !== snap.everRead || next.resetEvidence !== snap.resetEvidence;
    snap = next;
    if (visible) deps.onChange(snap);
  };

  const schedule = () => {
    if (stopped) return;
    const healthy = snap.state === "online" || snap.state === "unknown";
    const delay = healthy ? o.intervalMs : Math.min(o.intervalMs * 1.5 ** unhealthyRounds, o.maxBackoffMs);
    timer = setTimeout(() => void tick(), delay);
  };

  const toOffline = () => {
    unhealthyRounds += 1;
    set({ state: "offline" });
  };

  const tick = async () => {
    if (stopped) return;
    let head: Head;
    try {
      head = await withDeadline(deps.probe(), o.probeTimeoutMs, "probe");
    } catch {
      if (stopped) return;
      failures += 1;
      if (snap.state === "online" || snap.state === "unknown") {
        // Nothing has been read yet (`unknown`): no data can flicker, so one failed probe is enough.
        if (failures >= (snap.state === "unknown" ? 1 : o.failuresToOffline)) toOffline();
      } else if (snap.state !== "offline") {
        toOffline(); // `unverified` and friends: the node is not even answering, no hysteresis needed
      } else {
        unhealthyRounds += 1;
      }
      schedule();
      return;
    }
    if (stopped) return;
    failures = 0;
    const lastOkAt = deps.now();

    if (snap.state === "online" || snap.state === "unknown") {
      if (!anchor) {
        try {
          anchor = { genesisHash: await withDeadline(deps.genesisHash(), o.probeTimeoutMs, "genesis"), blockNumber: head.number, blockHash: head.hash };
        } catch {
          // The probe worked but the chain's identity could not be anchored. Reads still run, transactions do not
          // (`unknown` never allows them). After a second failure say so instead of waiting silently.
          anchorFailures += 1;
          if (anchorFailures >= 2) set({ state: "unverified" });
          schedule();
          return;
        }
        anchorFailures = 0;
        if (stopped) return;
      } else if (head.number > anchor.blockNumber) {
        // Only move forward. A same-height head with another hash is left to the recovery check and the chain watcher.
        anchor = { ...anchor, blockNumber: head.number, blockHash: head.hash };
      }
      unhealthyRounds = 0;
      set({ state: "online", lastOkAt, everRead: true });
      schedule();
      return;
    }

    // The node answers again after an outage (or after a failed verification): verify before anything is enabled.
    set({ state: "verifying", lastOkAt });
    try {
      const result = await withDeadline(deps.verify(anchor, head), o.verifyTimeoutMs, "verification");
      if (stopped) return;
      anchor = result.anchor;
      deps.invalidate(result.reset);
      set({ state: "refreshing", resetEvidence: result.reset ? result.evidence : snap.resetEvidence });
      await withDeadline(deps.settle(), o.verifyTimeoutMs, "refresh");
      if (stopped) return;
      unhealthyRounds = 0;
      set({ state: "online", everRead: true });
    } catch {
      if (stopped) return;
      unhealthyRounds += 1;
      set({ state: "unverified" });
    }
    schedule();
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    snapshot: () => snap,
    /** Clears the shown reset evidence (the user dismissed the notice). */
    dismissReset() {
      set({ resetEvidence: undefined });
    },
  };
}

/** Whether data reads should run: false only when the node is known to be unreachable or unverified. */
export const dataReadsAllowed = (s: RpcHealthState) => s === "unknown" || s === "online" || s === "refreshing";
/**
 * Whether transactions may be offered: only once the chain's identity is anchored (first load) or re-verified (after an
 * outage) and the reads re-fetched. `unknown` is NOT enough: until the first probe and the genesis read have succeeded
 * there is nothing to verify against, so the ticket shows "Verifying chain…" for that moment (P2-8A.2 final review).
 */
export const transactionsAllowed = (s: RpcHealthState) => s === "online";
