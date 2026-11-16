// skylightGeometry.js
// Geometry and collision helpers for ceiling-mounted skylight room elements.
// A skylight is a rectangular opening flush with the ceiling, described by a
// plan-space centre (x_m, y_m) and opening spans (length_m along X, width_m
// along Y). It sits at ceiling height, so it only clashes with in-ceiling
// (overhead) speakers whose plan footprint overlaps the opening.

export const SKYLIGHT_DEFAULT_LENGTH_M = 3.50;
export const SKYLIGHT_DEFAULT_WIDTH_M = 2.32;

// A speaker is treated as "in-ceiling" (potential skylight clash) when its Z
// position is within this tolerance of the ceiling. Overhead speakers are
// typically placed at roomHeight - 0.2 m, so 0.4 m captures them regardless
// of small placement variations.
const CEILING_Z_TOLERANCE_M = 0.45;

// Overhead / in-ceiling role prefix set (TFL, TFR, TML, TMR, TRL, TRR, TFC, …).
const OVERHEAD_ROLES = new Set([
  'TFL', 'TFR', 'TFC',
  'TML', 'TMR', 'TL', 'TR',
  'TRL', 'TRR', 'TRC', 'TBC',
  'TBL', 'TBR',
]);

export function isOverheadRole(role) {
  return OVERHEAD_ROLES.has(String(role || '').toUpperCase());
}

/**
 * Resolve a skylight element into a plan-space rectangle (metres).
 * Returns { x, y, w, h } where (x,y) is the top-left corner.
 */
export function skylightRectM(el, { widthM, lengthM } = {}) {
  const lenM = Number(el?.length_m) || SKYLIGHT_DEFAULT_LENGTH_M;
  const widM = Number(el?.width_m) || SKYLIGHT_DEFAULT_WIDTH_M;
  const cx = Number.isFinite(Number(el?.x_m)) ? Number(el.x_m) : (widthM ? widthM / 2 : 0);
  const cy = Number.isFinite(Number(el?.y_m)) ? Number(el.y_m) : (lengthM ? lengthM / 2 : 0);
  return {
    x: cx - lenM / 2,
    y: cy - widM / 2,
    w: lenM,
    h: widM,
  };
}

/**
 * Returns true when two axis-aligned rectangles (in metres) overlap.
 */
export function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Classify whether a placed speaker is an in-ceiling speaker that can clash
 * with a ceiling skylight. Uses the canonical overhead role first (authoritative
 * for Dolby layouts), and falls back to a ceiling-proximity Z check so that
 * custom models without an overhead role but mounted at ceiling are still
 * caught.
 */
export function isInCeilingSpeaker(speaker, { heightM } = {}) {
  if (!speaker) return false;
  if (isOverheadRole(speaker.role)) return true;
  const z = Number(speaker?.position?.z);
  if (Number.isFinite(z) && Number.isFinite(Number(heightM))) {
    return z >= Number(heightM) - CEILING_Z_TOLERANCE_M;
  }
  return false;
}

/**
 * Return the array of in-ceiling speakers whose plan footprint intersects the
 * given skylight rectangle. Each entry carries the speaker and its plan AABB
 * so the caller can draw a clash marker at the speaker position.
 */
export function skylightClashingSpeakers(speakers, skylRect, { heightM, getModelDimsM } = {}) {
  if (!Array.isArray(speakers) || !skylRect) return [];
  const out = [];
  for (const sp of speakers) {
    if (!isInCeilingSpeaker(sp, { heightM })) continue;
    const x = Number(sp?.position?.x);
    const y = Number(sp?.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dims = getModelDimsM?.(sp.model) || {};
    const w = Math.max(0.01, Number(dims.widthM) || 0.2);
    const d = Math.max(0.01, Number(dims.depthM) || 0.2);
    const aabb = { x: x - w / 2, y: y - d / 2, w, h: d };
    if (rectsIntersect(skylRect, aabb)) {
      out.push({ speaker: sp, aabb, x, y });
    }
  }
  return out;
}

/**
 * Push every in-ceiling (overhead) speaker whose plan footprint overlaps any
 * skylight opening out of it, along the minimum-translation axis. Speakers the
 * designer has manually positioned (positionSource === 'user') are left in place
 * so manual placement is never silently overridden. Returns { changed, speakers }
 * where `changed` is true only when at least one speaker was moved, so the caller
 * can avoid a redundant write. Positions are clamped to the room interior.
 *
 * Pure & side-effect free — safe to unit-test without React.
 */
export function nudgeOverheadsOutOfSkylights(speakers, skylights, opts = {}) {
  if (!Array.isArray(speakers)) return { changed: false, speakers: [] };
  if (!Array.isArray(skylights) || skylights.length === 0) {
    return { changed: false, speakers };
  }
  const {
    widthM,
    lengthM,
    heightM,
    getModelDimsM,
    marginM = 0.05,
    respectUserLocked = true,
  } = opts;

  const rects = skylights
    .map((el) => skylightRectM(el, { widthM, lengthM }))
    .filter((r) => r.w > 0 && r.h > 0);
  if (rects.length === 0) return { changed: false, speakers };

  const xMax = Number(widthM) || 0;
  const yMax = Number(lengthM) || 0;

  let changed = false;
  const next = speakers.map((sp) => {
    if (!isInCeilingSpeaker(sp, { heightM })) return sp;
    if (respectUserLocked && sp?.positionSource === 'user') return sp;

    const x = Number(sp?.position?.x);
    const y = Number(sp?.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return sp;

    const dims = getModelDimsM?.(sp.model) || {};
    const hw = Math.max(0.005, (Number(dims.widthM) || 0.2) / 2);
    const hd = Math.max(0.005, (Number(dims.depthM) || 0.2) / 2);

    let nx = x;
    let ny = y;
    for (const r of rects) {
      const aabb = { x: nx - hw, y: ny - hd, w: hw * 2, h: hd * 2 };
      if (!rectsIntersect(r, aabb)) continue;
      // Minimum-translation separation along the shallowest overlap axis.
      const overlapL = aabb.x + aabb.w - r.x;          // push −X
      const overlapR = r.x + r.w - aabb.x;             // push +X
      const overlapT = aabb.y + aabb.h - r.y;          // push −Y
      const overlapB = r.y + r.h - aabb.y;             // push +Y
      const min = Math.min(overlapL, overlapR, overlapT, overlapB);
      if (min === overlapL) nx -= overlapL + marginM;
      else if (min === overlapR) nx += overlapR + marginM;
      else if (min === overlapT) ny -= overlapT + marginM;
      else ny += overlapB + marginM;
      changed = true;
    }

    // Clamp to room interior (keep the full cabinet inside the room).
    nx = Math.max(hw, Math.min(xMax - hw, nx));
    ny = Math.max(hd, Math.min(yMax - hd, ny));

    if (nx === x && ny === y) return sp;
    return { ...sp, position: { ...sp.position, x: nx, y: ny } };
  });

  return { changed, speakers: next };
}