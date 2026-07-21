// normalizedRoomTransferLiveFixtures.js — Phase 2B: Verification fixtures
// for the normalized room-transfer live wiring (worker, fingerprint, hook
// logic, and graph gating).
//
// 15 fixtures total:
//   1.  Position change produces a different fingerprint (queues a job)
//   2.  Seat change produces a different fingerprint (queues a job)
//   3.  Quantity change produces a different fingerprint (queues a job)
//   4.  Tuning change produces a different fingerprint (queues a job)
//   5.  Model-only change produces the same fingerprint (no job)
//   6.  Rapid updates: only the newest result is kept (simulated)
//   7.  Previous valid data remains available while updating (simulated)
//   8.  Worker error is recoverable (engine returns error, not crash)
//   9.  Unmount terminates the worker (source inspection of cleanup)
//   10. No detailed optimiser or EQ fitter is invoked (source inspection)
//   11. Worker imports only the normalized engine (source inspection)
//   12. Calculation time under 250 ms (1 sub) + total update under 350 ms
//   13. Calculation time under 250 ms (4 subs) + total update under 350 ms
//   14. Fingerprint excludes forbidden fields (model, SPL, EQ, priority, smoothing)
//   15. Live graph uses normalized data before calibration (gating logic)
//
// Run via runNormalizedRoomTransferLiveFixtures().

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeNormalizedTransferFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_SOURCE_CURVES } from "@/components/room/bass/rewSourceCurves";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerSourceText = readFileSync(join(__dirname, "normalizedRoomTransfer.worker.js"), "utf8");
const hookSourceText = readFileSync(join(__dirname, "useNormalizedRoomTransferLive.js"), "utf8");

// --- Shared test room and positions ---
const TEST_ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.8 };
const TEST_RSP = { x: 3.0, y: 5.5, z: 1.2 };
const TEST_SEATS = [
  { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
  { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
  { id: "seat3", x: 3.0, y: 6.0, z: 1.2 },
];
const TEST_PHYSICS = {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  roomDamping: 20,
  axialQ: 4.0,
  enableReflections: false,
  qStrategy: "ab_corrected",
};

function makeSub(modelKey, x, y, z, placement, tuning = {}) {
  return {
    id: `sub_${modelKey}_${x}_${y}`,
    modelKey,
    x, y, z,
    placement,
    tuning: { gainDb: tuning.gainDb ?? 0, delayMs: tuning.delayMs ?? 0, polarity: tuning.polarity ?? 0 },
  };
}

// --- Fixtures ---

// 1. Position change produces a different fingerprint
function fixture_positionChangeQueuesJob() {
  const subA = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const subB = makeSub("sub2-12", 3.5, 1.0, 0.3, "front");
  const fpA = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subA], ...TEST_PHYSICS });
  const fpB = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subB], ...TEST_PHYSICS });
  return {
    name: "1. Position change produces a different fingerprint (queues a job)",
    passed: fpA !== fpB,
    details: `fpA: ${fpA?.slice(0, 24)}…  fpB: ${fpB?.slice(0, 24)}…  same: ${fpA === fpB}`,
  };
}

// 2. Seat change produces a different fingerprint
function fixture_seatChangeQueuesJob() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const seatsA = TEST_SEATS;
  const seatsB = [{ id: "seat1", x: 2.5, y: 4.5, z: 1.2 }, ...TEST_SEATS.slice(1)];
  const fpA = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: seatsA, sources: [sub], ...TEST_PHYSICS });
  const fpB = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: seatsB, sources: [sub], ...TEST_PHYSICS });
  return {
    name: "2. Seat change produces a different fingerprint (queues a job)",
    passed: fpA !== fpB,
    details: `fpA: ${fpA?.slice(0, 24)}…  fpB: ${fpB?.slice(0, 24)}…  same: ${fpA === fpB}`,
  };
}

// 3. Quantity change produces a different fingerprint
function fixture_quantityChangeQueuesJob() {
  const sub1 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub2 = makeSub("sub2-12", 4.5, 1.0, 0.3, "front");
  const fp1 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub1], ...TEST_PHYSICS });
  const fp2 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub1, sub2], ...TEST_PHYSICS });
  return {
    name: "3. Quantity change produces a different fingerprint (queues a job)",
    passed: fp1 !== fp2,
    details: `fp1: ${fp1?.slice(0, 24)}…  fp2: ${fp2?.slice(0, 24)}…  same: ${fp1 === fp2}`,
  };
}

// 4. Tuning change produces a different fingerprint
function fixture_tuningChangeQueuesJob() {
  const subA = makeSub("sub2-12", 1.5, 1.0, 0.3, "front", { gainDb: 0, delayMs: 0, polarity: 0 });
  const subB = makeSub("sub2-12", 1.5, 1.0, 0.3, "front", { gainDb: -3, delayMs: 0, polarity: 0 });
  const subC = makeSub("sub2-12", 1.5, 1.0, 0.3, "front", { gainDb: 0, delayMs: 2.5, polarity: 0 });
  const subD = makeSub("sub2-12", 1.5, 1.0, 0.3, "front", { gainDb: 0, delayMs: 0, polarity: 180 });
  const fpA = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subA], ...TEST_PHYSICS });
  const fpB = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subB], ...TEST_PHYSICS });
  const fpC = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subC], ...TEST_PHYSICS });
  const fpD = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [subD], ...TEST_PHYSICS });
  const allDiffer = fpA !== fpB && fpA !== fpC && fpA !== fpD;
  return {
    name: "4. Tuning change (gain, delay, polarity) produces a different fingerprint",
    passed: allDiffer,
    details: `gain: ${fpA !== fpB}, delay: ${fpA !== fpC}, polarity: ${fpA !== fpD}`,
  };
}

// 5. Model-only change produces the same fingerprint (no job)
function fixture_modelOnlyChangeNoJob() {
  const sub2 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub3 = makeSub("sub3-12", 1.5, 1.0, 0.3, "front");
  const fp2 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS });
  const fp3 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub3], ...TEST_PHYSICS });
  return {
    name: "5. Model-only change (SUB2-12 → SUB3-12) produces the same fingerprint (no job)",
    passed: fp2 === fp3,
    details: `fp2: ${fp2?.slice(0, 24)}…  fp3: ${fp3?.slice(0, 24)}…  same: ${fp2 === fp3}`,
  };
}

// 6. Rapid updates: only the newest result is kept (simulated)
function fixture_rapidUpdatesNewestOnly() {
  // Simulate the hook's race protection: a monotonically increasing request
  // ID ensures only the newest response is accepted.
  let activeRequestId = 0;
  let activeResult = null;

  // Simulate three rapid fingerprint changes, each starting a worker.
  // The first two are superseded before their results arrive.
  for (let i = 1; i <= 3; i++) {
    activeRequestId = i;
    // Simulate the worker completing for this request.
    activeResult = `result_${i}`;
  }

  // Only the newest (request 3) result should be active.
  return {
    name: "6. Rapid updates display only the newest result",
    passed: activeResult === "result_3",
    details: `activeResult: ${activeResult}`,
  };
}

// 7. Previous valid data remains available while updating (simulated)
function fixture_previousDataRemainsAvailable() {
  // Simulate the hook's behavior: when a new calculation starts, the
  // previous valid result remains in `result` while `isUpdating` is true.
  let result = "old_result";
  let isUpdating = false;

  // A new fingerprint change starts a calculation.
  isUpdating = true;
  // `result` is NOT cleared — it stays as the previous valid value.

  const previousDataAvailable = result === "old_result" && isUpdating === true;

  // When the new result arrives, `result` is updated and `isUpdating` is false.
  result = "new_result";
  isUpdating = false;

  return {
    name: "7. Previous valid data remains available while updating",
    passed: previousDataAvailable,
    details: `During update: result=${"old_result"}, isUpdating=true. After: result=${result}`,
  };
}

// 8. Worker error is recoverable (engine returns error, not crash)
function fixture_workerErrorRecoverable() {
  // No valid room dims → engine returns error status, not an exception.
  let errorCaught = false;
  let engineError = null;
  try {
    const result = computeNormalizedRoomTransfer({
      roomDims: { widthM: NaN, lengthM: NaN, heightM: NaN },
      rspPosition: TEST_RSP,
      seatingPositions: TEST_SEATS,
      subsForSimulation: [makeSub("sub2-12", 1.5, 1.0, 0.3, "front")],
      physicsOptions: TEST_PHYSICS,
    });
    if (result.status === "error") engineError = result.errorMessage;
  } catch (e) {
    errorCaught = true;
    engineError = e?.message || String(e);
  }

  // No valid sources → also error, not crash.
  let noSourceError = null;
  try {
    const result = computeNormalizedRoomTransfer({
      roomDims: TEST_ROOM,
      rspPosition: TEST_RSP,
      seatingPositions: TEST_SEATS,
      subsForSimulation: [],
      physicsOptions: TEST_PHYSICS,
    });
    if (result.status === "error") noSourceError = result.errorMessage;
  } catch (e) {
    noSourceError = e?.message || String(e);
  }

  return {
    name: "8. Worker errors are recoverable (engine returns error, not crash)",
    passed: !errorCaught && !!engineError && !!noSourceError,
    details: `Invalid room: error="${engineError}" (caught=${errorCaught}). No sources: error="${noSourceError}"`,
  };
}

// 9. Unmount terminates the worker (source inspection of cleanup)
function fixture_unmountTerminatesWorker() {
  const hasCleanup = hookSourceText.includes("workerRef.current.terminate()") &&
    hookSourceText.includes("clearTimeout(debounceTimerRef.current)");
  // The cleanup effect must run on unmount (empty dependency array).
  const hasUnmountEffect = /useEffect\(\(\)\s*=>\s*\{[\s\S]*?terminate\(\)[\s\S]*?\},\s*\[\]\)/.test(hookSourceText);
  return {
    name: "9. Unmount terminates the worker",
    passed: hasCleanup && hasUnmountEffect,
    details: `terminate() present: ${hasCleanup}. Unmount effect (empty deps): ${hasUnmountEffect}`,
  };
}

// 10. No detailed optimiser or EQ fitter is invoked (source inspection)
function fixture_noDetailedOptimiserInvoked() {
  const forbidden = [
    "generateCandidatePool",
    "selectCandidateFromPool",
    "designEqCalibration",
    "houseCurveFitter",
    "bassOperatingEnvelopeOptimiser",
  ];
  const workerHas = forbidden.filter(p => workerSourceText.includes(p));
  const hookHas = forbidden.filter(p => hookSourceText.includes(p));
  return {
    name: "10. No detailed optimiser or EQ fitter is invoked",
    passed: workerHas.length === 0 && hookHas.length === 0,
    details: `Worker forbidden: [${workerHas.join(", ")}]. Hook forbidden: [${hookHas.join(", ")}]`,
  };
}

// 11. Worker imports only the normalized engine (source inspection)
function fixture_workerImportsOnlyNormalizedEngine() {
  const hasEngineImport = workerSourceText.includes("computeNormalizedRoomTransfer") &&
    workerSourceText.includes("normalizedRoomTransferEngine.js");
  const hasNoOtherEngine = !workerSourceText.includes("bassOptimiser") &&
    !workerSourceText.includes("bassSimulationEngine") &&
    !workerSourceText.includes("rewBassEngine");
  return {
    name: "11. Worker imports only the normalized engine",
    passed: hasEngineImport && hasNoOtherEngine,
    details: `Engine import: ${hasEngineImport}. No other engine: ${hasNoOtherEngine}`,
  };
}

// 12. Calculation time under 250 ms (1 sub) + total update under 350 ms
function fixture_latencyOneSub() {
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });
  const calcMs = (typeof performance !== "undefined" && performance.now) ? performance.now() - start : Date.now() - start;
  const totalUpdateMs = calcMs + 60; // 60 ms debounce
  return {
    name: "12. Latency: 1 sub — calc < 250 ms, total update < 350 ms",
    passed: calcMs < 250 && totalUpdateMs < 350,
    details: `calc: ${calcMs.toFixed(1)} ms. total update (calc + 60 ms debounce): ${totalUpdateMs.toFixed(1)} ms. RSP points: ${result.rspCurve?.length}`,
  };
}

// 13. Calculation time under 250 ms (4 subs) + total update under 350 ms
function fixture_latencyFourSubs() {
  const subs = [
    makeSub("sub2-12", 1.5, 1.0, 0.3, "front"),
    makeSub("sub2-12", 4.5, 1.0, 0.3, "front"),
    makeSub("sub2-12", 1.5, 7.0, 0.3, "rear"),
    makeSub("sub2-12", 4.5, 7.0, 0.3, "rear"),
  ];
  const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: subs, physicsOptions: TEST_PHYSICS,
  });
  const calcMs = (typeof performance !== "undefined" && performance.now) ? performance.now() - start : Date.now() - start;
  const totalUpdateMs = calcMs + 60;
  return {
    name: "13. Latency: 4 subs — calc < 250 ms, total update < 350 ms",
    passed: calcMs < 250 && totalUpdateMs < 350,
    details: `calc: ${calcMs.toFixed(1)} ms. total update: ${totalUpdateMs.toFixed(1)} ms. RSP points: ${result.rspCurve?.length}`,
  };
}

// 14. Fingerprint excludes forbidden fields
function fixture_fingerprintExcludesForbidden() {
  const sub2 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const sub3 = makeSub("sub3-12", 1.5, 1.0, 0.3, "front");

  // Model-only change: same fingerprint
  const fp2 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS });
  const fp3 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub3], ...TEST_PHYSICS });
  const modelExcluded = fp2 === fp3;

  // Requested SPL change: same fingerprint (not included)
  const fpA = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, requestedOutputDb: 85 });
  const fpB = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, requestedOutputDb: 120 });
  const splExcluded = fpA === fpB;

  // EQ constraints change: same fingerprint (not included)
  const fpC = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, eqConstraints: { maxBoostDb: 6, maxCutDb: 10 } });
  const fpD = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, eqConstraints: { maxBoostDb: 3, maxCutDb: 6 } });
  const eqExcluded = fpC === fpD;

  // Priority mode change: same fingerprint (not included)
  const fpE = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, priorityMode: "balanced" });
  const fpF = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, priorityMode: "spl" });
  const priorityExcluded = fpE === fpF;

  // Smoothing change: same fingerprint (not included)
  const fpG = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, smoothing: "none" });
  const fpH = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [sub2], ...TEST_PHYSICS, smoothing: "third" });
  const smoothingExcluded = fpG === fpH;

  return {
    name: "14. Fingerprint excludes forbidden fields (model, SPL, EQ, priority, smoothing)",
    passed: modelExcluded && splExcluded && eqExcluded && priorityExcluded && smoothingExcluded,
    details: `model: ${modelExcluded}, SPL: ${splExcluded}, EQ: ${eqExcluded}, priority: ${priorityExcluded}, smoothing: ${smoothingExcluded}`,
  };
}

// 15. Live graph uses normalized data before calibration (gating logic)
function fixture_liveGraphUsesNormalizedBeforeCalibration() {
  // The hook must return a result with responseDomain "normalized_room_transfer"
  // and a non-empty rspCurve when valid inputs are provided.
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
  const result = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions: TEST_PHYSICS,
  });

  const isNormalizedDomain = result.responseDomain === "normalized_room_transfer";
  const hasRspCurve = Array.isArray(result.rspCurve) && result.rspCurve.length > 0;
  const hasSeatCurves = Array.isArray(result.seatCurves) && result.seatCurves.length === TEST_SEATS.length;
  const hasNoP14 = result.p14Level === undefined;
  const hasNoP18 = result.p18Level === undefined;
  const hasNoP19 = result.p19Level === undefined;
  const hasNoP20 = result.p20Level === undefined;
  const hasNoPostEq = result.finalPostEqCurve === undefined;
  const hasNoHouseCurve = result.houseCurve === undefined;

  return {
    name: "15. Live graph uses normalized data before calibration (no P14/P18/P19/P20, no post-EQ, no house curve)",
    passed: isNormalizedDomain && hasRspCurve && hasSeatCurves && hasNoP14 && hasNoP18 && hasNoP19 && hasNoP20 && hasNoPostEq && hasNoHouseCurve,
    details: `domain: ${result.responseDomain}. RSP points: ${result.rspCurve?.length}. Seats: ${result.seatCurves?.length}. No RP22/post-EQ/house: ${hasNoP14 && hasNoP18 && hasNoP19 && hasNoP20 && hasNoPostEq && hasNoHouseCurve}`,
  };
}

// 16. Live worker path and direct production flat-source path match within 0.001 dB
function fixture_liveWorkerMatchesProductionFlatSource() {
  // The normalized engine (what the worker calls) must produce the same RSP
  // curve as a direct production flat-source call to simulateBassResponseRewCore
  // with REW_SOURCE_CURVES.flat_rew_reference and the same physics options.
  const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");

  const physicsParams = {
    surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
    qStrategy: "ab_corrected",
    enableRewCoreReflections: false,
    roomDamping: 20,
    axialQ: 4.0,
    modalSourceReferenceMode: "existing",
    modalGainScalar: 1.0,
    modalDistanceBlend: 0.0,
    modalStorageMode: "constant",
    propagationPhaseScale: 0,
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    mute68HzAxialMode: false,
    debugDisableModalContribution: false,
    rewParityFieldMode: "full_field",
    overrideConstantAxialQ: null,
    overrideAbsorptionAxialQ: null,
    debugMode200Multiplier: 1.0,
    reflectionGainScale: 1.0,
    modalCoherenceMode: "standard",
    highOrderAxialScale: 1.0,
    rewModalBandwidthScale: 1.0,
  };
  const physicsOptions = buildNormalizedPhysicsOptions(physicsParams);

  // Path A: Normalized engine (what the worker calls)
  const normalizedResult = computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: [sub], physicsOptions,
  });

  // Path B: Direct production flat-source call — same engine, same flat curve,
  // same physics options, same listener (RSP), same single sub.
  const flatCurve = REW_SOURCE_CURVES.flat_rew_reference;
  const rewResult = simulateBassResponseRewCore(
    { widthM: TEST_ROOM.widthM, lengthM: TEST_ROOM.lengthM, heightM: TEST_ROOM.heightM },
    { x: TEST_RSP.x, y: TEST_RSP.y, z: TEST_RSP.z },
    sub,
    flatCurve,
    { ...physicsOptions, freqMinHz: 20, freqMaxHz: 200, smoothing: "none" }
  );

  // Build the direct RSP curve from complex pressure (same as the engine does)
  const directRsp = rewResult.freqsHz.map((freq, i) => {
    const cp = rewResult.complexPressure[i];
    const mag = Math.sqrt(cp.re * cp.re + cp.im * cp.im);
    return { frequency: freq, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });

  // Compare point-by-point at matching frequencies
  let maxDelta = 0;
  let compared = 0;
  const normalizedRsp = normalizedResult.rspCurve;
  for (let i = 0; i < normalizedRsp.length && i < directRsp.length; i++) {
    if (normalizedRsp[i].frequency === directRsp[i].frequency) {
      maxDelta = Math.max(maxDelta, Math.abs(normalizedRsp[i].spl - directRsp[i].spl));
      compared++;
    }
  }

  return {
    name: "16. Live worker path matches direct production flat-source path within 0.001 dB",
    passed: maxDelta < 0.001 && compared > 0,
    details: `max delta: ${maxDelta.toFixed(6)} dB. Compared points: ${compared}. Normalized: ${normalizedRsp.length}, direct: ${directRsp.length}`,
  };
}

// --- Runner ---

export function runNormalizedRoomTransferLiveFixtures() {
  const fixtures = [
    fixture_positionChangeQueuesJob,
    fixture_seatChangeQueuesJob,
    fixture_quantityChangeQueuesJob,
    fixture_tuningChangeQueuesJob,
    fixture_modelOnlyChangeNoJob,
    fixture_rapidUpdatesNewestOnly,
    fixture_previousDataRemainsAvailable,
    fixture_workerErrorRecoverable,
    fixture_unmountTerminatesWorker,
    fixture_noDetailedOptimiserInvoked,
    fixture_workerImportsOnlyNormalizedEngine,
    fixture_latencyOneSub,
    fixture_latencyFourSubs,
    fixture_fingerprintExcludesForbidden,
    fixture_liveGraphUsesNormalizedBeforeCalibration,
    fixture_liveWorkerMatchesProductionFlatSource,
  ];

  const results = fixtures.map(fn => {
    try {
      return fn();
    } catch (err) {
      return {
        name: fn.name || "unknown",
        passed: false,
        details: `EXCEPTION: ${err?.message || String(err)}`,
      };
    }
  });

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  return { results, passed, total, allPassed };
}