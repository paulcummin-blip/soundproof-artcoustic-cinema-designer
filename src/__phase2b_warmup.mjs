// Temporary Phase 2B timing measurement — deleted after verification.
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions, buildPreviewPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";

const TEST_ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.8 };
const TEST_RSP = { x: 3.0, y: 5.5, z: 1.2 };
const TEST_SEATS = [
  { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
  { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
  { id: "seat3", x: 3.0, y: 6.0, z: 1.2 },
];

const PRODUCTION_PHYSICS_PARAMS = {
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

const REFINEMENT_PHYSICS = buildNormalizedPhysicsOptions(PRODUCTION_PHYSICS_PARAMS);
const PREVIEW_PHYSICS = buildPreviewPhysicsOptions(REFINEMENT_PHYSICS);
const PREVIEW_PPO = 8;
const PREVIEW_DEBOUNCE_MS = 50;

function makeSub(modelKey, x, y, z, placement) {
  return { id: `sub_${modelKey}_${x}_${y}`, modelKey, x, y, z, placement, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
}

const oneSub = [makeSub("sub2-12", 1.5, 1.0, 0.3, "front")];
const fourSubs = [
  makeSub("sub2-12", 1.5, 1.0, 0.3, "front"),
  makeSub("sub2-12", 4.5, 1.0, 0.3, "front"),
  makeSub("sub2-12", 1.5, 7.0, 0.3, "rear"),
  makeSub("sub2-12", 4.5, 7.0, 0.3, "rear"),
];

function previewCall(subs) {
  return computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: subs, physicsOptions: PREVIEW_PHYSICS,
    pointsPerOctave: PREVIEW_PPO,
  });
}

function refinementCall(subs) {
  return computeNormalizedRoomTransfer({
    roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS,
    subsForSimulation: subs, physicsOptions: REFINEMENT_PHYSICS,
  });
}

function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

// --- Cold first-preview latency (1 sub, no warmup) ---
const t0 = now();
const coldResult = previewCall(oneSub);
const coldMs = now() - t0;
const coldTotal = coldMs + PREVIEW_DEBOUNCE_MS;
console.log(`Cold first-preview (1 sub): calc=${coldMs.toFixed(1)} ms, total+debounce=${coldTotal.toFixed(1)} ms, points=${coldResult.rspCurve?.length}`);

// --- Warm one-sub preview latency ---
const t1 = now();
const warm1Result = previewCall(oneSub);
const warm1Ms = now() - t1;
const warm1Total = warm1Ms + PREVIEW_DEBOUNCE_MS;
console.log(`Warm preview (1 sub): calc=${warm1Ms.toFixed(1)} ms, total+debounce=${warm1Total.toFixed(1)} ms, points=${warm1Result.rspCurve?.length}`);

// --- Warm four-sub preview latency ---
const t2 = now();
const warm4Result = previewCall(fourSubs);
const warm4Ms = now() - t2;
const warm4Total = warm4Ms + PREVIEW_DEBOUNCE_MS;
console.log(`Warm preview (4 subs): calc=${warm4Ms.toFixed(1)} ms, total+debounce=${warm4Total.toFixed(1)} ms, points=${warm4Result.rspCurve?.length}`);

// --- One-sub refinement duration ---
const t3 = now();
const ref1Result = refinementCall(oneSub);
const ref1Ms = now() - t3;
console.log(`Refinement (1 sub): calc=${ref1Ms.toFixed(1)} ms, points=${ref1Result.rspCurve?.length}`);

// --- Four-sub refinement duration ---
const t4 = now();
const ref4Result = refinementCall(fourSubs);
const ref4Ms = now() - t4;
console.log(`Refinement (4 subs): calc=${ref4Ms.toFixed(1)} ms, points=${ref4Result.rspCurve?.length}`);

// --- Accuracy: preview vs refinement at matching frequencies ---
const refinedMap = new Map();
for (const pt of ref1Result.rspCurve) refinedMap.set(pt.frequency, pt.spl);
let maxDelta = 0;
let compared = 0;
for (const pt of warm1Result.rspCurve) {
  const refinedSpl = refinedMap.get(pt.frequency);
  if (refinedSpl !== undefined && Number.isFinite(refinedSpl)) {
    maxDelta = Math.max(maxDelta, Math.abs(pt.spl - refinedSpl));
    compared++;
  }
}
console.log(`Preview vs refinement accuracy: maxDelta=${maxDelta.toFixed(6)} dB, compared=${compared} points`);

// --- Summary ---
console.log("\n=== Phase 2B Timing Summary ===");
console.log(`Cold first-preview (1 sub):  ${coldTotal.toFixed(1)} ms (calc ${coldMs.toFixed(1)} + debounce ${PREVIEW_DEBOUNCE_MS})`);
console.log(`Warm preview (1 sub):        ${warm1Total.toFixed(1)} ms (calc ${warm1Ms.toFixed(1)} + debounce ${PREVIEW_DEBOUNCE_MS})  gate: ${warm1Total < 150 ? "PASS" : "FAIL"}`);
console.log(`Warm preview (4 subs):       ${warm4Total.toFixed(1)} ms (calc ${warm4Ms.toFixed(1)} + debounce ${PREVIEW_DEBOUNCE_MS})  gate: ${warm4Total < 150 ? "PASS" : "FAIL"}`);
console.log(`Refinement (1 sub):           ${ref1Ms.toFixed(1)} ms`);
console.log(`Refinement (4 subs):           ${ref4Ms.toFixed(1)} ms`);
console.log(`Preview vs refined delta:    ${maxDelta.toFixed(6)} dB (${compared} points)  gate: ${maxDelta < 0.001 ? "PASS" : "FAIL"}`);