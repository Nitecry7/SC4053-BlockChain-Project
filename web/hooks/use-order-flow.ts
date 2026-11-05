"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { anvil } from "@/lib/chains";
import { flowReducer, initialFlowState, isBusy, type FlowContext, type FlowEvent, type FlowState } from "@/lib/order-flow";
import type { ValidOrder } from "@/lib/order-input";
import { setOrderBusy } from "@/lib/busy-store";
import { runApproval, runOrder, viemDeps, type OrderOutcome, type PairInfo } from "@/lib/order-runner";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const sameContext = (a: FlowContext | undefined, b: FlowContext) =>
  a !== undefined && a.account.toLowerCase() === b.account.toLowerCase() && a.chainId === b.chainId && a.market.toLowerCase() === b.market.toLowerCase();

/**
 * Wires the pure order lifecycle (`lib/order-flow`, `lib/order-runner`) to wagmi and viem.
 *
 * The reducer is applied synchronously through a ref, so a second click can never start a second request, even before
 * React re-renders. A "Try again" or a change of account, network or market abandons the running attempt: its late
 * results are ignored and it sends no further wallet request.
 */
export function useOrderFlow(pair: PairInfo | undefined) {
  const account = useAccount();
  const publicClient = usePublicClient({ chainId: anvil.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const stateRef = useRef<FlowState<OrderOutcome>>(initialFlowState<OrderOutcome>());
  const [state, setState] = useState<FlowState<OrderOutcome>>(() => initialFlowState<OrderOutcome>());
  const attemptRef = useRef(0);

  const send = useCallback((event: FlowEvent<OrderOutcome>) => {
    stateRef.current = flowReducer(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const ctx: FlowContext = useMemo(
    () => ({ account: account.address ?? ZERO, chainId: account.chainId ?? 0, market: pair?.market ?? ZERO }),
    [account.address, account.chainId, pair?.market],
  );
  const ctxRef = useRef(ctx);

  // Unmounting (leaving the page, switching market) abandons the running attempt: it makes no further wallet request.
  const abandonAttempt = useCallback(() => {
    attemptRef.current += 1;
  }, []);
  useEffect(
    () => () => {
      abandonAttempt();
      setOrderBusy(false);
    },
    [abandonAttempt],
  );
  const busyNow = isBusy(state.phase);
  useEffect(() => {
    setOrderBusy(busyNow);
  }, [busyNow]);

  // A different account, network or market ends whatever was in flight (it can no longer be attributed correctly).
  useEffect(() => {
    ctxRef.current = ctx;
    send({ type: "CONTEXT_CHANGED", ctx });
  }, [ctx, send]);

  const start = useCallback(
    (kind: "approve" | "order", order: ValidOrder) => {
      const c = ctxRef.current;
      if (!publicClient || !pair || c.account === ZERO || c.market === ZERO || c.chainId !== anvil.id) return;
      if (pair.baseToken === ZERO || pair.quoteToken === ZERO) return; // the market's tokens have not been read yet
      if (stateRef.current.phase !== "idle") return; // duplicate click while anything is in flight
      const attempt = ++attemptRef.current;
      send({ type: kind === "approve" ? "START_APPROVAL" : "START_ORDER", attempt, ctx: c });

      const deps = viemDeps(publicClient as PublicClient, (req) =>
        writeContractAsync({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, account: req.account, chainId: req.chainId } as never),
      );
      const isCurrent = () => attemptRef.current === attempt && sameContext(ctxRef.current, c);
      void (kind === "approve" ? runApproval : runOrder)(deps, { ctx: c, pair, order, attempt }, send, isCurrent);
    },
    [publicClient, pair, send, writeContractAsync],
  );

  const reset = useCallback(() => {
    send({ type: "RESET", attempt: ++attemptRef.current });
  }, [send]);

  // After an approval or an order is confirmed, refresh balances, allowance, the book and My Orders right away
  // (the block watcher would do it within a few seconds).
  const refreshKey = `${state.phase === "done" ? "done" : ""}:${state.approvedAmount ?? ""}`;
  useEffect(() => {
    if (refreshKey !== ":") void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "blockNumber" });
  }, [refreshKey, queryClient]);

  const dismissAbandoned = useCallback(() => send({ type: "DISMISS_ABANDONED" }), [send]);

  return { state, ctx, dismissAbandoned, startApproval: (o: ValidOrder) => start("approve", o), startOrder: (o: ValidOrder) => start("order", o), reset, busy: isBusy(state.phase) };
}
