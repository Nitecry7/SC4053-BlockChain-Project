import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { assessChain, type ChainAnchor } from "./chain-reset";

const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const anchor: ChainAnchor = { genesisHash: H(1), blockNumber: 10n, blockHash: H(10) };

describe("assessChain: a reset is claimed only on positive evidence", () => {
  it("the same genesis and the same anchor block is a continuous chain", () => {
    expect(assessChain(anchor, { genesisHash: H(1), latestNumber: 12n, hashAtAnchor: H(10) }).verdict).toBe("continuous");
  });

  it("a different genesis hash is a reset (a restarted Anvil has a new one)", () => {
    const v = assessChain(anchor, { genesisHash: H(2), latestNumber: 1n, hashAtAnchor: null });
    expect(v.verdict).toBe("reset");
    expect(v.evidence.join(" ")).toMatch(/genesis/i);
  });

  it("the block we saw now has a different hash: the chain was replaced or reverted", () => {
    const v = assessChain(anchor, { genesisHash: H(1), latestNumber: 11n, hashAtAnchor: H(99) });
    expect(v.verdict).toBe("reset");
    expect(v.evidence.join(" ")).toMatch(/different hash/i);
  });

  it("a head below the block we saw, and that block gone, is a reset", () => {
    expect(assessChain(anchor, { genesisHash: H(1), latestNumber: 4n, hashAtAnchor: null }).verdict).toBe("reset");
  });

  it("the anchor block missing while the head is still at or above it is NOT proof (lagging node): unknown", () => {
    expect(assessChain(anchor, { genesisHash: H(1), latestNumber: 12n, hashAtAnchor: null }).verdict).toBe("unknown");
  });

  it("reads that failed are not evidence: unknown, never reset", () => {
    expect(assessChain(anchor, { genesisHash: undefined, latestNumber: undefined, hashAtAnchor: undefined }).verdict).toBe("unknown");
    expect(assessChain(anchor, { genesisHash: H(1), latestNumber: undefined, hashAtAnchor: undefined }).verdict).toBe("unknown");
  });

  it("a failed genesis read does not hide a confirmed anchor mismatch", () => {
    expect(assessChain(anchor, { genesisHash: undefined, latestNumber: 11n, hashAtAnchor: H(99) }).verdict).toBe("reset");
  });

  it("hash comparison ignores letter case", () => {
    const upper = { ...anchor, blockHash: anchor.blockHash.toUpperCase() as Hex };
    expect(assessChain(upper, { genesisHash: H(1), latestNumber: 10n, hashAtAnchor: H(10) }).verdict).toBe("continuous");
  });
});
