export const DEFAULT_RPC_URL = "http://127.0.0.1:8545";

/** The local Anvil JSON-RPC URL. Public, not a secret. Only http(s) URLs are accepted. */
export function resolveRpcUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (value === "") return DEFAULT_RPC_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_RPC_URL is not a valid URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_RPC_URL must be an http or https URL");
  }
  return value;
}

/**
 * The WalletConnect Cloud project id, or "" when WalletConnect is not configured. RainbowKit throws on an empty id
 * and silently substitutes its own example project for "YOUR_PROJECT_ID", so that placeholder counts as unset too:
 * the app must never route connections through a project it does not own.
 */
export function resolveWalletConnectProjectId(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (value === "" || value === "YOUR_PROJECT_ID") return "";
  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID must be a 32-character WalletConnect Cloud project id");
  }
  return value;
}
