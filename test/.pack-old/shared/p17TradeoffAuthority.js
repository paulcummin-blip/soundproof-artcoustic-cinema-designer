/**
 * p17TradeoffAuthority.js (shared)
 * --------------------------------
 * The single authority for the P17 (surround and overhead timbre matching)
 * trade-off in a comparison.
 *
 * P17 is the one parameter where a higher-output option can be assessed LOWER
 * than the other option, so attribution here is easy to invert — and naming the
 * wrong option as the stronger surround and overhead timbre result is the most
 * damaging sentence a client-facing comparison can carry. This module resolves,
 * once, from the frozen comparison row:
 *
 *   - whether the options differ at all
 *   - the exact option names, in frozen column order
 *   - which option the frozen evidence shows as the STRONGER P17 result, and
 *     which option gives it up
 *   - the two sentences the writer must use for that trade-off
 *
 * The narrative evidence guard (prompt) and the narrative sanitizer
 * (post-processing) both read it, so the instruction given to the writer and the
 * wording enforced afterwards can never disagree, and the attribution can never
 * be reversed between them.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** L1–L4 → 1–4, falling back to the first number in the value; null when unreadable. */
export function readLevel(value) {
  const text = String(value ?? '').trim();
  const level = text.toUpperCase().match(/\bL([1-4])\b/);
  if (level) return Number(level[1]);
  const number = text.match(/-?\d+(?:\.\d+)?/);
  return number ? Number(number[0]) : null;
}

/**
 * Index of the highest value, but only when exactly one option holds it. A tie,
 * an unreadable value or a missing option resolves to -1: an unattributable
 * trade-off is never guessed.
 */
function strongestIndex(values) {
  const levels = values.map(readLevel);
  if (levels.some(level => level === null)) return -1;
  const best = Math.max(...levels);
  return levels.filter(level => level === best).length === 1 ? levels.indexOf(best) : -1;
}

/** The option name as the subject of a sentence, e.g. "The Level 1 version". */
function asSubject(name) {
  return /^the\b/i.test(String(name)) ? String(name) : `The ${name}`;
}

/**
 * The frozen P17 trade-off, or null when there is no comparison row, no readable
 * difference, or the evidence cannot attribute a unique stronger option.
 *
 * @param {{versions?: Array, rows?: Array}} comparisonTable
 * @returns {null | { differs: boolean, values: string[], names: string[], strongerIndex: number, strongerName: string|null, weakerNames: string[], weakerName: string|null }}
 */
export function resolveP17Tradeoff(comparisonTable) {
  const versions = comparisonTable?.versions || [];
  const row = (comparisonTable?.rows || []).find(item => item.key === 'p17');
  if (!row || versions.length < 2) return null;
  const values = row.values || [];
  const names = versions.map(version => version.version_name || version.label || null);
  if (names.some(name => !name) || values.length !== names.length) return null;
  const differs = row.identical === false && new Set(values).size > 1;
  const stronger = strongestIndex(values);
  const weakerNames = stronger >= 0 ? names.filter((_, index) => index !== stronger) : names.slice();
  return {
    differs,
    values,
    names,
    strongerIndex: stronger,
    // The option the frozen evidence shows with the stronger P17 result. Null when
    // the evidence cannot attribute it to exactly one option.
    strongerName: stronger >= 0 ? names[stronger] : null,
    weakerNames,
    weakerName: weakerNames.length === 1 ? weakerNames[0] : 'other options',
  };
}

/**
 * The two sentences for a real P17 trade-off, in the frozen evidence's own
 * attribution: the honest statement of which option currently shows the stronger
 * surround and overhead timbre result, then the balanced explanation that keeps
 * the other option credible. Null when there is no attributable trade-off.
 */
export function p17TradeoffSentences(tradeoff) {
  if (!tradeoff?.differs || !tradeoff.strongerName) return null;
  return {
    evidence: `${asSubject(tradeoff.strongerName)} currently shows the stronger P17 surround and overhead timbre result in the frozen evidence.`,
    balance: `That does not make the ${tradeoff.weakerName} poor. It means the stronger system should be reviewed for surround and overhead timbre matching before final specification.`,
  };
}

export default resolveP17Tradeoff;