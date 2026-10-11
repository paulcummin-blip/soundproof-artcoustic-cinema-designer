// bestCalibrationResult.js
// ---------------------------------------------------------------------------
// WHICH calibration result ADI's own decision selected, stated in one headline.
//
// Product rule this exists to satisfy: the panel must say whether the result it
// applied (or held) came from ONE isolated lever — delay only, gain only — or
// from a COMBINED calibration result that retuned several levers together. The
// isolated per-lever evidence alone leaves the designer comparing delay-only
// against gain-only and never seeing that a combined result was evaluated.
//
// Everything stated here is read from two records the run itself produced:
//
//   • the calibration decision — what ADI did, the settings it changed, the
//     canonical P19/P20 before → after, and why each other result was held
//   • the combined calibration evidence — the combined result's own candidate
//     id and which levers it retuned
//
// It evaluates no acoustic result, scores nothing, changes no threshold, and
// never invents a lever the decision's own settings do not show. When the two
// records do not say which levers a result retuned, no composition is claimed.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  formatLevelValue,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { combinedCalibrationEvidence } from "./optimiserCalibrationEvidence.js";

/** The headline the Safe calibration adjustments section leads with. */
export const BEST_CALIBRATION_RESULT_HEADLINE = "Best calibration result";
export const BEST_CALIBRATION_RESULT_PREFIX = `${BEST_CALIBRATION_RESULT_HEADLINE}: `;

/** What happened to the result the headline names. */
export const CALIBRATION_RESULT_STATE = Object.freeze({
  APPLIED: "Applied",
  HELD: "Held for your approval",
  REVIEW: "Review required",
});

/** The label used when the combined result is known to be the selected one. */
export const COMBINED_CALIBRATION_RESULT_LABEL = "Combined calibration";

/** The order the calibration levers are named in. */
const PART_ORDER = Object.freeze(["phase", "delay", "gain", "polarity"]);

const PART_WORD = Object.freeze({
  phase: "phase", delay: "delay", gain: "gain", polarity: "polarity",
});

/** The settings the decision records, in the order the panel names them. */
const SETTING_ORDER = Object.freeze(["All-pass phase", "Delay", "Gain trim", "Polarity"]);

function cap(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Which calibration lever one of the decision's setting rows belongs to. */
function partOfSettingRow(row) {
  const key = String(row?.key || "");
  const prefix = key.includes(":") ? key.slice(0, key.indexOf(":")) : key;
  if (PART_WORD[prefix]) return prefix;
  const setting = String(row?.setting || "");
  if (setting === "Delay") return "delay";
  if (setting === "Gain trim") return "gain";
  if (setting === "Polarity") return "polarity";
  if (/phase/i.test(setting)) return "phase";
  return null;
}

/**
 * The composition of a combined record, from the levers IT records as retuned.
 * A flag the run did not record stays unclaimed.
 */
function partsFromCombined(record) {
  const best = record?.bestCandidate || null;
  if (!best) return [];
  const from = [
    best.phaseRetuned === true ? "phase" : null,
    best.delayRetuned === true ? "delay" : null,
    best.gainRetuned === true ? "gain" : null,
  ].filter(Boolean);
  return from;
}

/** "Delay only" · "Delay + gain" · "Phase + delay + gain". */
export function formatCalibrationComposition(parts = []) {
  const ordered = PART_ORDER.filter((part) => parts.includes(part));
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return `${cap(ordered[0])} only`;
  return `${cap(ordered[0])}${ordered.slice(1).map((part) => ` + ${part}`).join("")}`;
}

/** "delay adjustment" · "combined delay and gain adjustment". */
function adjustmentPhrase(parts = []) {
  const ordered = PART_ORDER.filter((part) => parts.includes(part));
  if (ordered.length === 0) return null;
  const words = ordered.map((part) => PART_WORD[part]);
  if (words.length === 1) return `${words[0]} adjustment`;
  if (words.length === 2) return `combined ${words[0]} and ${words[1]} adjustment`;
  return `combined ${words.slice(0, -1).join(", ")} and ${words[words.length - 1]} adjustment`;
}

/**
 * "L1 / 27.4 dB" — the SAME presentation the applied-calibration block below
 * prints, so the headline and the settings it changed can never disagree. A
 * value the decision did not carry is never printed as a number.
 */
function valueText(level, deviationDb) {
  return formatLevelValue(level, deviationDb);
}

function hasValue(pair) {
  return num(pair?.deviationDb) != null || pair?.level != null;
}

function pairText(label, before, after) {
  if (!hasValue(before) && !hasValue(after)) return null;
  return `${label} ${valueText(before?.level, before?.deviationDb)} → ${valueText(after?.level, after?.deviationDb)}`;
}

/**
 * "P19 L4 / ±1 dB → L4 / ±1 dB · P20 L1 / ±27 dB → L1 / ±11 dB" — the canonical
 * before → after pair of one calibration result, in whole numbers.
 */
export function calibrationValuePairText(before, after) {
  return [
    pairText("P19", before?.p19, after?.p19),
    pairText("P20", before?.p20, after?.p20),
  ].filter(Boolean).join(" · ");
}

/**
 * The best calibration result the run's own decision names, and how the panel
 * states it. Null when the decision recorded no applied or held result — the
 * section then states its own outcome and this headline is not shown.
 *
 * @param {object} params
 * @param {object|null} params.decision - the run's calibration decision
 * @param {object|null} [params.evidence] - the saved calibration evidence
 * @returns {object|null}
 */
export function resolveBestCalibrationResult({ decision = null, evidence = null } = {}) {
  if (!decision || typeof decision !== "object") return null;
  const applied = decision.decision === CALIBRATION_APPLY_DECISION.APPLIED;
  const held = decision.decision === CALIBRATION_APPLY_DECISION.HOLD;
  if (!applied && !held) return null;

  const settingsRows = Array.isArray(decision.settings) ? decision.settings : [];
  const combined = combinedCalibrationEvidence(evidence);
  const combinedCandidateId = combined?.bestCandidate?.candidateId || null;
  const appliedCandidateId = decision.selected?.candidateId || decision.candidateId || null;
  const appliedIsCombined = Boolean(combinedCandidateId && appliedCandidateId
    && String(combinedCandidateId) === String(appliedCandidateId));

  // The settings the decision changed are the authority for what the selected
  // result retuned. Only when it kept none is the combined record read instead.
  const fromSettings = [...new Set(settingsRows.map(partOfSettingRow).filter(Boolean))];
  const composition = fromSettings.length > 0 ? fromSettings : partsFromCombined(combined);

  const label = formatCalibrationComposition(composition)
    || (appliedIsCombined ? COMBINED_CALIBRATION_RESULT_LABEL : null);

  // A result held for approval under the 3:1 rule is stated as a review, not as
  // a plain hold: the decision's own reason decides that.
  const reviewRequired = held
    && decision.reason === CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED;
  const stateLabel = applied ? CALIBRATION_RESULT_STATE.APPLIED
    : reviewRequired ? CALIBRATION_RESULT_STATE.REVIEW
      : CALIBRATION_RESULT_STATE.HELD;

  // Every other calibration result the decision held, with the reason it did.
  // The decision's own per-lever record is the authority — nothing is inferred.
  const perLever = decision.perLever && typeof decision.perLever === "object" ? decision.perLever : {};
  const heldLevers = Object.keys(perLever)
    .filter((key) => perLever[key] && perLever[key].applied !== true && perLever[key].statement)
    .map((key) => ({
      lever: key,
      label: cap(PART_WORD[key] || key),
      reason: perLever[key].reason || null,
      statement: perLever[key].statement,
    }));

  // The one held result that lost to a STRONGER selected result: stated in one
  // sentence, so "why not gain" is answered next to what WAS applied.
  const superseded = applied
    ? heldLevers.find((entry) => entry.reason === CALIBRATION_APPLY_REASON.STRONGER_CANDIDATE_SELECTED)
    : null;
  const phrase = adjustmentPhrase(composition);
  const heldSentence = superseded && phrase
    ? `${superseded.label} was tested, but the ${phrase} gave the stronger calibration improvement.`
    : null;

  const settingsChanged = SETTING_ORDER.filter((name) => settingsRows.some((row) => row?.setting === name));
  const valuesStatement = calibrationValuePairText(decision.before, decision.after);

  return {
    label,
    headline: label ? `${BEST_CALIBRATION_RESULT_PREFIX}${label}` : BEST_CALIBRATION_RESULT_HEADLINE,
    stateLabel,
    applied,
    held,
    reviewRequired,
    composition,
    appliedIsCombined,
    candidateId: appliedCandidateId,
    combinedCandidateId,
    // Stated only when the result the decision names was applied by ADI.
    statement: applied && phrase ? `ADI applied the ${phrase}.` : null,
    heldSentence,
    heldLevers,
    valuesStatement,
    settingsChanged,
    settingsRows,
  };
}