// useRunOptimisationPlan.js
// ---------------------------------------------------------------------------
// The Bass Optimiser run — EVIDENCE ONLY.
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
import { buildOptimiserResultForSave } from "@/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserRunEvidence } from "@/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
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
      if (result.status === "blocked") {
        // The optimiser baseline must BE the published bass result. With no
        // matching completed authority the run stopped before evaluating
        // anything: the block reason and its parity trace are saved as terminal
        // evidence (so the card states it after reopen) and NOTHING is saved as
        // an actionable plan — there is no baseline, no comparison and no Apply.
        const blockedShared = sharedRef.current;
        const blockedEvidence = buildOptimiserRunEvidence({
          identity: {
            projectId,
            versionId,
            designFingerprint: blockedShared?.cacheKey || null,
            resultFingerprint: blockedShared?.completedBassAuthority?.contract?.job?.resultFingerprint
              || blockedShared?.currentFingerprint || null,
            cacheKey: blockedShared?.cacheKey || null,
            baseDesignFingerprint: blockedShared?.baseDesignFingerprint || null,
            baselineParity: result.baselineParity || null,
          },
          baselineParity: result.baselineParity || null,
        });
        if (blockedEvidence) setOptimiserPlanAuthority(projectId, versionId, blockedEvidence);
        setStatus("failed");
        setError(result.error || "Bass calculation required before optimisation.");
        return;
      }

      const currentShared = sharedRef.current;
      const fingerprint = currentShared?.completedBassAuthority?.contract?.job?.resultFingerprint
        || currentShared?.currentFingerprint
        || null;

      const planIdentity = {
        projectId,
        versionId,
        // The published-authority parity this evaluation was made under.
        baselineParity: result.baselineParity || null,
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
      };

      const optimiserPlan = buildOptimiserPlan({
        selection: result.selection,
        baseline: result.selection?.currentResult || null,
        identity: planIdentity,
        instances: subInstancesRef.current || [],
        // The design's own seating and room, so an evaluated seating movement is
        // persisted with its exact previous/evaluated positions and validity.
        seatingPositions,
        roomDims,
        leverDecisions: getOptimiserPlanAuthority(projectId, versionId)?.leverDecisions || {},
      });

      // A run is only saved as an actionable plan when at least one independently
      // evaluated change is visible, usable, geometry-safe and clears the 1 dB
      // materiality gate. Any other run keeps its terminal evidence — with the
      // actual reason — instead of being called actionable because a winner
      // happened to exist.
      const { actionablePlan: persistedPlan, runEvidence } = buildOptimiserResultForSave({
        plan: optimiserPlan,
        selection: result.selection,
        diagnostics: result.optimisationDiagnostics || null,
        identity: planIdentity,
      });

      if (!persistedPlan && !runEvidence) {
        setStatus("failed");
        setError("The optimiser returned no usable result for this design. Re-run the Optimisation Plan.");
        return;
      }

      setOptimiserPlanAuthority(projectId, versionId, persistedPlan || runEvidence);

      // Only an actionable plan is published with the recommendation. A rejected
      // candidate is never published as an available recommendation.
      if (persistedPlan && fingerprint && result.recommendation) {
        await publishRecommendation(
          projectId,
          versionId,
          { ...result.recommendation, optimiserPlan: persistedPlan },
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