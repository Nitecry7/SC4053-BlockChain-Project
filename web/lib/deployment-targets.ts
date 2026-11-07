import type { Address } from "viem";
import { anvil } from "@/lib/chains";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";

const D = PRIMARY_DEPLOYMENT;

/** The contracts whose code proves the exported deployment exists. Shared by the deployment check and recovery verification. */
export const DEPLOYMENT_TARGETS: readonly { name: string; address: Address }[] = [
  { name: "TokenFactory", address: D.tokenFactory as Address },
  { name: "MarketFactory", address: D.marketFactory as Address },
  { name: `${D.baseToken.symbol}/${D.quoteToken.symbol} market`, address: D.market as Address },
  { name: D.baseToken.symbol, address: D.baseToken.address as Address },
  { name: D.quoteToken.symbol, address: D.quoteToken.address as Address },
];

/** Query key of the contract-code reads (one query for all targets). */
export const DEPLOYMENT_CODE_KEY = ["deployment-code", anvil.id, ...DEPLOYMENT_TARGETS.map((t) => t.address)] as const;
