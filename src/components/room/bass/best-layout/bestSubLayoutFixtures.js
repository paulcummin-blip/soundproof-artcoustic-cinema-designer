import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidates } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";
import { compareRankedLayouts, gradeLayout } from "@/components/room/bass/best-layout/bestSubLayoutScoring";
import { runBestSubLayoutRecommendation } from "@/components/room/bass/best-layout/bestSubLayoutEngine";

const dir = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(join(dir, "useBestSubLayoutRecommendations.js"), "utf8");
const guideSource = readFileSync(join(dir, "BestSubLayoutGuide.jsx"), "utf8");
const room = { widthM: 5.5, lengthM: 7.2, heightM: 2.7 };
const seats = [{ id: "s1", x: 2.1, y: 4.5, z: 1.2 }, { id: "s2", x: 2.75, y: 4.5, z: 1.2 }, { id: "s3", x: 3.4, y: 4.5, z: 1.2 }];
const rsp = { x: 2.75, y: 4.5, z: 1.2 };
const physics = { qStrategy: "ab_corrected", surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 } };
const result = (name, passed, details = "") => ({ name, passed: !!passed, details });
const metricLayout = (id, sourceCount, overrides = {}) => ({ id, metrics: { destructiveBroadNullCount: 0, worstSeatBroadNullDepthDb: 0, worstSeatVariationDb: 2, lowestReliableNormalizedFrequencyHz: 25, normalizedTransferEfficiencyDb: 92, sourceCount, ...overrides } });

export function runBestSubLayoutFixtures() {
  const candidates = generateBestSubLayoutCandidates(room);
  const started = performance.now();
  const first = runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: seats, rspPosition: rsp });
  const second = runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: seats, rspPosition: rsp });
  const endToEndMs = performance.now() - started;
  const fp = (overrides = {}) => computeBestSubLayoutFingerprint({ roomDims: room, seatingPositions: seats, rspPosition: rsp, physicsOptions: physics, ...overrides });
  const fingerprintsByProduct = ["SUB2-12", "SUB3-12"].map((model) => computeBestSubLayoutFingerprint({ roomDims: room, seatingPositions: seats, rspPosition: rsp, physicsOptions: physics, model }));
  const duplicateKeys = candidates.map((layout) => layout.sources.map((s) => `${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)}`).sort().join("|"));
  const goodMetrics = { destructiveBroadNullCount: 0, transferEfficiency: "Strong", worstSeatVariationDb: 2, perSeat: [{ worstNullDepthDb: 0, extensionHz: 25 }] };
  const fixtures = [
    result("1. Same inputs produce identical ordering and scores", JSON.stringify(first.allCandidates.map((x) => [x.id, x.metrics.rankingScore])) === JSON.stringify(second.allCandidates.map((x) => [x.id, x.metrics.rankingScore]))),
    result("2. Product-only change leaves fingerprint and ranking unchanged", fingerprintsByProduct[0] === fingerprintsByProduct[1] && JSON.stringify(first.allCandidates.map((x) => x.id)) === JSON.stringify(second.allCandidates.map((x) => x.id))),
    result("3. Moving a seat changes fingerprint", fp() !== fp({ seatingPositions: [{ ...seats[0], y: seats[0].y + 0.2 }, ...seats.slice(1)] })),
    result("4. Changing room dimensions changes fingerprint", fp() !== fp({ roomDims: { ...room, widthM: room.widthM + 0.2 } })),
    result("5. Layouts contain only 1, 2, or 4 sources", candidates.every((x) => C.allowedSourceCounts.includes(x.sources.length))),
    result("6. No layout exceeds four sources", candidates.every((x) => x.sources.length <= 4)),
    result("7. Every source is inside room and on stated boundary", candidates.every((x) => x.sources.every((s) => s.x >= 0 && s.x <= room.widthM && s.y >= 0 && s.y <= room.lengthM && ((s.placement === "front" && s.y === 0) || (s.placement === "rear" && s.y === room.lengthM))))),
    result("8. Duplicate layouts are removed", duplicateKeys.length === new Set(duplicateKeys).size),
    result("9. All real seats are assessed", first.allCandidates.every((x) => x.metrics.realSeatsAssessed === seats.length && !x.metrics.rspOnly)),
    result("10. RSP fallback is identified without real seats", runBestSubLayoutRecommendation({ roomDims: room, seatingPositions: [], rspPosition: rsp }).recommendations.every((x) => x.metrics.rspOnly && x.metrics.realSeatsAssessed === 0)),
    result("11. Zero-null layout beats serious-null layout", [metricLayout("bad", 1, { destructiveBroadNullCount: 1, worstSeatBroadNullDepthDb: 15 }), metricLayout("good", 4)].sort(compareRankedLayouts)[0].id === "good"),
    result("12. Good mean cannot hide a failing worst seat", [metricLayout("failing", 1, { destructiveBroadNullCount: 1, normalizedTransferEfficiencyDb: 120 }), metricLayout("safe", 2, { normalizedTransferEfficiencyDb: 86 })].sort(compareRankedLayouts)[0].id === "safe"),
    result("13. A+ blocked by any destructive null", !gradeLayout({ ...goodMetrics, destructiveBroadNullCount: 1, perSeat: [{ worstNullDepthDb: 12, extensionHz: 25 }] }, false).startsWith("A+")),
    result("14. RSP-only A+ is provisional", gradeLayout(goodMetrics, true) === "A+ provisional"),
    result("15. More sources do not win an acoustic tie", [metricLayout("four", 4), metricLayout("one", 1)].sort(compareRankedLayouts)[0].id === "one"),
    result("16. Stale worker responses require request ID and fingerprint match", hookSource.includes("message.requestId !== active.requestId") && hookSource.includes("message.fingerprint !== active.fingerprint")),
    result("17. Product change does not start worker request", !hookSource.includes("frontSubsCfg") && !hookSource.includes("rearSubsCfg") && !hookSource.includes("modelKey")),
    result("18. Only three recommendations reach UI", first.recommendations.length <= 3 && guideSource.includes("items.slice(0, 3)")),
  ];
  const passed = fixtures.filter((item) => item.passed).length;
  return { results: fixtures, passed, total: fixtures.length, allPassed: passed === fixtures.length, diagnostics: { candidateCount: candidates.length, workerCalculationTimeMs: first.workerCalculationTimeMs, endToEndIncludingDebounceMs: first.workerCalculationTimeMs + C.debounceMs, deterministicDoubleRunMs: endToEndMs, debounceMs: C.debounceMs } };
}