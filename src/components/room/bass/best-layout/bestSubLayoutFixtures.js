import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidates } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";
import { compareRankedLayouts, gradeLayout } from "@/components/room/bass/best-layout/bestSubLayoutScoring";
import { runBestSubLayoutRecommendation } from "@/components/room/bass/best-layout/bestSubLayoutEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";

const dir = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(join(dir, "useBestSubLayoutRecommendations.js"), "utf8");
const guideSource = readFileSync(join(dir, "BestSubLayoutGuide.jsx"), "utf8");
const room = { widthM: 5.5, lengthM: 7.2, heightM: 2.7 };
const seats = [{ id: "s1", x: 2.1, y: 4.5, z: 1.2 }, { id: "s2", x: 2.75, y: 4.5, z: 1.2 }, { id: "s3", x: 3.4, y: 4.5, z: 1.2 }];
const rsp = { x: 2.75, y: 4.5, z: 1.2 };
const sourceHeights = { front: 0.08, rear: 0.16 };
const physics = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "production", enableRewCoreReflections: false, roomDamping: 20, axialQ: 4, modalSourceReferenceMode: "existing", modalGainScalar: 1, modalDistanceBlend: 0, modalStorageMode: "none", propagationPhaseScale: 1, modalCoherenceMode: "coherent", highOrderAxialScale: 1, rewModalBandwidthScale: 0.55 });
const result = (name, passed, details = "") => ({ name, passed: !!passed, details });
const metricLayout = (id, sourceCount, overrides = {}) => ({ id, metrics: { destructiveBroadNullCount: 0, worstSeatBroadNullDepthDb: 0, worstSeatVariationDb: 2, lowestReliableNormalizedFrequencyHz: 25, worstSeatTransferEfficiencyDb: -2, sourceCount, ...overrides } });

export function runBestSubLayoutFixtures() {
  const candidates = generateBestSubLayoutCandidates(room, sourceHeights);
  const first = runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: seats, rspPosition: rsp, physicsOptions: physics, sourceHeights });
  const second = runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: seats, rspPosition: rsp, physicsOptions: physics, sourceHeights });
  const fp = (overrides = {}) => computeBestSubLayoutFingerprint({ roomDims: room, seatingPositions: seats, rspPosition: rsp, physicsOptions: physics, sourceHeights, ...overrides });
  const duplicateKeys = candidates.map((layout) => layout.sources.map((source) => `${source.x},${source.y},${source.z}`).sort().join("|"));
  const goodMetrics = { destructiveBroadNullCount: 0, transferEfficiencyClass: "Strong", worstSeatVariationDb: 2, perSeat: [{ worstNullDepthDb: 0, extensionHz: 25, relativeTransferEfficiencyDb: -2 }] };
  const fixtures = [
    result("1. Same inputs produce identical ordering and scores", JSON.stringify(first.allCandidates.map((item) => [item.id, item.metrics.rankingScore])) === JSON.stringify(second.allCandidates.map((item) => [item.id, item.metrics.rankingScore]))),
    result("2. Product-only metadata leaves fingerprint and ranking unchanged", fp({ model: "SUB2-12" }) === fp({ model: "SUB4-12" }) && JSON.stringify(first.allCandidates.map((item) => item.id)) === JSON.stringify(second.allCandidates.map((item) => item.id))),
    result("3. Moving a seat changes fingerprint", fp() !== fp({ seatingPositions: [{ ...seats[0], y: seats[0].y + 0.2 }, ...seats.slice(1)] })),
    result("4. Changing room dimensions changes fingerprint", fp() !== fp({ roomDims: { ...room, widthM: room.widthM + 0.2 } })),
    result("5. Layouts contain only 1, 2, or 4 sources", candidates.every((item) => C.allowedSourceCounts.includes(item.sources.length))),
    result("6. No layout exceeds four sources", candidates.every((item) => item.sources.length <= 4)),
    result("7. Every source is inside room and on stated boundary", candidates.every((item) => item.sources.every((source) => source.x >= 0 && source.x <= room.widthM && ((source.placement === "front" && source.y === 0) || (source.placement === "rear" && source.y === room.lengthM))))),
    result("8. Duplicate layouts are removed", duplicateKeys.length === new Set(duplicateKeys).size),
    result("9. All real seats are assessed", first.allCandidates.every((item) => item.metrics.realSeatsAssessed === seats.length && !item.metrics.rspOnly)),
    result("10. RSP fallback is identified without real seats", runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: [], rspPosition: rsp, physicsOptions: physics, sourceHeights }).recommendations.every((item) => item.metrics.rspOnly && item.metrics.realSeatsAssessed === 0)),
    result("11. Zero-null layout beats serious-null layout", [metricLayout("bad", 1, { destructiveBroadNullCount: 1, worstSeatBroadNullDepthDb: 15 }), metricLayout("good", 4)].sort(compareRankedLayouts)[0].id === "good"),
    result("12. Good average cannot hide a failing worst seat", [metricLayout("failing", 1, { destructiveBroadNullCount: 1, worstSeatTransferEfficiencyDb: -1 }), metricLayout("safe", 2, { worstSeatTransferEfficiencyDb: -3 })].sort(compareRankedLayouts)[0].id === "safe"),
    result("13. A+ blocked by any destructive null", !gradeLayout({ ...goodMetrics, destructiveBroadNullCount: 1, perSeat: [{ worstNullDepthDb: 12, extensionHz: 25, relativeTransferEfficiencyDb: -2 }] }, false).startsWith("A+")),
    result("14. RSP-only A+ is provisional", gradeLayout(goodMetrics, true) === "A+ provisional"),
    result("15. More sources do not win an acoustic tie", [metricLayout("four", 4), metricLayout("one", 1)].sort(compareRankedLayouts)[0].id === "one"),
    result("16. Stale responses require request ID and fingerprint match", hookSource.includes("message.requestId !== active.requestId") && hookSource.includes("message.fingerprint !== active.fingerprint")),
    result("17. Product change does not start worker request", !hookSource.includes("frontSubsCfg") && !hookSource.includes("modelKey")),
    result("18. Only three recommendations reach UI", first.recommendations.length === 3 && first.renderedRecommendationCount === 3 && guideSource.includes("items.slice(0, 3)")),
  ];
  const passed = fixtures.filter((item) => item.passed).length;
  return { results: fixtures, passed, total: fixtures.length, allPassed: passed === fixtures.length };
}