/**
 * p8Authority.js
 * --------------
 * The ONE authority for RP22 Parameter 8 — "Upfiring/elevation speakers allowed?".
 *
 * Sound Proof product rule
 * ------------------------
 * P8 is always Performance Level 4. This is a fixed product rule, not a
 * calculation, and it is not conditional on project inputs:
 *
 *   - no dash ("—")
 *   - no "Not verified" / "Not calculated"
 *   - no "N/A"
 *
 * The result is Level 4, everywhere the parameter appears: the Compliance
 * Report, the Technical Report, the parameter detail panels, the summary cards
 * and the PDF exports.
 *
 * Achieved value: "No"
 *   The RP22 table wording for L4 on this parameter is "No" (L3 = No, L2 = Yes,
 *   L1 = Yes). The Sound Proof result remains Level 4.
 *
 * Relationship to the Design Rating
 * ---------------------------------
 * P8 has never contributed to the Artcoustic System Design Rating numerator,
 * and it still does not (V1_EXCLUDED_PARAMS keeps it out of the rating core).
 * Making it an assessed L4 result changes presentation and reporting only — no
 * other parameter's value, level, floor or rating calculation moves.
 */

export const P8_KEY = "p8";
export const P8_NUMBER = 8;
export const P8_LEVEL = "L4";
export const P8_ACHIEVED_VALUE = "No";
export const P8_FIXED_REASON = "product-fixed";

/**
 * Presentation status used by the compliance summary. P8 is an assigned Sound
 * Proof authority, so it reads with the existing "Assumed" naming — the same
 * vocabulary already used for the other assumed parameters (P15/P21).
 */
export const P8_PRESENTATION_STATUS = "assumed";

/** Short, non-explaining note shown with the P8 result. */
export const P8_NOTE = "Level 4 is assigned by Sound Proof for this parameter.";

/** True when the key is P8 in any accepted form ("p8", "P8", 8, "8"). */
export function isP8Key(key) {
  return String(key ?? "").trim().toLowerCase().replace(/^p/, "") === String(P8_NUMBER);
}

/** True when the parameter id / number is P8. */
export function isP8Number(number) {
  return Number(number) === P8_NUMBER;
}

/**
 * The fixed P8 parameter authority used by the Artcoustic System Design Rating.
 * Presented as an assessed result (so every report reads it), never counted in
 * the rating numerator.
 */
export function buildP8DesignRatingParameter({ weight, scope = "room" } = {}) {
  return {
    key: P8_KEY,
    weight,
    effectiveWeight: weight,
    scope,
    state: "scored",
    level: P8_LEVEL,
    rawValue: P8_ACHIEVED_VALUE,
    multiplier: null,
    reason: P8_FIXED_REASON,
    fixedAuthority: true,
    seats: null,
  };
}

/**
 * The fixed P8 room result, for consumers that resolve room results directly
 * rather than through the design-rating authority.
 */
export function buildP8RoomResult(existing = {}) {
  return {
    ...existing,
    state: "scored",
    status: "scored",
    level: P8_LEVEL,
    value: P8_ACHIEVED_VALUE,
    formatted: P8_ACHIEVED_VALUE,
    hudLabel: P8_ACHIEVED_VALUE,
    fixedAuthority: true,
  };
}

/** The P8 explanation note when the parameter is P8, otherwise null. */
export function p8NoteFor(paramIdOrKey) {
  return isP8Key(paramIdOrKey) ? P8_NOTE : null;
}