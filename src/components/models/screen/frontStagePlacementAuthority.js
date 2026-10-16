/**
 * frontStagePlacementAuthority.js
 * -------------------------------
 * The ONE authority for the front stage's PLACEMENT NOTE — the short location a
 * speaker schedule may state beside Front left, Front right and Centre.
 *
 * A placement is only ever stated from the version's OWN saved facts, never from
 * a generic description of a screen:
 *
 *   display identity  — resolveDisplayType(), the app's one display authority;
 *   screen construction — the saved mount (a baffle wall, or a floating screen
 *                       with its own cavity) and the saved screen front plane;
 *   speaker positions — each loudspeaker's own saved acoustic-centre position.
 *
 * The rules:
 *
 *   TELEVISION — a television is flanked, not hidden, and flanking it is already
 *   evident from the drawing itself: the schedule states NO placement note for a
 *   television-based front stage at all. "Behind screen" is never stated either,
 *   because a television has no screen for a loudspeaker to sit behind.
 *
 *   PROJECTION SCREEN — "Behind screen" is stated only when the construction puts
 *   the front stage behind the screen surface (a baffle wall, or a floating screen
 *   with its own cavity) AND the row's own loudspeakers are actually placed at or
 *   behind the screen's front plane. Baffle-wall construction ALONE is not
 *   sufficient evidence: where the saved facts do not establish the placement,
 *   nothing is stated — an unproven location is never asserted.
 *
 * Presentation only. Nothing here is calculated, graded or inferred for the
 * design, no geometry is altered, and no engineering value is read or written.
 *
 * Pure: no React, no SDK, no side effects.
 */

import { resolveDisplayType, DISPLAY_TYPE_TV } from './displayTypeAuthority';

/** The mounting modes that carry the front stage in the construction. */
const BAFFLE_MODE = 'baffle';
const FLOATING_MODE = 'floating';

/** The mount a screen block states, in any of its saved spellings. */
export function resolveScreenMountMode(screen) {
  if (!screen || typeof screen !== 'object') return null;
  const mode = String(screen.mount_mode || screen.mountMode || screen.screen_mount_mode || '')
    .trim()
    .toLowerCase();
  return mode || null;
}

/** The screen's front plane in metres, in any of its saved spellings. */
export function resolveScreenFrontPlaneM(screen, fallbackM = null) {
  const candidates = [
    fallbackM,
    screen?.screenFrontPlaneM,
    screen?.screen_front_plane_m,
  ];
  for (const candidate of candidates) {
    // An absent plane is not a plane: it is never read as a zero distance.
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * The display's own image width in metres, or null when the version states none.
 * Read from the saved television width, then the saved viewable width. Never
 * derived from an aspect ratio, and never a made-up bezel allowance.
 */
export function resolveDisplayImageWidthM(screen) {
  if (!screen || typeof screen !== 'object') return null;
  const candidates = [
    Number(screen.tv_width_mm) > 0 ? Number(screen.tv_width_mm) / 1000 : null,
    Number(screen.tvWidthMm) > 0 ? Number(screen.tvWidthMm) / 1000 : null,
    screen.manualSize?.enabled ? Number(screen.manualSize.widthM) : null,
    Number(screen.manual_width_m) > 0 ? Number(screen.manual_width_m) : null,
    Number(screen.widthM) > 0 ? Number(screen.widthM) : null,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/** A loudspeaker's own saved acoustic-centre position, or null. */
export function speakerPositionOf(speaker) {
  const position = speaker?.position;
  if (!position || typeof position !== 'object') return null;
  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) && !Number.isFinite(y)) return null;
  return { x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null };
}

/**
 * Whether every loudspeaker in the row is placed at or behind the screen's front
 * plane. The screen surface faces the seats, so a smaller distance from the front
 * wall than the screen's own front plane is behind the screen surface.
 */
function allBehindFrontPlane(speakers, frontPlaneM) {
  if (!Number.isFinite(frontPlaneM)) return false;
  const positions = (Array.isArray(speakers) ? speakers : [])
    .map(speakerPositionOf)
    .filter(Boolean);
  if (positions.length === 0) return false;
  return positions.every((p) => p.y !== null && p.y <= frontPlaneM + 1e-9);
}

/**
 * The placement note for one front-stage row, or null.
 *
 * @param {Object}   input
 * @param {Object}   [input.screen]      — the version's saved display identity and construction
 * @param {string}   [input.rowKey]      — 'FL' | 'FR' | 'FC'
 * @param {Array}    [input.speakers]    — the row's own loudspeakers, as placed
 * @param {number}   [input.frontPlaneM] — the screen front plane, when the caller holds it
 * @returns {string|null}
 */
export function frontStagePlacementNote({
  screen = null,
  rowKey = null,
  speakers = [],
  frontPlaneM = null,
} = {}) {
  if (!screen || typeof screen !== 'object') return null;

  const display = resolveDisplayType(screen);
  const list = Array.isArray(speakers) ? speakers : [];

  if (display === DISPLAY_TYPE_TV) {
    // A television is flanked, not hidden, and flanking it is already evident from
    // the drawing: the schedule states no placement note for a television-based
    // front stage. A note that repeats what the drawing shows only clutters the
    // equipment schedule.
    return null;
  }

  // Only the front stage sits in the screen construction; a surround or overhead
  // row is never described against the screen.
  const FRONT_STAGE_ROWS = ['FL', 'FR', 'FC'];
  if (!FRONT_STAGE_ROWS.includes(String(rowKey || ''))) return null;

  const mode = resolveScreenMountMode(screen);
  const carriesFrontStage = mode === BAFFLE_MODE
    || (mode === FLOATING_MODE && screen.show_cavity === true);
  if (!carriesFrontStage) return null;

  const plane = resolveScreenFrontPlaneM(screen, frontPlaneM);
  return allBehindFrontPlane(list, plane) ? 'Behind screen' : null;
}

export default frontStagePlacementNote;