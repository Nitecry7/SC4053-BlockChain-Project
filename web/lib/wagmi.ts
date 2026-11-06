import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { RPC_URL, anvil } from "./chains";
import { resolveWalletConnectProjectId } from "./config";

export const WALLETCONNECT_PROJECT_ID = resolveWalletConnectProjectId(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

/**
 * Without a WalletConnect Cloud project id, only the injected browser wallet is offered (MetaMask in the browser).
 * RainbowKit's MetaMask entry falls back to WalletConnect when no extension is present, and that path throws without
 * an id, so it is registered only when an id is configured. No placeholder id is ever used.
 */
export const WALLETCONNECT_ENABLED = WALLETCONNECT_PROJECT_ID !== "";

const connectors = connectorsForWallets(
  [{ groupName: "Browser wallet", wallets: WALLETCONNECT_ENABLED ? [metaMaskWallet, injectedWallet] : [injectedWallet] }],
  { appName: "SC4053 DEX", projectId: WALLETCONNECT_PROJECT_ID },
);

export const wagmiConfig = createConfig({
  chains: [anvil],
  connectors,
  transports: { [anvil.id]: http(RPC_URL) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
