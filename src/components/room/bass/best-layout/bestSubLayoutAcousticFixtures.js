import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";
import { summarizeTransferEfficiency } from "@/components/room/bass/best-layout/bestSubLayoutTransferEfficiency";
import { gradeLayout } from "@/components/room/bass/best-layout/bestSubLayoutScoring";
import { runBestSubLayoutRecommendation } from "@/components/room/bass/best-layout/bestSubLayoutEngine";

const productionRoom = { width: 5.5, length: 7.2, height: 2.7, room_width: 99 };
const productionSeats = [
  { id: "R1S1", position: { x: 2.1, y: 4.4, z: 1.2 }, rowNumber: 1 },
  { id: "R1S2", position: { x: 2.75, y: 4.4, z: 1.2 }, rowNumber: 1, isPrimary: true },
  { id: "R1S3", position: { x: 3.4, y: 4.4, z: 1.2 }, rowNumber: 1 },
];
const productionRsp = { id: "rsp", position: { x: 2.75, y: 4.4, z: 1.2 } };
const canonical = canonicalizeNormalizedRoomInputs({ roomDims: productionRoom, seatingPositions: productionSeats, rspPosition: productionRsp });
const sourceHeights = { front: 0.08, rear: 0.16 };
const params = { surfaceAbsorption: { front: 0.3, back: 0.35, left: 0.25, right: 0.25, ceiling: 0.4, floor: 0.15 }, qStrategy: "production", enableRewCoreReflections: false, roomDamping: 20, axialQ: 4, modalSourceReferenceMode: "existing", modalGainScalar: 1, modalDistanceBlend: 0, modalStorageMode: "none", propagationPhaseScale: 1, modalCoherenceMode: "coherent", highOrderAxialScale: 1, rewModalBandwidthScale: 0.55 };
const physics = buildNormalizedPhysicsOptions(params);
const curve = (offsets) => offsets.map((spl, index) => ({ frequency: 30 + index * 10, spl }));
const check = (name, passed, details = "") => ({ name, passed: !!passed, details });

export function runBestSubLayoutAcousticFixtures() {
  const generated = generateBestSubLayoutCandidateSet(canonical.roomDims, sourceHeights);
  const run = runBestSubLayoutRecommendation({ ...canonical, physicsOptions: physics, sourceHeights });
  const fingerprint = (overrides = {}) => computeBestSubLayoutFingerprint({ ...canonical, physicsOptions: physics, sourceHeights, ...overrides });
  const baseRoom = curve([90, 89, 88, 90, 91, 89, 90, 88, 89, 90]);
  const baseReference = curve([92, 92, 92, 92, 92, 92, 92, 92, 92, 92]);
  const raisedRoom = baseRoom.map((point) => ({ ...point, spl: point.spl + 6.0206 }));
  const raisedReference = baseReference.map((point) => ({ ...point, spl: point.spl + 6.0206 }));
  const singleEfficiency = summarizeTransferEfficiency([baseRoom], [baseReference]);
  const duplicatedEfficiency = summarizeTransferEfficiency([raisedRoom], [raisedReference]);
  const cancelledEfficiency = summarizeTransferEfficiency([curve([92, 91, 80, 78, 80, 91, 92, 92, 91, 92])], [baseReference]);
  const aPlusBase = { destructiveBroadNullCount: 0, transferEfficiencyClass: singleEfficiency.transferEfficiencyClass, worstSeatVariationDb: 2, perSeat: [{ worstNullDepthDb: 0, extensionHz: 25, relativeTransferEfficiencyDb: singleEfficiency.worstSeatTransferEfficiencyDb }] };
  const dir = dirname(fileURLToPath(import.meta.url));
  const guideSource = readFileSync(join(dir, "BestSubLayoutGuide.jsx"), "utf8");
  const fixtures = [
    check("1. Production-shaped room inputs generate valid candidates", !!canonical.roomDims && canonical.seatingPositions.length === 3 && generated.candidates.length === 9),
    check("2. Live room-physics changes alter fingerprint", fingerprint() !== fingerprint({ physicsOptions: buildNormalizedPhysicsOptions({ ...params, roomDamping: 28 }) })),
    check("3. Product-only changes do not affect fingerprint", fingerprint({ modelKey: "SUB2-12" }) === fingerprint({ modelKey: "SUB4-12" })),
    check("4. Configured front and rear heights reach candidate sources", generated.candidates.every((layout) => layout.sources.every((source) => source.z === sourceHeights[source.placement]))),
    check("5. Height changes alter fingerprint", fingerprint() !== fingerprint({ sourceHeights: { ...sourceHeights, rear: 0.21 } })),
    check("6. Height fallback is explicitly reported", generateBestSubLayoutCandidateSet(canonical.roomDims, {}).diagnostics.usedHeightFallback.front === true && generateBestSubLayoutCandidateSet(canonical.roomDims, {}).diagnostics.usedHeightFallback.rear === true),
    check("7. Coherent source-count gain does not improve efficiency", Math.abs(singleEfficiency.relativeTransferEfficiencyDb - duplicatedEfficiency.relativeTransferEfficiencyDb) < 0.001 && singleEfficiency.transferEfficiencyClass === duplicatedEfficiency.transferEfficiencyClass),
    check("8. Equivalent source counts have comparable normalized efficiency", Math.abs(singleEfficiency.worstSeatTransferEfficiencyDb - duplicatedEfficiency.worstSeatTransferEfficiencyDb) < 0.001),
    check("9. Broad cancellation is worse than direct reference", cancelledEfficiency.worstSeatTransferEfficiencyDb < singleEfficiency.worstSeatTransferEfficiencyDb),
    check("10. A+ cannot be awarded through source-count gain", gradeLayout(aPlusBase, false) === gradeLayout({ ...aPlusBase, sourceCount: 4 }, false)),
    check("11. Nine-layout room returns finite metrics for every seat", run.candidateCount === 9 && run.allCandidates.every((layout) => layout.metrics.perSeat.length === 3 && layout.metrics.perSeat.every((seat) => Number.isFinite(seat.relativeTransferEfficiencyDb) && Number.isFinite(seat.extensionHz)))),
    check("12. Production result exposes exactly best three cards", run.recommendations.length === 3 && run.renderedRecommendationCount === 3 && guideSource.includes("data-layout-cards={items.slice(0, 3).length}")),
  ];
  const passed = fixtures.filter((item) => item.passed).length;
  const topThree = run.recommendations.map((layout, index) => ({ rank: index + 1, id: layout.id, name: layout.name, grade: layout.metrics.overallGrade, sourceCount: layout.metrics.sourceCount, broadNulls: layout.metrics.destructiveBroadNullCount, worstNullDb: layout.metrics.worstSeatBroadNullDepthDb, worstVariationDb: layout.metrics.worstSeatVariationDb, extensionHz: layout.metrics.lowestReliableNormalizedFrequencyHz, relativeEfficiencyDb: layout.metrics.relativeTransferEfficiencyDb, worstSeatEfficiencyDb: layout.metrics.worstSeatTransferEfficiencyDb, efficiencyClass: layout.metrics.transferEfficiencyClass }));
  return { results: fixtures, passed, total: fixtures.length, allPassed: passed === fixtures.length, diagnostics: { topThree, estimatedSynchronousCalculationMs: run.workerCalculationTimeMs, browserEndToEndMeasurement: "unavailable in Node fixture runner" } };
}