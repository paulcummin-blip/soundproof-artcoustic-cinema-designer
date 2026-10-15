// optimiserRunWorkload.js
// ---------------------------------------------------------------------------
// THE WORKLOAD BEHIND A BASS OPTIMISATION RUN — measurement only.
//
// This module reports, per stage, how much work the optimiser's own declared
// search space defines for THIS design, plus whatever the engine itself has
// published live for the search in flight:
//
//   declared steps per stage   from optimiserCalculationEstimate, which reads
//                              the engine's real search definitions (delay 30
//                              steps per group, gain 11, phase 36, polarity 2,
//                              seating 11 offsets, stage-1 placement budget)
//   live jobs                  progressCurrent / progressTotal, published by
//                              the engine for the search actually running
//   elapsed per stage          observed while the run was on screen
//   confirmed candidates       canonically confirmed by the engine
//
// It measures. It never reduces the search, never re-ranks a candidate, never
// scores anything and never changes a single optimiser rule.
//
// PURE: no React, no store writes, no optimiser maths.
// ---------------------------------------------------------------------------

import { estimateOptimiserCalculations } from "./optimiserCalculationEstimate.js";

/**
 * The stage rows the workload is reported in. The engine's phase and polarity
 * searches are one grouped all-pass search, and an alternative layout is
 * searched inside the placement pool, so the report states them that way.
 */
export const OPTIMISER_WORKLOAD_ROWS = Object.freeze([
  Object.freeze({ key: "delay", label: "Delay (timing)" }),
  Object.freeze({ key: "phase", label: "Phase & polarity" }),
  Object.freeze({ key: "gain", label: "Gain (level balance)" }),
  Object.freeze({ key: "placement", label: "Placement & layout" }),
  Object.freeze({ key: "seating", label: "Seating" }),
]);

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

/**
 * The workload report for one design.
 *
 * @param {object} params
 * @param {Array} [params.instances] - the design's subwoofer instances
 * @param {object|null} [params.roomDims]
 * @param {object|null} [params.progress] - the run progress already resolved by
 *   optimiserRunProgressAuthority (one clock, not two)
 * @param {number|null} [params.stageElapsedSeconds] - observed time in this stage
 */
export function buildOptimiserRunWorkload({
  instances = [],
  roomDims = null,
  progress = null,
  stageElapsedSeconds = null,
} = {}) {
  const estimate = estimateOptimiserCalculations({ instances, roomDims });
  const byFamily = {};
  (estimate.families || []).forEach((family) => {
    byFamily[family.key] = family.count;
  });

  const rows = OPTIMISER_WORKLOAD_ROWS.map((row) => {
    // Phase and polarity are one grouped search, so their declared steps are
    // reported together; a family the search space does not define for this
    // design states no count rather than a zero.
    const steps = row.key === "phase"
      ? numberOrNull((numberOrNull(byFamily.phase) || 0) + (numberOrNull(byFamily.polarity) || 0))
      : numberOrNull(byFamily[row.key]);
    return { key: row.key, label: row.label, steps };
  });

  return {
    available: estimate.available === true,
    reason: estimate.reason || null,
    sourceCount: estimate.sourceCount,
    groups: estimate.groups,
    rows,
    totalSteps: numberOrNull(estimate.total),
    // What the engine itself has published for the search in flight.
    liveStageKey: progress?.stageKey || null,
    liveStageLabel: progress?.stageLabel || null,
    liveJobsCompleted: progress?.hasJobProgress ? progress.jobsCompleted : null,
    liveJobsTotal: progress?.hasJobProgress ? progress.jobsTotal : null,
    elapsedSeconds: progress?.elapsedSeconds ?? null,
    elapsedText: progress?.elapsedText || null,
    stageElapsedSeconds: numberOrNull(stageElapsedSeconds),
    confirmedCandidates: progress?.confirmedCandidates || 0,
    basisNote: estimate.basisNote,
    scopeNote: estimate.scopeNote,
  };
}