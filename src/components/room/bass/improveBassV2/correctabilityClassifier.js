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
//   Very deep null (>15 dB) with negligible remaining energy, OR
//   extreme narrow null (>10 dB) at a low modal frequency (<80 Hz)
//   that is likely non-minimum-phase. Do not boost.
//   Recommend seating, movement, or additional subwoofers.
//
// Class 2 — Recoverable feature:
//   Broad depressions, moderate nulls with recoverable energy, tonal
//   imbalance, and response features that professional calibration systems
//   (Trinnov, Dirac, StormAudio, REW) would normally correct.
//   EQ is permitted because the response is physically recoverable and
//   the correction remains compatible with the selected design objectives.
//
// Class 3 — Capability-limited feature:
//   Correction is mathematically possible but prevents achieving the
//   selected capability (P14) or extension (P18) objective.
//   Explain the trade-off rather than automatically applying.
//
// The optimiser does NOT ask "Is there a null?"
// It asks: "Is this response physically recoverable, and is the
// engineering trade-off worthwhile for the selected design objective?"
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
  // Absolute cancellation: very deep null with negligible remaining energy.
  // Only truly unrecoverable nulls — not a blanket "never boost" rule.
  absoluteCancellationDb: 15.0,

  // Extreme narrow null: deep null at a low modal frequency.
  // Likely non-minimum-phase — EQ boost cannot recover the energy.
  extremeNarrowNullDb: 10.0,
  extremeNarrowNullMaxFreqHz: 80,

  capabilityHeadroomMarginDb: 1.0,
};

/**
 * Classify the correctability of the dominant response feature.
 *
 * Replaces the blanket "never boost nulls" rule with a physical-recoverability
 * assessment. The optimiser asks: "Is this response physically recoverable,
 * and is the engineering trade-off worthwhile for the selected design objective?"
 *
 * EQ is permitted for broad depressions, moderate nulls, tonal imbalance,
 * and recoverable response features that professional calibration systems
 * (Trinnov, Dirac, StormAudio, REW) would normally correct.
 *
 * EQ is NOT permitted for absolute cancellations, extreme narrow nulls
 * with negligible remaining energy, clearly non-minimum-phase behaviour,
 * or corrections that would violate the selected P14/P18 objectives.
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
  // Two pathways to absolute cancellation:
  //   a) Very deep null (>15 dB) — negligible remaining energy at any frequency.
  //   b) Extreme narrow null (>10 dB) at a low modal frequency (<80 Hz) —
  //      likely non-minimum-phase; EQ boost cannot recover the energy.
  //
  // This replaces the blanket "never boost nulls" rule. Moderate nulls
  // (6–10 dB) and broad depressions are now correctly classified as
  // recoverable, matching professional calibration practice (Trinnov,
  // Dirac, StormAudio, REW).
  const isModalOrCancellation =
    problem.type === PROBLEM_TYPE.LOCAL_CANCELLATION
    || problem.type === PROBLEM_TYPE.ROOM_MODE;

  const isAbsoluteDeepNull = deviation > t.absoluteCancellationDb;
  const isExtremeNarrowNull =
    deviation > t.extremeNarrowNullDb
    && freq > 0 && freq < t.extremeNarrowNullMaxFreqHz
    && isModalOrCancellation;

  if (isAbsoluteDeepNull || isExtremeNarrowNull) {
    const reason = isAbsoluteDeepNull
      ? `a ${deviation.toFixed(1)} dB null at ${freq.toFixed(0)} Hz leaves negligible remaining energy`
      : `a ${deviation.toFixed(1)} dB null at ${freq.toFixed(0)} Hz is an extreme narrow null at a low modal frequency — likely non-minimum-phase`;
    return {
      class: CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION,
      description: `Absolute cancellation — ${reason}. EQ boost cannot recover this; physical changes are required.`,
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
  // Broad depressions, moderate nulls with recoverable energy, tonal
  // imbalance, and response features that professional calibration systems
  // (Trinnov, Dirac, StormAudio, REW) would normally correct.
  // EQ is permitted because the response is physically recoverable and
  // the correction remains compatible with the selected design objectives.
  const featureType = deviation <= 6
    ? 'broad depression'
    : (freq > 0 && freq < t.extremeNarrowNullMaxFreqHz ? 'moderate null' : 'response feature');
  return {
    class: CORRECTABILITY_CLASS.RECOVERABLE,
    description: `Recoverable — a ${deviation.toFixed(1)} dB ${featureType} at ${freq.toFixed(0)} Hz with usable energy remaining. The response is physically recoverable; constrained EQ is permitted within the selected design objectives.`,
    eqAllowed: true,
    physicalRecommended: false,
  };
}