// improveBassV2Fingerprint.js
// V2 stale-job rejection fingerprint.
//
// Uses the SAME calibration fingerprint authority (computeCalibrationFingerprint)
// already used elsewhere in Sound Proof — no second incompatible fingerprint system.
// Covers all V2-relevant inputs: room geometry, seats/RSP, subwoofer instances
// (positions, tuning, models, enabled, rotation), selected P14 target, and physics/engine
// version via BASS_NORMALIZED_PHYSICS_DEFAULTS + Stage 2 overrides.
//
// The fingerprint is deterministic: the same inputs always produce the same hash.
// At V2 start, the fingerprint is captured. Before accepting worker results,
// publishing a winner, or enabling Apply, the current fingerprint is recomputed
// and compared. If it changed, V2 terminates cleanly as stale.
//
// BLOCKER 3 fix: rotationDeg is now included in the V2 fingerprint via a
// rotation suffix appended to the base calibration fingerprint. The base
// calibration fingerprint (without rotation) is used for authority matching
// against currentAuthority.currentFingerprint. The full V2 fingerprint
// (with rotation) is used for stale-job detection.

import { computeCalibrationFingerprint, computeHouseCurveFingerprint } from "../bassAnalysisFingerprints.js";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../bassPhysicsDefaults.js";
import { ARTCOUSTIC_HOUSE_CURVE } from "../../../utils/artcousticHouseCurve.js";
import { normaliseModelKey } from "../../../utils/modelKeyNormaliser.js";

const ROTATION_SUFFIX_SEPARATOR = "|rot:";

/**
 * Compute the V2 design fingerprint from V2 engine inputs.
 *
 * Returns a string of the form:
 *   "<baseCalibrationFingerprint>|rot:<r0>,<r1>,..."
 *
 * The base calibration fingerprint (before the |rot: suffix) is the SAME
 * fingerprint used by the production bass analysis path, so it can be
 * compared against currentAuthority.currentFingerprint. The rotation
 * suffix is V2-specific and ensures rotation changes invalidate stale jobs.
 *
 * @param {object} params - V2 engine inputs
 * @returns {string} V2 design fingerprint
 */
export function computeV2DesignFingerprint(params) {
  const {
    subwooferInstances,
    roomDims,
    seatingPositions,
    rspPosition,
    selectedSubModel,
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
  } = params || {};

  const instances = Array.isArray(subwooferInstances)
    ? subwooferInstances.filter((s) => s.enabled !== false)
    : [];

  // Build sources in the format computeCalibrationFingerprint expects.
  // z is derived from bottomHeightM + cabinetHeight/2 in the production path,
  // but for fingerprint purposes we use the stored bottomHeightM directly
  // (z=0 is NOT correct — bottomHeightM is a V2-relevant input that must
  // be in the fingerprint). We encode bottomHeightM as the z coordinate.
  const sources = instances.map((inst) => ({
    id: String(inst.id || ""),
    x: Number(inst.position?.x) || 0,
    y: Number(inst.position?.y) || 0,
    z: Number(inst.bottomHeightM) || 0,
    tuning: {
      gainDb: Number(inst.gainDb) || 0,
      delayMs: Number(inst.delayMs) || 0,
      polarity: Number(inst.polarity) || 0,
    },
    modelKey: normaliseModelKey(inst.model || selectedSubModel),
  }));

  const baseFingerprint = computeCalibrationFingerprint({
    roomDims,
    rspPosition: rspPosition
      ? {
          x: Number(rspPosition.x) || 0,
          y: Number(rspPosition.y) || 0,
          z: Number(rspPosition.z) || 0,
          designatedRspSeatId: rspPosition.designatedRspSeatId ?? null,
        }
      : null,
    sources,
    seatingPositions: (Array.isArray(seatingPositions) ? seatingPositions : []).map((s) => ({
      id: String(s.id || ""),
      x: Number(s.x) || 0,
      y: Number(s.y) || 0,
      z: Number(s.z) || 0,
    })),
    // Physics defaults — same as BASS_NORMALIZED_PHYSICS_DEFAULTS + Stage 2 overrides
    ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
    rewSourceCurveMode: "product",
    disableLateField: true,
    disableModalPropagationPhase: true,
    // House curve — same as production path
    houseCurveFingerprint: computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE),
    // Assessment band — same as production path
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    activeFitProfile: null,
    // P14 target identity — part of calibration fingerprint
    selectedP14TargetDb: Number(p14TargetDb) || null,
    p14TargetBasis: p14TargetBasis || null,
    p14TargetLevel: p14TargetLevel ?? null,
  });

  // BLOCKER 3: Append rotation suffix so rotation changes invalidate stale jobs.
  // computeCalibrationFingerprint's normalizeSourceGeometry does NOT include
  // rotation, so we add it here as a V2-specific suffix.
  const rotationComponent = instances
    .map((inst) => {
      const r = Number(inst.rotationDeg);
      return Number.isFinite(r) ? Math.round(r * 1000) / 1000 : 0;
    })
    .join(",");

  return `${baseFingerprint}${ROTATION_SUFFIX_SEPARATOR}${rotationComponent}`;
}

/**
 * Extract the base calibration fingerprint from a V2 fingerprint string.
 * The base fingerprint (without the |rot: suffix) is the SAME fingerprint
 * used by the production bass analysis path and can be compared against
 * currentAuthority.currentFingerprint.
 *
 * @param {string} v2Fingerprint - V2 fingerprint with rotation suffix
 * @returns {string} base calibration fingerprint
 */
export function extractBaseFingerprint(v2Fingerprint) {
  if (!v2Fingerprint || typeof v2Fingerprint !== "string") return v2Fingerprint || "";
  const idx = v2Fingerprint.indexOf(ROTATION_SUFFIX_SEPARATOR);
  return idx >= 0 ? v2Fingerprint.substring(0, idx) : v2Fingerprint;
}

/**
 * Check whether the existing completed bass authority is non-stale and can be
 * used directly as the Current control (BLOCKER 1 + BLOCKER 3).
 *
 * The authority is non-stale when ALL are true:
 *   1. authoritative === true (publication verified)
 *   2. contract exists with per-seat P19/P20 data in the REAL production
 *      structure: contract.selectedCandidate.perSeatP19Results / perSeatP20Results
 *   3. persisted currentFingerprint matches the live production cacheKey
 *
 * FIX 2: V2 no longer reconstructs a partial calibration fingerprint. The
 * production path (BassBackgroundAnalysisOwner) already resolves the live
 * design identity: its stale-detection effect compares
 * completedBassAuthority.currentFingerprint against cacheKey
 * (buildBassResultCacheKey(liveCalibrationFingerprint)) on every render. If
 * they mismatch, markBassAuthorityStale sets authoritative = false. Therefore
 * authoritative === true already proves the persisted authority belongs to
 * the live design. V2 consumes that production-resolved condition directly
 * by checking authoritative === true AND currentFingerprint === liveCacheKey.
 *
 * This avoids both:
 *   - the existing incomplete V2 fingerprint reconstruction (wrong z, missing
 *     capability/SPL/EQ/profiles/versions);
 *   - any transient stale-authority window before the React stale-marking
 *     effect settles (the liveCacheKey comparison is explicit, not implicit
 *     via the authoritative flag alone).
 *
 * @param {object} currentAuthority - completedBassAuthority from shared results
 * @param {string} liveCacheKey - production cacheKey from shared bass results
 *   (buildBassResultCacheKey(liveCalibrationFingerprint)). This is the same
 *   value the production UI uses for hasCurrentResult.
 * @returns {boolean} true if the existing authority can be used directly
 */
export function isCurrentAuthorityNonStale(currentAuthority, liveCacheKey) {
  if (!currentAuthority) return false;
  if (currentAuthority.authoritative !== true) return false;
  if (!currentAuthority.contract) return false;

  // Live design identity: persisted currentFingerprint must match the live
  // production cacheKey. This is the same condition the production UI uses
  // (hasCurrentResult in BassBackgroundAnalysisOwner). The stale-detection
  // effect in BassBackgroundAnalysisOwner already downgrades authoritative
  // to false when these mismatch, but we check explicitly for defence in depth
  // and to avoid any transient stale-authority window.
  if (!liveCacheKey || !currentAuthority.currentFingerprint) return false;
  if (currentAuthority.currentFingerprint !== liveCacheKey) return false;

  const contract = currentAuthority.contract;

  // Required per-seat metric authority: P19/P20 per-seat data must exist
  // in the REAL production contract structure.
  const selectedCandidate = contract.selectedCandidate || {};
  const perSeatP19Results = Array.isArray(selectedCandidate.perSeatP19Results)
    ? selectedCandidate.perSeatP19Results
    : [];
  const perSeatP20Results = Array.isArray(selectedCandidate.perSeatP20Results)
    ? selectedCandidate.perSeatP20Results
    : [];
  if (perSeatP19Results.length === 0 || perSeatP20Results.length === 0) return false;

  return true;
}