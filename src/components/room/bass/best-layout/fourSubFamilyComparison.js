// fourSubFamilyComparison.js
//
// Builds a physical comparison between the 25/75 (RP22_C) and 33/67
// (FOUR_THIRD_PAIRS) four-sub placement families from Stage 2 evaluated
// finalists. Both families are already first-class candidates in Stage 1
// and are evaluated through the identical canonical pipeline (same alignment
// authority, same seat-aware P19/P20 ranking). This module only summarises
// the already-computed results for presentation — it does not change any
// ranking, physics, or metric.
//
// The comparison uses the worst primary-seat P20 whole-dB deviation, which
// is the same authority the Stage 2 lexicographic ranking uses as its
// primary seat-consistency signal. No new scoring formula is invented.

import { FAMILY_IDS } from "../stage1/stage1FamilyRegistry";

const FAMILY_QUARTER = FAMILY_IDS.RP22_C;
const FAMILY_THIRD = FAMILY_IDS.FOUR_THIRD_PAIRS;

function worstPrimaryP20Db(finalist) {
  const seats = Array.isArray(finalist?.perSeatP20) ? finalist.perSeatP20 : [];
  const primary = seats.filter((seat) => seat?.isPrimary !== false);
  if (!primary.length) return null;
  // wholeDbDeviation is the floored whole-dB value used by the ranking and
  // the compliance UI. Fall back to floored |variationDbRaw| when absent.
  const values = primary.map((seat) => {
    const whole = Number(seat?.wholeDbDeviation);
    if (Number.isFinite(whole)) return whole;
    const raw = Number(seat?.variationDbRaw);
    return Number.isFinite(raw) ? Math.floor(Math.abs(raw)) : null;
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function worstPrimaryP19Db(finalist) {
  const seats = Array.isArray(finalist?.perSeatP19) ? finalist.perSeatP19 : [];
  const primary = seats.filter((seat) => seat?.isPrimary !== false);
  if (!primary.length) return null;
  const values = primary.map((seat) => {
    const whole = Number(seat?.wholeDbDeviation);
    if (Number.isFinite(whole)) return whole;
    const raw = Number(seat?.variationDbRaw);
    return Number.isFinite(raw) ? Math.floor(Math.abs(raw)) : null;
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function bestFinalistForFamily(evaluatedFinalists, familyId) {
  const matches = (Array.isArray(evaluatedFinalists) ? evaluatedFinalists : []).filter((f) => f?.familyId === familyId);
  if (!matches.length) return null;
  // The evaluatedFinalists are already ranked by compareStage2Results, so the
  // first match is the best-ranked finalist for that family.
  return matches[0];
}

/**
 * Build a four-sub family comparison from the Stage 2 four_sub_result.
 *
 * Returns null when either family is absent or no primary-seat P20 authority
 * is available (e.g. RSP-only assessment). The comparison is purely
 * presentational — the Stage 2 ranking already decided the winner.
 *
 * @param {object} fourSubResult - Stage 2 four_sub_result snapshot
 * @returns {object|null} comparison summary
 */
export function buildFourSubFamilyComparison(fourSubResult) {
  const finalists = fourSubResult?.evaluatedFinalists;
  if (!Array.isArray(finalists) || !finalists.length) return null;

  const quarter = bestFinalistForFamily(finalists, FAMILY_QUARTER);
  const third = bestFinalistForFamily(finalists, FAMILY_THIRD);
  if (!quarter || !third) return null;

  const quarterP20 = worstPrimaryP20Db(quarter);
  const thirdP20 = worstPrimaryP20Db(third);
  if (quarterP20 == null || thirdP20 == null) return null;

  const quarterP19 = worstPrimaryP19Db(quarter);
  const thirdP19 = worstPrimaryP19Db(third);

  // deltaDb = quarter - third. Positive = third is better (lower variation).
  const deltaDb = Number((quarterP20 - thirdP20).toFixed(2));
  const winnerFamily = deltaDb > 0.05 ? FAMILY_THIRD : deltaDb < -0.05 ? FAMILY_QUARTER : null;
  const nearEquivalent = Math.abs(deltaDb) < 1.0;

  const winnerLabel = winnerFamily === FAMILY_THIRD
    ? "33/67 (front/rear third positions)"
    : winnerFamily === FAMILY_QUARTER
      ? "25/75 (front/rear quarter positions)"
      : null;

  const loserLabel = winnerFamily === FAMILY_THIRD
    ? "25/75 (front/rear quarter positions)"
    : winnerFamily === FAMILY_QUARTER
      ? "33/67 (front/rear third positions)"
      : null;

  const explanation = winnerFamily
    ? (nearEquivalent
      ? `${winnerLabel} and ${loserLabel} are near-equivalent in this room; ${winnerLabel} is numerically better by ${Math.abs(deltaDb).toFixed(2)} dB at the worst primary seat.`
      : `${winnerLabel} improves worst primary-seat consistency by ${Math.abs(deltaDb).toFixed(2)} dB versus ${loserLabel} in this room.`)
    : `25/75 and 33/67 are effectively similar in this room (worst primary-seat difference ${Math.abs(deltaDb).toFixed(2)} dB).`;

  return {
    quarter: { familyId: FAMILY_QUARTER, worstPrimaryP20Db: quarterP20, worstPrimaryP19Db: quarterP19 },
    third: { familyId: FAMILY_THIRD, worstPrimaryP20Db: thirdP20, worstPrimaryP19Db: thirdP19 },
    deltaDb,
    winnerFamily,
    winnerLabel,
    nearEquivalent,
    explanation,
  };
}