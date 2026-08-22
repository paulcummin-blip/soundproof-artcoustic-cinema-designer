import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHydratedPersistedWrapper,
  resolvePersistedBassAuthority,
  COMPLETED_BASS_CACHE_VERSION,
  isAuthoritativeBassContract,
} from "../src/components/room/bass/completedBassResultPersistence.js";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../base44/shared/bassAuthorityVersion.js";

const FINGERPRINT = "cal:v5:11129291fdd69043-schema:27-metric:2";

function buildAuthoritativeSnapshot() {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: "analysis-disposable-yarm",
    fingerprints: { calibration: "cal:v5:dd7199cb97e77ee1" },
    job: {
      status: "complete",
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      resultFingerprint: FINGERPRINT,
      currentJobFingerprint: FINGERPRINT,
      completedAtMs: 1724000000000,
    },
    productAnalysis: {
      status: "complete",
      parameters: {
        p14: { status: "complete", targetDb: 112, targetBasis: "minimum", level: 2, value: 112 },
        p18: { status: "complete", extensionHz: 22.941, level: 2, value: 22.941 },
        p19: { status: "complete", rspVariationDb: 5.716, level: 0, value: 5.716 },
        p20: { status: "complete", worstVariationDb: 10.119, level: 0, value: 10.119 },
      },
    },
    selectedMode: "minimum-L2",
    selectedCandidateId: "cand-min-L2",
    selectedCandidate: {
      id: "cand-min-L2",
      worstP20SeatId: "seat-r2-c1",
      perSeatP19Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 8.47, level: 0 },
        { seatId: "seat-r2-c1", variationDbRaw: 9.63, level: 0 },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 8.41, level: 0 },
        { seatId: "seat-r2-c1", variationDbRaw: 10.119, level: 0 },
      ],
      p14TargetBasis: "minimum",
    },
    requestedP14TargetDb: 112,
    requestedP14Basis: "minimum",
    requestedP14Level: 2,
    requestedP18ExtensionHz: 22.941,
    metricPublication: { canonicalMetricPublicationValid: true },
    provenance: { source: "optimiser", realSeatCount: 2 },
    graphPayload: { postEqRspCurve: [{ frequency: 20, spl: 100 }] },
  };
}

function buildRecord(snapshot) {
  return {
    completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
    instance_authority_version: INSTANCE_AUTHORITY_VERSION,
    metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
    current_fingerprint: FINGERPRINT,
    status: "complete",
    completed_by_fingerprint: { [FINGERPRINT]: snapshot },
  };
}

test("cold hydration accepts only the current cache, instance, metric and contract generations", () => {
  const snapshot = buildAuthoritativeSnapshot();
  const record = buildRecord(snapshot);
  const persisted = buildHydratedPersistedWrapper(record);

  assert.equal(persisted.version, COMPLETED_BASS_CACHE_VERSION);
  assert.equal(persisted.instanceAuthorityVersion, INSTANCE_AUTHORITY_VERSION);
  assert.equal(persisted.metricSchemaVersion, RP22_BASS_METRIC_SCHEMA_VERSION);
  assert.equal(persisted.currentFingerprint, FINGERPRINT);

  const resolved = resolvePersistedBassAuthority("disposable-yarm", persisted);
  assert.equal(resolved.authorityStatus, "AUTHORITATIVE");
  assert.equal(resolved.status, "complete");
  assert.equal(resolved.structurallyComplete, true);
  assert.equal(resolved.authoritative, true);
  assert.equal(isAuthoritativeBassContract(resolved.contract), true);
  assert.equal(resolved.contract.productAnalysis.parameters.p14.targetDb, 112);
  assert.equal(resolved.contract.productAnalysis.parameters.p18.level, 2);
  assert.equal(resolved.contract.productAnalysis.parameters.p19.level, 0);
  assert.equal(resolved.contract.productAnalysis.parameters.p20.level, 0);
});

test("old record envelope without metric schema is rejected, not relabelled current", () => {
  const record = buildRecord(buildAuthoritativeSnapshot());
  delete record.metric_schema_version;
  const persisted = buildHydratedPersistedWrapper(record);
  assert.equal(persisted.metricSchemaVersion, undefined);

  const resolved = resolvePersistedBassAuthority("disposable-yarm", persisted);
  assert.equal(resolved.authorityStatus, "UNCALCULATED");
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.contract, null);
});

test("old snapshot metric schema is rejected inside a current envelope", () => {
  const snapshot = buildAuthoritativeSnapshot();
  snapshot.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION - 1;
  const resolved = resolvePersistedBassAuthority(
    "disposable-yarm",
    buildHydratedPersistedWrapper(buildRecord(snapshot)),
  );
  assert.equal(resolved.authorityStatus, "UPDATING");
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.contract, null);
});

test("calculated status cannot publish without complete canonical P19/P20 seat evidence", () => {
  const snapshot = buildAuthoritativeSnapshot();
  snapshot.selectedCandidate.perSeatP19Results = [];
  const resolved = resolvePersistedBassAuthority(
    "disposable-yarm",
    buildHydratedPersistedWrapper(buildRecord(snapshot)),
  );
  assert.equal(resolved.structurallyComplete, true);
  assert.equal(resolved.authorityStatus, "NOT_VERIFIED");
  assert.equal(resolved.authoritative, false);
});
