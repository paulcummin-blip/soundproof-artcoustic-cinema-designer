// coordinatedDiversityPolicy.js
// Pure, zero-dependency seating-state selection for the coordinated physical
// search. Kept import-free so it is unit-testable in isolation (the main
// coordinatedPhysicalSearch module pulls a heavy import chain).
//
// The coordinated search must NOT prune seating states by their performance
// with the installed subwoofer arrangement: a seating movement that performs
// poorly with the current subs might perform well with different sub
// positions. This helper selects a bounded, DIVERSE spread across the legal
// range — geometry only, no acoustic ranking.

/**
 * Pick a bounded, DIVERSE spread of legal seating offsets across the valid
 * range. Does NOT rank by installed-sub performance — diversity only.
 *
 * @param {Array} validCandidates - legal, non-zero-offset seating candidates
 * @param {number} max - maximum number of states to retain
 * @returns {Array} a diverse subset (reference-equal entries from the input)
 */
export function selectDiverseSeatingStates(validCandidates, max) {
  if (!validCandidates.length) return [];
  const n = Math.min(max, validCandidates.length);
  if (n >= validCandidates.length) return validCandidates.slice();
  const step = (validCandidates.length - 1) / (n - 1);
  const picked = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let idx = Math.round(i * step);
    if (used.has(idx)) idx = validCandidates.length - 1 - i;
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(validCandidates[idx]);
  }
  return picked.filter(Boolean);
}