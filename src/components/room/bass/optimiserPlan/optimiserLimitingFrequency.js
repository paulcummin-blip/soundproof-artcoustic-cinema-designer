// optimiserLimitingFrequency.js
// ---------------------------------------------------------------------------
// THE LIMITING FREQUENCY — one rule, for every surface that states it.
//
// A limiting frequency is the frequency at which the worst response deviation
// sits. It is a real frequency or it does not exist: 0 Hz is not a credible
// presentation of anything this engine can report, so a value that is absent,
// zero, negative or unreadable is stated as NOT IDENTIFIED rather than as a
// number the design does not have.
//
// ONE AUTHORITY, so the result card, the review, Engineer details and the
// developer diagnostics can never state two different limiting frequencies —
// and so a missing one is never rendered as "0 Hz".
//
// Presentation only: it calculates nothing, smooths nothing and changes no
// P18/P19/P20 metric, no graph and no RP22 threshold. It decides only whether a
// value the run already produced may be shown as a frequency at all.
//
// WHAT IS A FREQUENCY IS NOT DECIDED HERE: that rule already lives in
// optimiserWholeNumberDb (MIN_VALID_FREQUENCY_HZ), and this module delegates to
// it rather than stating a second threshold of its own. All this adds is the
// copy a run with no credible frequency is stated with.
// ---------------------------------------------------------------------------

import { frequencyText, validFrequencyHz } from "./optimiserWholeNumberDb.js";

/** The copy a non-credible limiting frequency is stated with. */
export const LIMITING_FREQUENCY_NOT_IDENTIFIED = "Not identified";

/**
 * Is this a credible limiting frequency? Delegated: the app's one frequency rule
 * decides. A missing, zero or negative value is not a frequency.
 */
export function isCredibleLimitingFrequency(value) {
  return validFrequencyHz(value) != null;
}

/**
 * Resolve one limiting frequency for presentation.
 *
 * @param {*} value the value the run recorded
 * @returns {{ hz: number|null, text: string, identified: boolean }}
 *   hz         the credible frequency, or null when there is none
 *   text       the frequency in words ("95 Hz"), or NOT IDENTIFIED
 *   identified whether a real frequency was identified
 */
export function resolveLimitingFrequency(value) {
  const hz = validFrequencyHz(value);
  if (hz == null) {
    return { hz: null, text: LIMITING_FREQUENCY_NOT_IDENTIFIED, identified: false };
  }
  return { hz, text: frequencyText(value), identified: true };
}