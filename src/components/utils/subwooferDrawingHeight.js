/**
 * subwooferDrawingHeight.js
 * -------------------------
 * The ONE derivation of a subwoofer's drawn height, shared by every elevation
 * drawing (front elevation, left/right elevations) so they can never disagree
 * about where a cabinet is installed.
 *
 * THE STORED AUTHORITY
 *   `bottomHeightM` is the canonical stored height: the cabinet BOTTOM above
 *   finished floor. The project schema stores no centre z — centre height is
 *   derived at the drawing boundary as:
 *
 *       centreZ = bottomHeightM + cabinetHeight / 2
 *
 *   That is the same boundary the bass engine and the Screen Wall Construction
 *   Detail already use, so a cabinet installed behind the screen is drawn behind
 *   the screen at its own height, and a cabinet on the floor stays on the floor.
 *
 * WHY THIS MODULE EXISTS
 *   Two drawings read the SAME installed instance in two different ways: the
 *   construction detail coerced the stored value with `Number(...)`, while the
 *   elevations tested it with a strict `Number.isFinite(...)` guard — which
 *   rejects a stored height that arrives as a string (a JSON round trip can do
 *   exactly that). The result was one drawing showing an elevated cabinet on the
 *   floor. Reading it in one place removes the possibility.
 *
 * CONVENTIONS
 *   - A stored height that is present and finite is used as it stands (a value of
 *     0 means a cabinet genuinely resting on the floor).
 *   - `front_subs_cfg` / `rear_subs_cfg` bottomHeightM is legacy compatibility
 *     metadata: it is read only when the instance itself states no height, which
 *     is the fallback the construction detail has always applied.
 *   - When nothing is stored, the cabinet rests on the floor (centreZ = height/2).
 *     Nothing is ever elevated by default.
 *
 * Pure: no React, no DOM, no state.
 */

/** The stored cabinet-bottom height AFF, as a number, or null when not stated. */
export function storedSubwooferBottomM(item = null, cfg = null) {
  for (const source of [item?.bottomHeightM, cfg?.bottomHeightM]) {
    if (source === null || source === undefined || source === '') continue;
    const value = Number(source);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * The cabinet bottom the drawing must place the cabinet at.
 * A stored height wins; with none stated the cabinet rests on the floor (0).
 */
export function subwooferBottomHeightM(item = null, cfg = null) {
  return storedSubwooferBottomM(item, cfg) ?? 0;
}

/**
 * The drawn centre height (acoustic centre) of an installed subwoofer.
 *
 * @param {Object} item           the installed instance (stored authority)
 * @param {number} cabinetHeightM the cabinet height the drawing itself renders
 * @param {Object} [cfg]          legacy front/rear cfg, read only as a fallback
 * @returns {number} centre height in metres above finished floor
 */
export function subwooferCentreZM(item = null, cabinetHeightM = null, cfg = null) {
  const heightM = Number(cabinetHeightM);
  const safeHeightM = Number.isFinite(heightM) && heightM > 0 ? heightM : 0;
  return subwooferBottomHeightM(item, cfg) + safeHeightM / 2;
}

export default subwooferCentreZM;