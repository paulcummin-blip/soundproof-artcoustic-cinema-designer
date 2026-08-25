// useStage1PlacementOptimiser.js
// React hook for Stage 1 placement optimiser.
// Auto-starts 500-750ms after valid geometry settles.
// Hydrates from DB on reopen; starts 0 workers if cache is valid.

import { useEffect, useSyncExternalStore, useRef } from "react";
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

/**
 * Auto-start Stage 1 placement search.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z? }
 * @param {Array} params.seatingPositions — [{ id, x, y, z?, priority? }]
 * @param {object} params.physicsOptions — modal physics options (optional)
 */
export function useStage1PlacementOptimiser({ projectId, roomDims, rspPosition, seatingPositions, physicsOptions }) {
  const state = useSyncExternalStore(
    subscribeStage1,
    () => getStage1State(projectId),
    () => getStage1State(projectId),
  );

  const fingerprintRef = useRef(null);
  const hydrationDoneRef = useRef(false);

  // Compute fingerprint (product-independent, P14-independent)
  const fingerprint = computeStage1Fingerprint({
    roomDims,
    rspPosition,
    seatingPositions,
    physicsOptions: physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
  });

  // ── Hydration on mount / project change ──────────────────────────────
  useEffect(() => {
    hydrationDoneRef.current = false;
    if (!projectId || projectId === "free") {
      hydrationDoneRef.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      const hydrated = await hydrateStage1PlacementCache(projectId);
      if (cancelled) return;
      hydrationDoneRef.current = true;

      if (hydrated && isStage1CacheValid(hydrated, fingerprint)) {
        // Cache is valid — restore finalists, start 0 workers
        publishHydratedStage1(projectId, fingerprint, {
          one_sub_result: hydrated.one_sub_result,
          two_sub_result: hydrated.two_sub_result,
          four_sub_result: hydrated.four_sub_result,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Schedule / cancel search on fingerprint change ───────────────────
  useEffect(() => {
    fingerprintRef.current = fingerprint;

    // Wait for hydration to complete before scheduling
    if (!hydrationDoneRef.current) return;

    if (!fingerprint) {
      markStage1Idle(projectId);
      return;
    }

    // If the current state already has this fingerprint and is complete, skip
    const current = getStage1State(projectId);
    if (current.status === "complete" && current.fingerprint === fingerprint) return;

    // Schedule the search (cancels any existing pending/active search)
    stage1PlacementController.schedule({
      projectId,
      fingerprint,
      payload: { roomDims, rspPosition, seatingPositions, physicsOptions: physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS },
      delay: STAGE1_START_DELAY_MS,
    });

    return () => {
      // Cleanup on unmount — cancel active search
    };
  }, [fingerprint, projectId, hydrationDoneRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Don't terminate the controller — it's a singleton shared across consumers.
      // The controller self-manages worker lifecycle.
    };
  }, []);

  return state;
}