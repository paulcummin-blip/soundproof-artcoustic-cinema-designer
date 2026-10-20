// bassRecalculationWarning — the ONE condition under which the bass result band
// tells the designer a recalculation is required.
//
// It reads the state the existing authority resolver already produced; it holds
// no fingerprint, detects nothing itself and never runs a calculation. A result
// that exists but is no longer the result for this design — the design moved on,
// a placement preview is showing, or a recalculation failed and the previous
// published result is retained — is exactly what this names.
//
// PRESENTATION ONLY.
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";

/** States in which a stored result is no longer the result for this design. */
const OUTDATED_STATES = new Set([
  BASS_AUTHORITY_STATE.NEEDS_CALCULATION,
  BASS_AUTHORITY_STATE.PREVIEW_ONLY,
]);

export const RECALCULATION_WARNING = Object.freeze({
  heading: "Recalculation Required",
  message: "Your design has changed. Recalculate to update bass performance.",
});

/**
 * Whether the "Recalculation Required" warning applies.
 * Only a result that already exists can become outdated.
 */
export function bassRecalculationRequired({ hasResult = false, stateCode = null } = {}) {
  return hasResult === true && OUTDATED_STATES.has(stateCode);
}