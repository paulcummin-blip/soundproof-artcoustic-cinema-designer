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
// Stage 1 (geometry discovery) is gated ONLY on valid room dimensions, seating
// and effective RSP — it is product- and P14-independent. Stage 2 (canonical
// evaluation) additionally requires a selected subwoofer model and P14 target.
// Separating the two readiness conditions lets Stage 1 run and retain its
// finalists before a model or target is chosen, so the designer sees discovery
// progress and the candidates are ready the instant the prerequisites are met.
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
import { buildAdiShortlist } from "./adiShortlistSelection";
import { resolveP14TargetSelectionState } from "../p14TargetSelectionState";
import { normaliseModelKey } from "@/components/models/speakers/registry";
import {
  subscribeStage2,
  getStage2State,
} from "../stage2/stage2PlacementStore";
import {
  subscribeStage1,
  getStage1State,
} from "../stage1/stage1PlacementStore";

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

  const geometryReady = roomValid && rspValid && seatsValid;
  const hasModel = Boolean(selectedSubModel);
  const hasP14 = hasP14Target;
  // Stage 1 is product- and P14-independent: it only needs valid room geometry,
  // seating and an effective RSP. Stage 2 adds the model and P14 target.
  const canEvaluate = geometryReady && hasModel && hasP14;

  return {
    selectedSubModel,
    subwooferBottomHeightM,
    frontOrientation,
    rearOrientation,
    currentQuantity,
    amplifierPowerPerSubW,
    geometryReady,
    hasModel,
    hasP14,
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

  // Stage 1 is geometry-only: it starts as soon as room, seating and RSP are
  // valid — it does NOT require a subwoofer model or P14 target. Stage 2
  // requires the model and P14 target in addition to geometry.
  const stage1Enabled = recGateActive && inputs.geometryReady;
  const stage2Enabled = recGateActive && inputs.canEvaluate;

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
    enabled: stage2Enabled,
    requestId: stage2Enabled ? requestId : null,
    recommendationQuantities: RECOMMENDATION_QUANTITIES,
  });

  const stage2State = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId, versionId),
    () => getStage2State(projectId, versionId),
  );

  const stage1State = useSyncExternalStore(
    subscribeStage1,
    () => getStage1State(projectId, versionId),
    () => getStage1State(projectId, versionId),
  );

  const seatPriorityMap = useMemo(
    () => buildSeatPriorityMap(seatingPositions),
    [seatingPositions],
  );

  const options = useMemo(
    () => buildAdiShortlist(stage2State, seatPriorityMap, {
      roomDims,
      selectedSubModel: inputs.selectedSubModel,
      subwooferBottomHeightM: inputs.subwooferBottomHeightM,
    }),
    [stage2State, seatPriorityMap, roomDims, inputs.selectedSubModel, inputs.subwooferBottomHeightM],
  );

  const status = (() => {
    if (!inputs.geometryReady) return "waiting";
    // Stage 1 geometry discovery is running or not yet complete.
    if (stage1State?.status === "updating" || stage1State?.status === "idle") return "discovering";
    if (stage1State?.status !== "complete") return "discovering";
    // Stage 1 complete — Stage 2 needs model + P14 target.
    if (!inputs.canEvaluate) return "awaiting-prerequisites";
    if (stage2State?.status === "error") return "error";
    if (stage2State?.status === "complete") return "complete";
    if (stage2State?.status === "updating") return "evaluating";
    return "idle";
  })();

  const waitingReason = (() => {
    if (status !== "awaiting-prerequisites") return null;
    if (!inputs.hasModel && !inputs.hasP14) return "Select a subwoofer model and design target to evaluate layouts.";
    if (!inputs.hasModel) return "Select a subwoofer model to evaluate layouts.";
    if (!inputs.hasP14) return "Select a design target to evaluate layouts.";
    return null;
  })();

  const isCurrent = stage2State?.status === "complete";

  return { options, status, isCurrent, stage2Fingerprint: stage2State?.fingerprint || null, waitingReason };
}