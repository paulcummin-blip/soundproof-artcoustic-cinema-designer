import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutDirectReference } from "@/components/room/bass/best-layout/bestSubLayoutDirectReference";
import { assessLayoutResult, compareRankedLayouts } from "@/components/room/bass/best-layout/bestSubLayoutScoring";

export function runBestSubLayoutRecommendation({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs }) {
  const started = performance.now();
  const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).filter((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
  const rspOnly = realSeats.length === 0;
  const generated = generateBestSubLayoutCandidateSet(roomDims, sourceHeights, roomElements);
  const currentSources = (Array.isArray(currentSubs) ? currentSubs : []).map((sub, index) => {
    const position = sub?.position || sub;
    const x = Number(position?.x), y = Number(position?.y), z = Number(position?.z);
    if (![x, y].every(Number.isFinite)) return null;
    return { id: sub?.id || `current-sub-${index + 1}`, x, y, z: Number.isFinite(z) ? z : C.fallbackSourceHeightM, placement: sub?.group === "rear" ? "rear" : "front", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }).filter(Boolean);
  const candidates = generated.candidates;
  const diagnostics = { ...generated.diagnostics, currentSourceCount: currentSources.length };
  const engineOptions = { ...physicsOptions, freqMinHz: 20, freqMaxHz: 200, smoothing: "none", pointsPerOctave: C.previewPointsPerOctave };
  const preparedModes = prepareModeBank(roomDims, engineOptions);
  const listeners = { rspPosition: rspOnly ? rspPosition : null, seatingPositions: rspOnly ? [] : realSeats };
  const assess = (layout) => {
    const common = { roomDims, ...listeners, pointsPerOctave: C.previewPointsPerOctave };
    const transfer = computeNormalizedRoomTransfer({ ...common, subsForSimulation: layout.sources, physicsOptions, preparedModes });
    const directReference = computeBestSubLayoutDirectReference({ ...common, sources: layout.sources, physicsOptions });
    return assessLayoutResult(layout, transfer, directReference, rspOnly);
  };
  const ranked = candidates.map(assess).sort(compareRankedLayouts);
  const currentLayout = currentSources.length ? assess({ id: "current-layout", name: "Current layout", placementFamily: "Current design", placementMode: "Current positions", sources: currentSources }) : null;
  const currentQuantityBest = ranked.find((layout) => layout.metrics.sourceCount === currentSources.length) || null;
  const upgradeBest = ranked.find((layout) => layout.metrics.sourceCount > currentSources.length) || null;
  return {
    recommendations: ranked.slice(0, C.maximumRecommendations),
    currentQuantityBest,
    upgradeBest,
    allCandidates: ranked,
    candidateCount: candidates.length,
    renderedRecommendationCount: Math.min(ranked.length, C.maximumRecommendations),
    rspOnly,
    currentLayout,
    diagnostics,
    workerCalculationTimeMs: performance.now() - started,
    physicsOptions,
  };
}