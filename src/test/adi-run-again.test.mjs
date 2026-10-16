// adi-run-again.test.mjs
// ---------------------------------------------------------------------------
// RUN ADI AGAIN — the deliberate re-run of a COMPLETED evaluation.
//
// What this suite pins:
//
//   • a COMPLETED evaluation offers RUN ADI AGAIN — improvement found, an
//     applied improvement, a physical change, a trade-off found, the trade-off
//     kept, a completed no-improvement search — and the action is offered
//     whether or not a decision (Apply · Review · Keep) is on the table
//   • a FAILED or INCOMPLETE evaluation never becomes RUN ADI AGAIN: it keeps
//     RETRY ADI / RE-TEST BASS OPTIMISATION / the bass recalculation
//   • it is never the primary action, is never a second run control, and is not
//     drawn while a run is in flight (no overlapping run)
//   • starting it MINTS A NEW RUN ID, RESETS THE RUN'S OWN CLOCK TO ZERO, keeps
//     the same project/version/design and requires no design change: when the
//     bass result is already current it is not recalculated
//   • the earlier run's record becomes history for presentation only, and the
//     re-run writes its OWN OptimiserRunHistory row
//
// PRESENTATION AND LIFECYCLE ONLY: no optimiser maths, no search range, no
// candidate ranking, no P19/P20 value, no publication logic, no result
// authority, no report readiness and no panel hierarchy is asserted or changed
// here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ADI_RERUN_AGAIN_LABEL,
  resolveAdiRerunAgain,
} from "@/components/room/bass/optimiserPlan/adiRerunAgainAuthority.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_PRESENTATION_STATE,
  OPTIMISER_RETEST_LABEL,
  resolveOptimiserPresentationState,
} from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  ADI_OPTIMISER_JOURNEY_STATE,
  ADI_PUBLICATION_FAILURE_KEEP_LABEL,
  ADI_PUBLICATION_FAILURE_RETRY_LABEL,
  resolveAdiOptimiserJourney,
} from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  beginOptimiserRun,
  planIsSupersededByRun,
  resetOptimiserRunAuthority,
  resolvePresentationPlan,
} from "@/components/room/bass/optimiserPlan/optimiserRunAuthority.js";
import {
  RUN_TIMING,
  beginRunTimings,
  getRunTimings,
  recordRunTiming,
  resetRunTimings,
} from "@/components/room/bass/optimiserPlan/optimiserRunTimings.js";
import { buildOptimiserRunProgress } from "@/components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js";

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const PLAN_DIR = "src/components/room/bass/optimiserPlan";
const journey = read(`${PLAN_DIR}/AdiOptimisationJourney.jsx`);
const action = read(`${PLAN_DIR}/AdiRerunAgainAction.jsx`);
const authority = read(`${PLAN_DIR}/adiRerunAgainAuthority.js`);
const presentationAuthority = read(`${PLAN_DIR}/resolveOptimiserPresentationState.js`);
const RUN_HOOK = "src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const hook = read(RUN_HOOK);

/** A completed plan whose evaluated change is an electronic (calibration) one. */
const CALIBRATION_PLAN = {
  status: "current",
  individualEffectsEvaluated: true,
  baseline: { p20VariationDb: 16 },
  baselineParity: { status: "MATCHED" },
  run: { rejectionReasons: [] },
  levers: [{
    key: "delay",
    evaluated: true,
    canApply: true,
    effect: { p20DeltaDb: -2 },
    changes: [{ lever: "delay", field: "delayMs", to: 4.5 }],
  }],
};

/** A completed plan whose evaluated change is a physical one. */
const PHYSICAL_PLAN = {
  status: "current",
  individualEffectsEvaluated: true,
  baseline: { p20VariationDb: 16 },
  baselineParity: { status: "MATCHED" },
  run: { rejectionReasons: [] },
  levers: [{
    key: "placement",
    evaluated: true,
    canApply: true,
    effect: { p20DeltaDb: -3 },
    changes: [{ instanceId: "s1", axis: "x", to: 1.2 }],
  }],
};

/** The designer's own "keep the current design" on a found trade-off. */
const KEPT_TRADE_OFF = { isTradeOff: true, kept: true, headline: "The trade-off was not taken." };

describe("RUN ADI AGAIN on a completed evaluation", () => {
  it("is offered after an improvement was found", () => {
    const state = resolveOptimiserPresentationState({ planView: CALIBRATION_PLAN });
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
    expect(state.rerunAgain).toBe(true);
    expect(state.actionLabel).toBe(ADI_RERUN_AGAIN_LABEL);
    // The decision still owns the Apply: the re-run is offered BESIDE it.
    expect(state.showApply).toBe(true);
  });

  it("is offered after an improvement was applied", () => {
    // An APPLIED improvement is the same completed outcome — the applied state
    // lives on the run's own calibration decision, not on the outcome — so the
    // deliberate re-run is offered with it, unchanged.
    const state = resolveOptimiserPresentationState({ planView: CALIBRATION_PLAN });
    expect(resolveAdiRerunAgain({ outcome: state.outcome }).offered).toBe(true);
    expect(resolveAdiRerunAgain({ outcome: state.outcome }).label).toBe(ADI_RERUN_AGAIN_LABEL);
  });

  it("is offered after a physical change was recommended", () => {
    const state = resolveOptimiserPresentationState({ planView: PHYSICAL_PLAN });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.PHYSICAL_CHANGE);
    expect(state.rerunAgain).toBe(true);
    expect(state.actionLabel).toBe(ADI_RERUN_AGAIN_LABEL);
  });

  it("is offered after a completed search found no improvement", () => {
    const state = resolveOptimiserPresentationState({
      planView: { status: "no_useful_improvement", run: { rejectionReasons: [] } },
    });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
    expect(state.rerunAgain).toBe(true);
    expect(state.actionLabel).toBe(ADI_RERUN_AGAIN_LABEL);
  });

  it("is offered after a trade-off was found — beside the decision, not instead of it", () => {
    const state = resolveOptimiserPresentationState({
      planView: { status: "current" },
      tradeOff: { isTradeOff: true, headline: "ADI found a change that improves overall bass consistency, but one primary seat would get worse." },
    });
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.TRADE_OFF);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.TRADE_OFF);
    expect(state.rerunAgain).toBe(true);
    // No PRIMARY run control in this state: the review and the keep own the
    // decision, and the re-run is the quiet control under it.
    expect(state.action).toBeNull();
    expect(state.canRun).toBe(true);
  });

  it("is offered after the trade-off was kept", () => {
    // Keeping the current design is a decision about the candidate, not a change
    // to the evaluation: the state is still the completed trade-off, so the
    // deliberate re-run is still offered — the kept decision is not a dead end.
    const state = resolveOptimiserPresentationState({
      planView: { status: "current" },
      tradeOff: KEPT_TRADE_OFF,
    });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.TRADE_OFF);
    expect(state.rerunAgain).toBe(true);
    // The quiet control's own gate never asks whether the trade-off was kept.
    expect(journey).toMatch(/const showRerunAgain = rerunAgain\.offered && !isRunning/);
    expect(/const showRerunAgain = [^;]*kept/i.test(journey)).toBe(false);
  });

  it("is offered from the journey's own completed states when no presentation is supplied", () => {
    expect(resolveAdiRerunAgain({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE }).offered).toBe(true);
    expect(resolveAdiRerunAgain({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT }).offered).toBe(true);
  });

  it("states the same one wording everywhere it is offered", () => {
    expect(ADI_RERUN_AGAIN_LABEL).toBe("RUN ADI AGAIN");
    expect(authority).toContain('export const ADI_RERUN_AGAIN_LABEL = "RUN ADI AGAIN";');
    // The card and the authority state the one label; nothing writes its own.
    expect(action).toMatch(/\{label\}/);
    expect(journey).toMatch(/label=\{rerunAgain\.label\}/);
  });
});

describe("FAILED and INCOMPLETE states keep their own wording", () => {
  it("never offers RUN ADI AGAIN for a re-test, a technical failure or a bass update", () => {
    [
      OPTIMISER_OUTCOME.RETEST_NEEDED,
      OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE,
      OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED,
    ].forEach((outcome) => {
      const resolved = resolveAdiRerunAgain({ outcome });
      expect(resolved.offered).toBe(false);
      expect(resolved.available).toBe(false);
      expect(resolved.label).toBeNull();
    });
    [
      ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE,
      ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED,
      ADI_OPTIMISER_JOURNEY_STATE.FAILED,
      ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED,
    ].forEach((journeyStateKey) => {
      expect(resolveAdiRerunAgain({ journeyStateKey }).offered).toBe(false);
    });
  });

  it("keeps RETRY ADI and KEEP CURRENT BASS RESULT on a failed publication", () => {
    expect(ADI_PUBLICATION_FAILURE_RETRY_LABEL).toBe("RETRY ADI");
    expect(ADI_PUBLICATION_FAILURE_KEEP_LABEL).toBe("KEEP CURRENT BASS RESULT");
    const failed = resolveAdiOptimiserJourney({
      planView: null,
      publicationFailure: { status: "publication_failed", runId: "run-1", message: "write refused" },
    });
    expect(failed.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
    expect(failed.primaryLabel).toBe("RETRY ADI");
    expect(failed.keepAction.label).toBe("KEEP CURRENT BASS RESULT");
    // The failure's own two controls are untouched, and the quiet re-run is not
    // drawn while a failure is being held in front of the designer.
    expect(journey).toMatch(/data-adi-keep-current-bass="true"/);
    expect(journey).toMatch(/&& !publicationFailureActive;/);
  });

  it("keeps the re-test's own single control for a failed run", () => {
    const failed = resolveOptimiserPresentationState({ planView: null, runStatus: "failed" });
    expect(failed.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
    expect(failed.actionLabel).not.toBe(ADI_RERUN_AGAIN_LABEL);
    expect(failed.rerunAgain).toBe(false);
  });
});

describe("one run control, never a competing primary, never while running", () => {
  it("draws the quiet control only where no other control states the same action", () => {
    expect(journey).toMatch(/showRerunAgain && \(\s*\n\s*<AdiRerunAgainAction/);
    expect(journey).toMatch(/&& !\(showAction && !panelShowsRerun\)/);
    expect(journey).toMatch(/&& !panelShowsRerun\s*\n\s*&& !publicationFailureActive;/);
  });

  it("is not drawn while a run is in flight", () => {
    expect(journey).toMatch(/const showRerunAgain = rerunAgain\.offered && !isRunning/);
    // And the resolved state agrees: offered, but not available.
    const running = resolveAdiRerunAgain({
      outcome: OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND,
      running: true,
    });
    expect(running.offered).toBe(true);
    expect(running.available).toBe(false);
    expect(running.disabledReason).toBeTruthy();
    // A blocked design states why, and stays pressable only when it may run.
    const blocked = resolveAdiRerunAgain({
      outcome: OPTIMISER_OUTCOME.NO_IMPROVEMENTS,
      blockedReason: "This design has changed since the bass result was published.",
    });
    expect(blocked.available).toBe(false);
    expect(blocked.disabledReason).toBe("This design has changed since the bass result was published.");
  });

  it("carries the quiet styling, never the primary control's", () => {
    expect(action).toMatch(/const QUIET_CONTROL = "inline-flex items-center gap-1\.5 rounded-md px-3 py-2/);
    expect(action).toMatch(/className=\{QUIET_CONTROL\}/);
    expect(action).not.toMatch(/ADI_RUN_PRIMARY_CLASS/);
    expect(action).not.toMatch(/bg-\[#213428\]/);
  });

  it("runs the same run action the card's own run control runs", () => {
    expect(journey).toMatch(/onRunAgain=\{onRunOptimisationPlan\}/);
    expect(journey).toMatch(
      /onClick=\{journey\.action === ADI_OPTIMISER_ACTION\.CALCULATE\s*\n\s*\? onCalculateBassPerformance\s*\n\s*: onRunOptimisationPlan\}/,
    );
    // Nothing else is reachable from the control: it applies nothing and writes
    // no design value.
    const block = action;
    expect(/onApply|commitInstances|commitSeating|bulkUpdate/.test(block)).toBe(false);
  });
});

describe("a re-run mints its own run identity and its own clock", () => {
  it("mints a NEW run id, and its own timer starts at zero", () => {
    resetOptimiserRunAuthority("proj-run-again", "ver-1");
    const first = beginOptimiserRun("proj-run-again", "ver-1");
    const second = beginOptimiserRun("proj-run-again", "ver-1");

    expect(second.runId).not.toBe(first.runId);
    // The new run's own clock begins when it is minted: it never inherits the
    // run it replaced.
    expect(second.lastProgressAt).toBe(second.startedAt);
    expect(second.currentStageStartedAt).toBe(second.startedAt);
    expect(second.supersededRunId).toBe(first.runId);
    resetOptimiserRunAuthority("proj-run-again", "ver-1");
  });

  it("resets the run's own timing ledger, so no earlier milestone is inherited", () => {
    resetRunTimings("proj-run-again", "ver-2");
    const first = beginOptimiserRun("proj-run-again", "ver-2");
    beginRunTimings("proj-run-again", "ver-2", first.runId);
    recordRunTiming("proj-run-again", "ver-2", RUN_TIMING.TERMINAL_VERDICT_READY);

    const second = beginOptimiserRun("proj-run-again", "ver-2");
    beginRunTimings("proj-run-again", "ver-2", second.runId);
    const ledger = getRunTimings("proj-run-again", "ver-2");

    expect(ledger.runId).toBe(second.runId);
    expect(Object.keys(ledger.milestones).length).toBe(0);
    expect(ledger.publicationRetries).toBe(0);
    resetRunTimings("proj-run-again", "ver-2");
    resetOptimiserRunAuthority("proj-run-again", "ver-2");
  });

  it("shows the new run's own elapsed time, not the age of the run it replaced", () => {
    resetRunTimings("proj-run-again", "ver-3");
    const oldRun = beginOptimiserRun("proj-run-again", "ver-3");
    const newRun = beginOptimiserRun("proj-run-again", "ver-3");

    // The engine's own progress store is a separate authority that a new run does
    // not reset: it is still reporting the OLD run's start and last report.
    const live = {
      status: "running",
      startedAtMs: Date.parse(oldRun.startedAt) - 600000,
      lastProgressAt: Date.parse(oldRun.startedAt),
      phase: "calibrating",
    };
    const progress = buildOptimiserRunProgress({
      live,
      run: newRun,
      runStatus: "running",
      nowMs: Date.parse(newRun.startedAt) + 5000,
    });

    expect(progress.runId).toBe(newRun.runId);
    expect(progress.elapsedSeconds).toBe(5);
    expect(progress.stalled).toBe(false);
    resetRunTimings("proj-run-again", "ver-3");
    resetOptimiserRunAuthority("proj-run-again", "ver-3");
  });

  it("turns the earlier run's result into history for presentation only", () => {
    resetOptimiserRunAuthority("proj-run-again", "ver-4");
    const first = beginOptimiserRun("proj-run-again", "ver-4");
    const savedRecord = { savedAt: new Date().toISOString(), run: { runId: first.runId } };
    const second = beginOptimiserRun("proj-run-again", "ver-4");

    expect(planIsSupersededByRun(savedRecord, second)).toBe(true);
    const resolved = resolvePresentationPlan({ plan: savedRecord, run: second });
    // The earlier record is not handed to the presentation at all — it is history
    // — while the new run owns the live state.
    expect(resolved.plan).toBeNull();
    expect(resolved.superseded).toBe(true);
    expect(resolved.supersededByRunId).toBe(second.runId);
    resetOptimiserRunAuthority("proj-run-again", "ver-4");
  });
});

describe("no design change and no bass recalculation are required", () => {
  it("requires no design change", () => {
    // The run action itself never writes a design field: it evaluates the current
    // design and saves the result. Nothing about a re-run edits anything.
    expect(/commitInstances|commitSeating|updateMany|bulkUpdate|Project\.update|localStorage/.test(hook)).toBe(false);
  });

  it("reuses the current bass result instead of recalculating it", () => {
    // The bass calculation is reached ONLY when no current result exists at all.
    expect(hook).toMatch(/if \(live\?\.hasCurrentResult !== true\) \{/);
    expect(hook).toMatch(/live\.onCalculate\(\);/);
  });

  it("cannot start an overlapping run", () => {
    expect(hook).toMatch(/if \(runningRef\.current \|\| !hasCanonicalInstances\) return;/);
    expect(hook).toMatch(/runningRef\.current = true;/);
    // And the card hides its run controls while a run is in flight.
    expect(journey).toMatch(/onRerun=\{isRunning \|\| optimiserRunOwnsRetry \? null : onRunOptimisationPlan\}/);
  });

  it("leaves the bass result and the report as they were", () => {
    // Report readiness never reads the optimiser at all, so a re-run — or a
    // re-run that fails — cannot make the report Not Ready.
    const readiness = read("src/components/report/reportReadinessAuthority.js");
    expect(/from\s+["'][^"']*optimiser[^"']*["']/i.test(readiness)).toBe(false);
    expect(/from\s+["'][^"']*adiRerunAgain[^"']*["']/i.test(readiness)).toBe(false);
  });
});

describe("a re-run writes its own run-history row", () => {
  it("keys the row on the run's own minted id, and records every terminal path", () => {
    expect(hook).toMatch(/persistOptimiserRunHistory\(\{\s*\n\s*runId: activeRun\.runId,/);
    expect(hook).toMatch(/terminalStatus: persistedPlan \? "actionable_plan" : "no_useful_improvement"/);
    expect(hook).toMatch(/terminalStatus: "publication_failed"/);
    expect(hook).toMatch(/terminalStatus: "failed"/);
    // A new run id per re-run is what makes the row new: the same run never
    // rewrites its own row, and the previous run's row is left as it was.
    expect(hook).toMatch(/const activeRun = beginOptimiserRun\(projectId, versionId\);/);
  });
});

describe("no optimiser maths or engineering change", () => {
  it("changes no equation, no search range, no ranking and no engineering value", () => {
    const writePattern = /commitInstances|commitSeating|bulkUpdate|updateMany|applyCalibrationTuning|setOptimiserPlanAuthority|manageProjectAnalysisCache|localStorage\.setItem|modeShape|sumRe|sumIm|Math\.(min|max|round|pow|log)/;
    [authority, action].forEach((source) => expect(writePattern.test(source)).toBe(false));
    // The presentation authority's new facts are eligibility and wording only.
    expect(presentationAuthority).toMatch(/rerunAgain: true/);
    expect(/ADI_RERUN_AGAIN_LABEL[\s\S]{0,80}p20/i.test(presentationAuthority)).toBe(false);
  });
});