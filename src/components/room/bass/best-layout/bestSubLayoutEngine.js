import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutDirectReference } from "@/components/room/bass/best-layout/bestSubLayoutDirectReference";
import { assessLayoutResult, compareRankedLayouts } from "@/components/room/bass/best-layout/bestSubLayoutScoring";

export function runBestSubLayoutRecommendation({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights }) {
  const started = performance.now();
  const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).filter((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
  const rspOnly = realSeats.length === 0;
  const { candidates, diagnostics } = generateBestSubLayoutCandidateSet(roomDims, sourceHeights);
  const engineOptions = { ...physicsOptions, freqMinHz: 20, freqMaxHz: 200, smoothing: "none", pointsPerOctave: C.previewPointsPerOctave };
  const preparedModes = prepareModeBank(roomDims, engineOptions);
  const listeners = { rspPosition: rspOnly ? rspPosition : null, seatingPositions: rspOnly ? [] : realSeats };
  const ranked = candidates.map((layout) => {
    const common = { roomDims, ...listeners, pointsPerOctave: C.previewPointsPerOctave };
    const transfer = computeNormalizedRoomTransfer({ ...common, subsForSimulation: layout.sources, physicsOptions, preparedModes });
    const directReference = computeBestSubLayoutDirectReference({ ...common, sources: layout.sources, physicsOptions });
    return assessLayoutResult(layout, transfer, directReference, rspOnly);
  }).sort(compareRankedLayouts);
  return {
    recommendations: ranked.slice(0, C.maximumRecommendations),
    allCandidates: ranked,
    candidateCount: candidates.length,
    renderedRecommendationCount: Math.min(ranked.length, C.maximumRecommendations),
    rspOnly,
    diagnostics,
    workerCalculationTimeMs: performance.now() - started,
    physicsOptions,
  };
}