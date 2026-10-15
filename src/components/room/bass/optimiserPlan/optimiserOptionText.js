// optimiserOptionText.js
// ---------------------------------------------------------------------------
// ONE short-phrase helper for the panel's option copy. A card never shows a
// paragraph: an option states its first sentence, and a sentence that is still
// too long is truncated at a word boundary.
//
// PURE, READ-ONLY formatting. No calculation.
// ---------------------------------------------------------------------------

/**
 * The first sentence of a recorded statement, capped at maxLength characters
 * (truncated on a word boundary, never mid-word).
 */
export function shortPhrase(text, maxLength = 90) {
  if (typeof text !== "string" || !text.trim()) return null;
  const first = text.trim().split(/(?<=\.)\s/)[0].trim();
  if (first.length <= maxLength) return first;
  const clipped = first.slice(0, maxLength);
  const boundary = clipped.lastIndexOf(" ");
  return `${(boundary > maxLength * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
}