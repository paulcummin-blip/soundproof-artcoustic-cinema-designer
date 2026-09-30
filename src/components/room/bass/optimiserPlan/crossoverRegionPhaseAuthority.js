// crossoverRegionPhaseAuthority.js
// ---------------------------------------------------------------------------
// THE authority for the phase / crossover-region lever.
//
// Product rule: main speakers in a Sound Proof design are normally high-passed
// somewhere between 80 Hz and 150 Hz, typically at 24 dB/octave. A problem at,
// say, 90 Hz or 130 Hz can therefore be a crossover-region problem (sub phase,
// sub timing, polarity, crossover point and slope, main/sub summation) rather
// than a placement problem. ADI must never treat 80–150 Hz as outside bass
// optimisation, and it must never claim to have tested the crossover region
// when the model does not contain one.
//
// WHAT THIS MODULE STATES, AND WHY
// The optimiser's phase actuator is `phaseControlDeg`: a subwoofer-only,
// unity-magnitude first-order all-pass referenced at 80 Hz (see
// bass/core/subwooferPhaseControl.js). The room transfer model contains no
// main-speaker high-pass path, no crossover slope and no main/sub summation
// term. The crossover region is therefore NOT evaluated, and this module says
// so rather than presenting sub-only all-pass phase as crossover alignment.
//
// When the engine gains a crossover-region model, set
// CROSSOVER_REGION_PHASE_SUPPORTED to true: the row copy, the status vocabulary
// and the resolver below are already written for it. No bass maths lives here,
// and nothing here evaluates, scores or recalculates anything.
// ---------------------------------------------------------------------------

/** The band inside which the main/sub crossover region sits. */
export const CROSSOVER_REGION_HZ = Object.freeze({ low: 80, high: 150 });

/** The slope a Sound Proof design normally uses on the main speakers. */
export const TYPICAL_CROSSOVER_SLOPE_DB_PER_OCT = 24;

/**
 * Whether the current optimiser can evaluate the speaker/sub crossover region.
 * FALSE: the phase actuator is subwoofer-only and the transfer model has no
 * main-speaker path. Nothing else in this module may override this.
 */
export const CROSSOVER_REGION_PHASE_SUPPORTED = false;

/** Why the crossover region is not evaluated — technical detail, verbatim. */
export const CROSSOVER_REGION_PHASE_SUPPORT_REASON =
  "The optimiser's phase actuator is a subwoofer-only first-order all-pass referenced at 80 Hz "
  + "(phaseControlDeg). The room transfer model has no main-speaker high-pass path, no crossover "
  + "slope and no main/sub summation term, so phase through the crossover region cannot be evaluated.";

/** The row title. This is what the dealer reads. */
export const PHASE_CROSSOVER_REGION_TITLE = "Phase — crossover-region alignment";

/** What the lever is for, in dealer-facing language. */
export const CROSSOVER_REGION_PURPOSE =
  "Tests whether subwoofer phase and timing through the 80–150 Hz crossover region can reduce the "
  + "seat-to-seat issue before moving subwoofers.";

/** Stated when the model cannot evaluate the crossover region. Used verbatim. */
export const CROSSOVER_REGION_NOT_EVALUATED_REASON =
  "Not yet evaluated. The current optimiser does not model crossover-region phase between the main "
  + "speakers and subwoofers.";

/**
 * Why 80–150 Hz matters. Stated with the lever so an issue in that band is never
 * treated as irrelevant to bass optimisation.
 */
export const CROSSOVER_REGION_BAND_NOTE =
  "Main speakers are normally high-passed between 80 Hz and 150 Hz, typically at 24 dB/octave. "
  + "A problem in this band can be a crossover-region problem, not only a placement problem.";

/**
 * Stated when a sub-only all-pass phase search did run, so its result is never
 * presented as crossover-region alignment.
 */
export const SUB_PHASE_ONLY_NOTE =
  "Subwoofer-only all-pass phase was searched in this run. That is not crossover-region alignment: "
  + "it rotates one subwoofer group against another, with no main-speaker path in the model.";

/** The five states this lever's row may show. Nothing else is a valid state. */
export const PHASE_LEVER_STATE = Object.freeze({
  TESTED_RECOMMENDED: "tested_recommended",
  TESTED_NO_IMPROVEMENT: "tested_no_improvement",
  TESTED_REJECTED: "tested_rejected",
  NOT_TESTED_UNSUPPORTED: "not_tested_unsupported",
  NOT_APPLICABLE: "not_applicable",
});

export const PHASE_LEVER_STATE_LABEL = Object.freeze({
  [PHASE_LEVER_STATE.TESTED_RECOMMENDED]: "Tested — recommended",
  [PHASE_LEVER_STATE.TESTED_NO_IMPROVEMENT]: "Tested — no useful improvement",
  [PHASE_LEVER_STATE.TESTED_REJECTED]: "Tested — rejected",
  [PHASE_LEVER_STATE.NOT_TESTED_UNSUPPORTED]:
    "Not tested — model does not yet evaluate crossover-region phase",
  [PHASE_LEVER_STATE.NOT_APPLICABLE]: "Not applicable",
});

/**
 * Which state the crossover-region lever is in.
 *
 * @param {object} [params]
 * @param {boolean} [params.supported] - whether the engine models the region
 * @param {boolean} [params.evaluated] - whether a crossover-region search ran
 * @param {string}  [params.verdict] - the evaluated verdict, when one exists
 * @returns {string} one of PHASE_LEVER_STATE
 */
export function resolvePhaseLeverState({
  supported = CROSSOVER_REGION_PHASE_SUPPORTED,
  evaluated = false,
  verdict = null,
} = {}) {
  if (!supported) return PHASE_LEVER_STATE.NOT_TESTED_UNSUPPORTED;
  if (!evaluated) return PHASE_LEVER_STATE.NOT_APPLICABLE;
  if (verdict === "recommended") return PHASE_LEVER_STATE.TESTED_RECOMMENDED;
  if (verdict === "rejected" || verdict === "trade_off") return PHASE_LEVER_STATE.TESTED_REJECTED;
  return PHASE_LEVER_STATE.TESTED_NO_IMPROVEMENT;
}

/**
 * The complete, display-ready state of the phase / crossover-region lever.
 *
 * @param {object} [params]
 * @param {boolean} [params.subPhaseTested] - whether a sub-only phase search ran
 * @returns {object} row content — band, title, purpose, state, reason, notes
 */
export function resolveCrossoverRegionPhaseRow({ subPhaseTested = false } = {}) {
  const state = resolvePhaseLeverState();
  const notEvaluated = state === PHASE_LEVER_STATE.NOT_TESTED_UNSUPPORTED;

  return {
    lever: "phase",
    title: PHASE_CROSSOVER_REGION_TITLE,
    purpose: CROSSOVER_REGION_PURPOSE,
    bandHz: { ...CROSSOVER_REGION_HZ },
    slopeDbPerOct: TYPICAL_CROSSOVER_SLOPE_DB_PER_OCT,
    supported: CROSSOVER_REGION_PHASE_SUPPORTED,
    evaluated: false,
    state,
    stateLabel: PHASE_LEVER_STATE_LABEL[state],
    reason: notEvaluated ? CROSSOVER_REGION_NOT_EVALUATED_REASON : null,
    supportReason: CROSSOVER_REGION_PHASE_SUPPORT_REASON,
    bandNote: CROSSOVER_REGION_BAND_NOTE,
    // A sub-only phase search is real evidence, and is reported as exactly that.
    subPhaseOnly: subPhaseTested
      ? { tested: true, note: SUB_PHASE_ONLY_NOTE }
      : { tested: false, note: null },
    // The crossover region is a lever ADI reports on; it is never applyable
    // until the engine evaluates it independently and safely.
    applicable: false,
  };
}