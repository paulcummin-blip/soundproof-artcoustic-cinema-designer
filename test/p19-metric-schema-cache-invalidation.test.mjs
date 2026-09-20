// p19-metric-schema-cache-invalidation.test.mjs
//
// Regression: per-seat P19 metric definition changed from absolute/max-abs
// deviation to centered half-span (minimax) normalization without a metric
// schema generation bump. Old completed bass authority (v18) contains seat
// results produced by the older absolute-deviation path and must be rejected
// as incompatible so the canonical bass calculation rebuilds them.
//
// This test pins the cache-generation invalidation behaviour:
//   1. Old-schema (v18) completed authority is rejected as incompatible.
//   2. New-schema (v19) completed authority restores immediately if
//      fingerprint/publication validation passes.
//
// No P19 math, grading, or centring formula is evaluated here — this is
// purely a cache-generation compatibility gate.

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePersistedBassAuthority,
  buildHydratedPersistedWrapper,
  COMPLETED_BASS_CACHE_VERSION,
  isAuthoritativeBassContract,
} from "../src/components/room/bass/completedBassResultPersistence.js";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../base44/shared/bassAuthorityVersion.js";

const FINGERPRINT = "cal:v7:abc123def456abc1";

// The OLD metric schema generation — the one that produced pre-centering
// absolute-deviation per-seat P19 results.
const OLD_METRIC_SCHEMA_VERSION = RP22_BASS_METRIC_SCHEMA_VERSION - 1;

function buildAuthoritativeSnapshot(schemaVersion) {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: schemaVersion,
    analysisId: "analysis-p19-cache-regression",
    fingerprints: { calibration: "cal:v7:abc123def456abc1" },
    job: {
      status: "complete",
      metricSchemaVersion: schemaVersion,
      resultFingerprint: FINGERPRINT,
      currentJobFingerprint: FINGERPRINT,
      completedAtMs: 1726000000000,
    },
    productAnalysis: {
      status: "complete",
      parameters: {
        p14: { status: "complete", targetDb: 112, targetBasis: "minimum", level: 2, value: 112 },
        p18: { status: "complete", extensionHz: 22.941, level: 2, value: 22.941 },
        p19: { status: "complete", rspVariationDb: 3.74, level: 3, value: 3.74 },
        p20: { status: "complete", worstVariationDb: 6.76, level: 1, value: 6.76 },
      },
    },
    selectedMode: "minimum-L2",
    selectedCandidateId: "cand-min-L2",
    selectedCandidate: {
      id: "cand-min-L2",
      worstP20SeatId: "seat-r1-c2",
      achievedP18FrequencyHz: 22.941,
      // Pre-centering (OLD): absolute/max-abs deviation — e.g. Row 1 Seat 2 = 6.763 dB FAIL
      // Centered (NEW): centered half-span — e.g. Row 1 Seat 2 = 3.744 dB L3
      perSeatP19Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 3.21, level: 3 },
        { seatId: "seat-r1-c2", variationDbRaw: 3.744, level: 3 },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 4.12, level: 2, worstFrequencyHz: 42.0 },
        { seatId: "seat-r1-c2", variationDbRaw: 5.08, level: 1, worstFrequencyHz: 48.5 },
      ],
      p14TargetBasis: "minimum",
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: 22.941,
      assessmentStartHz: 22.941,
      assessmentEndHz: 120,
      officialP19WorstFrequencyHz: 35.0,
      p20WorstSeatId: "seat-r1-c2",
      p20WorstFrequencyHz: 48.5,
      p19TargetIdentity: "practical-calibration-target",
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

function buildRecord(snapshot, schemaVersion) {
  return {
    completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
    instance_authority_version: INSTANCE_AUTHORITY_VERSION,
    metric_schema_version: schemaVersion,
    current_fingerprint: FINGERPRINT,
    status: "complete",
    completed_by_fingerprint: { [FINGERPRINT]: snapshot },
  };
}

// ── 1. Old-schema (pre-centering) completed authority is rejected ──

test("old-schema (v18) completed authority with pre-centering per-seat P19 is rejected as incompatible", () => {
  const oldSnapshot = buildAuthoritativeSnapshot(OLD_METRIC_SCHEMA_VERSION);
  // Simulate an old persisted result: Row 1 Seat 2 = 6.763 dB FAIL (absolute-deviation)
  oldSnapshot.selectedCandidate.perSeatP19Results[1] = {
    seatId: "seat-r1-c2",
    variationDbRaw: 6.763,
    level: 0, // FAIL under the old absolute-deviation path
  };
  // Old snapshot also carries the old job metricSchemaVersion
  oldSnapshot.job.metricSchemaVersion = OLD_METRIC_SCHEMA_VERSION;

  const record = buildRecord(oldSnapshot, OLD_METRIC_SCHEMA_VERSION);
  const persisted = buildHydratedPersistedWrapper(record);

  // The parent envelope declares the old metric schema — rejected at the gate
  assert.equal(persisted.metricSchemaVersion, OLD_METRIC_SCHEMA_VERSION);
  assert.notEqual(persisted.metricSchemaVersion, RP22_BASS_METRIC_SCHEMA_VERSION);

  const resolved = resolvePersistedBassAuthority("p19-cache-regression", persisted);
  assert.equal(resolved.authorityStatus, "UNCALCULATED",
    "old-schema authority must be rejected as uncalculated, not silently accepted");
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.structurallyComplete, false);
  assert.equal(resolved.contract, null,
    "old absolute-deviation P19 result must not survive as authoritative");
});

// ── 2. Old snapshot inside a current envelope is also rejected ──

test("old-schema snapshot inside a current-envelope record is rejected", () => {
  const oldSnapshot = buildAuthoritativeSnapshot(OLD_METRIC_SCHEMA_VERSION);
  oldSnapshot.selectedCandidate.perSeatP19Results[1] = {
    seatId: "seat-r1-c2",
    variationDbRaw: 6.763,
    level: 0,
  };
  oldSnapshot.job.metricSchemaVersion = OLD_METRIC_SCHEMA_VERSION;

  // Parent envelope claims current schema, but the child snapshot carries the old schema
  const record = buildRecord(oldSnapshot, RP22_BASS_METRIC_SCHEMA_VERSION);
  const persisted = buildHydratedPersistedWrapper(record);

  const resolved = resolvePersistedBassAuthority("p19-cache-regression", persisted);
  // The child snapshot's metricSchemaVersion mismatch rejects it even inside a current envelope
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.contract, null);
});

// ── 3. New-schema (centered) completed authority restores immediately ──

test("new-schema (v19) completed authority with centered per-seat P19 restores immediately", () => {
  const newSnapshot = buildAuthoritativeSnapshot(RP22_BASS_METRIC_SCHEMA_VERSION);
  // Centered half-span P19: Row 1 Seat 2 = 3.744 dB L3
  newSnapshot.selectedCandidate.perSeatP19Results[1] = {
    seatId: "seat-r1-c2",
    variationDbRaw: 3.744,
    level: 3,
  };

  const record = buildRecord(newSnapshot, RP22_BASS_METRIC_SCHEMA_VERSION);
  const persisted = buildHydratedPersistedWrapper(record);

  assert.equal(persisted.metricSchemaVersion, RP22_BASS_METRIC_SCHEMA_VERSION);

  const resolved = resolvePersistedBassAuthority("p19-cache-regression", persisted);
  assert.equal(resolved.authorityStatus, "AUTHORITATIVE",
    "new-schema authority must restore as AUTHORITATIVE after cold hydration");
  assert.equal(resolved.status, "complete");
  assert.equal(resolved.structurallyComplete, true);
  assert.equal(resolved.authoritative, true);
  assert.equal(isAuthoritativeBassContract(resolved.contract), true);

  // Verify the centered P19 result survived — not the old absolute-deviation value
  const seatR1C2 = resolved.contract.selectedCandidate.perSeatP19Results.find(
    (s) => s.seatId === "seat-r1-c2",
  );
  assert.equal(seatR1C2.variationDbRaw, 3.744,
    "centered half-span P19 raw must be preserved, not the old 6.763 absolute-deviation value");
  assert.equal(seatR1C2.level, 3,
    "centered half-span P19 grade must be L3, not the old FAIL");
});

// ── 4. Metric schema version constant is the expected value ──

test("RP22_BASS_METRIC_SCHEMA_VERSION is 19 (centered per-seat P19 generation)", () => {
  assert.equal(RP22_BASS_METRIC_SCHEMA_VERSION, 19,
    "metric schema version must be 19 — the centered half-span per-seat P19 generation");
  assert.equal(OLD_METRIC_SCHEMA_VERSION, 18,
    "old metric schema version must be 18 — the pre-centering absolute-deviation generation");
});