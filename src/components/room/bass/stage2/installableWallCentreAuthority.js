// installableWallCentreAuthority.js
//
// Converts wall-boundary subwoofer family coordinates (normalised xNorm/yNorm
// on the front/rear wall plane) into physically installable CABINET CENTRES
// before the source reaches the acoustic simulation. A cabinet mounted to a
// wall has finite depth: its acoustic centre sits half the depth inside the
// room plus the existing wall buffer, never on the wall plane itself.
//
// This authority is purely geometric. It performs no acoustic maths, no
// ranking, no primary-seat safety and no practicality decision — it returns
// the exact cabinet-centre coordinates the acoustic engine must evaluate, and
// the wall identity (front/rear) the placement was authored for. The exact
// coordinates evaluated here are the coordinates later offered to the user:
// there is no post-evaluation movement.
//
// The clearance/buffer used is the existing room wall-buffer constant, shared
// with the placement engine so the cabinet's front face lands exactly where
// the placement engine already assumes a cabinet front face sits.

import { getCabinetDepthM, WALL_BUFFER_M } from "@/components/utils/subwooferInstanceMigration";

/**
 * Resolve the physical wall a normalised yNorm coordinate belongs to.
 * yNorm = 0 → front wall; yNorm = 1 → rear wall; 0 < yNorm < 1 is off-wall
 * (the caller should never pass an off-wall point here, but the function is
 * total and returns null rather than throwing).
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
 * Convert one wall-boundary normalised position into the physically
 * installable cabinet centre, in metres, inside the room.
 *
 * Front wall:  centreY = clearance + depth/2
 * Rear wall:   centreY = roomLength - clearance - depth/2
 * The X coordinate is independent of the wall and passes straight through
 * (xNorm * roomWidth).
 *
 * The cabinet depth is resolved canonically through getCabinetDepthM, which
 * normalises the model key (so "SUB3-12" and "sub3-12" share one depth). A
 * caller may override the depth explicitly (cabinetDepthM) for tests or for a
 * source model the registry does not yet carry; the override is the only
 * non-canonical path and is never used by the production Stage 2 evaluation.
 *
 * @param {object} args
 * @param {{widthM:number,lengthM:number,heightM:number}} args.roomDims
 * @param {number} args.xNorm  0..1 across the wall
 * @param {number} args.yNorm  0 = front wall, 1 = rear wall
 * @param {string} [args.modelKey]  canonical subwoofer model key
 * @param {number} [args.cabinetDepthM]  explicit override (metres)
 * @returns {{x:number,y:number,mountingWall:"front"|"rear",cabinetDepthM:number,clearanceUsed:number}}
 */
export function resolveInstallableWallCentre({
  roomDims,
  xNorm,
  yNorm,
  modelKey = null,
  cabinetDepthM = null,
}) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0) throw new Error("resolveInstallableWallCentre: invalid room width");
  if (!Number.isFinite(L) || L <= 0) throw new Error("resolveInstallableWallCentre: invalid room length");

  const wall = mountingWallFromYNorm(yNorm);
  if (wall === null) {
    throw new Error(`resolveInstallableWallCentre: yNorm ${yNorm} is not a wall-boundary (0 or 1)`);
  }

  // Canonical cabinet depth, resolved through the registry so the model key's
  // casing never changes the geometry. The explicit override is honoured only
  // when it is a positive finite number.
  const depthM = Number.isFinite(cabinetDepthM) && cabinetDepthM > 0
    ? cabinetDepthM
    : getCabinetDepthM(modelKey);
  const halfDepth = depthM / 2;

  const x = Number(xNorm) * W;
  const y = wall === "front"
    ? WALL_BUFFER_M + halfDepth
    : L - WALL_BUFFER_M - halfDepth;

  return {
    x,
    y,
    mountingWall: wall,
    cabinetDepthM: depthM,
    clearanceUsed: WALL_BUFFER_M,
  };
}