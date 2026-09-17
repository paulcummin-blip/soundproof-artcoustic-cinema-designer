// src/components/admin/speaker-db/speakerDbQualityScore.js
//
// Calculated data quality score for a manufacturer or product.
// Based on open (non-Resolved, non-Ignored) SpeakerDataQuality issues.
// Not manually entered — derived from the issue records.
//
// Score = 100 - deductions, clamped to 0-100.
//
// Deduction weights by status:
//   Missing      = 3   (most severe — no data at all)
//   Conflict     = 2   (sources disagree)
//   Estimated   = 1.5 (value was estimated, not measured)
//   Needs Review = 1   (awaiting human check)
//   Out of Date  = 0.5 (stale but present)
//
// Deduction weights by severity (applied when status alone is neutral):
//   Critical     = 2
//   Warning       = 1
//   Information = 0.5
//
// The higher of (status weight, severity weight) is used per issue,
// so a Critical Missing issue deducts 3 (not 2+3=5).

const STATUS_WEIGHTS = {
  Missing: 3,
  Conflict: 2,
  Estimated: 1.5,
  "Needs Review": 1,
  "Out of Date": 0.5,
};

const SEVERITY_WEIGHTS = {
  Critical: 2,
  Warning: 1,
  Information: 0.5,
};

/**
 * Calculate a data quality score (0-100) from an array of SpeakerDataQuality issues.
 * Only open issues (not Resolved or Ignored) are counted.
 * @param {Array} issues - SpeakerDataQuality records
 * @returns {number} Score from 0 to 100, rounded to nearest integer.
 */
export function calculateQualityScore(issues) {
  if (!issues || issues.length === 0) return 100;
  let deduction = 0;
  for (const issue of issues) {
    if (!issue) continue;
    if (issue.status === "Resolved" || issue.status === "Ignored") continue;
    const statusWeight = STATUS_WEIGHTS[issue.status] || 0;
    const severityWeight = SEVERITY_WEIGHTS[issue.severity] || 0;
    deduction += Math.max(statusWeight, severityWeight, 0.5);
  }
  return Math.max(0, Math.round(100 - deduction));
}

/**
 * Calculate a quality score for a single product from its issues.
 * Convenience wrapper — same as calculateQualityScore but named for clarity.
 */
export function calculateProductQualityScore(issues) {
  return calculateQualityScore(issues);
}