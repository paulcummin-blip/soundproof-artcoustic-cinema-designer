/**
 * p17BasisStaleness.js
 * --------------------
 * Pure detection of a LEGACY P17 publication: one that holds a scored P17 seat
 * metric but was produced before the coverage-window grading method, so it
 * carries no `windowLevel` basis marker.
 *
 * P17 IS A DESIGN GUIDE. The engine now grades every seat against the model's
 * coverage windows and stamps `windowLevel` (L1..L4) on each per-seat result.
 * A publication from before that change stores a scored level but no
 * `windowLevel`, so `p17SeatEvidenceAuthority.resolveRowBasis` reports it as
 * `earlier_variance_basis`. Its design fingerprint can still match the current
 * design, so the durable publication reads as Current indefinitely and the
 * user is shown stale P17 evidence.
 *
 * This helper is READ-ONLY and never grades anything itself. It answers one
 * question: does the stored P17 evidence predate the coverage-window basis?
 *
 * Pure: no React, no SDK, no writes.
 */

const SCORED_LEVEL = /^L[1-4]$/;

function readP17FromSeatMetric(metrics) {
  return metrics?.rp22?.p17 ?? null;
}

/**
 * A P17 seat metric is "scored" when the engine produced a real level for it
 * (L1..L4). A "—" / null / missing level is NOT scored evidence — it is a seat
 * the engine could not grade, and the absence of windowLevel there is normal,
 * not legacy.
 */
function isScoredP17Metric(p17) {
  if (!p17 || typeof p17 !== "object") return false;
  const level = p17.level;
  // The engine stamps a string level ("L3"). Some legacy serialisations may
  // have stored it under value; level is the canonical field.
  if (typeof level === "string" && SCORED_LEVEL.test(level.trim())) return true;
  return false;
}

/**
 * A scored metric is LEGACY when it carries no windowLevel basis marker. The
 * coverage-window engine always stamps windowLevel alongside the level; a
 * scored metric without it was produced by the earlier variance basis.
 */
function scoredMetricLacksWindowLevel(p17) {
  const windowLevel = p17?.windowLevel;
  if (typeof windowLevel === "string" && SCORED_LEVEL.test(windowLevel.trim())) return false;
  return true;
}

/**
 * isLegacyP17Publication
 * ----------------------
 * Returns true when the published engineering summary holds at least one
 * scored P17 seat metric that lacks a `windowLevel` basis marker.
 *
 * Detection contract:
 *   - At least one seat must have a SCORED P17 level (L1..L4). A publication
 *     with no scored P17 at all is NOT legacy — it is simply ungraded, and the
 *     normal missing-evidence path handles it. Flagging it here would force a
 *     republish of designs that have no surround coverage to grade.
 *   - At least one scored metric must lack `windowLevel`.
 *   - rawVarianceDb is NEVER used as the authority. A legacy publication may
 *     carry it as a read-only diagnostic; its presence or absence does not
 *     decide legacy status. Only the basis marker does.
 *
 * @param {object|null} publication - a clean Published Engineering publication
 *        (as returned by readPublishedEngineering) OR its engineering_summary
 *        directly. Both shapes are accepted so the helper can be called from
 *        the durable read, the browser handoff, or a test fixture.
 * @returns {boolean}
 */
export function isLegacyP17Publication(publication) {
  const summary = publication?.engineering_summary ?? publication ?? null;
  const hud = summary?.seatHudById;
  if (!hud || typeof hud !== "object" || Array.isArray(hud)) return false;

  let hasScored = false;
  for (const metrics of Object.values(hud)) {
    const p17 = readP17FromSeatMetric(metrics);
    if (!p17 || !isScoredP17Metric(p17)) continue;
    hasScored = true;
    // A scored metric without the windowLevel basis marker was produced by
    // the earlier variance method → legacy.
    if (scoredMetricLacksWindowLevel(p17)) return true;
  }
  // No scored P17 metric at all → nothing to refresh (missing-evidence path
  // handles it). Scored P17 present and every scored metric carries
  // windowLevel → current basis, not legacy.
  return false;
}

export default isLegacyP17Publication;