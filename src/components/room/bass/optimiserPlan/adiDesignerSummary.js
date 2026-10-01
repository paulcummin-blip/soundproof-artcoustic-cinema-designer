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
  OPTIMISER_EVIDENCE_STATUS_LABEL,
  OPTIMISER_LEVER_STATE_LABEL,
} from "./optimiserPlanConstants.js";
import { leverLabel, OPTIMISER_FAMILY_SEQUENCE } from "./optimiserLeverOrder.js";
import { describeLeverEffect, resolveLimitingMetric } from "./optimiserLeverVerdict.js";
import { deltaText, deviationText, frequencyText, levelText } from "./optimiserWholeNumberDb.js";
import { leverIsOfferable } from "./optimiserPlanSave.js";
import { estimateOptimiserCalculations, resultSentence } from "./optimiserCalculationEstimate.js";
import { resolveAbsorptionAdvice } from "./absorptionAdviceAuthority.js";
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
  PHASE_UNAVAILABLE: "Crossover-region model not available",
});

const LABEL_OVERRIDE = Object.freeze({
  "Subwoofer option": "Sub option",
  "Sub model": "Sub option",
  "Subwoofer model": "Sub option",
});

/**
 * The eight levers ADI reports on, always in the fixed least-intrusive order:
 * delay, gain, phase, polarity, placement, layout, subwoofer option, seating.
 * Low-frequency absorption advice is appended as the ninth step afterwards.
 */
const leverOrder = () => (
  Array.isArray(OPTIMISER_FAMILY_SEQUENCE) && OPTIMISER_FAMILY_SEQUENCE.length
    ? OPTIMISER_FAMILY_SEQUENCE
    : []
);

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

/** "L1" — the published level, or the value as stated when it is already one. */
function levelPhrase(value) {
  if (value == null) return null;
  const number = Number(value);
  if (Number.isFinite(number)) return levelText(number);
  const text = String(value).trim();
  return text ? text : null;
}

/** The P20 headline: level and whole-number deviation, or whichever exists. */
function p20Line(level, deviation) {
  const levelPart = levelPhrase(level);
  const deviationPart = wholeNumberDeviation(deviation);
  if (levelPart && deviationPart) return `P20: ${levelPart} · ${deviationPart}`;
  if (deviationPart) return `P20: ${deviationPart}`;
  if (levelPart) return `P20: ${levelPart}`;
  return null;
}

/**
 * The recommended lever: the ONE lever that carries an independently evaluated
 * change which clears the materiality gate and whose destination geometry is
 * legal. A lever that was evaluated but is below the gate is never presented as
 * a recommendation — it is reported as tested with no useful improvement.
 */
function resolveRecommendedLever(planView) {
  const rows = Array.isArray(planView?.levers) ? planView.levers : [];
  const baseline = planView?.baseline || null;
  const offerable = rows.filter((row) => leverIsOfferable(row, baseline));
  if (offerable.length !== 1) return null;
  return leverKeyOf(offerable[0]);
}

/**
 * The seating recommendation's own evaluated detail, in whole numbers. Every
 * value is read from the lever's persisted effect and the plan's baseline —
 * nothing here is recalculated. Null for every other recommendation.
 */
function seatingRecommendationDetail({ row, baseline = null } = {}) {
  if (!row?.seating?.movementLabel) return null;
  const effect = row.effect || null;
  return {
    movementLabel: row.seating.movementLabel,
    wholeBlockMoved: row.seating.wholeBlockMoved === true,
    reason: shortPhrase(row.reason, 160),
    p20Before: deviationText(baseline?.p20VariationDb),
    p20After: deviationText(effect?.p20VariationDb),
    p20LevelBefore: levelText(effect?.p20LevelBefore ?? baseline?.p20Level),
    p20LevelAfter: levelText(effect?.p20LevelAfter),
    p19Delta: deltaText(effect?.p19DeltaDb),
    p14Delta: deltaText(effect?.p14DeltaDb),
    p18DeltaHz: Number.isFinite(Number(effect?.p18DeltaHz)) ? Number(effect.p18DeltaHz) : null,
    outputDelta: deltaText(effect?.outputDeltaDb),
    worstSeat: effect?.worstSeatId
      ? `${effect.worstSeatId}${frequencyText(effect.worstFrequencyHz) ? ` · ${frequencyText(effect.worstFrequencyHz)}` : ""}`
      : null,
    tradeOff: row.tradeOff?.reason || null,
    destinationsValid: row.validation?.destinationsValid ?? null,
    validationBasis: row.validation?.basis || null,
    validationReason: row.validation?.reason || null,
  };
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
      // A seating recommendation states the movement itself — "move the seating
      // 100 mm toward the screen" — beside its evaluated effect.
      const movement = row?.seating?.movementLabel || null;
      const effect = shortPhrase(describeLeverEffect(row?.effect));
      return {
        key,
        label,
        status: ADI_ROW_STATUS.RECOMMENDED,
        outcome: movement ? (effect ? `${movement} · ${effect}` : movement) : (effect || null),
        action: "apply",
      };
    }

    if (!evaluated) {
      const reason =
        shortPhrase(row?.notEvaluatedReason)
        || OPTIMISER_LEVER_STATE_LABEL?.[row?.state]
        || OPTIMISER_EVIDENCE_STATUS_LABEL?.[row?.evidenceStatus]
        || (/phase/i.test(key) ? ADI_ROW_OUTCOME.PHASE_UNAVAILABLE : null);
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
    const phrase = row?.seating?.movementLabel
      || shortPhrase(describeLeverEffect(row?.effect))
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
    const improvement = Number(row?.effect?.p20DeltaDb ?? NaN);
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
  currentP20Level = null,
  limitingFrequencyHz = null,
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
  const leverRows = buildTestedOptionRows(planView, { recommendedLever, appliedLever });

  const baselineDeviation = wholeNumberDeviation(planView?.baseline?.p20VariationDb ?? null);
  const baselineLevel = planView?.baseline?.p20Level ?? null;
  const recommendedRow = recommendedLever ? findLeverRow(planView, recommendedLever) : null;
  const recommendedDeviation = wholeNumberDeviation(recommendedRow?.effect?.p20VariationDb ?? null);
  const recommendedLevel = recommendedRow?.effect?.p20Level ?? null;
  const recommendedP20 = p20Line(recommendedLevel, recommendedRow?.effect?.p20VariationDb);

  // ── Low-frequency absorption ──
  // Ninth in the fixed order, after every practical lever. Advice only: it never
  // carries an Apply action. It is judged on what the design looks like AFTER
  // the recommended practical change, so a recommendation that already reaches
  // L2 does not attract absorption advice.
  const absorption = resolveAbsorptionAdvice({
    p20Level: recommendedLevel ?? currentP20Level ?? baselineLevel,
    p20DeviationDb: recommendedRow?.effect?.p20VariationDb
      ?? currentP20Deviation
      ?? planView?.baseline?.p20VariationDb
      ?? null,
    seats: planView?.baseline?.seats,
    leverRows: planView?.levers,
    limitingFrequencyHz,
  });
  const rows = absorption
    ? [
      ...leverRows,
      {
        key: absorption.key,
        label: absorption.label,
        status: absorption.status,
        outcome: absorption.reason,
        action: null,
        actionText: absorption.actionText,
        advice: true,
      },
    ]
    : leverRows;

  // Levers that were evaluated without becoming the recommendation: the failed
  // electronic and placement attempts, named for Engineer details only.
  const attemptsWithoutGain = leverRows
    .filter((row) => row.status === ADI_ROW_STATUS.TESTED)
    .map((row) => row.label);

  return {
    state,
    stale,
    noRun,
    statusLabel: presentation?.statusLabel || null,
    staleCopy: stale ? ADI_STALE_COPY : null,
    testedSentence,
    currentP20: p20Line(currentP20Level, currentP20Deviation),
    recommendedP20,
    previousBest: stale && recommendedP20
      ? `${ADI_STALE_COPY.PREVIOUS_LABEL} P20: ${baselineDeviation || ADI_ACTION_NONE} → ${recommendedDeviation || ADI_ACTION_NONE}`
      : stale && baselineDeviation
        ? `${ADI_STALE_COPY.PREVIOUS_LABEL} P20: ${baselineDeviation}`
        : null,
    absorption,
    attemptsWithoutGain,
    recommendation: recommendedLever
      ? shortPhrase(recommendedRow?.reason) || describeLeverEffect(recommendedRow?.effect) || null
      : null,
    recommendedLever,
    recommendedLeverLabel: recommendedLever ? displayLabel(recommendedLever) : null,
    // The seating recommendation's own evaluated detail: movement, before/after,
    // trade-offs and destination validity. Null for every other recommendation.
    seatingRecommendation: recommendedRow?.seating
      ? seatingRecommendationDetail({ row: recommendedRow, baseline: planView?.baseline || null })
      : null,
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