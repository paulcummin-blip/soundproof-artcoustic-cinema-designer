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
import { resolveLeverVerdict } from "./optimiserLeverVerdict.js";
import { LEVER_APPLY_LABEL, LEVER_UNDO_LABEL } from "./optimiserPlanLeverApply.js";
import { deltaText, deviationText, levelText } from "./optimiserWholeNumberDb.js";
import {
  PLACEMENT_APPLIED_MESSAGE,
  PLACEMENT_BASELINE_MISMATCH,
  PLACEMENT_DEFINITION,
  PLACEMENT_PANEL_TITLE,
  PLACEMENT_PREVIEW_UNAVAILABLE,
  PLACEMENT_PREVIOUS_FOUND,
  PLACEMENT_PREVIOUS_FOUND_STALE,
  PLACEMENT_THEORETICAL_NOTE,
  PLACEMENT_UNDONE_MESSAGE,
  describePlacementMove,
} from "./placementMoveAuthority.js";
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

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

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
  return { p20DeltaDb, p19DeltaDb };
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
    if (after) rows.push({ label: "Candidate from that run", value: after });
    return rows;
  }

  // No retained change: the run's own measured delta is all there is. It is
  // stated as a measured improvement — never as an absolute after value.
  if (!effect && evidence) {
    const rows = [];
    const p20 = magnitudeText(evidence.p20DeltaDb);
    const p19 = magnitudeText(evidence.p19DeltaDb);
    if (p20) rows.push({ label: "P20", value: `better by ${p20} (measured in that evaluation)` });
    if (p19) rows.push({ label: "P19", value: `better by ${p19} (measured in that evaluation)` });
    if (rows.length === 0) rows.push({ label: "P20", value: "a measured improvement" });
    return rows;
  }

  const rows = [];
  const before = deviationText(baseline?.p20VariationDb);
  const after = deviationText(effect?.p20VariationDb);
  if (after) rows.push({ label: "P20", value: before && before !== after ? `${before} → ${after}` : after });
  else if (before) rows.push({ label: "P20", value: before });

  const p19Delta = deltaText(effect?.p19DeltaDb);
  const p19Level = levelText(effect?.p19Level ?? baseline?.p19Level);
  if (p19Delta && p19Delta !== "no meaningful change") rows.push({ label: "P19", value: p19Delta });
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

/** The summary for an improvement the saved evaluation can no longer offer. */
function previousSummary(evidence) {
  const p20 = magnitudeText(evidence?.p20DeltaDb);
  if (p20) {
    return `That evaluation measured seat-to-seat bass consistency (P20) better by ${p20}.`;
  }
  const p19 = magnitudeText(evidence?.p19DeltaDb);
  if (p19) return `That evaluation measured P19 consistency better by ${p19}.`;
  return "That evaluation measured an improvement in the subwoofer positions.";
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
      summary: previousSummary(evidence),
      expected: expectedRows({ baseline, evidence }),
      move: null,
      notice: PLACEMENT_PREVIOUS_FOUND,
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
  if (currentP20?.runBaselineDiffers) {
    return {
      ...base,
      kind: PLACEMENT_KIND.PREVIOUS,
      status: "Tested",
      summary: previousSummary({ p20DeltaDb: lever.effect?.p20DeltaDb, p19DeltaDb: lever.effect?.p19DeltaDb }),
      expected: expectedRows({ baseline, effect: lever.effect, currentP20 }),
      move,
      notice: PLACEMENT_BASELINE_MISMATCH,
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
      summary: previousSummary({ p20DeltaDb: lever.effect?.p20DeltaDb, p19DeltaDb: lever.effect?.p19DeltaDb }),
      expected: expectedRows({ baseline, effect: lever.effect }),
      move,
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
      notice: plausibility.suitabilityNote,
      canApply: false,
      canUndo: false,
      canRerun: false,
    };
  }

  // Parity first: an evaluation whose baseline was never established against the
  // published result is evidence, never an offer.
  const canApply = parityBlocked !== true && lever.canApply === true && plausibility.applyAllowed === true;

  return {
    ...base,
    kind: PLACEMENT_KIND.RECOMMENDED,
    status: "Recommended",
    summary: recommendedSummary(lever.effect),
    expected: expectedRows({ baseline, effect: lever.effect }),
    move,
    // No on-plan preview of the proposed positions exists yet; stating nothing
    // would imply one does.
    notice: PLACEMENT_PREVIEW_UNAVAILABLE,
    canApply,
    canUndo: false,
    canRerun: false,
  };
}