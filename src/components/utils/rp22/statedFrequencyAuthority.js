/**
 * statedFrequencyAuthority.js
 * ---------------------------
 * A frequency is stated on a report surface only when the saved authoritative
 * evidence really carries one.
 *
 * Legacy publications wrote a missing frequency as 0 (or as an empty value), and
 * a plain finite-number test reads that 0 as a real measurement — which is how a
 * report came to print "0 Hz". Zero is never a measured bass frequency, so it is
 * treated as absent here, where the evidence is read, and no surface can show it.
 * Nothing is substituted in its place: an absent frequency stays absent.
 *
 * Pure: no React, no side effects.
 */

/** The stated frequency in Hz, or null when the evidence carries none. */
export function statedFrequencyHz(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export default statedFrequencyHz;