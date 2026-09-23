// appliedCalibrationPersistence.js
// ---------------------------------------------------------------------------
// Persistence and hydration layer for the Applied Calibration Authority.
//
// The authority store (appliedCalibrationAuthorityStore.js) is in-memory only.
// This module bridges between the in-memory store and the persisted project
// state (design_state on ProjectVersion) so the designer's accepted calibration
// survives page refresh, application restart, and project reopen.
//
// Three operations:
//   1. serializeAppliedCalibration  — extract a plain-serializable object from
//      the in-memory authority for persistence in design_state.
//   2. hydrateAppliedCalibration    — reconstruct the in-memory authority from
//      the persisted object, writing to the store.
//   3. migrateLegacyAppliedCalibration — reconstruct an authority from instance
//      provenance when no persisted authority exists (legacy projects).
//
// This module does NOT change acoustics, the optimiser, the Recommendation
// Engine, RP22, graphs, the workflow, the Recommendation Authority, or the
// Accept Transition. It only reads from and writes to the authority store.
// ---------------------------------------------------------------------------

import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  createAppliedCalibrationAuthority,
  extractAppliedCalibrationValues,
  resolveAppliedCalibrationStatus,
} from "./appliedCalibrationAuthority.js";
import { setAppliedCalibrationAuthority } from "./appliedCalibrationAuthorityStore.js";

/**
 * Serialize the in-memory Applied Calibration Authority into a plain
 * JSON-serializable object suitable for persistence in design_state.
 *
 * Returns null if the authority is null or missing required fields.
 *
 * @param {object|null} authority - in-memory authority object from the store
 * @returns {object|null} plain serializable object, or null
 */
export function serializeAppliedCalibration(authority) {
  if (!authority || !authority.basisFingerprint) return null;

  return {
    basisFingerprint: String(authority.basisFingerprint),
    status: String(authority.status || APPLIED_CALIBRATION_STATUS.UNKNOWN),
    source: String(authority.source || APPLIED_CALIBRATION_SOURCE.UNKNOWN),
    candidateId: String(authority.candidateId || ""),
    recommendationId: String(authority.recommendationId || ""),
    stageKey: String(authority.stageKey || ""),
    values: Array.isArray(authority.values) ? authority.values : [],
    timestamp: Number(authority.timestamp) || Date.now(),
    version: Number(authority.version) || 1,
    staleReason: authority.staleReason || null,
  };
}

/**
 * Hydrate the in-memory Applied Calibration Authority from a persisted object.
 *
 * Writes the reconstructed authority to the store via setAppliedCalibrationAuthority.
 * If the persisted data is null or invalid, no write occurs (the store stays null).
 *
 * If currentBasisFingerprint is provided, the hydrated authority's effective
 * status is resolved against it — if the fingerprints differ, the authority
 * is marked Stale.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {object|null} persistedData - the persisted applied_calibration object
 * @param {string|null} [currentBasisFingerprint] - current geometry fingerprint for stale resolution
 * @returns {object|null} the hydrated authority, or null
 */
export function hydrateAppliedCalibration(projectId, versionId, persistedData, currentBasisFingerprint) {
  if (!projectId || !versionId || !persistedData) return null;
  if (!persistedData.basisFingerprint) return null;

  const authority = createAppliedCalibrationAuthority({
    basisFingerprint: String(persistedData.basisFingerprint),
    source: String(persistedData.source || APPLIED_CALIBRATION_SOURCE.UNKNOWN),
    status: String(persistedData.status || APPLIED_CALIBRATION_STATUS.CURRENT),
    candidateId: String(persistedData.candidateId || ""),
    recommendationId: String(persistedData.recommendationId || ""),
    values: Array.isArray(persistedData.values) ? persistedData.values : [],
    stageKey: String(persistedData.stageKey || ""),
  });

  // Preserve timestamp and version from the persisted data
  authority.timestamp = Number(persistedData.timestamp) || authority.timestamp;
  authority.version = Number(persistedData.version) || 1;
  authority.staleReason = persistedData.staleReason || null;

  // If a current basis fingerprint is provided, resolve the effective status.
  // If the fingerprints differ, mark the authority as Stale.
  if (currentBasisFingerprint && authority.basisFingerprint !== currentBasisFingerprint) {
    const resolved = resolveAppliedCalibrationStatus(authority, currentBasisFingerprint);
    if (resolved.isStale && authority.status !== APPLIED_CALIBRATION_STATUS.STALE) {
      authority.status = APPLIED_CALIBRATION_STATUS.STALE;
      authority.staleReason = "Geometry changed since calibration was applied (detected on hydration)";
    }
  }

  setAppliedCalibrationAuthority(projectId, versionId, authority);
  return authority;
}

/**
 * Migrate a legacy project that has optimiser-tuned subwoofer instances but
 * no persisted Applied Calibration authority.
 *
 * Reconstructs an authority from the instance provenance:
 *   - If instances have tuningSource === "v2-optimised" or appliedV2Provenance,
 *     the calibration was applied by the optimiser → source = Unknown,
 *     status = Current (if fingerprint matches) or Stale.
 *   - If instances have no tuning provenance, no authority is created.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {Array} subwooferInstances - current subwoofer instances
 * @param {string|null} [currentBasisFingerprint] - current geometry fingerprint
 * @returns {object|null} the migrated authority, or null if no tuning provenance
 */
export function migrateLegacyAppliedCalibration(projectId, versionId, subwooferInstances, currentBasisFingerprint) {
  if (!projectId || !versionId || !Array.isArray(subwooferInstances) || subwooferInstances.length === 0) {
    return null;
  }

  const activeInstances = subwooferInstances.filter((s) => s?.enabled !== false);
  if (activeInstances.length === 0) return null;

  // Check if any instance has optimiser tuning provenance
  const hasOptimiserProvenance = activeInstances.some(
    (inst) => inst?.tuningSource === "v2-optimised" || inst?.appliedV2Provenance,
  );
  if (!hasOptimiserProvenance) return null;

  // Extract calibration values from the instances
  const values = extractAppliedCalibrationValues(subwooferInstances);
  if (!values || values.length === 0) return null;

  const basisFingerprint = currentBasisFingerprint || "";
  const status = basisFingerprint
    ? APPLIED_CALIBRATION_STATUS.CURRENT
    : APPLIED_CALIBRATION_STATUS.STALE;

  const authority = createAppliedCalibrationAuthority({
    basisFingerprint,
    source: APPLIED_CALIBRATION_SOURCE.UNKNOWN,
    status,
    values,
    stageKey: "calibration",
  });

  // Mark as Stale if we can't verify the fingerprint
  if (!basisFingerprint) {
    authority.status = APPLIED_CALIBRATION_STATUS.STALE;
    authority.staleReason = "Legacy project — calibration provenance detected but geometry fingerprint unavailable";
  }

  setAppliedCalibrationAuthority(projectId, versionId, authority);
  return authority;
}