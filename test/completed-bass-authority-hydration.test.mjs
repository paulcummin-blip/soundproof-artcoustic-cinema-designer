import test from "node:test";
import assert from "node:assert/strict";

// Import the REAL adapter + resolver used by hydrateCompletedBassAuthority().
// completedBassResultPersistence.js is dependency-free (no @/ alias), so this
// runs under bare Node. This regression exercises the exact escaped defect:
// the persisted-record → wrapper adapter must stamp instanceAuthorityVersion
// so resolvePersistedBassAuthority() returns AUTHORITATIVE instead of
// UNCALCULATED on cold hydration.
import {
  buildHydratedPersistedWrapper,
  resolvePersistedBassAuthority,
  COMPLETED_BASS_CACHE_VERSION,
  isAuthoritativeBassContract,
} from "../src/components/room/bass/completedBassResultPersistence.js";
import { INSTANCE_AUTHORITY_VERSION } from "../base44/shared/bassAuthorityVersion.js";

const FINGERPRINT = "cal:v5:11129291fdd69043-schema:26";

/**
 * Realistic compact completed-bass contract — mirrors the Yarm persisted
 * authority shape: canonical metric publication valid, instanceAuthorityVersion
 * present, P14/P18/P19/P20 populated.
 */
function buildAuthoritativeSnapshot() {
  return {
    version: COMPLETED_BASS_CACHE_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    analysisId: "analysis-yarm",
    fingerprints: { calibration: "cal:v5:dd7199cb97e77ee1" },
    job: {
      status: "complete",
      resultFingerprint: FINGERPRINT,
      currentJobFingerprint: FINGERPRINT,
      completedAtMs: 1724000000000,
    },
    productAnalysis: {
      status: "complete",
      parameters: {
        p14: { targetDb: 112, targetBasis: "minimum", level: 2, value: 112 },
        p18: { extensionHz: 22.941, level: "L2" },
        p19: { rspVariationDb: 2.832158, level: "L4" },
        p20: { worstVariationDb: 6.667, level: "L1" },
      },
    },
    selectedMode: "minimum-L2",
    selectedCandidateId: "cand-min-L2",
    selectedCandidate: {
      id: "cand-min-L2",
      worstP20SeatId: "seat-r2-c1",
      perSeatP19Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 4.362428, level: "L2" },
        { seatId: "seat-r2-c1", variationDbRaw: 6.698359, level: "FAIL" },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", level: "L3" },
        { seatId: "seat-r2-c1", level: "L1" },
      ],
      p14TargetBasis: "minimum",
    },
    requestedP14TargetDb: 112,
    requestedP14Basis: "minimum",
    requestedP14Level: 2,
    requestedP18ExtensionHz: 22.941,
    metricPublication: { canonicalMetricPublicationValid: true },
    provenance: { source: "optimiser" },
    graphPayload: { postEqRspCurve: [{ hz: 20, db: 0 }] },
  };
}

function buildRecord(snapshot) {
  return {
    current_fingerprint: FINGERPRINT,
    status: "complete",
    completed_by_fingerprint: { [FINGERPRINT]: snapshot },
  };
}

test("cold hydration: adapter stamps instanceAuthorityVersion and resolver returns AUTHORITATIVE", () => {
  const snapshot = buildAuthoritativeSnapshot();
  assert.equal(
    snapshot.instanceAuthorityVersion,
    INSTANCE_AUTHORITY_VERSION,
    "snapshot carries the authority version before persistence"
  );

  const record = buildRecord(snapshot);
  const persisted = buildHydratedPersistedWrapper(record);

  // The reconstructed wrapper must retain the authority version.
  assert.equal(persisted.version, COMPLETED_BASS_CACHE_VERSION);
  assert.equal(
    persisted.instanceAuthorityVersion,
    INSTANCE_AUTHORITY_VERSION,
    "reconstructed wrapper retains instanceAuthorityVersion"
  );
  assert.equal(persisted.currentFingerprint, FINGERPRINT);
  assert.equal(persisted.status, "complete");
  assert.deepEqual(persisted.completedByFingerprint, record.completed_by_fingerprint);

  const resolved = resolvePersistedBassAuthority("yarm", persisted);
  assert.notEqual(resolved.authorityStatus, "UNCALCULATED");
  assert.equal(resolved.status, "complete");
  assert.equal(resolved.structurallyComplete, true);
  assert.equal(resolved.authoritative, true);
  assert.equal(isAuthoritativeBassContract(resolved.contract), true);
  // P14/P18/P19/P20 hydrate from persisted authority.
  assert.equal(resolved.contract.productAnalysis.parameters.p14.targetDb, 112);
  assert.equal(resolved.contract.productAnalysis.parameters.p18.level, "L2");
  assert.equal(resolved.contract.productAnalysis.parameters.p19.level, "L4");
  assert.equal(resolved.contract.productAnalysis.parameters.p20.level, "L1");
});

test("cold hydration: a wrapper reconstructed WITHOUT instanceAuthorityVersion is rejected (negative control)", () => {
  const snapshot = buildAuthoritativeSnapshot();
  const record = buildRecord(snapshot);
  // Simulate the pre-fix defect: omit instanceAuthorityVersion from the wrapper.
  const persisted = {
    version: COMPLETED_BASS_CACHE_VERSION,
    currentFingerprint: record.current_fingerprint,
    status: record.status,
    completedByFingerprint: record.completed_by_fingerprint,
  };
  assert.equal(persisted.instanceAuthorityVersion, undefined);

  const resolved = resolvePersistedBassAuthority("yarm", persisted);
  assert.equal(resolved.authorityStatus, "UNCALCULATED");
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.contract, null);
});

test("cold hydration: a snapshot with a mismatched authority version is rejected (negative control)", () => {
  const snapshot = buildAuthoritativeSnapshot();
  snapshot.instanceAuthorityVersion = 999; // incompatible
  const record = buildRecord(snapshot);
  const persisted = buildHydratedPersistedWrapper(record);
  // Wrapper version is correct, but the snapshot version is wrong → filtered out.
  const resolved = resolvePersistedBassAuthority("yarm", persisted);
  assert.equal(resolved.authorityStatus, "UPDATING");
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.contract, null);
});