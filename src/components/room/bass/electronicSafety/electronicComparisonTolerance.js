// electronicComparisonTolerance.js
// ---------------------------------------------------------------------------
// THE ONE canonical electronic-comparison tolerance.
//
// Every automatic electronic decision — is a candidate safe, has anything
// improved, which safe candidate wins — is compared at THIS tolerance. It is one
// named figure, in one place, so floating-point noise can never change a
// subwoofer delay, and a genuine improvement can never be rounded away.
//
// It is deliberately SEPARATE from every other figure in the engine:
//   • the RP22 whole-dB display floor (resolveRp22DesignValue) — display only
//   • the Stage-2 physical-placement Pareto tolerance (0.05 dB) — physical ranking
//   • the Stage-2 placement tie tolerance (0.15 dB) — physical ranking
//   • the published-baseline parity tolerance (0.1 dB) — cache/parity identity
//   • the 1 dB recommendation materiality figure — the approval workflow
//   • COMPARISON_TOLERANCE (1e-8) — tuple-comparison implementation detail
//
// A shared VALUE with the physical Pareto tolerance is not a shared authority:
// physical placement ranking never reads this module, and this module never
// ranks a physical candidate.
//
// PURE. No React, no stores, no acoustic maths.
// ---------------------------------------------------------------------------

/**
 * The canonical electronic-comparison tolerance, in dB.
 *
 * WHY 0.05 dB:
 *   • It suppresses floating-point noise with a very large margin. A candidate's
 *     response is recombined from 360 log-spaced complex points per source and
 *     per seat; the residual error of that summation is orders of magnitude
 *     below 0.01 dB, so 0.05 dB is never reached by arithmetic alone.
 *   • It blocks nothing genuine. A 0.2-0.5 dB continuous improvement clears it by
 *     4x to 10x — exactly the band the old 1 dB action threshold was wrongly
 *     discarding.
 *   • It permits no meaningful deterioration. NO seat — Primary or Secondary — may
 *     drift by even 0.1 dB undetected, so "no seat gets worse" is enforced
 *     strictly rather than at a materiality figure. Automatic adoption is
 *     PARETO-SAFE: the same tolerance protects every seat, so a Secondary seat is
 *     never traded for a Primary gain.
 */
export const ELECTRONIC_COMPARISON_TOLERANCE_DB = 0.05;

/** The justification, in one paragraph, for whoever reads this figure next. */
export const ELECTRONIC_COMPARISON_TOLERANCE_JUSTIFICATION = [
  "0.05 dB: the smallest figure that separates a real electronic change from floating-point noise in this engine.",
  "A candidate response is a sum of 360 log-spaced complex points per source and per seat, so the recombination",
  "residual is orders of magnitude below 0.01 dB, while 0.05 dB stays far below any figure a designer can act on.",
  "It does not block genuine improvements (a 0.2-0.5 dB continuous gain clears it several times over) and it does",
  "not permit meaningful deterioration (a Primary seat cannot drift by even 0.1 dB unnoticed). It is deliberately",
  "not the RP22 display floor, not the Stage-2 physical-placement tolerance, and not the 1 dB materiality figure.",
  "It protects every seat equally: a Primary or Secondary seat worsening beyond it rejects the candidate, so no seat is ever traded for another.",
].join(" ");

/**
 * The arithmetic slack used when a difference is compared against the tolerance.
 *
 * A change of EXACTLY the tolerance must count as equivalent, but decimal dB
 * arithmetic cannot represent it exactly: 10.05 - 10.0 is 0.05000000000000071. The
 * comparison therefore allows this slack, which is orders of magnitude below any
 * figure the engine can produce or a designer can act on. Without it, a change of
 * exactly the tolerance would be read as a regression by rounding error alone.
 */
const TOLERANCE_ARITHMETIC_SLACK = 1e-9;

/** A finite number, or null. Never coerces null/undefined/"" to 0. */
export function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * "L2" · 2 · 0 for a FAIL · null when the level is not published.
 * The same encoding the canonical seat rows use, so no second scale is invented.
 */
export function levelValue(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  if (typeof value === "string") {
    const match = value.trim().match(/^L([1-4])$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Is the difference between two figures larger than the canonical tolerance? */
export function beyondTolerance(a, b, tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB) {
  const left = finiteNumber(a);
  const right = finiteNumber(b);
  if (left == null || right == null) return false;
  return Math.abs(right - left) > tolerance + TOLERANCE_ARITHMETIC_SLACK;
}

/**
 * How much a deviation got WORSE (positive = worse), or 0 when the change is
 * inside the tolerance. Deviations are magnitudes: smaller is better.
 */
export function worsenedBy(before, after, tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB) {
  const left = finiteNumber(before);
  const right = finiteNumber(after);
  if (left == null || right == null) return 0;
  const worse = Math.abs(right) - Math.abs(left);
  return worse > tolerance + TOLERANCE_ARITHMETIC_SLACK ? worse : 0;
}

/**
 * How much a deviation got BETTER (positive = improved), or 0 when the change is
 * inside the tolerance. One decimal, for a stated measurement only.
 */
export function improvedBy(before, after, tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB) {
  const left = finiteNumber(before);
  const right = finiteNumber(after);
  if (left == null || right == null) return 0;
  const better = Math.abs(left) - Math.abs(right);
  return better > tolerance + TOLERANCE_ARITHMETIC_SLACK ? better : 0;
}