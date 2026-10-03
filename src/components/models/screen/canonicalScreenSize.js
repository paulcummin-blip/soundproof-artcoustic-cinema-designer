/**
 * canonicalScreenSize.js
 * ----------------------
 * The one authority for the screen size a report states.
 *
 * The Room Designer stores its screen as a VIEWABLE WIDTH: design_state
 * `screen_size` is the viewable width in inches, a TV preset or TV width in mm
 * overrides it, and a manual width/height override wins over both.
 *
 * A client-facing surface states the screen the way the designer's design does:
 * a television by its nominal size (an 83" TV) and a projection screen by its
 * viewable width (a 170" wide 2.35:1 screen). resolveStatedScreenSize() is that
 * number, resolved once here from the canonical effective viewable width — the
 * same width authority the Room Designer and every report already use
 * (resolveEffectiveScreen). The diagonal is derived alongside it for reference.
 *
 * Nothing about the design is calculated here: it only resolves the screen the
 * designer set into the number a client-facing surface states, so every section
 * of every report and every ADI example states the same screen — the designer's
 * own screen size, never a re-derivation of it.
 *
 * Pure: no React, no side effects.
 */

import { resolveEffectiveVisibleWidthInches } from './resolveEffectiveScreen';

/** [width, height] for an aspect string such as '16:9' or '2.35:1'. */
function aspectPair(aspectRatio) {
  const text = String(aspectRatio || '16:9');
  if (text.includes(':')) {
    const [w, h] = text.split(':').map((part) => Number(part));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [w, h];
  }
  return [16, 9];
}

/** Diagonal inches for a viewable width in inches, or null. */
export function diagonalInchesFromWidth(widthInches, aspectRatio = '16:9') {
  const width = Number(widthInches);
  if (!Number.isFinite(width) || width <= 0) return null;
  const [aw, ah] = aspectPair(aspectRatio);
  return width / (aw / Math.hypot(aw, ah));
}

/** True when the project actually declares a screen, rather than a default. */
function declaresScreen(project) {
  if (!project) return false;
  const manual =
    project.manual_dimensions &&
    Number(project.manual_width_m) > 0 &&
    Number(project.manual_height_m) > 0;
  return Boolean(manual || project.tv_preset_key || Number(project.tv_width_mm) > 0 || Number(project.screen_size) > 0);
}

/**
 * The canonical effective viewable width in inches for a design, or null when
 * the project declares no screen at all.
 */
export function canonicalViewableWidthInches(project) {
  if (!declaresScreen(project)) return null;
  const manual =
    project.manual_dimensions &&
    Number(project.manual_width_m) > 0 &&
    Number(project.manual_height_m) > 0
      ? {
          enabled: true,
          mode: 'wh',
          widthM: Number(project.manual_width_m),
          heightM: Number(project.manual_height_m),
        }
      : undefined;
  const width = resolveEffectiveVisibleWidthInches({
    manualSize: manual,
    tvPresetKey: project.tv_preset_key ?? null,
    tvWidthMm: Number(project.tv_width_mm) || null,
    visibleWidthInches: Number(project.screen_size) || null,
    aspectRatio: project.aspect_ratio,
  });
  return Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * The canonical screen for a design.
 * @returns {{ widthInches: number, diagonalInches: number, aspectRatio: string, text: string } | null}
 */
export function resolveCanonicalScreen(project) {
  const widthInches = canonicalViewableWidthInches(project);
  if (widthInches === null) return null;
  const aspectRatio = project?.aspect_ratio || '16:9';
  const diagonal = diagonalInchesFromWidth(widthInches, aspectRatio);
  if (diagonal === null) return null;
  const width = Math.round(widthInches);
  const diagonalInches = Math.round(diagonal);
  return {
    widthInches: width,
    diagonalInches,
    aspectRatio,
    text: `${diagonalInches}" diagonal (${width}" viewable width) ${aspectRatio}`,
  };
}

/** True when the design's screen is a television rather than a projection screen. */
export function isTelevisionScreen(project) {
  return Boolean(project?.tv_preset_key) || Number(project?.tv_width_mm) > 0;
}

/**
 * The screen size a client-facing surface states.
 *
 * The number the designer's own design states: a television by its nominal size
 * (an 83" TV) and a projection screen by its viewable width (a 170" wide 2.35:1
 * screen). A report and an ADI example therefore state the screen the designer
 * specified, never a conversion of it.
 *
 * @returns {number|null}
 */
export function resolveStatedScreenSize(project) {
  const canonical = resolveCanonicalScreen(project);
  const stored = Number(project?.screen_size) || null;
  if (!canonical) return stored;
  return isTelevisionScreen(project) ? canonical.diagonalInches : canonical.widthInches;
}

export default resolveCanonicalScreen;