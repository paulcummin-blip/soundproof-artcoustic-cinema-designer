// correctabilityClassifier.js
// ---------------------------------------------------------------------------
// Optimiser — EQ Correctability Classification
//
// Classifies the dominant response feature into one of three EQ
// correctability classes. This determines whether EQ is permitted and
// whether physical changes are recommended during the optimiser's search.
//
// The optimiser owns correctability. ADI consumes this classification and
// restates it in plain engineering language. ADI never classifies.
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
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';

// ── EQ Correctability Classes ─────────────────────────────────────────────
// Owned by the optimiser. Re-exported by adiConstants for ADI to restate.

export const CORRECTABILITY_CLASS = {
  ABSOLUTE_CANCELLATION: 'absolute_cancellation',
  RECOVERABLE: 'recoverable',
  CAPABILITY_LIMITED: 'capability_limited',
};

// ── Thresholds ─────────────────────────────────────────────────────────────
// Materiality thresholds are empirical and configurable. The optimiser owns
// these as the single authoritative implementation.

export const CORRECTABILITY_THRESHOLDS = {
  absoluteCancellationDb: 6.0,
  capabilityHeadroomMarginDb: 1.0,
};

/**
 * Classify the correctability of the dominant response feature.
 *
 * Called by the optimiser after its search completes. The result is included
 * in the selection object and consumed by ADI as part of the authoritative
 * optimiser result.
 *
 * @param {object} problem - output of identifyProblem() from recommendationProblem.js
 * @param {object} currentResult - canonical result for the current design
 * @param {object} designObjectives - { p14TargetDb, p18TargetHz, p14Level, p18Basis }
 * @param {object} [thresholds] - optional override of thresholds
 * @returns {{ class: string, description: string, eqAllowed: boolean, physicalRecommended: boolean }}
 */
export function classifyCorrectability(problem, currentResult, designObjectives = {}, thresholds = {}) {
  const t = { ...CORRECTABILITY_THRESHOLDS, ...thresholds };

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
  const p14TargetDb = Number(designObjectives.p14TargetDb) || 0;
  const p14AchievedDb = Number(currentResult?.p14AchievedDb) || 0;
  const p14Headroom = p14AchievedDb - p14TargetDb;

  if (p14TargetDb > 0 && p14Headroom < deviation + t.capabilityHeadroomMarginDb) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: `Capability-limited — correcting the ${deviation.toFixed(1)} dB deviation would require boost that consumes P14 headroom (only ${p14Headroom.toFixed(1)} dB remaining above target). The correction would prevent achieving the selected capability objective.`,
      eqAllowed: false,
      physicalRecommended: false,
    };
  }

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
  return {
    class: CORRECTABILITY_CLASS.RECOVERABLE,
    description: `Recoverable — a ${deviation.toFixed(1)} dB deviation at ${freq.toFixed(0)} Hz with usable energy remaining. Constrained EQ is permitted within the design objectives.`,
    eqAllowed: true,
    physicalRecommended: false,
  };
}