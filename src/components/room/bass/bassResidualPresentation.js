// bassResidualPresentation.js
//
// Design-facing presentation of the response-vs-target residual, plus the
// expert calculation-trace rows. Pure formatting — it reads values, it never
// recomputes, re-grades or re-smooths anything.
//
// PRODUCT RULE
//   A residual below 1 dB is not meaningful in design-facing UI. It is shown as
//   "No meaningful deviation" — never as a decimal signed dB figure. Residuals
//   of 1 dB or more are stated in whole-number dB. Exact signed values remain
//   available in Engineer / Expert details.

export const MEANINGFUL_RESIDUAL_DB = 1;

const isFiniteNumber = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

/**
 * The design-facing residual statement.
 *
 * @param {number} deltaDb - signed residual (final response - target)
 * @returns {string|null} "No meaningful deviation" | "Below target N dB" | "Above target N dB"
 */
export function formatResidualStatement(deltaDb) {
  if (!isFiniteNumber(deltaDb)) return null;
  const delta = Number(deltaDb);
  if (Math.abs(delta) < MEANINGFUL_RESIDUAL_DB) return "No meaningful deviation";
  const whole = Math.round(Math.abs(delta));
  return `${delta < 0 ? "Below target" : "Above target"} ${whole} dB`;
}

/** Whole-number dB for user-facing adjustment and level values. */
export function formatWholeDb(value) {
  if (!isFiniteNumber(value)) return "—";
  const rounded = Math.round(Number(value));
  return `${rounded > 0 ? "+" : ""}${rounded} dB`;
}

/** Whole-number SPL/Db readout for the user-facing tooltip. */
export function formatWholeSpl(value) {
  return isFiniteNumber(value) ? `${Math.round(Number(value))} dBC` : "—";
}

/** Exact signed dB (one decimal) — Engineer / Expert details only. */
export function formatExactSignedDb(value) {
  if (!isFiniteNumber(value)) return "—";
  const number = Number(value);
  // Only a genuinely positive value carries "+" — an exact zero is "0.0 dB".
  return `${number > 0 ? "+" : ""}${number.toFixed(1)} dB`;
}

/** Exact SPL (one decimal) — Engineer / Expert details only. */
export function formatExactSpl(value) {
  return isFiniteNumber(value) ? `${Number(value).toFixed(1)} dBC` : "—";
}

/** Yes / No / Not available — never asserts an unknown flag. */
function triState(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not available";
}

/**
 * Expert-only rows for one cursor frequency: the three adjustments, the flags,
 * the smoothing bases, and the per-frequency correction trace.
 *
 * @param {object} params
 * @param {object|null} params.trace    persisted correction trace
 * @param {object|null} params.record   trace record nearest the cursor frequency
 * @param {string} [params.displaySmoothingLabel] - label for the current display smoothing
 * @param {string} [params.officialBasisLabel]    - label for the official P19 basis
 * @returns {Array<[string, string]>} label/value rows
 */
export function buildExpertTraceRows({
  trace = null,
  record = null,
  displaySmoothingLabel = null,
  officialBasisLabel = null,
} = {}) {
  const rows = [];
  const push = (label, value) => {
    if (value !== null && value !== undefined) rows.push([label, value]);
  };

  push("Operating adjustment (initial)", trace ? formatExactSignedDb(trace.initialOperatingAdjustmentDb) : null);
  push("Global alignment trim (final)", trace ? formatExactSignedDb(trace.finalGlobalAlignmentTrimDb) : null);
  push("Final effective adjustment", trace ? formatExactSignedDb(trace.finalEffectiveAdjustmentDb) : null);
  push("Correction smoothing", trace?.correctionSmoothingApplied ? "Applied to the correction envelope" : (trace ? "Not applied" : null));
  push("Capability limited", record ? triState(record.capabilityLimited) : null);
  push("Protected null", record ? triState(record.protectedNull) : null);
  push("Graph smoothing", displaySmoothingLabel || null);
  push("Official P19 basis", officialBasisLabel || null);

  if (record) {
    push("Raw RSP", formatExactSpl(record.rawRspDb));
    push("Target", formatExactSpl(record.targetDb));
    push("Requested correction", formatExactSignedDb(record.requestedCorrectionDb));
    push("After smoothing", formatExactSignedDb(record.correctionAfterSmoothingDb));
    push("Applied correction", formatExactSignedDb(record.appliedCorrectionDb));
    push("Final post-EQ", formatExactSpl(record.finalPostEqDb));
    push("Residual", formatExactSignedDb(record.residualDb));
  }
  if (trace) {
    push("Boost limit", formatExactSignedDb(trace.boostLimitDb));
    push("Cut limit", formatExactSignedDb(trace.cutLimitDb));
  }

  return rows;
}