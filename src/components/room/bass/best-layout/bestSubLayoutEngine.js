import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions, buildPreviewPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { BEST_SUB_LAYOUT_CONSTANTS as C, BEST_SUB_LAYOUT_PHYSICS_PARAMS } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidates } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { assessLayoutResult, compareRankedLayouts } from "@/components/room/bass/best-layout/bestSubLayoutScoring";

export function runBestSubLayoutRecommendation({ roomDims, seatingPositions, rspPosition }) {
  const started = performance.now();
  const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).filter((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
  const rspOnly = realSeats.length === 0;
  const candidates = generateBestSubLayoutCandidates(roomDims);
  const physicsOptions = buildPreviewPhysicsOptions(buildNormalizedPhysicsOptions(BEST_SUB_LAYOUT_PHYSICS_PARAMS));
  const engineOptions = { ...physicsOptions, freqMinHz: 20, freqMaxHz: 200, smoothing: "none", pointsPerOctave: C.previewPointsPerOctave };
  const preparedModes = prepareModeBank(roomDims, engineOptions);
  const ranked = candidates.map((layout) => {
    const transfer = computeNormalizedRoomTransfer({
      roomDims, rspPosition: rspOnly ? rspPosition : null, seatingPositions: rspOnly ? [] : realSeats,
      subsForSimulation: layout.sources, physicsOptions, pointsPerOctave: C.previewPointsPerOctave, preparedModes,
    });
    return assessLayoutResult(layout, transfer, rspOnly);
  }).sort(compareRankedLayouts);
  return {
    recommendations: ranked.slice(0, C.maximumRecommendations),
    allCandidates: ranked, candidateCount: candidates.length, rspOnly,
    workerCalculationTimeMs: performance.now() - started,
    physicsOptions,
  };
}