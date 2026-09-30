// optimiserPlanConstants.js
// ---------------------------------------------------------------------------
// Shared constants for the persisted ADI Optimisation Plan.
//
// The plan is the evaluated optimiser result saved with the design/proposal so
// it can be restored on reopen WITHOUT recomputation. Nothing here changes the
// optimiser, its scoring, the bass maths, RP22 grading, or any calculation.
// ---------------------------------------------------------------------------

/** Schema version of the persisted plan object. Bump when the shape changes. */
export const OPTIMISER_PLAN_VERSION = 1;

/** The lever set in scope for the Optimisation Plan. */
export const OPTIMISER_LEVER = Object.freeze({
  PLACEMENT: "placement",
  DELAY: "delay",
  POLARITY: "polarity",
  GAIN: "gain",
});

/** Stable display order — also the recommended practical apply sequence. */
export const OPTIMISER_LEVER_ORDER = Object.freeze([
  OPTIMISER_LEVER.PLACEMENT,
  OPTIMISER_LEVER.POLARITY,
  OPTIMISER_LEVER.DELAY,
  OPTIMISER_LEVER.GAIN,
]);

export const OPTIMISER_LEVER_LABEL = Object.freeze({
  [OPTIMISER_LEVER.PLACEMENT]: "PLACEMENT",
  [OPTIMISER_LEVER.DELAY]: "DELAY",
  [OPTIMISER_LEVER.POLARITY]: "POLARITY",
  [OPTIMISER_LEVER.GAIN]: "GAIN",
});

/** Plan-level status. STALE = the saved plan no longer belongs to this design. */
export const OPTIMISER_PLAN_STATUS = Object.freeze({
  CURRENT: "current",
  STALE: "stale",
  ABSENT: "absent",
});

/** Per-lever state, resolved against the CURRENT design on every read. */
export const OPTIMISER_LEVER_STATE = Object.freeze({
  NOT_APPLIED: "not_applied",
  PREVIEWED: "previewed",
  APPLIED: "applied",
  NEEDS_REEVALUATION: "needs_reevaluation",
  NO_LONGER_APPLICABLE: "no_longer_applicable",
  DISABLED: "disabled",
});

export const OPTIMISER_LEVER_STATE_LABEL = Object.freeze({
  [OPTIMISER_LEVER_STATE.NOT_APPLIED]: "Not applied",
  [OPTIMISER_LEVER_STATE.PREVIEWED]: "Previewed",
  [OPTIMISER_LEVER_STATE.APPLIED]: "Applied",
  [OPTIMISER_LEVER_STATE.NEEDS_REEVALUATION]: "Needs re-evaluation",
  [OPTIMISER_LEVER_STATE.NO_LONGER_APPLICABLE]: "No longer applicable",
  [OPTIMISER_LEVER_STATE.DISABLED]: "Disabled",
});

/** Shown whenever a lever's own effect was never evaluated on its own. */
export const INDIVIDUAL_EFFECT_NOT_EVALUATED = "Individual effect not yet evaluated.";

/**
 * Match tolerances. These mirror the tolerances already used by the optimiser's
 * applied-state matching (improveBassV2Apply / improveBassV2ApplyCalibration).
 */
export const PLAN_MATCH_TOLERANCE = Object.freeze({
  POSITION_M: 0.01,
  DELAY_MS: 0.1,
  GAIN_DB: 0.1,
});