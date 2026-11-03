// Regression: retain the bass graph payload inside the immutable engineering
// publication so a frozen Project Report renders its own P19 graph after the
// bounded completed_by_fingerprint map evicts the matching contract.
//
// Covers the nine spec scenarios: new publication embeds the graph, fingerprint
// match is enforced at publish AND read time, frozen report prefers the
// publication-retained payload, cache eviction no longer breaks new reports,
// curve identity is exact, numeric P19/P20 are unchanged, the legacy cache
// fallback still works for old publications, and an evicted historical graph
// is reported honestly rather than fabricated.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  resolveBassEvidenceForPublication,
  hasRetainedBassEvidence,
  syntheticContractFromRetainedEvidence,
  BASS_EVIDENCE_SCHEMA_VERSION,
} from '@/lib/bassEvidencePublication';
import frozenReportBass from '@/components/report/frozenReportBass';

const BASS_FP = 'cal:v8:fd36b0e67f0396c8|result-schema:34|metric-schema:21';
const ENG_FP = 'eng:v1:f8e4aeda52213c9c';

const POST_EQ = Array.from({ length: 10 }, (_, i) => ({ frequency: 20 + i * 5, spl: 90 - i }));
const CORRECTION = Array.from({ length: 10 }, (_, i) => ({ frequency: 20 + i * 5, gain: -i * 0.3 }));
const GRAPH_PAYLOAD = {
  postEqRspCurve: POST_EQ,
  correctionCurve: CORRECTION,
  productionHouseCurveTarget: [{ frequency: 20, spl: 88 }],
  operatingLevelOffsetDb: -2.5,
  roomResponseCurve: [{ frequency: 20, spl: 85 }],
  rawCorrectionCurve: [],
  referenceEq: [],
  eqFilterBank: [],
  postEqPerSeatCurves: [],
  maximumSplCurveAfterEq: [],
  maximumSplSafetyMarginDb: 0,
  perSeatRoomResponseCurves: [],
  sourceCapabilityCurves: [],
  physicalRawResponseCurve: [],
  selectedCandidateId: 'cand-1',
  correctionStartHz: 20,
  correctionEndHz: 120,
  designEqFitProfile: null,
  correctionTrace: null,
};
const ENVELOPE = { achievedP18FrequencyHz: 22, officialP19WorstFrequencyHz: 31.5, p20WorstSeatId: 'seat-2', assessmentStartHz: 20, assessmentEndHz: 80 };
const P20_SEATS = [{ seatId: 'seat-1', variationDb: 1.2 }, { seatId: 'seat-2', variationDb: 3.1 }];

/** An authoritative completed bass contract stored under its result fingerprint. */
function authoritativeContract(overrides = {}) {
  return {
    graphPayload: GRAPH_PAYLOAD,
    assessmentEnvelope: ENVELOPE,
    bassResult: { seatResults: { P20: P20_SEATS } },
    selectedCandidateId: 'cand-1',
    requestedP14TargetDb: 95,
    job: { resultFingerprint: BASS_FP },
    fingerprints: { calibration: 'cal:abc' },
    ...overrides,
  };
}

/** A ProjectAnalysisCache record whose completed_by_fingerprint holds the contract. */
function cacheRecordWithContract(contract = authoritativeContract()) {
  return { completed_by_fingerprint: { [BASS_FP]: contract } };
}

/** A cleaned publication with retained bass_evidence. */
function publicationWith(evidence) {
  return {
    engineering_fingerprint: ENG_FP,
    provenance: { bass_fingerprint: BASS_FP },
    report_snapshot: { report_project: { project_id: 'p', version_id: 'v' } },
    bass_evidence: evidence,
  };
}

test('1 NEW PUBLICATION: authoritative bass contract graphPayload is copied verbatim into the publication', () => {
  const cache = cacheRecordWithContract();
  const evidence = resolveBassEvidenceForPublication(cache, BASS_FP);
  assert.ok(evidence, 'evidence resolved');
  assert.equal(evidence.fingerprint, BASS_FP);
  assert.equal(evidence.schema_version, BASS_EVIDENCE_SCHEMA_VERSION);
  // The SAME payload object — not a second graph format.
  assert.equal(evidence.graphPayload, GRAPH_PAYLOAD);
  assert.deepEqual(evidence.graphPayload.postEqRspCurve, POST_EQ);
  assert.deepEqual(evidence.graphPayload.correctionCurve, CORRECTION);
});

test('2 FINGERPRINT MATCH: publication bass fingerprint equals retained graph fingerprint', () => {
  const cache = cacheRecordWithContract();
  const evidence = resolveBassEvidenceForPublication(cache, BASS_FP);
  const pub = publicationWith(evidence);
  assert.ok(hasRetainedBassEvidence(pub), 'retained evidence matches publication bass fingerprint');
  assert.ok(syntheticContractFromRetainedEvidence(pub), 'synthetic contract reconstructs');
});

test('3 FINGERPRINT MISMATCH: graph is not attached when the contract result fingerprint differs from the publication bass fingerprint', () => {
  // Contract stored under a DIFFERENT result fingerprint than the publication's bass fingerprint.
  const wrongFp = 'cal:other:result';
  const cache = { completed_by_fingerprint: { [BASS_FP]: authoritativeContract({ job: { resultFingerprint: wrongFp } }) } };
  const evidence = resolveBassEvidenceForPublication(cache, BASS_FP);
  assert.equal(evidence, null, 'no evidence attached on mismatch');
  // Read-time guard: a publication whose bass_evidence.fingerprint disagrees with
  // its own provenance.bass_fingerprint is not used.
  const tampered = publicationWith({ ...resolveBassEvidenceForPublication(cacheRecordWithContract(), BASS_FP), fingerprint: 'cal:wrong' });
  assert.equal(hasRetainedBassEvidence(tampered), false);
  assert.equal(syntheticContractFromRetainedEvidence(tampered), null);
});

test('4 FROZEN REPORT AFTER CACHE EVICTION: P19 graph still renders from the immutable publication', () => {
  const evidence = resolveBassEvidenceForPublication(cacheRecordWithContract(), BASS_FP);
  const pub = publicationWith(evidence);
  // The bounded cache has since evicted the matching contract: rows carry no entry.
  const evictedRows = [{ completed_by_fingerprint: { 'cal:other': authoritativeContract() } }];
  const result = frozenReportBass(evictedRows, pub);
  assert.equal(result.authoritative, true);
  assert.equal(result.source, 'publication-retained');
  assert.ok(result.contract, 'contract reconstructed from retained evidence');
  assert.equal(result.contract.graphPayload, GRAPH_PAYLOAD);
});

test('5 CURVE IDENTITY: retained frequencies, post-EQ RSP response and correction curve match the original contract exactly', () => {
  const evidence = resolveBassEvidenceForPublication(cacheRecordWithContract(), BASS_FP);
  const pub = publicationWith(evidence);
  const synthetic = syntheticContractFromRetainedEvidence(pub);
  assert.deepEqual(synthetic.graphPayload.postEqRspCurve, POST_EQ);
  assert.deepEqual(synthetic.graphPayload.correctionCurve, CORRECTION);
  assert.equal(synthetic.assessmentEnvelope, ENVELOPE);
  assert.deepEqual(synthetic.bassResult.seatResults.P20, P20_SEATS);
  assert.equal(synthetic.selectedCandidateId, 'cand-1');
  assert.equal(synthetic.requestedP14TargetDb, 95);
  assert.equal(synthetic.job.resultFingerprint, BASS_FP);
  assert.equal(synthetic.fingerprints.calibration, 'cal:abc');
});

test('6 P19 RESULT: numeric P19 evidence (assessmentEnvelope) is preserved unchanged', () => {
  const evidence = resolveBassEvidenceForPublication(cacheRecordWithContract(), BASS_FP);
  assert.equal(evidence.assessmentEnvelope, ENVELOPE);
  assert.equal(evidence.assessmentEnvelope.officialP19WorstFrequencyHz, 31.5);
});

test('7 P20: numeric P20 seat results are preserved unchanged', () => {
  const evidence = resolveBassEvidenceForPublication(cacheRecordWithContract(), BASS_FP);
  assert.deepEqual(evidence.bassResultSeatResultsP20, P20_SEATS);
  const synthetic = syntheticContractFromRetainedEvidence(publicationWith(evidence));
  assert.deepEqual(synthetic.bassResult.seatResults.P20, P20_SEATS);
});

test('8 LEGACY PUBLICATION: no embedded graph + matching cache contract exists → fallback works', () => {
  const legacyPub = publicationWith(null); // pre-fix publication, no bass_evidence
  const rows = [cacheRecordWithContract()]; // matching contract still in the bounded map
  const result = frozenReportBass(rows, legacyPub);
  assert.equal(result.authoritative, true);
  assert.equal(result.source, 'legacy-cache');
  assert.ok(result.contract, 'legacy fallback contract resolved');
  assert.equal(result.contract.graphPayload, GRAPH_PAYLOAD);
});

test('9 LEGACY PUBLICATION WITH EVICTED GRAPH: honest unavailable state, no fabricated graph', () => {
  const legacyPub = publicationWith(null);
  const evictedRows = [{ completed_by_fingerprint: { 'cal:other': authoritativeContract() } }];
  const result = frozenReportBass(evictedRows, legacyPub);
  assert.equal(result.contract, null, 'no fabricated graph');
  assert.equal(result.authoritative, false);
  assert.equal(result.source, 'unavailable');
  assert.equal(result.authorityStatus, 'ERROR');
});

test('resolveBassEvidenceForPublication returns null when the graph payload is not usable', () => {
  const incomplete = authoritativeContract({ graphPayload: { postEqRspCurve: [], correctionCurve: [] } });
  assert.equal(resolveBassEvidenceForPublication(cacheRecordWithContract(incomplete), BASS_FP), null);
});

test('resolveBassEvidenceForPublication returns null when no matching contract exists', () => {
  const empty = { completed_by_fingerprint: {} };
  assert.equal(resolveBassEvidenceForPublication(empty, BASS_FP), null);
  assert.equal(resolveBassEvidenceForPublication(null, BASS_FP), null);
});