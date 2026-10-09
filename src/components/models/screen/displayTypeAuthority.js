/**
 * displayTypeAuthority.js
 * -----------------------
 * The one authority for HOW the display is described to a client.
 *
 * Canonical stored field: `display_type` — exactly one of:
 *   'tv'                a television
 *   'projector_screen'  a projection screen
 *
 * The type is never inferred from dimensions, and never from an aspect ratio or
 * an image format. It is decided by, in order:
 *   1. an explicit `display_type` the designer has saved (manual size section);
 *   2. an explicit television authority the project already carries — a TV preset
 *      or a saved TV width in mm. A preset is a named television, not a
 *      dimension, so this preserves the wording every existing TV project
 *      already uses;
 *   3. otherwise 'projector_screen' — the conservative answer, which is the
 *      wording every legacy manual project already produces. A legacy project is
 *      never silently reinterpreted as a TV.
 *
 * Client-facing language follows the type:
 *   tv                → `115" TV`  (the saved diagonal authority, nothing else:
 *                       no aspect ratio, no viewable width × height)
 *   projector_screen  → the existing screen wording, unchanged.
 *
 * Pure: no React, no DOM, no side effects. Nothing here is calculated for the
 * design: the physical geometry keeps using the underlying dimensions.
 */

import { diagonalInchesFromWidth, isTelevisionScreen } from './canonicalScreenSize';

export const DISPLAY_TYPE_TV = 'tv';
export const DISPLAY_TYPE_PROJECTOR = 'projector_screen';

/** The manual size section's two options, in display order. */
export const DISPLAY_TYPE_OPTIONS = Object.freeze([
  { value: DISPLAY_TYPE_TV, label: 'TV' },
  { value: DISPLAY_TYPE_PROJECTOR, label: 'Projector Screen' },
]);

/**
 * The canonical value of a stored display type, or null when the value does not
 * name one. Only the two canonical values are stored; the label forms are
 * accepted so a hand-written record can never be read as a third type.
 */
export function canonicalDisplayType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === DISPLAY_TYPE_TV || text === 'television') return DISPLAY_TYPE_TV;
  if (text === DISPLAY_TYPE_PROJECTOR || text === 'projector screen' || text === 'screen') {
    return DISPLAY_TYPE_PROJECTOR;
  }
  return null;
}

/**
 * The display type of a saved project, a design_state, or a live screen object.
 * Never inferred from width, height, aspect ratio or image format.
 */
export function resolveDisplayType(source) {
  if (!source || typeof source !== 'object') return DISPLAY_TYPE_PROJECTOR;

  const explicit = canonicalDisplayType(source.display_type)
    || canonicalDisplayType(source.displayType)
    || canonicalDisplayType(source.screen_manual_config?.displayType)
    || canonicalDisplayType(source.screen_manual_config?.display_type)
    || canonicalDisplayType(source.manualSize?.displayType);
  if (explicit) return explicit;

  return isTelevisionScreen(source) ? DISPLAY_TYPE_TV : DISPLAY_TYPE_PROJECTOR;
}

/** True when the display is a television. */
export function isTvDisplay(source) {
  return resolveDisplayType(source) === DISPLAY_TYPE_TV;
}

/** The display's noun in client-facing copy: 'TV' or 'screen'. */
export function displayNoun(source) {
  return isTvDisplay(source) ? 'TV' : 'screen';
}

/** The fact sheet's label for the display: 'TV' or 'Screen'. */
export function displayFactLabel(source) {
  return isTvDisplay(source) ? 'TV' : 'Screen';
}

/** Whether projector-only presentation (light output) applies to this display. */
export function projectorPresentationApplies(source) {
  return !isTvDisplay(source);
}

/**
 * The display's saved diagonal authority in inches, or null.
 * A television states its nominal diagonal, so that number is read from where
 * the designer saved it — the manual diagonal, then a saved TV width — and only
 * derived from the viewable width when no diagonal was ever saved.
 */
export function savedDiagonalInches(source) {
  const live = source?.manualSize;
  if (live?.mode === 'diagonal') {
    const saved = Number(live.diagonalInches);
    if (Number.isFinite(saved) && saved > 0) return saved;
  }

  const config = source?.screen_manual_config;
  if (config?.mode === 'diagonal') {
    const saved = Number(config.diagonalInches);
    if (Number.isFinite(saved) && saved > 0) return saved;
  }

  const aspectRatio = source?.aspect_ratio || source?.aspectRatio || '16:9';
  const tvWidthMm = Number(source?.tv_width_mm ?? source?.tvWidthMm);
  if (Number.isFinite(tvWidthMm) && tvWidthMm > 0) {
    return diagonalInchesFromWidth(tvWidthMm / 25.4, aspectRatio);
  }

  const widthInches = Number(source?.screen_size ?? source?.visibleWidthInches);
  return Number.isFinite(widthInches) && widthInches > 0
    ? diagonalInchesFromWidth(widthInches, aspectRatio)
    : null;
}

/**
 * The client-facing phrase for this design's display.
 *   TV               → `115" TV`
 *   Projector screen → the existing screen phrase (`185" 2.35:1`), unchanged.
 */
export function displayPhrase(source) {
  if (isTvDisplay(source)) {
    const diagonal = savedDiagonalInches(source);
    return Number.isFinite(diagonal) && diagonal > 0 ? `${Math.round(diagonal)}" TV` : 'TV';
  }

  const size = Number(source?.screen_size);
  const aspectRatio = String(source?.aspect_ratio || '').trim();
  const parts = [];
  if (Number.isFinite(size) && size > 0) parts.push(`${Math.round(size)}"`);
  if (aspectRatio) parts.push(aspectRatio);
  return parts.join(' ') || null;
}

export default resolveDisplayType;