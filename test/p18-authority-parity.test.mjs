import test from "node:test";
import assert from "node:assert/strict";

import {
  validateAssessmentEnvelopeAuthority,
  isAuthoritativeBassContract,
} from "../src/components/room/bass/completedBassResultPersistence.js";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../base44/shared/bassAuthorityVersion.js";

const FINGERPRINT = "cal:v5:p18-parity-fp-schema:28-metric:6";

/**
 * Build a compact-style snapshot with explicit four-way P18 authority values.
 * Defaults produce an authoritative contract (all four agree at 27.992345 Hz).
 */
function buildSnapshot({
  candidateP18 = 27.992345,
  envelopeP18 = 27.992345,
  envelopeStart = 27.992345,
  cardP18 = 27.992345,
  assessmentEnd = 120,
  p19Worst = 35.0,
  p20Worst = 48.5,
  realSeatCount = 2,
} = {}) {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: "analysis-p18-parity",
    fingerprints: { calibration: "cal:v5:p18-parity" },
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
        p18: { status: "complete", extensionHz: cardP18, level: 2, value: cardP18 },
        p19: { status: "complete", rspVariationDb: 5.716, level: 0, value: 5.716 },
        p20: { status: "complete", worstVariationDb: 10.119, level: 0, value: 10.119 },
      },
    },
    selectedMode: "minimum-L2",
    selectedCandidateId: "cand-min-L2",
    selectedCandidate: {
      id: "cand-min-L2",
      worstP20SeatId: "seat-r2-c1",
      achievedP18FrequencyHz: candidateP18,
      perSeatP19Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 8.47, level: 0, worstFrequencyHz: p19Worst },
        { seatId: "seat-r2-c1", variationDbRaw: 9.63, level: 0, worstFrequencyHz: p19Worst },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", variationDbRaw: 8.41, level: 1, worstFrequencyHz: 42.0 },
        { seatId: "seat-r2-c1", variationDbRaw: 10.119, level: 1, worstFrequencyHz: p20Worst },
      ],
      p14TargetBasis: "minimum",
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: envelopeP18,
      assessmentStartHz: envelopeStart,
      assessmentEndHz: assessmentEnd,
      officialP19WorstFrequencyHz: p19Worst,
      p20WorstSeatId: "seat-r2-c1",
      p20WorstFrequencyHz: p20Worst,
    },
    requestedP14TargetDb: 112,
    requestedP14Basis: "minimum",
    requestedP14Level: 2,
    requestedP18ExtensionHz: cardP18,
    metricPublication: { canonicalMetricPublicationValid: true },
    provenance: { source: "optimiser", realSeatCount },
    graphPayload: { postEqRspCurve: [{ frequency: 20, spl: 100 }] },
  };
}

test("PASS — all four P18 authorities agree at 27.992345 Hz → authoritative", () => {
  const contract = buildSnapshot();
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, true);
  assert.equal(validation.reason, null);
  assert.equal(isAuthoritativeBassContract(contract), true);
});

test("TOLERANCE PASS — values differ by < 0.01 Hz → authoritative", () => {
  const contract = buildSnapshot({
    candidateP18: 27.992345,
    envelopeP18: 27.992345,
    envelopeStart: 27.99234,
    cardP18: 27.99235,
  });
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, true);
  assert.equal(isAuthoritativeBassContract(contract), true);
});

test("STALE 20 Hz CONTRACT — assessmentStartHz=20, others=27.99, P19 worst=21.99 → NOT_VERIFIED", () => {
  const contract = buildSnapshot({
    candidateP18: 27.99,
    envelopeP18: 27.99,
    envelopeStart: 20,
    cardP18: 27.99,
    p19Worst: 21.99,
  });
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-split:27\.99:27\.99:20:27\.99/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("MISSING FIELD — selectedCandidate.achievedP18FrequencyHz missing → NOT_VERIFIED", () => {
  const contract = buildSnapshot();
  delete contract.selectedCandidate.achievedP18FrequencyHz;
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-missing/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("MISSING FIELD — assessmentEnvelope.achievedP18FrequencyHz missing → NOT_VERIFIED", () => {
  const contract = buildSnapshot();
  delete contract.assessmentEnvelope.achievedP18FrequencyHz;
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("MISSING FIELD — assessmentEnvelope.assessmentStartHz missing → NOT_VERIFIED", () => {
  const contract = buildSnapshot();
  delete contract.assessmentEnvelope.assessmentStartHz;
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("MISSING FIELD — productAnalysis.parameters.p18.value missing → NOT_VERIFIED", () => {
  const contract = buildSnapshot();
  delete contract.productAnalysis.parameters.p18.value;
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-missing/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("CARD SPLIT — productAnalysis.p18.value=25, others=27.99 → NOT_VERIFIED", () => {
  const contract = buildSnapshot({
    candidateP18: 27.99,
    envelopeP18: 27.99,
    envelopeStart: 27.99,
    cardP18: 25,
  });
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-split:27\.99:27\.99:27\.99:25/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("CANDIDATE SPLIT — selectedCandidate.achievedP18FrequencyHz=25, others=27.99 → NOT_VERIFIED", () => {
  const contract = buildSnapshot({
    candidateP18: 25,
    envelopeP18: 27.99,
    envelopeStart: 27.99,
    cardP18: 27.99,
  });
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-split:25:27\.99:27\.99:27\.99/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});

test("ENVELOPE SPLIT — assessmentEnvelope.achievedP18FrequencyHz=25, others=27.99 → NOT_VERIFIED", () => {
  const contract = buildSnapshot({
    candidateP18: 27.99,
    envelopeP18: 25,
    envelopeStart: 27.99,
    cardP18: 27.99,
  });
  const validation = validateAssessmentEnvelopeAuthority(contract);
  assert.equal(validation.valid, false);
  assert.match(validation.reason, /p18-authority-split:27\.99:25:27\.99:27\.99/);
  assert.equal(isAuthoritativeBassContract(contract), false);
});