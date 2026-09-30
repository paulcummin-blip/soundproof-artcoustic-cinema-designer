// abfuserTreatmentZones.js
// --------------------------------
// GEOMETRY ONLY: derives WHERE Abfuser panels can usefully be placed from actual
// room geometry, speaker positions and seating positions (image-source method).
//
// There is no quantity authority in this module. How many panels are
// recommended is decided by the ADI strategic engine
// (adiAbfuserRecommendation.js), which is the only recommendation authority.
//
// A treatment zone represents the extent of wall where panels can usefully sit,
// not an instruction to cover the entire zone continuously.

export const ZONE_DEPTH_M = 0.12; // plan-view band thickness (visual only)
const ZONE_PADDING_M = 0.20; // padding added to each end of a derived zone
const REAR_MARGIN_M = 0.20; // margin outside the seating envelope for the rear zone
const ROW_CLUSTER_TOLERANCE_M = 0.8; // seat-Y grouping tolerance when rows are unnamed
export const REAR_NEAR_DISTANCE_M = 1.5; // "normal domestic cinema distance" to the rear wall

function getFrontSpeakers(placedSpeakers) {
  if (!Array.isArray(placedSpeakers)) return [];
  return placedSpeakers.filter((s) => {
    const role = s?.role || s?.label;
    return role === "FL" || role === "FC" || role === "FR";
  });
}

function getSeats(seatingPositions) {
  if (!Array.isArray(seatingPositions)) return [];
  return seatingPositions
    .map((s) => ({
      x: Number(s?.x ?? s?.position?.x),
      y: Number(s?.y ?? s?.position?.y),
    }))
    .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
}

function getSpeakerPos(s) {
  const x = Number(s?.position?.x ?? s?.x);
  const y = Number(s?.position?.y ?? s?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * Image-source side-wall reflection Y.
 * Mirrors the source across the wall and finds where mirror→listener crosses it.
 * Returns null if the reflection is not between source and listener.
 */
function sideWallReflectionY(src, listener, wallX, isLeftWall) {
  const mirrorX = isLeftWall ? -src.x : 2 * wallX - src.x;
  const dx = listener.x - mirrorX;
  if (Math.abs(dx) < 1e-6) return null;
  const t = (wallX - mirrorX) / dx;
  if (t < 0 || t > 1) return null;
  return src.y + t * (listener.y - src.y);
}

/**
 * Number of seating rows: explicit rowNumber when present, otherwise derived by
 * clustering seat Y positions. Always at least 1 when seats exist.
 */
export function deriveSeatRowCount(seatingPositions) {
  const seats = getSeats(seatingPositions);
  if (seats.length === 0) return 0;

  const explicit = new Set();
  for (const seat of Array.isArray(seatingPositions) ? seatingPositions : []) {
    const row = Number(seat?.rowNumber);
    if (Number.isFinite(row) && row > 0) explicit.add(Math.round(row));
  }
  if (explicit.size > 0) return explicit.size;

  const ys = seats.map((s) => s.y).sort((a, b) => a - b);
  let rows = 1;
  for (let i = 1; i < ys.length; i += 1) {
    if (Math.abs(ys[i] - ys[i - 1]) > ROW_CLUSTER_TOLERANCE_M) rows += 1;
  }
  return rows;
}

/**
 * Compute the wall treatment zone extents from actual geometry.
 *
 * @param {Object} params
 * @param {Object} params.roomDims - { widthM, lengthM }
 * @param {Array}  params.placedSpeakers - speaker objects with role + position
 * @param {Array}  params.seatingPositions - seat objects with x, y
 * @returns {Object|null} zone geometry, or null if the room is invalid
 */
export function computeAbfuserTreatmentZones({ roomDims, placedSpeakers, seatingPositions }) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || widthM <= 0 || lengthM <= 0) {
    return null;
  }

  const frontSpeakers = getFrontSpeakers(placedSpeakers);
  const seats = getSeats(seatingPositions);

  // ── Side reflection zones (image-source method) ──
  const leftYs = [];
  const rightYs = [];

  for (const spk of frontSpeakers) {
    const src = getSpeakerPos(spk);
    if (!src) continue;
    for (const seat of seats) {
      const yLeft = sideWallReflectionY(src, seat, 0, true);
      if (Number.isFinite(yLeft) && yLeft >= 0 && yLeft <= lengthM) leftYs.push(yLeft);
      const yRight = sideWallReflectionY(src, seat, widthM, false);
      if (Number.isFinite(yRight) && yRight >= 0 && yRight <= lengthM) rightYs.push(yRight);
    }
  }

  // Fallback: nominal zone if no valid reflections (e.g. no speakers/seats)
  const useFallbackSide = leftYs.length === 0 && rightYs.length === 0;
  const leftMin = useFallbackSide ? lengthM * 0.2 : Math.min(...leftYs);
  const leftMax = useFallbackSide ? lengthM * 0.6 : Math.max(...leftYs);
  const rightMin = useFallbackSide ? lengthM * 0.2 : Math.min(...rightYs);
  const rightMax = useFallbackSide ? lengthM * 0.6 : Math.max(...rightYs);

  const leftStart = Math.max(0, leftMin - ZONE_PADDING_M);
  const leftEnd = Math.min(lengthM, leftMax + ZONE_PADDING_M);
  const rightStart = Math.max(0, rightMin - ZONE_PADDING_M);
  const rightEnd = Math.min(lengthM, rightMax + ZONE_PADDING_M);

  const leftLength = Math.max(0, leftEnd - leftStart);
  const rightLength = Math.max(0, rightEnd - rightStart);

  // ── Rear zone (from seating X envelope) ──
  let rearMinX;
  let rearMaxX;
  if (seats.length > 0) {
    const seatXs = seats.map((s) => s.x);
    rearMinX = Math.max(0, Math.min(...seatXs) - REAR_MARGIN_M);
    rearMaxX = Math.min(widthM, Math.max(...seatXs) + REAR_MARGIN_M);
  } else {
    rearMinX = widthM * 0.2;
    rearMaxX = widthM * 0.8;
  }
  const rearWidth = Math.max(0, rearMaxX - rearMinX);

  // ── Listening area and rear clearance ──
  let listeningAreaWidth = 0;
  let listeningAreaDepth = 0;
  let rearClearanceM = null;
  if (seats.length > 0) {
    const seatXs = seats.map((s) => s.x);
    const seatYs = seats.map((s) => s.y);
    listeningAreaWidth = Math.max(...seatXs) - Math.min(...seatXs);
    listeningAreaDepth = Math.max(...seatYs) - Math.min(...seatYs);
    rearClearanceM = Math.max(0, lengthM - Math.max(...seatYs));
  }

  return {
    leftZone: { start: leftStart, end: leftEnd, length: leftLength },
    rightZone: { start: rightStart, end: rightEnd, length: rightLength },
    rearZone: { minX: rearMinX, maxX: rearMaxX, width: rearWidth },
    zoneDepth: ZONE_DEPTH_M,
    listeningAreaWidth,
    listeningAreaDepth,
    rearClearanceM,
    seatRowCount: deriveSeatRowCount(seatingPositions),
    usedFallback: useFallbackSide,
  };
}