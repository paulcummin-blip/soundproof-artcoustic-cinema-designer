// materialityGate.js
// Canonical user-facing materiality assessment for calibration-only improvements.
//
// A candidate is MATERIAL when, without meaningful regression:
//   A. any relevant P19/P20 displayed level improves;
//   B. levels remain identical but worst-seat deviation improves by >= 1.0 dB;
//   C. a severe response problem/null improves by >= 3 dB with no new significant problem.
//
// Headroom (P14) is NOT an independent user-facing materiality qualifier.
// It belongs in safety, ranking/tiebreaking, and avoiding excessive
// calibration cost — but it must not independently cause MATERIAL = true.
//
// A 0.15 dB Pareto tolerance may remain internally for numerical comparisons.
// Do NOT surface 0.2-0.5 dB cosmetic wins as a recommendation.

const LEVEL_IMPROVEMENT = 1;      // any level increase is material
const WITHIN_LEVEL_THRESHOLD_DB = 1.0;  // >= 1.0 dB within same level
const SEVERE_NULL_THRESHOLD_DB = 3.0;   // >= 3.0 dB null reduction
const NEW_PROBLEM_THRESHOLD_DB = 1.0;    // new problem if deviation worsens > this

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function worstSeatDeviation(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function worstPrimarySeatDeviation(result) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter(s => s.isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter(s => s.isPrimary);
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

// Same-level raw-regression threshold: a primary seat that stays in the same
// displayed level but whose raw deviation worsens by MORE than this is rejected.
// Must match authoritativeFinalistSelection.js — do not create two tolerances.
const PRIMARY_RAW_REGRESSION_THRESHOLD_DB = 1.0;

function hasPrimarySeatRegression(currentResult, candidateResult) {
  const currentP19 = new Map((currentResult?.perSeatP19 || []).map(s => [String(s.seatId), s]));
  const currentP20 = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));

  for (const seat of (candidateResult?.perSeatP19 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP19.get(String(seat.seatId));
    if (!cur) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(cur.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel };
    }
    // Same-level raw-regression guard: reject if raw deviation worsens by
    // > 1.0 dB while remaining in the same displayed level.
    if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      if (Number.isFinite(candRaw) && Number.isFinite(curRaw)
        && (candRaw - curRaw) > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
        return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel,
          rawDeltaDb: candRaw - curRaw, reason: "same-level raw regression" };
      }
    }
  }
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP20.get(String(seat.seatId));
    if (!cur) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(cur.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel };
    }
    // Same-level raw-regression guard
    if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      if (Number.isFinite(candRaw) && Number.isFinite(curRaw)
        && (candRaw - curRaw) > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
        return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel,
          rawDeltaDb: candRaw - curRaw, reason: "same-level raw regression" };
      }
    }
  }
  return { regressed: false };
}

function hasNewSignificantProblem(currentResult, candidateResult) {
  const currentP19 = new Map((currentResult?.perSeatP19 || []).map(s => [String(s.seatId), s]));
  const currentP20 = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));

  for (const seat of (candidateResult?.perSeatP19 || [])) {
    const cur = currentP19.get(String(seat.seatId));
    const curVar = Math.abs(Number(cur?.variationDbRaw) || 0);
    const candVar = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (candVar > curVar + NEW_PROBLEM_THRESHOLD_DB) return true;
  }
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    const cur = currentP20.get(String(seat.seatId));
    const curVar = Math.abs(Number(cur?.variationDbRaw) || 0);
    const candVar = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (candVar > curVar + NEW_PROBLEM_THRESHOLD_DB) return true;
  }
  return false;
}

/**
 * Assess whether a calibration-only candidate is a MATERIAL improvement
 * over the current installed tuning.
 *
 * @param {object} currentResult - canonical result with installed tuning
 * @param {object} candidateResult - canonical result with searched tuning
 * @returns {{ material: boolean, reason: string, details?: object }}
 */
export function isMaterialImprovement(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) {
    return { material: false, reason: "Missing result data" };
  }

  // Check for primary-seat regression (hard veto)
  const regression = hasPrimarySeatRegression(currentResult, candidateResult);
  if (regression.regressed) {
    return {
      material: false,
      reason: regression.reason
        ? `Primary seat ${regression.seatId} ${regression.parameter} ${regression.reason} (+${(regression.rawDeltaDb || 0).toFixed(2)} dB)`
        : `Primary seat ${regression.seatId} ${regression.parameter} regression (L${regression.currentLevel} -> L${regression.candidateLevel})`,
      details: regression,
    };
  }

  const currentP19Level = numericLevel(currentResult.achievedP19Level);
  const candidateP19Level = numericLevel(candidateResult.achievedP19Level);
  const currentP20Level = numericLevel(currentResult.achievedP20Level);
  const candidateP20Level = numericLevel(candidateResult.achievedP20Level);

  // A. Any relevant P19/P20 displayed level improves
  if (candidateP19Level > currentP19Level || candidateP20Level > currentP20Level) {
    const improvements = [];
    if (candidateP19Level > currentP19Level) improvements.push(`P19 L${currentP19Level} -> L${candidateP19Level}`);
    if (candidateP20Level > currentP20Level) improvements.push(`P20 L${currentP20Level} -> L${candidateP20Level}`);
    return { material: true, reason: `Level improvement: ${improvements.join(", ")}` };
  }

  // B. Same levels, worst-seat deviation improves by >= 1.0 dB
  if (candidateP19Level === currentP19Level && candidateP20Level === currentP20Level) {
    const currentWorst = worstPrimarySeatDeviation(currentResult);
    const candidateWorst = worstPrimarySeatDeviation(candidateResult);
    const improvement = currentWorst - candidateWorst;
    if (improvement >= WITHIN_LEVEL_THRESHOLD_DB) {
      return { material: true, reason: `Worst-seat deviation improved by ${improvement.toFixed(1)} dB`, details: { currentWorst, candidateWorst, improvement } };
    }
  }

  // C. Severe null improves >= 3 dB with no new significant problem
  const currentWorstAll = worstSeatDeviation(currentResult);
  const candidateWorstAll = worstSeatDeviation(candidateResult);
  const nullReduction = currentWorstAll - candidateWorstAll;
  if (nullReduction >= SEVERE_NULL_THRESHOLD_DB && !hasNewSignificantProblem(currentResult, candidateResult)) {
    return { material: true, reason: `Severe null reduced by ${nullReduction.toFixed(1)} dB`, details: { currentWorstAll, candidateWorstAll, nullReduction } };
  }

  // D. Headroom is NOT an independent user-facing materiality qualifier.
  // It belongs in safety, ranking/tiebreaking, and avoiding excessive
  // calibration cost — but it must not independently cause MATERIAL = true.
  // A recommendation that only improves headroom without any P19/P20 level
  // or deviation improvement is NOT a user-facing recommendation.

  return { material: false, reason: "No material calibration improvement" };
}