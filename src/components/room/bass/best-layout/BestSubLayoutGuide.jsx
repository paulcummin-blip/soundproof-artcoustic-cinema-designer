import React, { useMemo } from "react";
import Rp22PlacementRecommendation from "@/components/room/bass/best-layout/Rp22PlacementRecommendation";
import { useBestSubLayoutRecommendations } from "@/components/room/bass/best-layout/useBestSubLayoutRecommendations";
import { useBestSubLayoutLiveInputs } from "@/components/room/bass/best-layout/bestSubLayoutLiveInputs";
import { selectBestSubLayoutPhysics } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";

export default function BestSubLayoutGuide({ roomDims, seatingPositions, rspPosition, sourceHeights, contextId, roomElements, currentSubs, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, subwooferInstances, setSubwooferInstances, commitInstances, hasCanonicalInstances }) {
  const livePhysics = useBestSubLayoutLiveInputs();
  const sharedBassResults = useOptionalSharedBassResults();
  const finalOptimisedBassResponse = sharedBassResults?.optimisationResult?.finalOptimisedBassResponse || null;
  const canonical = useMemo(() => canonicalizeNormalizedRoomInputs({ roomDims, seatingPositions, rspPosition }), [roomDims, seatingPositions, rspPosition]);
  const physicsOptions = selectBestSubLayoutPhysics(livePhysics, contextId);
  const recommendation = useBestSubLayoutRecommendations({ ...canonical, physicsOptions, sourceHeights, roomElements, currentSubs, finalOptimisedBassResponse });

  // Derive the best recognised layout for each target subwoofer quantity from
  // the ranked candidate set. The engine already generates 1/2/4-sub layouts.
  const allCandidates = recommendation.result?.allCandidates || [];
  const best1 = useMemo(() => allCandidates.find((c) => c?.metrics?.sourceCount === 1) || null, [allCandidates]);
  const best2 = useMemo(() => allCandidates.find((c) => c?.metrics?.sourceCount === 2) || null, [allCandidates]);
  const best4 = useMemo(() => allCandidates.find((c) => c?.metrics?.sourceCount === 4) || null, [allCandidates]);
  const hasAnyOption = Boolean(best1 || best2 || best4);
  const showPanel = recommendation.status === "ready" && (recommendation.result?.currentLayout || hasAnyOption);

  return (
    <div className="mt-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4" data-layout-candidates={recommendation.result?.candidateCount ?? 0} data-layout-cards={hasAnyOption ? 3 : 0}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Subwoofer Placement Guide</h5>
          <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">Compares recognised 1-, 2- and 4-subwoofer layouts for this room using the bass simulation. Subwoofer model capability and RP22 levels are calculated separately.</p>
        </div>
        {recommendation.isUpdating && <span className="text-[10px] font-medium text-[#625143]">Updating…</span>}
      </div>
      {recommendation.status === "idle" && <p className="mt-3 text-xs text-[#625143]">Waiting for valid room geometry and listening positions.</p>}
      {recommendation.status === "error" && <p className="mt-3 text-xs text-red-700">Recommendation could not be calculated.</p>}
      {recommendation.result?.rspOnly && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Provisional RSP-only result — add real seats for a definitive multi-seat prediction.</p>}
      {showPanel && (
        <Rp22PlacementRecommendation
          roomDims={canonical.roomDims}
          currentLayout={recommendation.result.currentLayout}
          best1={best1}
          best2={best2}
          best4={best4}
          frontSubsCfg={frontSubsCfg}
          rearSubsCfg={rearSubsCfg}
          setFrontSubsCfg={setFrontSubsCfg}
          setRearSubsCfg={setRearSubsCfg}
          isRecalculating={recommendation.isUpdating}
          currentSubs={currentSubs}
          subwooferInstances={subwooferInstances}
          commitInstances={commitInstances}
          hasCanonicalInstances={hasCanonicalInstances}
        />
      )}
      {recommendation.status === "ready" && !showPanel && <p className="mt-3 text-xs text-[#625143]">Add a subwoofer to compare the current design with recognised RP22 layouts.</p>}
      {recommendation.status === "calculating" && !hasAnyOption && <p className="mt-3 text-xs text-[#625143]">Calculating room-placement recommendations…</p>}
      <p className="mt-3 text-[11px] text-[#8A7B6A]">Advisory only — the current design remains unchanged until a recommendation is applied.</p>
    </div>
  );
}