// protectedSeatSafetyAuthority.js
// ---------------------------------------------------------------------------
// THE ONE protected primary-seat safety authority.
//
// Every optimiser surface that decides whether a candidate may become a safe
// winner, be auto-applied, be classified as a trade-off, or be stated as
// "no protected seat gets worse" consumes THIS result. No surface recalculates
// primary-seat safety itself.
//
//   confirmedRecommendationSelection.js  — candidate eligibility / winner pool
//   adiCalibrationAutoApplyAuthority.js  — Apply eligibility (regression evidence)
//   improvementResultAuthority.js         — displayed safety summary
//
// PROTECTION RULE (unchanged — do NOT invent a stricter tolerance here).
//
//   A protected (Primary) seat regresses versus the baseline when EITHER:
//     1. its displayed RP22 LEVEL drops (L4 -> L3, L2 -> L1, etc.), or
//     2. it holds the SAME displayed level but its raw deviation worsens by
//        MORE than the canonical 1.0 dB tolerance.
//
// This is the SAME rule and the SAME 1.0 dB threshold the Apply authority
// (materialityGate.js / authoritativeFinalistSelection.js hasPrimarySeatRegression)
// already trusted before this module existed. No new threshold, no new
// comparison, no acoustic maths: it reads the canonical per-seat P19/P20 values
// a confirmed result already carries and states what they prove.
//
// P19 and P20 are BOTH read per primary seat. A regression on either is a
// protected-seat regression.
//
// Pure. No React, no stores, no worker, no acoustic maths.
// ---------------------------------------------------------------------------

/** The canonical same-level raw-regression tolerance, in dB. MUST match the
 *  existing Apply-time rule (materialityGate.js / authoritativeFinalistSelection.js). */
export const PROTECTED_SEAT_RAW_REGRESSION_THRESHOLD_DB = 1.0;

/** WHY the authority returned its verdict. */
export const PROTECTED_SEAT_SAFETY_REASON = Object.freeze({
  NO_PROTECTED_SEAT_REGRESSION: "no-protected-seat-regression",
  PRIMARY_SEAT_REGRESSION: "primary-seat-regression",
  MISSING_EVIDENCE: "missing-primary-seat-evidence",
});

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function rawDeviation(seat) {
  const value = Number(seat?.variationDbRaw);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function isPrimarySeat(seat) {
  return seat?.isPrimary !== false;
}

function seatMap(rows) {
  const map = new Map();
  for (const seat of Array.isArray(rows) ? rows : []) {
    if (seat && seat.seatId !== null && seat.seatId !== undefined) {
      map.set(String(seat.seatId), seat);
    }
  }
  return map;
}

/**
 * Collect EVERY protected-seat regression a candidate causes, across both
 * per-seat metrics (P19 and P20). A regression is a level drop OR a same-level
 * raw worsening beyond the canonical 1.0 dB tolerance.
 *
 * Each finding carries the fields the Apply authority's wording already reads
 * (parameter, seatId, currentLevel, candidateLevel, rawDeltaDb), so the shared
 * result can drive the same outcome text without a second calculation.
 */
function collectProtectedSeatRegressions(candidateResult, baselineResult) {
  const findings = [];
  const metrics = [
    { parameter: "P19", candidateRows: candidateResult?.perSeatP19, baselineRows: baselineResult?.perSeatP19 },
    { parameter: "P20", candidateRows: candidateResult?.perSeatP20, baselineRows: baselineResult?.perSeatP20 },
  ];
  for (const { parameter, candidateRows, baselineRows } of metrics) {
    const baselineById = seatMap(baselineRows);
    for (const seat of Array.isArray(candidateRows) ? candidateRows : []) {
      if (!isPrimarySeat(seat)) continue;
      const baselineSeat = baselineById.get(String(seat.seatId));
      if (!baselineSeat) continue;
      const candidateLevel = numericLevel(seat.level);
      const currentLevel = numericLevel(baselineSeat.level);
      const candRaw = rawDeviation(seat);
      const curRaw = rawDeviation(baselineSeat);

      if (candidateLevel < currentLevel) {
        findings.push({
          seatId: seat.seatId,
          parameter,
          kind: "level-drop",
          currentLevel,
          candidateLevel,
          rawDeltaDb: (candRaw != null && curRaw != null) ? round1(candRaw - curRaw) : null,
        });
        continue;
      }
      // Same displayed level: a raw worsening beyond the canonical tolerance
      // is still a protected-seat regression.
      if (candidateLevel === currentLevel && candRaw != null && curRaw != null) {
        const delta = candRaw - curRaw;
        if (delta > PROTECTED_SEAT_RAW_REGRESSION_THRESHOLD_DB) {
          findings.push({
            seatId: seat.seatId,
            parameter,
            kind: "same-level-raw-regression",
            currentLevel,
            candidateLevel,
            rawDeltaDb: round1(delta),
            thresholdDb: PROTECTED_SEAT_RAW_REGRESSION_THRESHOLD_DB,
          });
        }
      }
    }
  }
  return findings;
}

function round1(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

/**
 * Whether the baseline and candidate together carry enough primary-seat
 * evidence to judge safety. A candidate with no primary seats, or a baseline
 * with no primary seats to compare against, cannot be judged safe: safe must
 * NOT default to true.
 */
function hasPrimarySeatEvidence(candidateResult, baselineResult) {
  const candidatePrimaries = [
    ...(Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : []),
    ...(Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : []),
  ].some(isPrimarySeat);
  const baselinePrimaries = [
    ...(Array.isArray(baselineResult?.perSeatP19) ? baselineResult.perSeatP19 : []),
    ...(Array.isArray(baselineResult?.perSeatP20) ? baselineResult.perSeatP20 : []),
  ].some(isPrimarySeat);
  return candidatePrimaries && baselinePrimaries;
}

/**
 * THE ONE protected primary-seat safety verdict for one candidate versus the
 * baseline the designer is shown.
 *
 * @param {object|null} candidate - a canonically confirmed candidate result
 * @param {object|null} baseline - the installed/baseline canonical result
 * @returns {{
 *   safe: boolean,
 *   evidenceComplete: boolean,
 *   protectedSeatRegressions: Array,
 *   worstRegressionDb: number|null,
 *   worstSeatId: string|null,
 *   worstParameter: string|null,
 *   reason: string,
 *   toleranceDb: number,
 * }}
 */
export function evaluateProtectedSeatSafety(candidate, baseline) {
  const toleranceDb = PROTECTED_SEAT_RAW_REGRESSION_THRESHOLD_DB;

  if (!candidate || !baseline) {
    return {
      safe: false,
      evidenceComplete: false,
      protectedSeatRegressions: [],
      worstRegressionDb: null,
      worstSeatId: null,
      worstParameter: null,
      reason: PROTECTED_SEAT_SAFETY_REASON.MISSING_EVIDENCE,
      toleranceDb,
    };
  }

  if (!hasPrimarySeatEvidence(candidate, baseline)) {
    return {
      safe: false,
      evidenceComplete: false,
      protectedSeatRegressions: [],
      worstRegressionDb: null,
      worstSeatId: null,
      worstParameter: null,
      reason: PROTECTED_SEAT_SAFETY_REASON.MISSING_EVIDENCE,
      toleranceDb,
    };
  }

  const regressions = collectProtectedSeatRegressions(candidate, baseline);
  if (!regressions.length) {
    return {
      safe: true,
      evidenceComplete: true,
      protectedSeatRegressions: [],
      worstRegressionDb: 0,
      worstSeatId: null,
      worstParameter: null,
      reason: PROTECTED_SEAT_SAFETY_REASON.NO_PROTECTED_SEAT_REGRESSION,
      toleranceDb,
    };
  }

  // The worst regression is the largest raw worsening. A level drop with no
  // raw figure is reported by its level drop (treated as +Infinity so a level
  // drop always outranks a same-level raw worsening when both are present).
  let worst = regressions[0];
  let worstMagnitude = -Infinity;
  for (const finding of regressions) {
    const magnitude = finding.rawDeltaDb != null
      ? finding.rawDeltaDb
      : (finding.kind === "level-drop" ? Number.POSITIVE_INFINITY : 0);
    if (magnitude > worstMagnitude) {
      worstMagnitude = magnitude;
      worst = finding;
    }
  }
  const worstRegressionDb = worst.rawDeltaDb != null
    ? worst.rawDeltaDb
    : null;

  return {
    safe: false,
    evidenceComplete: true,
    protectedSeatRegressions: regressions,
    worstRegressionDb,
    worstSeatId: worst.seatId,
    worstParameter: worst.parameter,
    reason: PROTECTED_SEAT_SAFETY_REASON.PRIMARY_SEAT_REGRESSION,
    toleranceDb,
  };
}

/**
 * The first regression found, in the shape the Apply authority's outcome text
 * already reads (regressed / parameter / seatId / currentLevel / candidateLevel
 * / rawDeltaDb). A safe candidate returns { regressed: false }. This keeps the
 * Apply wording identical while sourcing it from the ONE shared authority.
 */
export function protectedSeatRegressionForApply(candidate, baseline) {
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  if (safety.safe) return { regressed: false };
  const first = safety.protectedSeatRegressions[0] || null;
  if (!first) return { regressed: false };
  return {
    regressed: true,
    seatId: first.seatId,
    parameter: first.parameter,
    currentLevel: first.currentLevel,
    candidateLevel: first.candidateLevel,
    rawDeltaDb: first.rawDeltaDb ?? null,
    reason: first.kind,
  };
}