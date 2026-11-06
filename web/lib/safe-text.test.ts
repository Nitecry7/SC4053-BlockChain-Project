import { describe, expect, it } from "vitest";
import { displayText } from "./safe-text";

describe("displayText", () => {
  it("leaves ordinary text, spaces inside and non-ASCII letters alone", () => {
    expect(displayText("Singapore Dollar X")).toBe("Singapore Dollar X");
    expect(displayText("Ünïcode")).toBe("Ünïcode");
  });
  it("removes right-to-left overrides, isolates, zero-width and control characters", () => {
    expect(displayText("US‮DC")).toBe("USDC");
    expect(displayText("A⁦B⁩C")).toBe("ABC");
    expect(displayText("Z​W﻿")).toBe("ZW");
    expect(displayText("a\u0007b\u0000c")).toBe("abc");
  });
  it("collapses newlines and runs of whitespace into single spaces and trims", () => {
    expect(displayText("  a \n\n  b\t c  ")).toBe("a b c");
  });
  it("caps the length and marks the cut, counting characters not UTF-16 units", () => {
    expect(displayText("x".repeat(150), 100)).toHaveLength(100);
    expect(displayText("x".repeat(150), 100).endsWith("…")).toBe(true);
    expect(displayText("😀".repeat(5), 3)).toBe("😀😀…");
    expect(displayText("short", 100)).toBe("short");
  });
  it("returns an empty string for text that is only invisible characters", () => {
    expect(displayText("​‮")).toBe("");
  });
  it("removes fillers that render blank, so a symbol made only of them shows as empty", () => {
    expect(displayText("ㅤ")).toBe("");
    expect(displayText("⠀⠀")).toBe("");
    expect(displayText("A­B͏C\u{E0041}")).toBe("ABC");
  });
});
