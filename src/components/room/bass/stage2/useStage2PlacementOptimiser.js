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
  stage2PlacementController,
  getStage2State,
  subscribeStage2,
  publishHydratedStage2,
  markStage2Idle,
} from "./stage2PlacementStore";
import { hydrateStage2PlacementCache, isStage2CacheValid } from "./stage2PlacementPersistence";
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

  // Compute Stage 2 fingerprint
  const fingerprint = useMemo(() => {
    if (!stage1Fingerprint || !stage1Finalists || !selectedSubModel || !p14Target) return null;
    return computeStage2Fingerprint({
      stage1Fingerprint,
      stage1Finalists,
      selectedSubModel,
      p14TargetBasis: p14Target.basis,
      p14TargetLevel: p14Target.level,
      p14TargetDb: p14Target.db,
      p18TargetBasis: p14Target.p18TargetBasis,
    });
  }, [stage1Fingerprint, stage1Finalists, selectedSubModel, p14Target]);

  // Hydration on mount / project change
  useEffect(() => {
    setHydrationDone(false);
    if (!projectId || projectId === "free") {
      setHydrationDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const hydrated = await hydrateStage2PlacementCache(projectId);
      if (cancelled) return;
      setHydrationDone(true);

      if (hydrated && isStage2CacheValid(hydrated, fingerprint)) {
        publishHydratedStage2(projectId, fingerprint, {
          one_sub_result: hydrated.one_sub_result,
          two_sub_result: hydrated.two_sub_result,
          four_sub_result: hydrated.four_sub_result,
          overall_best: hydrated.overall_best,
          canonical_jobs_run: hydrated.canonical_jobs_run,
          total_runtime_ms: hydrated.total_runtime_ms,
          b_eligible: hydrated.b_eligible,
          b_evaluated: hydrated.b_evaluated,
          b_eligibility_reason: hydrated.b_eligibility_reason,
          b_failed_candidates: hydrated.b_failed_candidates,
          b_result: hydrated.b_result,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedule / cancel on fingerprint change
  useEffect(() => {
    if (!hydrationDone) return;

    if (!fingerprint) {
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
      },
      quantityOrder,
      delay: STAGE2_START_DELAY_MS,
    });
  }, [fingerprint, projectId, hydrationDone, currentQuantity]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}