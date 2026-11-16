// measureSnapping.js
// Pure, side-effect-free helpers for the Plan View Measure tool's magnetic
// snapping. Builds a list of meaningful room references (walls, corners,
// speaker centres, seat head centres, element edges/corners) from live room
// state, and finds the nearest snap target for a room-metre point within a
// fixed tolerance. No React, no imports beyond the shared skylight helper.

import { skylightRectM } from './skylightGeometry';

// 5 cm in room metres — behaves consistently at every plan zoom because all
// distances are measured in room coordinates, not screen pixels.
export const SNAP_TOLERANCE_M = 0.05;

/** Distance from point (px,py) to segment (x1,y1)-(x2,y2). */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), point: { x: cx, y: cy } };
}

/**
 * Compute the plan-space rectangle (metres) for a wall-mounted or ceiling
 * room element. Mirrors the rectM logic in RvRoomElementsLayer so the Measure
 * tool snaps to the same edges the designer sees. Projector is omitted (not a
 * snap target the spec calls for). Returns null when geometry is unavailable.
 */
export function elementPlanRectM(el, { widthM, lengthM } = {}) {
  if (!el) return null;
  const W = Number(widthM) || 0;
  const L = Number(lengthM) || 0;

  if (el.type === 'skylight') {
    const r = skylightRectM(el, { widthM, lengthM });
    return r.w > 0 && r.h > 0 ? r : null;
  }

  if (el.type === 'projector') return null;

  const wallRaw = String(el.wall || el.side || 'front').toLowerCase();
  const wall =
    wallRaw === 'back' ? 'rear' :
    wallRaw === 'rear' ? 'rear' :
    wallRaw === 'front' ? 'front' :
    wallRaw === 'left' ? 'left' :
    wallRaw === 'right' ? 'right' : 'front';

  const len = Number(el?.length_m) || Number(el?.lengthM) || Number(el?.width) || 0.9;
  const thick = Number(el?.thickness_m) || Number(el?.thicknessM) || 0.05;
  const offset = Math.max(0, Number(el?.wall_offset_m) || 0);

  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const isNorm = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1;

  let posFR;
  if (Number.isFinite(n(el?.pos_m))) posFR = n(el.pos_m);
  else if (Number.isFinite(n(el?.x_m))) posFR = n(el.x_m);
  else if (isNorm(el?.x_position)) posFR = Number(el.x_position) * W;
  else posFR = 0;

  let posLR;
  if (Number.isFinite(n(el?.pos_m))) posLR = n(el.pos_m);
  else if (Number.isFinite(n(el?.y_m))) posLR = n(el.y_m);
  else if (isNorm(el?.y_position)) posLR = Number(el.y_position) * L;
  else if (isNorm(el?.x_position)) posLR = Number(el.x_position) * L;
  else posLR = 0;

  const posM = (wall === 'left' || wall === 'right') ? posLR : posFR;
  const maxP = (wall === 'left' || wall === 'right') ? Math.max(0, L - len) : Math.max(0, W - len);
  const p = Math.max(0, Math.min(posM, maxP));

  if (wall === 'front') return { x: p, y: offset, w: len, h: thick };
  if (wall === 'rear') return { x: p, y: L - thick - offset, w: len, h: thick };
  if (wall === 'left') return { x: offset, y: p, w: thick, h: len };
  if (wall === 'right') return { x: W - thick - offset, y: p, w: thick, h: len };
  return null;
}

/**
 * Build snap references from room state.
 * @returns {{ points: Array<{x,y,kind}>, segments: Array<{x1,y1,x2,y2,kind}> }}
 */
export function buildSnapReferences({ widthM, lengthM, speakers, seats, elementRects }) {
  const W = Number(widthM) || 0;
  const L = Number(lengthM) || 0;
  const points = [];
  const segments = [];

  if (W > 0 && L > 0) {
    segments.push({ x1: 0, y1: 0, x2: W, y2: 0, kind: 'wall' });
    segments.push({ x1: 0, y1: L, x2: W, y2: L, kind: 'wall' });
    segments.push({ x1: 0, y1: 0, x2: 0, y2: L, kind: 'wall' });
    segments.push({ x1: W, y1: 0, x2: W, y2: L, kind: 'wall' });
    points.push({ x: 0, y: 0, kind: 'corner' });
    points.push({ x: W, y: 0, kind: 'corner' });
    points.push({ x: 0, y: L, kind: 'corner' });
    points.push({ x: W, y: L, kind: 'corner' });
  }

  if (Array.isArray(speakers)) {
    for (const sp of speakers) {
      const x = Number(sp?.position?.x);
      const y = Number(sp?.position?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y, kind: 'speaker' });
      }
    }
  }

  if (Array.isArray(seats)) {
    for (const seat of seats) {
      const x = Number(seat?.x ?? seat?.position?.x);
      const y = Number(seat?.y ?? seat?.position?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y, kind: 'seat' });
      }
    }
  }

  if (Array.isArray(elementRects)) {
    for (const r of elementRects) {
      if (!r || r.w <= 0 || r.h <= 0) continue;
      const { x, y, w, h } = r;
      points.push({ x, y, kind: 'element' });
      points.push({ x: x + w, y, kind: 'element' });
      points.push({ x, y: y + h, kind: 'element' });
      points.push({ x: x + w, y: y + h, kind: 'element' });
      segments.push({ x1: x, y1: y, x2: x + w, y2: y, kind: 'element' });
      segments.push({ x1: x, y1: y + h, x2: x + w, y2: y + h, kind: 'element' });
      segments.push({ x1: x, y1: y, x2: x, y2: y + h, kind: 'element' });
      segments.push({ x1: x + w, y1: y, x2: x + w, y2: y + h, kind: 'element' });
    }
  }

  return { points, segments };
}

/**
 * Find the nearest snap target for a room-metre point within tolerance.
 * Point references (corners, speaker/seat centres, element corners) snap to
 * the exact point. Segment references (wall lines, element edges) snap to the
 * nearest point along the line. Returns { point, kind, dist } or null.
 */
export function findSnap(roomPoint, refs, toleranceM = SNAP_TOLERANCE_M) {
  if (!roomPoint || !refs) return null;
  const px = Number(roomPoint.x);
  const py = Number(roomPoint.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  let best = null;

  for (const pt of refs.points) {
    const d = Math.hypot(px - pt.x, py - pt.y);
    if (d <= toleranceM && (!best || d < best.dist)) {
      best = { dist: d, point: { x: pt.x, y: pt.y }, kind: pt.kind };
    }
  }

  for (const seg of refs.segments) {
    const { dist, point } = distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
    if (dist <= toleranceM && (!best || dist < best.dist)) {
      best = { dist, point, kind: seg.kind };
    }
  }

  return best;
}