import type { NextConfig } from "next";

// Minimal, safe response headers. A strict Content-Security-Policy is deferred: wallet libraries need relay and RPC
// connections that would have to be enumerated first (see docs/FRONTEND.md).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Optional @x402 peers of @coinbase/cdp-sdk (reached via wagmi's connectors) that this app never uses. Only the
// specifiers that actually break the build are aliased; see lib/stubs/x402-unavailable.ts for the full reasoning.
const X402_STUB = "./lib/stubs/x402-unavailable.ts";
const x402Aliases = Object.fromEntries(
  ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"].map((m) => [m, X402_STUB]),
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { resolveAlias: x402Aliases },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
