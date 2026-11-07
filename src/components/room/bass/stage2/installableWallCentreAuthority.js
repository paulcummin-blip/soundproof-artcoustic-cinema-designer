// installableWallCentreAuthority.js
//
// The single geometric authority that resolves a subwoofer placement
// coordinate into the physical CABINET CENTRE the acoustic engine must
// evaluate, and validates the full cabinet volume stays inside the room.
//
// A candidate coordinate carries an EXPLICIT coordinate meaning
// (coordinateSpace), so the domain is never inferred from whether a
// normalised value happens to sit near 0 or 1:
//
//   WALL_REFERENCE  — xNorm/yNorm describe a point on a wall plane
//                     (xNorm = 0 left wall, 1 right wall; yNorm = 0 front
//                     wall, 1 rear wall; a corner is two walls at once).
//                     A finite-width/depth cabinet is resolved ONCE into a
//                     physical centre inside the room: the cabinet's near
//                     face keeps the shared wall buffer, so the centre sits
//                     half the cabinet extent inside the room plus the
//                     buffer. This conversion happens exactly once.
//
//   CABINET_CENTRE  — xNorm/yNorm (or x/y) are ALREADY the physical cabinet
//                     centre. They are used directly. They must NOT be run
//                     through wall-boundary conversion again.
//
// This authority is purely geometric. It performs no acoustic maths, no
// ranking, no primary-seat safety and no practicality decision. The exact
// coordinates it returns are the coordinates later offered to the user:
// there is no post-evaluation movement.
//
// The clearance/buffer used is the existing room wall-buffer constant, shared
// with the placement engine so a wall-mounted cabinet's near face lands
// exactly where the placement engine already assumes a cabinet face sits.

import { getCabinetDepthM, getCabinetWidthM, WALL_BUFFER_M } from "@/components/utils/subwooferInstanceMigration";

/** Explicit coordinate-domain contract for every Stage 2 candidate. */
export const COORDINATE_SPACE = Object.freeze({
  WALL_REFERENCE: "wall_reference",
  CABINET_CENTRE: "cabinet_centre",
});

/**
 * Resolve the physical wall a normalised yNorm coordinate belongs to.
 * yNorm = 0 -> front wall; yNorm = 1 -> rear wall; off-wall -> null.
 * @param {number} yNorm
 * @returns {"front"|"rear"|null}
 */
export function mountingWallFromYNorm(yNorm) {
  const y = Number(yNorm);
  if (!Number.isFinite(y)) return null;
  if (y <= 0) return "front";
  if (y >= 1) return "rear";
  return null;
}

/**
 * The walls a WALL-REFERENCE normalised point sits on. A point is a wall
 * reference when xNorm is 0 or 1 (left/right wall) OR yNorm is 0 or 1
 * (front/rear wall). A corner is two walls at once. A point on no wall at
 * all is genuinely off-wall and is not a wall reference.
 */
function wallRefsFromNorms(xNorm, yNorm) {
  const x = Number(xNorm);
  const y = Number(yNorm);
  const onLeft = Number.isFinite(x) && x <= 0;
  const onRight = Number.isFinite(x) && x >= 1;
  const onFront = Number.isFinite(y) && y <= 0;
  const onRear = Number.isFinite(y) && y >= 1;
  return { onLeft, onRight, onFront, onRear, onXWall: onLeft || onRight, onYWall: onFront || onRear };
}

/**
 * Whether a normalised point sits on a wall boundary (xNorm 0/1 or yNorm 0/1).
 * A point on a wall is a WALL_REFERENCE Stage 2 offsets into the room; a point
 * off every wall is an inset CABINET_CENTRE used directly. This is the single
 * test the Stage 1 finalist builder uses to stamp each source's
 * coordinateSpace — the domain is explicit, never inferred from whether a
 * value happens to sit near 0 or 1 after the fact.
 *
 * @param {number} xNorm
 * @param {number} yNorm
 * @returns {boolean}
 */
export function isWallReferencePoint(xNorm, yNorm) {
  const refs = wallRefsFromNorms(xNorm, yNorm);
  return refs.onXWall || refs.onYWall;
}

/**
 * Convert one WALL-REFERENCE normalised position into the physically
 * installable cabinet centre, in metres, inside the room. This is the ONE
 * conversion from wall reference to cabinet centre.
 *
 * Front wall (yNorm=0):  centreY = buffer + depth/2
 * Rear wall  (yNorm=1):  centreY = roomLength - buffer - depth/2
 * Left wall  (xNorm=0):  centreX = buffer + width/2
 * Right wall (xNorm=1):  centreX = roomWidth - buffer - width/2
 * A point along the front/rear wall (0<xNorm<1): centreX = xNorm * roomWidth
 * A point along a side wall   (0<yNorm<1): centreY = yNorm * roomLength
 * A corner applies BOTH the width and depth offsets.
 *
 * The cabinet depth and width are resolved canonically through the registry
 * (so "SUB3-12" and "sub3-12" share one dimension). A caller may override
 * either dimension explicitly for tests or for a source model the registry
 * does not yet carry; the override is the only non-canonical path.
 *
 * @param {object} args
 * @param {{widthM:number,lengthM:number,heightM:number}} args.roomDims
 * @param {number} args.xNorm  0..1 across the room (0 = left wall, 1 = right wall)
 * @param {number} args.yNorm  0 = front wall, 1 = rear wall
 * @param {string} [args.modelKey]  canonical subwoofer model key
 * @param {number} [args.cabinetDepthM]  explicit depth override (metres)
 * @param {number} [args.cabinetWidthM]  explicit width override (metres)
 * @returns {{x:number,y:number,mountingWall:"front"|"rear"|"left"|"right"|null,mountingWalls:string[],cabinetDepthM:number,cabinetWidthM:number,clearanceUsed:number}}
 */
export function resolveInstallableWallCentre({
  roomDims,
  xNorm,
  yNorm,
  modelKey = null,
  cabinetDepthM = null,
  cabinetWidthM = null,
  orientation = null,
}) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0) throw new Error("resolveInstallableWallCentre: invalid room width");
  if (!Number.isFinite(L) || L <= 0) throw new Error("resolveInstallableWallCentre: invalid room length");
  if (!Number.isFinite(Number(xNorm))) throw new Error("resolveInstallableWallCentre: invalid xNorm");
  if (!Number.isFinite(Number(yNorm))) throw new Error("resolveInstallableWallCentre: invalid yNorm");

  const refs = wallRefsFromNorms(xNorm, yNorm);
  if (!refs.onXWall && !refs.onYWall) {
    throw new Error(
      `resolveInstallableWallCentre: (${xNorm},${yNorm}) is not a wall-boundary reference (xNorm must be 0 or 1, or yNorm must be 0 or 1)`,
    );
  }

  const depthM = Number.isFinite(cabinetDepthM) && cabinetDepthM > 0
    ? cabinetDepthM
    : getCabinetDepthM(modelKey);
  const widthM = Number.isFinite(cabinetWidthM) && cabinetWidthM > 0
    ? cabinetWidthM
    : getCabinetWidthM(modelKey, orientation);
  const halfDepth = depthM / 2;
  const halfWidth = widthM / 2;

  // X: a left/right wall reference offsets by width/2 + buffer; a point along
  // the front/rear wall passes straight through (xNorm * roomWidth).
  let x;
  if (refs.onLeft) x = WALL_BUFFER_M + halfWidth;
  else if (refs.onRight) x = W - WALL_BUFFER_M - halfWidth;
  else x = Number(xNorm) * W;

  // Y: a front/rear wall reference offsets by depth/2 + buffer; a point along
  // a side wall passes straight through (yNorm * roomLength).
  let y;
  if (refs.onFront) y = WALL_BUFFER_M + halfDepth;
  else if (refs.onRear) y = L - WALL_BUFFER_M - halfDepth;
  else y = Number(yNorm) * L;

  const mountingWalls = [
    refs.onFront && "front",
    refs.onRear && "rear",
    refs.onLeft && "left",
    refs.onRight && "right",
  ].filter(Boolean);
  // Primary mounting wall preserves the front/rear identity the delay split
  // reads; a pure side-wall placement reports its side wall.
  const mountingWall = refs.onFront
    ? "front"
    : refs.onRear
      ? "rear"
      : refs.onLeft
        ? "left"
        : refs.onRight
          ? "right"
          : null;

  return {
    x,
    y,
    mountingWall,
    mountingWalls,
    cabinetDepthM: depthM,
    cabinetWidthM: widthM,
    clearanceUsed: WALL_BUFFER_M,
  };
}

/**
 * Resolve a candidate coordinate into the physical cabinet centre, branching
 * on the EXPLICIT coordinateSpace. This is the single entry point the Stage 2
 * acoustic builder uses, so a wall reference is converted exactly once and a
 * cabinet centre is never re-converted.
 *
 * A missing or unrecognised coordinateSpace is a genuinely malformed payload:
 * it throws rather than being silently reinterpreted as a wall reference.
 *
 * @param {object} args
 * @param {{widthM:number,lengthM:number,heightM:number}} args.roomDims
 * @param {number} args.xNorm
 * @param {number} args.yNorm
 * @param {string} args.coordinateSpace  one of COORDINATE_SPACE
 * @param {string} [args.modelKey]
 * @param {number} [args.cabinetDepthM]
 * @param {number} [args.cabinetWidthM]
 * @returns {{x:number,y:number,mountingWall:string|null,mountingWalls:string[],cabinetDepthM:number,cabinetWidthM:number,clearanceUsed:number|null,coordinateSpace:string}}
 */
export function resolveCabinetCentre({
  roomDims,
  xNorm,
  yNorm,
  coordinateSpace,
  modelKey = null,
  cabinetDepthM = null,
  cabinetWidthM = null,
  orientation = null,
}) {
  const space = String(coordinateSpace ?? "");
  if (space !== COORDINATE_SPACE.WALL_REFERENCE && space !== COORDINATE_SPACE.CABINET_CENTRE) {
    throw new Error(`resolveCabinetCentre: missing or invalid coordinateSpace '${coordinateSpace ?? ""}'`);
  }
  if (!Number.isFinite(Number(xNorm)) || !Number.isFinite(Number(yNorm))) {
    throw new Error("resolveCabinetCentre: non-finite coordinate");
  }
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0) throw new Error("resolveCabinetCentre: invalid room width");
  if (!Number.isFinite(L) || L <= 0) throw new Error("resolveCabinetCentre: invalid room length");

  const depthM = Number.isFinite(cabinetDepthM) && cabinetDepthM > 0
    ? cabinetDepthM
    : getCabinetDepthM(modelKey);
  const widthM = Number.isFinite(cabinetWidthM) && cabinetWidthM > 0
    ? cabinetWidthM
    : getCabinetWidthM(modelKey, orientation);

  if (space === COORDINATE_SPACE.WALL_REFERENCE) {
    return {
      ...resolveInstallableWallCentre({ roomDims, xNorm, yNorm, modelKey, cabinetDepthM, cabinetWidthM, orientation }),
      coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE,
    };
  }

  // CABINET_CENTRE: already the physical centre. Use directly, no wall offset.
  const x = Number(xNorm) * W;
  const y = Number(yNorm) * L;
  const refs = wallRefsFromNorms(xNorm, yNorm);
  const mountingWall = refs.onFront
    ? "front"
    : refs.onRear
      ? "rear"
      : refs.onLeft
        ? "left"
        : refs.onRight
          ? "right"
          : null;
  return {
    x,
    y,
    mountingWall,
    mountingWalls: mountingWall ? [mountingWall] : [],
    cabinetDepthM: depthM,
    cabinetWidthM: widthM,
    clearanceUsed: null,
    coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE,
  };
}

/**
 * Validate that a resolved cabinet centre keeps the FULL cabinet volume
 * inside the room on all four walls. This is the physical-boundary safety
 * net run after coordinate resolution. A cabinet that cannot fit is a
 * terminal physical rejection, never an acoustic evaluation.
 *
 * All four walls use the same existing wall-buffer clearance; there is no
 * separate side-clearance constant.
 *
 * @param {object} args
 * @param {{x:number,y:number}} args.centre  resolved cabinet centre (metres)
 * @param {{widthM:number,lengthM:number}} args.roomDims
 * @param {number} args.cabinetWidthM
 * @param {number} args.cabinetDepthM
 * @param {number} [args.bufferM]  defaults to WALL_BUFFER_M
 * @returns {{valid:boolean,violations:string[]}}
 */
export function validateCabinetBoundary({
  centre,
  roomDims,
  cabinetWidthM,
  cabinetDepthM,
  bufferM = WALL_BUFFER_M,
}) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  const x = Number(centre?.x);
  const y = Number(centre?.y);
  const halfW = Number(cabinetWidthM) / 2;
  const halfD = Number(cabinetDepthM) / 2;
  const eps = 1e-9;
  const violations = [];
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
    violations.push("invalid-room");
    return { valid: false, violations };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(halfW) || !Number.isFinite(halfD)) {
    violations.push("invalid-centre");
    return { valid: false, violations };
  }
  if (x < halfW + bufferM - eps) violations.push("left-wall-intersection");
  if (x > W - halfW - bufferM + eps) violations.push("right-wall-intersection");
  if (y < halfD + bufferM - eps) violations.push("front-wall-intersection");
  if (y > L - halfD - bufferM + eps) violations.push("rear-wall-intersection");
  return { valid: violations.length === 0, violations };
}

/**
 * Validate that no two resolved cabinets physically overlap. Two cabinets
 * overlap only when their footprints intersect in ALL three dimensions (X
 * width, Y depth, Z height) — cabinets at different heights do not collide
 * even when their floor footprints coincide. Each cabinet's extents come
 * from the authoritative cabinet geometry already resolved by
 * resolveCabinetCentre (cabinetWidthM, cabinetDepthM) and the cabinet
 * height resolved by the source builder (cabinetHeightM), evaluated at the
 * cabinet-centre coordinates the acoustic engine used.
 *
 * Touching (distance exactly equal to the sum of half-extents) is allowed;
 * only a genuine intersection is rejected. A small tolerance avoids
 * flagging floating-point touching as an overlap.
 *
 * @param {object} args
 * @param {Array} args.sources — resolved sources with x, y, z,
 *   cabinetWidthM, cabinetDepthM, cabinetHeightM
 * @param {number} [args.toleranceM] — overlap tolerance in metres (default 1mm)
 * @returns {{ valid: boolean, violations: Array }}
 */
export function validateCabinetOverlap({ sources, toleranceM = 0.001 }) {
  const list = Array.isArray(sources) ? sources : [];
  const violations = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const ax = Number(a?.x), ay = Number(a?.y), az = Number(a?.z);
      const bx = Number(b?.x), by = Number(b?.y), bz = Number(b?.z);
      const aw = Number(a?.cabinetWidthM), ad = Number(a?.cabinetDepthM), ah = Number(a?.cabinetHeightM);
      const bw = Number(b?.cabinetWidthM), bd = Number(b?.cabinetDepthM), bh = Number(b?.cabinetHeightM);
      // Skip a pair whose geometry is incomplete — it cannot be judged and
      // must not produce a false overlap rejection.
      if (![ax, ay, az, bx, by, bz, aw, ad, ah, bw, bd, bh].every(Number.isFinite)) continue;
      const dx = Math.abs(ax - bx);
      const dy = Math.abs(ay - by);
      const dz = Math.abs(az - bz);
      const overlapX = dx < (aw / 2 + bw / 2 - toleranceM);
      const overlapY = dy < (ad / 2 + bd / 2 - toleranceM);
      const overlapZ = dz < (ah / 2 + bh / 2 - toleranceM);
      if (overlapX && overlapY && overlapZ) {
        violations.push({
          pair: [i, j],
          centreDistanceM: { x: dx, y: dy, z: dz },
          minSeparationM: { x: aw / 2 + bw / 2, y: ad / 2 + bd / 2, z: ah / 2 + bh / 2 },
          reason: "cabinet-overlap",
        });
      }
    }
  }
  return { valid: violations.length === 0, violations };
}