import type { Hex } from "viem";

/**
 * Has the local chain been reset (Anvil restarted, a snapshot reverted) since we last looked? A reset is a claim about
 * the whole chain, so it is made only from positive evidence about block identity, never from one missing transaction
 * (a transaction can be dropped, replaced or not yet indexed on a chain that is perfectly intact).
 *
 * Measured on a scratch Anvil (docs/ai-audit/test-evidence/person2/p2-7-hardening.md): a restart changed the genesis
 * block hash, and the block seen before the restart no longer existed; viem's block watcher then emitted nothing,
 * because the new head was below the old one.
 */
export type ChainAnchor = { genesisHash: Hex; blockNumber: bigint; blockHash: Hex };

/**
 * What the node says now. `undefined` means the read failed (not evidence either way); `null` means the node answered
 * that the block does not exist.
 */
export type ChainObservation = {
  genesisHash: Hex | undefined;
  latestNumber: bigint | undefined;
  hashAtAnchor: Hex | null | undefined;
};

export type ChainVerdict = {
  verdict: "continuous" | "reset" | "unknown";
  /** Plain-language facts that support the verdict; shown to the user for `reset`. */
  evidence: string[];
};

const same = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

export function assessChain(anchor: ChainAnchor, now: ChainObservation): ChainVerdict {
  const evidence: string[] = [];
  if (now.genesisHash !== undefined && !same(now.genesisHash, anchor.genesisHash)) {
    evidence.push("the genesis block hash changed, so this is a different chain from the one the transaction was sent to");
  }
  if (now.hashAtAnchor) {
    if (!same(now.hashAtAnchor, anchor.blockHash)) {
      evidence.push(`block ${anchor.blockNumber.toString()} now has a different hash from the one seen earlier`);
    }
  } else if (now.hashAtAnchor === null && now.latestNumber !== undefined && now.latestNumber < anchor.blockNumber) {
    evidence.push(`the chain head (block ${now.latestNumber.toString()}) is below block ${anchor.blockNumber.toString()}, which was seen earlier`);
  }
  if (evidence.length > 0) return { verdict: "reset", evidence };

  // Continuous only when the anchor block was read back and matches. Anything less is not proof either way.
  if (now.hashAtAnchor && same(now.hashAtAnchor, anchor.blockHash) && (now.genesisHash === undefined || same(now.genesisHash, anchor.genesisHash))) {
    return { verdict: "continuous", evidence };
  }
  return { verdict: "unknown", evidence };
}
