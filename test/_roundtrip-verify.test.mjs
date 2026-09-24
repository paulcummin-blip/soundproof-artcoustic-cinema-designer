
import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  computeAppliedCalibrationBasisFingerprint,
  resolveAppliedCalibrationStatus,
  isAppliedCalibrationConsumable,
  extractAppliedCalibrationValues,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import {
  serializeAppliedCalibration,
  hydrateAppliedCalibration,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationPersistence.js";
import {
  markAppliedCalibrationUserModified,
  getAppliedCalibrationAuthority,
  resetAppliedCalibrationAuthority,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";

function buildInputs() {
  return {
    subwooferInstances: [
      { id: "sub-1", enabled: true, model: "SUB2-12", position: { x: 1.5, y: 0.5 }, bottomHeightM: 0.05, rotationDeg: 0 },
      { id: "sub-2", enabled: true, model: "SUB2-12", position: { x: 3.5, y: 0.5 }, bottomHeightM: 0.05, rotationDeg: 0 },
    ],
    roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    seatingPositions: [{ id: "seat-1", x: 2.25, y: 3.0, z: 1.2 }],
    rspPosition: { x: 2.25, y: 3.0, z: 1.2, designatedRspSeatId: null },
    selectedSubModel: "SUB2-12",
    p14TargetBasis: "minimum",
    p14TargetLevel: 2,
    p14TargetDb: 112,
    p18TargetBasis: "extension",
  };
}

test("Manual edit → serialize → hydrate round-trip", () => {
  const projectId = "roundtrip-proj";
  const versionId = "roundtrip-ver";
  try {
    const inputs = buildInputs();
    const fp = computeAppliedCalibrationBasisFingerprint(inputs);
    const manualValues = [
      { id: "sub-1", delayMs: 5.1, gainDb: -2.0, polarity: -1, phaseControlDeg: 45 },
      { id: "sub-2", delayMs: 3.2, gainDb: -1.0, polarity: 1, phaseControlDeg: 0 },
    ];

    // Simulate manual edit (same as setInstanceCalibration)
    markAppliedCalibrationUserModified(projectId, versionId, fp, manualValues);
    const authority = getAppliedCalibrationAuthority(projectId, versionId);
    assert.ok(authority, "Authority must exist after manual edit");
    assert.ok(authority.basisFingerprint, "Basis fingerprint must be non-empty");
    assert.equal(authority.source, APPLIED_CALIBRATION_SOURCE.MANUAL);
    assert.equal(authority.status, APPLIED_CALIBRATION_STATUS.USER_MODIFIED);

    // Serialize
    const serialized = serializeAppliedCalibration(authority);
    assert.ok(serialized, "Serialized authority must be non-null (not rejected)");
    assert.ok(serialized.basisFingerprint, "Serialized basis fingerprint must be non-empty");
    assert.equal(serialized.source, APPLIED_CALIBRATION_SOURCE.MANUAL);
    assert.equal(serialized.status, APPLIED_CALIBRATION_STATUS.USER_MODIFIED);
    assert.equal(serialized.values.length, 2);

    // Hydrate into a fresh store key
    resetAppliedCalibrationAuthority(projectId, versionId);
    assert.equal(getAppliedCalibrationAuthority(projectId, versionId), null, "Store must be empty after reset");

    const hydrated = hydrateAppliedCalibration(projectId, versionId, serialized, null);
    assert.ok(hydrated, "Hydrated authority must be non-null");
    assert.equal(hydrated.basisFingerprint, serialized.basisFingerprint, "Fingerprint must match");
    assert.equal(hydrated.source, APPLIED_CALIBRATION_SOURCE.MANUAL, "Source must be Manual");
    assert.equal(hydrated.status, APPLIED_CALIBRATION_STATUS.USER_MODIFIED, "Status must be User Modified");
    assert.equal(hydrated.values.length, 2, "Values must be restored");

    // Verify it's consumable
    const resolved = resolveAppliedCalibrationStatus(hydrated, fp);
    assert.equal(resolved.isStale, false, "Must not be stale (fingerprints match)");
    assert.equal(isAppliedCalibrationConsumable(hydrated, fp), true, "Must be consumable");
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});

test("Manual edit with null fingerprint (old bug) → serialize rejects", () => {
  const projectId = "nullfp-proj";
  const versionId = "nullfp-ver";
  try {
    markAppliedCalibrationUserModified(projectId, versionId, null, []);
    const authority = getAppliedCalibrationAuthority(projectId, versionId);
    assert.ok(authority, "Authority must exist");
    assert.equal(authority.basisFingerprint, "", "Basis fingerprint must be empty string for null input");

    // serializeAppliedCalibration rejects empty fingerprints
    const serialized = serializeAppliedCalibration(authority);
    assert.equal(serialized, null, "Serialized authority must be null (empty fingerprint rejected)");
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});
