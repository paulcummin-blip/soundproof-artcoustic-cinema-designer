// projectOpeningReadiness.js
// --------------------------
// The pure reader over an opening snapshot: the progress lines the panel draws,
// the warnings the project opens with, and the ONE decision the panel needs.
//
// Split out of projectOpeningAuthority.js (which owns the state machine) so the
// rule "when may the panel close?" is readable and testable on its own. Nothing
// here holds state, writes to the database or calculates anything: it reads a
// snapshot and answers.
//
// The rule, in full:
//   · editable design and commercial-save authorities must be restored
//   · calculated/output stages never prevent an unfinished project opening
//   · reports and proposals enforce completeness inside their own surfaces
//   · the session knowledge of an already-opened project is honoured

import {
  OPENING_CHECKPOINT_STATE,
  OPENING_PHASE,
  WARNING_OUTCOMES,
  criticalOpeningCheckpointKeys,
  normaliseId,
  normaliseOutcome,
} from "./projectOpeningStages.js";

/**
 * The progress lines the opening panel shows, in order. Deliberately short: the
 * panel is reassurance, not a status console.
 */
export const PROJECT_OPENING_LINES = Object.freeze([
  { key: "roomSeating", label: "Room and seating" },
  { key: "speakerLayout", label: "Speaker layout" },
  { key: "rp22", label: "RP22 / RP23 results" },
  { key: "bass", label: "Bass performance" },
  { key: "bassTargetBank", label: "Bass target bank" },
  { key: "visualReport", label: "Visual Report" },
  { key: "technicalReport", label: "Technical Report" },
  { key: "proposalSource", label: "Proposal source data" },
  { key: "pricing", label: "Pricing" },
]);

/**
 * Checkpoints that gate closure but are not drawn as progress lines — project
 * metadata, the active version, seat priorities and the autosave baseline are
 * preconditions for a coherent project, not steps the designer needs to watch.
 */
const INTERNAL_CHECKPOINT_KEYS = Object.freeze([
  "metadata",
  "activeVersion",
  "seatPriorities",
  "autosaveBaseline",
]);

export const PROJECT_OPENING_CHECKPOINT_KEYS = Object.freeze([
  ...INTERNAL_CHECKPOINT_KEYS,
  ...PROJECT_OPENING_LINES.map((line) => line.key),
]);

const labelForCheckpoint = (key) =>
  PROJECT_OPENING_LINES.find((line) => line.key === key)?.label || key;

const isPending = (entry) =>
  (entry?.state ?? OPENING_CHECKPOINT_STATE.PENDING) === OPENING_CHECKPOINT_STATE.PENDING;

/** Every stage still restoring, in panel order. */
export function pendingOpeningCheckpointKeys(snapshot) {
  return PROJECT_OPENING_CHECKPOINT_KEYS.filter((key) => isPending(snapshot?.checkpoints?.[key]));
}

/** The nine progress lines, with the current state and outcome of each. */
export function openingProgressLines(snapshot, projectId) {
  const pid = normaliseId(projectId);
  const active = normaliseId(snapshot?.projectId) === pid ? (snapshot?.checkpoints || {}) : {};
  return PROJECT_OPENING_LINES.map((line) => {
    const entry = active[line.key] || null;
    const state = entry?.state || OPENING_CHECKPOINT_STATE.PENDING;
    return {
      key: line.key,
      label: line.label,
      state,
      outcome: state === OPENING_CHECKPOINT_STATE.PENDING
        ? null
        : (entry?.outcome || normaliseOutcome(null, state)),
      timedOut: entry?.timedOut === true,
      detail: entry?.detail || null,
    };
  });
}

/**
 * The completed stages the designer must be told about: anything that was never
 * confirmed, anything out of date, and anything that failed. A stage with
 * nothing saved yet is a normal state, not a warning.
 */
export function openingCheckpointWarnings(snapshot, projectId) {
  const pid = normaliseId(projectId);
  if (!pid || normaliseId(snapshot?.projectId) !== pid) return [];
  if (snapshot?.warningsDismissed === true) return [];

  const entries = snapshot?.checkpoints || {};
  return PROJECT_OPENING_LINES
    .filter((line) => {
      const entry = entries[line.key];
      if (!entry || entry.state === OPENING_CHECKPOINT_STATE.PENDING) return false;
      if (entry.timedOut === true) return true;
      return WARNING_OUTCOMES.includes(entry.outcome);
    })
    .map((line) => ({
      key: line.key,
      label: line.label,
      outcome: entries[line.key]?.outcome || null,
      detail: entries[line.key]?.detail || null,
      timedOut: entries[line.key]?.timedOut === true,
    }));
}

/**
 * The one decision the opening panel needs.
 *
 * `phase` is 'restoring' while an opening-critical stage is resolving,
 * 'still-restoring' once that wait has run long, and 'ready' when the editable
 * project may be shown. Output stages may continue hydrating in the background;
 * they are gated by the report/proposal surfaces that consume them.
 *
 * @param {Object} snapshot the opening snapshot
 * @param {string|null} projectId the project being opened
 * @param {{satisfied?: boolean}} [context] whether this project already opened
 *        in this browser session
 */
export function deriveOpeningReadinessFor(snapshot, projectId, context = {}) {
  const pid = normaliseId(projectId);
  const lines = openingProgressLines(snapshot, pid);

  if (!pid) {
    return {
      holding: false, begun: false, pending: [], pendingCritical: [], pendingSupporting: [],
      pendingLabels: [], closed: true, timedOut: false, minVisibleElapsed: true,
      phase: OPENING_PHASE.IDLE, canContinueWithWarning: false, entrySurface: null,
      attempt: 0, lines, warnings: [],
    };
  }

  const entrySurface = snapshot?.entrySurface || null;
  const criticalKeys = criticalOpeningCheckpointKeys(entrySurface);
  const attempt = Number(snapshot?.attempt) || 0;
  const warnings = openingCheckpointWarnings(snapshot, pid);

  // Opened earlier in this session: never show the panel again.
  if (context.satisfied === true) {
    return {
      holding: false, begun: false, pending: [], pendingCritical: [], pendingSupporting: [],
      pendingLabels: [], closed: true, timedOut: false, minVisibleElapsed: true,
      phase: OPENING_PHASE.READY, canContinueWithWarning: false, entrySurface,
      attempt, lines, warnings,
    };
  }

  // A project is selected but its opening has not begun yet. Hold, so not even
  // one frame of the previous or partially-restored state can appear.
  if (normaliseId(snapshot?.projectId) !== pid) {
    return {
      holding: true,
      begun: false,
      pending: [...PROJECT_OPENING_CHECKPOINT_KEYS],
      pendingCritical: [...criticalKeys],
      pendingSupporting: PROJECT_OPENING_CHECKPOINT_KEYS.filter((key) => !criticalKeys.includes(key)),
      pendingLabels: PROJECT_OPENING_CHECKPOINT_KEYS.map(labelForCheckpoint),
      closed: false,
      timedOut: false,
      minVisibleElapsed: false,
      phase: OPENING_PHASE.RESTORING,
      canContinueWithWarning: false,
      entrySurface,
      attempt,
      lines,
      warnings,
    };
  }

  const pending = pendingOpeningCheckpointKeys(snapshot);
  const pendingCritical = pending.filter((key) => criticalKeys.includes(key));
  const pendingSupporting = pending.filter((key) => !criticalKeys.includes(key));
  const timedOut = snapshot.timedOut === true;
  const holding = !snapshot.closed && (!snapshot.minVisibleElapsed || pendingCritical.length > 0);

  return {
    holding,
    begun: true,
    pending,
    pendingCritical,
    pendingSupporting,
    pendingLabels: pending.map(labelForCheckpoint),
    closed: snapshot.closed === true,
    timedOut,
    minVisibleElapsed: snapshot.minVisibleElapsed === true,
    phase: !holding
      ? OPENING_PHASE.READY
      : timedOut
        ? OPENING_PHASE.STILL_RESTORING
        : OPENING_PHASE.RESTORING,
    canContinueWithWarning: false,
    entrySurface,
    attempt,
    lines,
    warnings,
  };
}