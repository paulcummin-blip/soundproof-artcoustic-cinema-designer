// adiDesignerSummary.js
// ---------------------------------------------------------------------------
// The Bass Optimisation card's DESIGNER view model.
//
// Product rule: the default card is a design decision, not a diagnostic panel.
// This module reduces the saved Optimisation Plan, the run evidence and the
// canonical presentation state to exactly five designer-facing facts:
//
//   1. what was tested        (design options + acoustic calculations)
//   2. what was found         (per-lever outcomes, fixed least-intrusive order)
//   3. what is recommended    (plain English, no candidate ids, no coordinates)
//   4. can it be applied      (only when the canonical state says it is safe)
//   5. can it be undone
//
// It performs no calculation and invents no number: every value is read from an
// existing authority (plan metrics, whole-number dB formatting, estimate
// authority) or omitted. Technical material — ids, coordinates, fingerprints,
// proxy counts, rejection reasons — is never returned for the default view; the
// Engineer Details disclosure reads the raw plan and evidence directly.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER_ORDER,
  OPTIMISER_EVIDENCE_STATUS_LABEL,
  OPTIMISER_LEVER_STATE_LABEL,
} from "./optimiserPlanConstants.js";
import { leverLabel } from "./optimiserLeverOrder.js";
import { describeLeverEffect, resolveLimitingMetric } from "./optimiserLeverVerdict.js";
import { deviationText } from "./optimiserWholeNumberDb.js";
import { estimateOptimiserCalculations, resultSentence } from "./optimiserCalculationEstimate.js";
import { OPTIMISER_PRESENTATION_STATE } from "./resolveOptimiserPresentationState.js";

export const ADI_TESTED_TITLE = "What ADI tested";
export const ADI_ENGINEER_DETAILS_TITLE = "Engineer details";
export const ADI_ACTION_NONE = "—";

export const ADI_STALE_COPY = Object.freeze({
  MESSAGE: "This optimisation result belongs to an earlier design state.",
  INSTRUCTION: "Re-run ADI before applying any change.",
  PREVIOUS_LABEL: "Previous best result:",
});

/** Designer-facing status words — short, never internal terminology. */
export const ADI_ROW_STATUS = Object.freeze({
  TESTED: "Tested",
  RECOMMENDED: "Recommended",
  NOT_EVALUATED: "Not evaluated",
  NOT_TESTED: "Not tested",
  NOT_RETAINED: "Not retained",
  LAST_RESORT: "Last resort",
  APPLIED: "Applied",
});

export const ADI_ROW_OUTCOME = Object.freeze({
  NO_USEFUL: "No useful improvement",
  NO_SAFE: "No safe improvement",
  NO_SAFE_STANDALONE: "No safe standalone improvement",
  NO_BETTER_LAYOUT: "No better layout found",
  COMPARE_SEPARATELY: "Compare separately",
  NOT_REQUIRED_YET: "Not required yet",
  UNAVAILABLE: "Not available",
});

const LABEL_OVERRIDE = Object.freeze({ "Sub model": "Sub option", "Subwoofer model": "Sub option" });

/** Order of the eight levers, always the least-intrusive order. */
const leverOrder = () => (Array.isArray(OPTIMISER_LEVER_ORDER) ? OPTIMISER_LEVER_ORDER : []);

function leverKeyOf(row) {
  return row?.lever ?? row?.leverKey ?? row?.key ?? null;
}

function findLeverRow(planView, key) {
  const rows = Array.isArray(planView?.levers) ? planView.levers : [];
  return rows.find((row) => leverKeyOf(row) === key) || null;
}

function displayLabel(key) {
  const base = (() => {
    try {
      return leverLabel(key) || key;
    } catch {
      return key;
    }
  })();
  return LABEL_OVERRIDE[base] || base;
}

/** One short sentence at most — the card never shows a paragraph. */
function shortPhrase(text, maxLength = 78) {
  if (typeof text !== "string" || !text.trim()) return null;
  const first = text.trim().split(/(?<=\.)\s/)[0].trim();
  return first.length <= maxLength ? first : `${first.slice(0, maxLength - 1).trimEnd()}…`;
}

function wholeNumberDeviation(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return deviationText(number);
}

/** The P20 headline the card states, or null when no authority supplies one. */
function p20Line(value) {
  const text = wholeNumberDeviation(value);
  return text ? `P20: ${text}` : null;
}

/** The recommended lever: evaluated, with an evaluated effect, and applicable. */
function resolveRecommendedLever(planView) {
  const rows = Array.isArray(planView?.levers) ? planView.levers : [];
  const actionable = rows.filter(
    (row) => row?.evaluated === true && Array.isArray(row?.changes) && row.changes.length > 0,
  );
  if (actionable.length !== 1) return null;
  return leverKeyOf(actionable[0]);
}

/**
 * The eight "What ADI tested" rows, in the fixed order.
 * Every lever is always present: an unevaluated lever states why in one phrase.
 */
export function buildTestedOptionRows(planView, { recommendedLever = null, appliedLever = null } = {}) {
  const lastKey = leverOrder()[leverOrder().length - 1] || null;
  return leverOrder().map((key) => {
    const row = findLeverRow(planView, key);
    const label = displayLabel(key);
    const isLast = key === lastKey;
    const evaluated = row?.evaluated === true;
    const hasChanges = Array.isArray(row?.changes) && row.changes.length > 0;

    if (key === appliedLever) {
      return { key, label, status: ADI_ROW_STATUS.APPLIED, outcome: "Undo to review the previous design", action: null };
    }

    if (isLast && !evaluated) {
      return {
        key,
        label,
        status: ADI_ROW_STATUS.LAST_RESORT,
        outcome: ADI_ROW_OUTCOME.NOT_REQUIRED_YET,
        action: null,
      };
    }

    if (key === recommendedLever && evaluated && hasChanges) {
      return {
        key,
        label,
        status: ADI_ROW_STATUS.RECOMMENDED,
        outcome: shortPhrase(describeLeverEffect(row?.effect)) || null,
        action: "apply",
      };
    }

    if (!evaluated) {
      const reason =
        shortPhrase(row?.notEvaluatedReason)
        || OPTIMISER_LEVER_STATE_LABEL?.[row?.state]
        || OPTIMISER_EVIDENCE_STATUS_LABEL?.[row?.evidenceStatus]
        || null;
      const layout = /layout/i.test(key);
      const sub = /sub/i.test(key);
      return {
        key,
        label,
        status: layout ? ADI_ROW_STATUS.NOT_RETAINED : sub ? ADI_ROW_STATUS.NOT_TESTED : ADI_ROW_STATUS.NOT_EVALUATED,
        outcome: reason || (layout
          ? ADI_ROW_OUTCOME.NO_BETTER_LAYOUT
          : sub
            ? ADI_ROW_OUTCOME.COMPARE_SEPARATELY
            : ADI_ROW_OUTCOME.UNAVAILABLE),
        action: null,
      };
    }

    // Evaluated but not the recommendation: state the honest short outcome.
    const phrase = shortPhrase(describeLeverEffect(row?.effect))
      || shortPhrase(row?.reason)
      || OPTIMISER_EVIDENCE_STATUS_LABEL?.[row?.evidenceStatus]
      || null;
    return {
      key,
      label,
      status: ADI_ROW_STATUS.TESTED,
      outcome: phrase || ADI_ROW_OUTCOME.NO_USEFUL,
      action: null,
    };
  });
}

/**
 * Apply safety. An Apply action exists only when ALL of these hold:
 * the canonical presentation state says the plan is applicable; the plan is
 * current (never stale); individual lever effects were evaluated (a
 * combined-only effect is never independently applicable); a single lever is
 * recommended with evaluated changes; and, when P20 is the limiting metric, the
 * improvement is at least 1 dB.
 */
export function resolveApplyPermission({ planView, presentation, recommendedLever }) {
  if (!recommendedLever) return { allowed: false, reason: "no_recommendation" };
  if (presentation?.showApply !== true) return { allowed: false, reason: "state_not_applicable" };
  if (planView?.status !== "current" && planView?.status !== undefined && String(planView?.status) !== "current") {
    return { allowed: false, reason: "plan_not_current" };
  }
  if (planView?.individualEffectsEvaluated !== true) {
    return { allowed: false, reason: "individual_effects_not_evaluated" };
  }

  const row = findLeverRow(planView, recommendedLever);
  if (!row || row.evaluated !== true || !Array.isArray(row.changes) || row.changes.length === 0) {
    return { allowed: false, reason: "changes_not_evaluated" };
  }

  const limiting = String(resolveLimitingMetric(planView?.baseline) || "");
  if (limiting.includes("20")) {
    const improvement = Number(row?.effect?.p20Delta ?? row?.effect?.p20ImprovementDb ?? NaN);
    if (Number.isFinite(improvement) && Math.abs(improvement) < 1) {
      return { allowed: false, reason: "below_materiality" };
    }
  }

  return { allowed: true, lever: recommendedLever, label: `Apply ${displayLabel(recommendedLever).toLowerCase()}` };
}

/** Can this result be undone? Only a result that was applied to the design. */
export function resolveUndoPermission({ planView, appliedLever = null }) {
  if (appliedLever) return { allowed: true, lever: appliedLever, label: "Undo change" };
  if (Number(planView?.appliedCount) > 0) return { allowed: true, lever: null, label: "Undo change" };
  return { allowed: false, lever: null, label: null };
}

/**
 * The complete designer view model for the card.
 * `currentP20Deviation` comes from the published authority; everything else is
 * read from the saved plan. Missing authorities produce null — never a guess.
 */
export function buildAdiDesignerSummary({
  planView = null,
  presentation = null,
  instances = [],
  seatCount = null,
  currentP20Deviation = null,
  appliedLever = null,
} = {}) {
  const state = presentation?.state || null;
  const stale = state === OPTIMISER_PRESENTATION_STATE.STALE;
  const noRun = state === OPTIMISER_PRESENTATION_STATE.NO_RUN;

  // The estimate authority states the design options ADI evaluates and the
  // acoustic work underneath them. The sentence is produced by that authority,
  // never assembled here, so the two counts can never disagree.
  const estimate = estimateOptimiserCalculations({ instances });
  const designOptions = estimate?.available === true ? Number(estimate.total) : NaN;
  const testedSentence = Number.isFinite(designOptions) && designOptions > 0
    ? resultSentence(designOptions, { seatCount, activeSubwooferCount: estimate.sourceCount })
    : null;

  const recommendedLever = resolveRecommendedLever(planView);
  const apply = resolveApplyPermission({ planView, presentation, recommendedLever });
  const undo = resolveUndoPermission({ planView, appliedLever });
  const rows = buildTestedOptionRows(planView, { recommendedLever, appliedLever });

  const baseline = wholeNumberDeviation(
    planView?.baseline?.p20Deviation ?? planView?.baseline?.p20 ?? null,
  );
  const recommendedRow = recommendedLever ? findLeverRow(planView, recommendedLever) : null;
  const recommendedP20 = wholeNumberDeviation(
    recommendedRow?.result?.p20Deviation
    ?? recommendedRow?.predicted?.p20Deviation
    ?? planView?.predicted?.p20Deviation
    ?? planView?.combined?.p20Deviation
    ?? null,
  );

  return {
    state,
    stale,
    noRun,
    statusLabel: presentation?.statusLabel || null,
    staleCopy: stale ? ADI_STALE_COPY : null,
    testedSentence,
    currentP20: p20Line(currentP20Deviation),
    recommendedP20: p20Line(recommendedP20),
    previousBest: stale && recommendedP20
      ? `${ADI_STALE_COPY.PREVIOUS_LABEL} P20: ${baseline || ADI_ACTION_NONE} → ${recommendedP20}`
      : stale && recommendedP20 === null && baseline
        ? `${ADI_STALE_COPY.PREVIOUS_LABEL} P20: ${baseline}`
        : null,
    recommendation: recommendedLever
      ? shortPhrase(recommendedRow?.reason) || describeLeverEffect(recommendedRow?.effect) || null
      : null,
    recommendedLever,
    recommendedLeverLabel: recommendedLever ? displayLabel(recommendedLever) : null,
    rows,
    actions: {
      canApply: apply.allowed,
      applyLabel: apply.label,
      applyReason: apply.allowed ? null : apply.reason,
      canUndo: undo.allowed,
      undoLabel: undo.label,
      undoLever: undo.lever,
      canRerun: true,
      canPreview: apply.allowed,
      rerunLabel: stale ? "Re-run Optimisation Plan" : noRun ? "Run Optimisation Plan" : "Re-run optimisation",
    },
  };
}