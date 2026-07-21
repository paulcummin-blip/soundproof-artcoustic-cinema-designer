// normalizedRoomTransferFixtures.js — Phase 2A: Nine verification fixtures
// for the normalized room-transfer engine.
//
// Each fixture returns { name, passed, details } and is pure/deterministic.
// Run via runNormalizedRoomTransferFixtures().

import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve, MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { computeGeometryFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

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

// Flat 0 dB source curve (same as the engine uses internally)
const FLAT_CURVE = [
  { hz: 15, db: 0 }, { hz: 20, db: 0 }, { hz: 30, db: 0 }, { hz: 40, db: 0 },
  { hz: 50, db: 0 }, { hz: 63, db: 0 }, { hz: 80, db: 0 }, { hz: 100, db: 0 },
  { hz: 120, db: 0 }, { hz: 160, db: 0 }, { hz: 200, db: 0 },
];

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

  // Run product-aware (legacy) path: use real product curves
  const legacy2 = simulateBassResponseRewCore(TEST_ROOM, TEST_RSP, sub2, curve2, { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200 });
  const legacy3 = simulateBassResponseRewCore(TEST_ROOM, TEST_RSP, sub3, curve3, { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200 });

  // Compare at a few sample frequencies
  const sampleIndices = [10, 30, 50, 70];
  let maxDiff = 0;
  sampleIndices.forEach((i) => {
    const diff = Math.abs(legacy2.splDbRaw[i] - legacy3.splDbRaw[i]);
    if (diff > maxDiff) maxDiff = diff;
  });

  return {
    name: "2. Product-aware legacy curves differ between SUB2-12 and SUB3-12",
    passed: maxDiff > 0.5,
    details: `Max SPL difference at sample frequencies: ${maxDiff.toFixed(3)} dB. ` +
      `Product curves are different: ${curve2.length !== curve3.length || curve2[0]?.spl !== curve3[0]?.spl}`,
  };
}

// Fixture 3: Normalized result matches flat-source production path
function fixture_matchesFlatSourceProduction() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");

  const normalized = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  // Run the production engine directly with the same flat curve
  const prodRsp = simulateBassResponseRewCore(TEST_ROOM, TEST_RSP, sub, FLAT_CURVE, { ...TEST_PHYSICS, freqMinHz: 20, freqMaxHz: 200 });

  // Compare RSP curves
  const normRsp = normalized.rspCurve;
  const prodRspData = prodRsp.freqsHz.map((f, i) => ({ frequency: f, spl: prodRsp.splDbRaw[i] }))
    .filter((p) => p.frequency > 0 && Number.isFinite(p.spl));

  const maxDiff = Math.max(...normRsp.map((p, i) => Math.abs(p.spl - prodRspData[i].spl)));

  return {
    name: "3. Normalized result matches flat-source production path",
    passed: maxDiff < 0.001,
    details: `Max difference between normalized and flat-source production: ${maxDiff.toFixed(6)} dB. ` +
      `Points compared: ${normRsp.length}`,
  };
}

// Fixture 4: No EQ fitting, candidate search, product capability, or RP22 grading invoked
function fixture_noProductSpecificLogic() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  // The result should not contain any EQ/candidate/capability/RP22 fields
  const forbiddenKeys = ["eqFilters", "selectedCandidate", "candidatePool", "p14Level", "p18Level", "p19Level", "p20Level", "designEqFitProfile", "aggregateBankLimits"];
  const foundForbidden = forbiddenKeys.filter((k) => k in result);

  // The result should contain only room-transfer data
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
  const rspInSeats = result.seatCurves.filter((s) => s.seatId === "__rsp__" || s.seatId === "rsp").length;

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

  const expectedSeatIds = TEST_SEATS.map((s) => s.id);
  const returnedSeatIds = result.seatCurves.map((s) => s.seatId);
  const allPresent = expectedSeatIds.every((id) => returnedSeatIds.includes(id));
  const noDuplicates = returnedSeatIds.length === new Set(returnedSeatIds).size;
  const countMatch = returnedSeatIds.length === expectedSeatIds.length;

  return {
    name: "6. Every real seat returned exactly once",
    passed: allPresent && noDuplicates && countMatch,
    details: `Expected: ${expectedSeatIds.join(", ")}. Got: ${returnedSeatIds.join(", ")}. ` +
      `All present: ${allPresent}. No duplicates: ${noDuplicates}. Count match: ${countMatch}`,
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

// Fixture 9: Calculation time under 250 ms
function fixture_calculationTime() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const underTarget = result.calculationDurationMs < 250;
  return {
    name: "9. Calculation time under 250 ms",
    passed: underTarget,
    details: `Measured: ${result.calculationDurationMs.toFixed(1)} ms (target: < 250 ms). ` +
      `Listeners: ${1 + TEST_SEATS.length}. Subs: 1. Frequencies: ${result.frequencies.length}`,
  };
}

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
    fixture_calculationTime,
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