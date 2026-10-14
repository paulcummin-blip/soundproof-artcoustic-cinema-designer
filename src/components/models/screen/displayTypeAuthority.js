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
 *   1. a television authority the design actually carries — a TV preset key, a
 *      saved TV width in mm, or the frozen `television` flag. The Screen Setup
 *      control IS a television selector ("TV 100""), so this evidence is a
 *      named television and settles the question on its own: a leftover
 *      `projector_screen` value left behind by an earlier manual entry can never
 *      re-describe a television as a projection screen (and so can never print
 *      its 88" viewable width as an 88" screen);
 *   2. the type the designer typed in the ENABLED manual size section — a stale
 *      disabled manual record is not an authority for anything;
 *   3. any other explicit `display_type` the design carries;
 *   4. otherwise 'projector_screen' — the conservative answer, which is the
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

import { diagonalInchesFromWidth } from './canonicalScreenSize';
import { TV_PRESET_DIAGONAL_INCHES } from './resolveEffectiveScreen';

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
/** The TV preset key a design or live screen object carries, or null. */
function tvPresetKey(source) {
  const key = String(source?.tvPresetKey ?? source?.tv_preset_key ?? '').trim().toLowerCase();
  return key || null;
}

/** A saved television width in mm, or null. */
function tvWidthMm(source) {
  const mm = Number(source?.tvWidthMm ?? source?.tv_width_mm);
  return Number.isFinite(mm) && mm > 0 ? mm : null;
}

/** The manual size record the designer is actually using, if any. A disabled
 *  record is history, not an authority. */
function activeManualSize(source) {
  const manualFlagOn = source?.manual_dimensions === true;
  const records = [source?.manualSize, source?.screen_manual_config];
  return records.find((record) => record && (record.enabled === true || manualFlagOn)) || null;
}

/**
 * Whether the design carries a television authority of its own: a TV preset, a
 * saved TV width in mm, or the frozen `television` flag a publication stamps.
 */
export function hasTelevisionEvidence(source) {
  if (!source || typeof source !== 'object') return false;
  if (source.television === true) return true;
  if (tvPresetKey(source)) return true;
  return tvWidthMm(source) !== null;
}

export function resolveDisplayType(source) {
  if (!source || typeof source !== 'object') return DISPLAY_TYPE_PROJECTOR;

  // A television the design states by its own TV evidence, before any stored
  // description: a preset or a saved TV width IS a television.
  if (hasTelevisionEvidence(source)) return DISPLAY_TYPE_TV;

  const manual = canonicalDisplayType(activeManualSize(source)?.displayType
    ?? activeManualSize(source)?.display_type);
  if (manual) return manual;

  const explicit = canonicalDisplayType(source.display_type)
    || canonicalDisplayType(source.displayType);
  if (explicit) return explicit;

  return DISPLAY_TYPE_PROJECTOR;
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
  const aspectRatio = source?.aspect_ratio || source?.aspectRatio || '16:9';

  // The size the designer typed in the manual size section, when it is the
  // section in use: a typed diagonal is the display's own size.
  const manual = activeManualSize(source);
  if (manual?.mode === 'diagonal') {
    const saved = Number(manual.diagonalInches);
    if (Number.isFinite(saved) && saved > 0) return saved;
  }
  if (manual?.mode === 'wh') {
    const widthM = Number(manual.widthM);
    const heightM = Number(manual.heightM);
    if (Number.isFinite(widthM) && widthM > 0 && Number.isFinite(heightM) && heightM > 0) {
      return Math.hypot(widthM, heightM) / 0.0254;
    }
  }

  // A television preset states its own nominal size — 100" is 100", never the
  // 87.8" viewable width of a 100" 16:9 panel derived back up.
  const preset = TV_PRESET_DIAGONAL_INCHES[tvPresetKey(source)];
  if (preset) return preset;

  const savedTvWidthMm = tvWidthMm(source);
  if (savedTvWidthMm !== null) {
    return diagonalInchesFromWidth(savedTvWidthMm / 25.4, aspectRatio);
  }

  const widthInches = Number(source?.screen_size ?? source?.visibleWidthInches);
  return Number.isFinite(widthInches) && widthInches > 0
    ? diagonalInchesFromWidth(widthInches, aspectRatio)
    : null;
}

/**
 * The client-facing phrase for this design's display. THE screen-size display
 * rule: a television is stated by its nominal diagonal alone, a projection
 * screen by its viewable width and aspect ratio alone.
 *   TV               → `77" TV`
 *   Projector screen → `170" wide 2.35:1 projection screen`
 *
 * A projection screen never states a diagonal, a diagonal equivalent or a
 * derived diagonal, and a television never states an aspect ratio or a width.
 */
export function displayPhrase(source) {
  if (isTvDisplay(source)) {
    const diagonal = savedDiagonalInches(source);
    return Number.isFinite(diagonal) && diagonal > 0 ? `${Math.round(diagonal)}" TV` : 'TV';
  }

  // The stored screen size IS the viewable width (design_state screen_size =
  // visibleWidthInches), so a projection screen is stated by that width and its
  // aspect ratio, and never by a diagonal derived from them.
  const size = Number(source?.screen_size ?? source?.visibleWidthInches);
  const aspectRatio = String(source?.aspect_ratio || source?.aspectRatio || '').trim();
  if (!Number.isFinite(size) || size <= 0) return aspectRatio ? `${aspectRatio} projection screen` : null;
  const width = `${Math.round(size)}"`;
  return aspectRatio ? `${width} wide ${aspectRatio} projection screen` : `${width} wide projection screen`;
}

export default resolveDisplayType;