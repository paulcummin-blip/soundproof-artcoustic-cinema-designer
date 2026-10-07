/**
 * buildSeatDimensionInfo
 *
 * The single source of the seat proximity-dimension payload: nearest side wall
 * plus nearest front/back wall, measured from the seat's stored centre.
 *
 * Extracted so that the seat drag guide and the seat Dimensions-mode guide
 * render byte-identical measurements — activation changes, values never do.
 */

export function buildSeatDimensionInfo(seat, widthM, lengthM) {
  if (!seat) return null;

  const sx = Number(seat.x ?? seat.position?.x ?? 0);
  const sy = Number(seat.y ?? seat.position?.y ?? 0);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;

  const distLeft = sx;
  const distRight = Math.max(0, widthM - sx);
  const distFront = sy;
  const distRear = Math.max(0, lengthM - sy);

  return {
    visible: true,
    x: sx,
    y: sy,
    widthM,
    lengthM,
    side: distLeft < distRight ? 'left' : 'right',
    sideDist: Math.min(distLeft, distRight),
    vert: distFront < distRear ? 'front' : 'rear',
    vertDist: Math.min(distFront, distRear),
  };
}

/**
 * buildSeatWallMeasurements
 *
 * The Dimensions-mode payload for ONE seat, measured from that seat's own
 * listening position (never the seating block centre or the RSP):
 *
 *   1. nearest side wall
 *   2. rear wall
 *   3. the screen plane — the same authority the seat HUD shows, |seatY - screen
 *      plane Y|, so the plan and the HUD can never disagree.
 *
 * Same side-wall geometry as buildSeatDimensionInfo; only the selected seat is
 * ever built, so only one seat's measurements can be on screen at a time.
 */
export function buildSeatWallMeasurements(seat, { widthM, lengthM, screenFrontPlaneM } = {}) {
  if (!seat) return null;

  const sx = Number(seat.x ?? seat.position?.x ?? 0);
  const sy = Number(seat.y ?? seat.position?.y ?? 0);
  const w = Number(widthM);
  const l = Number(lengthM);
  if (![sx, sy, w, l].every(Number.isFinite)) return null;

  const distLeft = sx;
  const distRight = Math.max(0, w - sx);
  const screenY = Number(screenFrontPlaneM);
  const hasScreen = Number.isFinite(screenY);

  return {
    visible: true,
    x: sx,
    y: sy,
    widthM: w,
    lengthM: l,
    side: distLeft < distRight ? 'left' : 'right',
    sideDist: Math.min(distLeft, distRight),
    rearDist: Math.max(0, l - sy),
    screenPlaneM: hasScreen ? screenY : null,
    screenDist: hasScreen ? Math.abs(sy - screenY) : null,
  };
}

export default buildSeatDimensionInfo;