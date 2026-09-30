// optimiserCalculationEstimate.js
// ---------------------------------------------------------------------------
// How many design calculations ADI will run for this design — estimated BEFORE
// the run, from the optimiser's own declared search space.
//
// Every number here is read from the engine's real search definition, not
// invented, and nothing is hardcoded as "hundreds" or "thousands":
//
//   delay     30 steps per group      groupedDelaySearch.js (1…30 ms, 1 ms)
//   gain      11 steps per group      groupedGainSearch.js (-10…0 dB, 1 dB)
//   phase     36 steps per group      subwooferPhaseControl.js (0…175°, 5°)
//   polarity   2 options per group    polarity inversion test
//   placement stage-1 candidate budget stage1Constants.js (per quantity)
//   seating   11 offset positions     seatingPositionSearch.js (-500…+500 mm)
//
// Groups follow the engine's own grouping rule: four sources = front pair +
// rear pair; two sources = one group each; one source = no inter-sub electronic
// search (placement options remain).
//
// This is an ESTIMATE, and it says so. It is deliberately conservative: it
// counts the candidate options the searches generate, and states that finalists
// are then confirmed canonically. It never sums overlapping stage counters.
//
// READ-ONLY: no optimiser maths, scoring, grading or apply logic is touched.
// ---------------------------------------------------------------------------

import { STAGE1_CANDIDATE_BUDGETS } from "../stage1/stage1Constants.js";
import {
  PHASE_CONTROL_MAX_DEG,
  PHASE_CONTROL_STEP_DEG,
} from "../../../../bass/core/subwooferPhaseControl.js";

/** The declared step counts the searches generate, with their source. */
export const OPTIMISER_SEARCH_STEPS = Object.freeze({
  delayStepsPerGroup: 30,
  gainStepsPerGroup: 11,
  phaseStepsPerGroup: Math.floor(PHASE_CONTROL_MAX_DEG / PHASE_CONTROL_STEP_DEG) + 1,
  polarityOptionsPerGroup: 2,
  seatingOffsetPositions: 11,
});

/** Stated with the estimate so it is never read as a measured count. */
export const ESTIMATE_BASIS_NOTE =
  "Estimated from the optimiser's declared search space for this design. It counts the candidate "
  + "options the searches generate; the finalists are then confirmed canonically.";

/** Stated so no family is silently missing from the estimate. */
export const ESTIMATE_SCOPE_NOTE =
  "Alternative layouts are searched inside the placement pool. Alternative subwoofer models and "
  + "quantities are a design decision, not a searched option.";

export const ESTIMATE_UNAVAILABLE_REASON =
  "The search space depends on the subwoofer quantity, which this design has not fixed in a form "
  + "the optimiser can search.";

const FAMILY_LABEL = Object.freeze({
  delay: "Delay",
  gain: "Gain",
  phase: "Phase / crossover-region alignment",
  polarity: "Polarity",
  placement: "Placement",
  seating: "Seating",
});

const num = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** Active subwoofer sources, exactly as the searches count them. */
export function countActiveSources(instances = []) {
  return (Array.isArray(instances) ? instances : []).filter((item) => item?.enabled !== false).length;
}

/**
 * How many independent source groups the electronic searches run against.
 * Returns null when the quantity is one the grouped searches cannot split.
 */
export function resolveSearchGroupCount(sourceCount) {
  if (sourceCount === 4) return 2;
  if (sourceCount === 2) return 2;
  if (sourceCount === 1) return 0;
  return null;
}

/** The stage-1 placement candidate budget for a quantity, or null. */
function placementBudget(sourceCount) {
  const budget = STAGE1_CANDIDATE_BUDGETS?.[sourceCount]?.normal;
  const value = num(budget);
  return value != null && value > 0 ? value : null;
}

/**
 * Estimate the number of design calculations the optimiser will run.
 *
 * @param {object} params
 * @param {Array} [params.instances] - the design's subwoofer instances
 * @returns {{
 *   available: boolean, total: number|null, sourceCount: number, groups: number|null,
 *   families: Array<{key: string, label: string, count: number}>,
 *   basisNote: string, scopeNote: string, reason: string|null
 * }}
 */
export function estimateOptimiserCalculations({ instances = [] } = {}) {
  const sourceCount = countActiveSources(instances);
  const groups = resolveSearchGroupCount(sourceCount);
  const placement = placementBudget(sourceCount);

  const unavailable = {
    available: false,
    total: null,
    sourceCount,
    groups,
    families: [],
    basisNote: ESTIMATE_BASIS_NOTE,
    scopeNote: ESTIMATE_SCOPE_NOTE,
    reason: ESTIMATE_UNAVAILABLE_REASON,
  };

  if (groups == null || placement == null) return unavailable;

  const steps = OPTIMISER_SEARCH_STEPS;
  const counts = [
    ["delay", steps.delayStepsPerGroup * groups],
    ["gain", steps.gainStepsPerGroup * groups],
    ["phase", steps.phaseStepsPerGroup * groups],
    ["polarity", steps.polarityOptionsPerGroup * groups],
    ["placement", placement],
    ["seating", steps.seatingOffsetPositions],
  ];

  const families = counts
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, label: FAMILY_LABEL[key], count }));

  const total = families.reduce((sum, family) => sum + family.count, 0);
  if (!(total > 0)) return unavailable;

  return {
    available: true,
    total,
    sourceCount,
    groups,
    families,
    basisNote: ESTIMATE_BASIS_NOTE,
    scopeNote: ESTIMATE_SCOPE_NOTE,
    reason: null,
  };
}

/** "1,240" — thousands-separated, no decimals. */
export function formatCalculationCount(value) {
  const numeric = num(value);
  return numeric == null ? null : Math.round(numeric).toLocaleString("en-GB");
}

/**
 * The sentence the pre-run card shows. Never claims more than the estimate
 * supports: below one hundred calculations it is stated as a detailed set.
 */
export function estimateSentence(estimate) {
  if (!estimate?.available || !(estimate.total > 0)) {
    return "ADI will run a detailed optimisation sequence for this room.";
  }
  if (estimate.total < 100) {
    return "ADI will run a detailed set of design calculations for this room.";
  }
  return `ADI will run approximately ${formatCalculationCount(estimate.total)} design calculations for this room.`;
}