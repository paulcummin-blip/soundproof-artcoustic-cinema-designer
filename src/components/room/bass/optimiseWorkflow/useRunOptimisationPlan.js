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
//      persistence layer — the in-memory authority, which project autosave writes
//      into the version's design_state. THE SAVED PLAN IS THE TERMINAL BOUNDARY:
//      the run is finished for the designer at that instant.
//   4. publishes the recommendation as SECONDARY background work, after that
//      boundary. Its outcome is recorded as its own diagnostic and can never hold
//      the terminal card, turn a saved plan into a failed run, or affect the bass
//      authority, the reports or the ability to carry on designing.
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
  runTimingAt,
} from "@/components/room/bass/optimiserPlan/optimiserRunTimings.js";
import { persistOptimiserRunHistory } from "@/components/room/bass/optimiserPlan/optimiserRunHistory.js";
import { summariseElectronicStageBreakdown } from "@/components/room/bass/electronicSafety/electronicTimingLedger.js";
import {
  buildRecommendationPublicationRecord,
  publishOptimiserRecommendation,
} from "@/components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";
import { OPTIMISER_FAILURE_STATUS } from "@/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

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

    // ── THE RUN'S DURABLE LIFECYCLE ROW ──
    // One lightweight row per run, appended when the run reaches its terminal
    // state. It answers from the database, rather than from a console log that is
    // gone by the time anyone asks: when the plan was ready, when the publication
    // started and finished, what the terminal status and publication status were,
    // the publication error verbatim, how many attempts that took, and which
    // fingerprints were written.
    //
    // It stores NO candidate payload — the result itself stays on the run's own
    // saved record, and the run history is never read as a current engineering
    // value or as a readiness input. A failure to write it is reported and
    // swallowed: a diagnostic row must never break, delay or alter a run, so the
    // write is dispatched without being awaited.
    const logRunHistory = (facts = {}) => {
      const timings = getRunTimings(projectId, versionId);
      const live = sharedRef.current;
      Promise.resolve(persistOptimiserRunHistory({
        runId: activeRun.runId,
        projectId,
        versionId,
        designFingerprint: live?.cacheKey || null,
        resultFingerprint: live?.completedBassAuthority?.contract?.job?.resultFingerprint
          || live?.currentFingerprint || null,
        startedAt: activeRun.startedAt,
        planSavedAt: runTimingAt(timings, RUN_TIMING.SAVE_COMPLETED),
        // THE DESIGNER'S OWN TERMINAL INSTANT — the saved plan. The secondary
        // publication that follows it is recorded separately and never moves it.
        userTerminalAt: runTimingAt(timings, RUN_TIMING.USER_TERMINAL),
        terminalAt: runTimingAt(timings, RUN_TIMING.USER_TERMINAL) || new Date().toISOString(),
        publicationStartedAt: runTimingAt(timings, RUN_TIMING.PUBLICATION_STARTED),
        publicationCompletedAt: runTimingAt(timings, RUN_TIMING.PUBLICATION_COMPLETED),
        publicationAttemptCount: Number.isFinite(timings?.publicationRetries)
          ? timings.publicationRetries
          : 0,
        ...facts,
      })).catch(() => {});
    };

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
        // THE PLAN COULD NOT BE SAVED. This is a real optimiser failure and it is
        // recorded as itself — the analysis produced no result that could be saved
        // for this design — with the two actions that answer it (retry, or keep
        // the current bass result). It is persisted WITH the record, so a reload
        // restores this same terminal state instead of rebuilding another one.
        failure: extra.planSaveFailed
          ? {
            status: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
            category: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
            message: reason,
            publicationError: null,
            attempts: null,
            at: new Date().toISOString(),
            runId: activeRun.runId,
          }
          : null,
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
          logRunHistory({
            terminalStatus: "failed",
            publicationStatus: "not_attempted",
            publicationError: reason,
          });
          setStatus("failed");
          setError(reason);
          return;
        }
        phaseRef.current = "calculating";
        live.onCalculate();
        if (!(await waitForCurrentPublication(sharedRef, phaseRef))) {
          const reason = "The bass calculation did not publish a current result. Retry Calculate Performance, then run the Optimisation Plan.";
          saveRunFailure(reason);
          logRunHistory({
            terminalStatus: "failed",
            publicationStatus: "not_attempted",
            publicationError: reason,
          });
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
        logRunHistory({ terminalStatus: "cancelled", publicationStatus: "not_attempted" });
        setStatus("idle");
        return;
      }
      if (result.status === "error" || result.status === "stale") {
        const reason = result.error || "The optimiser could not complete. Re-run the Optimisation Plan.";
        saveRunFailure(reason, { baselineParity: result.baselineParity || null });
        logRunHistory({
          terminalStatus: "failed",
          publicationStatus: "not_attempted",
          publicationError: reason,
        });
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
        logRunHistory({
          terminalStatus: "blocked",
          publicationStatus: "not_attempted",
          publicationError: result.error || null,
        });
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
        // The evaluated result could not be saved: the one failure the optimiser
        // still owns, and the only one that may state itself as a failed run.
        saveRunFailure(reason, { planSaveFailed: true });
        logRunHistory({
          terminalStatus: "evaluation_incomplete",
          publicationStatus: "not_attempted",
          publicationError: reason,
        });
        setStatus("failed");
        setError(reason);
        return;
      }

      // ── 1. THE SAVE — AND THE DESIGNER'S TERMINAL BOUNDARY ──
      // The saved plan IS the result. The moment this write lands the run has a
      // verdict the designer can read and act on, and the terminal card is
      // rendered from THIS record. Nothing below this boundary may hold the UI:
      // the recommendation publication is secondary work that happens after the
      // designer already has the result.
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
        runtimeBreakdown,
      });
      recordRunTiming(projectId, versionId, RUN_TIMING.SAVE_COMPLETED);

      // ── 2. THE TERMINAL AUTHORITY, WRITTEN AT PLAN SAVE ──
      // The run is terminal here — from its own durable plan, never from a
      // publication that has not happened yet. `userTerminalAt` is this instant,
      // and it never waits for the secondary publication below.
      recordRunTiming(projectId, versionId, RUN_TIMING.USER_TERMINAL);
      recordRunTiming(projectId, versionId, RUN_TIMING.UI_READY_WRITTEN);
      setOptimiserPlanAuthority(projectId, versionId, {
        ...runRecord,
        timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
        runtimeBreakdown,
      });
      setStatus("complete");

      // ── 3. THE RECOMMENDATION PUBLICATION — SECONDARY, NEVER BLOCKING ──
      // ONE publication operation per run, exactly as before, and exactly one
      // chain of attempts for one project · version · run · design fingerprint ·
      // result fingerprint. It runs AFTER the terminal boundary above, so it can
      // never hold the designer's card, and its outcome is recorded as its own
      // secondary diagnostic: a refused publication does not turn a saved,
      // validated optimiser plan into a failed run. The current bass result, the
      // reports and the ability to carry on designing are untouched either way.
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

      const recommendationPublication = buildRecommendationPublicationRecord({
        publication,
        runId: activeRun.runId,
      });

      // ONE further write — after the terminal boundary, caused once by the
      // publication and never repeated — carrying what it did. It changes no
      // result, no design value and no readiness of anything: a reload restores
      // the same terminal state, with the publication's outcome beside it.
      setOptimiserPlanAuthority(projectId, versionId, {
        ...runRecord,
        timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
        runtimeBreakdown,
        recommendationPublication,
      });

      logRunHistory({
        terminalStatus: persistedPlan ? "actionable_plan" : "no_useful_improvement",
        publicationStatus: recommendationPublication.status,
        publicationError: recommendationPublication.error,
        // The fingerprints the publication actually wrote, from its own result —
        // diagnostic identity only.
        fingerprintsPublished: recommendationPublication.fingerprints,
        runtimeBreakdown,
      });
    } catch (err) {
      const reason = err?.message || "The optimiser could not complete. Re-run the Optimisation Plan.";
      saveRunFailure(reason);
      logRunHistory({
        terminalStatus: "failed",
        publicationStatus: "not_attempted",
        publicationError: reason,
      });
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