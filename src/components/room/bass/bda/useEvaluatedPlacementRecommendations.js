// useEvaluatedPlacementRecommendations.js
// ---------------------------------------------------------------------------
// React hook for the Subwoofer Design Starting Layout cards.
//
// It connects the existing 1/2/4-subwoofer Stage 1 + Stage 2 cross-quantity
// recommendation authority to the cards WITHOUT creating a second placement
// interface or another competing guide. While mounted it:
//   • opens the shared recommendation gate so Stage 1/2 speculative work is
//     permitted (the gate is closed when no recommendation UI is mounted),
//   • mints one stable request identity for the mount,
//   • drives useStage1PlacementOptimiser + useStage2PlacementOptimiser with
//     recommendationQuantities [1, 2, 4], using the current room, fixed RSP and
//     listening-position priorities,
//   • maps the Stage 2 best-finalist per quantity into the compact option
//     shape the cards render.
//
// It evaluates nothing and changes no bass maths. The options it returns are a
// reformatted view of the Stage 2 canonical evaluation's own evidence.
//
// The hook is gated on having a selected subwoofer model and a derivable P14
// target, because Stage 2 cannot evaluate without them. When those are absent
// (a brand-new project before a model is chosen) it returns status "waiting"
// and no options, so the cards fall back to the geometric starting layouts.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useStage1PlacementOptimiser } from "../stage1/useStage1PlacementOptimiser";
import { useStage2PlacementOptimiser } from "../stage2/useStage2PlacementOptimiser";
import {
  setRecommendationGateActive,
  subscribeRecommendationGate,
  isRecommendationGateActive,
} from "@/components/state/recommendationGateStore";
import { selectBestSubLayoutPhysics } from "../best-layout/bestSubLayoutPhysicsSnapshot";
import { useBestSubLayoutLiveInputs } from "../best-layout/bestSubLayoutLiveInputs";
import { resolveBestSubLayoutContextId } from "../best-layout/bestSubLayoutContext";
import { useActiveProjectId } from "@/components/state/project-session";
import { RECOMMENDATION_QUANTITIES } from "../stage1/stage1RecommendationScope";
import { selectEvaluatedOptions } from "./evaluatedOptionPresentation";
import { resolveP14TargetSelectionState } from "../p14TargetSelectionState";
import { normaliseModelKey } from "@/components/models/speakers/registry";
import {
  subscribeStage2,
  getStage2State,
} from "../stage2/stage2PlacementStore";

let requestCounter = 0;

function useStableRequestId() {
  const ref = useRef(null);
  if (!ref.current) ref.current = `bda-rec-${++requestCounter}`;
  return ref.current;
}

function buildSeatPriorityMap(seatingPositions) {
  const map = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat?.id || `${seat?.x}-${seat?.y}`);
    map.set(id, seat?.priority === "secondary" ? "secondary" : "primary");
  });
  return map;
}

function deriveEvaluatedInputs({
  roomDims,
  rspPosition,
  seatingPositions,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances,
  appState,
  amplifierPowerPerSubW,
}) {
  const selectedSubModel = normaliseModelKey(frontSubsCfg?.model || rearSubsCfg?.model) || null;
  const subwooferBottomHeightM = Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
    ? Number(frontSubsCfg.bottomHeightM)
    : Number.isFinite(Number(rearSubsCfg?.bottomHeightM))
      ? Number(rearSubsCfg.bottomHeightM)
      : 0;
  const frontOrientation = frontSubsCfg?.orientation ?? null;
  const rearOrientation = rearSubsCfg?.orientation ?? null;
  const currentQuantity = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s?.enabled !== false && s?.model).length;

  const p14Selection = resolveP14TargetSelectionState(appState?.splConfig || null);
  const hasP14Target = !p14Selection.noP14TargetSelected;

  const roomValid = Number(roomDims?.widthM) > 0
    && Number(roomDims?.lengthM) > 0
    && Number(roomDims?.heightM) > 0;
  const rspValid = Number.isFinite(Number(rspPosition?.x)) && Number.isFinite(Number(rspPosition?.y));
  const seatsValid = Array.isArray(seatingPositions) && seatingPositions.length > 0;

  const canEvaluate = Boolean(selectedSubModel) && hasP14Target && roomValid && rspValid && seatsValid;

  return {
    selectedSubModel,
    subwooferBottomHeightM,
    frontOrientation,
    rearOrientation,
    currentQuantity,
    amplifierPowerPerSubW,
    canEvaluate,
  };
}

export function useEvaluatedPlacementRecommendations({
  roomDims,
  rspPosition,
  seatingPositions,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances,
  appState,
  amplifierPowerPerSubW,
}) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const requestId = useStableRequestId();
  const recGateActive = useSyncExternalStore(
    subscribeRecommendationGate,
    isRecommendationGateActive,
    isRecommendationGateActive,
  );

  useEffect(() => {
    setRecommendationGateActive(true);
    return () => setRecommendationGateActive(false);
  }, []);

  const liveInputs = useBestSubLayoutLiveInputs();
  const contextId = useMemo(
    () => resolveBestSubLayoutContextId({ projectId, roomDims }),
    [projectId, roomDims],
  );
  const physicsOptions = selectBestSubLayoutPhysics(liveInputs, contextId);

  const inputs = useMemo(
    () => deriveEvaluatedInputs({
      roomDims, rspPosition, seatingPositions, frontSubsCfg, rearSubsCfg,
      subwooferInstances, appState, amplifierPowerPerSubW,
    }),
    [roomDims, rspPosition, seatingPositions, frontSubsCfg, rearSubsCfg,
      subwooferInstances, appState, amplifierPowerPerSubW],
  );

  const stage1Enabled = recGateActive && inputs.canEvaluate;

  useStage1PlacementOptimiser({
    projectId,
    versionId,
    roomDims,
    rspPosition,
    seatingPositions,
    physicsOptions,
    enabled: stage1Enabled,
    requestId: stage1Enabled ? requestId : null,
    recommendationQuantities: RECOMMENDATION_QUANTITIES,
  });

  useStage2PlacementOptimiser({
    projectId,
    versionId,
    roomDims,
    rspPosition,
    seatingPositions,
    selectedSubModel: inputs.selectedSubModel,
    amplifierPowerPerSubW: inputs.amplifierPowerPerSubW,
    splConfig: appState?.splConfig || null,
    currentQuantity: inputs.currentQuantity,
    subwooferBottomHeightM: inputs.subwooferBottomHeightM,
    frontOrientation: inputs.frontOrientation,
    rearOrientation: inputs.rearOrientation,
    enabled: stage1Enabled,
    requestId: stage1Enabled ? requestId : null,
    recommendationQuantities: RECOMMENDATION_QUANTITIES,
  });

  const stage2State = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId, versionId),
    () => getStage2State(projectId, versionId),
  );

  const seatPriorityMap = useMemo(
    () => buildSeatPriorityMap(seatingPositions),
    [seatingPositions],
  );

  const options = useMemo(
    () => selectEvaluatedOptions(stage2State, seatPriorityMap, {
      roomDims,
      selectedSubModel: inputs.selectedSubModel,
      subwooferBottomHeightM: inputs.subwooferBottomHeightM,
    }),
    [stage2State, seatPriorityMap, roomDims, inputs.selectedSubModel, inputs.subwooferBottomHeightM],
  );

  const status = (() => {
    if (!inputs.canEvaluate) return "waiting";
    if (stage2State?.status === "error") return "error";
    if (stage2State?.status === "complete") return "complete";
    if (stage2State?.status === "updating") return "evaluating";
    return "idle";
  })();

  const isCurrent = stage2State?.status === "complete";

  return { options, status, isCurrent, stage2Fingerprint: stage2State?.fingerprint || null };
}