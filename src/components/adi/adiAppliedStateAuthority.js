// adiAppliedStateAuthority.js
// ---------------------------------------------------------------------------
// ADI — Applied State Authority
//
// The single decision for whether the ADI card may show APPLIED.
//
// APPLIED may only appear when ALL of these hold:
//   1. a specific recommendation has actually been applied
//      (workflow auto-apply, an Apply action on this card, or a persisted
//      Applied Calibration record that came from a recommendation/acceptance), and
//   2. the current design/result reflects that applied recommendation
//      (the applied calibration is current for this geometry and its values are
//      present in the current subwoofer instances), and
//   3. no action is still available (an Apply action or an unapplied
//      recommendation action text is being presented), and
//   4. the evaluation is complete — no winner / incomplete evaluation never
//      shows APPLIED.
//
// Otherwise the card states the truthful alternative:
//   "Recommendation available", "Evaluation incomplete", "Action needed" or
//   "Not applied".
//
// This module is PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { APPLIED_CALIBRATION_SOURCE } from '@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority';
import { ADI_OUTCOME } from './adiConstants';

export const ADI_APPLIED_STATE = Object.freeze({
  APPLIED: 'applied',
  RECOMMENDATION_AVAILABLE: 'recommendation_available',
  EVALUATION_INCOMPLETE: 'evaluation_incomplete',
  ACTION_NEEDED: 'action_needed',
  NOT_APPLIED: 'not_applied',
});

export const ADI_APPLIED_STATE_LABEL = Object.freeze({
  [ADI_APPLIED_STATE.APPLIED]: 'Applied',
  [ADI_APPLIED_STATE.RECOMMENDATION_AVAILABLE]: 'Recommendation available',
  [ADI_APPLIED_STATE.EVALUATION_INCOMPLETE]: 'Evaluation incomplete',
  [ADI_APPLIED_STATE.ACTION_NEEDED]: 'Action needed',
  [ADI_APPLIED_STATE.NOT_APPLIED]: 'Not applied',
});

const RECOMMENDATION_OUTCOMES = new Set([
  ADI_OUTCOME.RECOMMENDATION,
  ADI_OUTCOME.TRADE_OFF,
]);

const AUTHORITY_SOURCES_GRANTING_APPLIED = new Set([
  APPLIED_CALIBRATION_SOURCE.OPTIMISER,
  'User Accepted',
  'Optimiser Generated',
]);

/**
 * Resolve the ADI applied state.
 *
 * @param {object} params
 * @param {string} [params.outcome] - ADI outcome for the current decision
 * @param {boolean} [params.hasRecommendation] - a recommendation is being shown
 * @param {string} [params.recommendationAction] - the action text being shown
 * @param {boolean} [params.applyActionAvailable] - an Apply action is offered
 * @param {string|null} [params.appliedStage] - Apply pressed on this card ('placement'|'seating')
 * @param {object|null} [params.workflowApplied] - optimise workflow autoApplied summary
 * @param {object|null} [params.appliedCalibration] - persisted Applied Calibration authority
 * @param {boolean} [params.appliedCalibrationIsStale]
 * @param {boolean} [params.appliedCalibrationIsInDesign] - values match current instances
 * @returns {{ state: string, label: string, showAppliedBadge: boolean, reason: string }}
 */
export function resolveAdiAppliedState(params = {}) {
  const {
    outcome = null,
    hasRecommendation = false,
    recommendationAction = '',
    applyActionAvailable = false,
    appliedStage = null,
    workflowApplied = null,
    appliedCalibration = null,
    appliedCalibrationIsStale = false,
    appliedCalibrationIsInDesign = false,
  } = params;

  // ── Rule 4: incomplete evaluation never shows APPLIED ──
  if (outcome === ADI_OUTCOME.INCOMPLETE) {
    return result(ADI_APPLIED_STATE.EVALUATION_INCOMPLETE, 'evaluation-incomplete');
  }
  if (outcome === ADI_OUTCOME.TARGET_NOT_ACHIEVED) {
    return result(ADI_APPLIED_STATE.ACTION_NEEDED, 'target-not-achieved');
  }
  if (!RECOMMENDATION_OUTCOMES.has(outcome)) {
    if (outcome === ADI_OUTCOME.NO_FURTHER_ENGINEERING || outcome === ADI_OUTCOME.NO_FURTHER_EQ) {
      return result(ADI_APPLIED_STATE.NOT_APPLIED, 'no-further-action');
    }
    return result(ADI_APPLIED_STATE.EVALUATION_INCOMPLETE, 'no-winner');
  }

  // ── Rule 1: was a specific recommendation actually applied? ──
  const workflowAppliedFlag = !!(workflowApplied
    && (workflowApplied.phase || workflowApplied.delay || workflowApplied.gain || workflowApplied.globalBassTrim));

  const authorityHasValues = !!appliedCalibration
    && Array.isArray(appliedCalibration.values)
    && appliedCalibration.values.length > 0;
  const authorityProvenance = authorityHasValues
    && AUTHORITY_SOURCES_GRANTING_APPLIED.has(String(appliedCalibration.source || ''))
    && appliedCalibrationIsStale !== true
    && appliedCalibrationIsInDesign === true;

  const hasAppliedProvenance = !!appliedStage || workflowAppliedFlag || authorityProvenance;

  // ── Rule 2: a stale applied calibration means the design no longer
  //            reflects the applied recommendation ──
  const authorityBlocksApplied = authorityHasValues && appliedCalibrationIsStale === true;

  // ── Rule 3: an available action is never compatible with APPLIED ──
  const actionAvailable = applyActionAvailable
    || (hasRecommendation && String(recommendationAction || '').trim().length > 0);

  if (hasAppliedProvenance && !authorityBlocksApplied && !actionAvailable) {
    return result(ADI_APPLIED_STATE.APPLIED, appliedStage ? 'applied-this-session' : workflowAppliedFlag ? 'applied-this-run' : 'applied-in-design');
  }

  if (actionAvailable) {
    return result(ADI_APPLIED_STATE.RECOMMENDATION_AVAILABLE, 'action-available');
  }

  return result(ADI_APPLIED_STATE.NOT_APPLIED, 'no-applied-provenance');

  function result(state, reason) {
    return {
      state,
      label: ADI_APPLIED_STATE_LABEL[state],
      showAppliedBadge: state === ADI_APPLIED_STATE.APPLIED,
      reason,
    };
  }
}

export { RECOMMENDATION_OUTCOMES };