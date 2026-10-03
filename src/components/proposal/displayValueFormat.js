/**
 * displayValueFormat.js
 * ---------------------
 * Display-only number formatting for client-facing report tables.
 *
 * Sound Proof rounding policy, applied here and nowhere else:
 *   - angles are whole degrees
 *   - dB values are whole numbers (the app's existing formatDb policy)
 *   - bass extension is whole Hz, using the existing favourable whole-Hz
 *     policy (p18ExtensionAuthority: the value is floored)
 *
 * This module never calculates, re-scales or re-grades a result. It only
 * presents a value that has already been calculated by Sound Proof, so a
 * client-facing table never shows invented precision.
 *
 * Pure: no React, no side effects.
 */

export const DISPLAY_UNIT = Object.freeze({
  /** An angle in degrees. */
  DEGREES: 'deg',
  /** A level in dB / dBC / dBA / dBFS. */
  DB: 'db',
  /** A frequency in Hz. */
  HZ: 'hz',
  /** No unit rule applies; the value is left exactly as calculated. */
  NONE: null,
});

/** dB keeps the app's existing whole-number policy (formatDb: Math.ceil). */
const roundDb = (value) => Math.ceil(value);
/** Angles are whole degrees. */
const roundDegrees = (value) => Math.round(value);
/** Bass extension keeps the favourable whole-Hz policy (floor). */
const roundHz = (value) => Math.floor(value);

const ROUNDERS = Object.freeze({
  [DISPLAY_UNIT.DEGREES]: roundDegrees,
  [DISPLAY_UNIT.DB]: roundDb,
  [DISPLAY_UNIT.HZ]: roundHz,
});

/** A number, rounded to a whole value for its unit. Null when not a number. */
export function formatWholeValue(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const round = ROUNDERS[unit];
  return round ? round(numeric) : numeric;
}

/**
 * Round a single calculated value to the policy for its unit.
 * @returns {string} the display value
 */
export function formatValueForUnit(value, unit) {
  const rounded = formatWholeValue(value, unit);
  return rounded === null ? '' : String(rounded);
}

/**
 * The unit tokens a calculated result string may carry. A number is only
 * touched when it is followed by one of these, so a level code ("L1"), a
 * channel count or an inch dimension is never altered.
 */
const UNIT_PATTERN = /(-?\d+(?:\.\d+)?)(\s*)(°|dBFS|dBC|dBA|dB|Hz)(?![A-Za-z0-9])/g;

const UNIT_ROUNDER = {
  '°': roundDegrees,
  dBFS: roundDb,
  dBC: roundDb,
  dBA: roundDb,
  dB: roundDb,
  Hz: roundHz,
};

/** A bare decimal number, used only where the parameter's unit is degrees. */
const BARE_NUMBER_PATTERN = /(-?\d+\.\d+)(?![\d])/g;

/**
 * Format a calculated result string for display.
 *
 * Every number that carries a unit in the policy set is rounded to a whole
 * value for that unit, and the rest of the string is untouched. For a parameter
 * whose value IS an angle, a bare decimal is rounded and given its degree sign,
 * because the parameter itself defines the unit.
 *
 * @param {string} text - the calculated value, e.g. "L3 · 47.8°"
 * @param {string|null} unit - DISPLAY_UNIT for this parameter
 * @returns {string}
 */
export function formatResultText(text, unit = DISPLAY_UNIT.NONE) {
  if (text === null || text === undefined) return '';
  const source = String(text);
  if (!source.trim()) return '';

  let out = source.replace(UNIT_PATTERN, (match, number, spacing, token) => {
    const round = UNIT_ROUNDER[token];
    if (!round) return match;
    return `${round(Number(number))}${spacing}${token}`;
  });

  // An angle parameter states its unit: a bare decimal is rounded and given the
  // degree sign. Any other unit rule only formats numbers that already carry it.
  if (unit === DISPLAY_UNIT.DEGREES && !/°/.test(out)) {
    out = out.replace(BARE_NUMBER_PATTERN, (match, number) => `${roundDegrees(Number(number))}°`);
  }

  return out;
}

export default formatResultText;