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
import { buildOptimiserPlan } from "@/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { buildOptimiserResultForSave } from "@/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserRunEvidence } from "@/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { resolveCalibrationApplicationPlan } from "./adiCalibrationCandidateSelection.js";
import { getAppliedCalibrationAuthority } from "@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";
import {
  getOptimiserPlanAuthority,
  setOptimiserPlanAuthority,
} from "@/components/room/bass/optimiserPlan/optimiserPlanStore.js";
import { beginOptimiserRun } from "@/components/room/bass/optimiserPlan/optimiserRunAuthority.js";
import {
  RUN_TIMING,
  beginRunTimings,
  buildPersistedRunTimings,
  getRunTimings,
  recordRunTiming,
} from "@/components/room/bass/optimiserPlan/optimiserRunTimings.js";
import { summariseElectronicStageBreakdown } from "@/components/room/bass/electronicSafety/electronicTimingLedger.js";
import { publishOptimiserRecommendation } from "@/components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";

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

    // STARTING THIS RUN SUPERSEDES THE PREVIOUS ONE. The run gets its own id, and
    // the record already saved for this design becomes history: from here the
    // panel states this run — what it is doing, and then what IT found — and
    // nothing of the earlier result. The earlier record is neither cleared nor
    // rewritten, so it stays readable for history, diagnostics and audit.
    const activeRun = beginOptimiserRun(projectId, versionId);
    // Durable timing instrumentation for this run: the milestones it reaches are
    // written into its own saved record, so a run that took far longer than it
    // should can be diagnosed from the record later instead of guessed at.
    beginRunTimings(projectId, versionId, activeRun.runId);

    // Every fresh run gets a durable terminal record, including early or thrown
    // failures. Without this, refresh could discard the in-memory run authority
    // and restore the previous re-test artifact as though the new run never
    // happened.
    const saveRunFailure = (reason, extra = {}) => {
      const current = sharedRef.current;
      const evidence = buildOptimiserRunEvidence({
        identity: {
          projectId,
          versionId,
          designFingerprint: current?.cacheKey || null,
          resultFingerprint: current?.completedBassAuthority?.contract?.job?.resultFingerprint
            || current?.currentFingerprint || null,
          cacheKey: current?.cacheKey || null,
          baseDesignFingerprint: current?.baseDesignFingerprint || null,
          baselineParity: extra.baselineParity || null,
        },
        baselineParity: extra.baselineParity || null,
        failureReason: reason,
        runIdentity: activeRun,
      });
      if (evidence) setOptimiserPlanAuthority(projectId, versionId, evidence);
    };

    try {
      const live = sharedRef.current;
      if (live?.hasCurrentResult !== true) {
        if (typeof live?.onCalculate !== "function" || live?.canCalculate !== true) {
          const reason = "The design has no current bass result. Calculate Performance, then run the Optimisation Plan.";
          saveRunFailure(reason);
          setStatus("failed");
          setError(reason);
          return;
        }
        phaseRef.current = "calculating";
        live.onCalculate();
        if (!(await waitForCurrentPublication(sharedRef, phaseRef))) {
          const reason = "The bass calculation did not publish a current result. Retry Calculate Performance, then run the Optimisation Plan.";
          saveRunFailure(reason);
          setStatus("failed");
          setError(reason);
          return;
        }
      }

      recordRunTiming(projectId, versionId, RUN_TIMING.CALCULATION_COMPLETE);

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
        // THIS RUN OWNS ITS OWN PUBLICATION. It saves the evaluated plan, so the
        // recommendation is published ONCE — by the step below, with the plan
        // attached — instead of the run publishing it and this step publishing it
        // again against the same snapshot. The fingerprint the run itself would
        // have used is returned on the result, so a genuinely different snapshot
        // is still written when the two keys differ (see
        // optimiserRecommendationPublication.js).
        deferRecommendationPublication: true,
      });

      if (result.status === "cancelled") {
        setStatus("idle");
        return;
      }
      if (result.status === "error" || result.status === "stale") {
        const reason = result.error || "The optimiser could not complete. Re-run the Optimisation Plan.";
        saveRunFailure(reason, { baselineParity: result.baselineParity || null });
        setStatus("failed");
        setError(reason);
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
          runIdentity: activeRun,
        });
        if (blockedEvidence) setOptimiserPlanAuthority(projectId, versionId, blockedEvidence);
        setStatus("failed");
        setError(result.error || "Bass calculation required before optimisation.");
        return;
      }

      const currentShared = sharedRef.current;
      // The run's search is over and its verdict is settled from here on.
      recordRunTiming(projectId, versionId, RUN_TIMING.TERMINAL_VERDICT_READY);
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

      // The calibration decision for this evaluation: what ADI would apply, and
      // why it held everything else. This path changes no design, so nothing is
      // applied here (decisionApplied: false) and the panel states the decision
      // as held, with its reason, instead of a bare "not applied".
      const calibrationDecision = resolveCalibrationApplicationPlan({
        baseline: result.selection?.currentResult || null,
        selection: result.selection,
        objectives: result.selection?.objectives || null,
        instances: subInstancesRef.current || [],
        appliedCalibration: getAppliedCalibrationAuthority(projectId, versionId),
      });

      const optimiserPlan = buildOptimiserPlan({
        selection: result.selection,
        baseline: result.selection?.currentResult || null,
        identity: planIdentity,
        calibrationDecision,
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
        calibrationDecision,
        runIdentity: activeRun,
      });

      if (!persistedPlan && !runEvidence) {
        const reason = "The optimiser returned no usable result for this design. Re-run the Optimisation Plan.";
        saveRunFailure(reason);
        setStatus("failed");
        setError(reason);
        return;
      }

      // ── THE SAVE, THEN THE ONE PUBLICATION ──
      // The record is saved first, exactly as before, so the result is durable
      // the moment the run has a verdict. Its own run timing ledger travels with
      // it, and is completed once the publication has finished.
      recordRunTiming(projectId, versionId, RUN_TIMING.SAVE_STARTED);
      const runRecord = persistedPlan || runEvidence;
      // The engine's own existing runtime telemetry, in the budget's named stages,
      // is saved WITH the run so the split between electronic work and physical or
      // seating advisory work can be read back long after the console log is gone.
      // It is measurement only: nothing here affects a decision or a value.
      const runtimeBreakdown = summariseElectronicStageBreakdown({
        runtimeMetrics: result.runtimeMetrics || null,
      });
      setOptimiserPlanAuthority(projectId, versionId, {
        ...runRecord,
        timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
        runtimeBreakdown,
      });
      recordRunTiming(projectId, versionId, RUN_TIMING.SAVE_COMPLETED);

      // ONE publication operation, however many snapshots genuinely need it: the
      // evaluated plan is published with the recommendation, and the fingerprint
      // the run itself would have used is preserved when it is a different one.
      const publication = await publishOptimiserRecommendation({
        projectId,
        versionId,
        recommendation: result.recommendation,
        plan: persistedPlan,
        runFingerprint: result.recommendationPublication?.fingerprint || null,
        // The saving step publishes against the plan only: exactly the condition
        // under which it has always published.
        savedFingerprint: persistedPlan ? fingerprint : null,
      });

      // ── A PUBLICATION THAT FAILED IS TERMINAL ──
      // The run STOPS here. It never stays in flight, and it never polls: its own
      // saved record states the failure — the run id, the failure status, its
      // category, the publication error and the moment — so the panel can offer
      // Retry ADI or the designer's own Keep current bass result.
      //
      // The evaluated result is kept EXACTLY as saved: nothing is discarded, the
      // design is unchanged, and the failure travels with the record it belongs
      // to. What could not be written is the published recommendation, and that
      // is what the failure states.
      if (!publication.ok) {
        const failure = {
          status: "publication_failed",
          category: publication.failure?.category || "write_refused",
          message: publication.failure?.message || "The optimiser result could not be saved.",
          publicationError: publication.failure?.publicationError || publication.failure?.message || null,
          attempts: publication.failure?.attempts ?? null,
          at: publication.failure?.at || new Date().toISOString(),
          runId: activeRun.runId,
        };
        recordRunTiming(projectId, versionId, RUN_TIMING.UI_READY_WRITTEN);
        setOptimiserPlanAuthority(projectId, versionId, {
          ...runRecord,
          failure,
          timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
          runtimeBreakdown,
        });
        setStatus("failed");
        setError(failure.message);
        return;
      }

      // The UI-ready authority: the same record, now carrying the completed run
      // timings — including the publication and its retry count.
      recordRunTiming(projectId, versionId, RUN_TIMING.UI_READY_WRITTEN);
      setOptimiserPlanAuthority(projectId, versionId, {
        ...runRecord,
        timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
        runtimeBreakdown,
      });

      setStatus("complete");
    } catch (err) {
      const reason = err?.message || "The optimiser could not complete. Re-run the Optimisation Plan.";
      saveRunFailure(reason);
      setStatus("failed");
      setError(reason);
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