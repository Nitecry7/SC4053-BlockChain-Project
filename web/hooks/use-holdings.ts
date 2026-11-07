"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { PAIR_TOKENS } from "@/components/dashboard/use-dashboard";
import { useMarketRegistry, useTokenRegistry } from "@/hooks/use-dex-data";
import { anvil } from "@/lib/chains";
import { demoTokenAbi, tokenFactoryAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { buildHoldings, holdingsKey, MAX_HOLDING_TOKENS, mergeTokenAddresses, type HoldingDetail } from "@/lib/holdings";
import { displayText } from "@/lib/safe-text";

const CHAIN_ID = anvil.id;

/**
 * Every discoverable token (TokenFactory registry, tokens of every listed market, the seed pair; deduplicated) and the
 * connected account's balance of each. Each read is allowed to fail on its own, so one hostile or broken token cannot blank
 * the panel; such tokens are counted as unreadable. Token details are read only for tokens with a balance, or for all of
 * them when `includeZero` is on. The result is tied to `account` (and chain): another account never sees these figures.
 */
export function useAllTokenHoldings({ account, enabled, includeZero }: { account: Address | undefined; enabled: boolean; includeZero: boolean }) {
  const tokenReg = useTokenRegistry(enabled);
  const marketReg = useMarketRegistry(enabled);

  const merged = useMemo(
    () => mergeTokenAddresses(tokenReg.tokens, marketReg.markets?.flatMap((m) => [m.base, m.quote]), PAIR_TOKENS),
    [tokenReg.tokens, marketReg.markets],
  );
  const addresses = useMemo(() => merged.slice(0, MAX_HOLDING_TOKENS), [merged]);
  const discovered = tokenReg.tokens !== undefined && marketReg.markets !== undefined;
  const active = enabled && Boolean(account) && discovered && addresses.length > 0;

  const balances = useReadContracts({
    allowFailure: true,
    query: { enabled: active },
    contracts: addresses.map((address) => ({ chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "balanceOf", args: [account as Address] }) as const),
  });
  const balanceList: (bigint | undefined)[] | undefined = balances.data?.map((r) => (r.status === "success" ? (r.result as bigint) : undefined));
  const unreadable = balanceList ? balanceList.filter((b) => b === undefined).length : 0;

  const wanted = useMemo(
    () => (balanceList ? addresses.filter((_, i) => includeZero || (balanceList[i] ?? 0n) > 0n) : []),
    // balanceList is derived from balances.data each render; key on the data itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addresses, balances.data, includeZero],
  );
  const details = useReadContracts({
    allowFailure: true,
    query: { enabled: active && wanted.length > 0 },
    contracts: wanted.flatMap((address) => [
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "name" } as const,
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "symbol" } as const,
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "decimals" } as const,
      { chainId: CHAIN_ID, address: PRIMARY_DEPLOYMENT.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "isFactoryToken", args: [address] } as const,
    ]),
  });
  const detailList: HoldingDetail[] | undefined = details.data
    ? wanted.map((address, i) => {
        const [name, symbol, decimals, factory] = details.data.slice(i * 4, i * 4 + 4);
        return {
          address,
          name: name?.status === "success" ? displayText(name.result as string, 100) : undefined,
          symbol: symbol?.status === "success" ? displayText(symbol.result as string, 32) : undefined,
          decimals: decimals?.status === "success" ? Number(decimals.result) : undefined,
          issuedByFactory: factory?.status === "success" && factory.result === true,
        };
      })
    : undefined;

  const rows = useMemo(
    () => buildHoldings({ addresses, balances: balanceList as bigint[] | undefined, details: detailList, includeZero }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addresses, balances.data, details.data, includeZero],
  );

  return {
    key: holdingsKey(account, CHAIN_ID),
    rows,
    tokenCount: addresses.length,
    unreadable,
    truncated: tokenReg.truncated || marketReg.truncated || merged.length > MAX_HOLDING_TOKENS,
    detailsPending: wanted.length > 0 && details.isPending,
    isPending: !discovered || (active && balances.isPending),
    isError: tokenReg.isError || marketReg.isError || balances.isError,
  };
}
