import { defineChain } from "viem";
import { foundry } from "viem/chains";
import { resolveRpcUrl } from "./config";

export const RPC_URL = resolveRpcUrl(process.env.NEXT_PUBLIC_RPC_URL);

/** Local Anvil (chain 31337). viem's `foundry` chain defines no Multicall3, so wagmi reads contracts one by one. */
export const anvil = defineChain({
  ...foundry,
  name: "Anvil (local)",
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});
