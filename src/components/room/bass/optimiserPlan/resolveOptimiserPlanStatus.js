// resolveOptimiserPlanStatus.js
// ---------------------------------------------------------------------------
// Resolves the SAVED Optimisation Plan against the CURRENT design.
//
// This is a pure read. It never re-runs the optimiser, never recalculates, and
// never rewrites the plan:
//
//   - fingerprint matches        → CURRENT  (rule 2)
//   - design changed / missing   → STALE    (rules 3, 9 — the plan is kept)
//   - per-lever state is derived from the design itself, so Applied is only
//     reported when the saved recommendation still matches what is open now
//     (rule 8).
// ---------------------------------------------------------------------------

import {
  INDIVIDUAL_EFFECT_NOT_EVALUATED,
  NO_EVALUATED_OPTIMISER_CHANGES,
  OPTIMISER_EVIDENCE_STATUS_LABEL,
  OPTIMISER_EVIDENCE_UNAVAILABLE,
  OPTIMISER_LEVER_LABEL,
  OPTIMISER_LEVER_ORDER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_LEVER_STATE_LABEL,
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_PLAN_VERSION,
} from "./optimiserPlanConstants.js";
import { resolveLeverState } from "./optimiserPlanMatching.js";

/**
 * @param {object} params
 * @param {object|null} params.plan - the saved plan
 * @param {string|null} params.currentDesignFingerprint - fingerprint of the open design
 * @param {Array} params.instances - current subwooferInstances
 * @returns {object} resolved plan view
 */
export function resolveOptimiserPlanStatus({
  plan = null,
  currentDesignFingerprint = null,
  instances = [],
} = {}) {
  if (!plan) {
    return {
      status: OPTIMISER_PLAN_STATUS.ABSENT,
      evidenceMessage: NO_EVALUATED_OPTIMISER_CHANGES,
      planVersion: null,
      projectId: null,
      versionId: null,
      target: null,
      staleReason: null,
      levers: [],
      individualEffectsEvaluated: false,
      baseline: null,
      combined: null,
      combinedEffect: null,
      combinedTradeOff: null,
      predicted: null,
      appliedCount: 0,
      disabledCount: 0,
      notes: [],
      savedAt: null,
      candidateId: null,
      engineVersion: null,
    };
  }

  // Schema guard: evidence saved without a version, or under an older one, is
  // NOT reinterpreted. No lever is fabricated from evidence we cannot read.
  const savedVersion = Number(plan.planVersion);
  if (!Number.isFinite(savedVersion) || savedVersion < OPTIMISER_PLAN_VERSION) {
    return {
      status: OPTIMISER_PLAN_STATUS.UNSUPPORTED,
      evidenceMessage: OPTIMISER_EVIDENCE_UNAVAILABLE,
      planVersion: Number.isFinite(savedVersion) ? savedVersion : null,
      projectId: plan.projectId || null,
      versionId: plan.versionId || null,
      target: plan.target || null,
      staleReason: null,
      levers: [],
      individualEffectsEvaluated: false,
      baseline: null,
      combined: null,
      combinedEffect: null,
      combinedTradeOff: null,
      predicted: null,
      appliedCount: 0,
      disabledCount: 0,
      notes: [],
      savedAt: plan.savedAt || null,
      candidateId: plan.candidateId || null,
      engineVersion: plan.engineVersion || null,
    };
  }

  const savedFingerprint = plan.designFingerprint || null;
  let status = OPTIMISER_PLAN_STATUS.CURRENT;
  let staleReason = null;

  if (!savedFingerprint || !currentDesignFingerprint) {
    status = OPTIMISER_PLAN_STATUS.STALE;
    staleReason = "The design this optimiser result belongs to could not be confirmed — re-evaluation required.";
  } else if (savedFingerprint !== currentDesignFingerprint) {
    status = OPTIMISER_PLAN_STATUS.STALE;
    staleReason = "The design has changed since this optimiser result was evaluated — re-evaluation required.";
  }

  const planStale = status === OPTIMISER_PLAN_STATUS.STALE;
  const decisions = plan.leverDecisions || {};

  const levers = OPTIMISER_LEVER_ORDER
    .filter((leverKey) => plan.levers?.[leverKey])
    .map((leverKey) => {
      const lever = plan.levers[leverKey];
      const disabled = decisions[leverKey]?.disabled === true;
      const state = resolveLeverState({ lever, leverKey, instances, disabled, planStale });
      return {
        key: leverKey,
        label: OPTIMISER_LEVER_LABEL[leverKey],
        evidenceStatus: lever.evidenceStatus || null,
        evidenceLabel: lever.evidenceStatus
          ? OPTIMISER_EVIDENCE_STATUS_LABEL[lever.evidenceStatus] || null
          : null,
        evaluated: lever.evaluated === true,
        notEvaluated: lever.notEvaluated === true,
        notEvaluatedReason: lever.notEvaluatedReason || null,
        sourceCandidateId: lever.sourceCandidateId || null,
        effect: lever.effect || null,
        effectLabel: lever.effect ? null : INDIVIDUAL_EFFECT_NOT_EVALUATED,
        changes: Array.isArray(lever.changes) ? lever.changes : [],
        reason: lever.reason || null,
        tradeOff: lever.tradeOff || null,
        disabled,
        state,
        stateLabel: OPTIMISER_LEVER_STATE_LABEL[state] || state,
      };
    });

  const appliedCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.APPLIED).length;
  const disabledCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.DISABLED).length;

  return {
    status,
    evidenceMessage: null,
    planVersion: savedVersion,
    projectId: plan.projectId || null,
    versionId: plan.versionId || null,
    target: plan.target || null,
    staleReason,
    levers,
    individualEffectsEvaluated: plan.individualEffectsEvaluated === true,
    baseline: plan.baseline || null,
    combined: plan.combined
      ? {
        candidateId: plan.combined.candidateId || null,
        coordinates: plan.combined.coordinates || null,
        tuning: Array.isArray(plan.combined.tuning) ? plan.combined.tuning : [],
        effect: plan.combined.effect || null,
        seats: Array.isArray(plan.combined.seats) ? plan.combined.seats : [],
        tradeOff: plan.combined.tradeOff || null,
      }
      : null,
    combinedEffect: plan.combined?.effect || null,
    combinedTradeOff: plan.combined?.tradeOff || null,
    predicted: plan.combined?.effect
      ? {
        p20Level: plan.combined.effect.p20Level,
        p20DeltaDb: plan.combined.effect.p20DeltaDb,
        p19VariationDb: plan.combined.effect.p19VariationDb,
        p19DeltaDb: plan.combined.effect.p19DeltaDb,
        worstSeatId: plan.combined.effect.worstSeatId,
        worstFrequencyHz: plan.combined.effect.worstFrequencyHz,
        p14DeltaDb: plan.combined.effect.p14DeltaDb,
        outputDeltaDb: plan.combined.effect.outputDeltaDb,
      }
      : null,
    appliedCount,
    disabledCount,
    notes: Array.isArray(plan.notes) ? plan.notes : [],
    savedAt: plan.savedAt || null,
    candidateId: plan.candidateId || null,
    engineVersion: plan.engineVersion || null,
  };
}