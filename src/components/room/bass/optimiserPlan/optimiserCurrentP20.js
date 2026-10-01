// optimiserCurrentP20.js
// ---------------------------------------------------------------------------
// The ONE current-P20 authority for the optimiser card.
//
// The card, the placement row, the seating row and the evidence blocks all
// describe the SAME design, so they must all state the SAME current P20 — the
// value the tooltip, seat pill, graph marker and result strip publish from the
// completed bass authority.
//
// The saved optimisation plan also carries a baseline. That baseline is the state
// the evaluation RAN ON: evidence about that run, never a second current result.
// When the two disagree by a whole dB or more, every absolute before/after value
// belongs to that run and is labelled as such, and the current design is stated
// from the published authority. Selected-seat detail never replaces the official
// overall worst-seat result.
//
// READ-ONLY: it reformats two existing authorities and compares their whole-number
// display. It calculates no P20, changes no metric definition and re-grades nothing.
// ---------------------------------------------------------------------------

import { deviationText, levelText } from "./optimiserWholeNumberDb.js";

const text = (value) => deviationText(value) || null;

/**
 * @param {object} params
 * @param {object|null} params.authorityP20 - published authority headline
 *        ({ variationDb, level, worstSeatId, worstFrequencyHz }) — the SAME values
 *        the tooltip and the result strip read.
 * @param {object|null} params.planView - resolved plan view; its baseline is the
 *        state the evaluation ran on.
 * @returns {object} the canonical current P20 and whether the run's baseline differs
 */
export function resolveOptimiserCurrentP20({ authorityP20 = null, planView = null } = {}) {
  const authorityDeviation = text(authorityP20?.variationDb);
  const runBaselineDeviation = text(planView?.baseline?.p20VariationDb);
  const fromAuthority = authorityDeviation != null;

  // Both are whole-number display strings, so differing text means the two
  // authorities are at least 1 dB apart — the card's own materiality threshold.
  const runBaselineDiffers = !!(
    fromAuthority
    && runBaselineDeviation
    && runBaselineDeviation !== authorityDeviation
  );

  const frequencySource = fromAuthority
    ? authorityP20?.worstFrequencyHz
    : planView?.baseline?.worstFrequencyHz;
  const frequency = Number(frequencySource);

  return {
    // 'authority'    = the published current result.
    // 'run-baseline' = the only value available; stated without any difference claim.
    source: fromAuthority ? "authority" : (runBaselineDeviation ? "run-baseline" : null),
    deviationText: fromAuthority ? authorityDeviation : runBaselineDeviation,
    levelText: levelText(fromAuthority ? authorityP20?.level : planView?.baseline?.p20Level),
    seatId: (fromAuthority ? authorityP20?.worstSeatId : planView?.baseline?.worstSeatId) || null,
    frequencyHz: Number.isFinite(frequency) ? frequency : null,
    // The run's own baseline, kept visible so a mismatch is never silent.
    runBaselineDeviation,
    runBaselineDiffers,
  };
}