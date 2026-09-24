// engineeringDominance.js
// ---------------------------------------------------------------------------
// ADI — Compare Engineering Outcomes & Select Dominant Solution
//
// Ranking uses engineering dominance, NOT a single weighted score.
// Criteria are evaluated in this exact order:
//   1. Physically correct — addresses the diagnosed physical cause
//   2. Simpler — fewer changes (calibration < physical < specification)
//   3. More robust — less sensitive to small changes
//   4. Less invasive — fewer subwoofers moved/added
//   5. RP22 result — better P19/P20 outcomes (last tiebreak only)
//
// The first criterion that differs between two candidates determines
// the winner. RP22 is only consulted when all engineering criteria tie.
//
// This module is PURE: no React, no side effects.
// ---------------------------------------------------------------------------

import { LEVER_CLASS, PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';
import { LEVER_HIERARCHY_ORDER, DOMINANCE_CRITERION } from './adiConstants';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

// ── Criterion 1: Physically correct ──
// Does the candidate's lever class match the diagnosed physical cause?
// A calibration lever cannot fix a capability problem.
// A specification lever is overkill for a calibration-addressable problem.
function isPhysicallyCorrect(candidate, problem) {
  if (!problem || !candidate) return true;
  const leverClass = candidate.leverClass || LEVER_CLASS.CALIBRATION;

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return leverClass === LEVER_CLASS.SPECIFICATION;
    case PROBLEM_TYPE.EXTENSION:
      return leverClass === LEVER_CLASS.SPECIFICATION || leverClass === LEVER_CLASS.PHYSICAL;
    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      return leverClass === LEVER_CLASS.CALIBRATION || leverClass === LEVER_CLASS.PHYSICAL;
    case PROBLEM_TYPE.ROOM_MODE:
      return leverClass === LEVER_CLASS.PHYSICAL || leverClass === LEVER_CLASS.CALIBRATION;
    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      return leverClass === LEVER_CLASS.PHYSICAL || leverClass === LEVER_CLASS.SPECIFICATION;
    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      return leverClass === LEVER_CLASS.CALIBRATION || leverClass === LEVER_CLASS.PHYSICAL;
    default:
      return true;
  }
}

function comparePhysicallyCorrect(candidateA, candidateB, problem) {
  const aCorrect = isPhysicallyCorrect(candidateA, problem);
  const bCorrect = isPhysicallyCorrect(candidateB, problem);
  if (aCorrect && !bCorrect) return -1;
  if (!aCorrect && bCorrect) return 1;
  return 0;
}

// ── Criterion 2: Simpler ──
// Fewer changes. Calibration < Physical < Specification.
function leverClassRank(leverClass) {
  if (leverClass === LEVER_CLASS.CALIBRATION) return LEVER_HIERARCHY_ORDER.CALIBRATION;
  if (leverClass === LEVER_CLASS.PHYSICAL) return LEVER_HIERARCHY_ORDER.PHYSICAL;
  if (leverClass === LEVER_CLASS.SPECIFICATION) return LEVER_HIERARCHY_ORDER.SPECIFICATION;
  return 99;
}

function compareSimpler(candidateA, candidateB) {
  const aRank = leverClassRank(candidateA?.leverClass);
  const bRank = leverClassRank(candidateB?.leverClass);
  if (aRank < bRank) return -1;
  if (aRank > bRank) return 1;
  return 0;
}

// ── Criterion 3: More robust ──
// Less sensitive to small changes. Candidates with smaller calibration
// changes (less delay, less gain, less phase) are more robust.
function robustnessScore(candidate) {
  const values = candidate?.recommendationValues;
  if (!Array.isArray(values)) return 0;
  let score = 0;
  for (const v of values) {
    score += Math.abs(Number(v?.delayMs) || 0) * 0.5;   // ms → weight
    score += Math.abs(Number(v?.gainDb) || 0) * 2;       // dB → weight
    score += Math.abs(Number(v?.phaseControlDeg) || 0) * 0.02; // deg → weight
  }
  return score;
}

function compareMoreRobust(candidateA, candidateB) {
  const aScore = robustnessScore(candidateA);
  const bScore = robustnessScore(candidateB);
  if (aScore < bScore) return -1;
  if (aScore > bScore) return 1;
  return 0;
}

// ── Criterion 4: Less invasive ──
// Fewer subwoofers moved/added. Count the number of changed instances.
function invasivenessScore(candidate) {
  const values = candidate?.recommendationValues;
  if (!Array.isArray(values)) return 0;
  return values.filter(v => {
    const delay = Number(v?.delayMs) || 0;
    const gain = Number(v?.gainDb) || 0;
    const polarity = Number(v?.polarity) || 1;
    const phase = Number(v?.phaseControlDeg) || 0;
    return delay !== 0 || gain !== 0 || polarity < 0 || phase !== 0;
  }).length;
}

function compareLessInvasive(candidateA, candidateB) {
  const aScore = invasivenessScore(candidateA);
  const bScore = invasivenessScore(candidateB);
  if (aScore < bScore) return -1;
  if (aScore > bScore) return 1;
  return 0;
}

// ── Criterion 5: RP22 result (last tiebreak only) ──
// Better P19/P20 outcomes. Compare worst-seat levels, then raw deviations.
function rp22Score(candidate) {
  const result = candidate?.result;
  if (!result) return 0;
  const p19 = Array.isArray(result.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result.perSeatP20) ? result.perSeatP20 : [];

  let levelSum = 0;
  let deviationSum = 0;
  for (const seat of p19) {
    levelSum += numericLevel(seat.level);
    deviationSum += Math.abs(Number(seat.variationDbRaw) || 0);
  }
  for (const seat of p20) {
    levelSum += numericLevel(seat.level);
    deviationSum += Math.abs(Number(seat.variationDbRaw) || 0);
  }
  // Higher level = better. Lower deviation = better.
  // Return a composite where higher = better.
  return levelSum * 100 - deviationSum;
}

function compareRp22(candidateA, candidateB) {
  const aScore = rp22Score(candidateA);
  const bScore = rp22Score(candidateB);
  if (aScore > bScore) return -1;
  if (aScore < bScore) return 1;
  return 0;
}

/**
 * Compare two candidates by engineering dominance.
 *
 * Returns -1 if A dominates B, 1 if B dominates A, 0 if tied.
 * Criteria are evaluated in order; the first difference wins.
 *
 * @param {object} candidateA
 * @param {object} candidateB
 * @param {object} problem - the diagnosed physical problem
 * @returns {-1 | 0 | 1}
 */
export function compareByDominance(candidateA, candidateB, problem) {
  // 1. Physically correct
  let cmp = comparePhysicallyCorrect(candidateA, candidateB, problem);
  if (cmp !== 0) return cmp;

  // 2. Simpler
  cmp = compareSimpler(candidateA, candidateB);
  if (cmp !== 0) return cmp;

  // 3. More robust
  cmp = compareMoreRobust(candidateA, candidateB);
  if (cmp !== 0) return cmp;

  // 4. Less invasive
  cmp = compareLessInvasive(candidateA, candidateB);
  if (cmp !== 0) return cmp;

  // 5. RP22 result (last tiebreak only)
  cmp = compareRp22(candidateA, candidateB);
  return cmp;
}

/**
 * Rank candidates by engineering dominance.
 *
 * @param {Array} candidates - array of candidate objects
 * @param {object} problem - the diagnosed physical problem
 * @returns {Array} sorted array (dominant first)
 */
export function rankByDominance(candidates, problem) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  return [...candidates].sort((a, b) => compareByDominance(a, b, problem));
}