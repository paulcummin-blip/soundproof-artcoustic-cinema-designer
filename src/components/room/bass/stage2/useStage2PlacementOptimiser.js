// useStage2PlacementOptimiser.js
// React hook for Stage 2 canonical placement evaluation.
//
// Auto-starts when all inputs are ready:
//   - Stage 1 complete (valid finalists)
//   - Selected subwoofer model
//   - Selected P14 target
//   - Valid room/seating/RSP
//
// Does NOT rerun Stage 1. Stage 1 remains product-independent.
// Evaluates only the selected P14 target (not the full 8-target matrix).

import { useEffect, useSyncExternalStore, useState, useMemo } from "react";
import { computeStage2Fingerprint } from "./stage2Fingerprint";
import {
  computeStage2PlacementFingerprint,
  computeStage2ConfirmationFingerprint,
} from "./stage2PlacementFingerprint";
import {
  stage2PlacementController,
  getStage2State,
  subscribeStage2,
  publishHydratedStage2,
  markStage2Idle,
  markStage2Waiting,
} from "./stage2PlacementStore";
import { hydrateStage2PlacementCache, isStage2CacheValid, isRawTransferCacheValid } from "./stage2PlacementPersistence";
import { setCachedRawTransfer } from "./stage2RawTransferCache";
import { buildPromotionPlan } from "./stage2FinalistPromotion";
import { getStage1State, subscribeStage1 } from "../stage1/stage1PlacementStore";
import { deriveRequestedCalibrationConfig } from "../requestedCalibrationConfig";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import { STAGE2_DEFAULT_QUANTITY_ORDER, STAGE2_START_DELAY_MS } from "./stage2Constants";

function computeTransitionHz(roomDims) {
  const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
  return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
}

function computeUsableLfHz(selectedSubModel) {
  const model = MODELS.find((m) => m.key === normaliseModelKey(selectedSubModel));
  return model?.approvedUsableLfHzMinus6dB ?? null;
}

function buildSeatPriorityMap(seatingPositions) {
  const map = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat.id || `${seat.x}-${seat.y}`);
    map.set(id, seat.priority === "secondary" ? "secondary" : "primary");
  });
  return map;
}

function resolveQuantityOrder(currentQuantity) {
  if (currentQuantity === 1 || currentQuantity === 2 || currentQuantity === 4) {
    return [currentQuantity, ...STAGE2_DEFAULT_QUANTITY_ORDER.filter((q) => q !== currentQuantity)];
  }
  return STAGE2_DEFAULT_QUANTITY_ORDER;
}

/**
 * Auto-start Stage 2 canonical placement evaluation.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z? }
 * @param {Array} params.seatingPositions — [{ id, x, y, z?, priority? }]
 * @param {string} params.selectedSubModel — subwoofer model key
 * @param {number} [params.amplifierPowerPerSubW] — amplifier power per sub
 * @param {object} params.splConfig — P14/P18 selection config
 * @param {number} [params.currentQuantity] — user's current sub count (1/2/4)
 * @param {number} [params.subwooferBottomHeightM] — project subwoofer bottom height (m).
 *   Drives acoustic-centre Z via the production deriveCentreZ authority.
 */
export function useStage2PlacementOptimiser({
  projectId,
  roomDims,
  rspPosition,
  seatingPositions,
  selectedSubModel,
  amplifierPowerPerSubW,
  splConfig,
  currentQuantity,
  subwooferBottomHeightM,
}) {
  const state = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId),
    () => getStage2State(projectId),
  );

  const stage1State = useSyncExternalStore(
    subscribeStage1,
    () => getStage1State(projectId),
    () => getStage1State(projectId),
  );

  const [hydrationDone, setHydrationDone] = useState(false);
  const [hydratedCache, setHydratedCache] = useState(null);

  // Compute P14 target from splConfig
  const p14Target = useMemo(() => {
    if (!splConfig || !selectedSubModel || !roomDims) return null;
    const transitionHz = computeTransitionHz(roomDims);
    const usableLfHz = computeUsableLfHz(selectedSubModel);
    const requested = deriveRequestedCalibrationConfig({
      splConfig,
      optimisationTransitionHz: transitionHz,
      designEqSystemLimits: { usableLfHz },
    });
    if (!requested.p14TargetBasis || !requested.requestedLevel || !Number.isFinite(requested.selectedP14TargetDb)) {
      return null;
    }
    return {
      basis: requested.p14TargetBasis,
      level: requested.requestedLevel,
      db: requested.selectedP14TargetDb,
      p18TargetBasis: requested.p18TargetBasis || "minimum",
    };
  }, [splConfig, selectedSubModel, roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  // Stage 1 finalists (from Stage 1 memory state)
  const stage1Finalists = useMemo(() => {
    if (stage1State?.status !== "complete") return null;
    return {
      1: stage1State.one_sub_result?.finalists || [],
      2: stage1State.two_sub_result?.finalists || [],
      4: stage1State.four_sub_result?.finalists || [],
    };
  }, [stage1State?.status, stage1State?.one_sub_result, stage1State?.two_sub_result, stage1State?.four_sub_result]);

  const stage1Fingerprint = stage1State?.fingerprint || null;

  // Compute P14-independent placement fingerprint (raw transfer cache identity)
  const placementFingerprint = useMemo(() => {
    if (!stage1Fingerprint || !stage1Finalists || !selectedSubModel) return null;
    return computeStage2PlacementFingerprint({
      stage1Fingerprint,
      stage1Finalists,
      selectedSubModel,
      subwooferBottomHeightM,
    });
  }, [stage1Fingerprint, stage1Finalists, selectedSubModel, subwooferBottomHeightM]);

  // Compute P14-dependent confirmation fingerprint (placement + P14).
  // p18TargetBasis is NOT included — it is a presentation-only grading view.
  const confirmationFingerprint = useMemo(() => {
    if (!placementFingerprint || !p14Target) return null;
    return computeStage2ConfirmationFingerprint({
      placementFingerprint,
      p14TargetBasis: p14Target.basis,
      p14TargetLevel: p14Target.level,
      p14TargetDb: p14Target.db,
    });
  }, [placementFingerprint, p14Target]);

  // Legacy fingerprint for cache compatibility (includes P14).
  // p18TargetBasis is NOT included — it is a presentation-only grading view.
  const fingerprint = useMemo(() => {
    if (!stage1Fingerprint || !stage1Finalists || !selectedSubModel || !p14Target) return null;
    return computeStage2Fingerprint({
      stage1Fingerprint,
      stage1Finalists,
      selectedSubModel,
      p14TargetBasis: p14Target.basis,
      p14TargetLevel: p14Target.level,
      p14TargetDb: p14Target.db,
      subwooferBottomHeightM,
    });
  }, [stage1Fingerprint, stage1Finalists, selectedSubModel, p14Target, subwooferBottomHeightM]);

  // Hydration on mount / project change
  useEffect(() => {
    setHydrationDone(false);
    setHydratedCache(null);
    if (!projectId || projectId === "free") {
      setHydrationDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const hydrated = await hydrateStage2PlacementCache(projectId);
      if (cancelled) return;
      setHydratedCache(hydrated || null);
      setHydrationDone(true);
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  // Restore from persisted cache when valid. No longer requires the 8/8 P14
  // family — Stage 2 only needs the authoritative selected P14 result and
  // valid placement/raw authority.
  useEffect(() => {
    if (!hydrationDone || !isStage2CacheValid(hydratedCache, fingerprint)) return;
    publishHydratedStage2(projectId, fingerprint, {
      one_sub_result: hydratedCache.one_sub_result,
      two_sub_result: hydratedCache.two_sub_result,
      four_sub_result: hydratedCache.four_sub_result,
      overall_best: hydratedCache.overall_best,
      canonical_jobs_run: hydratedCache.canonical_jobs_run,
      total_runtime_ms: hydratedCache.total_runtime_ms,
      b_eligible: hydratedCache.b_eligible,
      b_evaluated: hydratedCache.b_evaluated,
      b_eligibility_reason: hydratedCache.b_eligibility_reason,
      b_failed_candidates: hydratedCache.b_failed_candidates,
      b_result: hydratedCache.b_result,
    });
  }, [hydrationDone, hydratedCache, fingerprint, projectId]);

  // Restore persisted raw transfers to the in-memory cache on cold reopen.
  // Only restores when the placement fingerprint matches — a mismatch means
  // physics/source-model inputs changed, so the raw transfers are stale and
  // must NOT be reused (placement will be recomputed).
  useEffect(() => {
    if (!hydrationDone || !placementFingerprint) return;
    if (!isRawTransferCacheValid(hydratedCache, placementFingerprint)) return;
    const persisted = hydratedCache.raw_transfers;
    if (!persisted || typeof persisted !== "object") return;
    for (const [finalistId, rawTransfer] of Object.entries(persisted)) {
      if (rawTransfer && typeof rawTransfer === "object") {
        setCachedRawTransfer(placementFingerprint, finalistId, rawTransfer);
      }
    }
  }, [hydrationDone, hydratedCache, placementFingerprint]);

  // Schedule / cancel on fingerprint change. No 8/8 gate — Stage 2 starts
  // as soon as Stage 1 is complete, the sub model is selected, and a valid
  // P14 target exists. The selected P14 target is confirmed first; the
  // remaining seven targets are calculated in the background afterwards.
  useEffect(() => {
    if (!hydrationDone) return;

    if (!fingerprint) {
      stage2PlacementController.cancelAll("inputs-incomplete");
      markStage2Idle(projectId);
      return;
    }

    // If the current state already has this fingerprint and is complete, skip
    const current = getStage2State(projectId);
    if (current.status === "complete" && current.fingerprint === fingerprint) return;

    // Build promotion plan from Stage 1 finalists
    const promotionPlan = buildPromotionPlan({
      one_sub_result: { finalists: stage1Finalists?.[1] || [] },
      two_sub_result: { finalists: stage1Finalists?.[2] || [] },
      four_sub_result: { finalists: stage1Finalists?.[4] || [] },
    });

    const quantityOrder = resolveQuantityOrder(currentQuantity);

    const seatPriorityMap = buildSeatPriorityMap(seatingPositions);

    const amplifierPower = Number.isFinite(Number(amplifierPowerPerSubW))
      ? Number(amplifierPowerPerSubW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

    stage2PlacementController.schedule({
      projectId,
      fingerprint,
      placementFingerprint,
      confirmationFingerprint,
      promotionPlan,
      allStage1Finalists: stage1Finalists,
      stage1Complete: stage1State?.status === "complete",
      params: {
        roomDims,
        rspPosition,
        seatingPositions,
        selectedSubModel,
        amplifierPowerPerSubW: amplifierPower,
        p14TargetBasis: p14Target.basis,
        p14TargetLevel: p14Target.level,
        p14TargetDb: p14Target.db,
        p18TargetBasis: p14Target.p18TargetBasis,
        seatPriorityMap,
        subwooferBottomHeightM,
      },
      quantityOrder,
      delay: STAGE2_START_DELAY_MS,
    });
  }, [fingerprint, placementFingerprint, confirmationFingerprint, projectId, hydrationDone, currentQuantity]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}