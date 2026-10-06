/**
 * buildSeatDimensionInfo
 *
 * The single source of the seat proximity-dimension payload: nearest side wall
 * plus nearest front/back wall, measured from the seat's stored centre.
 *
 * Extracted so that the seat drag guide and the press-and-hold dimensional mode
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

export default buildSeatDimensionInfo;