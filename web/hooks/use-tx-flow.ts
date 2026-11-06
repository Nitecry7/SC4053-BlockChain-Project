"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { setOrderBusy } from "@/lib/busy-store";
import { anvil } from "@/lib/chains";
import { flowReducer, initialFlowState, isBusy, type FlowContext, type FlowEvent, type FlowState } from "@/lib/order-flow";
import { isTransactionRefresh } from "@/lib/query-scope";
import type { viemDeps } from "@/lib/order-runner";

export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** The wallet's `writeContract`, bound to wagmi. */
export type WriteFn = Parameters<typeof viemDeps>[1];

/** Everything a launched operation needs: its identity, where to report, and how to talk to the chain and the wallet. */
export type LaunchArgs<R> = {
  ctx: FlowContext;
  attempt: number;
  send: (event: FlowEvent<R>) => void;
  isCurrent: () => boolean;
  publicClient: PublicClient;
  write: WriteFn;
};

const sameContext = (a: FlowContext | undefined, b: FlowContext) =>
  a !== undefined && a.account.toLowerCase() === b.account.toLowerCase() && a.chainId === b.chainId && a.market.toLowerCase() === b.market.toLowerCase();

/**
 * The lifecycle core shared by orders, approvals, token creation and market listing: it applies the pure reducer
 * (`lib/order-flow`) synchronously through a ref, so a second click can never start a second request, even before React
 * re-renders. A "Try again", or a change of account, network or `target`, abandons the running attempt: its late results
 * are ignored and it sends no further wallet request. `target` is the contract the flow is about (a market, or a
 * factory) and is part of the context, so switching it ends whatever was in flight.
 */
export function useTxFlow<R>(target: Address | undefined) {
  const account = useAccount();
  const publicClient = usePublicClient({ chainId: anvil.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const stateRef = useRef<FlowState<R>>(initialFlowState<R>());
  const [state, setState] = useState<FlowState<R>>(() => initialFlowState<R>());
  const attemptRef = useRef(0);

  const send = useCallback((event: FlowEvent<R>) => {
    stateRef.current = flowReducer(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const ctx: FlowContext = useMemo(
    () => ({ account: account.address ?? ZERO, chainId: account.chainId ?? 0, market: target ?? ZERO }),
    [account.address, account.chainId, target],
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

  // A different account, network or target ends whatever was in flight (it can no longer be attributed correctly).
  useEffect(() => {
    ctxRef.current = ctx;
    send({ type: "CONTEXT_CHANGED", ctx });
  }, [ctx, send]);

  const start = useCallback(
    (kind: "approve" | "order", launch: (args: LaunchArgs<R>) => Promise<void>) => {
      const c = ctxRef.current;
      if (!publicClient || !target || c.account === ZERO || c.market === ZERO || c.chainId !== anvil.id) return;
      if (stateRef.current.phase !== "idle") return; // duplicate click while anything is in flight
      const attempt = ++attemptRef.current;
      send({ type: kind === "approve" ? "START_APPROVAL" : "START_ORDER", attempt, ctx: c });
      const write: WriteFn = (req) =>
        writeContractAsync({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, account: req.account, chainId: req.chainId } as never);
      const isCurrent = () => attemptRef.current === attempt && sameContext(ctxRef.current, c);
      void launch({ ctx: c, attempt, send, isCurrent, publicClient: publicClient as PublicClient, write });
    },
    [publicClient, target, send, writeContractAsync],
  );

  const reset = useCallback(() => {
    send({ type: "RESET", attempt: ++attemptRef.current });
  }, [send]);

  // After an approval or a confirmed operation, refresh every on-chain read right away (the block watcher would do it
  // within a few seconds): balances, allowances, books, registries and the user's orders.
  // A failure after submission (replaced, cancelled, reset, timeout) also re-reads: the chain may differ from what was on screen.
  const refreshKey = `${state.phase === "done" ? "done" : ""}:${state.approvedAmount ?? ""}:${state.phase === "failed" ? (state.failure?.hash ?? "") : ""}`;
  useEffect(() => {
    if (refreshKey !== "::") void queryClient.invalidateQueries({ predicate: isTransactionRefresh });
  }, [refreshKey, queryClient]);

  const dismissAbandoned = useCallback(() => send({ type: "DISMISS_ABANDONED" }), [send]);

  return { state, ctx, start, reset, dismissAbandoned, busy: isBusy(state.phase) };
}
