import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createPublicClient, http, type Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// P2-8A.1: parity of viem's HTTP batching with the unbatched transport, against a local fake JSON-RPC node (port chosen by
// the OS, never 8545). Batching changes how requests are packed into HTTP calls, not what is asked or how an error in one
// call is reported to its caller. The fake node records the HTTP bodies so the test can also show the packing.
const HASH = ("0x" + "ab".repeat(32)) as Hex;
const ADDR = "0x1111111111111111111111111111111111111111";
let server: Server;
let url = "";
let bodies: unknown[] = [];

const answer = (c: { id: number; method: string; params?: unknown[] }) => {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: c.id, result });
  switch (c.method) {
    case "eth_blockNumber":
      return ok("0x10");
    case "eth_getTransactionReceipt":
      return ok(null); // unknown / pending transaction
    case "eth_getTransactionByHash":
      return ok(null);
    case "eth_call":
      if ((c.params?.[0] as { data?: string })?.data === "0xdeadbeef")
        return { jsonrpc: "2.0", id: c.id, error: { code: 3, message: "execution reverted", data: "0x08c379a0" } };
      return ok("0x" + "0".repeat(63) + "7");
    case "eth_getBalance":
      return { jsonrpc: "2.0", id: c.id, error: { code: -32000, message: "node unavailable" } };
    default:
      return ok("0x0");
  }
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      const out = Array.isArray(body) ? body.map(answer) : answer(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const clientFor = (batch: boolean) => createPublicClient({ transport: http(url, { batch, retryCount: 0 }), cacheTime: 0 });

async function scenario(batch: boolean) {
  const c = clientFor(batch);
  bodies = [];
  const settled = await Promise.allSettled([
    c.getBlockNumber(),
    c.request({ method: "eth_call", params: [{ to: ADDR, data: "0x00" }, "latest"] }),
    c.request({ method: "eth_call", params: [{ to: ADDR, data: "0xdeadbeef" }, "latest"] }), // reverts
    c.getBalance({ address: ADDR }), // node error
    c.getTransactionReceipt({ hash: HASH }), // unknown transaction
    c.getTransaction({ hash: HASH }),
  ]);
  const ops = bodies.flatMap((b) => (Array.isArray(b) ? b : [b])).map((x) => (x as { method: string }).method).sort();
  return {
    http: bodies.length,
    ops,
    outcome: settled.map((s) => (s.status === "fulfilled" ? `ok:${String(s.value)}` : `err:${(s.reason as Error).name}`)),
  };
}

describe("viem HTTP batching: same operations, same per-call outcomes", () => {
  it("one failing call in a batch fails only its own caller, exactly as unbatched", async () => {
    const plain = await scenario(false);
    const batched = await scenario(true);
    expect(batched.outcome).toEqual(plain.outcome);
    expect(batched.ops).toEqual(plain.ops);
    expect(plain.outcome[0]).toBe("ok:16");
    expect(plain.outcome[1]).toMatch(/^ok:0x/);
    expect(plain.outcome[2]).toMatch(/^err:/); // revert
    expect(plain.outcome[3]).toMatch(/^err:/); // node error
    expect(plain.outcome[4]).toMatch(/^err:TransactionReceiptNotFoundError/); // missing receipt, the "pending or unknown" case
    expect(plain.outcome[5]).toMatch(/^err:TransactionNotFoundError/);
  });
  it("packs the six operations into fewer HTTP calls but does not reduce the work", async () => {
    const plain = await scenario(false);
    const batched = await scenario(true);
    expect(plain.http).toBe(6);
    expect(batched.http).toBeLessThan(plain.http);
    expect(batched.ops.length).toBe(plain.ops.length);
  });
});
