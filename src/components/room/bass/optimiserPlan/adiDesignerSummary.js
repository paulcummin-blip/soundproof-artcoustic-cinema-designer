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

import { OPTIMISER_EVIDENCE_STATUS_LABEL } from "./optimiserPlanConstants.js";
import { leverLabel, OPTIMISER_FAMILY_SEQUENCE } from "./optimiserLeverOrder.js";
import {
  OPTIMISER_LEVER_VERDICT,
  describeLeverEffect,
  resolveLeverVerdict,
  resolveLimitingMetric,
} from "./optimiserLeverVerdict.js";
import { deltaText, deviationText, frequencyText, levelText } from "./optimiserWholeNumberDb.js";
import { leverIsOfferable } from "./optimiserPlanSave.js";
import { estimateOptimiserCalculations, resultSentence } from "./optimiserCalculationEstimate.js";
import { resolveAbsorptionAdvice } from "./absorptionAdviceAuthority.js";
import {
  ADI_ROW_OUTCOME,
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from "./optimiserFamilyLedgerRows.js";
import { PLACEMENT_THEORETICAL_NOTE, describePlacementMove } from "./placementMoveAuthority.js";
import { resolvePlacementRecommendation } from "./placementRecommendationAuthority.js";
import { LEVER_APPLY_LABEL, LEVER_UNDO_LABEL } from "./optimiserPlanLeverApply.js";
import { buildLiveFamilyRows } from "./optimiserLiveProgress.js";
import { OPTIMISER_PRESENTATION_STATE } from "./resolveOptimiserPresentationState.js";

export const ADI_TESTED_TITLE = "What ADI tested";
export const ADI_ENGINEER_DETAILS_TITLE = "Engineer details";
export const ADI_ACTION_NONE = "—";

export const ADI_STALE_COPY = Object.freeze({
  MESSAGE: "Previous result found a possible improvement. Re-run ADI on the current design before applying any change.",
  INSTRUCTION: "The design has changed since that evaluation.",
  PREVIOUS_LABEL: "Previous best result:",
});

// The designer-facing ledger vocabulary — status words and outcome phrases —
// lives with the evidence it describes (optimiserFamilyLedgerRows.js) and is
// re-exported here for the card.
export { ADI_ROW_OUTCOME, ADI_ROW_STATUS };

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
 * The "What ADI tested" rows, in the fixed order.
 * Every lever is always present: an unevaluated lever states why in one phrase.
 *
 * While a run is in progress the rows come from the engine's own live progress
 * (`liveRows`): every family is Waiting, Testing, Tested, or clearly marked as a
 * capability the model does not have. Nothing is read from the previous run's
 * evidence during a run, so the card can never look idle while ADI is working.
 */
export function buildTestedOptionRows(
  planView,
  { recommendedLever = null, appliedLever = null, liveRows = null, roomDims = null } = {},
) {
  if (Array.isArray(liveRows) && liveRows.length) return liveRows;
  const lastKey = leverOrder()[leverOrder().length - 1] || null;
  // The run's own per-family evidence: what each family actually did. Null for a
  // saved record that carries no family ledger (an older plan), in which case
  // the plan's own lever rows are the only evidence there is.
  const familyRows = buildFamilyLedgerRows({
    families: planView?.run?.families,
    baseline: planView?.baseline || null,
  });
  return leverOrder().map((key) => {
    const row = findLeverRow(planView, key);
    const label = displayLabel(key);
    const isLast = key === lastKey;
    const evaluated = row?.evaluated === true;
    const hasChanges = Array.isArray(row?.changes) && row.changes.length > 0;

    if (key === appliedLever) {
      return { key, label, status: ADI_ROW_STATUS.APPLIED, outcome: "Undo to review the previous design", action: null };
    }

    if (key === recommendedLever && evaluated && hasChanges) {
      // A physical recommendation states the movement itself — "move the front
      // subs wider along the front wall", "move the seating 100 mm toward the
      // screen" — beside its evaluated effect, in whole dB.
      const movement = row?.seating?.movementLabel
        || row?.movementLabel
        || describePlacementMove({ changes: row?.changes, roomDims })?.movementLabel
        || null;
      const effect = shortPhrase(describeLeverEffect(row?.effect));
      return {
        key,
        label,
        status: ADI_ROW_STATUS.RECOMMENDED,
        outcome: movement ? (effect ? `${movement} ${effect}` : movement) : (effect || null),
        action: "apply",
      };
    }

    // ── The saved run evidence ──
    // A family the run evaluated is never shown as "Not evaluated": its status
    // and outcome are read from the per-family ledger the run saved. Used only
    // where the plan carries no lever evaluation of its own, so plan evidence
    // always wins.
    const familyRow = familyRows ? familyRows[key] : null;
    if (!evaluated && familyRow) {
      return {
        key,
        label,
        status: familyRow.status,
        outcome: familyRow.outcome,
        action: null,
        // A row that cannot be applied says what to do about it ("Re-run to
        // apply") rather than leaving the action column unexplained.
        actionText: familyRow.actionText || null,
      };
    }

    // ── Not evaluated by this plan ──
    // Stated in the fixed vocabulary. A family the model cannot evaluate says
    // so; a family this evaluation did not search says that, and never the
    // vague "Not tested", "Not evaluated" or "Not available".
    if (!evaluated) {
      // The crossover region is not modelled at all.
      if (/phase/i.test(key)) {
        return {
          key,
          label,
          status: ADI_ROW_STATUS.NOT_YET_SUPPORTED,
          outcome: ADI_ROW_OUTCOME.PHASE_NOT_MODELLED,
          action: null,
        };
      }
      // A different subwoofer model or quantity is a design decision, not a
      // search — it is never silently omitted.
      if (/sub/i.test(key)) {
        return {
          key,
          label,
          status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
          outcome: ADI_ROW_OUTCOME.COMPARE_SEPARATELY,
          action: null,
        };
      }
      // An alternative layout is searched inside the placement pool. When the
      // placement search ran, it found no better layout.
      if (/layout/i.test(key)) {
        const placement = findLeverRow(planView, "placement");
        const placementTested = placement?.evaluated === true
          || buildFamilyLedgerRows({ families: planView?.run?.families })?.["placement"]?.status === ADI_ROW_STATUS.TESTED;
        return {
          key,
          label,
          status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
          outcome: placementTested ? ADI_ROW_OUTCOME.NO_BETTER_LAYOUT : ADI_ROW_OUTCOME.NOT_SEARCHED_IN_RUN,
          action: null,
        };
      }
      // The last family in the order is the last resort: it is searched only
      // once the practical options are exhausted, so an untouched seating
      // search is a policy state rather than a gap.
      if (isLast) {
        return {
          key,
          label,
          status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
          outcome: ADI_ROW_OUTCOME.SEATING_LAST_RESORT,
          action: null,
        };
      }
      const reason = shortPhrase(row?.notEvaluatedReason)
        || OPTIMISER_EVIDENCE_STATUS_LABEL?.[row?.evidenceStatus]
        || null;
      return {
        key,
        label,
        status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
        outcome: reason && !/baseline/i.test(reason) ? reason : ADI_ROW_OUTCOME.NOT_SEARCHED_IN_RUN,
        action: null,
      };
    }

    // Evaluated but not the change the card applies: the lever's OWN verdict
    // word, so a rejected or trade-off change is never shown as a plain "Tested"
    // row with only a number beside it.
    const leverVerdict = resolveLeverVerdict({
      effect: row?.effect || null,
      baseline: planView?.baseline || null,
      tested: true,
    });
    const phrase = row?.seating?.movementLabel
      || shortPhrase(describeLeverEffect(row?.effect))
      || shortPhrase(row?.reason)
      || null;

    if (leverVerdict.verdict === OPTIMISER_LEVER_VERDICT.REJECTED) {
      return { key, label, status: ADI_ROW_STATUS.REJECTED, outcome: leverVerdict.summary, action: null };
    }
    if (leverVerdict.verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF) {
      return { key, label, status: ADI_ROW_STATUS.TRADE_OFF, outcome: leverVerdict.summary, action: null };
    }
    if (leverVerdict.verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED) {
      // A genuine improvement that is not the one change the card applies.
      // A movement outside the practical placement envelope is stated as
      // theoretical: the improvement is real, the move is not offered by default.
      if (row?.practical === false) {
        return {
          key,
          label,
          status: ADI_ROW_STATUS.TESTED,
          outcome: row?.theoreticalReason
            ? `${PLACEMENT_THEORETICAL_NOTE} ${row.theoreticalReason}`
            : PLACEMENT_THEORETICAL_NOTE,
          action: null,
        };
      }
      if (row?.validation?.destinationsValid === false) {
        return {
          key,
          label,
          status: ADI_ROW_STATUS.REJECTED,
          outcome: `Rejected — the destination positions could not be confirmed as safe${
            row?.validation?.reason ? `: ${shortPhrase(row.validation.reason, 60)}` : ""
          }`,
          action: null,
        };
      }
      const offerableCount = (Array.isArray(planView?.levers) ? planView.levers : [])
        .filter((candidate) => leverIsOfferable(candidate, planView?.baseline || null)).length;
      return {
        key,
        label,
        status: ADI_ROW_STATUS.RECOMMENDED,
        outcome: phrase || leverVerdict.summary,
        action: null,
        actionText: offerableCount > 1 ? "Apply one at a time" : null,
      };
    }
    if (leverVerdict.verdict === OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE) {
      return {
        key,
        label,
        status: ADI_ROW_STATUS.TESTED,
        outcome: shortPhrase(row?.reason) || leverVerdict.summary,
        action: null,
      };
    }

    // Evaluated, inside the action threshold: the fixed "no useful improvement"
    // outcome states the threshold itself rather than leaving a bare number.
    return {
      key,
      label,
      status: ADI_ROW_STATUS.TESTED,
      outcome: row?.seating?.movementLabel
        || leverVerdict.summary
        || phrase
        || ADI_ROW_OUTCOME.NO_USEFUL,
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
  if (!recommendedLever) {
    return { allowed: false, reason: "No single evaluated change is available to apply." };
  }
  if (presentation?.showApply !== true) {
    return { allowed: false, reason: "There is nothing safe to apply in the current optimisation state." };
  }
  if (planView?.status !== "current" && planView?.status !== undefined && String(planView?.status) !== "current") {
    return { allowed: false, reason: "This optimisation result belongs to an earlier design state — re-run ADI before applying any change." };
  }
  if (planView?.individualEffectsEvaluated !== true) {
    return { allowed: false, reason: "No lever was evaluated on its own, so no change can be applied independently." };
  }

  const row = findLeverRow(planView, recommendedLever);
  if (!row || row.evaluated !== true || !Array.isArray(row.changes) || row.changes.length === 0) {
    return { allowed: false, reason: "The change behind this result was not kept, so it cannot be applied." };
  }
  // A theoretical placement is evidence, never an offer.
  if (row.practical === false) {
    return {
      allowed: false,
      reason: `${PLACEMENT_THEORETICAL_NOTE}${row.theoreticalReason ? ` ${row.theoreticalReason}` : ""}`,
    };
  }

  const limiting = String(resolveLimitingMetric(planView?.baseline) || "");
  if (limiting.includes("20")) {
    const improvement = Number(row?.effect?.p20DeltaDb ?? NaN);
    if (Number.isFinite(improvement) && Math.abs(improvement) < 1) {
      return { allowed: false, reason: "The improvement is below the 1 dB action threshold, so no change is applied." };
    }
  }

  return {
    allowed: true,
    lever: recommendedLever,
    label: LEVER_APPLY_LABEL[recommendedLever] || `Apply ${displayLabel(recommendedLever).toLowerCase()}`,
  };
}

/** Can this result be undone? Only a result that was applied to the design. */
export function resolveUndoPermission({ planView, appliedLever = null }) {
  if (appliedLever) {
    return {
      allowed: true,
      lever: appliedLever,
      label: LEVER_UNDO_LABEL[appliedLever] || "Undo change",
    };
  }
  if (Number(planView?.appliedCount) > 0) return { allowed: true, lever: null, label: "Undo change" };
  return { allowed: false, lever: null, label: null };
}

/**
 * Which families were evaluated, for the absorption advice's own checks. The
 * plan's lever rows are preferred; a run that saved terminal evidence has none,
 * so its family ledger is used instead. It states what the run did — nothing is
 * inferred from a family the run never searched.
 */
function absorptionLeverRows(planView) {
  const levers = Array.isArray(planView?.levers) ? planView.levers : [];
  if (levers.length > 0) return levers;
  const families = Array.isArray(planView?.run?.families) ? planView.run.families : [];
  return families.map((entry) => ({ lever: entry?.family || null, evaluated: entry?.tested === true }));
}

/**
 * The complete designer view model for the card.
 * `currentP20Deviation` comes from the published authority; everything else is
 * read from the saved plan. Missing authorities produce null — never a guess.
 */
export function buildAdiDesignerSummary({
  planView = null,
  presentation = null,
  liveProgress = null,
  instances = [],
  seatCount = null,
  currentP20Deviation = null,
  currentP20Level = null,
  limitingFrequencyHz = null,
  appliedLever = null,
  appliedDirection = null,
  roomDims = null,
} = {}) {
  const state = presentation?.state || null;
  const stale = state === OPTIMISER_PRESENTATION_STATE.STALE;
  const noRun = state === OPTIMISER_PRESENTATION_STATE.NO_RUN;
  // While ADI is working, the rows are its live progress through the fixed
  // sequence — never the previous run's evidence.
  const running = state === OPTIMISER_PRESENTATION_STATE.RUNNING || liveProgress?.running === true;

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
  const liveRows = running ? buildLiveFamilyRows(liveProgress) : null;
  const leverRows = buildTestedOptionRows(planView, { recommendedLever, appliedLever, liveRows, roomDims });

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
  // L2 does not attract absorption advice. While ADI is still working there is
  // no advice yet: the row stands as Waiting.
  const absorption = running ? null : resolveAbsorptionAdvice({
    p20Level: recommendedLevel ?? currentP20Level ?? baselineLevel,
    p20DeviationDb: recommendedRow?.effect?.p20VariationDb
      ?? currentP20Deviation
      ?? planView?.baseline?.p20VariationDb
      ?? null,
    seats: planView?.baseline?.seats,
    leverRows: absorptionLeverRows(planView),
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
    // The placement recommendation, resolved once: the physical move in
    // installer words, what it is expected to do, and whether it can be applied
    // or undone. Null when there is nothing to state about placement.
    placementRecommendation: resolvePlacementRecommendation({
      planView,
      roomDims,
      presentation,
      appliedLever,
      appliedDirection,
    }),
    actions: {
      canApply: apply.allowed,
      applyLabel: apply.label,
      applyReason: apply.allowed ? null : apply.reason,
      canUndo: undo.allowed,
      undoLabel: undo.label,
      undoLever: undo.lever,
      canRerun: true,
      // No on-plan preview of a proposed change exists yet — the card never
      // implies that one does.
      canPreview: false,
      // ONE re-run wording for every state that offers it.
      rerunLabel: "Re-run Optimisation Plan",
    },
  };
}