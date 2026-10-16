// optimiserResultViewModel.js
// ---------------------------------------------------------------------------
// THE ONE CANONICAL OPTIMISER RESULT VIEW MODEL.
//
// Every presentation surface of a completed Bass Optimiser run reads its meaning
// from HERE and from nowhere else. Before this existed, each surface decided for
// itself what a run meant, which is why the same run could be described as
// "Delay only" on one card and "Phase + delay + gain" on another, "Held" on one
// and "Applied" on another, "Primary seat regressed" on one and "No required
// metric made worse" on another, and why P14 could read 115 dBC in one place and
// 126 dB in another.
//
// WHAT IT IS: a presentation authority. It reads evidence that ALREADY exists —
// the persisted terminal optimiser decision, the persisted winning candidate,
// the canonical published Bass result and the run's identity — and resolves it
// into ONE description of the result.
//
// WHAT IT IS NOT: it calculates no optimisation, re-ranks nothing, re-applies no
// threshold, changes no P19/P20 definition, no materiality rule, no primary-seat
// protection, no RP22 grade, and no apply/publication logic. Where the evidence
// does not exist it returns null, so a surface states nothing rather than
// inventing a value.
//
// THE TWO NON-NEGOTIABLE RULES:
//
//   1. CURRENT AND PROPOSED ARE NEVER MIXED. `current` is the canonical
//      published bass result for the design as it stands. `proposed` is the
//      candidate the run evaluated. They are separate objects, each labelled,
//      and a proposed value can never be read as the project's current result.
//
//   2. THE PERSISTED TERMINAL DECISION IS AUTHORITATIVE. Applied/held is read
//      from the decision the run recorded — never inferred from the presence of
//      settings, from candidate ranking, or from an earlier stage's verdict.
//
// Everything a designer-facing surface needs is in the returned object; the raw
// ids, fingerprints and rejection evidence behind it are returned only when the
// caller asks for Developer Diagnostics (`debug: true`).
// ---------------------------------------------------------------------------

import { formatSeatLabel } from "@/components/utils/seatLabel";
import { OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";
import {
  deltaText,
  deviationText,
  levelText,
  wholeDbImprovement,
} from "./optimiserWholeNumberDb.js";
import {
  OPTIMISER_RESULT_SIDE,
  buildCurrentSide,
  buildProposedSide,
} from "./optimiserResultSides.js";
import { displayDeltaPhrase, displayImprovementText } from "./optimiserDisplayDelta.js";
import {
  LIMITING_FREQUENCY_NOT_IDENTIFIED,
  resolveLimitingFrequency,
} from "./optimiserLimitingFrequency.js";
import { resolveOptimiserCurrentP20 } from "./optimiserCurrentP20.js";
import {
  readAuthoritativeP20Headline,
  readAuthoritativeParameterHeadline,
} from "./optimiserPlanMetrics.js";
import { PLACEMENT_KIND } from "./placementRecommendationAuthority.js";
import { CALIBRATION_APPLY_DECISION } from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { readRecordedSeatRegression } from "./optimiserTradeOffState.js";

/**
 * WHAT THE RESULT IS. Exactly one of these describes any terminated run, so a
 * surface states a decision rather than an engine state.
 */
export const OPTIMISER_DECISION_TYPE = Object.freeze({
  /** A confirmed, applicable adjustment. */
  IMPROVEMENT: "improvement",
  /** A confirmed adjustment ADI applied to the design itself. */
  APPLIED_IMPROVEMENT: "applied improvement",
  /**
   * A confirmed improvement that costs a protected primary seat. A designer
   * decision, never an optimiser success — the change is NOT applied.
   */
  TRADE_OFF: "trade-off",
  /** The confirmed improvement is a physical move (placement / seating). */
  PHYSICAL_RECOMMENDATION: "physical recommendation",
  /** The search completed and confirmed nothing worth changing. */
  NO_IMPROVEMENT: "no improvement",
  /** The designer kept the current design: nothing was applied. */
  KEPT_CURRENT: "kept current",
  /** A genuine technical failure. Never a design statement. */
  FAILED: "failed",
  /**
   * The saved result does not belong to the design as it stands. Its candidate
   * evidence may NOT be presented as current, and it is never called a
   * confirmed canonical result.
   */
  RETEST_NEEDED: "re-test needed",
  /**
   * No terminated run exists for this design version at all. Stated separately
   * so "no improvement" is never claimed for a search that never ran.
   */
  NOT_RUN: "not run",
});

/**
 * WHETHER THE CHANGE IS IN THE DESIGN. One authority for every surface.
 * NOT_APPLICABLE is the honest state when the run's evidence describes no
 * change the designer could accept at all (no winner, incomplete evaluation).
 */
export const OPTIMISER_APPLIED_STATE = Object.freeze({
  APPLIED: "applied",
  HELD: "held",
  REJECTED: "rejected",
  NOT_APPLICABLE: "not_applicable",
});

export const OPTIMISER_APPLIED_STATE_LABEL = Object.freeze({
  [OPTIMISER_APPLIED_STATE.APPLIED]: "Applied",
  [OPTIMISER_APPLIED_STATE.HELD]: "Held — not applied",
  [OPTIMISER_APPLIED_STATE.REJECTED]: "Rejected",
  [OPTIMISER_APPLIED_STATE.NOT_APPLICABLE]: "Not applied",
});

// The side label every value carries is defined with the two sides themselves
// (optimiserResultSides.js) and re-exported here so the view model is the one
// place a surface imports the result vocabulary from.
export { OPTIMISER_RESULT_SIDE };

/** Supporting alternatives are never "the best result" — they were tested. */
export const OPTIMISER_ALTERNATIVE_LABEL = "Alternative tested";

/** A placement that was tested but not recommended may only be named this. */
export const OPTIMISER_TESTED_PLACEMENT_LABEL = "best tested placement candidate";

/** The most supporting alternatives any surface may present. */
export const OPTIMISER_ALTERNATIVE_MAX = 3;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

// The CURRENT and PROPOSED sides themselves — one value's own shape, and the
// two authorities each side is read from — live in optimiserResultSides.js.
// This module composes them into the one result description.

/**
 * The ONE winner. The persisted terminal decision identifies it when a decision
 * was recorded; otherwise it is the one lever whose own effect was independently
 * evaluated and which clears the existing offerability gate. Never a second pool.
 */
function resolveWinner({ planView, decision, suppressedLevers = [] }) {
  const levers = Array.isArray(planView?.levers) ? planView.levers : [];
  const keyOf = (row) => row?.lever ?? row?.leverKey ?? row?.key ?? null;
  const evaluated = levers.filter((row) => row?.evaluated === true && Array.isArray(row?.changes) && row.changes.length > 0);

  const recordedLever = decision?.lever || decision?.familyKey || null;
  const fromDecision = recordedLever
    ? evaluated.find((row) => keyOf(row) === recordedLever) || null
    : null;

  const offerable = evaluated.filter((row) => row?.canApply === true
    || (row?.effect != null && !suppressedLevers.includes(keyOf(row))));
  const single = offerable.length === 1 ? offerable[0] : null;

  const row = fromDecision || single || null;
  if (!row) {
    // A decision may still name its candidate when no lever evaluation survived.
    return planView?.candidateId
      ? { lever: recordedLever, row: null, effect: null, candidateId: planView.candidateId }
      : null;
  }
  return {
    lever: keyOf(row),
    row,
    effect: row?.effect || null,
    candidateId: row?.candidateId || planView?.candidateId || decision?.candidateId || null,
  };
}

/**
 * The ONE applied state. The persisted terminal decision is authoritative; a
 * genuine apply is never inferred from the presence of settings, from the
 * candidate ranking or from an earlier stage's verdict.
 */
function resolveAppliedState({ planView, decision, appliedLever, decisionType }) {
  const decisionKind = decision?.decision || null;
  const persistedApplied = decisionKind === CALIBRATION_APPLY_DECISION.APPLIED
    && planView?.decisionApplied === true;

  if (persistedApplied) return OPTIMISER_APPLIED_STATE.APPLIED;
  if (appliedLever != null) return OPTIMISER_APPLIED_STATE.APPLIED;
  // The persisted HOLD is the designer's decision not to apply it. A held
  // trade-off and a held improvement are both HELD, never REJECTED: a rejection
  // is a candidate the run itself discarded.
  if (decisionKind === CALIBRATION_APPLY_DECISION.HOLD) return OPTIMISER_APPLIED_STATE.HELD;
  if (decisionType === OPTIMISER_DECISION_TYPE.NO_IMPROVEMENT
    || decisionType === OPTIMISER_DECISION_TYPE.FAILED
    || decisionType === OPTIMISER_DECISION_TYPE.RETEST_NEEDED
    || decisionType === OPTIMISER_DECISION_TYPE.NOT_RUN) {
    return OPTIMISER_APPLIED_STATE.NOT_APPLICABLE;
  }
  return OPTIMISER_APPLIED_STATE.REJECTED;
}

/** The protected seat the change costs, and exactly how much, as recorded. */
function affectedSeat({ decision, tradeOffState }) {
  const regression = readRecordedSeatRegression(decision);
  const scope = tradeOffState?.seat || null;
  const seatId = regression?.seatId || scope?.seatId || null;
  if (!seatId) return { seat: null, regression: null };
  const delta = num(regression?.rawDeltaDb ?? scope?.delta);
  return {
    seat: {
      seatId,
      // The app's one seat-label authority.
      label: formatSeatLabel(seatId),
      scope: "primary",
      parameter: regression?.parameter || scope?.parameter || null,
      before: scope?.before || null,
      after: scope?.after || null,
    },
    // The amount stays the NUMBER the run recorded: an explicit retained seat
    // regression (1.2 dB) is never rounded away and never re-derived.
    regression: delta == null
      ? null
      : {
        seatId,
        parameter: regression?.parameter || scope?.parameter || "P20",
        amountDb: delta,
        amountText: `${delta} dB`,
        direction: "worsens",
      },
  };
}

/**
 * The ONE physical recommendation. A placement the run TESTED but did NOT
 * recommend is never a recommendation: it is returned as a tested candidate for
 * Developer Diagnostics only, and `isRecommendation` is false.
 */
function physicalRecommendation({ placement, appliedState }) {
  if (!placement) {
    return { isRecommendation: false, testedNotRecommended: false, testedCandidate: null, movementLabel: null, expectedEffect: null, statusText: null, canApply: false, canUndo: false };
  }
  const isRecommendation = placement.kind === PLACEMENT_KIND.RECOMMENDED;
  const isApplied = placement.kind === PLACEMENT_KIND.APPLIED;
  // Only a genuinely recommended (or already applied) move is ever named as a
  // recommendation. Everything else is evidence the run tested.
  const testedCandidate = isRecommendation || isApplied
    ? null
    : {
      label: OPTIMISER_TESTED_PLACEMENT_LABEL,
      movementLabel: placement.move?.movementLabel || null,
      kind: placement.kind || null,
      reason: placement.notice || placement.reason || null,
      tested: true,
      recommended: false,
    };
  return {
    isRecommendation: isRecommendation || isApplied,
    recommended: isRecommendation,
    applied: isApplied,
    testedNotRecommended: testedCandidate != null,
    testedCandidate,
    movementLabel: isRecommendation || isApplied ? (placement.move?.movementLabel || null) : null,
    expectedEffect: isRecommendation || isApplied ? (placement.summary || null) : null,
    statusText: placement.statusText || null,
    notice: placement.notice || null,
    appliedState,
    canApply: isRecommendation && placement.canApply === true,
    canUndo: isApplied && placement.canUndo === true,
  };
}

/**
 * Supporting alternatives: levers the run evaluated that are NOT the winner.
 * Labelled "Alternative tested" — never "Best result" — and capped, in the
 * plan's own lever order.
 */
function otherUsefulOptions({ planView, winner }) {
  const levers = Array.isArray(planView?.levers) ? planView.levers : [];
  const keyOf = (row) => row?.lever ?? row?.leverKey ?? row?.key ?? null;
  return levers
    .filter((row) => row?.evaluated === true
      && keyOf(row) !== winner?.lever
      && row?.effect != null
      && row?.tradeOff?.isTradeOff === true)
    .slice(0, OPTIMISER_ALTERNATIVE_MAX)
    .map((row) => ({
      label: OPTIMISER_ALTERNATIVE_LABEL,
      lever: keyOf(row),
      movementLabel: row?.movementLabel || row?.seating?.movementLabel || null,
      p20Text: deviationText(row?.effect?.p20VariationDb),
      p20LevelText: levelText(row?.effect?.p20Level),
      tradeOffReason: row?.tradeOff?.reason || null,
      canApply: row?.canApply === true,
    }));
}

/**
 * Resolve one completed (or absent) run into the canonical result description.
 *
 * @param {object} params
 * @param {object|null} params.planView - the saved run/plan view (with its
 *        already-resolved `status`), including `calibrationDecision`.
 * @param {object|null} params.identity - { projectId, versionId, runId }
 * @param {object|null} params.completedBassAuthority - the canonical published
 *        Bass result for the design as it stands.
 * @param {object|null} params.presentation - resolveOptimiserPresentationState output
 * @param {object|null} params.placement - resolvePlacementRecommendation output
 * @param {string|null} params.appliedLever - a GENUINELY applied lever, from provenance
 * @param {object|null} params.tradeOffState - resolveTradeOffState output
 * @param {string[]} [params.suppressedLevers] - levers the plausibility gate refuses
 * @param {boolean} [params.debug] - include the raw provenance evidence
 * @returns {object} the canonical result view model
 */
export function buildOptimiserResultViewModel({
  planView = null,
  identity = null,
  completedBassAuthority = null,
  presentation = null,
  placement = null,
  appliedLever = null,
  tradeOffState = null,
  currentP20 = null,
  suppressedLevers = [],
  debug = false,
} = {}) {
  const planStatus = planView?.status || OPTIMISER_PLAN_STATUS.ABSENT;
  const presentationState = presentation?.state || null;
  const decision = planView?.calibrationDecision || planView?.decision || null;
  const stale = planStatus === OPTIMISER_PLAN_STATUS.STALE || presentationState === "stale";
  const failed = planStatus === OPTIMISER_PLAN_STATUS.FAILED || presentationState === "failed";
  const hasEvidence = Boolean(planView && (planView.recordKind || planView.run || planView.candidateId || planView.levers));

  // The current-P20 authority is resolved ONCE per render: a caller that has
  // already resolved it (the card, for its placement gate) passes it in, so the
  // same value cannot be derived twice.
  const resolvedCurrentP20 = currentP20 || (() => {
    const headline = readAuthoritativeP20Headline(completedBassAuthority);
    return resolveOptimiserCurrentP20({
      authorityP20: {
        variationDb: headline?.variationDb,
        level: headline?.level,
        worstSeatId: headline?.worstSeatId,
        worstFrequencyHz: headline?.worstFrequencyHz,
      },
      planView,
    });
  })();

  // ── The ONE limiting frequency ──
  // The published current result's own limiting frequency first — the same value
  // the tooltip and graph read — and never a second derivation of it. A value
  // that is not a frequency reads "Not identified", never "0 Hz".
  const limitingFrequency = resolveLimitingFrequency(
    resolvedCurrentP20?.frequencyHz ?? planView?.baseline?.worstFrequencyHz ?? null,
  );

  const winner = resolveWinner({ planView, decision, suppressedLevers });
  const readers = { readAuthoritativeP20Headline, readAuthoritativeParameterHeadline };
  const current = hasEvidence
    ? buildCurrentSide({ completedBassAuthority, currentP20: resolvedCurrentP20, planView, readers })
    : null;
  const proposed = hasEvidence ? buildProposedSide({ decision, winner }) : null;
  const seat = affectedSeat({ decision, tradeOffState });

  const isTradeOff = stale ? false : (
    tradeOffState?.isTradeOff === true
    || presentationState === "trade_off"
  );

  const decisionType = (() => {
    if (stale) return OPTIMISER_DECISION_TYPE.RETEST_NEEDED;
    if (failed) return OPTIMISER_DECISION_TYPE.FAILED;
    if (!hasEvidence) return OPTIMISER_DECISION_TYPE.NOT_RUN;
    if (tradeOffState?.kept === true) return OPTIMISER_DECISION_TYPE.KEPT_CURRENT;
    if (isTradeOff) return OPTIMISER_DECISION_TYPE.TRADE_OFF;
    if (decision?.decision === CALIBRATION_APPLY_DECISION.APPLIED) {
      return OPTIMISER_DECISION_TYPE.APPLIED_IMPROVEMENT;
    }
    const physical = physicalRecommendation({ placement, appliedState: null });
    if (physical.isRecommendation) return OPTIMISER_DECISION_TYPE.PHYSICAL_RECOMMENDATION;
    if (winner) return OPTIMISER_DECISION_TYPE.IMPROVEMENT;
    return OPTIMISER_DECISION_TYPE.NO_IMPROVEMENT;
  })();

  const appliedState = resolveAppliedState({ planView, decision, appliedLever, decisionType });
  const physical = physicalRecommendation({ placement, appliedState });

  // The displayed improvement is the difference between the two DISPLAYED
  // endpoints, so it always adds up with the pair beside it. An explicit retained
  // seat regression is the recorded amount and is never converted by this rule.
  const improvementDb = current?.p20?.display != null && proposed?.p20?.display != null
    ? wholeDbImprovement(current.p20.raw, proposed.p20.raw)
    : null;
  const displayedDeltaText = displayImprovementText(current?.p20?.raw ?? null, proposed?.p20?.raw ?? null);
  const p20PairText = current?.p20?.display != null && proposed?.p20?.display != null
    ? `${current.p20.display} \u2192 ${proposed.p20.display}`
    : null;
  const p20PairDeltaText = displayDeltaPhrase(current?.p20?.display ?? null, proposed?.p20?.display ?? null);
  const p19DeltaText = displayDeltaPhrase(current?.p19?.display ?? null, proposed?.p19?.display ?? null);
  const p14DeltaText = deltaText(
    current?.p14?.raw != null && proposed?.p14?.raw != null
      ? proposed.p14.raw - current.p14.raw
      : null,
  );
  const p18DeltaText = deltaText(
    current?.p18?.raw != null && proposed?.p18?.raw != null
      ? proposed.p18.raw - current.p18.raw
      : null,
  );

  return {
    // ── identity ──
    runId: planView?.run?.runId || identity?.runId || planView?.runId || null,
    projectId: planView?.projectId || identity?.projectId || null,
    versionId: planView?.versionId || identity?.versionId || null,
    terminalStatus: planStatus,
    presentationState,
    stale,
    failed,
    hasTerminalRun: hasEvidence && !stale,

    // ── the one decision ──
    decisionType,
    appliedState,
    appliedStateLabel: OPTIMISER_APPLIED_STATE_LABEL[appliedState],
    // The run's own recorded sentence. Read, never assembled, so every surface
    // states the same reason in the same words.
    decisionReason: decision?.statement || null,
    decisionReasonCode: decision?.reason || null,
    decisionKept: tradeOffState?.kept === true,

    // ── the one winner ──
    winnerId: winner?.candidateId || null,
    winnerFamily: winner?.lever || null,
    winnerAdjustment: decision?.adjustment || decision?.objectiveLabel || null,

    // ── current and proposed: two sides, never mixed ──
    current,
    proposed,
    // The resolved current-P20 record itself, so a caller reuses this one
    // resolution rather than deriving the current value a second time.
    currentP20: resolvedCurrentP20,

    // ── what gets worse ──
    affectedSeat: seat.seat,
    affectedSeatRegression: seat.regression,

    // ── the one limiting frequency ──
    limitingFrequency: {
      hz: limitingFrequency.hz,
      text: limitingFrequency.text,
      identified: limitingFrequency.identified,
      notIdentifiedText: LIMITING_FREQUENCY_NOT_IDENTIFIED,
    },

    // ── the one physical recommendation ──
    physicalRecommendation: physical,

    // ── supporting alternatives, never the best result ──
    otherUsefulOptions: hasEvidence ? otherUsefulOptions({ planView, winner }) : [],

    // ── displayed pairs, from displayed endpoints ──
    comparison: {
      p20PairText,
      p20DeltaText: p20PairDeltaText,
      p20ImprovementText: displayedDeltaText,
      p19DeltaText,
      p14DeltaText,
      p18DeltaText,
      // The retained seat regression, as recorded (1.2 dB stays 1.2 dB).
      seatRegressionText: seat.regression?.amountText || null,
    },

    // ── ENGINEERING AUDIT ONLY ──
    // Never rendered outside Developer Diagnostics.
    provenance: debug
      ? {
        planVersion: planView?.planVersion ?? null,
        recordKind: planView?.recordKind || null,
        designFingerprint: planView?.designFingerprint || null,
        resultFingerprint: planView?.resultFingerprint || null,
        publishedFingerprint: completedBassAuthority?.contract?.job?.resultFingerprint || null,
        baselineParity: planView?.baselineParity || null,
        individualEffectsEvaluated: planView?.individualEffectsEvaluated === true,
        candidateId: planView?.candidateId || null,
        candidateKind: planView?.candidateKind || null,
        winnerLever: winner?.lever || null,
        runBaselineDiffers: resolvedCurrentP20?.runBaselineDiffers === true,
        runBaselineDeviation: resolvedCurrentP20?.runBaselineDeviation || null,
        limitingFrequencySource: resolvedCurrentP20?.frequencyHz
          ?? planView?.baseline?.worstFrequencyHz
          ?? null,
        decision: decision || null,
      }
      : null,
  };
}

export default buildOptimiserResultViewModel;