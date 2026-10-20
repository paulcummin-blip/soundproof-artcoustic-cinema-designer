// combinedResultAuthority.js
// ---------------------------------------------------------------------------
// THE validity authority for the COMBINED LCR + subwoofer result.
//
// The combined preview is a different result from the subwoofer-only
// authoritative P19/P20 and therefore carries its own validity:
//
//   * The subwoofer-only result is identified by the design fingerprints the
//     bass engine already uses. Nothing here touches that identity.
//   * The combined result also depends on the crossover configuration
//     (frequency, per-branch slope, linked or independent frequencies), which
//     the subwoofer-only calculation does NOT use. A crossover change is
//     therefore recorded here, against a saved configuration signature, and
//     never invalidates the subwoofer-only result.
//
// The signature is written ONLY when a calculation has actually completed on
// those settings, so a crossover change can never be cleared by a calculation
// that ran on other settings. Storage is per project version and survives a
// refresh or a reopen.
//
// Pure module + small storage helpers: no React, no acoustic calculation, no
// grading, no fingerprint, no publication.
// ---------------------------------------------------------------------------

export const COMBINED_RESULT_STATE = Object.freeze({
  UNAVAILABLE: "unavailable",
  NEEDS_RECALCULATION: "needs_recalculation",
  CURRENT_PREVIEW: "current_preview",
});

/** The one label for each combined-result state. */
export const COMBINED_RESULT_LABEL = Object.freeze({
  [COMBINED_RESULT_STATE.UNAVAILABLE]: null,
  [COMBINED_RESULT_STATE.NEEDS_RECALCULATION]: "Needs recalculation",
  [COMBINED_RESULT_STATE.CURRENT_PREVIEW]: "Current preview",
});

const STORAGE_PREFIX = "sp_combined_result_signature_v1";

const finiteNumber = (value) => (
  value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null
);

/**
 * The crossover settings the combined result was calculated with, as one
 * comparable signature. Null when there is no usable crossover configuration.
 */
export function buildCrossoverConfigurationSignature(crossover) {
  const config = crossover && typeof crossover === "object" ? crossover : null;
  if (!config) return null;
  const speakerFrequencyHz = finiteNumber(config.frequencyHz);
  if (speakerFrequencyHz === null) return null;
  const linked = config.linkFrequencies !== false;
  const subwooferFrequencyHz = linked
    ? speakerFrequencyHz
    : finiteNumber(config.subwooferFrequencyHz);
  return [
    speakerFrequencyHz,
    subwooferFrequencyHz,
    finiteNumber(config.speakerHpSlopeDbPerOct),
    finiteNumber(config.subwooferLpSlopeDbPerOct),
    linked ? "linked" : "split",
  ].join("|");
}

function storageKey(projectId, versionId) {
  return `${STORAGE_PREFIX}:${projectId || "none"}:${versionId || "none"}`;
}

/** The crossover signature the combined result was last recalculated at. */
export function readCombinedResultSignature(projectId, versionId) {
  if (typeof window === "undefined" || !projectId || !versionId) return null;
  try {
    return window.localStorage.getItem(storageKey(projectId, versionId)) || null;
  } catch {
    return null;
  }
}

/** Record the crossover signature a completed calculation established. */
export function writeCombinedResultSignature(projectId, versionId, signature) {
  if (typeof window === "undefined" || !projectId || !versionId || !signature) return;
  try {
    window.localStorage.setItem(storageKey(projectId, versionId), signature);
  } catch {
    // Presentation validity only: a full storage quota cannot break a design.
  }
}

/**
 * The combined result's validity.
 *
 * The preview is never authoritative — it is always provisional. It is either
 * a CURRENT PREVIEW (recalculated on the settings in hand, on top of a current
 * subwoofer-only result) or it NEEDS RECALCULATION (settings changed, or the
 * subwoofer-only result it builds on is no longer current).
 */
export function resolveCombinedResultState({
  savedSignature = null,
  currentSignature = null,
  subOnlyCurrent = false,
  hasCombinedResult = false,
} = {}) {
  if (!hasCombinedResult || !currentSignature) return COMBINED_RESULT_STATE.UNAVAILABLE;
  if (!subOnlyCurrent) return COMBINED_RESULT_STATE.NEEDS_RECALCULATION;
  if (savedSignature && savedSignature === currentSignature) {
    return COMBINED_RESULT_STATE.CURRENT_PREVIEW;
  }
  return COMBINED_RESULT_STATE.NEEDS_RECALCULATION;
}