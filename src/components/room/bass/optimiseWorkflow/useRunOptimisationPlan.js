// useRunOptimisationPlan.js
// ---------------------------------------------------------------------------
// Run / Re-run Optimisation Plan — EVIDENCE ONLY.
//
// The ADI journey card needs one action: evaluate the available improvement
// options for the CURRENT design and save the result, without changing the
// design. This hook owns exactly that and nothing else.
//
// What it does:
//   1. ensures a current bass result exists (calculating the open design first
//      when the bass engine is ready)
//   2. runs the EXISTING optimiser (runOptimisation) against that design
//   3. builds and saves the evaluated plan into the ADI Optimisation Plan
//      persistence layer — the in-memory authority (which project autosave
//      writes into the version's design_state) and the published
//      recommendation payload
//
// What it never does: accept a recommendation, apply calibration, or write
// placement, delay, gain or polarity. The design is unchanged unless the
// designer later applies a lever.
//
// It changes no bass maths, no optimiser scoring, no P19/P20 definition, no
// RP22 grading and no calculation: it orchestrates the optimiser that already
// exists and saves what it returned.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import { runOptimisation } from "./optimiseWorkflowOrchestrator";
import { publishRecommendation } from "@/components/recommendationEngine";
import { buildOptimiserPlan } from "@/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import {
  getOptimiserPlanAuthority,
  setOptimiserPlanAuthority,
} from "@/components/room/bass/optimiserPlan/optimiserPlanStore.js";

export default function useRunOptimisationPlan({
  projectId,
  versionId,
  sharedRef,
  subInstancesRef,
  phaseRef,
  roomDims,
  seatingPositions,
  frontSubsCfg,
  rearSubsCfg,
  amplifierPowerPerSubW,
  appState,
  hasCanonicalInstances,
  waitForCurrentPublication,
}) {
  const runningRef = useRef(false);
  const [status, setStatus] = useState("idle"); // idle | running | complete | failed
  const [error, setError] = useState(null);

  const runOptimisationPlan = useCallback(async () => {
    if (runningRef.current || !hasCanonicalInstances) return;

    runningRef.current = true;
    setStatus("running");
    setError(null);

    try {
      const live = sharedRef.current;
      if (live?.hasCurrentResult !== true) {
        if (typeof live?.onCalculate !== "function" || live?.canCalculate !== true) {
          setStatus("failed");
          setError("The design has no current bass result. Calculate Performance, then run the Optimisation Plan.");
          return;
        }
        phaseRef.current = "calculating";
        live.onCalculate();
        if (!(await waitForCurrentPublication(sharedRef, phaseRef))) {
          setStatus("failed");
          setError("The bass calculation did not publish a current result. Retry Calculate Performance, then run the Optimisation Plan.");
          return;
        }
      }

      phaseRef.current = "optimising";
      const result = await runOptimisation({
        projectId,
        versionId,
        shared: sharedRef.current,
        subwooferInstances: subInstancesRef.current,
        roomDims,
        seatingPositions,
        frontSubsCfg,
        rearSubsCfg,
        amplifierPowerPerSubW,
        subwooferBottomHeightM: frontSubsCfg?.bottomHeightM ?? rearSubsCfg?.bottomHeightM ?? 0,
        appState,
      });

      if (result.status === "cancelled") {
        setStatus("idle");
        return;
      }
      if (result.status === "error" || result.status === "stale") {
        setStatus("failed");
        setError(result.error || "The optimiser could not complete. Re-run the Optimisation Plan.");
        return;
      }

      const currentShared = sharedRef.current;
      const fingerprint = currentShared?.completedBassAuthority?.contract?.job?.resultFingerprint
        || currentShared?.currentFingerprint
        || null;

      const optimiserPlan = buildOptimiserPlan({
        selection: result.selection,
        baseline: result.selection?.currentResult || null,
        identity: {
          projectId,
          versionId,
          designFingerprint: currentShared?.cacheKey || null,
          resultFingerprint: fingerprint,
          cacheKey: currentShared?.cacheKey || null,
          baseDesignFingerprint: currentShared?.baseDesignFingerprint || null,
          target: {
            p14TargetDb: currentShared?.authoritative?.requested?.selectedP14TargetDb
              ?? currentShared?.completedBassAuthority?.p14TargetDb
              ?? null,
            targetKey: null,
          },
          engineVersion: result.selection?.winner?.algorithmVersion || null,
        },
        instances: subInstancesRef.current || [],
        leverDecisions: getOptimiserPlanAuthority(projectId, versionId)?.leverDecisions || {},
      });

      if (!optimiserPlan) {
        setStatus("failed");
        setError("The optimiser returned no evaluated plan for this design. Re-run the Optimisation Plan.");
        return;
      }

      setOptimiserPlanAuthority(projectId, versionId, optimiserPlan);
      if (fingerprint && result.recommendation) {
        await publishRecommendation(
          projectId,
          versionId,
          { ...result.recommendation, optimiserPlan },
          fingerprint,
        );
      }

      setStatus("complete");
    } catch (err) {
      setStatus("failed");
      setError(err?.message || "The optimiser could not complete. Re-run the Optimisation Plan.");
    } finally {
      runningRef.current = false;
      phaseRef.current = "idle";
    }
  }, [
    projectId, versionId, roomDims, seatingPositions, frontSubsCfg, rearSubsCfg,
    amplifierPowerPerSubW, appState, hasCanonicalInstances, sharedRef,
    subInstancesRef, phaseRef, waitForCurrentPublication,
  ]);

  return { runOptimisationPlan, planRunStatus: status, planRunError: error };
}