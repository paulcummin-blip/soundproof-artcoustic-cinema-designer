// optimiserDisplayDelta.js
// ---------------------------------------------------------------------------
// THE DISPLAY DELTA AUTHORITY — one rule, everywhere a before → after pair is
// shown to a designer:
//
//   IF THE UI SHOWS A → B, THE DISPLAYED DELTA MUST EQUAL A − B.
//
// The designer reads the DESIGNED values, not the raw ones: P19/P20 deviations
// are displayed as whole dB (floored — the RP22 design-value policy). So the
// change stated beside a pair is derived from those same two displayed values,
// never from the full-precision float behind them. A pair shown as
//
//   ±15 dB → ±12 dB
//
// therefore states exactly "3 dB better" — not the 2 dB a raw 15.4 → 13.2 leaves
// behind when the endpoints are rounded for display.
//
// What this module deliberately does NOT touch:
//   • the raw values themselves — physics, grading, ranking, materiality, the
//     1 dB action threshold and every engineering decision keep full precision
//     and keep driving the optimiser internally
//   • a recorded per-seat regression amount: where a run retained "1.2 dB
//     worse" as its own evidence, that figure is retained evidence and stays
//     exactly as recorded (it is not an A → B display pair)
//
// PURE, READ-ONLY formatting. No calculation, no grading, no store.
// ---------------------------------------------------------------------------

import {
  floorP19P20Deviation,
  formatP19P20DeviationText,
} from "../../../utils/rp22/resolveRp22DesignValue.js";

/** Stated when the two displayed values are the same whole number. */
export const DISPLAY_NO_MEANINGFUL_CHANGE = "no meaningful change";

/** "±15 dB" — the displayed form of one endpoint. Null when not measured. */
export function displayEndpointText(value) {
  return formatP19P20DeviationText(value);
}

/**
 * THE DISPLAYED DELTA of a P19/P20 pair, in whole dB, from the displayed
 * endpoints: displayed(before) − displayed(after). Positive = the result got
 * better (a smaller deviation). Null when either endpoint was not measured.
 */
export function displayDeltaDb(beforeValue, afterValue) {
  const before = floorP19P20Deviation(beforeValue);
  const after = floorP19P20Deviation(afterValue);
  if (before == null || after == null) return null;
  return before - after;
}

/**
 * The displayed delta as the signed figure the card prints: "3 dB", "-1 dB" or
 * "no meaningful change". Derived from the displayed endpoints, so it always
 * adds up with the pair it sits beside.
 */
export function displayDeltaText(beforeValue, afterValue) {
  const delta = displayDeltaDb(beforeValue, afterValue);
  if (delta == null) return null;
  // The delta of two whole numbers is already whole: it is stated exactly, and a
  // change too small to state (0 dB) is stated as no meaningful change.
  return delta === 0 ? DISPLAY_NO_MEANINGFUL_CHANGE : `${delta} dB`;
}

/**
 * The displayed delta as a direction phrase — "3 dB better" · "1 dB worse" ·
 * "no meaningful change". Null when either endpoint was not measured.
 */
export function displayDeltaPhrase(beforeValue, afterValue) {
  const delta = displayDeltaDb(beforeValue, afterValue);
  if (delta == null) return null;
  if (delta === 0) return DISPLAY_NO_MEANINGFUL_CHANGE;
  return delta > 0 ? `${delta} dB better` : `${Math.abs(delta)} dB worse`;
}

/**
 * The IMPROVEMENT the pair displays — "3 dB better" — or null when the pair
 * shows no improvement (equal endpoints, or a worsening). A gain is never
 * stated where the displayed endpoints do not support one.
 */
export function displayImprovementText(beforeValue, afterValue) {
  const delta = displayDeltaDb(beforeValue, afterValue);
  return delta != null && delta > 0 ? `${delta} dB better` : null;
}

/** "±15 dB → ±12 dB · L1" — the displayed pair, with the level it lands at. */
export function displayPairText(beforeValue, afterValue, { level = null, levelSuffix = true } = {}) {
  const from = displayEndpointText(beforeValue);
  const to = displayEndpointText(afterValue);
  if (!from || !to) return null;
  const suffix = levelSuffix && level ? ` · ${level}` : "";
  return `${from} → ${to}${suffix}`;
}