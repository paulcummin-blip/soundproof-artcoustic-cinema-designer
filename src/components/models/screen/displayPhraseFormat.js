/**
 * displayPhraseFormat.js
 * ----------------------
 * THE display-wording formatter — the single place a client-facing display
 * phrase is assembled.
 *
 *   TV               → `100" TV`
 *   Projector screen → `150" 2.35:1 projection screen`
 *
 * It only puts words around numbers a caller has already resolved from its own
 * authority: it measures nothing, converts nothing, reads no stored value and
 * changes no figure. The Room Designer, every report surface and every proposal
 * surface state the display through this one function, so no two of them can
 * ever word the same display differently.
 *
 * The two rules the wording follows:
 *   - a television is stated by its nominal diagonal alone: never an aspect
 *     ratio, never a viewable width;
 *   - a projection screen is stated by its viewable width and aspect ratio
 *     alone: never a diagonal and never a diagonal equivalent.
 *
 * Deliberately dependency-free (no imports at all) so the screen-size
 * authority and the report/proposal authorities can all use it without a
 * circular import.
 */

/**
 * @param {object} input
 * @param {boolean} [input.television]     true when the display is a television.
 * @param {number|null} [input.diagonalInches] the display's nominal diagonal.
 * @param {number|null} [input.widthInches]    the viewable image width.
 * @param {string|null} [input.aspectRatio]    the display's aspect ratio.
 * @returns {string|null} the phrase, or null when there is nothing to state.
 */
export function formatDisplayPhrase({
  television = false,
  diagonalInches = null,
  widthInches = null,
  aspectRatio = null,
} = {}) {
  const aspect = String(aspectRatio ?? '').trim();

  if (television) {
    const diagonal = Number(diagonalInches);
    return Number.isFinite(diagonal) && diagonal > 0 ? `${Math.round(diagonal)}" TV` : 'TV';
  }

  const width = Number(widthInches);
  if (!Number.isFinite(width) || width <= 0) {
    return aspect ? `${aspect} projection screen` : null;
  }
  return aspect
    ? `${Math.round(width)}" ${aspect} projection screen`
    : `${Math.round(width)}" projection screen`;
}

export default formatDisplayPhrase;