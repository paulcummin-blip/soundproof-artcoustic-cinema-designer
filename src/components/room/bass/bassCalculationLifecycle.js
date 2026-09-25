// bassCalculationLifecycle.js
// ─────────────────────────────────────────────────────────────────────────
// SOLE LIFECYCLE AUTHORITY for the Bass calculation.
//
// This module is the only producer of bass calculation lifecycle state.
// No other component may derive lifecycle state independently.
//
// Canonical states (acceptance set):
//   uncalculated, idle, queued, preparing, searching, validating,
//   publishing, complete, cancelled, timed_out, failed,
//   stale_needs_recalculation
//
// Consumers call:
//   resolveBassLifecycleState()  — map split-state inputs → one state
//   deriveBassDisplayStatus()    — map state → { text, icon, color, isCalculating }
//   canStartBassCalculation()    — button enable
//   canCancelBassCalculation()    — Cancel visibility
//   canRetryBassCalculation()     — Retry visibility
//   canClearBassCalculation()     — Clear visibility
//
// This module does NOT change acoustics maths, P19/P20 grading, optimiser
// scoring, or subwoofer prediction logic.

export const BASS_LIFECYCLE_STATE = {
  UNCALCULATED: "uncalculated",
  IDLE: "idle",
  QUEUED: "queued",
  PREPARING: "preparing",
  SEARCHING: "searching",
  VALIDATING: "validating",
  PUBLISHING: "publishing",
  COMPLETE: "complete",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
  FAILED: "failed",
  STALE_NEEDS_RECALCULATION: "stale_needs_recalculation",
};

// User-facing copy for each state. Plain language, no implementation detail.
// This is the single source of lifecycle display text — no consumer may
// derive "Performance is current", "Needs recalculation", "Preparing
// calculation", "Calculation complete", or "Publishing" independently.
export const BASS_LIFECYCLE_COPY = {
  [BASS_LIFECYCLE_STATE.UNCALCULATED]: "Ready to calculate",
  [BASS_LIFECYCLE_STATE.IDLE]: "Ready to calculate",
  [BASS_LIFECYCLE_STATE.PREPARING]: "Preparing calculation\u2026",
  [BASS_LIFECYCLE_STATE.SEARCHING]: "Searching viable layouts\u2026",
  [BASS_LIFECYCLE_STATE.VALIDATING]: "Validating result\u2026",
  [BASS_LIFECYCLE_STATE.PUBLISHING]: "Publishing results\u2026",
  [BASS_LIFECYCLE_STATE.COMPLETE]: "Performance is current",
  [BASS_LIFECYCLE_STATE.CANCELLED]: "Calculation cancelled",
  [BASS_LIFECYCLE_STATE.TIMED_OUT]: "Calculation timed out. No result was changed.",
  [BASS_LIFECYCLE_STATE.FAILED]: "Bass calculation could not be completed. Please try again.",
  [BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION]: "Needs recalculation",
};

// Cold-reload recovery copy — shown when a persisted UPDATING state is found
// with no recoverable active job after reload.
export const BASS_COLD_RELOAD_RECOVERY_COPY = "The previous calculation could not be recovered after reload. Your design was not changed.";

// ── Display status ──────────────────────────────────────────────────────
// The single function that maps lifecycle state → display values.
// Consumers MUST use this instead of deriving text/icon/color independently.

export const BASS_DISPLAY_ICON = {
  LOADER: "loader",
  CHECK: "check",
  ALERT: "alert",
  NONE: null,
};

export function deriveBassDisplayStatus(bassLifecycleState) {
  switch (bassLifecycleState) {
    case BASS_LIFECYCLE_STATE.PREPARING:
    case BASS_LIFECYCLE_STATE.SEARCHING:
    case BASS_LIFECYCLE_STATE.VALIDATING:
    case BASS_LIFECYCLE_STATE.PUBLISHING:
    case BASS_LIFECYCLE_STATE.QUEUED:
      return {
        text: BASS_LIFECYCLE_COPY[bassLifecycleState],
        icon: BASS_DISPLAY_ICON.LOADER,
        color: "#625143",
        isCalculating: true,
      };
    case BASS_LIFECYCLE_STATE.COMPLETE:
      return {
        text: BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.COMPLETE],
        icon: BASS_DISPLAY_ICON.CHECK,
        color: "#4A7560",
        isCalculating: false,
      };
    case BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION:
      return {
        text: "Performance out of date",
        icon: BASS_DISPLAY_ICON.ALERT,
        color: "#7A4F1A",
        isCalculating: false,
      };
    case BASS_LIFECYCLE_STATE.FAILED:
      return {
        text: "Calculation failed",
        icon: BASS_DISPLAY_ICON.ALERT,
        color: "#7A4F1A",
        isCalculating: false,
      };
    case BASS_LIFECYCLE_STATE.CANCELLED:
      return {
        text: "Calculation cancelled",
        icon: BASS_DISPLAY_ICON.ALERT,
        color: "#7A4F1A",
        isCalculating: false,
      };
    case BASS_LIFECYCLE_STATE.TIMED_OUT:
      return {
        text: "Calculation timed out",
        icon: BASS_DISPLAY_ICON.ALERT,
        color: "#7A4F1A",
        isCalculating: false,
      };
    case BASS_LIFECYCLE_STATE.UNCALCULATED:
    case BASS_LIFECYCLE_STATE.IDLE:
    default:
      return {
        text: BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.IDLE],
        icon: BASS_DISPLAY_ICON.NONE,
        color: "#8A7B6A",
        isCalculating: false,
      };
  }
}

// ── State resolver ──────────────────────────────────────────────────────
// Map the existing calculationOutcome / calculationPhase / authorityStatus
// / workflowStatus to the unified lifecycle state.
//
// workflowStatus comes from optimiseWorkflowStore — it feeds the PUBLISHING
// state so that the workflow's publishing phase is owned by this module,
// not derived independently by OptimiseAndCalculate.

export function resolveBassLifecycleState({
  calculationInProgress,
  calculationPhase,       // "preparing" | "optimising" | "finalising" | null
  calculationOutcome,     // existing outcome string
  authorityStatus,        // BASS_AUTHORITY_STATUS value
  workflowStatus,         // optimiseWorkflowStore status (idle|calculating|optimising|applying|recalculating|publishing|complete|error|cancelled)
}) {
  // PUBLISHING — workflow is in its publishing phase (post-calculation).
  // Takes precedence over authority-status fallbacks because the
  // calculation is done but the final publication hasn't completed.
  if (workflowStatus === "publishing" && !calculationInProgress) {
    return BASS_LIFECYCLE_STATE.PUBLISHING;
  }

  // Active calculation phases
  if (calculationInProgress) {
    if (calculationPhase === "preparing") return BASS_LIFECYCLE_STATE.PREPARING;
    if (calculationPhase === "optimising") return BASS_LIFECYCLE_STATE.SEARCHING;
    if (calculationPhase === "finalising") return BASS_LIFECYCLE_STATE.VALIDATING;
    return BASS_LIFECYCLE_STATE.PREPARING;
  }

  // Terminal outcomes from lastTerminalOutcome
  if (calculationOutcome === "success") return BASS_LIFECYCLE_STATE.COMPLETE;
  if (calculationOutcome === "cancelled") return BASS_LIFECYCLE_STATE.CANCELLED;
  if (calculationOutcome === "timeout") return BASS_LIFECYCLE_STATE.TIMED_OUT;
  if (calculationOutcome === "error") return BASS_LIFECYCLE_STATE.FAILED;
  if (calculationOutcome === "rejected") return BASS_LIFECYCLE_STATE.FAILED;
  if (calculationOutcome === "stale") return BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;

  // Authority status fallback (e.g. cold reload before any calculation)
  if (authorityStatus === "AUTHORITATIVE" || authorityStatus === "LIMITED") return BASS_LIFECYCLE_STATE.COMPLETE;
  if (authorityStatus === "STALE") return BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;
  if (authorityStatus === "ERROR") return BASS_LIFECYCLE_STATE.FAILED;
  // Cold-reload recovery: UPDATING with no active job is stale, not calculating
  if (authorityStatus === "UPDATING") return BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;
  if (authorityStatus === "NOT_VERIFIED") return BASS_LIFECYCLE_STATE.FAILED;
  if (authorityStatus === "UNCALCULATED") return BASS_LIFECYCLE_STATE.UNCALCULATED;
  if (authorityStatus === "LOADING") return BASS_LIFECYCLE_STATE.UNCALCULATED;
  if (authorityStatus === "BLOCKED") return BASS_LIFECYCLE_STATE.IDLE;

  return BASS_LIFECYCLE_STATE.IDLE;
}

// ── Action visibility ───────────────────────────────────────────────────
// These are the sole authority for button visibility. No consumer may
// derive Cancel/Retry/Start visibility independently.

// Whether the primary action should be enabled.
export function canStartBassCalculation(lifecycleState, canCalculate) {
  if (!canCalculate) return false;
  if (lifecycleState === BASS_LIFECYCLE_STATE.PREPARING
    || lifecycleState === BASS_LIFECYCLE_STATE.SEARCHING
    || lifecycleState === BASS_LIFECYCLE_STATE.VALIDATING
    || lifecycleState === BASS_LIFECYCLE_STATE.PUBLISHING
    || lifecycleState === BASS_LIFECYCLE_STATE.QUEUED) {
    return false;
  }
  return true;
}

// Whether Cancel should be visible.
// Cancel must be visible whenever a real active job exists.
// Cancel must NOT appear when the UI is only showing stale persisted UPDATING.
export function canCancelBassCalculation(lifecycleState, hasActiveJob) {
  if (!hasActiveJob) return false;
  return lifecycleState === BASS_LIFECYCLE_STATE.PREPARING
    || lifecycleState === BASS_LIFECYCLE_STATE.SEARCHING
    || lifecycleState === BASS_LIFECYCLE_STATE.VALIDATING
    || lifecycleState === BASS_LIFECYCLE_STATE.PUBLISHING
    || lifecycleState === BASS_LIFECYCLE_STATE.QUEUED;
}

// Whether Retry should be visible.
export function canRetryBassCalculation(lifecycleState) {
  return lifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT
    || lifecycleState === BASS_LIFECYCLE_STATE.FAILED
    || lifecycleState === BASS_LIFECYCLE_STATE.CANCELLED;
}

// Whether a Clear/Reset action should be visible (for timed_out).
export function canClearBassCalculation(lifecycleState) {
  return lifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT;
}

// ── Convenience predicates ──────────────────────────────────────────────

// Is the lifecycle in an active calculation phase?
export function isBassLifecycleCalculating(state) {
  return state === BASS_LIFECYCLE_STATE.PREPARING
    || state === BASS_LIFECYCLE_STATE.SEARCHING
    || state === BASS_LIFECYCLE_STATE.VALIDATING
    || state === BASS_LIFECYCLE_STATE.PUBLISHING
    || state === BASS_LIFECYCLE_STATE.QUEUED;
}

// Is the lifecycle in any state that needs a timer (calculating or stale)?
export function isBassLifecycleActive(state) {
  return isBassLifecycleCalculating(state) || state === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;
}

// Is the lifecycle in a terminal state (no active calculation)?
export function isBassLifecycleTerminal(state) {
  return state === BASS_LIFECYCLE_STATE.COMPLETE
    || state === BASS_LIFECYCLE_STATE.CANCELLED
    || state === BASS_LIFECYCLE_STATE.TIMED_OUT
    || state === BASS_LIFECYCLE_STATE.FAILED
    || state === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION
    || state === BASS_LIFECYCLE_STATE.IDLE
    || state === BASS_LIFECYCLE_STATE.UNCALCULATED;
}