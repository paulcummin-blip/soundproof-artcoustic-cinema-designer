// optimiserOtherOptions.js
// ---------------------------------------------------------------------------
// OTHER OPTIONS — the small number of genuinely useful alternatives beside the
// panel's ONE decision.
//
// Product rule: the main panel states one decision and one primary action. An
// alternative worth the designer's attention is offered as a SHORT reviewable
// item — never as a wall of tested candidates, and never with an Apply button of
// its own.
//
// What qualifies, and nothing else:
//   • a SEATING move the run evaluated — comfort/layout work the designer may
//     take up separately
//   • LOW-FREQUENCY TREATMENT, when the remaining seat-to-seat variation is the
//     kind absorption addresses
//
// The option whose lever is ALREADY the panel's own decision is never repeated
// here, so the same change can never be offered twice.
//
// Every value is read from authorities already resolved for the card — the
// designer summary, the plan's own lever rows and their evaluated effects. This
// module evaluates nothing, ranks nothing, applies nothing and invents no
// figure; where the evidence does not support a claim, the claim is omitted.
// ---------------------------------------------------------------------------

import { wholeDbImprovement, deviationText } from "./optimiserWholeNumberDb.js";
import { shortPhrase } from "./optimiserOptionText.js";

export const OTHER_OPTIONS_TITLE = "Other options";
export const OTHER_OPTIONS_REVIEW_LABEL = "Review option";
export const OTHER_OPTIONS_REVIEW_OPEN_LABEL = "Hide option";

/** The most options the panel ever states. */
export const OTHER_OPTIONS_MAX = 3;

/**
 * The one supporting sentence per option kind. Each is stated only where the
 * option's own evidence supports it.
 */
export const OTHER_OPTION_SUPPORT = Object.freeze({
  SEATING: "Predicted to improve seat-to-seat consistency.",
  TREATMENT:
    "If further improvement is required, reviewing low-frequency treatment may help.",
});

/** A physical option the designer reviews individually, never applies here. */
export function buildOptimiserOtherOptions({
  planView = null,
  summary = null,
  running = false,
} = {}) {
  if (running || !summary) return [];

  const levers = Array.isArray(planView?.levers) ? planView.levers : [];
  const leverRow = (key) => levers.find((row) => (row?.key ?? row?.lever) === key) || null;
  const currentLever = summary.recommendedLever || null;
  const baselineDeviation = planView?.baseline?.p20VariationDb ?? null;
  const options = [];

  // ── Seating ── a move of the seating block. Stated as the move itself, with
  // the result its own evaluation measured, and only when that evaluation really
  // improved the seat-to-seat result.
  const seatingRow = leverRow("seating");
  const seating = summary.seatingRecommendation || null;
  const movement = seating?.movementLabel || seatingRow?.seating?.movementLabel || null;
  if (movement && currentLever !== "seating") {
    const evaluatedDeviation = seating?.p20After
      || deviationText(seatingRow?.effect?.p20VariationDb);
    const improved = seating?.p20ImprovementDb != null
      || wholeDbImprovement(baselineDeviation, seatingRow?.effect?.p20VariationDb) != null;
    options.push({
      key: "seating",
      title: "Seating",
      headline: movement,
      support: improved ? OTHER_OPTION_SUPPORT.SEATING : null,
      detail: [
        evaluatedDeviation ? `Evaluated result: P20 ${evaluatedDeviation}` : null,
        shortPhrase(seating?.reason || seatingRow?.reason, 140),
      ].filter(Boolean),
    });
  }

  // ── Low-frequency treatment ── advice only, and only while the remaining
  // variation is the kind absorption addresses. No location claim is made
  // unless the evidence's own wording already supports one.
  const absorption = summary.absorption || null;
  if (absorption?.reason && currentLever !== absorption.key) {
    options.push({
      key: "treatment",
      title: "Low-frequency treatment",
      headline: absorption.reason,
      support: OTHER_OPTION_SUPPORT.TREATMENT,
      detail: [absorption.location || null].filter(Boolean),
    });
  }

  return options.slice(0, OTHER_OPTIONS_MAX);
}