import { describe, expect, it } from "vitest";
import * as stub from "./x402-unavailable";

describe("x402 build stub", () => {
  it("can be imported without throwing, and exports every name the SDK references", () => {
    for (const name of ["x402Client", "ExactEvmScheme", "UptoEvmScheme", "ExactSvmScheme", "toClientEvmSigner", "registerExactEvmScheme", "registerExactSvmScheme"]) {
      expect(stub).toHaveProperty(name);
    }
  });
  it("fails loudly if anything ever tries to use it", () => {
    expect(() => stub.toClientEvmSigner()).toThrow(stub.X402_UNAVAILABLE_MESSAGE);
    expect(() => stub.registerExactEvmScheme()).toThrow(/not available/);
    expect(() => new stub.x402Client()).toThrow(/not available/);
    expect(() => new stub.UptoEvmScheme()).toThrow(/not available/);
  });
});
