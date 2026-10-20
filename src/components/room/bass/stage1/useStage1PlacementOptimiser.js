// useStage1PlacementOptimiser.js
// React hook for the explicit Stage 1 placement optimiser.
// Starts only for a fingerprint-bound Optimise/Compare request.
// Hydrates from DB on reopen; starts 0 workers if cache is valid.

import { useEffect, useSyncExternalStore, useRef, useState } from "react";
import { computeStage1Fingerprint } from "./stage1Fingerprint";
import {
  stage1PlacementController,
  getStage1State,
  subscribeStage1,
  publishHydratedStage1,
  markStage1Idle,
} from "./stage1PlacementStore";
import { hydrateStage1PlacementCache, isStage1CacheValid } from "./stage1PlacementPersistence";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../best-layout/bestSubLayoutPhysicsSnapshot";
import { STAGE1_START_DELAY_MS } from "./stage1Constants";
import { useIsDragActive } from "@/components/state/userInteractionStore";

/**
 * Run Stage 1 placement search for an explicit heavy-action request.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z? }
 * @param {Array} params.seatingPositions — [{ id, x, y, z?, priority? }]
 * @param {object} params.physicsOptions — modal physics options (optional)
 */
export function useStage1PlacementOptimiser({ projectId, versionId = "free", roomDims, rspPosition, seatingPositions, physicsOptions, enabled = true, requestId = null, scopeQuantity = null }) {
  const state = useSyncExternalStore(
    subscribeStage1,
    () => getStage1State(projectId, versionId),
    () => getStage1State(projectId, versionId),
  );
  // FIX 5: Consume the shared interaction authority. When any drag type is
  // active (subwoofer, seat, RSP/MLP, speaker), cancel speculative Stage 1
  // work immediately. Resume only when manipulation genuinely ends.
  const isInteracting = useIsDragActive();

  const fingerprintRef = useRef(null);
  const explicitRequestRef = useRef({ requestId: null, fingerprint: null });
  const [hydrationDone, setHydrationDone] = useState(false);
  const [hydratedCache, setHydratedCache] = useState(null);

  // Compute fingerprint (product-independent, P14-independent)
  const baseFingerprint = computeStage1Fingerprint({
    roomDims,
    rspPosition,
    seatingPositions,
    physicsOptions: physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
  });
  const scope = [1, 2, 3, 4].includes(scopeQuantity) ? scopeQuantity : null;
  // A scoped run carries its own identity so its partial result is never
  // mistaken for the all-quantity study of the same design.
  const fingerprint = baseFingerprint && scope ? `${baseFingerprint}|sel:${scope}` : baseFingerprint;

  // ── Hydration on mount / project change ──────────────────────────────
  useEffect(() => {
    setHydrationDone(false);
    setHydratedCache(null);
    if (!projectId || projectId === "free") {
      setHydrationDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const hydrated = await hydrateStage1PlacementCache(projectId, versionId);
      if (cancelled) return;
      setHydratedCache(hydrated || null);
      setHydrationDone(true);
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId]);

  // Project geometry can hydrate after the cache query completes. Retain the
  // persisted snapshot and restore as soon as the final fingerprint is known.
  useEffect(() => {
    if (!hydrationDone || !isStage1CacheValid(hydratedCache, baseFingerprint)) return;
    publishHydratedStage1(projectId, versionId, baseFingerprint, {
      one_sub_result: hydratedCache.one_sub_result,
      two_sub_result: hydratedCache.two_sub_result,
      three_sub_result: hydratedCache.three_sub_result,
      four_sub_result: hydratedCache.four_sub_result,
    });
  }, [hydrationDone, hydratedCache, baseFingerprint, projectId]);

  // ── Schedule / cancel search on fingerprint change ───────────────────
  useEffect(() => {
    fingerprintRef.current = fingerprint;

    // Wait for both persisted-cache hydration and final project geometry.
    if (!hydrationDone) return;

    // Recommendation gate: when the recommendation UI is not active, cancel
    // any pending/active search and stay idle. This eliminates speculative
    // Stage 1 worker starts during dragging or when the panel is closed.
    if (!enabled || !requestId) {
      explicitRequestRef.current = { requestId: null, fingerprint: null };
      stage1PlacementController.cancelActive("explicit-action-required");
      markStage1Idle(projectId, versionId);
      return;
    }

    const requestToken = String(requestId);
    if (explicitRequestRef.current.requestId !== requestToken) {
      explicitRequestRef.current = { requestId: requestToken, fingerprint: null };
    }
    if (!fingerprint) {
      stage1PlacementController.cancelActive("inputs-incomplete");
      markStage1Idle(projectId, versionId);
      return;
    }
    if (!explicitRequestRef.current.fingerprint) {
      explicitRequestRef.current.fingerprint = fingerprint;
    } else if (explicitRequestRef.current.fingerprint !== fingerprint) {
      stage1PlacementController.cancelActive("request-fingerprint-stale");
      markStage1Idle(projectId, versionId);
      return;
    }

    // FIX 5: Interaction gate — cancel speculative Stage 1 work during any
    // active drag (subwoofer, seat, RSP/MLP, speaker). Do NOT mark idle —
    // preserve completed results so they don't need re-computation after
    // the drag ends. When interaction ends, the effect re-runs and either
    // finds an existing complete result (no re-schedule) or re-schedules.
    if (isInteracting) {
      const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
      if (isDev) console.log("[stage1-gate]", "BLOCKED — user interacting, cancelling speculative placement search");
      stage1PlacementController.cancelActive("user-interaction");
      return;
    }

    if (!fingerprint) {
      markStage1Idle(projectId, versionId);
      return;
    }

    // A valid persisted snapshot is authoritative for this fingerprint.
    // Restore synchronously here as well so scheduling cannot race the restore
    // effect during the same commit.
    if (isStage1CacheValid(hydratedCache, baseFingerprint)) {
      publishHydratedStage1(projectId, versionId, baseFingerprint, {
        one_sub_result: hydratedCache.one_sub_result,
        two_sub_result: hydratedCache.two_sub_result,
        three_sub_result: hydratedCache.three_sub_result,
        four_sub_result: hydratedCache.four_sub_result,
      });
      return;
    }

    // If the current state already has this fingerprint and is complete, skip
    const current = getStage1State(projectId, versionId);
    // A complete all-quantity result for the same design also satisfies a scoped run.
    if (current.status === "complete" && (current.fingerprint === fingerprint || current.fingerprint === baseFingerprint)) return;

    // Schedule the search (cancels any existing pending/active search)
    stage1PlacementController.schedule({
      projectId,
      versionId,
      fingerprint,
      payload: { roomDims, rspPosition, seatingPositions, physicsOptions: physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS },
      delay: STAGE1_START_DELAY_MS,
      scopeQuantity: scope,
    });

    return () => {
      // Cleanup on unmount — cancel active search
    };
  }, [fingerprint, baseFingerprint, scope, projectId, hydrationDone, hydratedCache, enabled, requestId, isInteracting]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Don't terminate the controller — it's a singleton shared across consumers.
      // The controller self-manages worker lifecycle.
    };
  }, []);

  return state;
}