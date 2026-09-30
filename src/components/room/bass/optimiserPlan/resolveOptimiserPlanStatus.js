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
  OPTIMISER_LEVER_LABEL,
  OPTIMISER_LEVER_ORDER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_LEVER_STATE_LABEL,
  OPTIMISER_PLAN_STATUS,
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
      staleReason: null,
      levers: [],
      individualEffectsEvaluated: false,
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
        evaluated: lever.evaluated === true,
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
    staleReason,
    levers,
    individualEffectsEvaluated: plan.individualEffectsEvaluated === true,
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