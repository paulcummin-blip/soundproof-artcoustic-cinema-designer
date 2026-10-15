// tmp-run-workload-measure.test.mjs — temporary measurement, deleted after reading.
import { it } from "vitest";
import { buildOptimiserRunProgress } from "../components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js";
import { buildOptimiserRunWorkload } from "../components/room/bass/optimiserPlan/optimiserRunWorkload.js";

it("measures the three-subwoofer workload", () => {
  const instances = [
    { id: "f1", enabled: true, model: "SUB3-12", position: { x: 1.6, y: 0.35 } },
    { id: "f2", enabled: true, model: "SUB3-12", position: { x: 3.2, y: 0.35 } },
    { id: "r1", enabled: true, model: "SUB3-12", position: { x: 2.4, y: 5.4 } },
  ];
  const progress = buildOptimiserRunProgress({
    live: {
      status: "running",
      phase: "calibrating",
      phaseLabel: "Testing delays",
      progressCurrent: 45,
      progressTotal: 90,
      lastProgressAt: Date.now() - 2000,
      startedAtMs: Date.now() - 64000,
      stageVerdicts: { phase_polarity: "skipped", gain: "skipped" },
      confirmedChallengers: [1, 2, 3],
    },
    run: { runId: "optimiser-run-x", startedAt: new Date(Date.now() - 64000).toISOString() },
    runStatus: "running",
    nowMs: Date.now(),
  });
  const workload = buildOptimiserRunWorkload({
    instances,
    roomDims: { widthM: 4.8, lengthM: 6.4, heightM: 2.7 },
    progress,
    stageElapsedSeconds: 21,
  });
  // eslint-disable-next-line no-console
  console.log("MEASURED_WORKLOAD=" + JSON.stringify({
    sourceCount: workload.sourceCount,
    groups: workload.groups,
    rows: workload.rows,
    totalSteps: workload.totalSteps,
    live: {
      stage: workload.liveStageLabel,
      completed: workload.liveJobsCompleted,
      total: workload.liveJobsTotal,
    },
    elapsedText: workload.elapsedText,
    stageElapsedSeconds: workload.stageElapsedSeconds,
    confirmedCandidates: workload.confirmedCandidates,
    available: workload.available,
    reason: workload.reason,
  }));
});