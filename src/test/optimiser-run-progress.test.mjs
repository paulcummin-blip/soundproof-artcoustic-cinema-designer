// optimiser-run-progress.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED TESTS — a running Bass Optimisation run states what it is ACTUALLY
// doing, and nothing it has not reported.
//
//   • the stage the engine is in, in plain language
//   • the real job count the engine published for that search
//   • elapsed time, and no percentage anywhere
//   • STALLED only when the engine stops reporting — never because a run is slow
//   • a terminal run leaves no timer and no spinner behind
//   • the stall notice's cancel is the ONE existing cancel path
//   • the workload of a three-subwoofer layout, measured and not invented
//
// Nothing here reads or changes an optimiser rule: the tests read the
// presentation authorities, and where they read source they assert wiring.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ADI_OPTIMISER_RUNNING_LABEL,
  OPTIMISER_STALL_AFTER_MS,
  OPTIMISER_STAGE_LABEL,
  buildOptimiserRunProgress,
  describeOptimiserStatusCheck,
  formatOptimiserElapsed,
  resolveOptimiserRunningStage,
} from "../components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js";
import { buildOptimiserRunWorkload } from "../components/room/bass/optimiserPlan/optimiserRunWorkload.js";
import { STAGE1_CANDIDATE_BUDGETS } from "../components/room/bass/stage1/stage1Constants.js";

const read = (relative) => readFileSync(resolve(process.cwd(), relative), "utf8");
const JOURNEY = "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const RUNNING_PANEL = "src/components/room/bass/optimiserPlan/AdiJourneyRunningPanel.jsx";
const PROGRESS_HOOK = "src/components/room/bass/optimiserPlan/useOptimiserRunProgress.js";
const WORKFLOW = "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx";

const NOW = Date.parse("2026-10-15T22:18:00.000Z");
const run = (startedSecondsAgo) => ({
  runId: `optimiser-run-${startedSecondsAgo}`,
  startedAt: new Date(NOW - startedSecondsAgo * 1000).toISOString(),
});

const liveState = (patch = {}) => ({
  status: "running",
  phase: "idle",
  phaseLabel: "",
  progressCurrent: 0,
  progressTotal: 0,
  lastProgressAt: NOW - 1000,
  startedAtMs: NOW - 42000,
  stageVerdicts: {},
  confirmedChallengers: [],
  ...patch,
});

describe("THE STAGE THE ENGINE IS IN, IN PLAIN LANGUAGE", () => {
  const stageOf = (phase, phaseLabel = "") => resolveOptimiserRunningStage({
    state: liveState({ phase, phaseLabel }),
    running: true,
  });

  it("states the preparation before any search has started", () => {
    expect(stageOf("reviewing", "Reviewing current design").key).toBe("baseline");
    expect(stageOf("reviewing").label).toBe("Preparing current design");
  });

  it("names each calibration search for what it tests", () => {
    expect(stageOf("calibrating", "Testing delays").key).toBe("delay");
    expect(stageOf("calibrating", "Testing delays").label).toBe("Testing timing");
    expect(stageOf("calibrating", "Testing gain").key).toBe("gain");
    expect(stageOf("calibrating", "Testing gain").label).toBe("Testing level balance");
    expect(stageOf("calibrating", "Testing phase alignment").key).toBe("phase");
    expect(stageOf("calibrating", "Testing phase alignment").label).toBe("Testing phase alignment");
    // Polarity is its own search inside the phase stage and is named as one.
    expect(stageOf("calibrating", "Testing polarity").key).toBe("polarity");
    expect(stageOf("calibrating", "Testing polarity").label).toBe("Testing polarity");
  });

  it("names the placement search, and a layout search as a layout search", () => {
    expect(stageOf("testing_positions").key).toBe("placement");
    expect(stageOf("screening_symmetric").label).toBe("Testing subwoofer placement");
    expect(stageOf("testing_positions", "Testing alternative layout options").key).toBe("layout");
    expect(stageOf("testing_positions", "Testing alternative layout options").label).toBe("Testing layout options");
  });

  it("names seating, the combined comparison and the final check", () => {
    expect(stageOf("finalising", "Testing seating positions").key).toBe("seating");
    expect(stageOf("finalising", "Testing seating positions").label).toBe("Testing seating options");
    expect(stageOf("combining").key).toBe("combined");
    expect(stageOf("combining").label).toBe("Comparing combined adjustments");
    expect(stageOf("combined_confirming").key).toBe("final");
    expect(stageOf("finalising").label).toBe("Checking the best result");
  });

  it("states that the result is being saved once the search has finished", () => {
    const stage = resolveOptimiserRunningStage({
      state: liveState({ status: "complete", phase: "finalising" }),
      running: true,
    });
    expect(stage.key).toBe("persistence");
    expect(stage.label).toBe("Saving optimisation result");
  });

  it("never states a stage the engine has not reached", () => {
    // A lever with no verdict and no label is never labelled from another one.
    const stage = resolveOptimiserRunningStage({ state: liveState(), running: true });
    expect(stage.key).toBe("baseline");
    expect(Object.values(OPTIMISER_STAGE_LABEL)).toContain(stage.label);
  });
});

describe("REAL JOB PROGRESS, AND NO FAKE PERCENTAGE", () => {
  it("states the job count the engine published for the search in flight", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({
        phase: "calibrating",
        phaseLabel: "Testing phase alignment",
        progressCurrent: 18,
        progressTotal: 28,
      }),
      run: run(42),
      runStatus: "running",
      nowMs: NOW,
    });

    expect(progress.stageLine).toBe("Testing phase alignment…");
    expect(progress.jobLine).toBe("18 of 28 evaluation jobs complete");
    expect(progress.progressLine).toBe("Testing phase alignment… 18 of 28 evaluation jobs complete");
  });

  it("states no job count at all when the engine has published none", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ phase: "testing_positions", progressTotal: 0 }),
      run: run(10),
      runStatus: "running",
      nowMs: NOW,
    });

    expect(progress.hasJobProgress).toBe(false);
    expect(progress.jobLine).toBeNull();
    expect(progress.progressLine).toBe("Testing subwoofer placement…");
  });

  it("never produces a percentage", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ phase: "calibrating", phaseLabel: "Testing gain", progressCurrent: 3, progressTotal: 33 }),
      run: run(12),
      runStatus: "running",
      nowMs: NOW,
    });

    const stated = [progress.progressLine, progress.jobLine, progress.stageLine, progress.elapsedText, progress.stallSentence]
      .filter(Boolean)
      .join(" ");
    expect(stated).not.toMatch(/%/);
    expect(Object.keys(progress)).not.toContain("percent");
    expect(JSON.stringify(progress)).not.toMatch(/%/);
  });
});

describe("ELAPSED TIME", () => {
  it("states the run's own elapsed time in words", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState(),
      run: run(42),
      runStatus: "running",
      nowMs: NOW,
    });
    expect(progress.elapsedSeconds).toBe(42);
    expect(progress.elapsedText).toBe("42 seconds");
  });

  it("states minutes once the run passes a minute", () => {
    expect(formatOptimiserElapsed(42)).toBe("42 seconds");
    expect(formatOptimiserElapsed(80)).toBe("1 minute 20 seconds");
    expect(formatOptimiserElapsed(120)).toBe("2 minutes");
    expect(formatOptimiserElapsed(1)).toBe("1 second");
  });

  it("stops measuring the moment the run is terminal", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ status: "complete" }),
      run: run(90),
      runStatus: "complete",
      nowMs: NOW,
    });
    expect(progress.running).toBe(false);
    expect(progress.terminal).toBe(true);
    expect(progress.elapsedSeconds).toBeNull();
    expect(progress.elapsedText).toBeNull();
  });

  it("stops the moment a failure is reported, even before the prop settles", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ status: "cancelled" }),
      run: run(90),
      runStatus: "running",
      nowMs: NOW,
    });
    expect(progress.terminal).toBe(true);
    expect(progress.liveStatus).toBe("cancelled");
  });
});

describe("STALL DETECTION READS THE LAST REPORT, NEVER THE ELAPSED TIME", () => {
  it("is NOT stalled while the engine keeps reporting, however long the run is", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ lastProgressAt: NOW - 1000 }),
      run: run(3600),
      runStatus: "running",
      nowMs: NOW,
    });
    expect(progress.elapsedSeconds).toBe(3600);
    expect(progress.stalled).toBe(false);
    expect(progress.stallSentence).toBeNull();
  });

  it("IS stalled only once the engine has stopped reporting, for the stated period", () => {
    const silent = (seconds) => buildOptimiserRunProgress({
      live: liveState({ lastProgressAt: NOW - seconds * 1000 }),
      run: run(seconds + 30),
      runStatus: "running",
      nowMs: NOW,
    });

    const justUnder = silent(Math.floor(OPTIMISER_STALL_AFTER_MS / 1000) - 1);
    expect(justUnder.stalled).toBe(false);

    const stalled = silent(OPTIMISER_STALL_AFTER_MS / 1000 + 12);
    expect(stalled.stalled).toBe(true);
    expect(stalled.stallSentence).toBe("ADI has not reported new progress for 2 minutes 12 seconds.");
  });

  it("counts silence from the run's own start when nothing was ever reported", () => {
    const progress = buildOptimiserRunProgress({
      live: null,
      run: { runId: "r", startedAt: new Date(NOW - (OPTIMISER_STALL_AFTER_MS + 5000)).toISOString() },
      runStatus: "running",
      nowMs: NOW,
    });
    expect(progress.stalled).toBe(true);
    expect(progress.stallSentence).toContain("ADI has not reported new progress for");
  });

  it("is never stalled once the run is terminal", () => {
    const progress = buildOptimiserRunProgress({
      live: liveState({ status: "complete", lastProgressAt: NOW - 600000 }),
      run: run(700),
      runStatus: "running",
      nowMs: NOW,
    });
    expect(progress.stalled).toBe(false);
  });
});

describe("CHECK STATUS REPORTS FACTS AND LAUNCHES NOTHING", () => {
  const live = liveState({
    phase: "calibrating",
    phaseLabel: "Testing delays",
    progressCurrent: 12,
    progressTotal: 30,
    lastProgressAt: NOW - 200000,
  });

  it("says the run is still active when nothing has advanced", () => {
    const result = describeOptimiserStatusCheck({
      live,
      run: run(300),
      previousLastProgressAt: live.lastProgressAt,
      nowMs: NOW,
    });
    expect(result.advanced).toBe(false);
    expect(result.sentence).toContain("Status checked:");
    expect(result.sentence).toContain("no new progress for 3 minutes 20 seconds");
    expect(result.sentence).not.toMatch(/start(ing)? a run|re-run|restart/i);
  });

  it("says so when new progress has arrived", () => {
    const result = describeOptimiserStatusCheck({
      live: { ...live, lastProgressAt: NOW - 2000 },
      run: run(300),
      previousLastProgressAt: NOW - 200000,
      nowMs: NOW,
    });
    expect(result.advanced).toBe(true);
    expect(result.sentence).toContain("ADI has reported new progress");
    expect(result.sentence).toContain("Testing timing");
  });

  it("reports a finished run as finished", () => {
    const result = describeOptimiserStatusCheck({
      live: { ...live, status: "complete" },
      run: run(300),
      previousLastProgressAt: live.lastProgressAt,
      nowMs: NOW,
    });
    expect(result.advanced).toBe(true);
    expect(result.sentence).toContain("the result is being settled");
  });
});

describe("THE CARD RENDERS IT, AND LEAVES NOTHING RUNNING BEHIND", () => {
  const journey = read(JOURNEY);
  const panel = read(RUNNING_PANEL);
  const hook = read(PROGRESS_HOOK);

  it("draws the progress panel only while the run is in flight, beside the disabled control", () => {
    expect(journey).toMatch(/\{isRunning && \(\s*<div className="space-y-2">/);
    expect(journey).toMatch(/data-adi-optimiser-button="running"/);
    expect(journey).toMatch(/\{ADI_OPTIMISER_RUNNING_LABEL\}/);
    expect(journey).toMatch(/<AdiJourneyRunningPanel[\s\S]*progress=\{runProgress\}/);
    expect(ADI_OPTIMISER_RUNNING_LABEL).toBe("OPTIMISING BASS…");
  });

  it("runs its clock only while the run is in flight", () => {
    expect(hook).toMatch(/if \(!running\) \{/);
    expect(hook).toMatch(/const interval = setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\);/);
    expect(hook).toMatch(/return \(\) => clearInterval\(interval\);/);
  });

  it("states the stage, the job count and the elapsed time, and no percentage", () => {
    expect(panel).toMatch(/data-adi-run-stage-line/);
    expect(panel).toMatch(/data-adi-run-jobs/);
    expect(panel).toMatch(/data-adi-run-elapsed/);
    expect(panel).not.toMatch(/%/);
    expect(panel).not.toMatch(/progressTotal\s*\//);
  });

  it("states the stall notice with a status check and the one cancel path", () => {
    expect(panel).toMatch(/data-adi-run-stalled/);
    expect(panel).toMatch(/OPTIMISER_STALL_TITLE/);
    expect(panel).toMatch(/data-adi-run-check/);
    expect(panel).toMatch(/data-adi-run-cancel/);
    expect(panel).toMatch(/canCancel && typeof onCancel === "function"/);
    expect(journey).toMatch(/canCancel=\{canCancelRun\}/);
    expect(journey).toMatch(/onCancel=\{onCancelRun\}/);
  });

  it("creates no cancel of its own and no second run", () => {
    expect(panel).not.toMatch(/requestCancel/);
    expect(panel).not.toMatch(/onRunOptimisationPlan|onReoptimiseCalibration/);
    expect(hook).not.toMatch(/requestCancel|beginOptimiserRun|runOptimisation/);
    // The ONE cancel path stays where it already lives.
    expect(read(WORKFLOW)).toMatch(/canCancelRun=\{canCancel\}/);
    expect(read(WORKFLOW)).toMatch(/onCancelRun=\{handleCancel\}/);
  });

  it("keeps every other control standing down while the run is in flight", () => {
    expect(journey).toMatch(/const showAction = !!journey\.action && journey\.canRun && !isRunning/);
    expect(journey).toMatch(/onRerun=\{isRunning \|\| optimiserRunOwnsRetry \? null : onRunOptimisationPlan\}/);
    expect(journey).toMatch(/onReoptimise=\{optimiserRunOwnsRetry \|\| isRunning \|\| retestOwnsPrimary/);
  });
});

describe("THE THREE-SUBWOOFER WORKLOAD, MEASURED", () => {
  // Two front sources and one rear source — the three-source layout the
  // grouped searches act on. Nothing here changes the layout or its search.
  const instances = [
    { id: "f1", enabled: true, model: "SUB3-12", position: { x: 1.6, y: 0.35 } },
    { id: "f2", enabled: true, model: "SUB3-12", position: { x: 3.2, y: 0.35 } },
    { id: "r1", enabled: true, model: "SUB3-12", position: { x: 2.4, y: 5.4 } },
  ];
  const progress = buildOptimiserRunProgress({
    live: liveState({ phase: "calibrating", phaseLabel: "Testing delays", progressCurrent: 45, progressTotal: 90 }),
    run: run(64),
    runStatus: "running",
    nowMs: NOW,
  });
  const workload = buildOptimiserRunWorkload({
    instances,
    roomDims: { widthM: 4.8, lengthM: 6.4, heightM: 2.7 },
    progress,
    stageElapsedSeconds: 21,
  });

  it("counts the design's own sources and search groups", () => {
    expect(workload.sourceCount).toBe(3);
    expect(workload.groups).toBeGreaterThan(0);
    expect(workload.groups).toBeLessThanOrEqual(3);
  });

  it("states the declared steps per stage from the engine's own search definitions", () => {
    const byKey = Object.fromEntries(workload.rows.map((row) => [row.key, row.steps]));
    const groups = workload.groups;
    expect(byKey.delay).toBe(30 * groups);
    expect(byKey.gain).toBe(11 * groups);
    // Phase and polarity are one grouped all-pass search: 36 steps + 2 options.
    expect(byKey.phase).toBe(38 * groups);
    expect(byKey.seating).toBe(11);
    // The stage-1 placement pool defines no budget for three sources, so the
    // report states no count for it rather than a zero.
    expect(STAGE1_CANDIDATE_BUDGETS[3]).toBeUndefined();
    expect(byKey.placement).toBeNull();
  });

  it("states a total that is the sum of what it reports", () => {
    const sum = workload.rows.reduce((total, row) => total + (row.steps || 0), 0);
    expect(workload.totalSteps).toBe(sum);
    expect(workload.totalSteps).toBeGreaterThan(sum - 1);
  });

  it("reports the live job count, the elapsed time and the observed stage time", () => {
    expect(workload.liveStageLabel).toBe("Testing timing");
    expect(workload.liveJobsCompleted).toBe(45);
    expect(workload.liveJobsTotal).toBe(90);
    expect(workload.elapsedText).toBe("1 minute 4 seconds");
    expect(workload.stageElapsedSeconds).toBe(21);
  });

  it("states the workload in Engineer details, never on the decision panel", () => {
    const sections = read("src/components/room/bass/optimiserPlan/AdiJourneyEngineerDetailsSections.jsx");
    const journey = read(JOURNEY);
    const detailsAt = journey.indexOf('data-adi-engineer-details="true"');
    expect(sections).toMatch(/<AdiJourneyRunWorkloadBlock workload=\{workload\} \/>/);
    expect(journey).toMatch(/workload: runWorkload,/);
    // The decision panel states the decision; the measurement stays below it.
    expect(journey.slice(0, detailsAt)).not.toMatch(/AdiJourneyRunWorkloadBlock/);
  });
});

describe("NOTHING IN THE OPTIMISER'S OWN LOGIC WAS TOUCHED", () => {
  it("keeps every new module free of engineering and optimiser logic", () => {
    const files = [
      "src/components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js",
      "src/components/room/bass/optimiserPlan/useOptimiserRunProgress.js",
      "src/components/room/bass/optimiserPlan/AdiJourneyRunningPanel.jsx",
      "src/components/room/bass/optimiserPlan/optimiserRunWorkload.js",
      "src/components/room/bass/optimiserPlan/AdiJourneyRunWorkloadBlock.jsx",
      "src/components/room/bass/optimiserPlan/adiJourneyTheme.js",
    ];
    const forbidden = /improveBassV2Engine|groupedDelaySearch|groupedGainSearch|groupedPhaseSearch|materialityGate|canonicalObjectiveSelection|subwooferGroupAuthority|best-layout|positionScreening|optimiseWorkflowOrchestrator/;
    files.forEach((file) => {
      expect(forbidden.test(read(file)), `${file} must not reach into the optimiser`).toBe(false);
    });
  });

  it("states no terminal outcome of its own — the presentation authority owns them", () => {
    const authority = read("src/components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js");
    expect(authority).not.toMatch(/NO_IMPROVEMENTS|IMPROVEMENTS_FOUND|PHYSICAL_CHANGE|UNABLE_TO_EVALUATE|RETEST_NEEDED/);
    expect(authority).not.toMatch(/P19|P20|materiality|ranking/);
  });
});