/**
 * Canonical authority for the room_dimensions_edited flag.
 *
 * The generic auto-loaded room dimensions supplied by Room Designer hydration:
 *   width  = 4.5 m
 *   length = 6.0 m
 *   height = 2.4 m
 *
 * Business rule:
 *   - New projects start with room_dimensions_edited = false if no dimensions
 *     were supplied at creation, or true if real dimensions were entered.
 *   - The first time the user changes ANY dimension away from generic,
 *     the flag becomes true.
 *   - Once true, it NEVER returns to false — even if the user later
 *     numerically returns to 4.5 × 6.0 × 2.4.
 *   - Hydration/autosave of the generated defaults must NOT set this true.
 *
 * This module is shared between serializeProject (client) and
 * cleanupIncompleteProjects (backend) so both use the same generic
 * threshold and comparison logic.
 */

export const GENERIC_ROOM_WIDTH_M = 4.5;
export const GENERIC_ROOM_LENGTH_M = 6.0;
export const GENERIC_ROOM_HEIGHT_M = 2.4;
const EPSILON_M = 0.001;

/**
 * Returns true if the supplied dimensions differ from the generic defaults.
 * Null/undefined/NaN values are treated as matching generic (no difference)
 * so that a freshly-created project with null dimensions is not flagged.
 *
 * @param {number|null|undefined} widthM
 * @param {number|null|undefined} lengthM
 * @param {number|null|undefined} heightM
 * @returns {boolean}
 */
export function dimsDifferFromGeneric(widthM, lengthM, heightM) {
  const w = Number(widthM);
  const l = Number(lengthM);
  const h = Number(heightM);
  if (Number.isFinite(w) && Math.abs(w - GENERIC_ROOM_WIDTH_M) > EPSILON_M) return true;
  if (Number.isFinite(l) && Math.abs(l - GENERIC_ROOM_LENGTH_M) > EPSILON_M) return true;
  if (Number.isFinite(h) && Math.abs(h - GENERIC_ROOM_HEIGHT_M) > EPSILON_M) return true;
  return false;
}

/**
 * Resolves the room_dimensions_edited flag for a save operation.
 *
 * Returns true if the existing flag is already true OR the current dimensions
 * differ from generic. Never returns false once the flag has been true.
 *
 * @param {boolean} existingFlag - The current stored value on the Project.
 * @param {number|null|undefined} widthM
 * @param {number|null|undefined} lengthM
 * @param {number|null|undefined} heightM
 * @returns {boolean}
 */
export function resolveRoomDimensionsEdited(existingFlag, widthM, lengthM, heightM) {
  if (existingFlag) return true;
  return dimsDifferFromGeneric(widthM, lengthM, heightM);
}