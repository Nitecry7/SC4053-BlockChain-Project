import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { formatExact } from "@/lib/units";

// Regression for P2-8A finding R6: `aria-label` on a generic <span> is a prohibited ARIA use (axe aria-prohibited-attr),
// so the exact value was not reliably exposed. The value is now visually hidden text, and the visible digits are
// aria-hidden so it is announced once. This checks the markup; it is not a screen-reader test.
const WEI = 1_234_567_890_123_456_789_000n; // 1234.567890123456789 with 18 decimals
const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("Amount semantics", () => {
  const html = renderToStaticMarkup(createElement(Amount, { value: WEI, symbol: "NTU" }));

  it("has no aria-label anywhere", () => {
    expect(html).not.toContain("aria-label");
  });
  it("exposes the exact value and symbol once, as visually hidden text", () => {
    const exact = `${formatExact(WEI, 18)} NTU`;
    expect(html.split(`<span class="sr-only">${exact}</span>`)).toHaveLength(2);
    expect(html).toContain(`title="${exact}"`);
  });
  it("hides the visible digits from assistive technology and keeps them on screen", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("1,234"); // integer part, as before; the display format itself is unchanged
  });
  it("works without a symbol and for zero", () => {
    const zero = renderToStaticMarkup(createElement(Amount, { value: 0n }));
    expect(zero).toContain(`<span class="sr-only">${formatExact(0n, 18)}</span>`);
    expect(zero).not.toContain("aria-label");
  });
});

describe("AddressChip semantics", () => {
  const html = renderToStaticMarkup(createElement(AddressChip, { address: ADDRESS, copy: true }));
  it("puts the full address in visually hidden text and hides the shortened form", () => {
    expect(html).toContain(`<span class="sr-only">${ADDRESS}</span>`);
    expect(html).toMatch(/aria-hidden="true">0x7099/);
  });
  it("keeps aria-label only on the real button, and the name is not a prohibited label on a span", () => {
    const labelled = [...html.matchAll(/<(\w+)[^>]*aria-label=/g)].map((m) => m[1]);
    expect(labelled).toEqual(["button"]);
  });
});
