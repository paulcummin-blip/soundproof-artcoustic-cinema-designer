// completed-bass-assessment-envelope-regression.test.mjs
//
// Frozen round-trip regression for the v9 assessment/marker envelope.
//
// Full completed contract → compact → persisted representation → hydrate →
// finished graph adapter → RP22 graph markers.
//
// Verifies:
//   1. P19/P20 whole-dB grading from raw deviations
//   2. Assessment band persistence and hydration
//   3. Graph-marker parity before/after reopen
//   4. Corrupted-grade rejection (NOT_VERIFIED)
//   5. Missing-envelope rejection for v9 contracts
//   6. v8 contract cannot be promoted as v9
//   7. Old metric-schema snapshot cannot become current authority

import test from "node:test";
import assert from "node:assert/strict";

import {
  compactCompletedBassContract,
  buildHydratedPersistedWrapper,
  resolvePersistedBassAuthority,
  isAuthoritativeBassContract,
  isStructurallyCompleteBassContract,
  gradeP19FromRaw,
  gradeP20FromRaw,
  buildAssessmentEnvelope,
  validateAssessmentEnvelopeAuthority,
  COMPLETED_BASS_CACHE_VERSION,
} from "../src/components/room/bass/completedBassResultPersistence.js";
import { buildFinishedGraphOptimisationResult } from "../src/components/room/bass/finishedGraphAdapter.js";
import { buildRp22GraphMarkers } from "../src/components/room/bass/rp22GraphMarkers.js";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../base44/shared/bassAuthorityVersion.js";

const FINGERPRINT = "cal:v9:aa111111fdd69043-schema:28-metric:6";

// ── Spec fixture values ───────────────────────────────────────────────────
const P19_RAW = 5.8429;        // → wholeDb = 5 → L1
const P20_RAW = 12.0835;        // → wholeDb = 12 → L1 (never FAIL)
const P18_CROSSING = 23.4657549;
const TRANSITION_HZ = 128.0568481;
const P19_WORST_FREQ = 31.5;    // within [23.4657549, 128.0568481]
const P20_WORST_FREQ = 45.0;    // within [23.4657549, 128.0568481]

const SEAT_1 = "seat-r1-c1";
const SEAT_2 = "seat-r2-c1";

/**
 * Build a full completed contract with the spec fixture values.
 * This simulates a fresh calculation result.
 */
function buildFullContract() {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: "analysis-envelope-regression",
    fingerprints: { calibration: "cal:v9:dd7199cb97e77ee1" },
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
        p18: { status: "complete", extensionHz: P18_CROSSING, level: 2, value: P18_CROSSING },
        p19: { status: "complete", rspVariationDb: P19_RAW, level: 1, value: P19_RAW },
        p20: { status: "complete", worstVariationDb: P20_RAW, level: 1, value: P20_RAW },
      },
    },
    selectedMode: "minimum-L2",
    selectedCandidateId: "cand-envelope-L1",
    selectedCandidate: {
      id: "cand-envelope-L1",
      candidateId: "cand-envelope-L1",
      worstP20SeatId: SEAT_2,
      perSeatP19Results: [
        { seatId: SEAT_1, variationDbRaw: P19_RAW, level: 1, worstFrequencyHz: P19_WORST_FREQ },
        { seatId: SEAT_2, variationDbRaw: 3.2, level: 3, worstFrequencyHz: 28.0 },
      ],
      perSeatP20Results: [
        { seatId: SEAT_1, variationDbRaw: 4.1, level: 2, worstFrequencyHz: 52.0 },
        { seatId: SEAT_2, variationDbRaw: P20_RAW, level: 1, worstFrequencyHz: P20_WORST_FREQ },
      ],
      p14TargetBasis: "minimum",
      assessmentStartHz: P18_CROSSING,
      assessmentEndHz: TRANSITION_HZ,
      officialP19WorstFrequencyHz: P19_WORST_FREQ,
      achievedP18FrequencyHz: P18_CROSSING,
    },
    selectedP14TargetDb: 112,
    selectedP14TargetBasis: "minimum",
    selectedP14Level: 2,
    selectedP18RequiredExtensionHz: P18_CROSSING,
    metricPublication: { canonicalMetricPublicationValid: true },
    provenance: { source: "optimiser", realSeatCount: 2 },
    finalOptimisedBassResponse: {
      selectedCandidateId: "cand-envelope-L1",
      postEqRspCurve: [{ frequency: 20, spl: 100 }, { frequency: 30, spl: 95 }],
      canonicalPostEqRsp: [{ frequency: 20, spl: 100 }, { frequency: 30, spl: 95 }],
      canonicalTargetCurve: [{ frequency: 20, spl: 98 }, { frequency: 30, spl: 93 }],
      achievedP18FrequencyHz: P18_CROSSING,
      achievedP18Level: 2,
      assessmentStartHz: P18_CROSSING,
      assessmentEndHz: TRANSITION_HZ,
      finalSeatVariationData: {
        p18: { candidateId: "cand-envelope-L1", level: 2, extensionHz: P18_CROSSING, authority: null },
        p19: { candidateId: "cand-envelope-L1", level: 1, variationDb: P19_RAW, worstFrequencyHz: P19_WORST_FREQ },
        p20: {
          candidateId: "cand-envelope-L1",
          level: 1,
          variationDb: P20_RAW,
          worstSeatId: SEAT_2,
          perSeatResults: [
            { seatId: SEAT_1, variationDbRaw: 4.1, level: 2, worstFrequencyHz: 52.0, candidateId: "cand-envelope-L1" },
            { seatId: SEAT_2, variationDbRaw: P20_RAW, level: 1, worstFrequencyHz: P20_WORST_FREQ, candidateId: "cand-envelope-L1" },
          ],
        },
      },
    },
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

// ── 1. Whole-dB grading ───────────────────────────────────────────────────

test("P19 whole-dB grading: 5.8429 → wholeDb=5 → L1", () => {
  assert.equal(gradeP19FromRaw(P19_RAW), 1, "5.8429 floored is 5 → L1 (numeric 1)");
  assert.equal(gradeP19FromRaw(5.0), 1, "5.0 → L1");
  assert.equal(gradeP19FromRaw(5.99), 1, "5.99 floored is 5 → L1");
  assert.equal(gradeP19FromRaw(6.0), 0, "6.0 → FAIL (numeric 0)");
  assert.equal(gradeP19FromRaw(2.99), 4, "2.99 floored is 2 → L4");
  assert.equal(gradeP19FromRaw(3.0), 3, "3.0 → L3");
  assert.equal(gradeP19FromRaw(4.0), 2, "4.0 → L2");
});

test("P20 whole-dB grading: 12.0835 → wholeDb=12 → L1 (never FAIL)", () => {
  assert.equal(gradeP20FromRaw(P20_RAW), 1, "12.0835 floored is 12 → L1 (numeric 1)");
  assert.equal(gradeP20FromRaw(5.0), 1, "5.0 → L1");
  assert.equal(gradeP20FromRaw(100.0), 1, "100.0 → L1 (never FAIL)");
  assert.equal(gradeP20FromRaw(2.99), 4, "2.99 floored is 2 → L4");
  assert.equal(gradeP20FromRaw(3.0), 3, "3.0 → L3");
  assert.equal(gradeP20FromRaw(4.0), 2, "4.0 → L2");
});

// ── 2. Assessment band persistence ────────────────────────────────────────

test("fresh assessment envelope is built correctly from full contract", () => {
  const contract = buildFullContract();
  const envelope = buildAssessmentEnvelope(contract);
  assert.ok(envelope, "envelope must be built");
  assert.equal(envelope.achievedP18FrequencyHz, P18_CROSSING);
  assert.equal(envelope.assessmentStartHz, P18_CROSSING);
  assert.equal(envelope.assessmentEndHz, TRANSITION_HZ);
  assert.equal(envelope.officialP19WorstFrequencyHz, P19_WORST_FREQ);
  assert.equal(envelope.p20WorstSeatId, SEAT_2);
  assert.equal(envelope.p20WorstFrequencyHz, P20_WORST_FREQ);
});

test("persisted assessment envelope matches fresh envelope", () => {
  const contract = buildFullContract();
  const freshEnvelope = buildAssessmentEnvelope(contract);
  const compact = compactCompletedBassContract(contract);
  assert.ok(compact, "compact must be produced");
  assert.ok(compact.assessmentEnvelope, "compact must carry assessmentEnvelope");
  assert.deepEqual(compact.assessmentEnvelope, freshEnvelope);
});

// ── 3. Frozen round-trip: full → compact → hydrate → adapter → markers ─────

test("frozen round-trip: graph markers match before and after reopen", () => {
  const contract = buildFullContract();

  // Fresh markers (from the full contract's finalOptimisedBassResponse)
  const freshMarkers = buildRp22GraphMarkers(contract.finalOptimisedBassResponse);

  // Compact → persist → hydrate
  const compact = compactCompletedBassContract(contract);
  assert.ok(isAuthoritativeBassContract(compact), "compact must be authoritative");

  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  assert.equal(resolved.authorityStatus, "AUTHORITATIVE");
  assert.equal(resolved.authoritative, true);

  // Hydrated markers (from the adapter-reconstructed finalOptimisedBassResponse)
  const hydratedContract = resolved.contract;
  assert.ok(hydratedContract.assessmentEnvelope, "hydrated contract must carry envelope");
  const syntheticResult = buildFinishedGraphOptimisationResult(hydratedContract);
  assert.ok(syntheticResult, "adapter must produce a synthetic result");
  const hydratedFinalResponse = syntheticResult.finalOptimisedBassResponse;
  assert.ok(hydratedFinalResponse, "synthetic result must have finalOptimisedBassResponse");
  const hydratedMarkers = buildRp22GraphMarkers(hydratedFinalResponse);

  // Marker parity
  assert.equal(hydratedMarkers.p18FrequencyHz, freshMarkers.p18FrequencyHz, "P18 marker parity");
  assert.equal(hydratedMarkers.p19StartHz, freshMarkers.p19StartHz, "P19 start marker parity");
  assert.equal(hydratedMarkers.p19EndHz, freshMarkers.p19EndHz, "P19 end marker parity");
  assert.equal(hydratedMarkers.p19WorstFrequencyHz, freshMarkers.p19WorstFrequencyHz, "P19 worst freq marker parity");
  assert.equal(hydratedMarkers.p20WorstFrequencyHz, freshMarkers.p20WorstFrequencyHz, "P20 worst freq marker parity");
  assert.equal(hydratedMarkers.p20WorstSeatId, freshMarkers.p20WorstSeatId, "P20 worst seat identity parity");

  // Specific values
  assert.equal(hydratedMarkers.p18FrequencyHz, Math.floor(P18_CROSSING), "P18 marker is floored whole-Hz");
  assert.equal(hydratedMarkers.p19StartHz, P18_CROSSING, "P19 start = precise P18 crossing");
  assert.equal(hydratedMarkers.p19EndHz, TRANSITION_HZ, "P19 end = room transition frequency");
  assert.equal(hydratedMarkers.p19WorstFrequencyHz, P19_WORST_FREQ, "P19 worst freq");
  assert.equal(hydratedMarkers.p20WorstFrequencyHz, P20_WORST_FREQ, "P20 worst freq");
  assert.equal(hydratedMarkers.p20WorstSeatId, SEAT_2, "P20 worst seat");

  // No marker may fall below the P18 crossing
  assert.ok(hydratedMarkers.p19WorstFrequencyHz >= P18_CROSSING, "P19 worst freq >= P18 crossing");
  assert.ok(hydratedMarkers.p20WorstFrequencyHz >= P18_CROSSING, "P20 worst freq >= P18 crossing");
});

// ── 4. Per-seat parity ────────────────────────────────────────────────────

test("frozen round-trip: per-seat P19/P20 parity before and after reopen", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  const hydratedContract = resolved.contract;

  // P19 per-seat parity
  const freshP19 = contract.selectedCandidate.perSeatP19Results;
  const hydratedP19 = hydratedContract.selectedCandidate.perSeatP19Results;
  assert.equal(hydratedP19.length, freshP19.length, "P19 seat count parity");
  for (let i = 0; i < freshP19.length; i++) {
    assert.equal(hydratedP19[i].seatId, freshP19[i].seatId, `P19 seat ${i} identity`);
    assert.equal(hydratedP19[i].variationDbRaw, freshP19[i].variationDbRaw, `P19 seat ${i} raw deviation`);
    assert.equal(hydratedP19[i].level, freshP19[i].level, `P19 seat ${i} level`);
  }

  // P20 per-seat parity
  const freshP20 = contract.selectedCandidate.perSeatP20Results;
  const hydratedP20 = hydratedContract.selectedCandidate.perSeatP20Results;
  assert.equal(hydratedP20.length, freshP20.length, "P20 seat count parity");
  for (let i = 0; i < freshP20.length; i++) {
    assert.equal(hydratedP20[i].seatId, freshP20[i].seatId, `P20 seat ${i} identity`);
    assert.equal(hydratedP20[i].variationDbRaw, freshP20[i].variationDbRaw, `P20 seat ${i} raw deviation`);
    assert.equal(hydratedP20[i].level, freshP20[i].level, `P20 seat ${i} level`);
    assert.equal(hydratedP20[i].worstFrequencyHz, freshP20[i].worstFrequencyHz, `P20 seat ${i} worst freq`);
  }
});

// ── 5. Corrupted-grade rejection ──────────────────────────────────────────

test("changing stored P20 level from L1 to level 0 causes NOT_VERIFIED", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Corrupt the P20 level: change seat-r2-c1 from level 1 (L1) to level 0 (FAIL)
  compact.selectedCandidate.perSeatP20Results[1].level = 0;
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  assert.equal(resolved.authorityStatus, "NOT_VERIFIED", "corrupted P20 level must be NOT_VERIFIED");
  assert.equal(resolved.authoritative, false);
  assert.equal(isAuthoritativeBassContract(resolved.contract), false);
});

test("changing P19 5.8429 from L1 to FAIL causes rejection", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Corrupt the P19 level: change seat-r1-c1 from level 1 (L1) to level 0 (FAIL)
  compact.selectedCandidate.perSeatP19Results[0].level = 0;
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  assert.equal(resolved.authorityStatus, "NOT_VERIFIED", "corrupted P19 level must be NOT_VERIFIED");
  assert.equal(resolved.authoritative, false);
});

// ── 6. Missing-envelope rejection ─────────────────────────────────────────

test("removing the assessment envelope from a v9 contract causes rejection", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  delete compact.assessmentEnvelope;
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  assert.equal(resolved.authorityStatus, "NOT_VERIFIED", "missing envelope must be NOT_VERIFIED");
  assert.equal(resolved.authoritative, false);
});

// ── 7. v8 contract cannot be promoted as v9 ────────────────────────────────

test("contract v8 cannot be promoted as v9", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Downgrade to v8
  compact.version = 8;
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  // v8 snapshot is filtered out by validSnapshots (version !== BASS_ANALYSIS_CONTRACT_VERSION)
  assert.equal(resolved.contract, null, "v8 contract must not resolve as current");
  assert.notEqual(resolved.authorityStatus, "AUTHORITATIVE", "v8 must not be authoritative");
});

// ── 8. Old metric-schema snapshot cannot become current authority ──────────

test("old metric-schema snapshot cannot become current authority through fallback", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Corrupt the metric schema version on the snapshot
  compact.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION - 1;
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  assert.equal(resolved.contract, null, "old metric-schema snapshot must not resolve");
  assert.notEqual(resolved.authorityStatus, "AUTHORITATIVE", "old metric-schema must not be authoritative");
});

// ── 9. Band validation: out-of-band marker rejection ──────────────────────

test("P19 worst frequency below assessmentStartHz is rejected", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Set P19 worst freq below the assessment start (P18 crossing)
  compact.assessmentEnvelope.officialP19WorstFrequencyHz = 20.0; // below 23.4657549
  const validation = validateAssessmentEnvelopeAuthority(compact);
  assert.equal(validation.valid, false);
  assert.ok(validation.reason.includes("p19-worst-frequency-out-of-band"), `reason: ${validation.reason}`);
});

test("P20 worst frequency above assessmentEndHz is rejected", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  // Set P20 worst freq above the assessment end (transition frequency)
  compact.assessmentEnvelope.p20WorstFrequencyHz = 200.0; // above 128.0568481
  const validation = validateAssessmentEnvelopeAuthority(compact);
  assert.equal(validation.valid, false);
  assert.ok(validation.reason.includes("p20-worst-frequency-out-of-band"), `reason: ${validation.reason}`);
});

// ── 10. Candidate identity and fingerprint parity ─────────────────────────

test("frozen round-trip: candidate identity and fingerprint parity", () => {
  const contract = buildFullContract();
  const compact = compactCompletedBassContract(contract);
  const record = buildRecord(compact);
  const persisted = buildHydratedPersistedWrapper(record);
  const resolved = resolvePersistedBassAuthority("envelope-regression", persisted);
  const hydratedContract = resolved.contract;

  assert.equal(hydratedContract.selectedCandidateId, contract.selectedCandidateId, "candidate ID parity");
  assert.equal(hydratedContract.job.resultFingerprint, contract.job.resultFingerprint, "fingerprint parity");
  assert.equal(hydratedContract.requestedP14TargetDb, contract.selectedP14TargetDb, "P14 target parity");
  assert.equal(hydratedContract.requestedP14Basis, contract.selectedP14TargetBasis, "P14 basis parity");
  assert.equal(hydratedContract.requestedP14Level, contract.selectedP14Level, "P14 level parity");
});