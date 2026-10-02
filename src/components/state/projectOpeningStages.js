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
  /** Nothing has been calculated for this stage yet — distinct from "nothing saved". */
  NOT_CALCULATED: "not-calculated",
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
  [OPENING_CHECKPOINT_OUTCOME.NOT_CALCULATED]: "Not calculated yet",
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
 * The structural authorities: the project, its active version and its saved
 * geometry. These are not bypassable — without them there is no project to open,
 * so a stage that will not confirm must be retried (or the hydration store
 * reports the load as failed and its own shell answers).
 */
export const STRUCTURAL_CHECKPOINT_KEYS = Object.freeze([
  "metadata",
  "activeVersion",
  "roomSeating",
  "speakerLayout",
  "seatPriorities",
]);

/**
 * Stages that block the release of EVERY project: the saved engineering
 * authority (RP22/RP23), the report authority metadata, and the structural
 * authorities above.
 *
 * "Blocking" means the stage must REACH a terminal state before the panel closes.
 * An unfinished project is not blocked by these: "not generated yet" and "not
 * calculated yet" are terminal, so a project with nothing saved still opens.
 */
export const ALWAYS_BLOCKING_CHECKPOINT_KEYS = Object.freeze([
  ...STRUCTURAL_CHECKPOINT_KEYS,
  "rp22",
  "reportAuthority",
]);

/**
 * The saved-bass pair. These block whenever the version actually HAS saved bass
 * to restore — the resolver states that fact, and until it does they are held as
 * blocking, because waiting to learn is never worse than opening half-restored.
 */
export const SAVED_BASS_CHECKPOINT_KEYS = Object.freeze([
  "bass",
  "bassTargetBank",
]);

/**
 * Stages a route makes blocking: entering straight into a report or the Proposal
 * Centre means that surface's source data is required for the open, because the
 * designer is arriving to read exactly it.
 */
export const SURFACE_CHECKPOINT_KEYS = Object.freeze({
  "visual-report": Object.freeze(["visualReport"]),
  "technical-report": Object.freeze(["technicalReport"]),
  proposal: Object.freeze(["proposalSource"]),
});

/**
 * Stages that never block the release — but must still REACH a terminal state,
 * which is what stops a row sitting on "Restoring" while the project opens.
 *
 * Pricing is the interesting case: a restore that fails leaves the priced
 * selections unproven, which is a warning the designer must see, not a reason to
 * keep them out of their project. The write path is guarded independently by
 * guardCommercialSave(), which refuses to save against an unproven commercial
 * baseline, so nothing can be overwritten while the warning stands.
 */
export const NON_BLOCKING_CHECKPOINT_KEYS = Object.freeze([
  "pricing",
  "autosaveBaseline",
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
 * The stages that block the release for a given entry surface, in one list.
 * Passing the surface the designer arrived on adds that surface's source stage.
 */
export function criticalOpeningCheckpointKeys(entrySurface = null) {
  const surfaceKeys = SURFACE_CHECKPOINT_KEYS[entrySurface] || [];
  return [...new Set([...ALWAYS_BLOCKING_CHECKPOINT_KEYS, ...surfaceKeys])];
}

/**
 * The saved-bass stages a version holds as blocking once it is known (or
 * presumed) to have saved bass. The resolver states the real answer per version.
 */
export function savedBassCheckpointKeys() {
  return [...SAVED_BASS_CHECKPOINT_KEYS];
}

/**
 * The stages the designer cannot choose to continue past: without them there is
 * no project at all. Everything else can be continued past with a visible
 * warning after an explicit decision.
 */
export function nonBypassableOpeningCheckpointKeys() {
  return [...STRUCTURAL_CHECKPOINT_KEYS];
}

/**
 * Is one stage blocking for this entry surface, or supporting (warning at most)?
 *
 * The saved-bass rows read as blocking here too: they block unless the version is
 * known to have nothing saved, which only the resolver can state.
 */
export function openingCheckpointStage(key, entrySurface = null) {
  if (NON_BLOCKING_CHECKPOINT_KEYS.includes(key)) return "supporting";
  if (SAVED_BASS_CHECKPOINT_KEYS.includes(key)) return "critical";
  return criticalOpeningCheckpointKeys(entrySurface).includes(key) ? "critical" : "supporting";
}