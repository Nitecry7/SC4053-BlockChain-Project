import { describe, expect, it } from "vitest";
import { pageRanges, REGISTRY_CAP } from "./registry-pages";

describe("pageRanges", () => {
  it("has no pages for an empty registry", () => {
    expect(pageRanges(0n, 50, 500)).toEqual({ pages: [], truncated: false });
  });
  it("covers 1, 50 and 51 items exactly", () => {
    expect(pageRanges(1n, 50, 500).pages).toEqual([{ offset: 0n, limit: 50n }]);
    expect(pageRanges(50n, 50, 500).pages).toEqual([{ offset: 0n, limit: 50n }]);
    expect(pageRanges(51n, 50, 500).pages).toEqual([{ offset: 0n, limit: 50n }, { offset: 50n, limit: 50n }]);
  });
  it("is bounded by the cap and flags truncation", () => {
    const at = pageRanges(500n, 50, 500);
    expect(at.pages).toHaveLength(10);
    expect(at.truncated).toBe(false);
    const over = pageRanges(501n, 50, 500);
    expect(over.pages).toHaveLength(10);
    expect(over.truncated).toBe(true);
    expect(pageRanges(10n ** 30n, 50, 500).pages).toHaveLength(10);
  });
  it("exports the cap used by the app", () => {
    expect(REGISTRY_CAP).toBe(500);
  });
});
