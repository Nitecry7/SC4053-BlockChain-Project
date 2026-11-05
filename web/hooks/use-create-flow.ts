"use client";

import type { Address } from "viem";
import { marketSpec, runCreate, tokenSpec, viemCreateDeps, type MarketOutcome, type TokenOutcome } from "@/lib/create-runner";
import type { ValidToken } from "@/lib/create-input";
import { useTxFlow } from "./use-tx-flow";

/** Token issuance: the shared lifecycle core bound to `TokenFactory.createToken`. */
export function useTokenCreateFlow(factory: Address) {
  const core = useTxFlow<TokenOutcome>(factory);
  const create = (token: Pick<ValidToken, "name" | "symbol" | "supply">) =>
    core.start("order", ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      runCreate(viemCreateDeps(publicClient, write), tokenSpec({ factory, creator: ctx.account, token }), { ctx, attempt }, send, isCurrent),
    );
  return { state: core.state, ctx: core.ctx, create, reset: core.reset, dismissAbandoned: core.dismissAbandoned, busy: core.busy };
}

/** Market listing: the shared lifecycle core bound to `MarketFactory.createMarket`. */
export function useMarketCreateFlow(factory: Address) {
  const core = useTxFlow<MarketOutcome>(factory);
  const create = (pair: { base: Address; quote: Address }) =>
    core.start("order", ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      runCreate(viemCreateDeps(publicClient, write), marketSpec({ factory, creator: ctx.account, ...pair }), { ctx, attempt }, send, isCurrent),
    );
  return { state: core.state, ctx: core.ctx, create, reset: core.reset, dismissAbandoned: core.dismissAbandoned, busy: core.busy };
}
