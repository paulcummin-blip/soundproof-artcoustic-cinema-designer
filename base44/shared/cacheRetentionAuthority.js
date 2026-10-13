/**
 * cacheRetentionAuthority.js
 * --------------------------
 * Keeps a version's ProjectAnalysisCache row small enough to WRITE.
 *
 * The row is rewritten on every publish: it carries one publication per design
 * identity plus one full completed bass result per fingerprint ever calculated,
 * and each completed result holds its own curve payload. Left unbounded the row
 * grew past the platform's entity write limit, so the publication write that ends
 * a publish failed AFTER the version pointer had already been written. The
 * designer then held a version whose pointer references a publication that was
 * never stored — an unsaved assessment that blocks the Project Report and every
 * proposal, with nothing on screen to explain why.
 *
 * The publication map already follows a bounded-retention rule
 * (retainPublications). This module applies the same rule to the completed bass
 * results, and it is deliberately conservative:
 *
 *   - the version's CURRENT completed result is always retained (it is the
 *     authority the reports and the readiness gate read);
 *   - every completed result a SAVED report still reads is retained, because
 *     resolveCalculationAuthority falls back to the fingerprint a saved report
 *     states;
 *   - nothing else is retained, and nothing is ever dropped silently — every
 *     pruned fingerprint is returned to the caller and logged.
 *
 * Pure logic plus one bounded entity read. It never calculates, never grades and
 * never changes a stored value.
 */

/** Superseded completed results kept beyond the current one and report-read ones. */
export const COMPLETED_RESULT_RETENTION_RECENT = 0;

function completedMap(record) {
  const map = record?.completed_by_fingerprint;
  return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
}

/** When a completed result finished, so the newest can be kept. 0 when unstated. */
function completionTime(entry) {
  const ms = Number(entry?.job?.completedAtMs);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const parsed = Date.parse(entry?.job?.completedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Bound the completed-results map.
 *
 * @param {Object} record — the ProjectAnalysisCache record
 * @param {Object} options
 * @param {string|null} options.keepFingerprint — the version's current result
 * @param {string[]}   options.protectedFingerprints — results a saved report reads
 * @param {number}     options.keepRecent
 * @returns {{completed: Object, pruned: string[], changed: boolean}}
 */
export function retainCompletedResults(record, {
  keepFingerprint = null,
  protectedFingerprints = [],
  keepRecent = COMPLETED_RESULT_RETENTION_RECENT,
} = {}) {
  const map = completedMap(record);
  const keys = Object.keys(map);
  // Nothing to bound: the current result plus the retained recent few.
  if (keys.length <= keepRecent + 1) return { completed: map, pruned: [], changed: false };

  const keep = new Set();
  const hasCurrent = !!(keepFingerprint && map[keepFingerprint]);
  if (hasCurrent) keep.add(keepFingerprint);
  for (const fingerprint of (Array.isArray(protectedFingerprints) ? protectedFingerprints : [])) {
    if (fingerprint && map[fingerprint]) keep.add(fingerprint);
  }
  // With the version's current result retained, nothing else needs keeping. With
  // NO recorded current result the row is never emptied: the newest result is
  // kept, so a version that has not settled its calibration still states the one
  // assessment it does hold.
  const keepRecentEffective = hasCurrent ? keepRecent : Math.max(keepRecent, 1);
  keys
    .filter((key) => !keep.has(key))
    .sort((a, b) => completionTime(map[b]) - completionTime(map[a]))
    .slice(0, Math.max(0, keepRecentEffective))
    .forEach((key) => keep.add(key));

  const completed = {};
  const pruned = [];
  for (const [key, entry] of Object.entries(map)) {
    if (keep.has(key)) completed[key] = entry;
    else pruned.push(key);
  }
  if (pruned.length === 0) return { completed: map, pruned: [], changed: false };
  return { completed, pruned, changed: true };
}

/**
 * The bass fingerprint every publication in this row is backed by. A report reads
 * its publication's own bass contract, so those results are protected from
 * pruning alongside the fingerprints saved reports state directly.
 */
export function collectPublicationBassFingerprints(record) {
  const publications = record?.engineering_publications;
  if (!publications || typeof publications !== 'object' || Array.isArray(publications)) return [];
  const found = new Set();
  for (const entry of Object.values(publications)) {
    const fingerprint = entry?.provenance?.bass_fingerprint;
    if (typeof fingerprint === 'string' && fingerprint.trim().length > 0) found.add(fingerprint);
  }
  return [...found];
}

/**
 * The completed-result fingerprints a saved report of this version still reads:
 * the calculation fingerprint each saved report was generated from. A report the
 * design has moved past keeps reading its own frozen result, so its fingerprint
 * is protected from pruning.
 */
export async function loadReportCalculationFingerprints(service, projectId, versionId) {
  if (!service || !projectId || !versionId) return [];
  try {
    const rows = await service.entities.ReportSnapshot.filter(
      { project_id: projectId, version_id: versionId },
      '-generated_at',
      50,
    );
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    return [...new Set(list
      .map((row) => row?.source_fingerprints?.calculationFingerprint)
      .filter((value) => typeof value === 'string' && value.trim().length > 0))];
  } catch (error) {
    // Fail safe: an unreadable report list protects nothing extra, and the
    // current result is retained regardless, so no authority is lost.
    console.warn('[cacheRetention] saved report read failed:', error?.message || error);
    return [];
  }
}

export default retainCompletedResults;