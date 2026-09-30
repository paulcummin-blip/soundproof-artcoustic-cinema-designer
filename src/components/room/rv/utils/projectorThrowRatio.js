// projectorThrowRatio.js
// Generic projector throw-ratio sanity check.
//
// Sound Proof already knows the projector lens position, the screen plane and
// the resolved screen image width, so the implied throw ratio can be checked
// without any projector model, lens range or throw calculator:
//
//   throwRatio = lens-to-screen distance / screen image width
//
// This is a broad plausibility check only. It never blocks saving, never moves
// the projector, never calculates a required lens and never suggests a product.

export const GENERIC_THROW_RATIO_MIN = 1.30;
export const GENERIC_THROW_RATIO_MAX = 2.80;

export const THROW_RATIO_WARNING_TEXT = "Check throw ratio";
export const THROW_RATIO_WARNING_DETAIL =
  "Estimated throw ratio is outside the broad 1.30–2.80 check range. Confirm projector lens suitability.";

/**
 * Implied throw ratio from geometry the designer has already supplied.
 *
 * @param {Object} input
 * @param {number} input.lensY        Projector lens centre on the room depth axis (m) —
 *                                    the same axis and origin as the throw distance label.
 * @param {number} input.screenPlaneY Screen plane on the room depth axis (m) —
 *                                    the same axis and origin as the throw distance label.
 * @param {number} input.screenWidthM Resolved screen image width (m), never the diagonal.
 * @returns {{ throwRatio: number|null, isOutsideGenericRange: boolean, reason: 'too_short'|'too_long'|null }}
 */
// Null, undefined and blank are NOT zero here — an unset projector lens Y or a
// screen plane that has not been resolved must never produce a caution.
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Absorbs binary floating-point noise at the range edges so 2.80 stays inside
// the acceptable band rather than failing on 2.8000000000000003.
const RANGE_EPSILON = 1e-9;

export function calculateProjectorThrowRatio({ lensY, screenPlaneY, screenWidthM }) {
  const lens = toFiniteNumber(lensY);
  const screen = toFiniteNumber(screenPlaneY);
  const width = toFiniteNumber(screenWidthM);

  if (lens === null || screen === null) {
    return { throwRatio: null, isOutsideGenericRange: false, reason: null };
  }
  if (width === null || width <= 0) {
    return { throwRatio: null, isOutsideGenericRange: false, reason: null };
  }

  const throwRatio = Math.abs(screen - lens) / width;

  if (throwRatio < GENERIC_THROW_RATIO_MIN - RANGE_EPSILON) {
    return { throwRatio, isOutsideGenericRange: true, reason: "too_short" };
  }
  if (throwRatio > GENERIC_THROW_RATIO_MAX + RANGE_EPSILON) {
    return { throwRatio, isOutsideGenericRange: true, reason: "too_long" };
  }
  return { throwRatio, isOutsideGenericRange: false, reason: null };
}