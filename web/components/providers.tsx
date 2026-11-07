"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { anvil } from "@/lib/chains";
import { RpcHealthProvider } from "@/hooks/use-rpc-health";
import { wagmiConfig } from "@/lib/wagmi";

const rainbowTheme = darkTheme({
  accentColor: "#7c5cf2",
  accentColorForeground: "#ffffff",
  borderRadius: "large",
  overlayBlur: "small",
  fontStack: "system",
});

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; created lazily so server renders never share it.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 4_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} initialChain={anvil} modalSize="compact" appInfo={{ appName: "SC4053 DEX" }}>
          <TooltipProvider delay={250}>
            <RpcHealthProvider>{children}</RpcHealthProvider>
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
