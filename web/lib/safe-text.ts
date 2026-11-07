// Text that comes from a token contract (name, symbol) is untrusted. React escapes it, so it cannot inject markup, but it
// can still hide or reorder what the user reads. This removes control, zero-width and bidirectional-override characters
// and caps the length, for DISPLAY only. The contract address, not any of this text, identifies a token.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}ㅤᅠ⠀͏]/gu;

export function displayText(text: string, maxChars = 100): string {
  const clean = text.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  const chars = [...clean];
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}…` : clean;
}
