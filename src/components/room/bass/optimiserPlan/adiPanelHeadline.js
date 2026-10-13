// adiPanelHeadline.js
// ---------------------------------------------------------------------------
// THE BASS OPTIMISATION PANEL'S ONE HEADLINE — presentation only.
//
// The designer's view states a DECISION, not a calculation. This module resolves
// exactly four things, and nothing else:
//
//   WHAT is recommended   one adjustment, in installer words
//   WHAT it buys          one benefit sentence, figure-free
//   WHERE it lands        one P20 comparison, displayed whole dB only
//   HOW it stands         one status: applied · to consider · rejected
//
// Everything technical — the settings each change touches, per-seat figures,
// thresholds, acceptance ratios, candidate counts, fingerprints and the evidence
// that proves each claim — belongs to Engineer details, and is never produced
// here.
//
// STATE SELECTION, never the engineering. Which of the four states leads is read
// from the decision the authorities already recorded (the calibration decision,
// the recommended lever, the published result). The comparison pair is chosen so
// the two values it compares belong to the SAME evaluation: a pair measured
// against a different current state is never presented as a current → best
// claim, and a worse result is never labelled as the best one.
//
// READ-ONLY: it re-expresses values the calibration decision authority, the plan
// and the published bass result already carry. It changes no bass maths, no
// acceptance rule, no saved calibration and no RP22 grade.
// ---------------------------------------------------------------------------

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  describeCalibrationNotApplied,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import {
  describeCalibrationAdjustment,
  suggestionInputsFromSettings,
} from "../optimiseWorkflow/adiCalibrationSuggestion.js";
import { ADI_CALIBRATION_KIND, ADI_NO_SAFE_CALIBRATION_IMPROVEMENT } from "./adiPanelSections.js";
import {
  alternativeIsWorseThanCurrent,
  RECOMMENDATION_NOT_CURRENT_SENTENCE,
} from "./recommendationCurrency.js";
import { deviationText, levelText, wholeDbImprovement } from "./optimiserWholeNumberDb.js";

/** The ONE status the panel states when a decision has been reached. */
export const ADI_PANEL_STATUS = Object.freeze({
  APPLIED: "Applied",
  CONSIDER: "Improvement to consider",
  REJECTED: "Rejected — regression",
});

/** The one benefit sentence per improvement kind — no figure is ever stated. */
export const ADI_PANEL_BENEFIT = Object.freeze({
  P20: "Improved predicted bass consistency across the seating area.",
  P19: "Improved predicted seat-to-seat level consistency.",
  TRADE_OFF: "A larger improvement in bass consistency, with a trade-off for you to approve.",
});

/** The label the P20 comparison always carries. */
export const ADI_P20_VARIATION_LABEL = "P20 variation";

/**
 * The hold reasons that mean the improvement was REFUSED because it would
 * regress the design or the seat-to-seat result. Those are stated as a refusal,
 * never as an offer.
 */
export const REGRESSION_HOLD_REASONS = Object.freeze([
  CALIBRATION_APPLY_REASON.P19_DAMAGED,
  CALIBRATION_APPLY_REASON.P20_DAMAGED,
  CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  CALIBRATION_APPLY_REASON.TRADEOFF_DAMAGE_EXCEEDS_BENEFIT,
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function cap(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function levelSuffix(p20) {
  const level = levelText(p20?.level);
  return level ? ` · ${level}` : null;
}

/**
 * "P20 variation: ±27 dB → ±11 dB · L1" — the panel's one performance
 * comparison, in the displayed whole dB every surface uses (P19/P20 deviations
 * are floored) with the level the design lands at.
 *
 * The displayed difference is deliberately NOT restated as the exact gain: the
 * two displayed values are the comparison, and the exact figures behind them are
 * Engineer details' job. With only one side available the single value is
 * stated, so a value measured against a different state is never paired with one
 * it does not belong to.
 */
export function p20VariationText(beforeP20 = null, afterP20 = null) {
  const before = deviationText(beforeP20?.deviationDb);
  const after = deviationText(afterP20?.deviationDb);
  if (before && after) return `${ADI_P20_VARIATION_LABEL}: ${before} → ${after}${levelSuffix(afterP20)}`;
  if (after) return `${ADI_P20_VARIATION_LABEL}: ${after}${levelSuffix(afterP20)}`;
  if (before) return `${ADI_P20_VARIATION_LABEL}: ${before}${levelSuffix(beforeP20)}`;
  return null;
}

/**
 * THE ADJUSTMENT for a calibration decision, in the designer's own terms.
 *
 * A delay change leads with the RELATIVE group offset — the installable fact —
 * whenever the groups are recorded; every other change is stated from the
 * settings the decision itself changed. Nothing is inferred from a value the
 * decision did not record.
 */
export function calibrationAdjustmentText({ decision = null, relativeDelay = null } = {}) {
  const settings = Array.isArray(decision?.settings) ? decision.settings : [];
  const delayChanged = settings.some(
    (row) => row?.setting === "Delay" || String(row?.key || "").startsWith("delay:"),
  );
  if (delayChanged && relativeDelay?.statement) return relativeDelay.statement;
  const phrase = cap(describeCalibrationAdjustment(suggestionInputsFromSettings(settings)));
  if (phrase) return phrase;
  return relativeDelay?.statement || null;
}

/** One benefit sentence, from what the decision itself assessed. */
function decisionBenefit(decision) {
  const improvement = decision?.improvement || null;
  const improved = improvement?.p20Improved === true
    || improvement?.p19Improved === true
    || (finite(improvement?.p20DeltaDb) ?? 0) > 0
    || (finite(improvement?.p19DeltaDb) ?? 0) > 0;
  if (!improved) return null;
  // A change that buys its improvement with a worsening is a trade-off: it is
  // never stated as a plain win, and the ratio behind it stays in details.
  const traded = Boolean(decision?.tradeOff) || decision?.damage?.any === true;
  if (traded) return ADI_PANEL_BENEFIT.TRADE_OFF;
  if (improvement?.p20Improved === true) return ADI_PANEL_BENEFIT.P20;
  if (improvement?.p19Improved === true) return ADI_PANEL_BENEFIT.P19;
  return ADI_PANEL_BENEFIT.P20;
}

/**
 * The recommended PHYSICAL change, with the P20 pair its own evaluation
 * measured. When that evaluation ran against a different current state, only the
 * result it measured is stated — the pair is not, and the distinction is named
 * in Engineer details.
 */
function recommendationHeadline({ recommendation, recommendedRow = null, baseline = null, currentP20 = null }) {
  const effect = recommendedRow?.effect || null;
  const afterP20 = {
    deviationDb: effect?.p20VariationDb ?? null,
    level: effect?.p20LevelAfter ?? baseline?.p20Level ?? null,
  };
  const beforeP20 = { deviationDb: baseline?.p20VariationDb ?? null, level: baseline?.p20Level ?? null };
  const p20Gain = wholeDbImprovement(baseline?.p20VariationDb, effect?.p20VariationDb) != null;
  const p19Gain = finite(effect?.p19DeltaDb) != null && Number(effect.p19DeltaDb) < 0;
  return {
    kind: "recommendation",
    statusLabel: ADI_PANEL_STATUS.CONSIDER,
    adjustment: recommendation || null,
    benefit: p20Gain ? ADI_PANEL_BENEFIT.P20 : (p19Gain ? ADI_PANEL_BENEFIT.P19 : null),
    comparison: currentP20?.runBaselineDiffers === true
      ? p20VariationText(null, afterP20)
      : p20VariationText(beforeP20, afterP20),
  };
}

/**
 * Resolve the panel's ONE headline.
 *
 * @param {object} params
 * @param {string|null} params.calibrationKind - the panel's own resolved
 *   calibration section kind (ADI_CALIBRATION_KIND)
 * @param {object|null} params.calibrationDecision - the run's calibration decision
 * @param {boolean} [params.calibrationSuggested] - the saved evidence holds a
 *   useful but unapplied improvement
 * @param {object|null} [params.appliedCalibration] - persisted applied calibration
 * @param {object|null} [params.relativeDelay] - the resolved relative group offset
 * @param {string|null} [params.recommendation] - the physical change ADI may not apply
 * @param {object|null} [params.recommendedRow] - the plan's own row for that change
 * @param {object|null} [params.baseline] - the state the evaluation ran on
 * @param {object|null} [params.currentP20] - the published current P20 authority
 * @param {boolean} [params.stale] - the saved result belongs to an earlier design
 * @param {boolean} [params.isRunning] - a run is in progress
 * @param {string|null} [params.finding] - the state sentence the panel already
 *   resolves for the states that have no decision to state
 * @returns {{kind: string, statusLabel: string|null, adjustment: string|null,
 *   benefit: string|null, comparison: string|null}}
 */
export function resolveAdiPanelHeadline({
  calibrationKind = null,
  calibrationDecision = null,
  calibrationSuggested = false,
  appliedCalibration = null,
  relativeDelay = null,
  recommendation = null,
  recommendedRow = null,
  baseline = null,
  currentP20 = null,
  currentP20DeviationDb = null,
  stale = false,
  isRunning = false,
  finding = null,
} = {}) {
  // A run in progress, or a result that belongs to an earlier design state, owns
  // the panel's own state copy: no adjustment is offered from either.
  if (isRunning) {
    return { kind: "running", statusLabel: null, adjustment: null, benefit: null, comparison: null };
  }
  if (stale) {
    return { kind: "state", statusLabel: null, adjustment: null, benefit: null, comparison: null };
  }

  const decision = calibrationDecision && typeof calibrationDecision === "object" ? calibrationDecision : null;
  const decisionKind = decision?.decision || null;
  const reason = decision?.reason || null;
  const hasPersistedValues = Array.isArray(appliedCalibration?.values) && appliedCalibration.values.length > 0;

  const applied = calibrationKind === ADI_CALIBRATION_KIND.APPLIED
    || decisionKind === CALIBRATION_APPLY_DECISION.APPLIED;
  const persisted = calibrationKind === ADI_CALIBRATION_KIND.PERSISTED;
  const rejected = decisionKind === CALIBRATION_APPLY_DECISION.HOLD
    && REGRESSION_HOLD_REASONS.includes(reason);
  const considering = !applied && !rejected
    && (calibrationSuggested === true
      || reason === CALIBRATION_APPLY_REASON.IMPROVEMENT_WORTH_CONSIDERING
      || reason === CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED);

  // ── 1. The change the designer has to decide leads the panel ──
  // A physical change ADI may never apply is stated as the move itself, because
  // that IS the decision in front of the designer.
  if (recommendation) return recommendationHeadline({ recommendation, recommendedRow, baseline, currentP20 });

  // ── 2. Calibration ADI applied on its own ──
  // APPLIED is stated only for settings that really are in the design: a
  // decision that applied them, or values the persisted authority holds.
  if (applied || (persisted && hasPersistedValues)) {
    return {
      kind: "applied",
      statusLabel: ADI_PANEL_STATUS.APPLIED,
      adjustment: calibrationAdjustmentText({ decision, relativeDelay }),
      benefit: decisionBenefit(decision),
      comparison: p20VariationText(decision?.before?.p20, decision?.after?.p20),
    };
  }

  // ── 3. An adjustment ADI held for the designer ──
  // The current design is the reference. A held improvement whose own result is
  // no longer better than the design as it stands is a past evaluation: it keeps
  // its evidence in Engineer details and is never offered as a current adjustment.
  if (considering && alternativeIsWorseThanCurrent({
    effectP20VariationDb: decision?.after?.p20?.deviationDb ?? null,
    currentP20DeviationDb,
    runBaselineDiffers: currentP20?.runBaselineDiffers === true,
  })) {
    return {
      kind: "state",
      statusLabel: null,
      adjustment: null,
      benefit: RECOMMENDATION_NOT_CURRENT_SENTENCE,
      comparison: null,
    };
  }

  if (considering) {
    return {
      kind: "consider",
      statusLabel: ADI_PANEL_STATUS.CONSIDER,
      adjustment: calibrationAdjustmentText({ decision, relativeDelay }),
      benefit: decisionBenefit(decision),
      comparison: p20VariationText(decision?.before?.p20, decision?.after?.p20),
    };
  }

  // ── 4. Refused for a meaningful regression ──
  // The change that was evaluated is named, with the rule that refused it and the
  // pair it was judged on. The refusal is the decision authority's own sentence —
  // no figure and no candidate id — never the engine's diagnostic statement, which
  // is read in Engineer details. It is never presented as an offer.
  if (rejected) {
    return {
      kind: "rejected",
      statusLabel: ADI_PANEL_STATUS.REJECTED,
      adjustment: calibrationAdjustmentText({ decision, relativeDelay }),
      benefit: describeCalibrationNotApplied(reason) || ADI_NO_SAFE_CALIBRATION_IMPROVEMENT,
      comparison: p20VariationText(decision?.before?.p20, decision?.after?.p20),
    };
  }

  // ── 5. No decision to state ──
  // The state sentence the panel's finding authority already resolved states the
  // outcome (not evaluated · evidence not retained · no useful improvement), and
  // nothing is offered. Calibration already in the design is still stated as
  // applied, from the design's own recorded groups.
  if (hasPersistedValues || calibrationKind === ADI_CALIBRATION_KIND.PERSISTED) {
    return {
      kind: "applied",
      statusLabel: ADI_PANEL_STATUS.APPLIED,
      adjustment: relativeDelay?.statement || null,
      benefit: null,
      comparison: null,
    };
  }
  // The state sentence the finding authority resolved — not evaluated, evidence
  // not retained, or no useful improvement — is the panel's one line here.
  return {
    kind: "state",
    statusLabel: null,
    adjustment: null,
    benefit: finding || null,
    comparison: null,
  };
}