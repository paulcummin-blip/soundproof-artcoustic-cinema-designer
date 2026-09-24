// correctabilityClassifier.js
// ---------------------------------------------------------------------------
// Optimiser — Physical Recoverability Assessment (Layer 1)
//
// Assesses whether the dominant response feature is physically recoverable.
// This is a PHYSICS ASSESSMENT, not an engineering decision.
//
// This layer does NOT decide whether EQ will be applied.
// It determines only whether the response feature is physically recoverable.
//
// The engineering decision — how much of the physically recoverable response
// should actually be corrected — is made by Layer 2 (Engineering Optimisation),
// which respects the selected P14/P18 design objectives, available capability,
// available extension, and available headroom.
//
// The optimiser owns this assessment. ADI consumes it and restates it in plain
// engineering language. ADI never assesses.
//
// Physical Recoverability Classes:
//
// Class 1 — Not physically recoverable (absolute cancellation):
//   Very deep null (>15 dB) with negligible remaining energy, OR
//   extreme narrow null (>10 dB) at a low modal frequency (<80 Hz)
//   that is likely non-minimum-phase.
//   EQ cannot recover this. Physical changes are required.
//
// Class 2 — Physically recoverable:
//   Broad depressions, moderate nulls with recoverable energy, tonal
//   imbalance, and response features that professional calibration systems
//   (Trinnov, Dirac, StormAudio, REW) would normally correct.
//   The response is physically recoverable. Whether EQ is actually applied,
//   and how much, is decided by Layer 2 (Engineering Optimisation) based on
//   the selected P14/P18 design objectives and available capability.
//
// Class 3 — Capability-limited (physically recoverable but constrained):
//   The feature is physically recoverable, but full correction would
//   compromise the selected capability (P14) or extension (P18) objective.
//   Layer 2 (Engineering Optimisation) limits the correction to preserve
//   the selected design objectives.
//
// Physics determines: Physical Recoverability (this layer)
// The optimiser determines: Engineering Optimisation (Layer 2)
// RP22 reports: Engineering Outcome
// ADI explains: Engineering Reasoning
//
// This module is PURE: no React, no side effects.
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';

// ── Physical Recoverability Classes ───────────────────────────────────────
// Owned by the optimiser (Layer 1). Re-exported by adiConstants for ADI to restate.

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
 * Layer 1 — Physical Recoverability Assessment.
 *
 * This function assesses whether the dominant response feature is physically
 * recoverable. It does NOT decide whether EQ will be applied — that is the
 * role of Layer 2 (Engineering Optimisation), which respects the selected
 * P14/P18 design objectives, available capability, and available headroom.
 *
 * A response feature is physically recoverable when usable energy remains
 * and the feature is minimum-phase (or approximately so). Broad depressions,
 * moderate nulls, and tonal imbalance are typically physically recoverable.
 *
 * A response feature is NOT physically recoverable when it is an absolute
 * cancellation (very deep null with negligible energy) or an extreme narrow
 * null at a low modal frequency (likely non-minimum-phase).
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
      description: 'Not physically recoverable — the subwoofer cannot produce the target output level. No calibration or EQ change can overcome this physical limit.',
      eqAllowed: false,
      physicalRecommended: true,
    };
  }

  if (problem.type === PROBLEM_TYPE.EXTENSION) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: 'Not physically recoverable — the subwoofer cannot reach the target low-frequency extension. This requires a specification change, not EQ.',
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
      description: `Not physically recoverable — ${reason}. EQ cannot recover this; physical changes are required.`,
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
      description: `Physically recoverable but capability-limited — correcting the ${deviation.toFixed(1)} dB deviation would require boost that consumes P14 headroom (only ${p14Headroom.toFixed(1)} dB remaining above target). The correction would compromise the selected capability objective.`,
      eqAllowed: false,
      physicalRecommended: false,
    };
  }

  const p18AchievedHz = Number(currentResult?.achievedP18Hz) || 0;
  if (freq > 0 && p18AchievedHz > 0 && freq < p18AchievedHz + 2) {
    return {
      class: CORRECTABILITY_CLASS.CAPABILITY_LIMITED,
      description: `Physically recoverable but capability-limited — the problem at ${freq.toFixed(0)} Hz is at the extension limit. EQ correction would compromise the P18 extension objective.`,
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
    description: `Physically recoverable — a ${deviation.toFixed(1)} dB ${featureType} at ${freq.toFixed(0)} Hz with usable energy remaining. The response is physically recoverable; whether EQ is applied is determined by the Engineering Optimisation layer based on the selected design objectives.`,
    eqAllowed: true,
    physicalRecommended: false,
  };
}