// placementRecommendationAuthority.js
// ---------------------------------------------------------------------------
// ONE resolution for the placement recommendation the designer sees.
//
// Product rules this exists to satisfy:
//   • If ADI found a useful, safe, independently evaluated placement
//     improvement, it is OFFERED as a placement recommendation — with the
//     physical move in plain words, the expected result in whole dB, and an
//     Apply action that can be undone.
//   • If that improvement belongs to an earlier design state, Apply is not
//     shown: the card states the previous improvement and asks for a re-run.
//   • A theoretical option (a movement off the mounting wall) is never offered
//     as default placement; it is stated in Engineer details instead.
//
// PURE and READ-ONLY: it reads the saved plan/run evidence and reformats it. It
// evaluates nothing, recalculates nothing, and changes no bass maths, no
// optimiser scoring, no P19/P20 definition and no RP22 grading.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_PLAN_STATUS,
} from "./optimiserPlanConstants.js";
import { ADI_BASS_OPTIMISER_LABEL } from "./resolveAdiOptimiserJourney.js";
import { RECOMMENDATION_NOT_CURRENT_SENTENCE } from "./recommendationCurrency.js";
import { resolveLeverVerdict } from "./optimiserLeverVerdict.js";
import { LEVER_APPLY_LABEL, LEVER_UNDO_LABEL } from "./optimiserPlanLeverApply.js";
import {
  deltaText,
  deviationText,
  frequencyText,
  levelText,
  wholeDbImprovement,
} from "./optimiserWholeNumberDb.js";
import {
  PLACEMENT_APPLIED_MESSAGE,
  PLACEMENT_BASELINE_MISMATCH,
  PLACEMENT_DEFINITION,
  PLACEMENT_MOVE_NOT_RETAINED,
  PLACEMENT_PANEL_TITLE,
  PLACEMENT_PREVIEW_UNAVAILABLE,
  PLACEMENT_PREVIOUS_FOUND_STALE,
  PLACEMENT_THEORETICAL_NOTE,
  PLACEMENT_UNDONE_MESSAGE,
  describePlacementMove,
} from "./placementMoveAuthority.js";
import { formatSeatLabel } from "../../../utils/seatLabel.jsx";
import {
  PLACEMENT_CREDIBILITY,
  assessPlacementPlausibility,
  subwooferGroupCounts,
} from "./placementPlausibilityAuthority.js";

/** What the panel is stating. */
export const PLACEMENT_KIND = Object.freeze({
  RECOMMENDED: "recommended",
  PREVIOUS: "previous",
  APPLIED: "applied",
  // A real but small improvement, stated as a non-actionable note: no
  // Recommended badge, no Apply, and no physical move to carry out.
  NOTE: "note",
});

/**
 * Whether the recommendation belongs to the design as it stands now, or to an
 * earlier run — and whether carrying it out is the designer's own decision.
 * Stated in the card so neither is ever left to be inferred.
 */
export const PLACEMENT_RESULT_STATUS = Object.freeze({
  RECOMMENDED: "Current design. Requires your approval — the physical change is not applied automatically.",
  PREVIOUS: "From a previous ADI run — not the current design state.",
  APPLIED: "Applied to the current design.",
  NOTE: "Current design. Stated as a note only — no move is offered.",
});

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** "Row 1 - Seat 2" — the designer's own seat name, never a raw id where one exists. */
function seatPhrase(seatId) {
  if (typeof seatId !== "string" || !seatId.trim()) return null;
  return formatSeatLabel(seatId.trim());
}

/**
 * WHY the move is expected to help, from the limiting result the design measures
 * now: the worst seat, and the frequency it is worst at. Stated only when the
 * evidence carries them — the reason is read, never inferred, and the sentence
 * claims nothing beyond the measurement it names.
 */
export function resolvePlacementReason({ currentP20 = null, baseline = null } = {}) {
  const seatText = seatPhrase(currentP20?.seatId || baseline?.worstSeatId);
  const frequency = frequencyText(currentP20?.frequencyHz ?? baseline?.worstFrequencyHz);
  if (!seatText && !frequency) return null;
  const where = seatText && frequency ? `${seatText} around ${frequency}` : (seatText || `around ${frequency}`);
  return `This reduces the limiting seat-to-seat variation measured at ${where}.`;
}

/** "3 dB" for a change of 1 dB or more, in whole numbers. Null below that. */
function magnitudeText(delta) {
  const value = num(delta);
  if (value == null) return null;
  const text = deltaText(Math.abs(value));
  return !text || text === "no meaningful change" ? null : text;
}

const findPlacementLever = (planView) => (Array.isArray(planView?.levers) ? planView.levers : [])
  .find((lever) => (lever?.key ?? lever?.lever) === OPTIMISER_LEVER.PLACEMENT) || null;

/**
 * THE FINAL PROFESSIONAL PLAUSIBILITY GATE.
 *
 * It runs after the optimiser has found a mathematical improvement and before
 * anything is offered, badged or applied: the physical move (in the layout's own
 * quantities), the evaluated effect and the layout census go in, and one verdict
 * comes out. A change it refuses is never shown as a recommendation.
 *
 * The layout census is the CURRENT design's, so a move that breaks the symmetry
 * of what the designer actually has is judged against that layout — falling back
 * to the census saved with the run only when the live layout is not supplied.
 */
export function resolvePlacementGate({
  planView = null,
  roomDims = null,
  layoutCounts = null,
  subwooferInstances = null,
  seats = null,
  baselineSeats = null,
} = {}) {
  const lever = findPlacementLever(planView);
  if (!lever) return null;
  const counts = layoutCounts
    || (Array.isArray(subwooferInstances) ? subwooferGroupCounts(subwooferInstances, roomDims) : null)
    || planView?.layoutCounts
    || null;
  const move = describePlacementMove({
    changes: lever.changes || [],
    roomDims,
    layoutCounts: counts,
  });
  const verdict = assessPlacementPlausibility({
    effect: lever.effect || null,
    baseline: planView?.baseline || null,
    move,
    layoutCounts: counts,
    seats: seats || lever.seats || lever.effect?.seats || null,
    baselineSeats: baselineSeats || planView?.baseline?.seats || null,
  });
  return { lever, move, verdict, layoutCounts: counts };
}

/** The placement family's own measured attempt, from the run evidence. */
function placementEvidenceFromRun(planView) {
  const families = Array.isArray(planView?.run?.families) ? planView.run.families : [];
  const entry = families.find((family) => family?.family === "placement") || null;
  const attempt = entry?.bestAttempt || null;
  if (!attempt) return null;
  const p20DeltaDb = num(attempt.p20DeltaDb);
  const p19DeltaDb = num(attempt.p19DeltaDb);
  if (magnitudeText(p20DeltaDb) == null && magnitudeText(p19DeltaDb) == null) return null;
  // The attempt's own absolute values travel with the deltas, so the measured
  // improvement is stated as a before → after pair whenever the run kept both.
  return {
    p20DeltaDb,
    p19DeltaDb,
    p20VariationDb: num(attempt.p20VariationDb),
    p19VariationDb: num(attempt.p19VariationDb),
    p20Level: num(attempt.p20Level),
    p19Level: num(attempt.p19Level),
  };
}

/**
 * The expected result, from the persisted before/after values only. Every row is
 * whole-number; a value the evaluation did not measure is stated as such.
 */
function expectedRows({ baseline = null, effect = null, evidence = null, currentP20 = null } = {}) {
  // The evaluation's own baseline is not the P20 the design measures now: its
  // before/after are stated as that run's evidence, beside the current design's
  // own published result. Nothing here is presented as a current comparison.
  if (currentP20?.runBaselineDiffers) {
    const rows = [];
    const before = deviationText(baseline?.p20VariationDb);
    const current = currentP20.deviationText;
    const after = deviationText(effect?.p20VariationDb);
    if (before) rows.push({ label: "Previous run", value: before });
    if (current) rows.push({ label: "Current design", value: current });
    if (after) rows.push({ label: "With the change", value: after });
    return rows;
  }

  // No retained change: the run's own measured result is all there is. The
  // improvement is stated as the before → after pair the run kept when both
  // values exist, and as the measured change itself otherwise — never as an
  // absolute figure the run did not measure.
  if (!effect && evidence) {
    const rows = [];
    const before = deviationText(baseline?.p20VariationDb);
    const after = deviationText(evidence.p20VariationDb);
    if (before && after && before !== after) {
      rows.push({
        label: "P20",
        value: `${before} → ${after}`,
        before,
        after,
        improvementDb: wholeDbImprovement(baseline?.p20VariationDb, evidence.p20VariationDb),
        levelBefore: levelText(baseline?.p20Level),
        levelAfter: levelText(evidence.p20Level),
      });
    } else {
      const p20 = magnitudeText(evidence.p20DeltaDb);
      if (p20) rows.push({ label: "P20", value: `a ${p20} improvement measured in that evaluation` });
    }
    const p19 = magnitudeText(evidence.p19DeltaDb);
    if (p19) rows.push({ label: "P19", value: `a ${p19} improvement measured in that evaluation` });
    if (rows.length === 0) rows.push({ label: "P20", value: "a measured improvement" });
    return rows;
  }

  const rows = [];
  const before = deviationText(baseline?.p20VariationDb);
  const after = deviationText(effect?.p20VariationDb);
  if (after) {
    rows.push({
      label: "P20",
      value: before && before !== after ? `${before} → ${after}` : after,
      // The same before/after, structured, so the panel can present the
      // predicted final deviation as the prominent figure on the row.
      before,
      after,
      improvementDb: wholeDbImprovement(baseline?.p20VariationDb, effect?.p20VariationDb),
    });
  }
  else if (before) rows.push({ label: "P20", value: before });

  const p19Delta = deltaText(effect?.p19DeltaDb);
  const p19Level = levelText(effect?.p19Level ?? baseline?.p19Level);
  const p19Before = deviationText(baseline?.p19VariationDb);
  const p19After = deviationText(effect?.p19VariationDb);
  const p19Moves = Boolean(p19Delta) && p19Delta !== "no meaningful change";
  if (p19Moves && p19Before && p19After && p19Before !== p19After) {
    // A P19 change is stated as the same before → after pair P20 uses, from the
    // values the evaluation measured — never as a delta with no frame.
    rows.push({
      label: "P19",
      value: `${p19Before} → ${p19After}`,
      before: p19Before,
      after: p19After,
      improvementDb: wholeDbImprovement(baseline?.p19VariationDb, effect?.p19VariationDb),
      levelBefore: levelText(baseline?.p19Level),
      levelAfter: levelText(effect?.p19Level),
    });
  } else if (p19Moves) rows.push({ label: "P19", value: p19Delta });
  else if (p19Level) rows.push({ label: "P19", value: `remains ${p19Level} / no meaningful change` });
  else rows.push({ label: "P19", value: "no meaningful change" });

  // Output / headroom. A change under 1 dB is no meaningful loss; a value the
  // evaluation did not measure is never presented as one it did.
  const outputDelta = num(effect?.outputDeltaDb);
  const p14Delta = num(effect?.p14DeltaDb);
  if (outputDelta != null) {
    rows.push({
      label: "Output / headroom",
      value: Math.abs(outputDelta) < 1 ? "no meaningful loss" : deltaText(outputDelta),
    });
  } else if (p14Delta != null) {
    rows.push({
      label: "Output / headroom",
      value: Math.abs(p14Delta) < 1 ? "no meaningful loss" : deltaText(p14Delta),
    });
  } else {
    rows.push({ label: "Output / headroom", value: "not measured in this evaluation" });
  }

  // Extension: only ever stated as unchanged when it was measured as unchanged.
  const beforeHz = num(baseline?.achievedP18Hz);
  const afterHz = num(effect?.achievedP18Hz);
  if (beforeHz != null && afterHz != null) {
    const deltaHz = Math.round(afterHz - beforeHz);
    rows.push({
      label: "Extension",
      value: deltaHz === 0 ? "unchanged" : `${deltaHz > 0 ? "+" : "−"}${Math.abs(deltaHz)} Hz`,
    });
  } else {
    rows.push({ label: "Extension", value: "not measured in this evaluation" });
  }

  return rows;
}

/** The offer's own summary sentence, in whole dB, from the evaluated effect. */
function recommendedSummary(effect) {
  const p20 = magnitudeText(effect?.p20DeltaDb);
  if (p20) {
    return `ADI found that moving the subwoofers improves seat-to-seat bass consistency by ${p20}.`;
  }
  const p19 = magnitudeText(effect?.p19DeltaDb);
  if (p19) return `ADI found that moving the subwoofers improves P19 consistency by ${p19}.`;
  return "ADI found that moving the subwoofers improves this design.";
}

/**
 * The summary for an improvement the saved evaluation can no longer offer. It
 * states what that evaluation measured — as the before → after pair whenever the
 * run kept both values, and as the measured change itself otherwise.
 */
function previousSummary(evidence, baseline = null) {
  const before = deviationText(baseline?.p20VariationDb);
  const after = deviationText(evidence?.p20VariationDb);
  if (before && after && before !== after) {
    return `That evaluation measured seat-to-seat bass consistency (P20) from ${before} to ${after}.`;
  }
  const p20 = magnitudeText(evidence?.p20DeltaDb);
  if (p20) return `That evaluation measured a ${p20} improvement in seat-to-seat bass consistency (P20).`;
  const p19 = magnitudeText(evidence?.p19DeltaDb);
  if (p19) return `That evaluation measured a ${p19} improvement in P19 consistency.`;
  return "That evaluation measured an improvement in the subwoofer positions.";
}

/** A lever effect, reduced to the evidence the previous-summary sentence states. */
function effectEvidence(effect) {
  return {
    p20DeltaDb: effect?.p20DeltaDb,
    p19DeltaDb: effect?.p19DeltaDb,
    p20VariationDb: effect?.p20VariationDb,
    p19VariationDb: effect?.p19VariationDb,
    p20Level: effect?.p20Level,
    p19Level: effect?.p19Level,
  };
}

/**
 * Resolve what the placement recommendation panel shows.
 *
 * @param {object} params
 * @param {object|null} params.planView - resolved plan / run-evidence view
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, optional
 * @param {object|null} [params.presentation] - the canonical optimiser presentation state
 * @param {string|null} [params.appliedLever] - the lever just applied/undone, if any
 * @param {string|null} [params.appliedDirection] - "to" (applied) or "from" (undone)
 * @param {object|null} [params.layoutCounts] - subwooferGroupCounts() of the CURRENT layout
 * @param {Array|null} [params.subwooferInstances] - the CURRENT layout, when counts are not supplied
 * @param {Array|null} [params.seats] - per-seat evidence after the move, when the run kept it
 * @param {Array|null} [params.baselineSeats] - per-seat evidence before the move
 * @returns {object|null} null when there is nothing to state about placement, or
 *   when the plausibility gate refuses to offer the evaluated change
 */
export function resolvePlacementRecommendation({
  planView = null,
  roomDims = null,
  presentation = null,
  appliedLever = null,
  appliedDirection = null,
  currentP20 = null,
  parityBlocked = false,
  layoutCounts = null,
  subwooferInstances = null,
  seats = null,
  baselineSeats = null,
  recommendationNotCurrent = false,
} = {}) {
  const lever = findPlacementLever(planView);
  const baseline = planView?.baseline || null;
  const stale = planView?.status === OPTIMISER_PLAN_STATUS.STALE;
  const justApplied = appliedLever === OPTIMISER_LEVER.PLACEMENT;

  const base = {
    title: PLACEMENT_PANEL_TITLE,
    definition: PLACEMENT_DEFINITION,
    applyLabel: LEVER_APPLY_LABEL[OPTIMISER_LEVER.PLACEMENT],
    undoLabel: LEVER_UNDO_LABEL[OPTIMISER_LEVER.PLACEMENT],
    rerunLabel: ADI_BASS_OPTIMISER_LABEL,
    theoretical: false,
    theoreticalNote: null,
    notice: null,
    message: null,
    // Whether the result belongs to the design as it stands now or to an earlier
    // run, and whether carrying it out is the designer's own decision.
    statusText: null,
    approvalRequired: true,
    // WHY the move is expected to help, read from the limiting seat and
    // frequency. Null whenever that evidence is not there.
    reason: null,
  };

  // ── No retained placement change ──
  // The run measured a placement improvement but kept no positions with it. That
  // improvement is stated with the one action that makes it available.
  if (!lever) {
    const evidence = placementEvidenceFromRun(planView);
    if (!evidence) return null;
    return {
      ...base,
      kind: PLACEMENT_KIND.PREVIOUS,
      status: "Tested",
      summary: previousSummary(evidence, baseline),
      expected: expectedRows({ baseline, evidence }),
      // No evaluated move was kept, so no physical change is stated at all: the
      // card says what is missing and names the one action that produces it.
      move: null,
      notice: PLACEMENT_MOVE_NOT_RETAINED,
      statusText: PLACEMENT_RESULT_STATUS.PREVIOUS,
      canApply: false,
      canUndo: false,
      canRerun: true,
    };
  }

  // ONE gate for the whole resolution: the physical move in the layout's own
  // quantities, the evaluated effect, and the professional plausibility verdict.
  const gate = resolvePlacementGate({
    planView,
    roomDims,
    layoutCounts,
    subwooferInstances,
    seats,
    baselineSeats,
  });
  const move = gate?.move || null;
  const plausibility = gate?.verdict || null;
  const practical = lever.practical !== false && move?.practical !== false;
  const verdict = resolveLeverVerdict({
    effect: lever.effect || null,
    baseline,
    tested: lever.evaluated === true,
  });

  // ── A theoretical option ── never offered as default placement. Stated in
  // Engineer details only, so the panel stays out of the designer's default view.
  if (!practical) {
    const reason = lever.theoreticalReason || move?.theoreticalReason || null;
    return {
      ...base,
      kind: null,
      theoretical: true,
      theoreticalNote: `${PLACEMENT_THEORETICAL_NOTE}${reason ? ` ${reason}` : ""}`,
      summary: null,
      expected: [],
      move,
      canApply: false,
      canUndo: false,
      canRerun: false,
    };
  }

  // ── Already applied ── the exact previous positions are still held by the
  // saved lever, so Undo stays available while the design reflects them.
  const applied = lever.state === OPTIMISER_LEVER_STATE.APPLIED || justApplied;
  if (applied) {
    const undone = appliedDirection === "from";
    return {
      ...base,
      kind: PLACEMENT_KIND.APPLIED,
      status: undone ? "Undone" : "Applied",
      summary: recommendedSummary(lever.effect),
      expected: expectedRows({ baseline, effect: lever.effect }),
      move,
      statusText: PLACEMENT_RESULT_STATUS.APPLIED,
      reason: resolvePlacementReason({ currentP20, baseline }),
      message: undone ? PLACEMENT_UNDONE_MESSAGE : PLACEMENT_APPLIED_MESSAGE,
      canApply: false,
      // Undo stays available while the design still holds the recommended
      // positions, and only then.
      canUndo: !undone && lever.canUndo === true,
      canRerun: true,
    };
  }

  // ── The evaluation's own baseline is not the current result ──
  // The candidate's before/after belong to the state that run measured from. The
  // panel states both values, labelled, withholds Apply and names the one action
  // that makes the comparison current again.
  if (currentP20?.runBaselineDiffers || recommendationNotCurrent === true) {
    return {
      ...base,
      kind: PLACEMENT_KIND.PREVIOUS,
      status: "Tested",
      summary: previousSummary(effectEvidence(lever.effect), baseline),
      expected: expectedRows({ baseline, effect: lever.effect, currentP20 }),
      move,
      statusText: PLACEMENT_RESULT_STATUS.PREVIOUS,
      reason: resolvePlacementReason({ currentP20, baseline }),
      // The move is stated as a past evaluation, never as current advice: either
      // it was measured against a different current result, or it no longer
      // improves the design as it stands.
      notice: currentP20?.runBaselineDiffers ? PLACEMENT_BASELINE_MISMATCH : RECOMMENDATION_NOT_CURRENT_SENTENCE,
      canApply: false,
      canUndo: false,
      canRerun: true,
    };
  }

  // ── The change belongs to an earlier design state ── no Apply, one re-run.
  if (stale) {
    return {
      ...base,
      kind: PLACEMENT_KIND.PREVIOUS,
      status: "Tested",
      summary: previousSummary(effectEvidence(lever.effect), baseline),
      expected: expectedRows({ baseline, effect: lever.effect }),
      move,
      statusText: PLACEMENT_RESULT_STATUS.PREVIOUS,
      reason: resolvePlacementReason({ currentP20, baseline }),
      notice: PLACEMENT_PREVIOUS_FOUND_STALE,
      canApply: false,
      canUndo: false,
      canRerun: true,
    };
  }

  // ── Recommended ── current, practical, and safe to apply. A lever the verdict
  // does not allow to be applied (a trade-off, a rejection, no useful
  // improvement) is never presented here: the lever row states it instead.
  if (verdict.applyAllowed !== true) return null;

  // ── The final professional plausibility gate ──
  // A mathematical improvement is not a recommendation. Before anything is
  // offered, badged or applied, the move must survive the design-professional
  // check: a move that breaks the symmetry of the layout, that damages another
  // metric, or that cannot be described as one credible physical move is not
  // shown as a recommendation at all.
  if (!plausibility || plausibility.credibility === PLACEMENT_CREDIBILITY.SUPPRESSED) return null;

  // A real but small improvement is stated as a non-actionable note: no badge,
  // no Apply, and no physical move offered as an automatic placement change.
  if (plausibility.credibility === PLACEMENT_CREDIBILITY.REVIEW) {
    return {
      ...base,
      kind: PLACEMENT_KIND.NOTE,
      status: plausibility.status,
      summary: plausibility.reviewSummary,
      expected: expectedRows({ baseline, effect: lever.effect }),
      move: null,
      statusText: PLACEMENT_RESULT_STATUS.NOTE,
      notice: plausibility.suitabilityNote,
      canApply: false,
      canUndo: false,
      canRerun: false,
    };
  }

  // Apply writes the evaluated positions, so it is offered only when the EXACT
  // move is present: a named move, and the subwoofers it belongs to. A card that
  // cannot state the move never carries an Apply.
  const hasExactMove = Boolean(move?.movementLabel) && (move?.moves?.length || 0) > 0;

  // Parity first: an evaluation whose baseline was never established against the
  // published result is evidence, never an offer.
  const canApply = parityBlocked !== true
    && hasExactMove
    && lever.canApply === true
    && plausibility.applyAllowed === true;

  return {
    ...base,
    kind: PLACEMENT_KIND.RECOMMENDED,
    status: "Recommended",
    summary: recommendedSummary(lever.effect),
    expected: expectedRows({ baseline, effect: lever.effect }),
    move,
    statusText: PLACEMENT_RESULT_STATUS.RECOMMENDED,
    reason: resolvePlacementReason({ currentP20, baseline }),
    // No on-plan preview of the proposed positions exists yet; stating nothing
    // would imply one does.
    notice: PLACEMENT_PREVIEW_UNAVAILABLE,
    canApply,
    canUndo: false,
    canRerun: false,
  };
}