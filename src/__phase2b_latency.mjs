// Temporary latency measurement script — deleted after use.
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { computeNormalizedTransferFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

const TEST_ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.8 };
const TEST_RSP = { x: 3.0, y: 5.5, z: 1.2 };
const TEST_SEATS = [
  { id: "seat1", x: 2.5, y: 5.0, z: 1.2 },
  { id: "seat2", x: 3.5, y: 5.0, z: 1.2 },
  { id: "seat3", x: 3.0, y: 6.0, z: 1.2 },
];
const physicsParams = {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  qStrategy: "ab_corrected", enableRewCoreReflections: false, roomDamping: 20, axialQ: 4.0,
  modalSourceReferenceMode: "existing", modalGainScalar: 1.0, modalDistanceBlend: 0.0,
  modalStorageMode: "constant", propagationPhaseScale: 0, disableReflectionPhaseJitter: false,
  disableReflectionCoherenceWeight: false, mute68HzAxialMode: false, debugDisableModalContribution: false,
  rewParityFieldMode: "full_field", overrideConstantAxialQ: null, overrideAbsorptionAxialQ: null,
  debugMode200Multiplier: 1.0, reflectionGainScale: 1.0, modalCoherenceMode: "standard",
  highOrderAxialScale: 1.0, rewModalBandwidthScale: 1.0,
};
const physicsOptions = buildNormalizedPhysicsOptions(physicsParams);

function makeSub(modelKey, x, y, z, placement) {
  return { id: `sub_${modelKey}_${x}_${y}`, modelKey, x, y, z, placement, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
}

// Fixture-comparable physics (reflections disabled)
const TEST_PHYSICS = {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  roomDamping: 20, axialQ: 4.0, enableReflections: false, qStrategy: "ab_corrected",
};

// Warmup pass (JIT + module load)
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [makeSub("sub2-12", 1.5, 1.0, 0.3, "front")], physicsOptions: TEST_PHYSICS });
computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [makeSub("sub2-12", 1.5, 1.0, 0.3, "front")], physicsOptions });

// 1-sub latency (fixture physics: reflections off)
const sub1 = makeSub("sub2-12", 1.5, 1.0, 0.3, "front");
const start1 = performance.now();
const r1 = computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub1], physicsOptions: TEST_PHYSICS });
const calc1 = performance.now() - start1;
const total1 = calc1 + 60;

// 1-sub latency (builder physics: reflections on for ab_corrected)
const start1b = performance.now();
const r1b = computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: [sub1], physicsOptions });
const calc1b = performance.now() - start1b;
const total1b = calc1b + 60;

// 4-sub latency (fixture physics: reflections off)
const subs4 = [
  makeSub("sub2-12", 1.5, 1.0, 0.3, "front"),
  makeSub("sub2-12", 4.5, 1.0, 0.3, "front"),
  makeSub("sub2-12", 1.5, 7.0, 0.3, "rear"),
  makeSub("sub2-12", 4.5, 7.0, 0.3, "rear"),
];
const start4 = performance.now();
const r4 = computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: subs4, physicsOptions: TEST_PHYSICS });
const calc4 = performance.now() - start4;
const total4 = calc4 + 60;

// 4-sub latency (builder physics: reflections on)
const start4b = performance.now();
const r4b = computeNormalizedRoomTransfer({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, subsForSimulation: subs4, physicsOptions });
const calc4b = performance.now() - start4b;
const total4b = calc4b + 60;

// Model-only change: same fingerprint (zero jobs queued)
const fp2 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [makeSub("sub2-12", 1.5, 1.0, 0.3, "front")], ...physicsOptions });
const fp3 = computeNormalizedTransferFingerprint({ roomDims: TEST_ROOM, rspPosition: TEST_RSP, seatingPositions: TEST_SEATS, sources: [makeSub("sub3-12", 1.5, 1.0, 0.3, "front")], ...physicsOptions });

console.log(JSON.stringify({
  oneSub_fixture: { calcMs: calc1.toFixed(2), totalUpdateMs: total1.toFixed(2), rspPoints: r1.rspCurve?.length },
  oneSub_builder: { calcMs: calc1b.toFixed(2), totalUpdateMs: total1b.toFixed(2) },
  fourSub_fixture: { calcMs: calc4.toFixed(2), totalUpdateMs: total4.toFixed(2), rspPoints: r4.rspCurve?.length },
  fourSub_builder: { calcMs: calc4b.toFixed(2), totalUpdateMs: total4b.toFixed(2) },
  modelOnlyChange: { fp2: fp2?.slice(0, 16), fp3: fp3?.slice(0, 16), sameFingerprint: fp2 === fp3, jobsQueued: fp2 !== fp3 ? 1 : 0 },
}, null, 2));