"use client";

import { useSearchParams } from "next/navigation";
import type { Address } from "viem";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { EmptyState } from "@/components/data/states";
import { TokenMark } from "@/components/data/token-mark";
import { Panel } from "@/components/dashboard/panel";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { useDashboard } from "@/components/dashboard/use-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokenDetails, useTokenRegistry, useWalletBalances } from "@/hooks/use-dex-data";
import { cn } from "@/lib/utils";
import { DEPLOYMENT } from "@/components/dashboard/use-dashboard";
import { FactoryFacts } from "./factory-facts";
import { matches, PageHeader } from "./page-header";

export function TokensView() {
  const state = useDashboard();
  const query = useSearchParams().get("q") ?? "";
  const reg = useTokenRegistry(state.live);
  const list = (reg.tokens ?? []) as readonly Address[];
  const details = useTokenDetails(list, state.live && list.length > 0);
  const balances = useWalletBalances(state.ready ? state.account.address : undefined, list);
  const rows = (details.data ?? []).map((d, i) => ({ ...d, balance: balances.data?.[i] }));
  const shown = rows.filter((t) => matches(query, t.symbol, t.name, t.address));

  return (
    <>
      <PageHeader title="Tokens" meta={reg.total !== undefined ? `${reg.total.toString()} issued through TokenFactory` : undefined}>
        Every ERC-20 issued through the on-chain TokenFactory. Names and symbols are not unique, so identify a token by its
        address.
      </PageHeader>
      <StatusBanners state={state} />
      {reg.total !== undefined && reg.tokens && reg.total > BigInt(reg.tokens.length) && (
        <p role="status" className="mb-4 text-[0.75rem] text-muted-foreground">
          Showing the first {reg.tokens.length} of {reg.total.toString()} issued tokens (oldest first).
        </p>
      )}
      <Panel title={query ? `Results for “${query}”` : "All tokens"}>
        {!state.live ? (
          <EmptyState title="No live tokens">The registry is read once the deployment is found on this chain.</EmptyState>
        ) : !details.data && list.length !== 0 ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full bg-white/6" />
            <Skeleton className="h-10 w-full bg-white/6" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={query ? "No token matches that search" : "No tokens issued yet"} />
        ) : (
          <table className="w-full text-[0.8125rem]">
            <caption className="sr-only">Issued tokens</caption>
            <thead className="max-md:sr-only">
              <tr className="border-b border-white/[0.09] text-[0.6875rem] text-muted-foreground">
                <th scope="col" className="pb-2 text-left font-medium">Token</th>
                <th scope="col" className="pb-2 text-left font-medium">Address</th>
                <th scope="col" className="pb-2 text-right font-medium">Decimals</th>
                <th scope="col" className="pb-2 text-right font-medium">Total supply</th>
                <th scope="col" className="pb-2 text-right font-medium">Your wallet</th>
                <th scope="col" className="pb-2 pl-3 text-left font-medium">Provenance</th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {shown.map((t) => (
                <tr key={t.address} className="border-b border-white/[0.07] last:border-0 max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-1.5 max-md:py-3">
                  <td className="py-3 pr-3 max-md:col-span-2 max-md:py-0">
                    <span className="flex items-center gap-2.5">
                      <TokenMark symbol={t.symbol} />
                      <span>
                        <span className="block font-semibold">{t.symbol}</span>
                        <span className="block text-[0.6875rem] text-muted-foreground">{t.name}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-3 max-md:col-span-2 max-md:py-0">
                    <AddressChip address={t.address} />
                  </td>
                  <td className="tabular py-3 text-right max-md:py-0 max-md:text-left">
                    <span className="text-muted-foreground md:hidden">Decimals </span>
                    {t.decimals}
                    {t.decimals !== 18 && <span className="ml-1 text-warn">(not tradable: the order book needs 18)</span>}
                  </td>
                  <td className="tabular py-3 text-right max-md:py-0 max-md:text-left">
                    <span className="text-muted-foreground md:hidden">Supply </span>
                    <Amount value={t.totalSupply} decimals={t.decimals} visible={2} showTail={false} />
                  </td>
                  <td className="tabular py-3 text-right max-md:py-0 max-md:text-left">
                    <span className="text-muted-foreground md:hidden">Wallet </span>
                    {t.balance !== undefined ? <Amount value={t.balance} decimals={t.decimals} visible={2} showTail={false} /> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 pl-3 max-md:py-0">
                    <span className={cn("rounded-full px-2.5 py-1 text-[0.6875rem] font-medium", t.issuedByFactory ? "bg-buy/12 text-buy" : "bg-warn/12 text-warn")}>
                      {t.issuedByFactory ? "Issued by TokenFactory" : "Unverified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <FactoryFacts
        title="How tokens are issued"
        address={DEPLOYMENT.tokenFactory}
        facts={[
          { term: "Fixed supply", detail: "The whole supply is minted once, to the issuer. No one can mint more or burn later." },
          { term: "Standard ERC-20", detail: "Plain ERC-20 with 18 decimals: no fees on transfer, no hooks and no owner." },
          { term: "Supply cap", detail: "At most 1,000,000,000 tokens per issue, and never zero." },
          { term: "Provenance, not trust", detail: "Issued by TokenFactory proves where a token came from. Names can repeat, so check the address." },
        ]}
      />
    </>
  );
}
