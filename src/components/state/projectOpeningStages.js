// projectOpeningStages.js
// -----------------------
// The vocabulary of the project opening: how a restore stage finishes, which
// stages block the project from opening, and which surface a route opens into.
//
// Split out of projectOpeningAuthority.js so the state machine (which decides
// when the panel may close) and the stage vocabulary (what each stage means)
// stay separately readable, and so the panel, the resolver and the tests can all
// name the same outcomes.
//
// Every completed stage carries one of the outcomes below. This is what makes
// "not generated yet" distinguishable from "failed", so an empty report is
// never warned about and a genuine failure is never hidden.
//
//   ready           restored and usable
//   not-generated   nothing is saved for this stage yet — a valid end state
//   not-applicable  this stage does not exist for this project/version
//   stale           something is saved but no longer matches the design
//   failed          the stage could not be confirmed (a real problem, warned)
//
// Pure constants and pure functions: no React, no state, no side effects.

/** Whether a stage is still resolving or has resolved, and how. */
export const OPENING_CHECKPOINT_STATE = Object.freeze({
  /** Still resolving — the panel holds. */
  PENDING: "pending",
  /** Resolved and usable. */
  READY: "ready",
  /** Resolved as not usable, with a reason (missing, stale, not generated…). */
  UNAVAILABLE: "unavailable",
});

export const OPENING_CHECKPOINT_OUTCOME = Object.freeze({
  READY: "ready",
  NOT_GENERATED: "not-generated",
  NOT_APPLICABLE: "not-applicable",
  STALE: "stale",
  FAILED: "failed",
});

/** A snapshot id, normalised to null when absent. */
export const normaliseId = (value) => (value == null || value === "" ? null : String(value));

/**
 * Normalise a stage's outcome. A caller that states no outcome gets the honest
 * default for its state — never a warning it did not earn.
 */
export const normaliseOutcome = (outcome, state) => {
  if (OUTCOME_VALUES.includes(outcome)) return outcome;
  return state === OPENING_CHECKPOINT_STATE.READY
    ? OPENING_CHECKPOINT_OUTCOME.READY
    : OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED;
};

export const OUTCOME_VALUES = Object.freeze(Object.values(OPENING_CHECKPOINT_OUTCOME));

/**
 * Whether a completed stage is a problem the designer must be told about. Only
 * "out of date" and "could not be confirmed" qualify: an empty report or an
 * uncalculated project is a normal state, not a warning.
 */
export const WARNING_OUTCOMES = Object.freeze([
  OPENING_CHECKPOINT_OUTCOME.STALE,
  OPENING_CHECKPOINT_OUTCOME.FAILED,
]);

/** The label a completed stage shows on the panel. */
export const OPENING_OUTCOME_LABEL = Object.freeze({
  [OPENING_CHECKPOINT_OUTCOME.READY]: "Ready",
  [OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED]: "Not generated yet",
  [OPENING_CHECKPOINT_OUTCOME.NOT_APPLICABLE]: "Not applicable",
  [OPENING_CHECKPOINT_OUTCOME.STALE]: "Out of date",
  [OPENING_CHECKPOINT_OUTCOME.FAILED]: "Unavailable",
});

/** What the panel is doing right now. */
export const OPENING_PHASE = Object.freeze({
  IDLE: "idle",
  RESTORING: "restoring",
  STILL_RESTORING: "still-restoring",
  READY: "ready",
});

/**
 * Critical stages are only the authorities required to open and safely edit the
 * project. Calculated engineering results and report/proposal sources are not
 * opening preconditions: an unfinished project must open so the designer can
 * complete them. Their own surfaces enforce the strict completeness gate.
 */
const CRITICAL_CHECKPOINT_KEYS = Object.freeze([
  "metadata",
  "activeVersion",
  "roomSeating",
  "speakerLayout",
  "seatPriorities",
  "pricing",
  "autosaveBaseline",
]);

/** Output stages are informative during opening; they never block Room Designer. */
const SUPPORTING_CHECKPOINT_KEYS = Object.freeze([
  "rp22",
  "bass",
  "bassTargetBank",
  "visualReport",
  "technicalReport",
  "proposalSource",
]);

/**
 * Opening straight into a report or proposal route makes that surface's source
 * data critical for the open: the designer is arriving to read exactly that.
 */
export const OPENING_ENTRY_SURFACE = Object.freeze({
  TECHNICAL_REPORT: "technical-report",
  VISUAL_REPORT: "visual-report",
  PROPOSAL: "proposal",
});

const ENTRY_SURFACE_MATCHERS = Object.freeze([
  { surface: OPENING_ENTRY_SURFACE.TECHNICAL_REPORT, path: "/RP22Report" },
  { surface: OPENING_ENTRY_SURFACE.VISUAL_REPORT, path: "/RP22ClientReport" },
  { surface: OPENING_ENTRY_SURFACE.PROPOSAL, path: "/ProposalCentre" },
]);

/** Which report/proposal surface a route opens, for route-specific gating. */
export function openingEntrySurfaceForPath(pathname) {
  const path = typeof pathname === "string" ? pathname : "";
  const match = ENTRY_SURFACE_MATCHERS.find(
    (entry) => path === entry.path || path.startsWith(`${entry.path}/`),
  );
  return match ? match.surface : null;
}

/**
 * The critical stages for opening the editable project. Report/proposal routes
 * deliberately use the same set: once the project is open, those pages show
 * their own explicit "not ready" state until every required result is saved.
 */
export function criticalOpeningCheckpointKeys(_entrySurface = null) {
  return [...CRITICAL_CHECKPOINT_KEYS];
}

/** Is one stage critical (blocking) or supporting (warning at most)? */
export function openingCheckpointStage(key, entrySurface = null) {
  if (criticalOpeningCheckpointKeys(entrySurface).includes(key)) return "critical";
  return SUPPORTING_CHECKPOINT_KEYS.includes(key) ? "supporting" : "supporting";
}