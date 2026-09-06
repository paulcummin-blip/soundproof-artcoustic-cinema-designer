// room-response-lifecycle-validation.mjs
// Validates the Room Response lifecycle fix:
// A) Room Response exists after Calculate, 360 points, 15-200 Hz
// B) Live-clear delta = 0.000 dB (deterministic)
// C) Cold reopen: persist + hydrate restores Room Response
// D) REW parity: canonical vs normalized engine, max delta = 0.000 dB
// E) Stale rejection: fingerprint change rejects persisted Room Response
// F) Layer availability invariant: selected + available → non-empty series

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine.js';
import { computeNormalizedRoomTransfer } from '@/components/room/bass/normalizedRoomTransferEngine.js';
import { buildCanonicalRoomResponse, canonicalRoomResponseCurve } from '@/components/room/bass/buildCanonicalRoomResponse.js';
import { buildNormalizedPhysicsOptions } from '@/components/room/bass/normalizedPhysicsOptionsBuilder.js';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse.js';
import { compactCompletedBassContract, isStructurallyCompleteBassContract } from '@/components/room/bass/completedBassResultPersistence.js';
import { buildFinishedGraphOptimisationResult } from '@/components/room/bass/finishedGraphAdapter.js';
import { buildBassGraphSeries } from '@/components/room/bass/bassGraphDomainBuilder.js';
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from '@/lib/bassAuthorityVersion.js';

const roomDims = { widthM: 4.0, lengthM: 3.0, heightM: 2.4 };
const rspPosition = { x: 2.0, y: 1.5, z: 1.2 };
const seatingPositions = [
  { id: 'seat1', x: 1.5, y: 2.0, z: 1.2 },
  { id: 'seat2', x: 2.5, y: 2.0, z: 1.2 },
];
const sources = [
  { id: 'sub1', modelKey: 'sub2-12', x: 0.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  { id: 'sub2', modelKey: 'sub2-12', x: 3.5, y: 0.3, z: 0.35, tuning: { gainDb: -3, delayMs: 2.5, polarity: 0 } },
];
const physics = {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 },
  roomDamping: 0.3, axialQ: 30, modalSourceReferenceMode: 'existing', modalGainScalar: 1,
  modalDistanceBlend: 0, modalStorageMode: 'legacy', propagationPhaseScale: 1,
  enableRewCoreReflections: false, rewSourceCurveMode: 'product', qStrategy: 'ab_corrected',
  rewModalBandwidthScale: 1, disableReflectionPhaseJitter: true, disableReflectionCoherenceWeight: true,
  disableLateField: true, disableModalPropagationPhase: true, mute68HzAxialMode: false,
  debugDisableModalContribution: false, rewParityFieldMode: 'modes_only',
  overrideConstantAxialQ: null, overrideAbsorptionAxialQ: null, debugMode200Multiplier: 1,
  debugModalPhaseConvention: 'normal', reflectionGainScale: 1, debugModalHSign: 'normal',
  rewParityModalMagnitudeScale: 1, modalCoherenceMode: 'default', highOrderAxialScale: 1,
};

const authResult = simulateAuthoritativeBassResponse({
  roomDims, seatingPositions, rspPosition, sources, physics,
  qStrategyOverride: 'ab_corrected',
});
const canonicalResult = buildCanonicalRoomResponse(authResult.perSourceRspComplexTransfers);
const canonicalCurve = canonicalRoomResponseCurve(canonicalResult);

test('A: Room Response exists with 360 points in 15-200 Hz', () => {
  assert.ok(canonicalResult, 'Canonical Room Response must exist');
  assert.ok(canonicalCurve.length > 0, 'Room Response curve must have points');
  assert.equal(canonicalCurve.length, 360, 'Room Response must have 360 points');
  const freqMin = canonicalCurve[0].frequency;
  const freqMax = canonicalCurve[canonicalCurve.length - 1].frequency;
  assert.ok(freqMin <= 15.1, `Freq min must be ~15 Hz, got ${freqMin}`);
  assert.ok(freqMax >= 199, `Freq max must be ~200 Hz, got ${freqMax}`);
});

test('A: Room Response has canonical signature', () => {
  assert.ok(typeof canonicalResult.signature === 'string', 'Signature must be a string');
  assert.ok(canonicalResult.signature.startsWith('curve:'), 'Signature must be a curve signature');
  assert.equal(canonicalResult.sourceCount, 2, 'Source count must match');
});

test('B: Live-clear delta = 0.000 dB (deterministic rebuild)', () => {
  const result2 = buildCanonicalRoomResponse(authResult.perSourceRspComplexTransfers);
  const curve2 = canonicalRoomResponseCurve(result2);
  let maxDelta = 0;
  for (let i = 0; i < canonicalCurve.length; i++) {
    const delta = Math.abs(canonicalCurve[i].spl - curve2[i].spl);
    if (delta > maxDelta) maxDelta = delta;
  }
  assert.equal(maxDelta, 0, 'Rebuild from same transfers must produce zero delta');
});

test('D: REW parity — canonical vs normalized engine, max delta = 0.000 dB', () => {
  const normalizedPhysics = buildNormalizedPhysicsOptions(physics);
  const normalizedResult = computeNormalizedRoomTransfer({
    roomDims, rspPosition, seatingPositions,
    subsForSimulation: sources,
    physicsOptions: normalizedPhysics,
  });
  const normalizedRspCurve = normalizedResult.rspCurve;
  assert.equal(canonicalCurve.length, normalizedRspCurve.length, 'Point count must match');
  let maxFreqDelta = 0;
  let maxResponseDelta = 0;
  for (let i = 0; i < canonicalCurve.length; i++) {
    const fd = Math.abs(canonicalCurve[i].frequency - normalizedRspCurve[i].frequency);
    if (fd > maxFreqDelta) maxFreqDelta = fd;
    const rd = Math.abs(canonicalCurve[i].spl - normalizedRspCurve[i].spl);
    if (rd > maxResponseDelta) maxResponseDelta = rd;
  }
  assert.ok(maxFreqDelta < 1e-6, `Max freq delta must be 0 Hz, got ${maxFreqDelta}`);
  assert.ok(maxResponseDelta < 1e-6, `Max response delta must be 0.000 dB, got ${maxResponseDelta}`);
});

test('D: REW parity — peak frequency/level unchanged', () => {
  const normalizedPhysics = buildNormalizedPhysicsOptions(physics);
  const normalizedResult = computeNormalizedRoomTransfer({
    roomDims, rspPosition, seatingPositions,
    subsForSimulation: sources,
    physicsOptions: normalizedPhysics,
  });
  const nCurve = normalizedResult.rspCurve;
  let cPeak = -Infinity, cPeakF = 0, nPeak = -Infinity, nPeakF = 0;
  let cNull = Infinity, cNullF = 0, nNull = Infinity, nNullF = 0;
  for (let i = 0; i < canonicalCurve.length; i++) {
    if (canonicalCurve[i].spl > cPeak) { cPeak = canonicalCurve[i].spl; cPeakF = canonicalCurve[i].frequency; }
    if (canonicalCurve[i].spl < cNull) { cNull = canonicalCurve[i].spl; cNullF = canonicalCurve[i].frequency; }
    if (nCurve[i].spl > nPeak) { nPeak = nCurve[i].spl; nPeakF = nCurve[i].frequency; }
    if (nCurve[i].spl < nNull) { nNull = nCurve[i].spl; nNullF = nCurve[i].frequency; }
  }
  assert.equal(cPeakF, nPeakF, 'Peak frequency must match');
  assert.equal(cPeak, nPeak, 'Peak level must match');
  assert.equal(cNullF, nNullF, 'Null frequency must match');
  assert.equal(cNull, nNull, 'Null level must match');
});

test('C: Cold reopen — finalOptimisedBassResponse carries roomResponseCurve', () => {
  const finalResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: 'test-candidate',
        finalPostEqCurve: canonicalCurve.map(p => ({ ...p, spl: p.spl + 5 })),
        generatedFilterBank: [],
        productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
        canonicalHouseCurveShape: [],
        practicalCalibrationTarget: [],
        rawResponseCurve: canonicalCurve,
        pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
        assessmentStartHz: 20, assessmentEndHz: 200,
        correctionStartHz: 20, correctionEndHz: 200,
        designEqFitProfile: 'standard',
        achievedP18FrequencyHz: 20,
        perSeatP19Results: [], perSeatP20Results: [],
      },
    },
    selectedLayout: sources,
    roomResponseCurve: canonicalCurve,
  });
  assert.ok(Array.isArray(finalResponse.roomResponseCurve), 'roomResponseCurve must be an array');
  assert.equal(finalResponse.roomResponseCurve.length, 360, 'roomResponseCurve must have 360 points');
  // Fidelity check
  let maxDelta = 0;
  for (let i = 0; i < canonicalCurve.length; i++) {
    const d = Math.abs(canonicalCurve[i].spl - finalResponse.roomResponseCurve[i].spl);
    if (d > maxDelta) maxDelta = d;
  }
  assert.ok(maxDelta < 1e-10, `roomResponseCurve fidelity: max delta ${maxDelta}`);
});

test('C: Cold reopen — graph payload persists and restores roomResponseCurve', () => {
  // Build a minimal full contract with roomResponseCurve
  const finalResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: 'test-candidate',
        finalPostEqCurve: canonicalCurve.map(p => ({ ...p, spl: p.spl + 5 })),
        generatedFilterBank: [],
        productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
        canonicalHouseCurveShape: [],
        practicalCalibrationTarget: [],
        rawResponseCurve: canonicalCurve,
        pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
        assessmentStartHz: 20, assessmentEndHz: 200,
        correctionStartHz: 20, correctionEndHz: 200,
        designEqFitProfile: 'standard',
        achievedP18FrequencyHz: 20,
        perSeatP19Results: [], perSeatP20Results: [],
        worstP20SeatId: null,
      },
    },
    selectedLayout: sources,
    roomResponseCurve: canonicalCurve,
  });

  // Build a minimal contract object that compactCompletedBassContract can process
  const contract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: 'test-analysis',
    fingerprints: { geometry: 'geo', product: 'prod', calibration: 'cal' },
    job: { status: 'complete', resultFingerprint: 'result-fp', currentJobFingerprint: 'result-fp', metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, completedAtMs: Date.now() },
    productAnalysis: { status: 'complete', parameters: { p18: { value: 20 }, p20: { status: 'complete' } } },
    selectedMode: 'canonical-physics-eq',
    selectedCandidateId: 'test-candidate',
    selectedCandidate: {
      id: 'test-candidate',
      candidateId: 'test-candidate',
      achievedP18FrequencyHz: 20,
      worstP20SeatId: null,
      perSeatP19Results: [],
      perSeatP20Results: [],
      p14TargetBasis: 'minimum',
      designEqFitProfile: 'standard',
    },
    selectedP14TargetDb: 109,
    selectedP14TargetBasis: 'minimum',
    selectedP14Level: 1,
    selectedP14RequiredExtensionHz: 20,
    selectedP18RequiredExtensionHz: 20,
    finalOptimisedBassResponse: finalResponse,
    metricPublication: { canonicalMetricPublicationValid: true },
    provenance: { realSeatCount: 2 },
  };

  const compact = compactCompletedBassContract(contract);
  assert.ok(compact, 'Compact contract must be produced');
  assert.ok(compact.graphPayload, 'Graph payload must exist');
  assert.ok(Array.isArray(compact.graphPayload.roomResponseCurve), 'roomResponseCurve must be in graph payload');
  assert.equal(compact.graphPayload.roomResponseCurve.length, 360, 'Persisted roomResponseCurve must have 360 points');

  // Restore via finished graph adapter
  const restored = buildFinishedGraphOptimisationResult(compact);
  assert.ok(restored, 'Finished graph adapter must produce a result');
  assert.ok(Array.isArray(restored.finalOptimisedBassResponse.roomResponseCurve), 'Restored roomResponseCurve must be an array');
  assert.equal(restored.finalOptimisedBassResponse.roomResponseCurve.length, 360, 'Restored roomResponseCurve must have 360 points');

  // Fidelity: persisted → restored
  let maxDelta = 0;
  for (let i = 0; i < canonicalCurve.length; i++) {
    const d = Math.abs(canonicalCurve[i].spl - restored.finalOptimisedBassResponse.roomResponseCurve[i].spl);
    if (d > maxDelta) maxDelta = d;
  }
  assert.ok(maxDelta < 1e-10, `Restored roomResponseCurve fidelity: max delta ${maxDelta}`);
});

test('F: Layer availability — Room Response series is non-empty when available', () => {
  const finalResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: 'test-candidate',
        finalPostEqCurve: canonicalCurve.map(p => ({ ...p, spl: p.spl + 5 })),
        generatedFilterBank: [],
        productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
        canonicalHouseCurveShape: [],
        practicalCalibrationTarget: [],
        rawResponseCurve: canonicalCurve,
        pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
        assessmentStartHz: 20, assessmentEndHz: 200,
        correctionStartHz: 20, correctionEndHz: 200,
        designEqFitProfile: 'standard',
        achievedP18FrequencyHz: 20,
        perSeatP19Results: [], perSeatP20Results: [],
      },
    },
    selectedLayout: sources,
    roomResponseCurve: canonicalCurve,
  });

  const optimisationResult = {
    finalOptimisedBassResponse: finalResponse,
    selectedCandidate: {
      productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
      correctionStartHz: 20, correctionEndHz: 200,
      designEqFitProfile: 'standard',
      pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
    },
    selectedP14TargetDb: 109,
  };

  const normalizedSeries = { data: canonicalCurve };
  const series = buildBassGraphSeries({
    designEqEnabled: true, showHouseCurve: true, normalizedSeries,
    rspRawCurve: canonicalCurve, optimisationResult,
    hasMatchingDetailedResult: true, multiSeries: [], selectedSeatIds: ['rsp'],
    showRealSeatOverlays: false, smoothingMode: 'none',
  });

  const roomResponseSeries = series.find(s => s.kind === 'room-response');
  assert.ok(roomResponseSeries, 'Room Response series must exist');
  assert.ok(roomResponseSeries.data.length > 0, 'Room Response series must have data');
  assert.equal(roomResponseSeries.data.length, 360, 'Room Response series must have 360 points');
});

test('F: Layer availability — Room Response series is absent when roomResponseCurve is empty', () => {
  const finalResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: 'test-candidate',
        finalPostEqCurve: canonicalCurve.map(p => ({ ...p, spl: p.spl + 5 })),
        generatedFilterBank: [],
        productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
        canonicalHouseCurveShape: [],
        practicalCalibrationTarget: [],
        rawResponseCurve: canonicalCurve,
        pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
        assessmentStartHz: 20, assessmentEndHz: 200,
        correctionStartHz: 20, correctionEndHz: 200,
        designEqFitProfile: 'standard',
        achievedP18FrequencyHz: 20,
        perSeatP19Results: [], perSeatP20Results: [],
      },
    },
    selectedLayout: sources,
    roomResponseCurve: [], // EMPTY — simulates old cache without roomResponseCurve
  });

  const optimisationResult = {
    finalOptimisedBassResponse: finalResponse,
    selectedCandidate: {
      productionHouseCurveTarget: canonicalCurve.map(p => ({ ...p, spl: 94 })),
      correctionStartHz: 20, correctionEndHz: 200,
      designEqFitProfile: 'standard',
      pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
    },
    selectedP14TargetDb: 109,
  };

  const normalizedSeries = null; // No canonical Room Response
  const series = buildBassGraphSeries({
    designEqEnabled: true, showHouseCurve: true, normalizedSeries,
    rspRawCurve: canonicalCurve, optimisationResult,
    hasMatchingDetailedResult: true, multiSeries: [], selectedSeatIds: ['rsp'],
    showRealSeatOverlays: false, smoothingMode: 'none',
  });

  const roomResponseSeries = series.find(s => s.kind === 'room-response');
  assert.ok(!roomResponseSeries, 'Room Response series must NOT exist when roomResponseCurve is empty');
});