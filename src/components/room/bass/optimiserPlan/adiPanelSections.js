// adiPanelSections.js
// ---------------------------------------------------------------------------
// The Bass Optimisation panel's LAYOUT model — presentation only.
//
// The panel states four layers, in this order:
//
//   1. Result summary          — what ADI has already done
//   2. Safe calibration        — what ADI may apply on its own, and what it did
//   3. Design recommendation   — the physical change ADI recommends but has NOT
//                                applied, which only the designer may approve
//   4. Engineer details        — collapsed; every technical value behind the above
//
// It decides three presentational things and nothing else: the ONE primary
// action the panel offers, which section that action belongs to, and which of
// the tested levers are calibration as against design. It performs no
// calculation, reads no engine, invents no number and changes no decision: the
// apply authority, the optimiser and the RP22 results are untouched.
// ---------------------------------------------------------------------------

import { CALIBRATION_APPLY_DECISION } from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import {
  CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  CALIBRATION_TRADE_OFF_MESSAGE,
} from "./optimiserCalibrationEvidence.js";

export const ADI_PANEL_TITLE = "Bass Optimisation — Powered by ADI";

export const ADI_SECTION_TITLE = Object.freeze({
  CALIBRATION: "Safe calibration adjustments",
  DESIGN: "Design recommendation",
  TESTED: "What ADI tested",
});

export const ADI_SECTION_GROUP = Object.freeze({
  CALIBRATION: "Calibration",
  DESIGN: "Design",
});

/** The panel's one-line finding. Each states only what the evidence supports. */
export const ADI_PANEL_FINDING = Object.freeze({
  RUNNING: "ADI is evaluating this design…",
  CALIBRATION_APPLIED: "ADI applied safe calibration settings.",
  /**
   * A design change was found, so the finding leads with what the designer has
   * to do. The calibration section states the tested levers and their outcome in
   * its own words, so the no-improvement sentence is never repeated here.
   */
  TESTED_NO_CALIBRATION: "ADI tested calibration changes. The best improvement requires a physical design change.",
  TESTED_NO_IMPROVEMENT: "ADI tested calibration and design options. No useful improvement was found.",
  /**
   * The run or the saved record kept no calibration evidence to read, so neither
   * of the two claims above may be made. The mandated sentence asks for the
   * re-run that produces the evidence.
   */
  EVIDENCE_MISSING: CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  NOT_TESTED: "ADI has not evaluated this design yet.",
});

/** Section 1 copy — concise, and never claiming a test that did not run. */
export const ADI_CALIBRATION_TESTED_SENTENCE = "ADI tested delay, gain and polarity.";
export const ADI_NO_CALIBRATION_IMPROVEMENT = "No useful calibration-only improvement was found.";
/**
 * The sentence the main panel states when the calibration result ADI's own
 * decision named was NOT applied and makes P20 worse. The candidate itself, its
 * before → after values and its settings belong to Engineer details.
 */
export const ADI_NO_SAFE_CALIBRATION_IMPROVEMENT = "No safe calibration improvement was found.";
export const ADI_CALIBRATION_NOT_TESTED_SENTENCE = "Calibration has not been tested on this design yet.";

/** Section 2 copy — the design change is never presented as applied. */
export const ADI_DESIGN_NOT_APPLIED =
  "This requires a physical design change, so ADI has not applied it.";
export const ADI_NO_DESIGN_CHANGE_APPLIED = "No physical design change was applied.";

/** Section 3 copy — what is stated when nothing has been tested yet. */
export const ADI_TESTED_NOTHING = "Nothing has been tested on this design yet.";

/** Section 2's two labels — what ADI found, and the result it predicts for it. */
export const ADI_BEST_IMPROVEMENT_LABEL = "Best improvement found";
export const ADI_PREDICTED_RESULT_LABEL = "Predicted result";

/** Which kind of change a tested lever is. Calibration may be auto-applied. */
export const CALIBRATION_LEVER_KEYS = Object.freeze(["delay", "gain", "phase", "polarity"]);

export const ADI_PRIMARY_ACTION = Object.freeze({
  DESIGN: "design",
  CALIBRATION: "calibration",
  RUN: "run",
  NONE: "none",
});

export const ADI_CALIBRATION_KIND = Object.freeze({
  APPLIED: "applied",
  HELD: "held",
  PERSISTED: "persisted",
  TESTED: "tested",
  /** The run kept no calibration evidence, so nothing may be claimed. */
  EVIDENCE_MISSING: "evidence_missing",
  /** The best calibration candidate was a trade-off — stated, never applied. */
  TRADE_OFF_HELD: "trade_off_held",
  NOT_TESTED: "not_tested",
});

/**
 * ONE line at the top of the panel: what ADI has already done. A run that has
 * not happened is never stated as one that found nothing.
 */
export function resolveAdiPanelFinding({
  isRunning = false,
  calibrationApplied = false,
  designRecommended = false,
  evaluated = false,
  calibrationEvidenceRetained = true,
} = {}) {
  if (isRunning) return ADI_PANEL_FINDING.RUNNING;
  if (calibrationApplied) return ADI_PANEL_FINDING.CALIBRATION_APPLIED;
  // The two findings below both state that calibration was tested and found not
  // useful. Neither may be stated without the evidence that proves it.
  if (evaluated && calibrationEvidenceRetained === false) return ADI_PANEL_FINDING.EVIDENCE_MISSING;
  if (designRecommended) return ADI_PANEL_FINDING.TESTED_NO_CALIBRATION;
  if (evaluated) return ADI_PANEL_FINDING.TESTED_NO_IMPROVEMENT;
  return ADI_PANEL_FINDING.NOT_TESTED;
}

/**
 * Which layer owns the panel's ONE primary action.
 *
 *   stale design                  → the bass result must be brought up to date
 *   a design change can be applied → the physical change (never auto-applied)
 *   nothing tested yet            → run the optimiser
 *   calibration can be re-tested  → re-test calibration
 *   anything else runnable        → run the optimiser
 *
 * Every other available action stays visible as a secondary control, so two
 * primary buttons can never compete for attention.
 */
export function resolveAdiPrimaryAction({
  isRunning = false,
  stale = false,
  designApplicable = false,
  nothingTested = false,
  calibrationOffered = false,
  runOffered = false,
} = {}) {
  if (isRunning) return ADI_PRIMARY_ACTION.NONE;
  if (stale) return ADI_PRIMARY_ACTION.RUN;
  if (designApplicable) return ADI_PRIMARY_ACTION.DESIGN;
  if (nothingTested && runOffered) return ADI_PRIMARY_ACTION.RUN;
  if (calibrationOffered) return ADI_PRIMARY_ACTION.CALIBRATION;
  if (runOffered) return ADI_PRIMARY_ACTION.RUN;
  return ADI_PRIMARY_ACTION.NONE;
}

/**
 * What Section 1 has to state. It reads the calibration decision's own record
 * and the persisted applied calibration — it decides nothing and applies nothing.
 */
export function resolveCalibrationSectionKind({
  decision = null,
  hasPersistedValues = false,
  evaluated = false,
  evidenceRetained = true,
  tradeOffHeld = false,
} = {}) {
  if (decision === CALIBRATION_APPLY_DECISION.APPLIED) return ADI_CALIBRATION_KIND.APPLIED;
  if (decision === CALIBRATION_APPLY_DECISION.HOLD) return ADI_CALIBRATION_KIND.HELD;
  if (hasPersistedValues) return ADI_CALIBRATION_KIND.PERSISTED;
  if (!evaluated) return ADI_CALIBRATION_KIND.NOT_TESTED;
  // "Tested — no useful calibration-only improvement" requires the retained
  // evidence that proves it. Without it the section states that plainly; with a
  // trade-off it states the trade-off instead of a no-improvement conclusion.
  if (evidenceRetained === false) return ADI_CALIBRATION_KIND.EVIDENCE_MISSING;
  if (tradeOffHeld) return ADI_CALIBRATION_KIND.TRADE_OFF_HELD;
  return ADI_CALIBRATION_KIND.TESTED;
}

/**
 * Section 3 in two compact groups: the calibration levers ADI may apply, and the
 * design levers it may only recommend. The levers keep the fixed least-intrusive
 * order the summary already produced; nothing is reordered or omitted.
 */
export function buildAdiTestedGroups(rows = []) {
  const calibration = [];
  const design = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row) return;
    const entry = {
      key: row.key,
      label: row.label,
      status: row.status,
      // Only an advice row carries a note in the compact view — the per-lever
      // outcome text belongs to the detailed evidence, not to this list.
      note: row.advice ? (row.outcome || null) : null,
    };
    (CALIBRATION_LEVER_KEYS.includes(row.key) ? calibration : design).push(entry);
  });
  return { calibration, design };
}