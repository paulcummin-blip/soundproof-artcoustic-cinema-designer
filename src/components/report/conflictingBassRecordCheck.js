/**
 * conflictingBassRecordCheck.js
 * -----------------------------
 * Pure detection of genuinely conflicting completed bass contracts among
 * ProjectAnalysisCache rows that claim the same current bass fingerprint.
 *
 * The save-authority check in useReportSnapshot must reject the condition
 * where two distinct cache records share the same `current_fingerprint` (the
 * publication's bass fingerprint) but carry different completed contracts.
 * A fingerprint-count alone cannot detect this: the old guard deduplicated by
 * `current_fingerprint`, so two rows with the same fingerprint always collapsed
 * to one entry and passed.
 *
 * Historical cache rows with a DIFFERENT `current_fingerprint` are preserved
 * evidence and never compete in this check.
 *
 * Pure: no React, no fetching, no side effects.
 */

/**
 * Detect whether cache rows claiming the publication's bass fingerprint carry
 * conflicting completed contracts.
 *
 * @param {Array<object>|null} caches - ProjectAnalysisCache rows
 * @param {string|null} publicationBassFp - the bass fingerprint named by the
 *   active version's publication provenance
 * @returns {{conflict: boolean, noCurrent: boolean, reason: string, matchingCount: number}}
 *   conflict    — two matching rows carry different (or missing) contracts
 *   noCurrent   — no row claims the publication fingerprint as its current pointer
 *   reason      — diagnostic label
 *   matchingCount — how many rows claim the fingerprint
 */
export function detectConflictingBassRecords(caches, publicationBassFp) {
  if (!publicationBassFp) {
    return { conflict: false, noCurrent: true, reason: 'no-publication-fingerprint', matchingCount: 0 };
  }

  const matchingRows = (Array.isArray(caches) ? caches : []).filter(
    (row) => row && row.current_fingerprint === publicationBassFp && row.status === 'complete',
  );

  if (matchingRows.length === 0) {
    return { conflict: false, noCurrent: true, reason: 'no-matching-rows', matchingCount: 0 };
  }

  // A single matching row is never a conflict — it is the one current authority.
  if (matchingRows.length === 1) {
    return { conflict: false, noCurrent: false, reason: 'single-matching-row', matchingCount: 1 };
  }

  // Two or more rows claim the same current_fingerprint. Each must carry the
  // SAME completed contract for that fingerprint. A row missing the contract
  // entry, or two rows with different resultFingerprint values, is a genuine
  // conflict — the publication can only point at one authoritative result.
  const contractFingerprints = matchingRows.map((row) => {
    const completed = row.completed_by_fingerprint?.[publicationBassFp];
    return completed?.job?.resultFingerprint || null;
  });

  const hasConflict = !contractFingerprints.every(
    (fp) => fp && fp === contractFingerprints[0],
  );

  return {
    conflict: hasConflict,
    noCurrent: false,
    reason: hasConflict ? 'conflicting-completed-contracts' : 'consistent-contracts',
    matchingCount: matchingRows.length,
  };
}

export default detectConflictingBassRecords;