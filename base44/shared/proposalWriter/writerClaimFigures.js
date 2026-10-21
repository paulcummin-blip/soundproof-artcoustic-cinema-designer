/**
 * writerClaimFigures.js (shared)
 * ------------------------------
 * THE figures a section may quote from the claims it CITES, derived from that
 * claim's own saved capability evidence rather than from report prose.
 *
 * A Parameter 14 result reaches the writer as saved numbers — achieved
 * capability, selected target, and the headroom or shortfall between them — and
 * the writer contract shows them rounded to two decimal places. The report's own
 * narrative states the same result in its own words ("112 dBC"), so a draft that
 * quotes the capability exactly as the contract shows it states a figure the
 * frozen evidence holds, while the measurement scanner — which reads only the
 * prose the pack spells out — cannot see it. That is a false positive, and this
 * module removes it without loosening anything else:
 *
 *   117.38702597538882 → 117.39   (permitted: the two-decimal display form)
 *   117.4                         (never derived, so still refused)
 *   117.50                        (never derived, so still refused)
 *
 * Nothing is invented here, and no number is trusted because a draft wrote it: a
 * figure is permitted only where a claim CITED BY THAT SECTION carries the value
 * in its own capability evidence. The rounding rule is the same one the input
 * builder applies, exported here so the writer and the validator can never
 * disagree about what a display form is.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The capability fields stated in dB, as the reports save them. */
export const CAPABILITY_DB_FIELDS = Object.freeze([
  'achieved_capability_db',
  'selected_target_db',
  'headroom_or_shortfall_db',
]);

/**
 * The units a capability figure may be written in. The saved value is one
 * number; whether the copy calls it dB or dB(C) is a wording choice the
 * capability evidence itself does not settle, so both are the same figure.
 */
const CAPABILITY_UNITS = Object.freeze(['db', 'dbc']);

/** THE rounding rule: two decimal places, as the writer is shown the figures. */
export function roundCapabilityDb(capability) {
  const out = { ...capability };
  for (const field of CAPABILITY_DB_FIELDS) {
    if (typeof out[field] === 'number' && Number.isFinite(out[field])) {
      out[field] = Math.round(out[field] * 100) / 100;
    }
  }
  return out;
}

/**
 * The display forms of one authoritative value: the two-decimal form the writer
 * is shown, and the same value with its trailing zeros dropped (112.00 → 112),
 * which is how a round target is normally written. A value that needs more than
 * two decimals is never rounded to one, so an adjacent figure is never admitted.
 */
export function capabilityDisplayForms(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return [];
  const rounded = Math.round(number * 100) / 100;
  const twoDecimals = rounded.toFixed(2);
  const trimmed = String(rounded);
  return twoDecimals === trimmed ? [twoDecimals] : [twoDecimals, trimmed];
}

/**
 * Every figure the cited claims permit, as "<value> <unit>" tokens — the same
 * shape measurementTokens reads a draft's prose into.
 *
 * @param {Array<Object>} claims — the claims this section actually cites
 * @returns {Set<string>}
 */
export function claimFigureTokens(claims) {
  const tokens = new Set();
  for (const claim of Array.isArray(claims) ? claims : []) {
    const capability = claim?.capability;
    if (!capability || typeof capability !== 'object') continue;
    for (const field of CAPABILITY_DB_FIELDS) {
      for (const form of capabilityDisplayForms(capability[field])) {
        for (const unit of CAPABILITY_UNITS) tokens.add(`${form} ${unit}`);
      }
    }
  }
  return tokens;
}

export default claimFigureTokens;