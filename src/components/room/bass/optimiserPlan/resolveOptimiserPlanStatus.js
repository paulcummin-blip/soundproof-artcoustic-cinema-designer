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
import {
  PLACEMENT_BLOCKED_STATUS,
  PLACEMENT_CREDIBILITY,
  assessPlacementPlausibility,
  subwooferGroupCounts,
} from "./placementPlausibilityAuthority.js";
import { describePlacementMove } from "./placementMoveAuthority.js";
import {
  BASELINE_PARITY_COPY,
  BASELINE_PARITY_STATUS,
  parityBlocksApply,
} from "./optimiserBaselineAuthority.js";

/**
 * The saved baseline-parity record. A result saved BEFORE parity was recorded
 * has no usable parity: it is reported as UNKNOWN and nothing may be applied
 * from it until it has been re-run from the completed production authority.
 */
function savedBaselineParity(plan) {
  const saved = plan?.baselineParity || plan?.identity?.baselineParity || null;
  if (saved && saved.status) return saved;
  return {
    status: BASELINE_PARITY_STATUS.UNKNOWN,
    reasons: [],
    trace: null,
    requiresBassCalculation: true,
    statusLabel: BASELINE_PARITY_COPY.UNKNOWN_STATUS,
    message: null,
  };
}

/** Why a lever's Apply is withheld when parity does not hold. */
function parityBlockedReason(parity) {
  return parity?.message
    || "This optimiser result was saved before baseline parity was recorded. Re-run the optimiser from the completed bass calculation before applying any change.";
}

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
      baselineParity: null,
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
      baselineParity: savedBaselineParity(plan),
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
      layoutCounts: plan.layoutCounts || null,
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
        // Placement-specific evidence: whether the evaluated movement is a
        // practical, wall-based one, the reason when it is not, and the physical
        // move stated in installer words rather than coordinates.
        practical: lever.practical ?? null,
        theoreticalReason: lever.theoreticalReason || null,
        movementLabel: lever.movementLabel || null,
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

    // ── The final professional plausibility gate (placement) ──
    // A mathematical improvement is not a recommendation. Placement is judged by
    // what it would physically do to THIS layout: a change that breaks the
    // layout's symmetry, that damages another metric, or that cannot be stated as
    // one credible move is never offered, never badged and never applyable —
    // whatever the mathematical verdict says. Read-only: it evaluates nothing.
    lever.plausibility = null;
    // A movement outside the practical envelope keeps its own stated handling.
    if (lever.key === OPTIMISER_LEVER.PLACEMENT && lever.practical !== false) {
      const counts = plan.layoutCounts || subwooferGroupCounts(instances, null);
      const plausibility = assessPlacementPlausibility({
        effect: lever.effect || null,
        baseline: plan.baseline || null,
        move: describePlacementMove({ changes: lever.changes || [], layoutCounts: counts }),
        layoutCounts: counts,
      });
      if (plausibility.credibility !== PLACEMENT_CREDIBILITY.APPROVED) {
        lever.plausibility = {
          credibility: plausibility.credibility,
          status: plausibility.status,
          note: plausibility.suitabilityNote,
        };
        lever.canApply = false;
        lever.applyBlockedReason = plausibility.suitabilityNote || lever.applyBlockedReason;
        lever.verdictLabel = plausibility.credibility === PLACEMENT_CREDIBILITY.SUPPRESSED
          ? PLACEMENT_BLOCKED_STATUS
          : plausibility.status;
        lever.verdictSummary = plausibility.suitabilityNote || lever.verdictSummary;
      }
    }
  }

  const appliedCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.APPLIED).length;
  const disabledCount = levers.filter((lever) => lever.state === OPTIMISER_LEVER_STATE.DISABLED).length;

  // ── Parity gate ────────────────────────────────────────────────────────
  // The optimiser baseline must BE the published bass result. When parity was
  // never established — missing, mismatched, or not recorded — no lever from
  // this result is applyable: the designer re-runs from the completed bass
  // calculation instead. This is the single gate every Apply surface reads.
  const baselineParity = savedBaselineParity(plan);
  if (parityBlocksApply(baselineParity)) {
    for (const lever of levers) {
      lever.canApply = false;
      lever.applyBlockedReason = parityBlockedReason(baselineParity);
    }
  }

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
    baselineParity,
    baseline: plan.baseline || null,
    // The subwoofer census the run evaluated, so every surface can judge the
    // evaluated move against the layout it was measured in.
    layoutCounts: plan.layoutCounts || null,
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