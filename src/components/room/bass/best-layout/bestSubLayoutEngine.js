import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { computeBestSubLayoutDirectReference } from "@/components/room/bass/best-layout/bestSubLayoutDirectReference";
import { applyFinalOptimisedAuthorityToLayout, assessLayoutResult, compareRankedLayouts } from "@/components/room/bass/best-layout/bestSubLayoutScoring";
import { alignSubsToRSP } from "@/components/room/bass/alignSubsToRSP";

// Four-sub family identifiers — retained for fixture/geometry screening only.
// The dealer-facing 25/75 vs 33/67 comparison is NOT produced here; it is derived
// from completed Stage 2 canonical finalists (see fourSubFamilyComparison.js).
// This lighter-weight engine generates and screens geometry only.
export const FOUR_SUB_FAMILY_QUARTER = "front-rear-pairs-4";
export const FOUR_SUB_FAMILY_THIRD = "front-rear-pairs-third-4";

export function runBestSubLayoutRecommendation({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs, finalOptimisedBassResponse, cabinetHalfExtents }) {
  const started = performance.now();
  const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).filter((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
  const rspOnly = realSeats.length === 0;
  const generated = generateBestSubLayoutCandidateSet(roomDims, sourceHeights, roomElements, cabinetHalfExtents);
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
  // Alignment authority: apply the existing automatic front/rear alignment to
  // every candidate before scoring so both four-sub families are compared with
  // the identical delay state the final applied layout will use. This reuses
  // the production alignSubsToRSP maths without changing them.
  const alignSources = (sources) => (rspPosition ? alignSubsToRSP(sources, rspPosition) : sources);
  const assess = (layout) => {
    const alignedSources = alignSources(layout.sources);
    const common = { roomDims, ...listeners, pointsPerOctave: C.previewPointsPerOctave };
    const transfer = computeNormalizedRoomTransfer({ ...common, subsForSimulation: alignedSources, physicsOptions, preparedModes });
    const directReference = computeBestSubLayoutDirectReference({ ...common, sources: alignedSources, physicsOptions });
    const assessed = assessLayoutResult(layout, transfer, directReference, rspOnly);
    // Carry the alignment delays used during scoring so the result is traceable.
    assessed.metrics.alignmentDelaysMs = alignedSources.map((source) => Number(source?.tuning?.delayMs) || 0);
    assessed.metrics.alignmentAuthority = "alignSubsToRSP";
    return assessed;
  };
  const ranked = candidates.map(assess).sort(compareRankedLayouts);
  const currentLayoutRaw = currentSources.length ? assess({ id: "current-layout", name: "Current layout", placementFamily: "Current design", placementMode: "Current positions", sources: currentSources }) : null;
  const currentLayout = applyFinalOptimisedAuthorityToLayout(currentLayoutRaw, finalOptimisedBassResponse);
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