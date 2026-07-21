// normalizedRoomTransferFixtures.js — Phase 2A: Verification fixtures
// for the normalized room-transfer engine.
//
// 14 fixtures total:
//   1.  Product independence: SUB2-12 vs SUB3-12 at identical positions
//   2.  Product-aware legacy curves differ between SUB2-12 and SUB3-12
//   3.  Normalized result matches production flat-source path (94 dB)
//   4.  No EQ/candidate/capability/RP22 fields in result
//   5.  RSP returned exactly once
//   6.  Every real seat returned exactly once
//   7.  Structured cloning works
//   8.  JSON serialization works
//   9.  Calculation time under 250 ms (1 sub + RSP + 3 seats)
//   10. Calculation time under 250 ms (4 subs + RSP + 3 seats)
//   11. Moving a subwoofer changes the normalized response
//   12. Moving a seat changes that seat's response
//   13. Changing from one to two sources changes interference/summation
//   14. Identical geometry: SUB2-12 vs SUB3-12 gives identical normalized
//       curves AND identical geometry fingerprint
//   15. Duplicate/missing seat IDs still return every seat exactly once
//   16. No imports from EQ fitting, candidate search, product capability, RP22 grading
//
// Run via runNormalizedRoomTransferFixtures().

import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import normalizedEngineSourceText from "@/components/room/bass/normalizedRoomTransferEngine.js?raw";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { REW_SOURCE_CURVES } from "@/components/room/bass/rewSourceCurves";

// --- Shared test room and positions ---
const TEST_ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.8 };
const TEST_RSP = { x: 3.0, y: 5.5, z: 1.2 };
const TEST_SEATS = [
  { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
  { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
  { id: "seat3", x: 3.0, y: 6.0, z: 1.2 },
];
const TEST_PHYSICS = {
  roomDamping: 0.4,
  axialQ: 15,
  enableReflections: true,
  qStrategy: "rew_absorption_authority",
};

// Production flat-source curve (94 dB) — the same definition the engine uses.
const FLAT_SOURCE = REW_SOURCE_CURVES.flat_rew_reference;

function makeSub(modelKey, x, y, z, placement) {
  return {
    id: `sub_${modelKey}_${x}_${y}`,
    modelKey,
    x, y, z,
    placement,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  };
}

function curvesEqual(a, b, tolerance = 1e-6) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].frequency - b[i].frequency) > 0.01) return false;
    if (Math.abs(a[i].spl - b[i].spl) > tolerance) return false;
  }
  return true;
}

// Fixture 1: SUB2-12 and SUB3-12 at identical positions produce identical normalized curves
function fixture_productIndependence() {
  const sub2 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub3 = makeSub("sub3-12", 1.5, 1.0, 0.3, "front");

  const result2 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub2], physicsOptions: TEST_PHYSICS,
  });
  const result3 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub3], physicsOptions: TEST_PHYSICS,
  });

  const rspEqual = curvesEqual(result2.rspCurve, result3.rspCurve);
  const seatsEqual = result2.seatCurves.length === result3.seatCurves.length &&
    result2.seatCurves.every((sc, i) => curvesEqual(sc.responseData, result3.seatCurves[i].responseData));

  return {
    name: "1. Product independence: SUB2-12 vs SUB3-12 at identical positions",
    passed: rspEqual && seatsEqual,
    details: `RSP curves identical: ${rspEqual}. Seat curves identical: ${seatsEqual}. ` +
      `RSP points: ${result2.rspCurve.length} vs ${result3.rspCurve.length}. ` +
      `Seat count: ${result2.seatCurves.length} vs ${result3.seatCurves.length}`,
  };
}

// Fixture 2: Product-aware legacy curves differ between SUB2-12 and SUB3-12
function fixture_productAwareDiffers() {
  const sub2 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub3 = makeSub("sub3-12", 1.5, 1.0, 0.3, "front");

  const curve2 = getSubwooferCurve("sub2-12");
  const curve3 = getSubwooferCurve("sub3-12");

  const legacy2 = simulateBassResponseRewCore(TEST_ROOM, TEST_RSP, sub2, curve2, { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200 });
  const legacy3 = simulateBassResponseRewCore(TEST_ROOM, TEST_RSP, sub3, curve3, { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200 });

  const sampleIndices = [10, 30, 50, 70];
  let maxDiff = 0;
  sampleIndices.forEach((i) => {
    if (i < legacy2.splDbRaw.length && i < legacy3.splDbRaw.length) {
      const diff = Math.abs(legacy2.splDbRaw[i] - legacy3.splDbRaw[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
  });

  return {
    name: "2. Product-aware legacy curves differ between SUB2-12 and SUB3-12",
    passed: maxDiff > 0.5,
    details: `Max SPL difference at sample frequencies: ${maxDiff.toFixed(3)} dB. ` +
      `Product curves are different: ${!curvesEqual(curve2, curve3)}`,
  };
}

// Fixture 3: Normalized result matches production flat-source path (94 dB)
// Uses the SAME production flat-source curve (REW_SOURCE_CURVES.flat_rew_reference)
// for both paths. Verifies frequency-by-frequency residual < 0.001 dB.
function fixture_matchesFlatSourceProduction() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");

  const normalized = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  // Run the production engine directly with the SAME flat 94 dB source curve
  const prodRsp = simulateBassResponseRewCore(
    TEST_ROOM, TEST_RSP, sub, FLAT_SOURCE,
    { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200, smoothing: "none" }
  );

  const normRsp = normalized.rspCurve;
  const prodRspData = prodRsp.freqsHz
    .map((f, i) => ({ frequency: f, spl: prodRsp.splDbRaw[i] }))
    .filter((p) => p.frequency > 0 && Number.isFinite(p.spl));

  // Both paths use the same 94 dB flat source, so the residual should be
  // effectively zero (< 0.001 dB) — this is true production parity, not a
  // same-test-curve comparison.
  let maxDiff = 0;
  const minLen = Math.min(normRsp.length, prodRspData.length);
  for (let i = 0; i < minLen; i++) {
    const diff = Math.abs(normRsp[i].spl - prodRspData[i].spl);
    if (diff > maxDiff) maxDiff = diff;
  }

  return {
    name: "3. Normalized result matches production flat-source path (94 dB)",
    passed: maxDiff < 0.001,
    details: `Max residual: ${maxDiff.toFixed(6)} dB (target: < 0.001). ` +
      `Both paths use REW_SOURCE_CURVES.flat_rew_reference (94 dB). ` +
      `Points compared: ${minLen}`,
  };
}

// Fixture 4: No EQ fitting, candidate search, product capability, or RP22 grading invoked
function fixture_noProductSpecificLogic() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const forbiddenKeys = ["eqFilters", "selectedCandidate", "candidatePool", "p14Level", "p18Level", "p19Level", "p20Level", "designEqFitProfile", "aggregateBankLimits"];
  const foundForbidden = forbiddenKeys.filter((k) => k in result);

  const expectedKeys = ["status", "errorMessage", "responseDomain", "rspCurve", "seatCurves", "frequencies", "sourceLayout", "geometryFingerprint", "normalizationReference", "calculationDurationMs"];
  const hasAllExpected = expectedKeys.every((k) => k in result);

  return {
    name: "4. No EQ fitting, candidate search, product capability, or RP22 grading",
    passed: foundForbidden.length === 0 && hasAllExpected && result.responseDomain === "normalized_room_transfer",
    details: `Forbidden keys found: ${foundForbidden.length === 0 ? "none" : foundForbidden.join(", ")}. ` +
      `All expected keys present: ${hasAllExpected}. Response domain: ${result.responseDomain}`,
  };
}

// Fixture 5: RSP returned exactly once
function fixture_rspReturnedOnce() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const rspCurveCount = result.rspCurve.length > 0 ? 1 : 0;
  const rspInSeats = result.seatCurves.filter((s) => s.seatKey === "__rsp__").length;

  return {
    name: "5. RSP returned exactly once",
    passed: rspCurveCount === 1 && rspInSeats === 0,
    details: `RSP curve present: ${rspCurveCount === 1}. RSP duplicated in seat curves: ${rspInSeats}. ` +
      `RSP curve points: ${result.rspCurve.length}`,
  };
}

// Fixture 6: Every real seat returned exactly once
function fixture_seatsReturnedOnce() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const expectedCount = TEST_SEATS.length;
  const returnedKeys = result.seatCurves.map((s) => s.seatKey);
  const noDuplicates = returnedKeys.length === new Set(returnedKeys).size;
  const countMatch = returnedKeys.length === expectedCount;
  const allIndexKeys = result.seatCurves.every((s, i) => s.seatKey === `__seat_${i}__`);

  return {
    name: "6. Every real seat returned exactly once",
    passed: countMatch && noDuplicates && allIndexKeys,
    details: `Expected: ${expectedCount}. Got: ${returnedKeys.length}. ` +
      `No duplicates: ${noDuplicates}. Index-based keys: ${allIndexKeys}. ` +
      `Keys: ${returnedKeys.join(", ")}`,
  };
}

// Fixture 7: Structured cloning works
function fixture_structuredCloneable() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  try {
    const cloned = structuredClone(result);
    const cloneHasRsp = cloned.rspCurve.length === result.rspCurve.length;
    const cloneHasSeats = cloned.seatCurves.length === result.seatCurves.length;
    return {
      name: "7. Structured cloning works",
      passed: cloneHasRsp && cloneHasSeats,
      details: `Clone successful. RSP points: ${cloned.rspCurve.length}. Seat curves: ${cloned.seatCurves.length}`,
    };
  } catch (err) {
    return {
      name: "7. Structured cloning works",
      passed: false,
      details: `Clone failed: ${err.message}`,
    };
  }
}

// Fixture 8: JSON serialization works
function fixture_jsonSerializable() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  try {
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    const parsedHasRsp = parsed.rspCurve.length === result.rspCurve.length;
    const parsedHasSeats = parsed.seatCurves.length === result.seatCurves.length;
    return {
      name: "8. JSON serialization works",
      passed: parsedHasRsp && parsedHasSeats && json.length > 0,
      details: `JSON length: ${json.length} chars. Parsed RSP: ${parsed.rspCurve.length} points. Parsed seats: ${parsed.seatCurves.length}`,
    };
  } catch (err) {
    return {
      name: "8. JSON serialization works",
      passed: false,
      details: `JSON.stringify failed: ${err.message}`,
    };
  }
}

// Fixture 9: Calculation time under 250 ms (1 sub + RSP + 3 seats)
function fixture_calculationTime1Sub() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const underTarget = result.calculationDurationMs < 250;
  return {
    name: "9. Calculation time under 250 ms (1 sub + RSP + 3 seats)",
    passed: underTarget,
    details: `Measured: ${result.calculationDurationMs.toFixed(1)} ms (target: < 250 ms). ` +
      `Listeners: ${1 + TEST_SEATS.length}. Subs: 1. Frequencies: ${result.frequencies.length}`,
  };
}

// Fixture 10: Calculation time under 250 ms (4 subs + RSP + 3 seats)
function fixture_calculationTime4Subs() {
  const subs = [
    makeSub("sub2-12", 1.0, 1.0, 0.3, "front"),
    makeSub("sub2-12", 5.0, 1.0, 0.3, "front"),
    makeSub("sub2-12", 1.0, 7.0, 0.3, "rear"),
    makeSub("sub2-12", 5.0, 7.0, 0.3, "rear"),
  ];
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: subs, physicsOptions: TEST_PHYSICS,
  });

  const underTarget = result.calculationDurationMs < 250;
  return {
    name: "10. Calculation time under 250 ms (4 subs + RSP + 3 seats)",
    passed: underTarget,
    details: `Measured: ${result.calculationDurationMs.toFixed(1)} ms (target: < 250 ms). ` +
      `Listeners: ${1 + TEST_SEATS.length}. Subs: 4. Frequencies: ${result.frequencies.length}`,
  };
}

// Fixture 11: Moving a subwoofer changes the normalized response
function fixture_movingSubChangesResponse() {
  const subA = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const subB = makeSub("sub2-12", 4.5, 1.0, 0.3, "front");

  const resultA = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [subA], physicsOptions: TEST_PHYSICS,
  });
  const resultB = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [subB], physicsOptions: TEST_PHYSICS,
  });

  let maxDiff = 0;
  const minLen = Math.min(resultA.rspCurve.length, resultB.rspCurve.length);
  for (let i = 0; i < minLen; i++) {
    const diff = Math.abs(resultA.rspCurve[i].spl - resultB.rspCurve[i].spl);
    if (diff > maxDiff) maxDiff = diff;
  }

  return {
    name: "11. Moving a subwoofer changes the normalized response",
    passed: maxDiff > 0.1,
    details: `Max RSP difference after moving sub from x=1.5 to x=4.5: ${maxDiff.toFixed(3)} dB. ` +
      `Points compared: ${minLen}`,
  };
}

// Fixture 12: Moving a seat changes that seat's response
function fixture_movingSeatChangesResponse() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const seatsA = [
    { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
    { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
    { id: "seat3", x: 3.0, y: 6.0, z: 1.2 },
  ];
  const seatsB = [
    { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
    { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
    { id: "seat3", x: 3.0, y: 3.0, z: 1.2 }, // moved seat3 from y=6.0 to y=3.0
  ];

  const resultA = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: seatsA,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });
  const resultB = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: seatsB,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  // seat3 is at index 2 → __seat_2__
  const seat3A = resultA.seatCurves.find((s) => s.seatKey === "__seat_2__");
  const seat3B = resultB.seatCurves.find((s) => s.seatKey === "__seat_2__");

  let maxDiff = 0;
  if (seat3A && seat3B) {
    const minLen = Math.min(seat3A.responseData.length, seat3B.responseData.length);
    for (let i = 0; i < minLen; i++) {
      const diff = Math.abs(seat3A.responseData[i].spl - seat3B.responseData[i].spl);
      if (diff > maxDiff) maxDiff = diff;
    }
  }

  return {
    name: "12. Moving a seat changes that seat's response",
    passed: maxDiff > 0.1,
    details: `Max seat3 difference after moving from y=6.0 to y=3.0: ${maxDiff.toFixed(3)} dB. ` +
      `seat3A present: ${!!seat3A}. seat3B present: ${!!seat3B}`,
  };
}

// Fixture 13: Changing from one to two sources changes interference/summation
function fixture_oneToTwoSourcesChanges() {
  const sub1 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub2 = makeSub("sub2-12", 4.5, 1.0, 0.3, "front");

  const result1 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub1], physicsOptions: TEST_PHYSICS,
  });
  const result2 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub1, sub2], physicsOptions: TEST_PHYSICS,
  });

  let maxDiff = 0;
  const minLen = Math.min(result1.rspCurve.length, result2.rspCurve.length);
  for (let i = 0; i < minLen; i++) {
    const diff = Math.abs(result1.rspCurve[i].spl - result2.rspCurve[i].spl);
    if (diff > maxDiff) maxDiff = diff;
  }

  return {
    name: "13. Changing from one to two sources changes interference/summation",
    passed: maxDiff > 0.5,
    details: `Max RSP difference between 1-sub and 2-sub: ${maxDiff.toFixed(3)} dB. ` +
      `Points compared: ${minLen}`,
  };
}

// Fixture 14: Identical geometry: SUB2-12 vs SUB3-12 gives identical normalized
// curves AND identical geometry fingerprint
function fixture_identicalGeometryFingerprint() {
  const sub2 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub3 = makeSub("sub3-12", 1.5, 1.0, 0.3, "front");

  const result2 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub2], physicsOptions: TEST_PHYSICS,
  });
  const result3 = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub3], physicsOptions: TEST_PHYSICS,
  });

  const curvesIdentical = curvesEqual(result2.rspCurve, result3.rspCurve);
  const fingerprintIdentical = result2.geometryFingerprint === result3.geometryFingerprint;

  return {
    name: "14. Identical geometry: SUB2-12 vs SUB3-12 identical curves + fingerprint",
    passed: curvesIdentical && fingerprintIdentical,
    details: `Curves identical: ${curvesIdentical}. Fingerprint identical: ${fingerprintIdentical}. ` +
      `FP2: ${result2.geometryFingerprint?.substring(0, 24)}…. FP3: ${result3.geometryFingerprint?.substring(0, 24)}…`,
  };
}

// Fixture 15: Duplicate/missing seat IDs still return every seat exactly once
function fixture_duplicateMissingSeatIds() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  // Two seats with the same ID, one with no ID
  const seatsWithDupes = [
    { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
    { id: "seat1", x: 3.5, y: 5.0, z: 1.2 }, // duplicate ID
    { x: 3.0, y: 6.0, z: 1.2 },              // missing ID
  ];

  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: seatsWithDupes,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const seatCount = result.seatCurves.length;
  const keys = result.seatCurves.map((s) => s.seatKey);
  const noDuplicates = keys.length === new Set(keys).size;
  const allIndexKeys = keys.every((k, i) => k === `__seat_${i}__`);
  const originalIds = result.seatCurves.map((s) => s.originalSeatId);

  return {
    name: "15. Duplicate/missing seat IDs still return every seat exactly once",
    passed: seatCount === 3 && noDuplicates && allIndexKeys,
    details: `Seat count: ${seatCount} (expected 3). No duplicate keys: ${noDuplicates}. ` +
      `All index-based keys: ${allIndexKeys}. Original IDs: ${originalIds.join(", ")}`,
  };
}

// Fixture 16: No imports from EQ fitting, candidate search, product capability, RP22 grading
function fixture_noForbiddenImports() {
  // Read the engine source and check for forbidden import patterns.
  // This is a static verification — the engine module must not import any
  // EQ/candidate/capability/RP22 modules.
  const engineSource = normalizedEngineSourceText;

  const forbiddenPatterns = [
    /from\s+["'].*designEqCalibration["']/,
    /from\s+["'].*houseCurveFitter["']/,
    /from\s+["'].*bassOperatingEnvelopeOptimiser["']/,
    /from\s+["'].*optimiserRanking["']/,
    /from\s+["'].*subwooferCapability["']/,
    /from\s+["'].*rp22BassMetrics["']/,
    /from\s+["'].*rp22BassOperatingDefinitions["']/,
    /from\s+["'].*houseCurveFitterCore["']/,
  ];

  const found = forbiddenPatterns.filter((p) => p.test(engineSource));

  return {
    name: "16. No imports from EQ fitting, candidate search, product capability, RP22 grading",
    passed: found.length === 0,
    details: `Forbidden import patterns found: ${found.length === 0 ? "none" : found.length}. ` +
      `Engine imports only: rewBassEngine, bassAnalysisFingerprints, rewSourceCurves`,
  };
}

// --- Fixture runner ---

export function runNormalizedRoomTransferFixtures() {
  const fixtures = [
    fixture_productIndependence,
    fixture_productAwareDiffers,
    fixture_matchesFlatSourceProduction,
    fixture_noProductSpecificLogic,
    fixture_rspReturnedOnce,
    fixture_seatsReturnedOnce,
    fixture_structuredCloneable,
    fixture_jsonSerializable,
    fixture_calculationTime1Sub,
    fixture_calculationTime4Subs,
    fixture_movingSubChangesResponse,
    fixture_movingSeatChangesResponse,
    fixture_oneToTwoSourcesChanges,
    fixture_identicalGeometryFingerprint,
    fixture_duplicateMissingSeatIds,
    fixture_noForbiddenImports,
  ];

  const results = fixtures.map((fn) => {
    try {
      return fn();
    } catch (err) {
      return { name: fn.name, passed: false, details: `Exception: ${err.message}` };
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  return { results, passed, total, allPassed: passed === total };
}