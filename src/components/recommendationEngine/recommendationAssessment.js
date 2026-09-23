// recommendationAssessment.js
// ---------------------------------------------------------------------------
// Determines whether the current design is already good enough.
//
// This is an engineering assessment, NOT an RP22 level. It evaluates the
// physical state of the bass response: failing seats, worst-seat deviation,
// extension, and headroom. The assessment is the first stage of the
// Recommendation Engine — it gates the "No Recommendation" outcome.
//
// This module reads ONLY from the existing canonical result. It never
// recalculates.
// ---------------------------------------------------------------------------

import { ASSESSMENT_RATING } from './recommendationTypes.js';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function worstSeatDeviationDb(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function worstPrimarySeatDeviationDb(result) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter((s) => s.isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter((s) => s.isPrimary);
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function countFailingSeats(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  const p19Fail = new Set(p19.filter((s) => numericLevel(s.level) === 0).map((s) => String(s.seatId)));
  const p20Fail = new Set(p20.filter((s) => numericLevel(s.level) === 0).map((s) => String(s.seatId)));
  const allIds = new Set([...p19.map((s) => String(s.seatId)), ...p20.map((s) => String(s.seatId))]);
  let count = 0;
  for (const id of allIds) {
    if (p19Fail.has(id) || p20Fail.has(id)) count++;
  }
  return count;
}

function p18ExtensionHz(result) {
  return Number(result?.achievedP18Hz) || 0;
}

function p14HeadroomDb(result) {
  return Number(result?.p14AchievedDb) || 0;
}

function seatVariationSpreadDb(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  if (p19.length < 2) return 0;
  const raws = p19.map((s) => Math.abs(Number(s?.variationDbRaw) || 0));
  return Math.max(...raws) - Math.min(...raws);
}

/**
 * Assess the current design's engineering state.
 *
 * @param {object} currentResult - canonical result for the current design
 * @param {object} [context] - optional context (p14TargetDb, p18TargetHz)
 * @returns {{ rating: string, summary: string, metrics: object }}
 */
export function assessDesign(currentResult, context = {}) {
  if (!currentResult) {
    return {
      rating: ASSESSMENT_RATING.POOR,
      summary: 'No engineering results available for assessment.',
      metrics: null,
    };
  }

  const failingSeats = countFailingSeats(currentResult);
  const worstAll = worstSeatDeviationDb(currentResult);
  const worstPrimary = worstPrimarySeatDeviationDb(currentResult);
  const variationSpread = seatVariationSpreadDb(currentResult);
  const p18Hz = p18ExtensionHz(currentResult);
  const p14Db = p14HeadroomDb(currentResult);
  const p14TargetDb = Number(context.p14TargetDb) || 0;
  const p18TargetHz = Number(context.p18TargetHz) || 0;

  const metrics = {
    failingSeats,
    worstSeatDeviationDb: worstAll,
    worstPrimarySeatDeviationDb: worstPrimary,
    seatVariationSpreadDb: variationSpread,
    p18ExtensionHz: p18Hz,
    p14HeadroomDb: p14Db,
    p14TargetDb,
    p18TargetHz,
  };

  // Assessment hierarchy — worst condition determines the rating.
  let rating;
  let summary;

  if (failingSeats >= 2 || worstAll > 8) {
    rating = ASSESSMENT_RATING.POOR;
    summary = failingSeats >= 2
      ? `${failingSeats} seats fail P19 or P20. The bass response requires significant engineering attention.`
      : `Worst seat deviation is ${worstAll.toFixed(1)} dB. The bass response has severe response issues.`;
  } else if (failingSeats >= 1 || worstAll > 5 || (p18TargetHz > 0 && p18Hz < p18TargetHz - 2)) {
    rating = ASSESSMENT_RATING.LIMITED;
    const parts = [];
    if (failingSeats >= 1) parts.push(`${failingSeats} seat${failingSeats > 1 ? 's' : ''} fail P19 or P20`);
    if (worstAll > 5) parts.push(`worst seat deviation ${worstAll.toFixed(1)} dB`);
    if (p18TargetHz > 0 && p18Hz < p18TargetHz - 2) parts.push(`extension below target (${p18Hz.toFixed(0)} Hz vs ${p18TargetHz.toFixed(0)} Hz)`);
    summary = `${parts.join(', ')}. The bass response is limited and would benefit from engineering attention.`;
  } else if (worstAll > 3 || variationSpread > 2) {
    rating = ASSESSMENT_RATING.ACCEPTABLE;
    const parts = [];
    if (worstAll > 3) parts.push(`worst seat deviation ${worstAll.toFixed(1)} dB`);
    if (variationSpread > 2) parts.push(`seat-to-seat variation ${variationSpread.toFixed(1)} dB`);
    summary = `${parts.join(', ')}. The bass response is acceptable but has room for improvement.`;
  } else if (worstAll > 2 || variationSpread > 1) {
    rating = ASSESSMENT_RATING.GOOD;
    summary = `Worst seat deviation ${worstAll.toFixed(1)} dB, seat-to-seat variation ${variationSpread.toFixed(1)} dB. The bass response is well-optimised with minor refinement possible.`;
  } else {
    rating = ASSESSMENT_RATING.EXCELLENT;
    summary = `Worst seat deviation ${worstAll.toFixed(1)} dB, seat-to-seat variation ${variationSpread.toFixed(1)} dB. The bass response is excellent.`;
  }

  return { rating, summary, metrics };
}

/**
 * Check if the assessment rating indicates the design is already good enough
 * for the "No Recommendation" gate.
 */
export function isGoodEnough(rating) {
  return rating === ASSESSMENT_RATING.EXCELLENT || rating === ASSESSMENT_RATING.GOOD;
}