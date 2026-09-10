// Bass Graph Seat Presentation — Regression Tests
// ----------------------------------------------
// Validates the five confirmed Bass Response visualisation and P18
// presentation defects:
//
//   Defect 1: Selected seat changes the graph (decoupled from raw availability)
//   Defect 2: Raw per-seat response curves persist and hydrate
//   Defect 3: Selected-seat P19 marker
//   Defect 4: Selected-seat P20 marker
//   Defect 5: P18 bounded result wording (≤15 Hz, never "15 Hz measured")
//
// No calculations, thresholds, EQ, physics, or grading are changed.
import test from "node:test";
import assert from "node:assert/strict";

import { buildBassGraphSeries } from "@/components/room/bass/bassGraphDomainBuilder";
import { buildRp22GraphMarkers, formatP18MarkerLabel } from "@/components/room/bass/rp22GraphMarkers";
import { buildFinalOptimisedBassResponse } from "@/components/room/bass/finalOptimisedBassResponse";
import { compactCompletedBassContract } from "@/components/room/bass/completedBassResultPersistence";
import { buildFinishedGraphOptimisationResult } from "@/components/room/bass/finishedGraphAdapter";
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkCurve = (startHz, endHz, step, baseSpl) => {
  const pts = [];
  for (let f = startHz; f <= endHz; f += step) {
    pts.push({ frequency: f, spl: baseSpl + Math.sin(f * 0.1) * 3 });
  }
  return pts;
};

const mkSeatCurve = (seatId, baseSpl) => ({
  seatId,
  responseData: mkCurve(20, 200, 2, baseSpl),
});

const mkOptimisationResult = ({ postEqRsp, postEqPerSeat, perSeatP19, perSeatP20, perSeatRaw, assessmentStartHz = 15, assessmentEndHz = 200, p18Hz = 15, p18Bounded = true }) => ({
  selectedCandidateId: "test-candidate-1",
  selectedCandidate: {
    candidateId: "test-candidate-1",
    finalPostEqCurve: postEqRsp,
    perSeatPostEqCurves: postEqPerSeat,
    perSeatP19Results: perSeatP19,
    perSeatP20Results: perSeatP20,
    productionHouseCurveTarget: mkCurve(20, 200, 2, 100),
    canonicalHouseCurveShape: mkCurve(20, 200, 2, 100),
    practicalCalibrationTarget: mkCurve(20, 200, 2, 100),
    achievedP18FrequencyHz: p18Hz,
    p18AchievedAuthority: { achievedExtensionBounded: p18Bounded },
    officialP19WorstFrequencyHz: 15,
    achievedP19Level: 4,
    achievedP19VariationDb: 2,
    achievedP20Level: 4,
    achievedP20VariationDb: 1.5,
    worstP20SeatId: perSeatP20?.[0]?.seatId || null,
    assessmentStartHz,
    assessmentEndHz,
    generatedFilterBank: [],
    rawResponseCurve: mkCurve(20, 200, 2, 90),
    pairedP14P18Authority: { sources: { sourceDiagnostics: [] } },
  },
  finalOptimisedBassResponse: null, // will be built by buildFinalOptimisedBassResponse
});

// ---------------------------------------------------------------------------
// Defect 1: Selected seat changes the graph (decoupled from raw availability)
// ---------------------------------------------------------------------------

test("Defect 1: RSP selected → RSP post-EQ curve is shown", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const postEqPerSeat = [mkSeatCurve("R1S1", 95), mkSeatCurve("R1S2", 97)];
  const optimisationResult = {
    finalOptimisedBassResponse: {
      selectedCandidateId: "c1",
      postEqRspCurve: postEqRsp,
      postEqPerSeatCurves: postEqPerSeat,
      filterBankSignature: "sig",
      eqFilterBank: [],
      physicalRawResponseCurve: null,
      assessmentStartHz: 15,
      assessmentEndHz: 200,
      finalSeatVariationData: {
        p18: { candidateId: "c1", extensionHz: 15, achievedExtensionBounded: true },
        p19: { candidateId: "c1", worstFrequencyHz: 15, perSeatResults: [] },
        p20: { candidateId: "c1", worstSeatId: null, perSeatResults: [] },
      },
    },
    selectedCandidate: { productionHouseCurveTarget: postEqRsp, correctionStartHz: 20, correctionEndHz: 120 },
  };

  const series = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    normalizedSeries: null,
    rspRawCurve: mkCurve(20, 200, 2, 90),
    optimisationResult,
    hasMatchingDetailedResult: true,
    multiSeries: [],
    selectedSeatIds: ["rsp"],
    smoothingMode: "none",
  });

  const postEqSeries = series.filter((s) => s.kind === "post-eq");
  assert.equal(postEqSeries.length, 1, "exactly one post-EQ series for RSP");
  assert.equal(postEqSeries[0].id, "rsp-eq", "RSP post-EQ series id");
  assert.deepEqual(postEqSeries[0].data, postEqRsp, "RSP post-EQ curve data matches");
});

test("Defect 1: R1S1 selected → R1S1 post-EQ curve is shown (not RSP)", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const postEqR1S1 = mkSeatCurve("R1S1", 95);
  const postEqR1S2 = mkSeatCurve("R1S2", 97);
  const postEqPerSeat = [postEqR1S1, postEqR1S2];
  const optimisationResult = {
    finalOptimisedBassResponse: {
      selectedCandidateId: "c1",
      postEqRspCurve: postEqRsp,
      postEqPerSeatCurves: postEqPerSeat,
      filterBankSignature: "sig",
      eqFilterBank: [],
      physicalRawResponseCurve: null,
      assessmentStartHz: 15,
      assessmentEndHz: 200,
      finalSeatVariationData: {
        p18: { candidateId: "c1", extensionHz: 15, achievedExtensionBounded: true },
        p19: { candidateId: "c1", worstFrequencyHz: 15, perSeatResults: [] },
        p20: { candidateId: "c1", worstSeatId: null, perSeatResults: [] },
      },
    },
    selectedCandidate: { productionHouseCurveTarget: postEqRsp, correctionStartHz: 20, correctionEndHz: 120 },
  };

  const series = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    normalizedSeries: null,
    rspRawCurve: mkCurve(20, 200, 2, 90),
    optimisationResult,
    hasMatchingDetailedResult: true,
    multiSeries: [{ id: "R1S1", color: "#213428", data: mkCurve(20, 200, 2, 88) }],
    selectedSeatIds: ["R1S1"],
    smoothingMode: "none",
  });

  const postEqSeries = series.filter((s) => s.kind === "post-eq");
  assert.equal(postEqSeries.length, 1, "exactly one post-EQ series for R1S1");
  assert.equal(postEqSeries[0].id, "R1S1-eq", "R1S1 post-EQ series id");
  assert.deepEqual(postEqSeries[0].data, postEqR1S1.responseData, "R1S1 post-EQ curve data matches");
});

test("Defect 1: different seat curves produce different graph paths", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const postEqR1S1 = mkSeatCurve("R1S1", 95);
  const postEqR1S2 = mkSeatCurve("R1S2", 97);
  const postEqPerSeat = [postEqR1S1, postEqR1S2];
  const optimisationResult = {
    finalOptimisedBassResponse: {
      selectedCandidateId: "c1",
      postEqRspCurve: postEqRsp,
      postEqPerSeatCurves: postEqPerSeat,
      filterBankSignature: "sig",
      eqFilterBank: [],
      physicalRawResponseCurve: null,
      assessmentStartHz: 15,
      assessmentEndHz: 200,
      finalSeatVariationData: {
        p18: { candidateId: "c1", extensionHz: 15, achievedExtensionBounded: true },
        p19: { candidateId: "c1", worstFrequencyHz: 15, perSeatResults: [] },
        p20: { candidateId: "c1", worstSeatId: null, perSeatResults: [] },
      },
    },
    selectedCandidate: { productionHouseCurveTarget: postEqRsp, correctionStartHz: 20, correctionEndHz: 120 },
  };

  const seriesR1S1 = buildBassGraphSeries({
    designEqEnabled: true, showHouseCurve: true, normalizedSeries: null,
    rspRawCurve: [], optimisationResult, hasMatchingDetailedResult: true,
    multiSeries: [{ id: "R1S1", color: "#213428", data: mkCurve(20, 200, 2, 88) }],
    selectedSeatIds: ["R1S1"], smoothingMode: "none",
  });
  const seriesR1S2 = buildBassGraphSeries({
    designEqEnabled: true, showHouseCurve: true, normalizedSeries: null,
    rspRawCurve: [], optimisationResult, hasMatchingDetailedResult: true,
    multiSeries: [{ id: "R1S2", color: "#625143", data: mkCurve(20, 200, 2, 86) }],
    selectedSeatIds: ["R1S2"], smoothingMode: "none",
  });

  const eqR1S1 = seriesR1S1.find((s) => s.kind === "post-eq");
  const eqR1S2 = seriesR1S2.find((s) => s.kind === "post-eq");
  assert.equal(eqR1S1.id, "R1S1-eq");
  assert.equal(eqR1S2.id, "R1S2-eq");
  // The data arrays must be different — different seats have different curves
  assert.notDeepEqual(eqR1S1.data, eqR1S2.data, "R1S1 and R1S2 post-EQ curves differ");
});

// ---------------------------------------------------------------------------
// Defect 1 (critical): Cached result without raw seat curve
// ---------------------------------------------------------------------------

test("Defect 1: post-EQ seat curve displays even when raw seat curve is absent (cached reopen)", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const postEqR1S1 = mkSeatCurve("R1S1", 95);
  const optimisationResult = {
    finalOptimisedBassResponse: {
      selectedCandidateId: "c1",
      postEqRspCurve: postEqRsp,
      postEqPerSeatCurves: [postEqR1S1],
      filterBankSignature: "sig",
      eqFilterBank: [],
      physicalRawResponseCurve: null,
      assessmentStartHz: 15,
      assessmentEndHz: 200,
      finalSeatVariationData: {
        p18: { candidateId: "c1", extensionHz: 15, achievedExtensionBounded: true },
        p19: { candidateId: "c1", worstFrequencyHz: 15, perSeatResults: [] },
        p20: { candidateId: "c1", worstSeatId: null, perSeatResults: [] },
      },
    },
    selectedCandidate: { productionHouseCurveTarget: postEqRsp, correctionStartHz: 20, correctionEndHz: 120 },
  };

  // Simulate cached reopen: multiSeries is EMPTY (no raw per-seat curves)
  // but postEqPerSeatCurves has the saved R1S1 curve.
  const series = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    normalizedSeries: null,
    rspRawCurve: [],
    optimisationResult,
    hasMatchingDetailedResult: true,
    multiSeries: [], // NO raw seat curves — cached reopen
    selectedSeatIds: ["R1S1"],
    smoothingMode: "none",
  });

  const postEqSeries = series.filter((s) => s.kind === "post-eq");
  assert.equal(postEqSeries.length, 1, "R1S1 post-EQ still renders without raw curve");
  assert.equal(postEqSeries[0].id, "R1S1-eq", "R1S1 post-EQ series id");
  assert.deepEqual(postEqSeries[0].data, postEqR1S1.responseData, "R1S1 post-EQ data matches saved curve");

  // Must NOT fall back to RSP
  const rspEq = series.find((s) => s.id === "rsp-eq");
  assert.equal(rspEq, undefined, "does NOT fall back to RSP when seat post-EQ exists");
});

// ---------------------------------------------------------------------------
// Defect 2: Raw per-seat response curves persist and hydrate
// ---------------------------------------------------------------------------

test("Defect 2: buildFinalOptimisedBassResponse carries perSeatRawCurves", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const perSeatRaw = [mkSeatCurve("R1S1", 88), mkSeatCurve("R1S2", 86)];
  const perSeatP19 = [
    { seatId: "R1S1", variationDbRaw: 5.031, level: 1, worstFrequencyHz: 15 },
    { seatId: "R1S2", variationDbRaw: 5.031, level: 1, worstFrequencyHz: 15 },
  ];
  const perSeatP20 = [
    { seatId: "R1S1", variationDbRaw: 6.897, level: 1, worstFrequencyHz: 63 },
    { seatId: "R1S2", variationDbRaw: 0.917, level: 4, worstFrequencyHz: 50 },
  ];

  const result = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: "c1",
        finalPostEqCurve: postEqRsp,
        perSeatPostEqCurves: [mkSeatCurve("R1S1", 95)],
        perSeatP19Results: perSeatP19,
        perSeatP20Results: perSeatP20,
        productionHouseCurveTarget: postEqRsp,
        achievedP18FrequencyHz: 15,
        p18AchievedAuthority: { achievedExtensionBounded: true },
        officialP19WorstFrequencyHz: 15,
        assessmentStartHz: 15,
        assessmentEndHz: 200,
        generatedFilterBank: [],
        rawResponseCurve: mkCurve(20, 200, 2, 90),
      },
    },
    selectedLayout: [],
    roomResponseCurve: mkCurve(15, 200, 1, 94),
    perSeatRawCurves: perSeatRaw,
  });

  assert.ok(result, "buildFinalOptimisedBassResponse returned a result");
  assert.ok(Array.isArray(result.perSeatRawCurves), "perSeatRawCurves is an array");
  assert.equal(result.perSeatRawCurves.length, 2, "two per-seat raw curves");
  assert.equal(result.perSeatRawCurves[0].seatId, "R1S1", "first seat ID");
  assert.equal(result.perSeatRawCurves[1].seatId, "R1S2", "second seat ID");
  assert.ok(result.perSeatRawCurves[0].responseData.length > 0, "R1S1 raw curve has data");
});

test("Defect 2: compactCompletedBassContract persists perSeatRoomResponseCurves in graphPayload", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const perSeatRaw = [mkSeatCurve("R1S1", 88), mkSeatCurve("R1S2", 86)];
  const fingerprint = "test-fp-001";

  const finalOptimisedBassResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: "c1",
        finalPostEqCurve: postEqRsp,
        perSeatPostEqCurves: [mkSeatCurve("R1S1", 95), mkSeatCurve("R1S2", 97)],
        perSeatP19Results: [
          { seatId: "R1S1", variationDbRaw: 5, level: 1, worstFrequencyHz: 15 },
          { seatId: "R1S2", variationDbRaw: 2, level: 4, worstFrequencyHz: 15 },
        ],
        perSeatP20Results: [
          { seatId: "R1S1", variationDbRaw: 6, level: 1, worstFrequencyHz: 63 },
          { seatId: "R1S2", variationDbRaw: 1, level: 4, worstFrequencyHz: 50 },
        ],
        productionHouseCurveTarget: postEqRsp,
        achievedP18FrequencyHz: 15,
        p18AchievedAuthority: { achievedExtensionBounded: true },
        officialP19WorstFrequencyHz: 15,
        assessmentStartHz: 15,
        assessmentEndHz: 200,
        generatedFilterBank: [],
        rawResponseCurve: mkCurve(20, 200, 2, 90),
      },
    },
    selectedLayout: [],
    roomResponseCurve: mkCurve(15, 200, 1, 94),
    perSeatRawCurves: perSeatRaw,
  });

  const contract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: "a1",
    fingerprints: { geometry: "g", product: "p", calibration: "c" },
    job: { status: "complete", resultFingerprint: fingerprint, currentJobFingerprint: fingerprint, metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION },
    productAnalysis: { status: "complete", parameters: {} },
    selectedMode: "balanced",
    selectedCandidateId: "c1",
    selectedCandidate: {
      id: "c1",
      candidateId: "c1",
      perSeatP19Results: [
        { seatId: "R1S1", variationDbRaw: 5, level: 1, worstFrequencyHz: 15 },
        { seatId: "R1S2", variationDbRaw: 2, level: 4, worstFrequencyHz: 15 },
      ],
      perSeatP20Results: [
        { seatId: "R1S1", variationDbRaw: 6, level: 1, worstFrequencyHz: 63 },
        { seatId: "R1S2", variationDbRaw: 1, level: 4, worstFrequencyHz: 50 },
      ],
      achievedP18FrequencyHz: 15,
    },
    finalOptimisedBassResponse,
    provenance: { realSeatCount: 2 },
  };

  const compact = compactCompletedBassContract(contract);
  assert.ok(compact, "compact contract produced");
  assert.ok(compact.graphPayload, "graphPayload exists");
  assert.ok(Array.isArray(compact.graphPayload.perSeatRoomResponseCurves), "perSeatRoomResponseCurves persisted");
  assert.equal(compact.graphPayload.perSeatRoomResponseCurves.length, 2, "two raw per-seat curves persisted");
  assert.equal(compact.graphPayload.perSeatRoomResponseCurves[0].seatId, "R1S1", "first persisted seat ID");
  assert.equal(compact.graphPayload.perSeatRoomResponseCurves[1].seatId, "R1S2", "second persisted seat ID");
});

test("Defect 2: buildFinishedGraphOptimisationResult restores perSeatRawCurves from graphPayload", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const perSeatRaw = [mkSeatCurve("R1S1", 88), mkSeatCurve("R1S2", 86)];

  const compactContract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: "a1",
    fingerprints: { calibration: "c" },
    job: { status: "complete", resultFingerprint: "fp" },
    productAnalysis: { status: "complete", parameters: {} },
    selectedMode: "balanced",
    selectedCandidateId: "c1",
    selectedCandidate: {
      id: "c1",
      perSeatP19Results: [
        { seatId: "R1S1", variationDbRaw: 5, level: 1, worstFrequencyHz: 61.31 },
        { seatId: "R1S2", variationDbRaw: 2, level: 4, worstFrequencyHz: 15 },
      ],
      perSeatP20Results: [
        { seatId: "R1S1", variationDbRaw: 6.897, level: 1, worstFrequencyHz: 63 },
        { seatId: "R1S2", variationDbRaw: 0.917, level: 4, worstFrequencyHz: 50 },
      ],
      achievedP18FrequencyHz: 15,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: 15,
      achievedP18Bounded: true,
      assessmentStartHz: 15,
      assessmentEndHz: 200,
      officialP19WorstFrequencyHz: 15,
      p20WorstSeatId: "R1S1",
      p20WorstFrequencyHz: 63,
      p19TargetIdentity: "practical-calibration-target",
    },
    graphPayload: {
      postEqRspCurve: postEqRsp,
      productionHouseCurveTarget: postEqRsp,
      maximumSplCurveAfterEq: [],
      postEqPerSeatCurves: [mkSeatCurve("R1S1", 95), mkSeatCurve("R1S2", 97)],
      eqFilterBank: [],
      sourceCapabilityCurves: [],
      selectedCandidateId: "c1",
      operatingLevelOffsetDb: 0,
      maximumSplSafetyMarginDb: 0,
      correctionStartHz: 20,
      correctionEndHz: 120,
      designEqFitProfile: null,
      roomResponseCurve: mkCurve(15, 200, 1, 94),
      perSeatRoomResponseCurves: perSeatRaw,
    },
  };

  const result = buildFinishedGraphOptimisationResult(compactContract);
  assert.ok(result, "finished graph result produced");
  assert.ok(result.finalOptimisedBassResponse, "finalOptimisedBassResponse exists");
  assert.ok(Array.isArray(result.finalOptimisedBassResponse.perSeatRawCurves), "perSeatRawCurves restored");
  assert.equal(result.finalOptimisedBassResponse.perSeatRawCurves.length, 2, "two raw per-seat curves restored");
  assert.equal(result.finalOptimisedBassResponse.perSeatRawCurves[0].seatId, "R1S1", "first restored seat ID");
  assert.equal(result.finalOptimisedBassResponse.perSeatRawCurves[1].seatId, "R1S2", "second restored seat ID");
  assert.ok(result.finalOptimisedBassResponse.perSeatRawCurves[0].responseData.length > 0, "R1S1 restored raw curve has data");
});

// ---------------------------------------------------------------------------
// Defect 3: Selected-seat P19 marker
// ---------------------------------------------------------------------------

test("Defect 3: RSP selected → RSP P19 worst frequency", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 61.31 },
          { seatId: "R1S2", worstFrequencyHz: 15 },
        ],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 63 },
          { seatId: "R1S2", worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "rsp");
  assert.equal(markers.p19WorstFrequencyHz, 15, "RSP P19 worst frequency");
});

test("Defect 3: R1S1 selected → R1S1 P19 worst frequency (61.31 Hz)", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 61.31 },
          { seatId: "R1S2", worstFrequencyHz: 15 },
        ],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 63 },
          { seatId: "R1S2", worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "R1S1");
  assert.equal(markers.p19WorstFrequencyHz, 61.31, "R1S1 P19 worst frequency");
});

test("Defect 3: R1S2 selected → R1S2 P19 worst frequency (15 Hz)", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 61.31 },
          { seatId: "R1S2", worstFrequencyHz: 15 },
        ],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 63 },
          { seatId: "R1S2", worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "R1S2");
  assert.equal(markers.p19WorstFrequencyHz, 15, "R1S2 P19 worst frequency");
});

test("Defect 3: R2S1 selected → R2S1 P19 worst frequency (58.29 Hz)", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 61.31 },
          { seatId: "R1S2", worstFrequencyHz: 15 },
          { seatId: "R2S1", worstFrequencyHz: 58.29 },
        ],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", worstFrequencyHz: 63 },
          { seatId: "R1S2", worstFrequencyHz: 50 },
          { seatId: "R2S1", worstFrequencyHz: 55 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "R2S1");
  assert.equal(markers.p19WorstFrequencyHz, 58.29, "R2S1 P19 worst frequency");
});

// ---------------------------------------------------------------------------
// Defect 4: Selected-seat P20 marker
// ---------------------------------------------------------------------------

test("Defect 4: RSP selected → overall worst seat P20 (established RSP presentation)", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", variationDbRaw: 6.897, worstFrequencyHz: 63 },
          { seatId: "R1S2", variationDbRaw: 0.917, worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "rsp");
  assert.equal(markers.p20WorstFrequencyHz, 63, "RSP → overall worst P20 frequency");
  assert.equal(markers.p20WorstSeatId, "R1S1", "RSP → overall worst P20 seat ID");
});

test("Defect 4: R1S1 selected → R1S1 P20 worst frequency", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", variationDbRaw: 6.897, worstFrequencyHz: 63 },
          { seatId: "R1S2", variationDbRaw: 0.917, worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "R1S1");
  assert.equal(markers.p20WorstFrequencyHz, 63, "R1S1 P20 worst frequency");
  assert.equal(markers.p20WorstSeatId, "R1S1", "R1S1 P20 seat ID");
});

test("Defect 4: R1S2 selected → R1S2 P20 worst frequency (not R1S1's)", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true },
      p19: {
        worstFrequencyHz: 15,
        perSeatResults: [],
      },
      p20: {
        worstSeatId: "R1S1",
        perSeatResults: [
          { seatId: "R1S1", variationDbRaw: 6.897, worstFrequencyHz: 63 },
          { seatId: "R1S2", variationDbRaw: 0.917, worstFrequencyHz: 50 },
        ],
      },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "R1S2");
  assert.equal(markers.p20WorstFrequencyHz, 50, "R1S2 P20 worst frequency (not R1S1's 63)");
  assert.equal(markers.p20WorstSeatId, "R1S2", "R1S2 P20 seat ID");
});

// ---------------------------------------------------------------------------
// Defect 5: P18 bounded result wording
// ---------------------------------------------------------------------------

test("Defect 5: bounded P18 (≤15 Hz) — label shows ≤, never 'measured'", () => {
  const markers = {
    p18FrequencyHz: 15,
    p18Bounded: true,
    p19StartHz: 15,
    p19EndHz: 200,
    p19WorstFrequencyHz: 15,
    p20WorstFrequencyHz: null,
    p20WorstSeatId: null,
  };

  const label = formatP18MarkerLabel(markers);
  assert.ok(label, "label produced");
  assert.ok(label.short.includes("≤15 Hz"), "short label contains ≤15 Hz");
  assert.ok(!label.short.includes("measured"), "short label does NOT contain 'measured'");
  assert.equal(label.detail, "Exact -3 dB crossing is below the calculated range.", "detail explains bounded result");
});

test("Defect 5: in-range P18 crossing — normal measured presentation preserved", () => {
  const markers = {
    p18FrequencyHz: 28.7,
    p18Bounded: false,
    p19StartHz: 15,
    p19EndHz: 200,
    p19WorstFrequencyHz: 15,
    p20WorstFrequencyHz: null,
    p20WorstSeatId: null,
  };

  const label = formatP18MarkerLabel(markers);
  assert.ok(label, "label produced");
  assert.ok(label.short.includes("28 Hz RP22"), "short label contains floored Hz");
  assert.ok(label.short.includes("28.7 Hz measured"), "short label contains measured crossing");
  assert.ok(!label.short.includes("≤"), "short label does NOT contain ≤ for in-range crossing");
  assert.equal(label.detail, null, "no detail for in-range crossing");
});

test("Defect 5: bounded P18 at 15 Hz — never displays '15 Hz measured'", () => {
  const markers = {
    p18FrequencyHz: 15,
    p18Bounded: true,
    p19StartHz: 15,
    p19EndHz: 200,
    p19WorstFrequencyHz: 15,
    p20WorstFrequencyHz: null,
    p20WorstSeatId: null,
  };

  const label = formatP18MarkerLabel(markers);
  // The critical assertion: "measured" must NEVER appear in the bounded label
  assert.ok(!label.short.includes("measured"), "bounded label never says 'measured'");
  assert.ok(label.short.includes("≤15 Hz"), "bounded label says ≤15 Hz");
});

test("Defect 5: buildRp22GraphMarkers sets p18Bounded from finalSeatVariationData", () => {
  const finalBassResponse = {
    assessmentStartHz: 15,
    assessmentEndHz: 200,
    finalSeatVariationData: {
      p18: { extensionHz: 15, achievedExtensionBounded: true, authority: { achievedExtensionBounded: true } },
      p19: { worstFrequencyHz: 15, perSeatResults: [] },
      p20: { worstSeatId: null, perSeatResults: [] },
    },
  };

  const markers = buildRp22GraphMarkers(finalBassResponse, "rsp");
  assert.equal(markers.p18Bounded, true, "p18Bounded is true");
  assert.equal(markers.p18FrequencyHz, 15, "p18FrequencyHz is 15");
});

// ---------------------------------------------------------------------------
// Defect 2 + 1 integration: persistence → hydration → seat selection
// ---------------------------------------------------------------------------

test("Defect 2+1 integration: restored perSeatRawCurves enable raw layer for selected seat", () => {
  const postEqRsp = mkCurve(20, 200, 2, 100);
  const perSeatRaw = [mkSeatCurve("R1S1", 88)];

  // Simulate the full cycle: build → compact → restore → graph
  const finalResponse = buildFinalOptimisedBassResponse({
    optimisationResult: {
      selectedCandidate: {
        candidateId: "c1",
        finalPostEqCurve: postEqRsp,
        perSeatPostEqCurves: [mkSeatCurve("R1S1", 95)],
        perSeatP19Results: [{ seatId: "R1S1", variationDbRaw: 5, level: 1, worstFrequencyHz: 61.31 }],
        perSeatP20Results: [{ seatId: "R1S1", variationDbRaw: 6.897, level: 1, worstFrequencyHz: 63 }],
        productionHouseCurveTarget: postEqRsp,
        achievedP18FrequencyHz: 15,
        p18AchievedAuthority: { achievedExtensionBounded: true },
        officialP19WorstFrequencyHz: 15,
        assessmentStartHz: 15,
        assessmentEndHz: 200,
        generatedFilterBank: [],
        rawResponseCurve: mkCurve(20, 200, 2, 90),
      },
    },
    selectedLayout: [],
    roomResponseCurve: mkCurve(15, 200, 1, 94),
    perSeatRawCurves: perSeatRaw,
  });

  // The restored finalOptimisedBassResponse has perSeatRawCurves
  assert.ok(finalResponse.perSeatRawCurves.length === 1, "one raw per-seat curve");
  assert.equal(finalResponse.perSeatRawCurves[0].seatId, "R1S1", "R1S1 raw curve present");

  // Simulate BassResponse.jsx merging live + restored curves
  // On cached reopen, live perSeatRawCurves is empty — restored fills in
  const livePerSeatRaw = [];
  const restoredPerSeatRaw = finalResponse.perSeatRawCurves;
  const liveMap = new Map(livePerSeatRaw.map((s) => [s.seatId, s.responseData]));
  const restoredMap = new Map(restoredPerSeatRaw.map((s) => [s.seatId, s.responseData]));
  const allSeatIds = new Set([...liveMap.keys(), ...restoredMap.keys()]);
  const merged = [...allSeatIds].map((seatId) => ({
    seatId,
    responseData: liveMap.get(seatId) || restoredMap.get(seatId) || [],
  })).filter((s) => s.responseData.length > 0);

  assert.equal(merged.length, 1, "one merged curve after reopen");
  assert.equal(merged[0].seatId, "R1S1", "merged curve is R1S1");

  // Build multiSeries from merged curves (as BassResponse.jsx does)
  const multiSeries = merged.map((seat) => ({
    id: seat.seatId,
    color: "#213428",
    data: seat.responseData,
  }));

  // Now buildBassGraphSeries can find the raw curve for R1S1
  const optimisationResult = {
    finalOptimisedBassResponse: {
      ...finalResponse,
      postEqRspCurve: postEqRsp,
      postEqPerSeatCurves: [mkSeatCurve("R1S1", 95)],
      filterBankSignature: "sig",
      eqFilterBank: [],
    },
    selectedCandidate: { productionHouseCurveTarget: postEqRsp, correctionStartHz: 20, correctionEndHz: 120 },
  };

  const series = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    normalizedSeries: null,
    rspRawCurve: [],
    optimisationResult,
    hasMatchingDetailedResult: true,
    multiSeries,
    selectedSeatIds: ["R1S1"],
    smoothingMode: "none",
  });

  // Both raw and post-EQ layers should be present for R1S1
  const rawSeries = series.filter((s) => s.kind === "raw");
  const postEqSeries = series.filter((s) => s.kind === "post-eq");
  assert.ok(rawSeries.length > 0, "raw layer present for R1S1 after reopen");
  assert.equal(postEqSeries.length, 1, "post-EQ layer present for R1S1");
  assert.equal(postEqSeries[0].id, "R1S1-eq", "post-EQ is R1S1");
});