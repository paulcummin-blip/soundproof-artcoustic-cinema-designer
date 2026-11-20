// bassRecalculationWarning — the ONE condition under which the bass result band
// tells the designer a calculation is required.
//
// It reads the state the existing authority resolver already produced; it holds
// no fingerprint, detects nothing itself and never runs a calculation. A result
// that is missing (no result yet) or no longer the result for this design — the
// design moved on, a placement preview is showing, or a recalculation failed and
// the previous published result is retained — is exactly what this names.
//
// PRESENTATION ONLY.
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";

/** States in which a stored result is no longer the result for this design. */
const OUTDATED_STATES = new Set([
  BASS_AUTHORITY_STATE.NEEDS_CALCULATION,
  BASS_AUTHORITY_STATE.PREVIEW_ONLY,
]);

export const RECALCULATION_WARNING = Object.freeze({
  heading: "Calculation Required",
  message: "Calculate bass parameters to display current RP22 results.",
});

/**
 * Whether the "Calculation Required" warning applies.
 * Shows when results are missing (no result yet) OR stale (a previous result
 * is no longer current for this design).
 */
export function bassRecalculationRequired({ hasResult = false, stateCode = null } = {}) {
  return OUTDATED_STATES.has(stateCode);
}