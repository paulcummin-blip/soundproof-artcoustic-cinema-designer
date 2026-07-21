import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";
import { resolveBestSubLayoutContextId } from "@/components/room/bass/best-layout/bestSubLayoutContext";
import { createBestSubLayoutPhysicsSnapshot, DEFAULT_BEST_SUB_LAYOUT_PHYSICS, selectBestSubLayoutPhysics } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";
import { runBestSubLayoutRecommendation } from "@/components/room/bass/best-layout/bestSubLayoutEngine";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";

const roomA = { widthM: 5.5, lengthM: 7.2, heightM: 2.7 };
const roomB = { width: 4.2, length: 6.1, height: 2.4 };
const seatsA = [{ id: "A1", x: 2.75, y: 4.5, z: 1.2 }];
const seatsB = [{ id: "B1", position: { x: 1.7, y: 3.5, z: 1.1 } }, { id: "B2", position: { x: 2.5, y: 3.5, z: 1.1 } }];
const rspA = { x: 2.75, y: 4.5, z: 1.2 };
const rspB = { position: { x: 2.1, y: 3.5, z: 1.2 } };
const heightsA = { front: 0.08, rear: 0.16 };
const heightsB = { front: 0.22, rear: 0.31 };
const contextA = resolveBestSubLayoutContextId({ projectId: "A", roomDims: roomA });
const contextB = resolveBestSubLayoutContextId({ projectId: "B", roomDims: roomB });
const customPhysics = buildNormalizedPhysicsOptions({ ...BASS_NORMALIZED_PHYSICS_DEFAULTS, roomDamping: 28 });
const snapshotA = createBestSubLayoutPhysicsSnapshot({ contextId: contextA, physicsOptions: customPhysics, roomDims: roomA, seatingPositions: seatsA, rspPosition: rspA, sourceHeights: heightsA });
const canonicalB = canonicalizeNormalizedRoomInputs({ roomDims: roomB, seatingPositions: seatsB, rspPosition: rspB });
const check = (name, passed) => ({ name, passed: !!passed });
const order = (run) => run.allCandidates.map((item) => item.id).join("|");

const EXPECTED_PRODUCTION_NORMALIZED_PHYSICS = {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, enableReflections: true, enableModes: true,
  roomDamping: 20, axialQ: 4, modalSourceReferenceMode: "existing", modalGainScalar: 1, modalDistanceBlend: 0.55, modalStorageMode: "none", propagationPhaseScale: 0,
  pureDeterministicModalSum: true, disableReflectionPhaseJitter: false, disableReflectionCoherenceWeight: false, disableLateField: true, disableModalPropagationPhase: true,
  mute68HzAxialMode: false, debugDisableModalContribution: false, rewParityFieldMode: "full_field", overrideConstantAxialQ: false, overrideAbsorptionAxialQ: false,
  debugMode200Multiplier: 1, debugModalPhaseConvention: "normal", debugReflectionOrder: 1, reflectionGainScale: 1, debugModalHSign: "normal", rewParityModalMagnitudeScale: 1,
  modalCoherenceMode: "coherent", highOrderAxialScale: 1, qStrategy: "ab_corrected", rewModalBandwidthScale: 0.55,
};

export function runBestSubLayoutIsolationFixtures() {
  const matchingPhysics = selectBestSubLayoutPhysics(snapshotA, contextA);
  const rejectedPhysics = selectBestSubLayoutPhysics(snapshotA, contextB);
  const runA = runBestSubLayoutRecommendation({ ...canonicalizeNormalizedRoomInputs({ roomDims: roomA, seatingPositions: seatsA, rspPosition: rspA }), physicsOptions: matchingPhysics, sourceHeights: heightsA });
  const reopenedA = runBestSubLayoutRecommendation({ ...canonicalizeNormalizedRoomInputs({ roomDims: roomA, seatingPositions: seatsA, rspPosition: rspA }), physicsOptions: selectBestSubLayoutPhysics(snapshotA, contextA), sourceHeights: heightsA });
  const runB = runBestSubLayoutRecommendation({ ...canonicalB, physicsOptions: rejectedPhysics, sourceHeights: heightsB });
  const fixtures = [
    check("1. Retained Room A geometry cannot override current Room B props", !Object.hasOwn(snapshotA, "roomDims") && runB.allCandidates.every((layout) => layout.sources.every((source) => source.x <= canonicalB.roomDims.widthM && source.y <= canonicalB.roomDims.lengthM))),
    check("2. Retained Room A seats cannot appear in Room B assessment", !Object.hasOwn(snapshotA, "seatingPositions") && runB.allCandidates.every((layout) => layout.metrics.realSeatsAssessed === seatsB.length)),
    check("3. Current front and rear heights override retained values", !Object.hasOwn(snapshotA, "sourceHeights") && runB.allCandidates.every((layout) => layout.sources.every((source) => source.z === heightsB[source.placement]))),
    check("4. Physics from matching context is reused", matchingPhysics === customPhysics),
    check("5. Physics from different context is rejected", rejectedPhysics === DEFAULT_BEST_SUB_LAYOUT_PHYSICS),
    check("6. Missing snapshot uses production defaults", selectBestSubLayoutPhysics(null, contextB) === DEFAULT_BEST_SUB_LAYOUT_PHYSICS),
    check("7. Collapse and reopen preserve unchanged-room recommendations", order(runA) === order(reopenedA)),
    check("8. Collapsed project switch recalculates from new room", runB.candidateCount === 9 && runB.allCandidates.every((layout) => layout.metrics.realSeatsAssessed === 2) && computeBestSubLayoutFingerprint({ ...canonicalB, physicsOptions: rejectedPhysics, sourceHeights: heightsB }) !== computeBestSubLayoutFingerprint({ ...canonicalizeNormalizedRoomInputs({ roomDims: roomA, seatingPositions: seatsA, rspPosition: rspA }), physicsOptions: matchingPhysics, sourceHeights: heightsA })),
    check("9. Shared defaults match pre-close production normalized physics", JSON.stringify(DEFAULT_BEST_SUB_LAYOUT_PHYSICS) === JSON.stringify(EXPECTED_PRODUCTION_NORMALIZED_PHYSICS)),
  ];
  const passed = fixtures.filter((item) => item.passed).length;
  return { results: fixtures, passed, total: fixtures.length, allPassed: passed === fixtures.length };
}