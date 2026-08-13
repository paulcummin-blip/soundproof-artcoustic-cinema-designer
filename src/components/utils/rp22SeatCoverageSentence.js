/**
 * rp22SeatCoverageSentence.js
 * ---------------------------
 * Shared RP22 seating-coverage summary sentence builder.
 *
 * Consumes the existing canonical per-seat RP22 results from
 * useRP22AnalysisEngine (analysisResult.perSeatRp22) and the existing
 * canonical primary-seat designation (perSeatRp22[seatId].isPrimary).
 *
 * Does NOT recalculate any RP22 parameter, threshold, seat classification,
 * or report eligibility rule. Presentation + aggregation only.
 *
 * Used by BOTH:
 *   - Technical Report (RP22Report / TechnicalPerformanceSummary)
 *   - Visual Report (RP22ClientReport / ClientDesignHighlights)
 *
 * PRIMARY_FLOOR  = lowest achieved RP22 level among all seats designated as primary
 * ALL_SEAT_FLOOR = lowest achieved RP22 level among all designated/evaluated seats
 *
 * Wording:
 *   Strong (all params reportable):
 *     "All primary seats meet or exceed CEDIA/CTA-RP22 Level {PRIMARY_FLOOR}
 *      across every parameter, with no designated seat below Level {ALL_SEAT_FLOOR}."
 *   Weak (some params excluded):
 *     "Across the currently assessed CEDIA/CTA-RP22 parameters, all primary seats
 *      meet or exceed Level {PRIMARY_FLOOR}, with no designated seat below Level {ALL_SEAT_FLOOR}."
 *
 * Below Level 1: displayed as "Below Level 1" (never "Level 0"), with grammatical
 * adjustment so the sentence remains truthful.
 */

/**
 * Normalise a raw RP22 metric level to a comparable numeric floor.
 * @returns {number|null} 4|3|2|1 for valid levels, 0 for FAIL/below Level 1, null for not assessed.
 */
function normalizeSeatLevel(rawLevel) {
  if (rawLevel == null) return null;
  if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
    if (rawLevel >= 1 && rawLevel <= 4) return rawLevel;
    if (rawLevel === 0) return 0; // FAIL — below Level 1
    return null;
  }
  if (typeof rawLevel === "string") {
    const trimmed = rawLevel.trim();
    const m = trimmed.match(/^L([1-4])$/i);
    if (m) return parseInt(m[1], 10);
    if (trimmed.toUpperCase() === "FAIL") return 0;
  }
  return null;
}

/**
 * Build the RP22 seating-coverage summary sentence from canonical results.
 *
 * @param {Object} params
 * @param {Object} params.analysisResult           — from useRP22AnalysisEngine
 * @param {string[]} params.realSeatIds            — IDs of real (non-synthetic) seats
 * @param {boolean} params.allParametersReportable — true when all 21 RP22 params are authoritative
 * @returns {string|null} — the sentence, or null when no valid primary/all-seat result exists
 */
export function buildRp22SeatCoverageSentence({
  analysisResult,
  realSeatIds,
  allParametersReportable,
}) {
  if (!analysisResult?.perSeatRp22) return null;
  const perSeatRp22 = analysisResult.perSeatRp22;
  if (!Array.isArray(realSeatIds) || realSeatIds.length === 0) return null;

  // ── Collect per-seat achieved floors from canonical per-seat RP22 results ──
  // Each seat's floor = the lowest achieved level across all its assessed
  // seat-scope RP22 parameters. A FAIL (below L1) on any param sets floor = 0.
  const seatFloors = [];
  for (const seatId of realSeatIds) {
    const seatData = perSeatRp22[seatId];
    if (!seatData) continue;
    const rp22 = seatData.rp22 || {};
    let floor = null;
    let hasAnyAssessed = false;
    for (const paramKey of Object.keys(rp22)) {
      const metric = rp22[paramKey];
      if (!metric) continue;
      const lvl = normalizeSeatLevel(metric.level);
      if (lvl == null) continue; // not assessed (—, N/A, etc.)
      hasAnyAssessed = true;
      if (floor === null || lvl < floor) floor = lvl;
    }
    if (!hasAnyAssessed) continue; // no valid results → seat not evaluated
    seatFloors.push({
      seatId,
      isPrimary: seatData.isPrimary === true,
      floor,
    });
  }

  // If no valid all-seat result exists, omit the sentence.
  if (seatFloors.length === 0) return null;

  const primaryFloors = seatFloors
    .filter((s) => s.isPrimary)
    .map((s) => s.floor);

  // If no valid primary-seat result exists, omit the sentence.
  if (primaryFloors.length === 0) return null;

  const primaryFloor = Math.min(...primaryFloors);
  const allSeatFloor = Math.min(...seatFloors.map((s) => s.floor));

  const primaryLabel =
    primaryFloor === 0 ? "Below Level 1" : `Level ${primaryFloor}`;
  const allSeatLabel =
    allSeatFloor === 0 ? "Below Level 1" : `Level ${allSeatFloor}`;

  // Second clause — truthful grammar for the Below Level 1 case.
  const secondClause =
    allSeatFloor === 0
      ? "at least one designated seat Below Level 1"
      : `no designated seat below ${allSeatLabel}`;

  if (allParametersReportable) {
    // Strong wording — "across every parameter"
    if (primaryFloor === 0) {
      return `At least one primary seat is Below Level 1 across every parameter, with ${secondClause}.`;
    }
    return `All primary seats meet or exceed CEDIA/CTA-RP22 ${primaryLabel} across every parameter, with ${secondClause}.`;
  }

  // Weak wording — "currently assessed CEDIA/CTA-RP22 parameters"
  if (primaryFloor === 0) {
    return `Across the currently assessed CEDIA/CTA-RP22 parameters, at least one primary seat is Below Level 1, with ${secondClause}.`;
  }
  return `Across the currently assessed CEDIA/CTA-RP22 parameters, all primary seats meet or exceed ${primaryLabel}, with ${secondClause}.`;
}

/**
 * Determine whether all 21 RP22 parameters are report-authoritative for the
 * Technical Report, based on the existing bass presentation authority.
 *
 * Bass params (P14/P18/P19/P20) are the main variable — they are "excluded"
 * when bass analysis is not yet verified/complete. P20 "N/A" (not applicable)
 * is a valid reportable result, not an exclusion.
 *
 * @param {Object} bassPresentation — from buildComplianceBassPresentation
 * @returns {boolean}
 */
export function resolveAllParametersReportable(bassPresentation) {
  if (!bassPresentation?.parameters) return false;
  const bassParams = bassPresentation.parameters;
  for (const key of ["p14", "p18", "p19", "p20"]) {
    const param = bassParams[key];
    if (!param) return false;
    const level = param.level;
    // "—" / "NOT VERIFIED" / null → not reportable
    if (!level || level === "—" || level === "NOT VERIFIED") return false;
  }
  return true;
}