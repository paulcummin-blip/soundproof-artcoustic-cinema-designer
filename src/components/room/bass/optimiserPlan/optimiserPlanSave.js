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

import { OPTIMISER_LEVER, OPTIMISER_TERMINAL_OUTCOME, OPTIMISER_WINNER_NON_PRACTICAL_REASON } from "./optimiserPlanConstants.js";
import { OPTIMISER_LEVER_VERDICT, resolveLeverVerdict } from "./optimiserLeverVerdict.js";
import { leverLabel } from "./optimiserLeverOrder.js";
import {
  buildActionableOptimiserRunSummary,
  buildOptimiserRunEvidence,
} from "./buildOptimiserRunEvidence.js";

/** A combined electronic winner was confirmed but crossover apply is not yet supported. */
export const NON_ACTIONABLE_ELECTRONIC_REASON =
  "A combined crossover and electronic tuning improvement was confirmed, but crossover settings cannot be applied automatically yet. Review the evaluated settings in Technical Details and apply them manually in your processor.";

/** The winning candidate's change was lost before it was persisted. */
export const WINNING_CHANGE_NOT_RETAINED_REASON =
  "The winning candidate's change was not retained with this run, so it cannot be shown or applied. Re-run the Optimisation Plan.";

/** Evaluated changes existed, but none cleared the materiality gate. */
export const NO_MATERIAL_CHANGE_REASON =
  "Every evaluated change stayed below the 1 dB action threshold, so there is nothing to apply.";

/** No independently evaluated change was kept with the run at all. */
export const NO_RETAINED_CHANGE_REASON =
  "The run kept no independently evaluated change, so there is nothing to apply.";

/** The evaluated seating movement cannot be applied safely. */
export const SEATING_NOT_SAFE_REASON_PREFIX =
  "The evaluated seating movement cannot be applied as it stands:";

/**
 * A run-level issue is a GENUINE computation failure or genuine missing
 * evidence — not a terminal candidate rejection. A NON_ASSESSABLE candidate
 * (P18 F3 at/above the room transition) is a terminal candidate outcome, not
 * a run failure: it must never make the whole run incomplete. A non-assessable
 * Current baseline IS a genuine run blocker, because P19/P20 cannot be
 * graded for comparison at all.
 */
function isGenuineRunIssue(issue) {
  if (!issue) return false;
  if (issue.nonAssessable === true && issue.nonAssessableBaseline !== true) return false;
  if (typeof issue.error === "string" && issue.error.trim()) return true;
  if (Array.isArray(issue.issues) && issue.issues.some(Boolean)) return true;
  return false;
}

function genuineRunIssues(selection) {
  const issues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  return issues.filter(isGenuineRunIssue);
}

function evaluationIssueReason(selection) {
  const issues = genuineRunIssues(selection);
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
  // A combined electronic lever is never offered for automatic Apply: crossover
  // apply is not yet supported, and a partial apply (delay/gain/phase/polarity
  // without crossover) would not reproduce the confirmed result.
  if (lever.actionable === false) return false;
  const changes = Array.isArray(lever.changes) ? lever.changes : [];
  if (changes.length === 0) return false;
  const verdict = resolveLeverVerdict({
    effect: lever.effect,
    baseline,
    tested: true,
    notTestedReason: lever.notEvaluatedReason || null,
  });
  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE) return false;
  // A movement outside the practical, wall-based placement envelope is retained
  // as evidence, but it is never offered as default placement.
  if (lever.practical === false) return false;
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
  // RUN COMPLETENESS is separate from candidate validation. Only a GENUINE
  // computation failure or genuine missing evidence makes the run incomplete —
  // terminal candidate rejections (NON_ASSESSABLE, UNSAFE, below-materiality)
  // never do. The run is complete when all scheduled candidate work terminated
  // and valid alternatives were evaluated.
  const issues = genuineRunIssues(selection);
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

  // A combined electronic winner was confirmed but crossover apply is not yet
  // supported. This is NOT "no useful improvement" (the improvement is real) and
  // NOT "evaluation incomplete" (the search completed). The dedicated terminal
  // outcome states the distinction so the panel never says "no improvement
  // found" for a run that DID find a confirmed electronic improvement.
  const combinedElectronic = levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC];
  if (combinedElectronic && combinedElectronic.actionable === false) {
    const identityIssues = combinedElectronic.identityProof?.issues;
    const reason = (Array.isArray(identityIssues) && identityIssues.length > 0)
      ? `${NON_ACTIONABLE_ELECTRONIC_REASON} (${identityIssues.join("; ")})`
      : NON_ACTIONABLE_ELECTRONIC_REASON;
    return {
      actionable: false,
      terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_ELECTRONIC,
      reason,
      offerableLevers: [],
    };
  }

  // A retained placement result outside the practical envelope is stated as
  // exactly that: the improvement is real, the movement is not offered as
  // default placement, and nothing is silently dropped.
  // A ranking winner EXISTS but its placement is not practical. This is NOT the
  // "no ranking winner" case — the improvement is real, the movement is not
  // buildable. The dedicated reason states exactly that distinction so the
  // generic no-winner wording is never appended on top of it.
  const theoreticalPlacement = Object.values(levers)
    .find((lever) => lever.lever === OPTIMISER_LEVER.PLACEMENT && lever.practical === false);
  if (theoreticalPlacement) {
    const detail = theoreticalPlacement.theoreticalReason ? ` ${theoreticalPlacement.theoreticalReason}` : "";
    return {
      actionable: false,
      // A ranking winner EXISTS but its placement is not practical. This is NOT
      // the "no ranking winner" case — the improvement is real, the movement is
      // not buildable. The dedicated terminal outcome keeps the panel from stating
      // "no improvement found" for a run that DID find a better-performing option.
      terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER,
      reason: `${OPTIMISER_WINNER_NON_PRACTICAL_REASON}${detail}`,
      offerableLevers: [],
    };
  }

  // State which of the two honest reasons applies: evaluated changes that all
  // fell below the gate, or no independently evaluated change kept at all.
  const keptEvaluatedChange = Object.values(levers)
    .some((lever) => lever?.evaluated === true
      && Array.isArray(lever?.changes) && lever.changes.length > 0);

  return {
    actionable: false,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
    reason: keptEvaluatedChange ? NO_MATERIAL_CHANGE_REASON : NO_RETAINED_CHANGE_REASON,
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
  // The run's own calibration decision, recorded with the terminal evidence so a
  // run that produced no actionable plan still states why each calibration
  // improvement was or was not applied.
  calibrationDecision = null,
  decisionApplied = false,
  runIdentity = null,
} = {}) {
  const actionability = resolvePlanActionability({ plan, selection });
  const actionablePlan = actionability.actionable
    ? {
      ...plan,
      run: buildActionableOptimiserRunSummary({ selection, diagnostics, runIdentity }),
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
      calibrationDecision,
      decisionApplied,
      runIdentity,
    });

  return { actionability, actionablePlan, runEvidence };
}