/**
 * p1BoundaryGeometry
 * ------------------
 * Pure 2D geometry utilities for RP22 Parameter 1 boundary distance.
 *
 * Computes the distance from a listener head point to:
 *   1. the four finite room-wall segments (left / right / front / rear)
 *   2. already-resolved speaker or subwoofer footprint polygons (baffles)
 *
 * This helper does NOT resolve products, roles, dimensions or positions.
 * It receives resolved polygons as input. It does not grade the result.
 *
 * Distance method: Euclidean point-to-segment distance.
 *   - For a polygon: returns 0 when the point lies inside it, otherwise the
 *     minimum distance to its finite edges. Rotated polygons are supported
 *     directly (no axis-aligned bounding-box reduction).
 *   - Before measuring an obstacle, its polygon is clipped to the room
 *     rectangle [0..widthM] x [0..lengthM] (Sutherland–Hodgman).
 */

/**
 * Euclidean distance from a point (px,py) to a finite segment (ax,ay)-(bx,by).
 */
export function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment (a single point)
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // Project point onto the line, clamp parameter t to [0,1]
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Point-in-polygon test (ray casting / even-odd rule).
 * Works for any simple polygon — rotated, convex or concave.
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Sutherland–Hodgman clipping of a polygon against the room rectangle.
 * Clips sequentially against x>=0, x<=widthM, y>=0, y<=lengthM.
 */
export function clipPolygonToRect(polygon, widthM, lengthM) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [];

  const clipPlanes = [
    { axis: "x", limit: 0, minSide: true },       // x >= 0
    { axis: "x", limit: widthM, minSide: false },  // x <= widthM
    { axis: "y", limit: 0, minSide: true },        // y >= 0
    { axis: "y", limit: lengthM, minSide: false }, // y <= lengthM
  ];

  let output = polygon.map((p) => ({ x: Number(p.x), y: Number(p.y) }));

  for (const plane of clipPlanes) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    const { axis, limit, minSide } = plane;
    const otherAxis = axis === "x" ? "y" : "x";
    const inside = (v) => (minSide ? v >= limit : v <= limit);

    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i - 1 + input.length) % input.length];
      const curIn = inside(cur[axis]);
      const prevIn = inside(prev[axis]);

      if (curIn) {
        if (!prevIn) {
          output.push(intersectAxis(prev, cur, axis, otherAxis, limit));
        }
        output.push(cur);
      } else if (prevIn) {
        output.push(intersectAxis(prev, cur, axis, otherAxis, limit));
      }
    }
  }

  return output;
}

function intersectAxis(a, b, axis, otherAxis, limit) {
  const da = b[axis] - a[axis];
  const t = da === 0 ? 0 : (limit - a[axis]) / da;
  const point = { [axis]: limit };
  point[otherAxis] = a[otherAxis] + t * (b[otherAxis] - a[otherAxis]);
  return point;
}

/**
 * Minimum Euclidean distance from a point to a polygon's finite edges.
 * Returns 0 when the point lies inside the polygon.
 */
export function pointToPolygonDistance(px, py, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return Infinity;
  if (pointInPolygon(px, py, polygon)) return 0;
  let minD = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const d = pointToSegmentDistance(px, py, a.x, a.y, b.x, b.y);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Compute the nearest boundary distance from a listener point to room walls
 * and resolved obstacle (baffle) footprint polygons.
 *
 * @param {Object} input
 * @param {{x:number,y:number}} input.point - listener head point (room coords)
 * @param {{widthM:number,lengthM:number}} input.room - room rectangle
 * @param {Array<{id,role,polygon:Array<{x,y}>}>} [input.obstacles] - resolved footprints
 * @returns {{distanceM:number|null, nearestKind:string|null, nearestId:string|null, nearestRole:string|null, nearestBoundary:string|null, valid:boolean}}
 */
export function nearestBoundaryDistance({ point, room, obstacles = [] }) {
  const px = Number(point?.x);
  const py = Number(point?.y);
  const w = Number(room?.widthM);
  const l = Number(room?.lengthM);

  if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !Number.isFinite(w) ||
    !Number.isFinite(l) ||
    w <= 0 ||
    l <= 0
  ) {
    return {
      distanceM: null,
      nearestKind: null,
      nearestId: null,
      nearestRole: null,
      nearestBoundary: null,
      valid: false,
    };
  }

  // Room walls as finite segments
  const walls = [
    { id: "wall-left", role: "wall", boundary: "left", ax: 0, ay: 0, bx: 0, by: l },
    { id: "wall-right", role: "wall", boundary: "right", ax: w, ay: 0, bx: w, by: l },
    { id: "wall-front", role: "wall", boundary: "front", ax: 0, ay: 0, bx: w, by: 0 },
    { id: "wall-rear", role: "wall", boundary: "rear", ax: 0, ay: l, bx: w, by: l },
  ];

  let best = {
    distanceM: Infinity,
    nearestKind: null,
    nearestId: null,
    nearestRole: null,
    nearestBoundary: null,
  };

  // Walls
  for (const wall of walls) {
    const d = pointToSegmentDistance(px, py, wall.ax, wall.ay, wall.bx, wall.by);
    if (d < best.distanceM) {
      best = {
        distanceM: d,
        nearestKind: "wall",
        nearestId: wall.id,
        nearestRole: wall.role,
        nearestBoundary: wall.boundary,
      };
    }
  }

  // Obstacles (baffles) — clip to room before measuring
  if (Array.isArray(obstacles)) {
    for (const obs of obstacles) {
      if (!obs || !Array.isArray(obs.polygon) || obs.polygon.length < 3) continue;
      const clipped = clipPolygonToRect(obs.polygon, w, l);
      if (clipped.length < 3) continue; // fully outside the room — dropped

      const d = pointToPolygonDistance(px, py, clipped);
      if (d < best.distanceM) {
        best = {
          distanceM: d,
          nearestKind: "baffle",
          nearestId: obs.id,
          nearestRole: obs.role,
          nearestBoundary: null,
        };
      }
    }
  }

  return {
    distanceM: Number.isFinite(best.distanceM) ? best.distanceM : null,
    nearestKind: best.nearestKind,
    nearestId: best.nearestId,
    nearestRole: best.nearestRole,
    nearestBoundary: best.nearestBoundary,
    valid: true,
  };
}

export default nearestBoundaryDistance;