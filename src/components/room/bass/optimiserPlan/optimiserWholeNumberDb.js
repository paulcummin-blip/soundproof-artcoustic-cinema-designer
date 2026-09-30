// optimiserWholeNumberDb.js
// ---------------------------------------------------------------------------
// Whole-number display for every value the optimiser card prints.
//
// Sound Proof design-facing UI never shows a decimal dB. The quantisation
// authority is the existing RP22 design-value policy:
//   P19 / P20 deviations → floored whole dB
//   P14 capability (SPL) → ceiled whole dB
//   P18 extension (Hz)   → floored whole Hz
// Full precision stays untouched internally (physics, grading, diagnostics).
//
// READ-ONLY formatting. No calculation, no re-grading.
// ---------------------------------------------------------------------------

import {
  formatP19P20DeviationText,
  formatP19P20DeltaText,
  resolveRp22DesignValue,
} from "../../../utils/rp22/resolveRp22DesignValue.js";

/** "±12 dB" — the only P19/P20 deviation form allowed in the card. */
export function deviationText(value) {
  return formatP19P20DeviationText(value);
}

/**
 * A change to a P19/P20 deviation: "3 dB", "-1 dB", or "no meaningful change"
 * when the change is smaller than a whole decibel.
 */
export function deltaText(value) {
  const text = formatP19P20DeltaText(value);
  if (text === null) return null;
  return text === "under 1 dB" ? "no meaningful change" : text;
}

/** "126 dB" — P14 capability, whole dB. */
export function p14DbText(value) {
  const whole = resolveRp22DesignValue(14, Number(value));
  return whole === null || !Number.isFinite(whole) ? null : `${whole} dB`;
}

/** "31 Hz" — P18 extension, whole Hz. */
export function p18HzText(value) {
  const whole = resolveRp22DesignValue(18, Number(value));
  return whole === null || !Number.isFinite(whole) ? null : `${whole} Hz`;
}

/** "L2" from a numeric or prefixed level, or null. */
export function levelText(level) {
  if (level === null || level === undefined || level === "") return null;
  if (Number.isFinite(Number(level))) return `L${Number(level)}`;
  const match = String(level).trim().toUpperCase().match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : null;
}

/** "at 73 Hz" — a limiting frequency, whole Hz. */
export function frequencyText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} Hz` : null;
}