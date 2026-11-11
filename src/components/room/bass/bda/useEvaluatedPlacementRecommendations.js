// useEvaluatedPlacementRecommendations.js
// ---------------------------------------------------------------------------
// React hook for the Subwoofer Design Starting Layout cards.
//
// It connects the existing 1/2/4-subwoofer Stage 1 + Stage 2 cross-quantity
// recommendation authority to the cards WITHOUT creating a second placement
// interface or another competing guide. While mounted it:
//   • opens the shared recommendation gate so Stage 1/2 speculative work is
//     permitted (the gate is closed when no recommendation UI is mounted),
//   • mints a FRESH request identity for each genuinely new settled
//     evaluation context (geometry + model + P14 + height + orientation +
//     amplifier), so the shared Stage 1/2 hooks reset their captured
//     fingerprint and reschedule automatically after a geometry, model or
//     P14 change — instead of cancelling and idling on a stale captured
//     fingerprint,
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
//
// REQUEST IDENTITY: the requestId is derived from the settled evaluation
// identity (geometry fingerprint + model + P14 target + height + orientations +
// amplifier). When any of those inputs changes, the requestId changes, so the
// shared hooks reset their explicitRequestRef and reschedule. Old requests
// cannot publish into newer design identities: the controller cancels the old
// run before scheduling the new one, and the store's ownerRequestId guard
// rejects publishes from a cancelled run. Cached matching results are reused:
// when the identity returns to a previously-evaluated state, the hooks hydrate
// from the persistent cache. Explicit Optimise Bass requests use a DIFFERENT
// requestId (the heavy-action one) and retain their existing cancel-on-stale
// identity behaviour — they do not pass through this hook.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useSyncExternalStore } from "react";
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
import { computeStage1Fingerprint } from "../stage1/stage1Fingerprint";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../best-layout/bestSubLayoutPhysicsSnapshot";
import {
  subscribeStage1,
  getStage1State,
} from "../stage1/stage1PlacementStore";

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
    p14TargetKey: p14Selection.targetKey || "none",
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

  // Geometry fingerprint — the SAME authority Stage 1 uses (computeStage1Fingerprint),
  // so the request identity changes exactly when Stage 1's settled geometry
  // changes. This is the product-independent, P14-independent base identity.
  const geometryFingerprint = useMemo(
    () => computeStage1Fingerprint({
      roomDims,
      rspPosition,
      seatingPositions,
      physicsOptions: physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
    }),
    [roomDims, rspPosition, seatingPositions, physicsOptions],
  );

  // A fresh request identity is minted for each genuinely new settled
  // evaluation context (geometry + model + P14 target + height + orientation +
  // amplifier). When any input changes, the requestId changes, so the shared
  // Stage 1/2 hooks reset their explicitRequestRef and reschedule automatically
  // — instead of cancelling and idling on a stale captured fingerprint. Old
  // requests cannot publish into newer design identities because the
  // controller cancels the old run before scheduling the new one.
  const requestId = useMemo(() => {
    if (!geometryFingerprint || !inputs.geometryReady) return null;
    const parts = [
      geometryFingerprint,
      `m:${inputs.selectedSubModel || 'none'}`,
      `p14:${inputs.p14TargetKey}`,
      `h:${inputs.subwooferBottomHeightM}`,
      `fo:${inputs.frontOrientation || ''}`,
      `ro:${inputs.rearOrientation || ''}`,
      `a:${inputs.amplifierPowerPerSubW || ''}`,
    ];
    return `bda-rec:${parts.join('::')}`;
  }, [geometryFingerprint, inputs.geometryReady, inputs.selectedSubModel,
      inputs.p14TargetKey, inputs.subwooferBottomHeightM, inputs.frontOrientation,
      inputs.rearOrientation, inputs.amplifierPowerPerSubW]);

  // Stage 1 is geometry-only: it starts as soon as room, seating and RSP are
  // valid — it does NOT require a subwoofer model or P14 target. Stage 2
  // requires the model and P14 target in addition to geometry.
  const stage1Enabled = recGateActive && inputs.geometryReady;
  const stage2Enabled = recGateActive && inputs.canEvaluate;

  // Pass the SAME requestId to both hooks. When geometry changes, both reset
  // and stage2 waits for stage1 (stage1UpdatingForThisRequest matches because
  // the requestId is shared). When only model/P14 changes, stage1's requestId
  // also changes but stage1's fingerprint is unchanged, so stage1 skips
  // (already complete) while stage2 resets and reschedules.
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

  const stage2Result = useStage2PlacementOptimiser({
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

  // stage2Result is the store state + computedFingerprint (the EXPECTED
  // fingerprint from current inputs). The stored `fingerprint` is the run's
  // fingerprint; `computedFingerprint` is what the current inputs WOULD
  // produce. They differ when the design has changed but Stage 2 has not
  // re-evaluated — and that difference is what the Apply authority checks.
  const stage2State = stage2Result;

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
    // Stage 1 error is a terminal state — surface it, don't mask as discovery.
    if (stage1State?.status === "error") return "error";
    // Stage 1 not yet complete (idle, updating, stale, cancelled) — discovery
    // is running or about to restart. Stale/cancelled are transient: the
    // requestId change triggers an immediate reschedule on the next effect
    // tick, so "discovering" is the honest label for that brief window.
    if (stage1State?.status !== "complete") return "discovering";
    // Stage 1 complete — Stage 2 needs model + P14 target.
    if (!inputs.canEvaluate) return "awaiting-prerequisites";
    if (stage2State?.status === "error") return "error";
    if (stage2State?.status === "complete") return "complete";
    // Stage 2 is updating, or idle/stale/cancelled but ready to evaluate
    // (the requestId change triggers an immediate reschedule). Either way
    // the cards are not yet ready — show "evaluating".
    return "evaluating";
  })();

  const waitingReason = (() => {
    if (status !== "awaiting-prerequisites") return null;
    if (!inputs.hasModel && !inputs.hasP14) return "Select a subwoofer model and design target to evaluate layouts.";
    if (!inputs.hasModel) return "Select a subwoofer model to evaluate layouts.";
    if (!inputs.hasP14) return "Select a design target to evaluate layouts.";
    return null;
  })();

  const isCurrent = stage2State?.status === "complete";

  // The EXPECTED Stage 2 fingerprint from current inputs — the Apply authority
  // compares this with the candidate's SAVED run fingerprint to reject a stale
  // candidate whose evidence no longer matches the current design.
  const currentEvaluationFingerprint = stage2Result?.computedFingerprint || null;

  return {
    options,
    status,
    isCurrent,
    stage2Fingerprint: currentEvaluationFingerprint,
    waitingReason,
  };
}