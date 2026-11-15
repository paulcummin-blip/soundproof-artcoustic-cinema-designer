// useRoomDesignerPlacementOptimisers.js
// ---------------------------------------------------------------------------
// Encapsulates the Room Designer's Stage 1 + Stage 2 placement optimiser hook
// wiring, including the Stage 1 → Stage 2 fingerprint handoff.
//
// Stage 2 must NOT capture a fingerprint or schedule work from a stale Stage 1
// snapshot. The hook requires the Stage 1 fingerprint the current geometry +
// selected subwoofer quantity WOULD produce, so it can recognise a matching
// completed Stage 1 result and release Stage 2 — and so a stale Stage 1
// snapshot left over from a previous geometry is never consumed. This is the
// SAME authority Stage 1 uses (computeStage1Fingerprint), with the SAME scope
// suffix (`sel:N`) the Stage 1 hook applies for a selected-quantity run.
//
// Extracted from RoomDesigner.jsx to keep that file within the platform's line
// limit and to isolate the placement-optimiser wiring in one testable place.
// Pure orchestration: no acoustic calculations, no RP22 grading.

import React, { useEffect, useMemo } from "react";
import { useStage1PlacementOptimiser } from "../stage1/useStage1PlacementOptimiser";
import { useStage2PlacementOptimiser } from "./useStage2PlacementOptimiser";
import { computeStage1Fingerprint } from "../stage1/stage1Fingerprint";
import {
  useBassHeavyAction,
  markBassHeavyActionRunning,
  markBassHeavyActionComplete,
  markBassHeavyActionError,
} from "../bassHeavyActionStore";

/**
 * Run the Stage 1 + Stage 2 placement optimisers for the Room Designer's
 * explicit heavy-action request, plus the heavy-action status reconciliation
 * effect.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string|null} params.versionId
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z? }
 * @param {Array} params.seatingPositions
 * @param {object} params.appState — the Room Designer app state
 * @returns {{ stage1Optimisation, stage2Optimisation, recommendationsActive, bassHeavyAction }}
 */
export function useRoomDesignerPlacementOptimisers({
  projectId,
  versionId,
  roomDims,
  rspPosition,
  seatingPositions,
  appState,
}) {
  const bassHeavyAction = useBassHeavyAction(projectId, versionId);
  const recommendationsActive = !!bassHeavyAction?.requestId
    && ["optimise", "compare"].includes(bassHeavyAction.action)
    && ["requested", "running", "complete"].includes(bassHeavyAction.status);

  // Installed subwoofer count (same rule Stage 2 uses) scopes a selected-quantity Stage 1 run.
  const stage1ScopeQty = useMemo(() => {
    const instances = (appState?.subwooferInstances || []).filter((i) => i?.enabled !== false);
    const count = instances.length || (appState?.subwoofers || []).length;
    return (count === 1 || count === 2 || count === 3 || count === 4) ? count : null;
  }, [appState?.subwoofers, appState?.subwooferInstances]);

  const stage1Optimisation = useStage1PlacementOptimiser({
    projectId,
    versionId: versionId || "free",
    roomDims,
    rspPosition,
    seatingPositions,
    enabled: recommendationsActive,
    requestId: recommendationsActive ? bassHeavyAction.requestId : null,
    scopeQuantity: bassHeavyAction?.selectedQuantityOnly === true ? stage1ScopeQty : null,
  });

  const stage2SubModel = useMemo(() => {
    const subs = appState?.subwoofers || [];
    const instances = appState?.subwooferInstances || [];
    const firstInstance = instances.find((i) => i?.enabled !== false);
    if (firstInstance?.model) return firstInstance.model;
    return subs[0]?.modelKey || subs[0]?.model || null;
  }, [appState?.subwoofers, appState?.subwooferInstances]);

  const stage2CurrentQty = useMemo(() => {
    const subs = appState?.subwoofers || [];
    const instances = (appState?.subwooferInstances || []).filter((i) => i?.enabled !== false);
    const count = instances.length || subs.length;
    // Quantity 3 is a first-class installed subwoofer count (Stage 1 produces
    // three_sub_result finalists; STAGE2_QUANTITY_ORDER is [1,2,3,4]). Omitting
    // it here made resolveQuantityOrder fall back to [2,4,1], so a design whose
    // only valid Stage 1 finalists were three-source produced zero Stage 2 jobs
    // and the run sat idle until the global safety timeout. The authoritative
    // supported-quantity mechanism already includes 3 — the handoff must too.
    return (count === 1 || count === 2 || count === 3 || count === 4) ? count : null;
  }, [appState?.subwoofers, appState?.subwooferInstances]);

  const stage2SubBottomHeightM = useMemo(() => {
    const instances = appState?.subwooferInstances || [];
    const firstInstance = instances.find((i) => i?.enabled !== false);
    if (firstInstance && Number.isFinite(Number(firstInstance.bottomHeightM))) {
      return Number(firstInstance.bottomHeightM);
    }
    const subs = appState?.subwoofers || [];
    if (subs[0] && Number.isFinite(Number(subs[0].bottomHeightM))) {
      return Number(subs[0].bottomHeightM);
    }
    return null;
  }, [appState?.subwoofers, appState?.subwooferInstances]);

  // ── Stage 1 → Stage 2 fingerprint handoff ─────────────────────────────
  // The Stage 1 fingerprint the current geometry + selected subwoofer quantity
  // WOULD produce. Stage 2 uses this to recognise a matching completed Stage 1
  // result and release scheduling — and to refuse a stale Stage 1 snapshot left
  // over from a previous geometry. Same authority + scope suffix as Stage 1.
  const expectedStage1Fingerprint = useMemo(() => {
    const base = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
    if (!base) return null;
    const scope = bassHeavyAction?.selectedQuantityOnly === true
      && [1, 2, 3, 4].includes(stage2CurrentQty) ? stage2CurrentQty : null;
    return scope ? `${base}|sel:${scope}` : base;
  }, [roomDims, rspPosition, seatingPositions, bassHeavyAction?.selectedQuantityOnly, stage2CurrentQty]);

  const stage2Optimisation = useStage2PlacementOptimiser({
    projectId,
    versionId: versionId || "free",
    roomDims,
    rspPosition,
    seatingPositions,
    selectedSubModel: stage2SubModel,
    amplifierPowerPerSubW: appState?.splConfig?.subwooferAmplifierPowerW,
    splConfig: appState?.splConfig,
    currentQuantity: stage2CurrentQty,
    subwooferBottomHeightM: stage2SubBottomHeightM,
    frontOrientation: appState?.frontSubsCfg?.orientation ?? null,
    rearOrientation: appState?.rearSubsCfg?.orientation ?? null,
    enabled: recommendationsActive,
    requestId: recommendationsActive ? bassHeavyAction.requestId : null,
    selectedQuantityOnly: bassHeavyAction?.selectedQuantityOnly === true,
    expectedStage1Fingerprint: recommendationsActive ? expectedStage1Fingerprint : null,
  });

  // Heavy-action status reconciliation: surface Stage 1/2 errors and completion.
  useEffect(() => {
    if (!recommendationsActive || !bassHeavyAction?.requestId) return;
    if (stage1Optimisation?.status === "error" || stage2Optimisation?.status === "error") {
      markBassHeavyActionError(
        projectId,
        versionId,
        bassHeavyAction.requestId,
        stage2Optimisation?.errorMessage || stage1Optimisation?.errorMessage,
      );
      return;
    }
    if (stage2Optimisation?.status === "complete") {
      markBassHeavyActionComplete(projectId, versionId, bassHeavyAction.requestId);
      return;
    }
    if (bassHeavyAction.status === "requested") {
      markBassHeavyActionRunning(projectId, versionId, bassHeavyAction.requestId);
    }
  }, [
    recommendationsActive,
    projectId,
    versionId,
    bassHeavyAction?.requestId,
    bassHeavyAction?.status,
    stage1Optimisation?.status,
    stage1Optimisation?.errorMessage,
    stage2Optimisation?.status,
    stage2Optimisation?.errorMessage,
  ]);

  return { stage1Optimisation, stage2Optimisation, recommendationsActive, bassHeavyAction };
}