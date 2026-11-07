import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SC4053 DEX", template: "%s · SC4053 DEX" },
  description: "A non-custodial limit order book exchange on a local Anvil chain.",
};

export const viewport: Viewport = { themeColor: "#080d19", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${plexMono.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
