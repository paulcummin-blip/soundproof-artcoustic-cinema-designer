// bassCalculationLifecycle.js
// One explicit Bass calculation lifecycle used by all visible Bass surfaces.
//
// Canonical states:
//   idle, queued, preparing, searching, validating,
//   complete, cancelled, timed_out, failed, stale_needs_recalculation
//
// This module maps the existing split-state model (bassBackgroundAnalysisStore
// + optimiseWorkflowStore + completedBassAuthority) into a single unified
// lifecycle. It does NOT change acoustics maths, P19/P20 grading, optimiser
// scoring, or subwoofer prediction logic.

export const BASS_LIFECYCLE_STATE = {
  IDLE: "idle",
  QUEUED: "queued",
  PREPARING: "preparing",
  SEARCHING: "searching",
  VALIDATING: "validating",
  COMPLETE: "complete",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
  FAILED: "failed",
  STALE_NEEDS_RECALCULATION: "stale_needs_recalculation",
};

// User-facing copy for each state. Plain language, no implementation detail.
export const BASS_LIFECYCLE_COPY = {
  [BASS_LIFECYCLE_STATE.PREPARING]: "Preparing calculation\u2026",
  [BASS_LIFECYCLE_STATE.SEARCHING]: "Searching viable layouts\u2026",
  [BASS_LIFECYCLE_STATE.VALIDATING]: "Validating result\u2026",
  [BASS_LIFECYCLE_STATE.COMPLETE]: "Calculation complete",
  [BASS_LIFECYCLE_STATE.CANCELLED]: "Calculation cancelled",
  [BASS_LIFECYCLE_STATE.TIMED_OUT]: "Calculation timed out. No result was changed.",
  [BASS_LIFECYCLE_STATE.FAILED]: "Bass calculation could not be completed. Please try again.",
  [BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION]: "This result needs recalculation.",
};

// Cold-reload recovery copy — shown when a persisted UPDATING state is found
// with no recoverable active job after reload.
export const BASS_COLD_RELOAD_RECOVERY_COPY = "The previous calculation could not be recovered after reload. Your design was not changed.";

// Map the existing calculationOutcome / calculationPhase / authorityStatus
// to the unified lifecycle state.
export function resolveBassLifecycleState({
  calculationInProgress,
  calculationPhase,       // "preparing" | "optimising" | "finalising" | null
  calculationOutcome,     // existing outcome string
  authorityStatus,        // BASS_AUTHORITY_STATUS value
}) {
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

  return BASS_LIFECYCLE_STATE.IDLE;
}

// Whether the primary action should be enabled.
// The button must never remain disabled indefinitely.
export function canStartBassCalculation(lifecycleState, canCalculate) {
  if (!canCalculate) return false;
  if (lifecycleState === BASS_LIFECYCLE_STATE.PREPARING
    || lifecycleState === BASS_LIFECYCLE_STATE.SEARCHING
    || lifecycleState === BASS_LIFECYCLE_STATE.VALIDATING
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

// Convenience: is the lifecycle in an active calculation phase?
export function isBassLifecycleCalculating(state) {
  return state === BASS_LIFECYCLE_STATE.PREPARING
    || state === BASS_LIFECYCLE_STATE.SEARCHING
    || state === BASS_LIFECYCLE_STATE.VALIDATING
    || state === BASS_LIFECYCLE_STATE.QUEUED;
}

// Convenience: is the lifecycle in any state that needs a timer (calculating or stale)?
export function isBassLifecycleActive(state) {
  return isBassLifecycleCalculating(state) || state === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;
}