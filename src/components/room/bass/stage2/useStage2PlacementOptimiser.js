// useStage2PlacementOptimiser.js
// React hook for explicit Stage 2 canonical placement evaluation.
//
// Starts only for a fingerprint-bound Optimise/Compare request when:
//   - Stage 1 is complete (valid finalists)
//   - A subwoofer model and P14 target are selected
//   - Room/seating/RSP inputs are valid
//
// Does NOT rerun Stage 1. Stage 1 remains product-independent.
// Evaluates only the selected P14 target (not the full 8-target matrix).

import { useEffect, useSyncExternalStore, useState, useMemo, useRef } from "react";
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
  adoptStage2Request,
} from "./stage2PlacementStore";
import { hydrateStage2PlacementCache, isStage2CacheValid, isRawTransferCacheValid } from "./stage2PlacementPersistence";
import { setCachedRawTransfer } from "./stage2RawTransferCache";
import { buildPromotionPlan } from "./stage2FinalistPromotion";
import { getStage1State, subscribeStage1 } from "../stage1/stage1PlacementStore";
import { deriveRequestedCalibrationConfig } from "../requestedCalibrationConfig";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import { STAGE2_START_DELAY_MS } from "./stage2Constants";
import { resolveQuantityOrder } from "./stage2QuantityOrder";
import { useIsDragActive } from "@/components/state/userInteractionStore";
import { normaliseRecommendationScope } from "../stage1/stage1RecommendationScope";

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

/**
 * Run Stage 2 canonical placement evaluation for an explicit heavy-action request.
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
  versionId = "free",
  roomDims,
  rspPosition,
  seatingPositions,
  selectedSubModel,
  amplifierPowerPerSubW,
  splConfig,
  currentQuantity,
  subwooferBottomHeightM,
  frontOrientation = null,
  rearOrientation = null,
  enabled = true,
  requestId = null,
  selectedQuantityOnly = false,
  recommendationQuantities = null,
  expectedStage1Fingerprint = null,
}) {
  const scopeQuantity = selectedQuantityOnly && [1, 2, 3, 4].includes(currentQuantity) ? currentQuantity : null;
  // A cross-quantity recommendation run evaluates 1, 2 and 4 together. It is
  // distinct from the single-quantity scope and from the full search (which
  // includes 3). 3-sub results are excluded from this workflow but remain
  // fully supported by the existing Stage 1/Stage 2 search elsewhere.
  const recScope = normaliseRecommendationScope(recommendationQuantities);
  const state = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId, versionId),
    () => getStage2State(projectId, versionId),
  );

  // FIX 5: Consume the shared interaction authority. When any drag type is
  // active (subwoofer, seat, RSP/MLP, speaker), cancel speculative Stage 2
  // work immediately. Resume only when manipulation genuinely ends.
  const isInteracting = useIsDragActive();

  const stage1State = useSyncExternalStore(
    subscribeStage1,
    () => getStage1State(projectId, versionId),
    () => getStage1State(projectId, versionId),
  );

  const [hydrationDone, setHydrationDone] = useState(false);
  const [hydratedCache, setHydratedCache] = useState(null);
  const explicitRequestRef = useRef({ requestId: null, fingerprint: null });

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
      3: stage1State.three_sub_result?.finalists || [],
      4: stage1State.four_sub_result?.finalists || [],
    };
  }, [stage1State?.status, stage1State?.one_sub_result, stage1State?.two_sub_result, stage1State?.three_sub_result, stage1State?.four_sub_result]);

  const stage1Fingerprint = stage1State?.fingerprint || null;

  // ── Stage 1 evidence matching ──────────────────────────────────────
  // Stage 2 must NOT capture a fingerprint or schedule work from a stale
  // Stage 1 snapshot left over from a previous geometry. The Stage 1 store
  // matches the current request only when it is complete AND its fingerprint
  // equals the Stage 1 fingerprint the current geometry + recommendation
  // scope would produce. While a new Stage 1 result is pending (or a stale
  // snapshot is still present), Stage 2 must WAIT rather than consume old
  // finalists — otherwise it captures a fingerprint that becomes stale the
  // moment the matching Stage 1 result arrives, permanently idling Stage 2.
  const stage1EvidenceMatches = !!expectedStage1Fingerprint
    && stage1State?.status === "complete"
    && stage1State?.fingerprint === expectedStage1Fingerprint;

  // Resolved effective amplifier power — the same value the engine receives
  // after defaults are applied. Used in both placement and legacy fingerprints
  // so that explicit-default and implicit-default values resolving to the same
  // effective power produce the same identity.
  const resolvedAmplifierPowerPerSubW = useMemo(() => {
    return Number.isFinite(Number(amplifierPowerPerSubW))
      ? Number(amplifierPowerPerSubW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
  }, [amplifierPowerPerSubW]);

  // Compute P14-independent placement fingerprint (raw transfer cache identity)
  const placementFingerprint = useMemo(() => {
    if (!stage1Fingerprint || !stage1Finalists || !selectedSubModel) return null;
    return computeStage2PlacementFingerprint({
      stage1Fingerprint,
      stage1Finalists,
      selectedSubModel,
      subwooferBottomHeightM,
      amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
      frontOrientation,
      rearOrientation,
    });
  }, [stage1Fingerprint, stage1Finalists, selectedSubModel, subwooferBottomHeightM, resolvedAmplifierPowerPerSubW, frontOrientation, rearOrientation]);

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
  // A selected-quantity run carries a scoped identity so its partial result can
  // never be mistaken for the all-quantity study of the same design.
  // A cross-quantity recommendation run carries its own scoped identity
  // (1,2,4) so its partial result is never mistaken for the full study.
  const fingerprint = useMemo(() => {
    if (!stage1Fingerprint || !stage1Finalists || !selectedSubModel || !p14Target) return null;
    const base = computeStage2Fingerprint({
      stage1Fingerprint,
      stage1Finalists,
      selectedSubModel,
      p14TargetBasis: p14Target.basis,
      p14TargetLevel: p14Target.level,
      p14TargetDb: p14Target.db,
      subwooferBottomHeightM,
      amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
    });
    if (scopeQuantity) return `${base}|sel:${scopeQuantity}`;
    if (recScope) return `${base}|rec:${recScope.join(",")}`;
    return base;
  }, [stage1Fingerprint, stage1Finalists, selectedSubModel, p14Target, subwooferBottomHeightM, resolvedAmplifierPowerPerSubW, scopeQuantity, recScope]);

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
      const hydrated = await hydrateStage2PlacementCache(projectId, versionId);
      if (cancelled) return;
      setHydratedCache(hydrated || null);
      setHydrationDone(true);
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId]);

  // Restore from persisted cache when valid. No longer requires the 8/8 P14
  // family — Stage 2 only needs the authoritative selected P14 result and
  // valid placement/raw authority.
  useEffect(() => {
    if (!hydrationDone || !isStage2CacheValid(hydratedCache, fingerprint)) return;
    publishHydratedStage2(projectId, versionId, fingerprint, {
      placement_fingerprint: hydratedCache.placement_fingerprint,
      one_sub_result: hydratedCache.one_sub_result,
      two_sub_result: hydratedCache.two_sub_result,
      three_sub_result: hydratedCache.three_sub_result,
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
        setCachedRawTransfer(projectId, versionId, placementFingerprint, finalistId, rawTransfer);
      }
    }
  }, [hydrationDone, hydratedCache, placementFingerprint]);

  // Schedule / cancel for the explicit request. No 8/8 gate — the selected
  // P14 target is the only target evaluated for this requested layout search.
  useEffect(() => {
    if (!hydrationDone) return;

    // Recommendation gate: when the recommendation UI is not active, cancel
    // any pending/active evaluation and stay idle. This eliminates speculative
    // Stage 2 worker starts during dragging or when the panel is closed.
    if (!enabled || !requestId) {
      const previousRequest = explicitRequestRef.current.requestId;
      explicitRequestRef.current = { requestId: null, fingerprint: null };
      // Multiple consumers share this controller. An inactive consumer must
      // never cancel the background search (or another explicit request).
      if (previousRequest && getStage2State(projectId, versionId).ownerRequestId === previousRequest) {
        stage2PlacementController.cancelAll("explicit-action-required");
        markStage2Idle(projectId, versionId);
      }
      return;
    }

    const requestToken = String(requestId);
    if (explicitRequestRef.current.requestId !== requestToken) {
      explicitRequestRef.current = { requestId: requestToken, fingerprint: null };
    }

    // ── Stage 1 evidence guard ────────────────────────────────────────
    // Before capturing a fingerprint or scheduling, require the Stage 1
    // store to hold a COMPLETED result whose fingerprint matches the Stage 1
    // fingerprint the current geometry + recommendation scope would produce.
    // A stale Stage 1 snapshot (left over from a previous geometry under a
    // new request) must NOT feed Stage 2 — it would capture a fingerprint
    // that becomes stale the moment the matching Stage 1 result arrives,
    // permanently idling Stage 2 (the original ordering defect).
    if (!stage1EvidenceMatches) {
      // Clear any captured fingerprint so the matching Stage 1 result can
      // re-capture cleanly when it arrives.
      explicitRequestRef.current.fingerprint = null;
      const cur = getStage2State(projectId, versionId);
      const alreadyWaiting = cur.status === "updating" && cur.phase === "waiting_for_stage1";
      if (!alreadyWaiting) {
        stage2PlacementController.cancelAll("awaiting-matching-stage1");
        // Mark WAITING (status "updating" with a distinct phase), NOT idle.
        // Idle is a terminal state the UI would display as "Evaluating"
        // indefinitely. The UI masks this phase as "discovering" because
        // Stage 1 evidence does not match (the UI checks stage1EvidenceMatches).
        markStage2Waiting(projectId, versionId, null, "waiting_for_stage1");
      }
      return;
    }

    // Stage 1 has matching evidence. Capture the fingerprint for this
    // request. If the fingerprint changed since the last capture (because
    // Stage 1 produced NEW matching finalists under the same request — the
    // transition from a stale capture to the matching capture), UPDATE the
    // captured fingerprint and re-schedule. Do NOT cancel and idle: that
    // left Stage 2 permanently stuck after a geometry change.
    if (fingerprint && explicitRequestRef.current.fingerprint !== fingerprint) {
      explicitRequestRef.current.fingerprint = fingerprint;
    }

    // FIX 5: Interaction gate — cancel speculative Stage 2 work during any
    // active drag (subwoofer, seat, RSP/MLP, speaker). Do NOT mark idle —
    // preserve completed results so they don't need re-computation after
    // the drag ends. When interaction ends, the effect re-runs and either
    // finds an existing complete result (no re-schedule) or re-schedules.
    if (isInteracting) {
      const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
      if (isDev) console.log("[stage2-gate]", "BLOCKED — user interacting, cancelling speculative canonical evaluation");
      stage2PlacementController.cancelAll("user-interaction");
      return;
    }

    if (!fingerprint) {
      // Stage 1 matches but Stage 2's own fingerprint is null (model, P14
      // target or bottom height not resolved). This is a genuine
      // prerequisites-missing state, not a stuck state — cancel stale work
      // and mark idle. The UI shows "awaiting-prerequisites".
      stage2PlacementController.cancelAll("inputs-incomplete");
      markStage2Idle(projectId, versionId);
      return;
    }

    // If the current state already has this fingerprint and is complete, skip
    const current = getStage2State(projectId, versionId);
    if (current.status === "complete" && current.fingerprint === fingerprint) {
      adoptStage2Request(projectId, versionId, requestId);
      return;
    }

    // Build promotion plan from Stage 1 finalists
    const promotionPlan = buildPromotionPlan({
      one_sub_result: { finalists: stage1Finalists?.[1] || [] },
      two_sub_result: { finalists: stage1Finalists?.[2] || [] },
      three_sub_result: { finalists: stage1Finalists?.[3] || [] },
      four_sub_result: { finalists: stage1Finalists?.[4] || [] },
    });

    // A cross-quantity recommendation run evaluates its quantity set (1, 2, 4)
    // directly, in ascending order. This replaces the default order (which
    // includes 3) without affecting any existing caller.
    const quantityOrder = recScope || resolveQuantityOrder(currentQuantity);

    const seatPriorityMap = buildSeatPriorityMap(seatingPositions);

    stage2PlacementController.schedule({
      projectId,
      versionId,
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
        amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
        p14TargetBasis: p14Target.basis,
        p14TargetLevel: p14Target.level,
        p14TargetDb: p14Target.db,
        p18TargetBasis: p14Target.p18TargetBasis,
        seatPriorityMap,
        subwooferBottomHeightM,
        frontOrientation,
        rearOrientation,
      },
      quantityOrder,
      scopeQuantity,
      delay: STAGE2_START_DELAY_MS,
      ownerRequestId: requestId,
    });
  }, [fingerprint, placementFingerprint, confirmationFingerprint, projectId, hydrationDone, currentQuantity, enabled, requestId, isInteracting, resolvedAmplifierPowerPerSubW, recScope, stage1State?.status, stage1State?.ownerRequestId, stage1State?.fingerprint, expectedStage1Fingerprint, stage1EvidenceMatches]);

  // Expose the COMPUTED fingerprint (derived from current inputs via useMemo
  // above) alongside the STORED store state. The stored `state.fingerprint` is
  // the fingerprint of the last completed/running Stage 2 run; the computed
  // `fingerprint` is the fingerprint the current inputs WOULD produce. When the
  // design has changed but Stage 2 has not re-evaluated yet, these differ — and
  // the recommendation Apply authority compares them to reject a stale
  // candidate whose stored fingerprint no longer matches the current design.
  return { ...state, computedFingerprint: fingerprint };
}