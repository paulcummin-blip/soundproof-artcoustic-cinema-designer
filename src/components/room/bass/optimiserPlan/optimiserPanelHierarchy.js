// optimiserPanelHierarchy.js
// ---------------------------------------------------------------------------
// THE PURE PART OF THE PANEL'S INFORMATION HIERARCHY.
//
// The Bass Optimisation card is stated in three levels:
//
//   1. RESULT                what ADI found, why it matters, what to do
//   2. TECHNICAL DETAILS     the concise professional summary
//   3. DEVELOPER DIAGNOSTICS internal only, behind the debug gate
//
// This module resolves the two PURE pieces level 1 and level 2 need — the other
// options worth reviewing, and the low-frequency result — so the journey
// component stays an orchestration layer and states no number of its own.
//
// Every value is read from an authority it is handed, formatted by the ONE
// display authority (whole dB / whole Hz), and omitted when it was not measured.
// It evaluates nothing, ranks nothing, applies nothing, and changes no bass
// maths, no P19/P20 definition, no materiality rule and no saved evidence.
// ---------------------------------------------------------------------------

import { deviationText, levelText } from "./optimiserWholeNumberDb.js";
import { buildOptimiserOtherOptions } from "./optimiserOtherOptions.js";
import { resolveLimitingFrequency } from "./optimiserLimitingFrequency.js";

/**
 * THE LOW-FREQUENCY RESULT — the three facts the decision rests on, in the
 * display authority's whole numbers: P19, the P20 pair, and the limiting region.
 *
 * @param {object} params
 * @param {object|null} params.calibrationDecision - the run's own decision, whose
 *   before/after sides carry the P19 levels the evaluation was judged on
 * @param {object|null} params.p20Headline - the published current P20 authority
 * @param {object|null} params.recommendedRow - the evaluated row behind the
 *   change being offered (its effect carries the proposed P20)
 */
export function buildLowFrequencyResult({
  calibrationDecision = null,
  p20Headline = null,
  recommendedRow = null,
  // THE ONE LIMITING FREQUENCY. When the caller already holds the result view
  // model's resolved value, that value is used verbatim — so this block can
  // never state a different frequency from the card. Without it the same ONE
  // authority (resolveLimitingFrequency) is applied here, which is why "0 Hz"
  // is impossible on this path: a value that is not a frequency is stated as
  // Not identified.
  limitingFrequency = null,
} = {}) {
  const before = levelText(calibrationDecision?.before?.p19?.level);
  const after = levelText(calibrationDecision?.after?.p19?.level);
  const frequency = limitingFrequency
    ? resolveLimitingFrequency(limitingFrequency.hz ?? null)
    : resolveLimitingFrequency(p20Headline?.worstFrequencyHz ?? null);
  return {
    p19: before && after
      ? (before === after ? `Unchanged · ${after}` : `${before} → ${after}`)
      : (after || before || null),
    p20Before: deviationText(p20Headline?.variationDb),
    p20After: deviationText(recommendedRow?.effect?.p20VariationDb),
    limiting: frequency.text,
    // Whether that text is a real frequency or the Not-identified statement, so
    // a surface states "Approximately 95 Hz" or "Not identified" — never
    // "Approximately Not identified".
    limitingIdentified: frequency.identified === true,
  };
}

/**
 * Everything level 1's option list and level 2's result block need, resolved
 * once for the open design.
 */
export function buildOptimiserPanelHierarchy({
  planView = null,
  summary = null,
  calibrationDecision = null,
  p20Headline = null,
  recommendedRow = null,
  running = false,
  // The result view model, and the limiting frequency it resolved. Both are read
  // so this level states nothing the card does not.
  resultModel = null,
  limitingFrequency = null,
} = {}) {
  return {
    otherOptions: buildOptimiserOtherOptions({ planView, summary, running, resultModel }),
    lowFrequency: buildLowFrequencyResult({
      calibrationDecision,
      p20Headline,
      recommendedRow,
      limitingFrequency,
    }),
  };
}