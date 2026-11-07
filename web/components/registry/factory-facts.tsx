import { AddressChip } from "@/components/data/address-chip";
import { Panel } from "@/components/dashboard/panel";

/** What the registry contract is and the rules it enforces, with its real address. */
export function FactoryFacts({ title, address, facts }: { title: string; address: string; facts: { term: string; detail: string }[] }) {
  return (
    <Panel title={title} className="mt-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div>
          <p className="text-[0.6875rem] text-muted-foreground">Contract on this chain</p>
          <AddressChip address={address} className="mt-1 text-[0.875rem]" />
          <p className="mt-3 max-w-[36ch] text-[0.75rem] leading-relaxed text-muted-foreground">
            Permissionless, with no owner or admin key. It holds no tokens; traders deal with each market directly.
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.term} className="glass-inset rounded-[0.875rem] px-3.5 py-3">
              <dt className="text-[0.8125rem] font-semibold">{f.term}</dt>
              <dd className="mt-1 text-[0.75rem] leading-relaxed text-muted-foreground">{f.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}
