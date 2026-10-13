// recommendationCurrency.js
// ---------------------------------------------------------------------------
// THE ONE CURRENCY RULE for every Bass Optimisation recommendation.
//
// The current design is the reference. An evaluated change may be offered as
// advice ONLY while it improves the design as it stands:
//
//   • the evaluation ran against the current authoritative result, not an earlier
//     one (the existing run-baseline currency flag), and
//   • its own measured P20 is not WORSE than the design's current published P20.
//
// A change that fails either test is a past evaluation. It is preserved — it
// stays in the tested rows and in Engineer details — but it is never offered as a
// current recommendation, and its result is never displayed beside the current
// result as though the two were comparable.
//
// READ-ONLY: it compares the two whole-number P20 values the authorities already
// publish. It recalculates nothing, changes no bass maths, applies nothing and
// re-grades nothing.
// ---------------------------------------------------------------------------

import { floorP19P20Deviation } from "../../../utils/rp22/resolveRp22DesignValue.js";

/** The one sentence stated whenever a past evaluation is not current advice. */
export const RECOMMENDATION_NOT_CURRENT_SENTENCE =
  "This evaluation no longer improves the design as it stands. Re-evaluate the current design before acting on it.";

/**
 * Was this evaluation measured against a state other than the design as it now
 * stands, or does it land worse than the current authoritative result?
 *
 * A P20 deviation is a variation magnitude: a larger whole number is worse. Both
 * sides are read in the displayed whole dB, so the comparison is made on exactly
 * the values the designer sees.
 */
export function alternativeIsWorseThanCurrent({
  effectP20VariationDb = null,
  currentP20DeviationDb = null,
  runBaselineDiffers = false,
} = {}) {
  // Measured from a different current result: whatever it measured belongs to
  // that state, never to this one.
  if (runBaselineDiffers === true) return true;
  const current = measuredDeviation(currentP20DeviationDb);
  const effect = measuredDeviation(effectP20VariationDb);
  // An unmeasured side is never claimed to be worse: nothing is inferred, and a
  // missing value is never read as a deviation of zero.
  if (current == null || effect == null) return false;
  return effect > current;
}

/** A deviation in displayed whole dB, or null when the value was not measured. */
function measuredDeviation(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return floorP19P20Deviation(number);
}