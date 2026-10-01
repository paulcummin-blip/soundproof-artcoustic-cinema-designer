// optimiserPlanSave.js
// ---------------------------------------------------------------------------
// The ONE decision that turns a completed optimiser run into what is saved for
// the design version.
//
// Product rule: a recommendation is not available unless the evaluated change is
// visible and usable. A candidate existing is therefore NOT enough to call a run
// actionable:
//
//   actionable            at least one lever was independently evaluated, carries
//                         its own evaluated effect, clears the 1 dB materiality
//                         gate, is safe to apply and has a working Apply/Undo
//                         path. Everything else about the run is discarded
//                         evidence — it never becomes an offer.
//   no_useful_improvement every credible candidate was evaluated and rejected.
//   evaluation_incomplete the run did not finish, or the winning change was not
//                         retained, so nothing can be presented or applied.
//
// The materiality gate is NOT defined here: it is the existing lever verdict
// authority (resolveLeverVerdict). This module only asks it.
//
// READ-ONLY: it reads the plan and the run's own selection. It evaluates nothing,
// recalculates nothing, and changes no bass maths, scoring or RP22 grading.
// ---------------------------------------------------------------------------

import { OPTIMISER_TERMINAL_OUTCOME } from "./optimiserPlanConstants.js";
import { OPTIMISER_LEVER_VERDICT, resolveLeverVerdict } from "./optimiserLeverVerdict.js";
import { leverLabel } from "./optimiserLeverOrder.js";
import {
  buildActionableOptimiserRunSummary,
  buildOptimiserRunEvidence,
} from "./buildOptimiserRunEvidence.js";

/** The winning candidate's change was lost before it was persisted. */
export const WINNING_CHANGE_NOT_RETAINED_REASON =
  "The winning candidate's change was not retained with this run, so it cannot be shown or applied. Re-run the Optimisation Plan.";

/** No evaluated change cleared the materiality gate. */
export const NO_MATERIAL_CHANGE_REASON =
  "Every evaluated change was below the 1 dB materiality threshold, so nothing is offered for application.";

/** The evaluated seating movement cannot be applied safely. */
export const SEATING_NOT_SAFE_REASON_PREFIX =
  "The evaluated seating movement cannot be applied as it stands:";

function evaluationIssueReason(selection) {
  const issues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  const first = issues[0];
  if (!first) return "The optimiser run did not complete its evaluation.";
  const stage = first?.stage ? `${first.stage}: ` : "";
  const detail = typeof first?.error === "string" && first.error
    ? first.error
    : (Array.isArray(first?.issues) ? first.issues.filter(Boolean).join(" · ") : null);
  return `${stage}${detail || "the evaluation did not complete."}`;
}

/**
 * Is one lever's own evaluated effect material enough to offer?
 * A lever whose destination geometry is known to be invalid is never offered.
 */
export function leverIsOfferable(lever, baseline) {
  if (!lever || lever.evaluated !== true) return false;
  if (lever.notEvaluated === true || !lever.effect) return false;
  const changes = Array.isArray(lever.changes) ? lever.changes : [];
  if (changes.length === 0) return false;
  const verdict = resolveLeverVerdict({
    effect: lever.effect,
    baseline,
    tested: true,
    notTestedReason: lever.notEvaluatedReason || null,
  });
  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE) return false;
  const geometry = lever.validation?.destinationsValid;
  return verdict.applyAllowed === true && geometry !== false;
}

/**
 * Resolve what a completed run may be saved as.
 *
 * @param {object} params
 * @param {object|null} params.plan - the built plan (null when it built nothing)
 * @param {object|null} params.selection - the run's own selection
 * @returns {{actionable: boolean, terminalOutcome: string|null, reason: string|null, offerableLevers: string[]}}
 */
export function resolvePlanActionability({ plan = null, selection = null } = {}) {
  const issues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  const incomplete = selection?.evaluationIncomplete === true || issues.length > 0;

  // A winner whose change did not survive into the plan is INCOMPLETE evidence —
  // never an actionable plan.
  if (!plan) {
    if (selection?.winner) {
      return {
        actionable: false,
        terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
        reason: WINNING_CHANGE_NOT_RETAINED_REASON,
        offerableLevers: [],
      };
    }
    return { actionable: false, terminalOutcome: null, reason: null, offerableLevers: [] };
  }

  if (incomplete) {
    return {
      actionable: false,
      terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
      reason: evaluationIssueReason(selection),
      offerableLevers: [],
    };
  }

  const levers = plan.levers || {};
  const baseline = plan.baseline || null;
  const offerable = Object.values(levers).filter((lever) => leverIsOfferable(lever, baseline));

  if (offerable.length > 0) {
    return {
      actionable: true,
      terminalOutcome: null,
      reason: null,
      offerableLevers: offerable.map((lever) => lever.lever),
    };
  }

  // Nothing cleared the gate. State the actual reason: geometry blocked what
  // would otherwise have been offered, otherwise the materiality threshold did.
  const blockedByGeometry = Object.values(levers)
    .find((lever) => lever.validation?.destinationsValid === false
      && resolveLeverVerdict({ effect: lever.effect, baseline, tested: true }).applyAllowed === true);

  if (blockedByGeometry) {
    const label = leverLabel(blockedByGeometry.lever) || blockedByGeometry.lever;
    return {
      actionable: false,
      terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
      reason: `${SEATING_NOT_SAFE_REASON_PREFIX} ${blockedByGeometry.validation?.reason
        || "the destination seat positions could not be confirmed."} (${label})`,
      offerableLevers: [],
    };
  }

  return {
    actionable: false,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
    reason: NO_MATERIAL_CHANGE_REASON,
    offerableLevers: [],
  };
}

/**
 * Build what is saved for a completed run: either an actionable plan (with its
 * compact run summary) or the terminal run evidence, which keeps what the run
 * tested and why nothing is offered. Never both, never neither when the run
 * produced anything at all.
 */
export function buildOptimiserResultForSave({
  plan = null,
  selection = null,
  diagnostics = null,
  identity = {},
  currentDesignUnchanged = true,
} = {}) {
  const actionability = resolvePlanActionability({ plan, selection });
  const actionablePlan = actionability.actionable
    ? {
      ...plan,
      run: buildActionableOptimiserRunSummary({ selection, diagnostics }),
    }
    : null;

  const runEvidence = actionablePlan
    ? null
    : buildOptimiserRunEvidence({
      selection,
      diagnostics,
      identity,
      currentDesignUnchanged,
      terminalOutcome: actionability.terminalOutcome,
      failureReason: actionability.reason,
    });

  return { actionability, actionablePlan, runEvidence };
}