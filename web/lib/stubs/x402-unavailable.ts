/**
 * Build-time stand-in for the `@x402/*` packages.
 *
 * They are OPTIONAL peer dependencies of `@coinbase/cdp-sdk` (x402 payment signing), which reaches this app only
 * transitively: wagmi -> @wagmi/connectors -> @base-org/account -> @coinbase/cdp-sdk. The SDK loads them lazily, but
 * Turbopack still resolves every reference at build time and fails when they are absent. SC4053 DEX never uses x402
 * or the Base Account connector, so rather than installing an unused payment SDK, next.config.ts aliases exactly the
 * specifiers that break the build to this module. Every export throws if it is ever actually called; nothing throws
 * when the module is merely loaded.
 */
const MESSAGE = "x402 payment signing is not available in SC4053 DEX: the optional @x402 packages are intentionally not installed.";

function unavailable(): never {
  throw new Error(MESSAGE);
}

export class x402Client {
  constructor() {
    unavailable();
  }
}
export class ExactEvmScheme {
  constructor() {
    unavailable();
  }
}
export class UptoEvmScheme {
  constructor() {
    unavailable();
  }
}
export class ExactSvmScheme {
  constructor() {
    unavailable();
  }
}
export const toClientEvmSigner = unavailable;
export const registerExactEvmScheme = unavailable;
export const registerExactSvmScheme = unavailable;
export const X402_UNAVAILABLE_MESSAGE = MESSAGE;
