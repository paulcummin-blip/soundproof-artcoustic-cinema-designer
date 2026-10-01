// optimiserLiveProgress.js
// ---------------------------------------------------------------------------
// The "What ADI tested" rows WHILE a run is in progress.
//
// Product rule this exists to satisfy: the card must prove ADI is working
// through the full engineering sequence. Every family shown is Waiting, Testing
// or Tested. Only the families ADI genuinely evaluates appear here at all (see
// optimiserLiveFamilies.js): a capability that is not live yet is stated once as
// a future capability in the collapsed Engineer details, never as a row of its
// own here and never as "Not yet supported" in the tested table.
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
import { liveFamilyKeys } from "./optimiserLiveFamilies.js";

/** What a family can be while a run is in progress. */
export const ADI_LIVE_STATUS = Object.freeze({
  WAITING: "Waiting",
  TESTING: "Testing",
  TESTED: "Tested",
  NOT_YET_SUPPORTED: "Not yet supported",
  NOT_YET_SUPPORTED_IN_RUN: "Not yet supported in this run",
});

// Crossover-region phase and subwoofer model / quantity are NOT rows here: the
// optimiser does not evaluate them, so they are stated once as future
// capabilities in the collapsed Engineer details (optimiserLiveFamilies.js).

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

/**
 * One row of the fixed order, ready to render. The absorption advice row carries
 * no lever entry, so its own label is passed in — the row keeps the same name
 * before and after a run.
 */
function row(key, status, outcome = null, label = null) {
  return {
    key,
    label: label || LEVER_PRESENTATION[key]?.label || key,
    status,
    outcome,
    action: null,
  };
}

/**
 * Build the live rows, in the fixed least-intrusive order, restricted to the
 * families ADI evaluates: delay, gain, polarity, placement, layout, seating —
 * then the absorption advice row. A capability that is not live is not a row.
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
    row("polarity", polarityStatus, null),
    row("placement", placementStatus, null),
    // An alternative layout is searched inside the placement pool, so it moves
    // with placement rather than having a search of its own.
    row("layout", placementStatus, null),
    row("seating", seatingStatus, seatingVerdict === SKIPPED && !seatingRunning
      ? ADI_ROW_OUTCOME.SEATING_LAST_RESORT : null),
    // Advice only, and only once the practical options have been evaluated.
    row(ABSORPTION_ROW_KEY, ADI_LIVE_STATUS.WAITING, null, ABSORPTION_ROW_LABEL),
  ];

  // The fixed order is the authority: nothing this function returns may reorder
  // the families, and only the live ones are stated at all.
  const order = liveFamilyKeys(OPTIMISER_FAMILY_SEQUENCE);
  const ordered = order
    .map((key) => rows.find((entry) => entry.key === key))
    .filter(Boolean);
  return [...ordered, rows[rows.length - 1]];
}

/** The row keys this module states, in the fixed order. */
export const ADI_LIVE_ROW_KEYS = Object.freeze([
  ...liveFamilyKeys(OPTIMISER_FAMILY_SEQUENCE),
  ABSORPTION_ROW_KEY,
]);