/**
 * customWallGeometry.js
 *
 * Pure geometry helpers for Custom Wall room elements. A custom wall is a
 * straight segment with two endpoints, a thickness and an optional placement
 * restriction. It is a VISUAL architectural overlay only — none of these values
 * are read by the acoustic engine, bass simulation, RP22 grading, best-sub
 * layout, or any fingerprint path (those paths exclude `custom_wall` types).
 *
 * Endpoint storage:
 *   p1: { x, y }  room-space metres (front-left origin, X = width, Y = length)
 *   p2: { x, y }
 *   thickness_m:   wall thickness in metres (default 0.10)
 *   restriction:  'off' | 'on'  (visual clash warning only; never moves speakers)
 *
 * All functions are pure and side-effect free so they can be unit-tested
 * without React.
 */

export const CUSTOM_WALL_TYPE = 'custom_wall';
export const DEFAULT_THICKNESS_M = 0.10;
export const SNAP_TOLERANCE_M = 0.05; // 5 cm magnetic snapping

const EPS = 1e-9;

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * Create a new Custom Wall element centred at (cx, cy) with a default length.
 * Returns a plain object ready to push into the versioned roomElements array.
 */
export function createCustomWall({ cx = 1.5, cy = 3, lengthM = 2, thicknessM = DEFAULT_THICKNESS_M, label = 'Custom Wall', restriction = 'off' } = {}) {
  const half = Math.max(0.05, Number(lengthM) / 2);
  return {
    id: `cw-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    type: CUSTOM_WALL_TYPE,
    p1: { x: Number(cx), y: Math.max(0, Number(cy) - half) },
    p2: { x: Number(cx), y: Math.max(0, Number(cy) + half) },
    thickness_m: Math.max(0.02, Number(thicknessM)),
    label: String(label),
    restriction: restriction === 'on' ? 'on' : 'off',
  };
}

/**
 * Duplicate a Custom Wall, offsetting both endpoints slightly so the copy is
 * visibly distinct and selectable.
 */
export function duplicateCustomWall(wall, dx = 0.2, dy = 0.1) {
  if (!wall) return null;
  return {
    ...wall,
    id: `cw-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    p1: { x: num(wall.p1?.x) + dx, y: num(wall.p1?.y) + dy },
    p2: { x: num(wall.p2?.x) + dx, y: num(wall.p2?.y) + dy },
    label: wall.label ? `${wall.label} (copy)` : 'Custom Wall',
  };
}

/**
 * Geometric length of the wall segment in metres.
 */
export function wallLength(wall) {
  if (!wall) return 0;
  const dx = num(wall.p2?.x) - num(wall.p1?.x);
  const dy = num(wall.p2?.y) - num(wall.p1?.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Angle of the segment in degrees, measured from p1 to p2, in the range
 * (-180, 180]. 0 deg = p2 directly above p1 (along +Y). This matches the
 * Room Designer's plan orientation where Y increases front-to-rear.
 */
export function wallAngleDeg(wall) {
  if (!wall) return 0;
  const dx = num(wall.p2?.x) - num(wall.p1?.x);
  const dy = num(wall.p2?.y) - num(wall.p1?.y);
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPS) return 0;
  return Math.round((Math.atan2(dx, dy) * 180) / Math.PI * 10) / 10;
}

/**
 * Midpoint of the wall segment in metres.
 */
export function wallMidpoint(wall) {
  if (!wall) return { x: 0, y: 0 };
  return {
    x: (num(wall.p1?.x) + num(wall.p2?.x)) / 2,
    y: (num(wall.p1?.y) + num(wall.p2?.y)) / 2,
  };
}

/**
 * Unit vector along the segment (p1 → p2).
 */
export function wallDirection(wall) {
  const dx = num(wall.p2?.x) - num(wall.p1?.x);
  const dy = num(wall.p2?.y) - num(wall.p1?.y);
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPS) return { x: 0, y: 1 };
  return { x: dx / len, y: dy / len };
}

/**
 * Perpendicular (left-hand normal) unit vector to the segment.
 */
export function wallNormal(wall) {
  const dir = wallDirection(wall);
  return { x: -dir.y, y: dir.x };
}

/**
 * The four corners of the wall footprint rectangle (rotated), in metres.
 * Order: p1-side-left, p1-side-right, p2-side-right, p2-side-left.
 */
export function wallCorners(wall) {
  if (!wall) return [];
  const dir = wallDirection(wall);
  const nrm = wallNormal(wall);
  const t = Math.max(0.02, num(wall.thickness_m, DEFAULT_THICKNESS_M)) / 2;
  const p1 = { x: num(wall.p1?.x), y: num(wall.p1?.y) };
  const p2 = { x: num(wall.p2?.x), y: num(wall.p2?.y) };
  return [
    { x: p1.x + nrm.x * t, y: p1.y + nrm.y * t },
    { x: p1.x - nrm.x * t, y: p1.y - nrm.y * t },
    { x: p2.x - nrm.x * t, y: p2.y - nrm.y * t },
    { x: p2.x + nrm.x * t, y: p2.y + nrm.y * t },
  ];
}

/**
 * Set the wall length by moving p2 along the current direction from p1.
 * Minimum length 0.05 m.
 */
export function setWallLength(wall, lengthM) {
  if (!wall) return wall;
  const len = Math.max(0.05, Number(lengthM));
  const dir = wallDirection(wall);
  const p1 = { x: num(wall.p1?.x), y: num(wall.p1?.y) };
  return {
    ...wall,
    p2: { x: p1.x + dir.x * len, y: p1.y + dir.y * len },
  };
}

/**
 * Set the wall angle (degrees, same convention as wallAngleDeg) keeping p1
 * fixed and preserving the current length.
 */
export function setWallAngle(wall, angleDeg) {
  if (!wall) return wall;
  const len = Math.max(0.05, wallLength(wall));
  const rad = (Number(angleDeg) * Math.PI) / 180;
  const dir = { x: Math.sin(rad), y: Math.cos(rad) };
  const p1 = { x: num(wall.p1?.x), y: num(wall.p1?.y) };
  return {
    ...wall,
    p2: { x: p1.x + dir.x * len, y: p1.y + dir.y * len },
  };
}

/**
 * Move the entire wall by a delta, preserving length and angle.
 */
export function translateWall(wall, dx, dy) {
  if (!wall) return wall;
  return {
    ...wall,
    p1: { x: num(wall.p1?.x) + dx, y: num(wall.p1?.y) + dy },
    p2: { x: num(wall.p2?.x) + dx, y: num(wall.p2?.y) + dy },
  };
}

/**
 * Move a single endpoint by a delta.
 * which: 'p1' | 'p2'
 */
export function translateEndpoint(wall, which, dx, dy) {
  if (!wall) return wall;
  const key = which === 'p1' ? 'p1' : 'p2';
  const pt = wall[key] || { x: 0, y: 0 };
  return {
    ...wall,
    [key]: { x: num(pt.x) + dx, y: num(pt.y) + dy },
  };
}

/**
 * Set an endpoint to an absolute position.
 * which: 'p1' | 'p2'
 */
export function setEndpoint(wall, which, x, y) {
  if (!wall) return wall;
  const key = which === 'p1' ? 'p1' : 'p2';
  return {
    ...wall,
    [key]: { x: Number(x), y: Number(y) },
  };
}

/**
 * Clamp an endpoint into the room interior, leaving a tiny margin so the
 * grab handle stays visible at the room boundary.
 */
export function clampEndpointToRoom(x, y, widthM, lengthM, margin = 0.005) {
  return {
    x: Math.max(margin, Math.min(Number(widthM) - margin, Number(x))),
    y: Math.max(margin, Math.min(Number(lengthM) - margin, Number(y))),
  };
}

/**
 * Magnetic snapping for an endpoint. Returns the snapped { x, y } and the
 * list of snap targets that were within tolerance (for visual indication).
 *
 * Targets:
 *   - Room boundaries: x = 0, x = widthM, y = 0, y = lengthM
 *   - Other Custom Wall endpoints (from all walls except the one being edited)
 *
 * Only snaps within SNAP_TOLERANCE_M (5 cm). Outside tolerance the original
 * position is returned unchanged with an empty snap list.
 */
export function snapEndpoint(x, y, { widthM, lengthM, otherEndpoints = [] } = {}) {
  const px = Number(x);
  const py = Number(y);
  const snaps = [];
  const tol = SNAP_TOLERANCE_M;

  // Room boundaries
  const W = Number(widthM);
  const L = Number(lengthM);
  let sx = px;
  let sy = py;

  const candidates = [];
  if (Number.isFinite(W)) {
    candidates.push({ axis: 'x', value: 0, kind: 'wall-left' });
    candidates.push({ axis: 'x', value: W, kind: 'wall-right' });
  }
  if (Number.isFinite(L)) {
    candidates.push({ axis: 'y', value: 0, kind: 'wall-front' });
    candidates.push({ axis: 'y', value: L, kind: 'wall-rear' });
  }
  for (const c of candidates) {
    if (c.axis === 'x' && Math.abs(px - c.value) <= tol) {
      snaps.push({ axis: 'x', value: c.value, kind: c.kind });
    } else if (c.axis === 'y' && Math.abs(py - c.value) <= tol) {
      snaps.push({ axis: 'y', value: c.value, kind: c.kind });
    }
  }
  // Other Custom Wall endpoints
  for (const ep of otherEndpoints) {
    if (!ep) continue;
    const ex = Number(ep.x);
    const ey = Number(ep.y);
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
    if (Math.abs(px - ex) <= tol && Math.abs(py - ey) <= tol) {
      snaps.push({ axis: 'point', value: { x: ex, y: ey }, kind: 'endpoint' });
    }
  }

  // Apply the best snap per axis: nearest within tolerance wins.
  if (snaps.length > 0) {
    for (const s of snaps) {
      if (s.axis === 'x' && Math.abs(px - s.value) <= tol) sx = s.value;
      if (s.axis === 'y' && Math.abs(py - s.value) <= tol) sy = s.value;
      if (s.axis === 'point') {
        sx = s.value.x;
        sy = s.value.y;
      }
    }
  }

  return { x: sx, y: sy, snaps };
}

/**
 * Collect all endpoints from a list of Custom Walls, excluding one wall id.
 * Returns [{ x, y }] in metres.
 */
export function collectOtherEndpoints(walls, excludeId) {
  if (!Array.isArray(walls)) return [];
  const out = [];
  for (const w of walls) {
    if (!w || w.type !== CUSTOM_WALL_TYPE) continue;
    if (excludeId && String(w.id) === String(excludeId)) continue;
    if (w.p1) out.push({ x: num(w.p1.x), y: num(w.p1.y) });
    if (w.p2) out.push({ x: num(w.p2.x), y: num(w.p2.y) });
  }
  return out;
}

/**
 * Distance from a point to a line segment (p1, p2) in metres.
 */
export function distancePointToSegment(px, py, p1, p2) {
  const ax = num(p1?.x);
  const ay = num(p1?.y);
  const bx = num(p2?.x);
  const by = num(p2?.y);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > EPS ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

/**
 * Does a speaker position intersect the rotated wall footprint?
 * Uses the distance from the speaker centre to the wall centreline, compared
 * to half the wall thickness plus half the speaker footprint dimension. This
 * is a conservative axis-free check using the perpendicular distance.
 *
 * speakerDims: { widthM, depthM } — the speaker cabinet footprint.
 * marginM: extra clearance (default 0).
 *
 * Returns true only when restriction === 'on'.
 */
export function speakerIntersectsWall(wall, speaker, speakerDims = {}, marginM = 0) {
  if (!wall || !speaker?.position) return false;
  if (wall.restriction !== 'on') return false;
  const sx = Number(speaker.position.x);
  const sy = Number(speaker.position.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return false;
  const dist = distancePointToSegment(sx, sy, wall.p1, wall.p2);
  const halfT = Math.max(0.02, num(wall.thickness_m, DEFAULT_THICKNESS_M)) / 2;
  const sw = Math.max(0.01, Number(speakerDims?.widthM) || 0.2);
  const sd = Math.max(0.01, Number(speakerDims?.depthM) || 0.2);
  const halfFootprint = Math.max(sw, sd) / 2;
  return dist <= halfT + halfFootprint + marginM;
}

/**
 * Given all placed speakers and all custom walls (with restriction on),
 * return the set of speaker selection keys that intersect any restricted wall.
 * Pure: does not move or modify any speaker.
 */
export function speakersClashingWalls(speakers, walls, getModelDimsM) {
  const out = new Set();
  if (!Array.isArray(speakers) || !Array.isArray(walls)) return out;
  const restricted = walls.filter((w) => w?.type === CUSTOM_WALL_TYPE && w.restriction === 'on');
  if (restricted.length === 0) return out;
  for (const sp of speakers) {
    if (!sp?.position) continue;
    const dims = getModelDimsM?.(sp.model) || {};
    const key = sp.id || sp.role;
    if (!key) continue;
    for (const w of restricted) {
      if (speakerIntersectsWall(w, sp, dims)) {
        out.add(String(key));
        break;
      }
    }
  }
  return out;
}

/**
 * True if a value is a Custom Wall element.
 */
export function isCustomWall(el) {
  return !!el && el.type === CUSTOM_WALL_TYPE;
}