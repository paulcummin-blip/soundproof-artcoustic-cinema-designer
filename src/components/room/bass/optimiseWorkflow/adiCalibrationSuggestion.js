// adiCalibrationSuggestion.js
// ---------------------------------------------------------------------------
// A USEFUL calibration improvement that ADI has NOT applied, stated as a
// suggestion for the designer.
//
// The improvement is real — the overall result improves by the canonical action
// figure and no regression guard is breached — but the seat-level figure was not
// cleared, so ADI does not apply it on its own. A professional reads that as a
// suggestion, not as a failed optimisation, so it is stated the way they want it:
//
//   WHAT to change        "reduce the front subwoofer level by 2.5 dB"
//   WHAT it improves      "displayed P20 variation reducing from 10 dB to 8 dB"
//   WHAT the level is     "the RP22 level remains L1"
//   WHAT to do with it    "Review before applying." — the designer's own line
//
// The seat-level figures, the thresholds and the missing-evidence sentence are NOT
// part of the designer's line: they are stated in `detail`, which every surface
// renders as Engineer details.
//
// The improvement is stated from the run's own before → after pair, so a change
// of 1.29 dB is never rounded up into "2 dB", and every amount comes from a value
// the run itself produced: a lever whose amount was not retained states no
// amount rather than a guessed one.
//
// PURE presentation: no calculation, no threshold, no apply. It changes no bass
// maths, no optimiser score and no RP22 grade.
// ---------------------------------------------------------------------------

import { formatDelayMs } from "../improveBassV2/acousticDelayAlignment.js";
import { BALANCED_DAMAGE_THRESHOLD_DB } from "../improveBassV2/canonicalObjectiveSelection.js";

/** The canonical lever keys of CALIBRATION_SETTING, read here as plain values. */
const LEVER = Object.freeze({
  GAIN: "gain",
  DELAY: "delay",
  POLARITY: "polarity",
  PHASE: "phase",
});

/** The canonical material-damage figure the acceptance rules apply. */
export const MATERIAL_DAMAGE_DB = BALANCED_DAMAGE_THRESHOLD_DB;

/** The one wording every suggested calibration improvement starts with. */
export const CALIBRATION_SUGGESTION_PREFIX = "Suggested improvement:";

/**
 * The designer's own line under the benefit: what to do with the suggestion.
 * Deliberately free of every diagnostic — no seat, no threshold, no figure — so
 * the main panel carries the recommendation and Engineer details carries the
 * evidence behind it.
 */
export const CALIBRATION_SUGGESTION_NOTE = "Review before applying.";

/** "front" / "rear" from a search group's own label, or null. Never guessed. */
export function calibrationGroupWord(label) {
  const match = typeof label === "string" ? label.match(/front|rear/i) : null;
  return match ? match[0].toLowerCase() : null;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function round1(value) {
  const numeric = finite(value);
  return numeric == null ? null : Math.round(numeric * 10) / 10;
}

/** The value as the panel writes it, in whole dB (floored, as every surface does). */
function wholeDb(value) {
  const numeric = finite(value);
  return numeric == null ? null : Math.floor(numeric);
}

function levelOf(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

/** A number read out of a stated setting ("−2.5 dB" → −2.5), or null. */
function numericFromText(value) {
  if (typeof value === "number") return finite(value);
  const cleaned = String(value ?? "").replace(/\u2212/g, "-").replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * THE ADJUSTMENT, in the designer's own terms — "reduce the front subwoofer level
 * by 2.5 dB". Built only from the lever and the amount the run itself measured.
 */
export function describeCalibrationAdjustment({
  lever = null,
  groupWord = null,
  gainDb = null,
  delayMs = null,
  polarityInverted = null,
  degrees = null,
} = {}) {
  const subs = groupWord ? `${groupWord} subwoofers` : "subwoofers";
  if (lever === LEVER.GAIN) {
    const value = finite(gainDb);
    if (value == null || value === 0) return null;
    const amount = `${Math.abs(round1(value))} dB`;
    const target = groupWord ? `${groupWord} subwoofer level` : "subwoofer level";
    return value < 0
      ? `reduce the ${target} by ${amount}`
      : `raise the ${target} by ${amount}`;
  }
  if (lever === LEVER.DELAY) {
    const value = finite(delayMs);
    if (value == null || value === 0) return null;
    const amount = `${formatDelayMs(Math.abs(value))} ms`;
    return value > 0
      ? `add ${amount} of delay to the ${subs}`
      : `reduce the ${subs} delay by ${amount}`;
  }
  if (lever === LEVER.POLARITY) {
    if (polarityInverted === true) return `invert the polarity of the ${subs}`;
    if (polarityInverted === false) return `return the ${subs} polarity to normal`;
    return null;
  }
  if (lever === LEVER.PHASE) {
    const value = finite(degrees);
    if (value == null || value === 0) return null;
    return `adjust the ${groupWord ? `${groupWord} ` : ""}subwoofer all-pass phase by ${Math.round(Math.abs(value))}° at 80 Hz`;
  }
  return null;
}

/**
 * A held improvement stated as a suggestion, in two registers:
 *
 *   summary  what to change, what it improves and what the level becomes — the
 *            designer's line, in displayed whole dB, with no threshold arithmetic
 *   detail   the same change with the exact measurements and the figure it was
 *            held against, for Engineer details
 */
export function describeCalibrationSuggestion({
  lever = null,
  groupWord = null,
  gainDb = null,
  delayMs = null,
  polarityInverted = null,
  degrees = null,
  before = null,
  after = null,
  improvementDb = null,
  seatImprovementDb = null,
  seatThresholdDb = null,
} = {}) {
  const adjustment = describeCalibrationAdjustment({
    lever, groupWord, gainDb, delayMs, polarityInverted, degrees,
  });

  const p20Before = wholeDb(before?.p20?.deviationDb);
  const p20After = wholeDb(after?.p20?.deviationDb);
  const p19Before = wholeDb(before?.p19?.deviationDb);
  const p19After = wholeDb(after?.p19?.deviationDb);
  const p20Better = p20Before != null && p20After != null && p20After < p20Before;
  const p19Better = p19Before != null && p19After != null && p19After < p19Before;
  const metric = p20Better || !p19Better ? "P20" : "P19";
  const from = metric === "P20" ? p20Before : p19Before;
  const to = metric === "P20" ? p20After : p19After;

  const levelBefore = levelOf(before?.p20?.level);
  const levelAfter = levelOf(after?.p20?.level);
  const levelClause = levelBefore != null && levelAfter != null
    ? (levelAfter === levelBefore
      ? `The RP22 level remains L${levelBefore}.`
      : levelAfter > levelBefore
        ? `The RP22 P20 level improves from L${levelBefore} to L${levelAfter}.`
        : null)
    : null;

  const summary = [
    `${CALIBRATION_SUGGESTION_PREFIX}${adjustment ? ` ${adjustment}.` : ""}`,
    from != null && to != null && to < from
      ? `This improves predicted overall bass consistency, with displayed ${metric} variation reducing from ${from} dB to ${to} dB.`
      : "This improves predicted overall bass consistency.",
    levelClause,
  ].filter(Boolean).join(" ");

  // The exact improvement is read from the metric's own before → after PAIR, so a
  // change of 1.2855 dB is stated as 1.29 dB and never as the rounded 1.3 dB.
  const exactFrom = metric === "P20" ? finite(before?.p20?.deviationDb) : finite(before?.p19?.deviationDb);
  const exactTo = metric === "P20" ? finite(after?.p20?.deviationDb) : finite(after?.p19?.deviationDb);
  const exactFromPair = exactFrom != null && exactTo != null && exactTo < exactFrom ? exactFrom - exactTo : null;
  const exact = exactFromPair ?? finite(improvementDb);
  const seatThreshold = finite(seatThresholdDb) ?? MATERIAL_DAMAGE_DB;
  const seatImprovement = finite(seatImprovementDb);
  const detail = [
    // Engineer details only. The verdict is stated for the evidence that actually
    // exists: a seat figure that was read, or a confirmation that was not retained.
    seatImprovement != null
      ? "Not applied automatically: the limiting seat does not improve enough for ADI to apply this on its own."
      : "Not applied automatically: the seat-level confirmation this needs was not retained, so it is offered for your approval.",
    exact != null && exactFrom != null && exactTo != null
      ? `Predicted overall ${metric} variation improves by ${exact.toFixed(2)} dB (${exactFrom.toFixed(2)} dB → ${exactTo.toFixed(2)} dB).`
      : (exact != null ? `Predicted overall ${metric} variation improves by ${exact.toFixed(2)} dB.` : null),
    seatImprovement != null
      ? `The limiting primary seat improves by ${round1(seatImprovement)} dB, under the ${seatThreshold} dB seat-level figure.`
      : "The run retained no candidate-level seat results, so the seat-level figure could not be verified from the saved evidence.",
    `Figures read: seat-level ${seatThreshold} dB, material damage ${MATERIAL_DAMAGE_DB} dB.`,
  ].filter(Boolean).join(" ");

  return {
    summary,
    detail,
    note: CALIBRATION_SUGGESTION_NOTE,
  };
}

/**
 * The suggestion inputs a decision's own changed settings imply: which lever,
 * which group and the amount — one group only. A change spread across both groups
 * states no group, and an amount that cannot be read states no amount.
 */
export function suggestionInputsFromSettings(settings) {
  const rows = Array.isArray(settings) ? settings : [];
  const pick = (key) => rows.filter((row) => String(row?.key || "").startsWith(`${key}:`));
  const gainRows = pick(LEVER.GAIN);
  const delayRows = pick(LEVER.DELAY);
  const polarityRows = pick(LEVER.POLARITY);
  const phaseRows = pick(LEVER.PHASE);
  const groups = new Set(rows.map((row) => row?.group || null));
  const singleGroup = groups.size === 1 ? [...groups][0] : null;

  const amountOf = (list) => {
    if (!list.length) return null;
    const deltas = list.map((row) => {
      const from = numericFromText(row?.from);
      const to = numericFromText(row?.to);
      return from == null || to == null ? null : to - from;
    });
    if (deltas.some((delta) => delta == null)) return null;
    const uniform = deltas.every((delta) => Math.abs(delta - deltas[0]) < 0.05);
    return uniform ? deltas[0] : null;
  };

  const lever = gainRows.length ? LEVER.GAIN
    : delayRows.length ? LEVER.DELAY
      : polarityRows.length ? LEVER.POLARITY
        : phaseRows.length ? LEVER.PHASE
          : null;

  return {
    lever,
    groupWord: singleGroup ? calibrationGroupWord(singleGroup) : null,
    gainDb: lever === LEVER.GAIN ? amountOf(gainRows) : null,
    delayMs: lever === LEVER.DELAY ? amountOf(delayRows) : null,
    polarityInverted: lever === LEVER.POLARITY ? polarityRows[0]?.to === "Inverted" : null,
    degrees: lever === LEVER.PHASE ? amountOf(phaseRows) : null,
  };
}