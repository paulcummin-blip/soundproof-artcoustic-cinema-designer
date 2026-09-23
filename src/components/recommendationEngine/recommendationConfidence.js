// recommendationConfidence.js
// ---------------------------------------------------------------------------
// Reports recommendation robustness — NOT prediction confidence.
//
// Confidence describes how stable the recommendation is:
//   - Very High: broad improvement, large margin, multiple candidates agree
//   - High: clear improvement, good margin
//   - Moderate: improvement found but margin is smaller or fewer alternatives
//   - Low: marginal improvement, sharp minimum, or limited search
//
// This is about whether the recommendation is robust enough to apply in
// field conditions, not whether the prediction is accurate.
// ---------------------------------------------------------------------------

import { CONFIDENCE_LEVEL } from './recommendationTypes.js';
import { countFailingSeats } from '@/components/room/bass/improveBassV2/zeroFailOptimiser.js';

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

/**
 * Assess the recommendation's robustness.
 *
 * @param {object} winner - the selected winner
 * @param {object} currentResult - the baseline canonical result
 * @param {object} selection - the optimiser selection (for candidate count)
 * @returns {{ level: string, reason: string }}
 */
export function assessConfidence(winner, currentResult, selection) {
  if (!winner || !currentResult) {
    return { level: CONFIDENCE_LEVEL.LOW, reason: 'No winner or baseline available.' };
  }

  const currentFails = countFailingSeats(currentResult);
  const winnerFails = countFailingSeats(winner);
  const currentWorst = worstSeatDeviationDb(currentResult);
  const winnerWorst = worstSeatDeviationDb(winner);

  // Improvement margin
  const failReduction = currentFails - winnerFails;
  const deviationImprovement = currentWorst - winnerWorst;

  // Level improvements
  const p19Before = new Map((currentResult.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  let levelImprovements = 0;
  for (const seat of (winner.perSeatP19 || [])) {
    const before = p19Before.get(String(seat.seatId));
    if (before && numericLevel(seat.level) > numericLevel(before.level)) levelImprovements++;
  }
  const p20Before = new Map((currentResult.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  for (const seat of (winner.perSeatP20 || [])) {
    const before = p20Before.get(String(seat.seatId));
    if (before && numericLevel(seat.level) > numericLevel(before.level)) levelImprovements++;
  }

  // Candidate count — more candidates = more robust search
  const confirmedCount = (selection?.confirmedResults || []).length;
  const recommendationsCount = (selection?.recommendations || []).length;

  // Determine confidence
  let level;
  let reason;

  if (failReduction > 0 && winnerFails === 0) {
    level = CONFIDENCE_LEVEL.VERY_HIGH;
    reason = `Eliminated all ${currentFails} failing seat${currentFails > 1 ? 's' : ''}. This is a definitive engineering improvement.`;
  } else if (failReduction > 0) {
    level = CONFIDENCE_LEVEL.HIGH;
    reason = `Eliminated ${failReduction} failing seat${failReduction > 1 ? 's' : ''}. ${winnerFails} remaining.`;
  } else if (levelImprovements >= 2) {
    level = CONFIDENCE_LEVEL.HIGH;
    reason = `${levelImprovements} RP22 level improvements across seats. Clear engineering progress.`;
  } else if (levelImprovements >= 1) {
    level = CONFIDENCE_LEVEL.MODERATE;
    reason = `${levelImprovements} RP22 level improvement. The improvement is real but modest.`;
  } else if (deviationImprovement >= 3) {
    level = CONFIDENCE_LEVEL.HIGH;
    reason = `Worst seat deviation improved by ${deviationImprovement.toFixed(1)} dB. Significant response improvement.`;
  } else if (deviationImprovement >= 1) {
    level = CONFIDENCE_LEVEL.MODERATE;
    reason = `Worst seat deviation improved by ${deviationImprovement.toFixed(1)} dB. The improvement is within the same RP22 level.`;
  } else {
    level = CONFIDENCE_LEVEL.LOW;
    reason = 'No significant engineering improvement detected. The recommendation is marginal.';
  }

  // Downgrade if very few candidates were tested
  if (confirmedCount < 3 && level === CONFIDENCE_LEVEL.VERY_HIGH) {
    level = CONFIDENCE_LEVEL.HIGH;
    reason += ' (Limited search — few candidates were evaluated.)';
  } else if (confirmedCount < 3 && level === CONFIDENCE_LEVEL.HIGH) {
    level = CONFIDENCE_LEVEL.MODERATE;
    reason += ' (Limited search — few candidates were evaluated.)';
  }

  // Downgrade if the improvement is very small (sharp minimum)
  if (deviationImprovement > 0 && deviationImprovement < 0.5 && levelImprovements === 0 && failReduction === 0) {
    level = CONFIDENCE_LEVEL.LOW;
    reason = `Improvement of only ${deviationImprovement.toFixed(2)} dB. This may be a sharp minimum that is sensitive to exact calibration values.`;
  }

  return { level, reason };
}