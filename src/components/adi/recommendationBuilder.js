// recommendationBuilder.js
// ---------------------------------------------------------------------------
// ADI — Recommendation Builder
//
// Every recommendation must contain exactly five fields:
//   1. Action — what to do
//   2. Benefit — why
//   3. Expected Engineering Effect — physical consequence
//   4. RP22 Evidence — supporting parameter changes
//   5. Remaining Limitation — what still limits the design
//
// First-class outcomes:
//   - "No further engineering changes are recommended."
//   - "No further EQ is recommended. The remaining limitation requires a physical change."
//
// These are valid recommendations, not error states.
//
// This module is PURE: no React, no side effects.
// It consumes the ADI decision pipeline output and produces the
// 5-field recommendation structure.
// ---------------------------------------------------------------------------

import { RECOMMENDATION_INTENT } from '@/components/room/bass/recommendationAuthority/recommendationAuthority';
import { LEVER_CLASS, PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';
import { CORRECTABILITY_CLASS, ADI_OUTCOME } from './adiConstants';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : 'FAIL';
}

// ── Action ──
function summariseAction(dominant, appropriateLever) {
  if (!dominant || !appropriateLever) return 'Apply the recommended changes.';

  const leverClass = appropriateLever.class;
  const lever = appropriateLever.lever;

  if (leverClass === LEVER_CLASS.CALIBRATION) {
    return 'Apply calibration.';
  }

  if (leverClass === LEVER_CLASS.PHYSICAL) {
    if (lever === 'move_subwoofer') return 'Move the subwoofers.';
    if (lever === 'move_seating') return 'Move the seating row.';
    return 'Adjust the physical layout.';
  }

  if (leverClass === LEVER_CLASS.SPECIFICATION) {
    if (lever === 'additional_subwoofer') return 'Add a subwoofer.';
    if (lever === 'different_subwoofer') return 'Change the subwoofer model.';
    return 'Change the subwoofer specification.';
  }

  return 'Apply the recommended changes.';
}

// ── Benefit ──
function deriveBenefit(problem, appropriateLever) {
  if (!problem) return 'Improves the bass response';

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return 'Increases low-frequency capability and headroom';
    case PROBLEM_TYPE.EXTENSION:
      return 'Improves low-frequency extension to meet the design target';
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return 'Reduces seat-to-seat variation and improves consistency across the seating area';
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return 'Improves response smoothness at the worst seat';
    case PROBLEM_TYPE.ROOM_MODE:
      return 'Addresses the room mode causing the worst seat deviation';
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return 'Addresses the cancellation causing a deep null at the worst seat';
    default:
      return 'Improves the bass response';
  }
}

// ── Expected Engineering Effect ──
function deriveExpectedEffect(dominant, problem) {
  if (!dominant || !problem) return 'Improved bass performance';

  const assessment = dominant.materialAssessment;
  if (assessment?.isTradeOff) {
    const imp = assessment.improvement;
    const wkn = assessment.worsening;
    if (imp && wkn) {
      const impLabel = imp.parameter === 'P19' ? 'primary seat response' : 'seat consistency';
      const wknLabel = wkn.parameter === 'P19' ? 'primary seat response' : 'seat consistency';
      return `Improves ${impLabel} but reduces ${wknLabel} — a genuine engineering trade-off`;
    }
  }

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return 'Greater extension and output capability';
    case PROBLEM_TYPE.EXTENSION:
      return 'Deeper bass extension within the target capability';
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return 'Tighter, more consistent bass across all seats';
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return 'Smoother response at the worst seat';
    case PROBLEM_TYPE.ROOM_MODE:
      return 'Reduced modal excitation at the worst seat';
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return 'Recovered energy at the cancellation frequency';
    default:
      return 'Improved bass performance';
  }
}

// ── RP22 Evidence ──
function deriveRp22Evidence(dominant, currentResult) {
  if (!dominant?.result || !currentResult) return 'RP22 results available after recalculation';

  const candidateP19 = Array.isArray(dominant.result.perSeatP19) ? dominant.result.perSeatP19 : [];
  const currentP19Map = new Map((currentResult.perSeatP19 || []).map(s => [String(s.seatId), s]));
  const currentP20Map = new Map((currentResult.perSeatP20 || []).map(s => [String(s.seatId), s]));

  const changes = [];

  for (const seat of candidateP19) {
    const cur = currentP19Map.get(String(seat.seatId));
    if (!cur) continue;
    const candLevel = numericLevel(seat.level);
    const curLevel = numericLevel(cur.level);
    if (candLevel > curLevel) {
      changes.push(`P19 ${seat.seatId}: ${levelText(curLevel)}→${levelText(candLevel)}`);
    } else if (candLevel === curLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      const delta = curRaw - candRaw;
      if (delta >= 1.0) {
        changes.push(`P19 ${seat.seatId}: ${curRaw.toFixed(1)}→${candRaw.toFixed(1)} dB`);
      }
    }
  }

  for (const seat of (dominant.result.perSeatP20 || [])) {
    const cur = currentP20Map.get(String(seat.seatId));
    if (!cur) continue;
    const candLevel = numericLevel(seat.level);
    const curLevel = numericLevel(cur.level);
    if (candLevel > curLevel) {
      changes.push(`P20 ${seat.seatId}: ${levelText(curLevel)}→${levelText(candLevel)}`);
    } else if (candLevel === curLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      const delta = curRaw - candRaw;
      if (delta >= 1.0) {
        changes.push(`P20 ${seat.seatId}: ${curRaw.toFixed(1)}→${candRaw.toFixed(1)} dB`);
      }
    }
  }

  if (changes.length === 0) return 'RP22 results available after recalculation';
  return changes.join('; ');
}

// ── Remaining Limitation ──
function deriveRemainingLimitation(problem, correctability, candidateResult, designObjectives) {
  if (!problem) return 'No significant limitation identified';

  const freq = Number(problem.worstSeat?.worstFrequencyHz) || 0;

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return 'Subwoofer capability remains the limiting factor. The system cannot exceed the physical output of the current subwoofer(s).';
    case PROBLEM_TYPE.EXTENSION:
      return 'Low-frequency extension remains limited by the subwoofer capability. Deeper extension requires a different subwoofer.';
    case PROBLEM_TYPE.ROOM_MODE:
      return freq > 0
        ? `A room mode at ${freq.toFixed(0)} Hz still affects the response. Complete elimination may require additional subwoofers.`
        : 'Room mode interaction still affects the response.';
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return correctability?.class === CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION
        ? 'A physically unrecoverable cancellation remains — EQ cannot recover this. Physical changes or additional subwoofers are required.'
        : 'A local cancellation still affects the worst seat.';
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return 'Some seat-to-seat variation remains inherent to the room geometry and subwoofer count.';
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return 'Some response deviation remains at the worst seat.';
    default:
      return 'No significant limitation identified';
  }
}

// ── Main builder ──

/**
 * Build a 5-field recommendation from the ADI decision pipeline output.
 *
 * @param {object} params
 * @param {object} params.dominant - the dominant candidate
 * @param {object} params.problem - diagnosed physical problem
 * @param {object} params.physicalCause - inferred physical cause
 * @param {object} params.correctability - correctability classification
 * @param {object} params.appropriateLever - the appropriate engineering lever
 * @param {object} params.currentResult - baseline canonical result
 * @param {object} params.designObjectives - P14/P18 design objectives
 * @returns {{ action: string, benefit: string, expectedEngineeringEffect: string, rp22Evidence: string, remainingLimitation: string }}
 */
export function buildRecommendation(params) {
  const { dominant, problem, correctability, appropriateLever, currentResult, designObjectives } = params;

  return {
    action: summariseAction(dominant, appropriateLever),
    benefit: deriveBenefit(problem, appropriateLever),
    expectedEngineeringEffect: deriveExpectedEffect(dominant, problem),
    rp22Evidence: deriveRp22Evidence(dominant, currentResult),
    remainingLimitation: deriveRemainingLimitation(problem, correctability, dominant?.result, designObjectives),
  };
}

/**
 * Build a "No further engineering changes" recommendation.
 * This is a first-class outcome — not an error state.
 */
export function buildNoFurtherEngineering() {
  return {
    action: 'No further engineering changes are recommended.',
    benefit: '',
    expectedEngineeringEffect: '',
    rp22Evidence: '',
    remainingLimitation: '',
  };
}

/**
 * Build a "No further EQ is recommended" recommendation.
 * This is a first-class outcome — the remaining limitation requires a physical change.
 */
export function buildNoFurtherEq() {
  return {
    action: 'No further engineering changes are recommended.',
    benefit: '',
    expectedEngineeringEffect: '',
    rp22Evidence: '',
    remainingLimitation: '',
  };
}