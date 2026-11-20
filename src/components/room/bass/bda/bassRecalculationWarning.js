// bassRecalculationWarning — the warning the bass result band shows beside the
// Calculate Bass Parameters button when a calculation is required.
//
// It reads the state the existing authority resolver already produced; it holds
// no fingerprint, detects nothing itself and never runs a calculation. It
// distinguishes two presentation states:
//   - Not yet calculated: no previous result exists for the current design.
//   - Update required:    a previous result exists but design changes have made
//                         those results outdated.
//
// PRESENTATION ONLY.
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";

/** States in which the bass result is not current for the design. */
const OUTDATED_STATES = new Set([
  BASS_AUTHORITY_STATE.NEEDS_CALCULATION,
  BASS_AUTHORITY_STATE.UPDATE_REQUIRED,
  BASS_AUTHORITY_STATE.PREVIEW_ONLY,
]);

/**
 * Whether a "calculation required" warning applies at all.
 * True when results are missing (no result yet) OR stale (a previous result
 * is no longer current for this design).
 */
export function bassRecalculationRequired({ hasResult = false, stateCode = null } = {}) {
  return OUTDATED_STATES.has(stateCode);
}

/**
 * The specific warning copy to show beside the Calculate Bass Parameters button.
 * Returns null when the result is current and no warning is needed.
 *
 * - "Calculation Required" when no bass calculation has been completed yet.
 * - "Update Required" when a previous calculation exists but is outdated.
 */
export function resolveRecalculationWarning({ hasResult = false, stateCode = null } = {}) {
  if (!OUTDATED_STATES.has(stateCode)) return null;
  if (hasResult) {
    return {
      heading: "Update Required",
      message: "Design changes have made the previous bass results outdated. Calculate bass parameters to update RP22 results.",
    };
  }
  return {
    heading: "Calculation Required",
    message: "No bass calculation has been completed for this design. Calculate bass parameters to produce RP22 results.",
  };
}