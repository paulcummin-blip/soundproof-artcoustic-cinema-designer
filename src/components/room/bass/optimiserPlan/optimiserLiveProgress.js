// optimiserLiveProgress.js
// ---------------------------------------------------------------------------
// The nine "What ADI tested" rows WHILE a run is in progress.
//
// Product rule this exists to satisfy: the card must prove ADI is working
// through the full engineering sequence. Every family is either Waiting,
// Testing, Tested, or — for the two capabilities the engine genuinely cannot
// evaluate (crossover-region phase, subwoofer model/quantity) — Not yet
// supported. No family is ever shown as "Not tested" here.
//
// The evidence is the engine's OWN live progress, published by
// improveBassV2Store while it runs:
//   • phase / phaseLabel  — which search is running right now
//   • stageVerdicts       — which searches have finished (and how)
// A family's state is read from its own stage, never inferred from another
// family's outcome.
//
// PURE: no React, no stores, no calculation. It changes no bass maths, no
// optimiser scoring and no RP22 grading.
// ---------------------------------------------------------------------------

import { LEVER_PRESENTATION, OPTIMISER_FAMILY_SEQUENCE } from "./optimiserLeverOrder.js";
import { ADI_ROW_OUTCOME } from "./optimiserFamilyLedgerRows.js";

/** What a family can be while a run is in progress. */
export const ADI_LIVE_STATUS = Object.freeze({
  WAITING: "Waiting",
  TESTING: "Testing",
  TESTED: "Tested",
  NOT_YET_SUPPORTED: "Not yet supported",
  NOT_YET_SUPPORTED_IN_RUN: "Not yet supported in this run",
});

/**
 * Stated for crossover-region phase alignment. The engine's phase search is
 * subwoofer-only, so the speaker/sub crossover region is not modelled.
 */
export const PHASE_NOT_SUPPORTED_OUTCOME =
  "Crossover-region phase between the main speakers and subwoofers is not currently modelled.";

/** Stated for the subwoofer model / quantity family. */
export const SUB_OPTION_NOT_SUPPORTED_OUTCOME = "Compare subwoofer models separately.";

/** The absorption row is advice, and is only resolved after the run. */
export const ABSORPTION_ROW_KEY = "absorption";
export const ABSORPTION_ROW_LABEL = "Low-frequency absorption";

/** Engine phase + verdict tokens the live mapping reads. */
const CALIBRATING_PHASE = "calibrating";
const PRE_CALIBRATION_PHASES = Object.freeze(["idle", "reviewing", "awaiting_stage2"]);
const PAST_PLACEMENT_PHASES = Object.freeze(["finalising", "combining", "combined_confirming"]);
const SKIPPED = "skipped";

const DELAY_LABEL = /delay/i;
const GAIN_LABEL = /gain/i;
const PHASE_LABEL = /phase|polarity|all-pass/i;
const SEATING_LABEL = /seating/i;

/** A verdict that means the engine searched this family. */
function verdictOf(stageVerdicts, key) {
  const verdict = stageVerdicts?.[key];
  return typeof verdict === "string" && verdict ? verdict : null;
}

/** The first row of the fixed order, ready to render. */
function row(key, status, outcome = null) {
  return {
    key,
    label: LEVER_PRESENTATION[key]?.label || key,
    status,
    outcome,
    action: null,
  };
}

/**
 * Build the nine live rows, in the fixed least-intrusive order: delay, gain,
 * phase, polarity, placement, layout, sub option, seating, absorption.
 *
 * @param {object} live - improveBassV2 store state plus { running }
 * @returns {Array<{key,label,status,outcome,action}>}
 */
export function buildLiveFamilyRows(live = {}) {
  const status = live?.status || "idle";
  const phase = String(live?.phase || "idle");
  const phaseLabel = String(live?.phaseLabel || "");
  const stageVerdicts = live?.stageVerdicts || {};
  const complete = status === "complete";

  const calibrating = phase === CALIBRATING_PHASE;
  // The calibration block (phase/polarity, delay, gain) is one engine phase, so
  // completion is read from its own verdicts and from having moved past it.
  const pastCalibration = complete
    || (!calibrating && !PRE_CALIBRATION_PHASES.includes(phase));
  const pastPlacement = complete || PAST_PLACEMENT_PHASES.includes(phase);
  const seatingRunning = /finalising|combining/.test(phase) && SEATING_LABEL.test(phaseLabel);

  /** A calibration family: its own verdict, its own live label. */
  const calibrationStatus = (verdictKey, labelPattern) => {
    const verdict = verdictOf(stageVerdicts, verdictKey);
    if (verdict && verdict !== SKIPPED) return ADI_LIVE_STATUS.TESTED;
    if (calibrating && labelPattern.test(phaseLabel)) return ADI_LIVE_STATUS.TESTING;
    if (pastCalibration) return verdict === SKIPPED ? ADI_LIVE_STATUS.WAITING : ADI_LIVE_STATUS.TESTED;
    return ADI_LIVE_STATUS.WAITING;
  };

  const testingOutcome = (pattern) => (
    pattern.test(phaseLabel) ? phaseLabel.trim() : null
  );

  const delayStatus = calibrationStatus("delays", DELAY_LABEL);
  const gainStatus = calibrationStatus("gain", GAIN_LABEL);
  // Phase and polarity share one grouped all-pass search in the engine.
  const polarityStatus = calibrationStatus("phase_polarity", PHASE_LABEL);

  const placementVerdict = verdictOf(stageVerdicts, "sub_positions");
  const placementRunning = /testing_positions|screening_|confirming_/.test(phase);
  const placementStatus = placementVerdict && placementVerdict !== SKIPPED
    ? ADI_LIVE_STATUS.TESTED
    : placementRunning
      ? ADI_LIVE_STATUS.TESTING
      : pastPlacement
        ? ADI_LIVE_STATUS.TESTED
        : ADI_LIVE_STATUS.WAITING;

  const seatingVerdict = verdictOf(stageVerdicts, "seating_positions");
  const seatingStatus = seatingVerdict === "improvement" || seatingVerdict === "no_improvement"
    ? ADI_LIVE_STATUS.TESTED
    : seatingRunning
      ? ADI_LIVE_STATUS.TESTING
      : ADI_LIVE_STATUS.WAITING;

  const rows = [
    row("delay", delayStatus, delayStatus === ADI_LIVE_STATUS.TESTING
      ? testingOutcome(DELAY_LABEL) : null),
    row("gain", gainStatus, gainStatus === ADI_LIVE_STATUS.TESTING
      ? testingOutcome(GAIN_LABEL) : null),
    // The crossover region itself is not modelled, at any point in the run.
    row("phase", ADI_LIVE_STATUS.NOT_YET_SUPPORTED, PHASE_NOT_SUPPORTED_OUTCOME),
    row("polarity", polarityStatus, null),
    row("placement", placementStatus, null),
    // An alternative layout is searched inside the placement pool, so it moves
    // with placement rather than having a search of its own.
    row("layout", placementStatus, null),
    row("subwoofer_option", ADI_LIVE_STATUS.NOT_YET_SUPPORTED_IN_RUN, SUB_OPTION_NOT_SUPPORTED_OUTCOME),
    row("seating", seatingStatus, seatingVerdict === SKIPPED && !seatingRunning
      ? ADI_ROW_OUTCOME.SEATING_LAST_RESORT : null),
    // Advice only, and only once the practical options have been evaluated.
    row(ABSORPTION_ROW_KEY, ADI_LIVE_STATUS.WAITING, null),
  ];

  // The fixed order is the authority: nothing this function returns may reorder
  // the eight reported families.
  const order = OPTIMISER_FAMILY_SEQUENCE;
  const ordered = order
    .map((key) => rows.find((entry) => entry.key === key))
    .filter(Boolean);
  return [...ordered, rows[rows.length - 1]];
}

/** The nine row keys this module states, in the fixed order. */
export const ADI_LIVE_ROW_KEYS = Object.freeze([
  ...OPTIMISER_FAMILY_SEQUENCE,
  ABSORPTION_ROW_KEY,
]);