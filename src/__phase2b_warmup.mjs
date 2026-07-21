// Temporary warmup test — deleted after verification.
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

function makeSub(modelKey, x, y, z, placement) {
  return { id: `sub_${modelKey}_${x}_${y}`, modelKey, x, y, z, placement, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
}

const sub = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");

// Warmup call
const t0 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: PREVIEW_PHYSICS });
console.log(`Warmup (preview): ${(performance.now() - t0).toFixed(1)} ms`);

// Preview call 1
const t1 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: PREVIEW_PHYSICS });
console.log(`Preview 1 sub: ${(performance.now() - t1).toFixed(1)} ms`);

// Refinement call 1
const t2 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: REFINEMENT_PHYSICS });
console.log(`Refinement 1 sub: ${(performance.now() - t2).toFixed(1)} ms`);

// Preview call 2
const t3 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: PREVIEW_PHYSICS });
console.log(`Preview 1 sub (2nd): ${(performance.now() - t3).toFixed(1)} ms`);

// Refinement call 2
const t4 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: REFINEMENT_PHYSICS });
console.log(`Refinement 1 sub (2nd): ${(performance.now() - t4).toFixed(1)} ms`);

// Now test with modes disabled (like old TEST_PHYSICS)
const PREVIEW_NO_MODES = { ...PREVIEW_PHYSICS, enableModes: false };
const t5 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: PREVIEW_NO_MODES });
console.log(`Preview 1 sub (modes off): ${(performance.now() - t5).toFixed(1)} ms`);

// Test with modes enabled but pureDeterministicModalSum false
const PREVIEW_NO_PURE = { ...PREVIEW_PHYSICS, pureDeterministicModalSum: false };
const t6 = performance.now();
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub], physicsOptions: PREVIEW_NO_PURE });
console.log(`Preview 1 sub (pureDet false): ${(performance.now() - t6).toFixed(1)} ms`);