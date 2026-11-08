import { shortAddress } from "@/components/data/address-chip";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * A review-card row naming the account the request will be sent from. It is the account this site is connected to (the
 * one the wallet is asked to sign with), which is not always the account selected in MetaMask: the information icon says so.
 * If the connected account changes while a review is open, the existing flow safety ends the attempt instead of sending it.
 */
export function ActingAs({ address }: { address: string | undefined }) {
  return (
    <>
      <dt className="flex items-center text-muted-foreground">
        Sending From
        <InfoTip term="connectedAccount" />
      </dt>
      <dd className="tabular text-right font-medium" data-testid="acting-as" title={address}>
        <span className="font-mono">{address ? shortAddress(address) : "—"}</span>
      </dd>
    </>
  );
}
