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

// ── Specification Completeness ───────────────────────────────────────
//
// Completeness is DIFFERENT from quality. Completeness measures whether
// specification fields are populated — it says nothing about correctness.
// A spec can be 100% complete (all fields filled) but low quality (values
// are wrong). Like the quality score, completeness is NEVER stored — it is
// calculated dynamically whenever the dashboard loads.

export const SPEC_COMPLETENESS_FIELDS = [
  "sensitivity_db",
  "frequency_response_low_hz",
  "frequency_response_high_hz",
  "max_continuous_spl_db",
  "max_peak_spl_db",
  "nominal_impedance_ohm",
  "cabinet_type",
  "mounting_type",
  "woofer_count",
  "woofer_size",
  "tweeter_description",
  "height_mm",
  "width_mm",
  "depth_mm",
  "weight_kg",
  "horizontal_dispersion_deg",
  "vertical_dispersion_deg",
];

export function calculateSpecCompleteness(spec) {
  if (!spec) return 0;
  const populated = SPEC_COMPLETENESS_FIELDS.filter(
    (f) => spec[f] != null && spec[f] !== ""
  ).length;
  return Math.round((populated / SPEC_COMPLETENESS_FIELDS.length) * 100);
}

export function calculateAverageCompleteness(specs) {
  if (!specs || specs.length === 0) return "—";
  const avg = specs.reduce((sum, s) => sum + calculateSpecCompleteness(s), 0) / specs.length;
  return `${Math.round(avg)}%`;
}