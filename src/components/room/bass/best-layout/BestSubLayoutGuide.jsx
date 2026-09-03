import React, { useMemo, useSyncExternalStore } from "react";
import Rp22PlacementRecommendation from "@/components/room/bass/best-layout/Rp22PlacementRecommendation";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { getStage2State, subscribeStage2 } from "@/components/room/bass/stage2/stage2PlacementStore";
import { useP14AnalysisProgress } from "@/components/room/bass/p14AnalysisProgressStore";
import { buildCurrentCanonicalLayout, buildStage2RecommendationLayout } from "./stage2RecommendationAdapter";
import { buildFourSubFamilyComparison } from "./fourSubFamilyComparison";
import { setRecommendationGateActive } from "@/components/state/recommendationGateStore";

function placementPhaseText(stage2, p14Progress) {
  const p14Complete = p14Progress?.status === "complete"
    && Number(p14Progress?.completed) >= Number(p14Progress?.total)
    && Number(p14Progress?.total) === 8;
  if (!p14Complete) {
    return `Bass analysis · ${Number(p14Progress?.completed) || 0} of ${Number(p14Progress?.total) || 8}`;
  }
  if (stage2?.status === "complete") return "Recommendations ready";
  if (stage2?.phase === "evaluating_1_sub") return "Evaluating 1-sub layouts…";
  if (stage2?.phase === "evaluating_2_sub") return "Evaluating 2-sub layouts…";
  if (stage2?.phase === "evaluating_4_sub") return "Evaluating 4-sub layouts…";
  return "Preparing placement analysis…";
}

export default function BestSubLayoutGuide({ roomDims, seatingPositions, rspPosition, sourceHeights, currentSubs, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, subwooferInstances, commitInstances, hasCanonicalInstances }) {
  const projectId = useActiveProjectId();
  // Gate: while this recommendation UI is mounted, Stage 1/Stage 2 placement
  // optimisers and the P14 background sweep are permitted to run. Unmount
  // (panel collapsed) gates them off — no speculative work during dragging.
  React.useEffect(() => {
    setRecommendationGateActive(true);
    return () => setRecommendationGateActive(false);
  }, []);
  const sharedBassResults = useOptionalSharedBassResults();
  const canonical = useMemo(
    () => canonicalizeNormalizedRoomInputs({ roomDims, seatingPositions, rspPosition }),
    [roomDims, seatingPositions, rspPosition],
  );
  const stage2 = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId),
    () => getStage2State(projectId),
  );
  const p14Progress = useP14AnalysisProgress(projectId);
  const recommendationsReady = stage2.status === "complete"
    && p14Progress.status === "complete"
    && Number(p14Progress.completed) >= 8;
  const currentContract = sharedBassResults?.contract || null;
  const currentLayout = useMemo(() => buildCurrentCanonicalLayout({
    currentSubs,
    roomDims: canonical.roomDims,
    seatingPositions: canonical.seatingPositions,
    contract: currentContract,
    authoritative: sharedBassResults?.completedBassAuthority?.authoritative === true,
  }), [currentSubs, canonical.roomDims, canonical.seatingPositions, currentContract, sharedBassResults?.completedBassAuthority?.authoritative]);

  const buildOption = (quantityResult) => recommendationsReady
    ? buildStage2RecommendationLayout({
        quantityResult,
        roomDims: canonical.roomDims,
        seatingPositions: canonical.seatingPositions,
        sourceHeightM: sourceHeights?.front,
        currentLayout,
        currentContract,
      })
    : null;

  const best1 = useMemo(() => buildOption(stage2.one_sub_result), [recommendationsReady, stage2.one_sub_result, canonical.roomDims, canonical.seatingPositions, sourceHeights?.front, currentLayout, currentContract]);
  const best2 = useMemo(() => buildOption(stage2.two_sub_result), [recommendationsReady, stage2.two_sub_result, canonical.roomDims, canonical.seatingPositions, sourceHeights?.front, currentLayout, currentContract]);
  const best4 = useMemo(() => buildOption(stage2.four_sub_result), [recommendationsReady, stage2.four_sub_result, canonical.roomDims, canonical.seatingPositions, sourceHeights?.front, currentLayout, currentContract]);
  const fourSubFamilyComparison = useMemo(
    () => recommendationsReady ? buildFourSubFamilyComparison(stage2.four_sub_result) : null,
    [recommendationsReady, stage2.four_sub_result],
  );
  const phaseText = placementPhaseText(stage2, p14Progress);
  const progressText = stage2.status === "updating" && stage2.totalJobsPlanned > 0
    ? `Optimising subwoofer positions · ${stage2.completedJobs} of ${stage2.totalJobsPlanned} finalists`
    : phaseText;

  return (
    <div className="mt-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4" data-stage2-status={stage2.status} data-stage2-jobs={stage2.canonicalJobsRun}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Subwoofer Placement Guide</h5>
          <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">Compares recognised 1-, 2- and 4-subwoofer layouts using the selected product, target and full canonical bass authority.</p>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-[#625143]">{progressText}</span>
      </div>
      {stage2.status === "error" && <p className="mt-3 text-xs text-red-700">Recommendation authority could not be completed.</p>}
      <Rp22PlacementRecommendation
        roomDims={canonical.roomDims}
        currentLayout={currentLayout}
        best1={best1}
        best2={best2}
        best4={best4}
        fourSubFamilyComparison={fourSubFamilyComparison}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        setFrontSubsCfg={setFrontSubsCfg}
        setRearSubsCfg={setRearSubsCfg}
        isRecalculating={!recommendationsReady}
        recommendationStatus={recommendationsReady ? "ready" : "updating"}
        recommendationPhase={phaseText}
        currentSubs={currentSubs}
        subwooferInstances={subwooferInstances}
        commitInstances={commitInstances}
        hasCanonicalInstances={hasCanonicalInstances}
      />
      <p className="mt-3 text-[11px] text-[#8A7B6A]">Advisory only — the current design remains unchanged until a recommendation is applied.</p>
    </div>
  );
}