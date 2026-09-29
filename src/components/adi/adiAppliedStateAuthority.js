// adiAppliedStateAuthority.js
// ---------------------------------------------------------------------------
// ADI — Applied State Authority
//
// The single decision for whether the ADI card may show APPLIED.
//
// APPLIED may only appear when ALL of these hold:
//   1. a specific recommendation has actually been applied —
//        • an Apply action on this card this session, or
//        • the optimise workflow applied per-sub calibration values this run, or
//        • a persisted Applied Calibration record that came from an
//          optimiser/acceptance provenance (NOT a manual user edit), and
//   2. the current design still reflects that applied recommendation —
//      the persisted calibration is not stale for the current geometry and its
//      values are present in the current subwoofer instances, and
//   3. no action is waiting — an available Apply action is never compatible
//      with APPLIED, and
//   4. the evaluation is complete — an incomplete evaluation, an unachievable
//      target, or no winner never shows APPLIED.
//
// Otherwise the card states the truthful alternative:
//   "Recommendation available", "Evaluation incomplete", "Action needed" or
//   "Not applied".
//
// A global bass trim alone is NOT "a specific recommendation applied": it is
// applied automatically by the workflow as a level alignment, so it does not
// by itself justify APPLIED.
//
// This module is PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  APPLIED_CALIBRATION_SOURCE,
  APPLIED_CALIBRATION_STATUS,
} from '@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority';
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

// Provenance that means "a specific recommendation was applied".
// A manual user edit (MANUAL source / USER_MODIFIED status) is an intentional
// designer action, not an applied recommendation, and never grants APPLIED.
const APPLIED_GRANTING_SOURCES = new Set([
  APPLIED_CALIBRATION_SOURCE.OPTIMISER,
]);

const APPLIED_GRANTING_STATUSES = new Set([
  APPLIED_CALIBRATION_STATUS.OPTIMISER_GENERATED,
  APPLIED_CALIBRATION_STATUS.USER_ACCEPTED,
]);

function hasCalibrationValues(authority) {
  return !!authority && Array.isArray(authority.values) && authority.values.length > 0;
}

/**
 * Does the persisted Applied Calibration record prove that a specific
 * recommendation was applied (rather than a manual edit)?
 */
export function hasAppliedRecommendationProvenance(authority) {
  if (!hasCalibrationValues(authority)) return false;
  const source = String(authority.source || '');
  const status = String(authority.status || '');
  const fromRecommendation = APPLIED_GRANTING_SOURCES.has(source)
    || APPLIED_GRANTING_STATUSES.has(status);
  if (!fromRecommendation) return false;
  // A specific identity (candidate / recommendation / stage) must be recorded —
  // values alone could be any tuning that happens to sit on the instances.
  return !!(authority.candidateId || authority.recommendationId || authority.stageKey);
}

/**
 * Resolve the ADI applied state.
 *
 * @param {object} params
 * @param {string} [params.outcome] - ADI outcome for the current decision
 * @param {boolean} [params.hasRecommendation] - a recommendation is being shown
 * @param {string} [params.recommendationAction] - the action text being shown
 * @param {boolean} [params.applyActionAvailable] - an Apply action is offered
 * @param {string|null} [params.appliedStage] - Apply pressed on this card
 * @param {object|null} [params.workflowApplied] - workflow autoApplied summary
 * @param {object|null} [params.appliedCalibration] - persisted Applied Calibration
 * @param {boolean} [params.appliedCalibrationIsStale]
 * @param {boolean} [params.appliedCalibrationIsInDesign] - values match instances
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

  const result = (state, reason) => ({
    state,
    label: ADI_APPLIED_STATE_LABEL[state],
    showAppliedBadge: state === ADI_APPLIED_STATE.APPLIED,
    reason,
  });

  // ── Rule 4: the evaluation must be complete with a real recommendation ──
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

  // ── Rule 3 (absolute): an available Apply action is never "APPLIED" ──
  if (applyActionAvailable) {
    return result(ADI_APPLIED_STATE.RECOMMENDATION_AVAILABLE, 'apply-action-available');
  }

  // ── Rules 1 & 2: applied, and still reflected in the current design ──
  const sessionApplied = !!appliedStage
    || !!(workflowApplied
      && (workflowApplied.phase || workflowApplied.delay || workflowApplied.gain));

  const authorityProvenance = hasAppliedRecommendationProvenance(appliedCalibration);
  const authorityApplied = authorityProvenance
    && appliedCalibrationIsStale !== true
    && appliedCalibrationIsInDesign === true;

  if (sessionApplied) {
    return result(ADI_APPLIED_STATE.APPLIED, 'applied-this-session');
  }
  if (authorityApplied) {
    return result(ADI_APPLIED_STATE.APPLIED, 'applied-in-design');
  }

  // Nothing applied. If an action is being presented, say so truthfully.
  if (hasRecommendation && String(recommendationAction || '').trim().length > 0) {
    return result(ADI_APPLIED_STATE.RECOMMENDATION_AVAILABLE, 'recommendation-presented');
  }
  if (hasCalibrationValues(appliedCalibration) && appliedCalibrationIsStale === true) {
    return result(ADI_APPLIED_STATE.RECOMMENDATION_AVAILABLE, 'applied-calibration-stale');
  }

  return result(ADI_APPLIED_STATE.NOT_APPLIED, 'no-applied-provenance');
}

export { RECOMMENDATION_OUTCOMES };