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
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "./optimiserPlanConstants.js";
import { resolveLeverState } from "./optimiserPlanMatching.js";
import { resolveLeverApplyMap } from "./optimiserPlanLeverApply.js";
import { leverLabel, leverTitle } from "./optimiserLeverOrder.js";
import { resolveLeverVerdict } from "./optimiserLeverVerdict.js";

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
  seatingPositions = [],
} = {}) {
  if (!plan) {
    return {
      status: OPTIMISER_PLAN_STATUS.ABSENT,
      evidenceMessage: NO_EVALUATED_OPTIMISER_CHANGES,
      recordKind: null,
      terminalOutcome: null,
      run: null,
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
      recordKind: plan.recordKind || null,
      terminalOutcome: plan.terminalOutcome || null,
      run: plan.run || null,
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

  // ── A run that completed WITHOUT an actionable plan ──
  // The terminal outcome is a first-class status, never "no evidence": the run
  // evidence is stated as read, the levers stay empty, and no change is offered
  // for application. A design change still decides staleness first, so a
  // terminal record belonging to another design state asks for re-evaluation.
  const terminalOutcome = plan.terminalOutcome || null;
  if (!planStale && terminalOutcome) {
    const terminalStatus = terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.FAILED
      ? OPTIMISER_PLAN_STATUS.FAILED
      : terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT
        ? OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT
        : terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE
          // An incomplete run is a first-class state, not an absent one: its
          // evidence (and the reason it is incomplete) survives refresh/reopen.
          ? OPTIMISER_PLAN_STATUS.INCOMPLETE
          : OPTIMISER_PLAN_STATUS.ABSENT;
    return {
      status: terminalStatus,
      evidenceMessage: null,
      recordKind: plan.recordKind || null,
      terminalOutcome,
      run: plan.run || null,
      planVersion: savedVersion,
      projectId: plan.projectId || null,
      versionId: plan.versionId || null,
      target: plan.target || null,
      staleReason: null,
      // No levers: a rejected candidate is never presented as an available change.
      levers: [],
      individualEffectsEvaluated: false,
      baseline: plan.baseline || null,
      combined: null,
      combinedEffect: null,
      combinedTradeOff: null,
      predicted: null,
      appliedCount: 0,
      disabledCount: 0,
      notes: Array.isArray(plan.notes) ? plan.notes : [],
      savedAt: plan.savedAt || null,
      candidateId: plan.candidateId || null,
      engineVersion: plan.engineVersion || null,
    };
  }

  const decisions = plan.leverDecisions || {};

  const levers = OPTIMISER_LEVER_ORDER
    .filter((leverKey) => plan.levers?.[leverKey])
    .map((leverKey) => {
      const lever = plan.levers[leverKey];
      const disabled = decisions[leverKey]?.disabled === true;
      const state = resolveLeverState({ lever, leverKey, instances, seatingPositions, disabled, planStale });
      return {
        key: leverKey,
        label: leverLabel(leverKey) || OPTIMISER_LEVER_LABEL[leverKey],
        title: leverTitle(leverKey),
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
        // Seating-specific evidence: the evaluated movement and whether its
        // destination positions are legal. Null for every other lever.
        seating: lever.seating || null,
        validation: lever.validation || null,
        disabled,
        state,
        stateLabel: OPTIMISER_LEVER_STATE_LABEL[state] || state,
      };
    });

  // Individual apply/undo availability, resolved against the CURRENT design for
  // every lever. A lever is only applyable on its own when its own effect was
  // evaluated and the plan still belongs to this design.
  const applyLevers = {};
  for (const [leverKey, lever] of Object.entries(plan.levers || {})) {
    applyLevers[leverKey] = { ...lever, disabled: decisions[leverKey]?.disabled === true };
  }
  const leverApplyMap = resolveLeverApplyMap({ levers: applyLevers, planStatus: status, instances, seatingPositions });
  for (const lever of levers) {
    const applyState = leverApplyMap[lever.key] || null;
    // A lever that makes the limiting result worse is never applyable, whatever
    // the apply map says. The verdict is the only authority for that gate.
    const verdict = resolveLeverVerdict({
      effect: lever.effect || null,
      baseline: plan.baseline || null,
      tested: lever.evaluated === true,
      notTestedReason: lever.notEvaluatedReason || null,
    });
    lever.verdict = verdict.verdict;
    lever.verdictLabel = verdict.label;
    lever.verdictSummary = verdict.summary;
    lever.limitingMetric = verdict.limitingKey;
    const applyBlockedByVerdict = applyState?.canApply === true && !verdict.applyAllowed;
    lever.canApply = applyState?.canApply === true && verdict.applyAllowed === true;
    lever.applyLabel = applyState?.applyLabel || null;
    lever.applyBlockedReason = applyBlockedByVerdict
      ? verdict.summary
      : (applyState?.applyBlockedReason || null);
    lever.canUndo = applyState?.canUndo === true;
    lever.undoLabel = applyState?.undoLabel || null;
  }

  const appliedCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.APPLIED).length;
  const disabledCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.DISABLED).length;

  return {
    status,
    evidenceMessage: null,
    recordKind: plan.recordKind || OPTIMISER_RECORD_KIND.PLAN,
    terminalOutcome: null,
    run: plan.run || null,
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
        // What the winning candidate actually changed, component by component.
        components: plan.combined.components || null,
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