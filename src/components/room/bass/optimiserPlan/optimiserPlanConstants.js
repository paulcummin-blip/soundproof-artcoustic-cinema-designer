// optimiserPlanConstants.js
// ---------------------------------------------------------------------------
// Shared constants for the persisted ADI Optimisation Plan.
//
// The plan is the evaluated optimiser result saved with the design/proposal so
// it can be restored on reopen WITHOUT recomputation. Nothing here changes the
// optimiser, its scoring, the bass maths, RP22 grading, or any calculation.
// ---------------------------------------------------------------------------

/**
 * Schema version of the persisted optimiser evidence object.
 *
 * Bump whenever the persisted shape changes. Evidence saved without a version,
 * or under an older one, is NEVER reinterpreted: the reader reports it as
 * unavailable and asks for a re-run. It never crashes and never fabricates a
 * lever from evidence it cannot read.
 */
export const OPTIMISER_PLAN_VERSION = 2;

/**
 * Evidence status of a single lever. This is the honest classification of what
 * the optimiser actually evaluated — it is persisted, not inferred on read.
 */
export const OPTIMISER_LEVER_EVIDENCE = Object.freeze({
  /** The lever has its own lever-only evaluation.
   */
  EVALUATED: "evaluated",
  /** The lever's values exist only inside the combined candidate — no lever-only effect.
   */
  COMBINED_ONLY: "combined-only",
  /** The lever was never evaluated in any form.
   */
  NOT_EVALUATED: "not-evaluated",
});

export const OPTIMISER_EVIDENCE_STATUS_LABEL = Object.freeze({
  [OPTIMISER_LEVER_EVIDENCE.EVALUATED]: "Evaluated on its own",
  [OPTIMISER_LEVER_EVIDENCE.COMBINED_ONLY]: "Combined candidate only — no individual evaluation",
  [OPTIMISER_LEVER_EVIDENCE.NOT_EVALUATED]: "Not evaluated",
});

/** Recorded against polarity: its value comes from the combined candidate only. */
export const POLARITY_NOT_EVALUATED_REASON =
  "No polarity-only evaluation exists — the polarity value comes from the combined candidate. Re-run the optimiser with polarity isolated before applying it.";

/** Shown when this version has no evaluated optimiser evidence at all (prose only). */
export const NO_EVALUATED_OPTIMISER_CHANGES =
  "No evaluated optimiser changes are available. Re-run the optimiser.";

/** Shown when saved evidence is missing its schema version or predates the current one. */
export const OPTIMISER_EVIDENCE_UNAVAILABLE =
  "Optimiser evidence unavailable — re-run the optimiser.";

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
  /** Saved evidence exists but is unreadable (missing / older schema version). */
  UNSUPPORTED: "unsupported",
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