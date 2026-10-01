/**
 * p7DisplayAuthority.js
 * ---------------------
 * The ONE display authority for RP22 Parameter 7 — front wide speakers'
 * horizontal deviation from the intended median angle.
 *
 * SOUND PROOF INTEGER DISPLAY RULE
 * ---------------------------------
 * A tenth of a degree means nothing in a real room, so P7 is stated in whole
 * degrees and always rounds DOWN:
 *
 *   6.1°  → 6°
 *   6.99° → 6°      (it is not 7° until it reaches 7.0°)
 *   7.0°  → 7°
 *
 * The exact measured value is kept in the engineering result's `deviation`
 * field for diagnostics — only the stated design value is whole. Thresholds are
 * untouched: L4 ≤ 2°, L3 ≤ 5°, L2 ≤ 7°, L1 ≤ 10°.
 *
 * Applied on the read path as well as in the engine, so a result published
 * before the integer rule existed still states whole degrees on the page.
 */

export const P7_NUMBER = 7;

/** True when the parameter id / number is P7. */
export function isP7Number(id) {
  return Number(id) === P7_NUMBER;
}

/**
 * The whole-degree design value: floor, never round up. Returns null when the
 * value is not usable, so a caller can never turn "no result" into a number.
 */
export function p7WholeDegrees(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.floor(numeric);
}

/** The stated P7 value, e.g. "6°". Null when there is no numeric value. */
export function formatP7Degrees(value) {
  const whole = p7WholeDegrees(value);
  return whole == null ? null : `${whole}°`;
}