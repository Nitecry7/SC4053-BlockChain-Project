import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "./glossary";
import { isTitleCase } from "./labels";
import { statusLabel } from "./order-status";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === ".next") return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
const root = join(__dirname, "..");
const sources = [...files(join(root, "components")), ...files(join(root, "app"))].map((f) => ({ f: f.slice(root.length + 1), s: readFileSync(f, "utf8") }));

/** Literal strings (no template or JSX expression) captured by `re` group 1, with the file they came from. */
const literals = (re: RegExp, maxWords = 99) => sources.flatMap(({ f, s }) => [...s.matchAll(re)].map((m) => ({ f, text: m[1]! })).filter((x) => x.text.split(/\s+/).length <= maxWords));

describe("isTitleCase", () => {
  it("accepts proper Title Case and rejects sentence case", () => {
    for (const ok of ["Market Board", "Order Book", "Stop-Limit Order", "Pending Trigger", "Partially Filled", "How Markets Are Listed", "Create & List", "Activates at Most", "Maker → Taker", "All Tokens"]) expect(isTitleCase(ok), ok).toBe(true);
    for (const bad of ["Market board", "Order book", "Stop-limit order", "Pending trigger", "Partly filled", "Quick actions", "Total supply"]) expect(isTitleCase(bad), bad).toBe(false);
  });
});

describe("the display-label convention holds in the source", () => {
  it("every literal panel, page and factory-facts title is Title Case", () => {
    const titles = literals(/(?:<Panel[^>]*\s|<PageHeader\s|<FactoryFacts[^>]*\s)title="([^"{]+)"/g);
    expect(titles.length).toBeGreaterThan(8);
    for (const t of titles) expect(isTitleCase(t.text), `${t.f}: "${t.text}"`).toBe(true);
  });

  it("every literal table column header is Title Case", () => {
    const heads = literals(/<th[^>]*>([^<{]+)<\/th>/g).filter((h) => h.text.trim() !== "");
    expect(heads.length).toBeGreaterThan(20);
    for (const h of heads) expect(isTitleCase(h.text), `${h.f}: "${h.text}"`).toBe(true);
  });

  it("every short literal Row label (three words or fewer) is Title Case", () => {
    const rows = literals(/<Row (?:strong )?label="([^"{(]+)"/g, 3);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) expect(isTitleCase(r.text), `${r.f}: "${r.text}"`).toBe(true);
  });

  it("navigation labels, page metadata titles, status labels and glossary terms are Title Case", () => {
    for (const t of literals(/label: "([^"]+)"[^}]*href:/g)) expect(isTitleCase(t.text), `${t.f}: ${t.text}`).toBe(true);
    for (const t of literals(/metadata[^=]*= \{ title: "([^"]+)"/g)) expect(isTitleCase(t.text), `${t.f}: ${t.text}`).toBe(true);
    for (const s of [0, 1, 2, 3, 4]) expect(isTitleCase(statusLabel(s)), statusLabel(s)).toBe(true);
    for (const [k, e] of Object.entries(GLOSSARY)) expect(isTitleCase(e.term), `${k}: ${e.term}`).toBe(true);
  });

  it("the same feature keeps one spelling: no 'stop limit' (unhyphenated) in any visible string", () => {
    for (const { f, s } of sources) expect(/stop limit/i.test(s), f).toBe(false);
  });
});
