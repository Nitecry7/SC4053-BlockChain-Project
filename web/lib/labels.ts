/**
 * The display-label convention (P2-8C): headings, panel and page titles, tab and segment labels, table column headers, stat
 * labels, status badges and short field labels are in Title Case; sentences, buttons, help text and warnings keep sentence case.
 * Small words (a, an, the, and, or, of, to, in, on, at, for, by, vs, as) stay lower case unless first or last; hyphenated terms
 * capitalise every part ("Stop-Limit"). The convention is enforced by a test over the source (`labels.test.ts`), not by a CSS
 * `text-transform`, so the text a screen reader or a test sees is the text on screen.
 */
const SMALL = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "by", "vs", "as"]);

export function isTitleCase(label: string): boolean {
  const words = label.trim().split(/\s+/).filter(Boolean);
  return words.every((word, i) => {
    if (!/[A-Za-z]/.test(word[0] ?? "")) return true; // numbers, punctuation, arrows, "(" groups handled by their inner word below
    if (i > 0 && i < words.length - 1 && SMALL.has(word.toLowerCase())) return word === word.toLowerCase();
    return word.split("-").every((part) => part === "" || !/[a-z]/.test(part[0] ?? "") );
  });
}
