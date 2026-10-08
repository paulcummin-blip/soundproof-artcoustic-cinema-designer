/**
 * bassAuthorityState.js
 * ---------------------
 * THE one state vocabulary for the bass result band.
 *
 * A bass result can be in four honest states, and the UI must say which one it
 * is in rather than a single vague "Out of date":
 *
 *   PREVIEW ONLY              a previous result is retained while the design has
 *                             moved on — the values shown are a preview
 *   NEEDS CALCULATION         no result exists for the current design yet
 *   CALCULATED — NOT PUBLISHED the completed result is saved but the engineering
 *                             publication has not acknowledged it yet
 *   CURRENT                   the completed result is saved AND published
 *
 * This module reads state only. It changes no score, threshold, fingerprint or
 * calculation: it compares the SAME completion/fingerprint conditions the bass
 * readiness authority already uses, and reports which label they imply.
 */

import { BASS_AUTHORITY_STATUS } from "./completedBassResultStore";

export const BASS_AUTHORITY_STATE = Object.freeze({
  CALCULATING: "calculating",
  PREVIEW_ONLY: "preview_only",
  NEEDS_CALCULATION: "needs_calculation",
  CALCULATED_NOT_PUBLISHED: "calculated_not_published",
  PUBLISHING: "publishing",
  CURRENT: "current",
});

/** The one copy for each state. Labels are rendered uppercase by the UI. */
export const BASS_AUTHORITY_COPY = Object.freeze({
  [BASS_AUTHORITY_STATE.CALCULATING]: {
    label: "Calculating",
    message: "Calculating updated bass results — the previous result is shown until this finishes.",
    actionLabel: null,
  },
  [BASS_AUTHORITY_STATE.PREVIEW_ONLY]: {
    label: "Preview only",
    message: "Preview only — calculate bass performance to update RP22 results.",
    actionLabel: "Calculate Bass Performance",
  },
  [BASS_AUTHORITY_STATE.NEEDS_CALCULATION]: {
    label: "Needs calculation",
    message: "No bass result exists for the current design — calculate bass performance to produce RP22 results.",
    actionLabel: "Calculate Bass Performance",
  },
  [BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED]: {
    label: "Calculated — not published",
    message: "Calculated but not published. Publish the current assessment so the Project Report can read it.",
    actionLabel: "Publish Current Assessment",
  },
  [BASS_AUTHORITY_STATE.PUBLISHING]: {
    label: "Publishing",
    message: "Calculated — publishing the current assessment.",
    actionLabel: null,
  },
  [BASS_AUTHORITY_STATE.CURRENT]: {
    label: "Current",
    message: null,
    actionLabel: null,
  },
});

const ATTEMPT = Object.freeze({
  QUEUED: "queued",
  PUBLISHING: "publishing",
  ACKNOWLEDGED: "acknowledged",
});

/**
 * Resolve the state of the bass result band.
 *
 * @param {Object}  input
 * @param {Object}  input.completedBassAuthority — canonical completed bass store
 * @param {Object}  input.publicationAttempt     — the engineering publication attempt
 * @param {string}  input.lifecycleState         — shared bass lifecycle state
 * @param {boolean} input.calculationInProgress
 * @param {boolean} input.placementPreviewActive
 * @returns {{ code: string, label: string, message: string|null, actionLabel: string|null }}
 */
export function resolveBassAuthorityState({
  completedBassAuthority = null,
  publicationAttempt = null,
  lifecycleState = null,
  calculationInProgress = false,
  placementPreviewActive = false,
} = {}) {
  const withCopy = (code) => ({ code, ...BASS_AUTHORITY_COPY[code] });

  if (calculationInProgress === true) return withCopy(BASS_AUTHORITY_STATE.CALCULATING);

  const status = completedBassAuthority?.authorityStatus || null;
  const contract = completedBassAuthority?.contract || null;
  const currentFingerprint = completedBassAuthority?.currentFingerprint || null;
  const resultFingerprint = contract?.job?.resultFingerprint || null;

  // The design has moved on from the saved result — a subwoofer move, a stale
  // authority, or an active placement preview. Whatever is on screen is then a
  // PREVIEW of the response, never the current authority, so this is decided
  // before any completed-result claim.
  const designMovedOn = status === BASS_AUTHORITY_STATUS.UPDATING
    || status === BASS_AUTHORITY_STATUS.STALE
    || lifecycleState === "stale_needs_recalculation"
    || placementPreviewActive === true;
  if (contract && designMovedOn) return withCopy(BASS_AUTHORITY_STATE.PREVIEW_ONLY);

  // Saved AND current: the completed contract is the authority for the design
  // as it stands now. This is the same completion test the readiness authority
  // applies — the band never invents its own.
  const resultIsCurrent = status === BASS_AUTHORITY_STATUS.AUTHORITATIVE
    && !!currentFingerprint
    && !!resultFingerprint
    && currentFingerprint === resultFingerprint;

  if (resultIsCurrent) {
    const attemptStatus = publicationAttempt?.status || null;
    if (attemptStatus === ATTEMPT.ACKNOWLEDGED) return withCopy(BASS_AUTHORITY_STATE.CURRENT);
    if (attemptStatus === ATTEMPT.QUEUED || attemptStatus === ATTEMPT.PUBLISHING) {
      return withCopy(BASS_AUTHORITY_STATE.PUBLISHING);
    }
    // Saved, current, but the publication has not acknowledged it. Say exactly
    // that instead of "out of date" — the values are correct, the publication
    // is what is outstanding.
    const copy = BASS_AUTHORITY_COPY[BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED];
    return {
      code: BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED,
      label: copy.label,
      message: publicationAttempt?.message
        ? `${copy.message} ${publicationAttempt.message}`
        : copy.message,
      actionLabel: copy.actionLabel,
    };
  }

  // A previous result is retained while the design has moved on: the values on
  // screen are a preview, not the current authority.
  return withCopy(BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
}

export default resolveBassAuthorityState;