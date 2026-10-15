// improvementResultAuthority.js
// ---------------------------------------------------------------------------
// WHAT A CONFIRMED IMPROVEMENT ACTUALLY IS, AND WHAT TO DO ABOUT IT.
//
// A completed run that found a confirmed improvement must answer four questions
// on the main panel, without the designer opening Engineer details:
//
//   WHAT DID ADI FIND?            the candidate and the exact adjustment
//   WHAT DOES IT IMPROVE?         the current → proposed result, P19 and P20
//   WHAT, IF ANYTHING, GETS WORSE? the protected primary-seat statement
//   WHAT SHOULD I DO NOW?         and WHICH case this is:
//
//     APPLIED   a safe calibration improvement ADI already applied — stated as
//               applied, with the action being to undo it, never to find it
//     REVIEW    a safe confirmed improvement that is the designer's decision —
//               stated as found, reviewed and applied deliberately
//     TRADE_OFF the change costs a protected seat: the existing trade-off
//               workflow owns it and this module claims nothing
//     PHYSICAL  the improvement needs a physical move: the existing physical
//               change workflow owns it and this module claims nothing
//
// It reads authorities ALREADY resolved by the card — the headline
// (adiPanelHeadline.js), the designer summary (adiDesignerSummary.js), the run's
// own saved calibration decision and the trade-off / physical-change tests — and
// returns presentation. It performs NO calculation, ranks nothing, re-applies no
// threshold and changes no optimiser maths, no P19/P20 definition, no
// primary-seat protection, no materiality rule, no 3-sub grouping and no
// auto-apply policy. Where a value was not recorded it returns null, so the panel
// states nothing rather than inventing it.
// ---------------------------------------------------------------------------

import { CALIBRATION_APPLY_DECISION } from "@/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { deviationText } from "./optimiserWholeNumberDb.js";

/** Which case the completed improvement is. */
export const IMPROVEMENT_CASE = Object.freeze({
  NONE: "none",
  APPLIED: "applied",
  REVIEW: "review",
  TRADE_OFF: "trade_off",
  PHYSICAL: "physical",
});

export const IMPROVEMENT_COPY = Object.freeze({
  BADGE_FOUND: "IMPROVEMENT FOUND",
  BADGE_APPLIED: "IMPROVEMENT APPLIED",
  FOUND_HEADLINE: "ADI found a confirmed adjustment that improves the bass performance.",
  APPLIED_HEADLINE:
    "ADI applied the adjustment because it improved the result without making a protected metric worse.",
  ADJUSTMENT_TITLE: "PROPOSED ADJUSTMENT",
  ADJUSTMENT_TITLE_APPLIED: "APPLIED ADJUSTMENT",
  RESULT_TITLE: "RESULT",
  CONSISTENCY_LINE: "Bass consistency improves",
  P19_TITLE: "P19",
  P20_TITLE: "P20",
  SEATS_TITLE: "PRIMARY SEATS",
  SEATS_SAFE: "No protected seat gets worse",
  HELD_TITLE: "HELD FOR YOUR APPROVAL",
  REVIEW: "REVIEW IMPROVEMENT",
  APPLY_IN_REVIEW: "APPLY CHANGE",
  KEEP: "KEEP CURRENT DESIGN",
  CANDIDATE: "Winning candidate",
  FAMILY: "Candidate family",
});

/** The family label per lever the optimiser evaluates. */
const FAMILY_LABEL = Object.freeze({
  delay: "Delay",
  gain: "Gain",
  phase: "Phase / crossover region",
  polarity: "Polarity",
  placement: "Physical placement",
  layout: "Physical placement",
  seating: "Physical placement",
  allpass: "Phase / crossover region",
});

/**
 * "±15 dB · L2" — the whole-dB deviation with its level, or null.
 *
 * The deviation goes through the ONE display authority (floored whole dB), so a
 * before → after pair on this card states exactly the values every other surface
 * shows and no decimal ever reaches the designer.
 */
function variationText(side) {
  const text = deviationText(side?.p20?.deviationDb);
  const level = side?.p20?.level || null;
  if (!text) return level || null;
  return level ? `${text} \u00b7 ${level}` : text;
}

/**
 * THE P19 LINE: unchanged, moved, or nothing at all. A level pair the run did not
 * record is never stated.
 */
function p19Text(before, after) {
  const beforeLevel = before?.p19?.level || null;
  const afterLevel = after?.p19?.level || null;
  if (beforeLevel && afterLevel) {
    return beforeLevel === afterLevel ? `Unchanged \u00b7 ${afterLevel}` : `${beforeLevel} \u2192 ${afterLevel}`;
  }
  return afterLevel || beforeLevel || null;
}

/** The current → proposed P20 pair from the run's own recorded sides. */
function p20Pair(before, after) {
  const from = variationText(before);
  const to = variationText(after);
  if (from && to) return `${from} \u2192 ${to}`;
  return to || null;
}

/** The winning candidate's id, from the record's own fields only. */
function candidateIdOf({ planView, decision, row }) {
  return planView?.candidateId
    || row?.candidateId
    || decision?.candidateId
    || null;
}

/**
 * Resolve the completed improvement.
 *
 * @param {object} params
 * @param {object|null} params.planView - the saved run view
 * @param {object|null} params.headline - adiPanelHeadline.js output
 * @param {object|null} params.summary - adiDesignerSummary.js output
 * @param {object|null} params.calibrationDecision - the run's own saved decision
 * @param {string|null} params.calibrationKind - ADI_CALIBRATION_KIND value
 * @param {boolean} [params.tradeOffActive] - the trade-off workflow owns the panel
 * @param {boolean} [params.physicalOnly] - the change is a physical move
 * @param {boolean} [params.applied] - the calibration is in the design now
 * @returns {object} the resolved improvement (found false when another case owns it)
 */
export function resolveImprovementResult({
  planView = null,
  headline = null,
  summary = null,
  calibrationDecision = null,
  calibrationKind = null,
  tradeOffActive = false,
  physicalOnly = false,
  applied = false,
} = {}) {
  const empty = {
    caseKey: IMPROVEMENT_CASE.NONE,
    found: false,
    badgeLabel: null,
    headlineSentence: null,
    candidateId: null,
    familyKey: null,
    familyLabel: null,
    adjustment: null,
    result: null,
    p19: null,
    p20: null,
    seats: null,
    held: null,
    autoApply: { eligible: false, applied: false, heldReason: null },
    nextAction: null,
  };

  // The two workflows that own their own decision claim nothing here, so the
  // panel can never state a trade-off or a physical move as a clean improvement.
  if (tradeOffActive) return { ...empty, caseKey: IMPROVEMENT_CASE.TRADE_OFF };
  if (physicalOnly) return { ...empty, caseKey: IMPROVEMENT_CASE.PHYSICAL };

  const decision = calibrationDecision || null;
  const decisionKind = decision?.decision || null;
  const appliedNow = applied === true && decisionKind === CALIBRATION_APPLY_DECISION.APPLIED;
  const heldForDesigner = decisionKind === CALIBRATION_APPLY_DECISION.HOLD;
  const adjustment = headline?.adjustment || null;
  const evaluated = headline?.kind === "improvement" || (adjustment != null && headline?.kind == null);

  // A confirmed improvement is claimed only when a lever the optimiser genuinely
  // evaluated is being offered, or when the run's own decision says so.
  const lever = summary?.recommendedLever || null;
  const row = lever && Array.isArray(planView?.levers)
    ? planView.levers.find((entry) => (entry?.key ?? entry?.lever) === lever) || null
    : null;
  const evaluatedOffer = row?.evaluated === true
    && row?.canApply === true
    && Array.isArray(row?.changes)
    && row.changes.length > 0
    && row?.effect != null;

  const isApplied = appliedNow && (evaluatedOffer || decision != null);
  const isReview = !isApplied && heldForDesigner && (evaluatedOffer || adjustment != null);
  if (!isApplied && !isReview) return empty;

  const caseKey = isApplied ? IMPROVEMENT_CASE.APPLIED : IMPROVEMENT_CASE.REVIEW;
  const before = decision?.before || null;
  const after = decision?.after || null;

  const pairFromDecision = p20Pair(before, after);
  return {
    caseKey,
    found: true,
    badgeLabel: isApplied ? IMPROVEMENT_COPY.BADGE_APPLIED : IMPROVEMENT_COPY.BADGE_FOUND,
    headlineSentence: isApplied ? IMPROVEMENT_COPY.APPLIED_HEADLINE : IMPROVEMENT_COPY.FOUND_HEADLINE,
    candidateId: candidateIdOf({ planView, decision, row }),
    familyKey: lever,
    familyLabel: lever ? FAMILY_LABEL[String(lever)] || null : null,
    adjustment,
    // WHAT IT IMPROVES: the consistency line, then the current → proposed pair as
    // the panel's own headline authority stated it, falling back to the run's own
    // recorded sides. Never a figure that was not recorded.
    result: {
      title: IMPROVEMENT_COPY.RESULT_TITLE,
      line: IMPROVEMENT_COPY.CONSISTENCY_LINE,
      pair: headline?.comparison || pairFromDecision || null,
    },
    p19: p19Text(before, after) ? { title: IMPROVEMENT_COPY.P19_TITLE, text: p19Text(before, after) } : null,
    p20: {
      title: IMPROVEMENT_COPY.P20_TITLE,
      text: pairFromDecision || headline?.comparison || null,
      // The scope the evidence supports, stated by the headline authority.
      scope: headline?.benefit || null,
    },
    // WHAT GETS WORSE: the run recorded no protected-seat regression (a
    // regression would be the trade-off workflow's own case), so no protected
    // seat is made worse by the change being offered.
    seats: { title: IMPROVEMENT_COPY.SEATS_TITLE, text: IMPROVEMENT_COPY.SEATS_SAFE },
    held: heldForDesigner
      ? { title: IMPROVEMENT_COPY.HELD_TITLE, text: decision?.statement || null }
      : null,
    autoApply: {
      eligible: decisionKind != null,
      applied: isApplied,
      heldReason: heldForDesigner ? (decision?.statement || null) : null,
    },
    nextAction: isApplied
      ? null
      : { key: IMPROVEMENT_CASE.REVIEW, label: IMPROVEMENT_COPY.REVIEW },
  };
}