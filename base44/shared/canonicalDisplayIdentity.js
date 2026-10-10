/**
 * canonicalDisplayIdentity.js (shared)
 * ------------------------------------
 * How the display is described, read from the frozen Engineering Snapshot.
 *
 * The snapshot already carries the display's own identity:
 *   room.screen.display_type     'tv' | 'projector_screen', frozen from the
 *                                designer's own display authority
 *   room.screen.diagonal_inches  the authoritative diagonal of that display
 *
 * The client-facing Project Report and reportEvidence state the display from
 * exactly those two fields (their own display_label), so the proposal examples
 * state it from them too — one display identity for every client-facing surface.
 *
 * Nothing is reconstructed here. A television is never re-derived from a
 * viewable width, a preset width, a historical screen size or an aspect ratio,
 * and a projection screen keeps the existing screen wording unchanged.
 *
 * Pure: no React, no fetching, no side effects.
 */

export const DISPLAY_TYPE_TV = 'tv';
export const DISPLAY_TYPE_PROJECTOR = 'projector_screen';

/**
 * The canonical value of a stored display type, or null when the value names
 * none. Only the two canonical values are stored; the label forms are accepted
 * so a hand-written record can never be read as a third type.
 */
export function canonicalDisplayType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === DISPLAY_TYPE_TV || text === 'television') return DISPLAY_TYPE_TV;
  if (text === DISPLAY_TYPE_PROJECTOR || text === 'projector screen' || text === 'screen') {
    return DISPLAY_TYPE_PROJECTOR;
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The display identity of a frozen snapshot screen block.
 *
 * @param {Object|null} screen — snapshot.room.screen
 * @returns {{ displayType: string, isTv: boolean, diagonalInches: number|null, tvPhrase: string|null }}
 *   `tvPhrase` is the canonical phrase for a television (`115" TV`) when its
 *   diagonal is known, and null when it is not — or for a projection screen,
 *   which keeps its existing screen wording.
 */
export function readDisplayIdentity(screen) {
  const explicit = canonicalDisplayType(screen?.display_type);
  // The frozen `television` flag is the identity a publication already carried.
  // The type is never inferred from a size, a width or an aspect ratio.
  const displayType = explicit
    || (screen?.television === true ? DISPLAY_TYPE_TV : DISPLAY_TYPE_PROJECTOR);
  const isTv = displayType === DISPLAY_TYPE_TV;
  const diagonalInches = toNumber(screen?.diagonal_inches);

  return {
    displayType,
    isTv,
    diagonalInches,
    // A television states its diagonal when the publication carries one; when it
    // does not, no display figure is stated at all.
    tvPhrase: isTv && Number.isFinite(diagonalInches) && diagonalInches > 0
      ? `${Math.round(diagonalInches)}" TV`
      : null,
  };
}

export default readDisplayIdentity;