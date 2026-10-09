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
 *   READY TO SAVE             the completed result is saved but the engineering
 *                             publication has not acknowledged it yet — shown as
 *                             "Assessment needs attention" when saving is blocked
 *   PERFORMANCE CURRENT       the completed result is saved AND published
 *
 * This module reads state only. It changes no score, threshold, fingerprint or
 * calculation: it compares the SAME completion/fingerprint conditions the bass
 * readiness authority already uses, and reports which label they imply.
 *
 * DOMAIN RULE — the bass band speaks only in the bass domain (P14, P18, P19,
 * P20). When a save is refused, only a bass-domain parameter may be named. A
 * gate outside that domain (P1–P13, P15–P17, P21) is a whole-design position,
 * never a bass problem: the completed bass assessment then stays current and
 * the overall position is stated without naming a non-bass parameter.
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
    label: "Ready to save",
    message: "Calculated — save so reports and proposals can use it.",
    actionLabel: "Save Assessment",
  },
  [BASS_AUTHORITY_STATE.PUBLISHING]: {
    label: "Publishing",
    message: "Calculated — publishing the current assessment.",
    actionLabel: null,
  },
  [BASS_AUTHORITY_STATE.CURRENT]: {
    label: "Performance Current",
    message: null,
    actionLabel: null,
  },
});

/**
 * The one designer-facing status when saving is blocked: one label, one short
 * explanation, and the same retry action as "Ready to save".
 */
export const BASS_AUTHORITY_BLOCKED_COPY = Object.freeze({
  label: "Assessment needs attention",
  actionLabel: "Save Assessment",
  message: "This assessment needs updating before it can be saved.",
});

/**
 * The bass domain: the ONLY parameters the bass panel may name as blockers.
 * P1–P13, P15–P17 and P21 sit outside it and are never named here.
 */
export const BASS_DOMAIN_PARAMETERS = Object.freeze([14, 18, 19, 20]);

/**
 * The one global line the bass panel may show when the completed bass result is
 * current and only a non-bass gate is holding up the overall publication.
 */
export const BASS_OVERALL_ASSESSMENT_NOTE = "Overall design assessment is not yet complete.";

/** Publication gates that are bass-domain facts, by the gate's own key. */
const BASS_DOMAIN_GATES = Object.freeze([
  "bass_current",
  "bass_identity",
  "bass_summary",
  "bass_authority",
  "p20_available",
]);

const BASS_PARAMETER_IN_REASON = /\bp(14|18|19|20)\b/i;

const failedGates = (attempt) => (
  Array.isArray(attempt?.gates) ? attempt.gates.filter((gate) => gate?.ok === false) : []
);

function firstBassParameter(text) {
  const match = String(text || "").match(BASS_PARAMETER_IN_REASON);
  return match ? Number(match[1]) : null;
}

/**
 * The reasons a save was refused, in the order the attempt recorded them.
 *
 * Internal field names (engineering_summary.p4, parameter_index.P4.level) stay
 * internal — they are read for a parameter NUMBER, never shown. A failing
 * bass-domain gate also contributes its label, so the gate's own parameter can
 * be named ("Current verified bass / P19", "P20 seat results available").
 */
function blockReasons(attempt = null) {
  return [
    ...(attempt?.missing || []).flatMap((item) => [item?.key, item?.label, item?.detail]),
    ...failedGates(attempt).flatMap((gate) => (
      BASS_DOMAIN_GATES.includes(gate?.key) ? [gate?.detail, gate?.label] : [gate?.detail]
    )),
    attempt?.message,
  ].filter((reason) => typeof reason === "string");
}

/**
 * The first BASS-DOMAIN parameter the attempt named, as the one short sentence
 * the bass panel may show, or null when no bass-domain parameter is at fault.
 */
export function bassDomainBlockNote(attempt = null) {
  for (const reason of blockReasons(attempt)) {
    const parameter = firstBassParameter(reason);
    if (parameter !== null) return `P${parameter} assessment needs updating.`;
  }
  return null;
}

/** Whether anything in the bass domain — a gate, or a named parameter — blocks. */
export function hasBassDomainBlocker(attempt = null) {
  return failedGates(attempt).some((gate) => BASS_DOMAIN_GATES.includes(gate?.key))
    || bassDomainBlockNote(attempt) !== null;
}

const ATTEMPT = Object.freeze({
  QUEUED: "queued",
  NOT_READY: "not_ready",
  FAILED: "failed",
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
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  publicationAttempt = null,
  engineeringFingerprint = null,
  publicationBassFingerprint = null,
  durable = null,
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
  if (contract && (placementPreviewActive || lifecycleState === "restoring")) return withCopy(BASS_AUTHORITY_STATE.PREVIEW_ONLY);
  if (designMovedOn) return withCopy(BASS_AUTHORITY_STATE.NEEDS_CALCULATION);

  // Saved AND current: the completed contract is the authority for the design
  // as it stands now. This is the same completion test the readiness authority
  // applies — the band never invents its own.
  const resultIsCurrent = status === BASS_AUTHORITY_STATUS.AUTHORITATIVE
    && !!currentFingerprint
    && !!resultFingerprint
    && currentFingerprint === resultFingerprint;

  if (resultIsCurrent) {
    // Completion is not engineering publication. A receipt must name this
    // engineering assessment AND the same completed bass calculation.
    const identityMatches = !!engineeringFingerprint
      && publicationBassFingerprint === currentFingerprint;
    const matchingAttempt = identityMatches
      && publicationAttempt?.fingerprint === engineeringFingerprint ? publicationAttempt : null;
    const saved = durable?.publication;
    const durableMatches = identityMatches
      && !!projectId && !!versionId
      && durable?.version?.id === versionId
      && saved?.report_snapshot?.report_project?.project_id === projectId
      && saved?.report_snapshot?.report_project?.version_id === versionId
      && durable?.version?.published_fingerprint === engineeringFingerprint
      && saved?.engineering_fingerprint === engineeringFingerprint
      && saved?.provenance?.bass_fingerprint === currentFingerprint
      && durable?.acknowledgement?.durably_published === true;
    const attemptStatus = matchingAttempt?.status || null;
    if (attemptStatus === ATTEMPT.ACKNOWLEDGED || durableMatches) return withCopy(BASS_AUTHORITY_STATE.CURRENT);
    if (attemptStatus === ATTEMPT.PUBLISHING) {
      return withCopy(BASS_AUTHORITY_STATE.PUBLISHING);
    }
    // Saving is blocked: ONE status, with ONE short explanation. The attempt's
    // internal field names are never shown, and the status is not repeated on
    // each parameter result.
    if (attemptStatus === ATTEMPT.FAILED || attemptStatus === ATTEMPT.NOT_READY) {
      // Only a bass-domain parameter may be named here. A blocker outside
      // P14/P18/P19/P20 is not a bass problem, so it is never presented as one.
      if (hasBassDomainBlocker(matchingAttempt)) {
        return {
          code: BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED,
          ...BASS_AUTHORITY_BLOCKED_COPY,
          message: bassDomainBlockNote(matchingAttempt) || BASS_AUTHORITY_BLOCKED_COPY.message,
          attention: true,
        };
      }
      // The completed bass assessment is saved and current; a non-bass gate is
      // holding up the overall engineering publication. The bass band reports
      // the bass assessment as current and states the overall position, without
      // naming the parameter or offering a bass action for a non-bass blocker.
      return {
        ...withCopy(BASS_AUTHORITY_STATE.CURRENT),
        note: BASS_OVERALL_ASSESSMENT_NOTE,
      };
    }
    // Saved, current, but the publication has not acknowledged it yet: the values
    // are correct, saving is what is outstanding.
    return withCopy(BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED);
  }

  // A previous result is retained while the design has moved on: the values on
  // screen are a preview, not the current authority.
  return withCopy(BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
}

export default resolveBassAuthorityState;