// correctabilityClassifier.js
// ---------------------------------------------------------------------------
// ADI — Determine Correctability
//
// Classifies the dominant response feature into one of three EQ
// correctability classes. This determines whether EQ is permitted and
// whether physical changes are recommended.
//
// Class 1 — Absolute cancellation:
//   Deep null with no usable energy. Do not boost.
//   Recommend seating, movement, or additional subwoofers.
//
// Class 2 — Recoverable feature:
//   Usable energy remains. Correction compatible with design objectives.
//   Allow constrained EQ.
//
// Class 3 — Capability-limited feature:
//   Correction is mathematically possible but prevents achieving the
//   selected capability (P14) or extension (P18) objective.
//   Explain the trade-off rather than automatically applying.
//
// This module is PURE: no React, no side effects.
// It consumes the problem identification from recommendationProblem.js
// and the design objectives from the project context.
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';
import { CORRECTABILITY_CLASS, DEFAULT_MATERIALITY_THRESHOLDS } from './adiConstants';

/**
 * Classify the correctability of the dominant response feature.
 *
 * @param {object} problem - output of identifyProblem() from recommendationProblem.js
 * @param {object} currentResult - canonical result for the current design
 * @param {object} designObjectives - { p14TargetDb, p18TargetHz, p14Level, p18Basis }
 * @param {object} [thresholds] - optional override of materiality thresholds
 * @returns {{ class: string, description: string, eqAllowed: boolean, physicalRecommended: boolean }}
 */
export function classifyCorrectability(problem, currentResult, designObjectives = {}, thresholds = {}) {
  const t = { ...DEFAULT_MATERIALITY_THRESHOLDS, ...thresholds };

  if (!problem || problem.type === PROBLEM_TYPE.NONE) {
    return {
      class: null,
      description: 'No correctability issue — no significant engineering problem identified.',
      eqAllowed: false,
      physicalRecommended: false,
    };
  }

  const worstSeat = problem.worstSeat;
  const deviation = Math.abs(Number(worstSeat?.variationDbRaw) || 0);
  const freq = Number(worstSeat?.worstFrequencyHz) || 0;

  // ── Capability / Extension problems are always capability-limited ──
  // These are physical limits that calibration cannot overcome.
  if (problem.type === PROBLEM_TYPE.CAPABILITY) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: 'Capability-limited — the subwoofer cannot produce the target output level. No calibration or EQ change can overcome this physical limit.',
      eqAllowed: false,
      physicalRecommended: true,
    };
  }

  if (problem.type === PROBLEM_TYPE.EXTENSION) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: 'Capability-limited — the subwoofer cannot reach the target low-frequency extension. This requires a specification change, not EQ.',
      eqAllowed: false,
      physicalRecommended: true,
    };
  }

  // ── Class 1: Absolute cancellation ──
  // Deep null (>threshold) at a modal frequency, or a local cancellation
  // with no usable energy remaining. EQ boost cannot recover this.
  const isDeepNull = deviation > t.absoluteCancellationDb;
  const isModalOrCancellation =
    problem.type === PROBLEM_TYPE.LOCAL_CANCELLATION
    || problem.type === PROBLEM_TYPE.ROOM_MODE;

  if (isDeepNull && isModalOrCancellation) {
    return {
      class: CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION,
      description: `Absolute cancellation — a ${deviation.toFixed(1)} dB null at ${freq.toFixed(0)} Hz leaves no usable energy. EQ boost cannot recover this; physical changes are required.`,
      eqAllowed: false,
      physicalRecommended: true,
    };
  }

  // ── Class 3: Capability-limited feature ──
  // The correction would require boost that eats into P14 headroom,
  // or the problem is at the extension limit (P18).
  const p14TargetDb = Number(designObjectives.p14TargetDb) || 0;
  const p14AchievedDb = Number(currentResult?.p14AchievedDb) || 0;
  const p14Headroom = p14AchievedDb - p14TargetDb;

  // If boosting by the deviation would consume the headroom margin,
  // the correction prevents achieving the capability objective.
  if (p14TargetDb > 0 && p14Headroom < deviation + t.capabilityHeadroomMarginDb) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: `Capability-limited — correcting the ${deviation.toFixed(1)} dB deviation would require boost that consumes P14 headroom (only ${p14Headroom.toFixed(1)} dB remaining above target). The correction would prevent achieving the selected capability objective.`,
      eqAllowed: false,
      physicalRecommended: false,
    };
  }

  // Check P18 extension: if the problem frequency is at or below the
  // extension limit, EQ cannot help without risking the extension objective.
  const p18AchievedHz = Number(currentResult?.achievedP18Hz) || 0;
  if (freq > 0 && p18AchievedHz > 0 && freq < p18AchievedHz + 2) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: `Capability-limited — the problem at ${freq.toFixed(0)} Hz is at the extension limit. EQ correction would risk the P18 extension objective.`,
      eqAllowed: false,
      physicalRecommended: false,
    };
  }

  // ── Class 2: Recoverable feature ──
  // Usable energy remains and the correction is compatible with the
  // selected design objectives. Allow constrained EQ.
  return {
    class: CORRECTABILITY_CLASS.RECOVERABLE,
    description: `Recoverable — a ${deviation.toFixed(1)} dB deviation at ${freq.toFixed(0)} Hz with usable energy remaining. Constrained EQ is permitted within the design objectives.`,
    eqAllowed: true,
    physicalRecommended: false,
  };
}