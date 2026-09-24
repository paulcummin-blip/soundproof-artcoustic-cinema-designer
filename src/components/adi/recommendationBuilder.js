// recommendationBuilder.js
// ---------------------------------------------------------------------------
// ADI — Recommendation Builder
//
// Every recommendation must contain exactly five fields:
//   1. Assessment — the designer's conclusion (not a diagnosis)
//   2. Action — what to do (specific, never vague)
//   3. Why — the physical cause
//   4. RP22 Evidence — visual before → after parameter changes
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

// ── Assessment (what is happening) ──
function deriveAssessment(problem) {
  if (!problem) return '';

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return 'The current subwoofers cannot achieve the target bass level.';
    case PROBLEM_TYPE.EXTENSION:
      return 'The current subwoofers cannot reach the target bass extension.';
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return 'The current layout produces inconsistent bass across the seating area.';
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return 'The bass response is uneven at the worst seat.';
    case PROBLEM_TYPE.ROOM_MODE:
      return 'The room\u2019s natural resonance is causing uneven bass at the worst seat.';
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return 'A deep null in the bass response affects the worst seat.';
    default:
      return '';
  }
}

// ── Recommendation (what to do) ──
function summariseAction(dominant, appropriateLever) {
  if (!dominant || !appropriateLever) return '';

  const leverClass = appropriateLever.class;
  const lever = appropriateLever.lever;

  if (leverClass === LEVER_CLASS.CALIBRATION) {
    return 'Apply the recommended equalisation.';
  }

  if (leverClass === LEVER_CLASS.PHYSICAL) {
    if (lever === 'move_subwoofer') return 'Move the subwoofers.';
    if (lever === 'move_seating') return 'Move the seating row.';
    return 'Adjust the subwoofer or seating positions.';
  }

  if (leverClass === LEVER_CLASS.SPECIFICATION) {
    if (lever === 'additional_subwoofer') return 'Add a subwoofer.';
    if (lever === 'different_subwoofer') return 'Change the subwoofer model.';
    return 'Change the subwoofer specification.';
  }

  return '';
}

// ── RP22 Evidence ──
function deriveRp22Evidence(dominant, currentResult) {
  if (!dominant?.result || !currentResult) return [];

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
      changes.push({ parameter: 'P19', from: levelText(curLevel), to: levelText(candLevel) });
    } else if (candLevel === curLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      const delta = curRaw - candRaw;
      if (delta >= 1.0) {
        changes.push({ parameter: 'P19', from: `${curRaw.toFixed(1)} dB`, to: `${candRaw.toFixed(1)} dB` });
      }
    }
  }

  for (const seat of (dominant.result.perSeatP20 || [])) {
    const cur = currentP20Map.get(String(seat.seatId));
    if (!cur) continue;
    const candLevel = numericLevel(seat.level);
    const curLevel = numericLevel(cur.level);
    if (candLevel > curLevel) {
      changes.push({ parameter: 'P20', from: levelText(curLevel), to: levelText(candLevel) });
    } else if (candLevel === curLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      const delta = curRaw - candRaw;
      if (delta >= 1.0) {
        changes.push({ parameter: 'P20', from: `${curRaw.toFixed(1)} dB`, to: `${candRaw.toFixed(1)} dB` });
      }
    }
  }

  return changes;
}

// ── Remaining Limitation ──
function deriveRemainingLimitation(problem, correctability, candidateResult, designObjectives) {
  if (!problem) return '';

  const freq = Number(problem.worstSeat?.worstFrequencyHz) || 0;

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return 'The system cannot exceed the physical output of the current subwoofer(s). Louder or deeper bass requires a different or additional subwoofer.';
    case PROBLEM_TYPE.EXTENSION:
      return 'Bass extension is limited by the subwoofer capability. Deeper extension requires a different subwoofer.';
    case PROBLEM_TYPE.ROOM_MODE:
      return freq > 0
        ? `A room mode at ${freq.toFixed(0)} Hz still affects the response. Full elimination may require additional subwoofers.`
        : 'Room mode interaction still affects the response.';
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return correctability?.class === CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION
        ? 'A physically unrecoverable cancellation remains. EQ cannot fix this — a physical change is required.'
        : 'A local cancellation still affects the worst seat.';
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return 'Some seat-to-seat variation is inherent to the room geometry and subwoofer count.';
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return 'Some response deviation remains at the worst seat.';
    default:
      return '';
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
 * @returns {{ assessment: string, action: string, why: string, rp22Evidence: Array, remainingLimitation: string }}
 */
export function buildRecommendation(params) {
  const { dominant, problem, physicalCause, correctability, appropriateLever, currentResult, designObjectives } = params;

  return {
    assessment: deriveAssessment(problem),
    action: summariseAction(dominant, appropriateLever),
    why: physicalCause?.description || '',
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
    assessment: '',
    why: '',
    rp22Evidence: [],
    remainingLimitation: '',
  };
}

/**
 * Build a "No further EQ is recommended" recommendation.
 * This is a first-class outcome — the remaining limitation requires a physical change.
 */
export function buildNoFurtherEq() {
  return {
    action: 'No further EQ is recommended.',
    assessment: '',
    why: '',
    rp22Evidence: [],
    remainingLimitation: 'The remaining limitation requires a physical change.',
  };
}