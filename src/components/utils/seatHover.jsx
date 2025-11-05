
import { computeScreenMetrics } from "./screenMetrics";

// --- New Pure Helper Functions ---

function seatToScreenDistanceM(seat, screen) {
  if (!seat || !screen || typeof seat.y !== 'number') return null;
  // Use floatDepthM for the screen plane position, with a fallback
  const screenPlaneY = screen.floatDepthM ?? 0.2;
  return Math.max(0.001, seat.y - screenPlaneY);
}

// --- Exported Calculation Functions ---

export function rp22P1NearestForSeat(seat, roomDims) {
  if (!seat || !roomDims || typeof seat.x !== 'number' || typeof seat.y !== 'number' || !roomDims.width || !roomDims.length) {
    return { nearestM: null, level: null, source: null };
  }

  const { x, y } = seat;
  const { width, length } = roomDims;

  const distances = {
    left: x,
    right: width - x,
    front: y,
    back: length - y,
  };

  const nearestM = Math.min(distances.left, distances.right, distances.front, distances.back);

  let level = 'L0';
  if (nearestM > 1.5) level = 'L4';
  else if (nearestM > 1.2) level = 'L3';
  else if (nearestM > 0.8) level = 'L2';
  else if (nearestM > 0.5) level = 'L1';
  
  let source = null;
  for (const [key, value] of Object.entries(distances)) {
    if (value === nearestM) {
      source = key;
      break;
    }
  }

  return { nearestM, level, source };
}

export function horizontalViewingAngleDeg(seat, screen) {
  if (!seat || !screen) return null;
  const d = seatToScreenDistanceM(seat, screen);
  if (d === null) return null;
  
  const { viewWm } = computeScreenMetrics(screen.visibleWidthInches, screen.aspectRatio);
  if (!viewWm) return null;

  const angle = 2 * Math.atan((viewWm / 2) / d) * (180 / Math.PI);
  return Number.isFinite(angle) ? angle : null;
}

export function verticalViewingAngleDeg(seat, screen) {
  if (!seat || !screen) return null;
  const d = seatToScreenDistanceM(seat, screen);
  if (d === null) return null;

  const { viewHm } = computeScreenMetrics(screen.visibleWidthInches, screen.aspectRatio);
  if (!viewHm) return null;

  const angle = 2 * Math.atan((viewHm / 2) / d) * (180 / Math.PI);
  return Number.isFinite(angle) ? angle : null;
}

export function rp22P1ForSeat(seat, roomDims) {
  if (!seat || !roomDims || typeof seat.x !== 'number' || typeof seat.y !== 'number' || !roomDims.width || !roomDims.length) {
    return { dsw: null, dbw: null, dmin: null, level: null };
  }

  const dsl = seat.x;
  const dsr = roomDims.width - seat.x;
  const dsw = Math.min(dsl, dsr);

  const dfw = seat.y;
  const dbw = roomDims.length - seat.y;

  const dmin = Math.min(dsw, dfw, dbw);

  let level = null;
  if (dmin > 1.5) level = "L4";
  else if (dmin > 1.2) level = "L3";
  else if (dmin > 0.8) level = "L2";
  else if (dmin > 0.5) level = "L1";

  return { dsw, dbw, dmin, level };
}

export function rp23HorizontalAngleForSeat(seat, screen) {
  if (!seat || !screen) return { angleDeg: null, level: null };

  const angleDeg = horizontalViewingAngleDeg(seat, screen);
  if (angleDeg === null) return { angleDeg: null, level: null };

  const levels = { L4: 50, L3: 45, L2: 40, L1: 33 };
  let level = null;
  if (angleDeg >= levels.L4) level = "L4";
  else if (angleDeg >= levels.L3) level = "L3";
  else if (angleDeg >= levels.L2) level = "L2";
  else if (angleDeg >= levels.L1) level = "L1";
  
  return { angleDeg, level };
}

// --- Existing Functions (Kept for compatibility if used elsewhere) ---

export function rp23LevelForSeat(seat, screen) {
  if (!seat || !screen) return { level: null, angle: null };
  const { viewWm } = computeScreenMetrics(screen.visibleWidthInches, screen.aspectRatio);
  const screenPlaneY = screen.floatDepthM ?? 0;
  const distance = Math.max(0.1, seat.y - screenPlaneY);
  const angle = 2 * Math.atan(viewWm / 2 / distance) * (180 / Math.PI);
  
  const levels = { L4: 50, L3: 45, L2: 40, L1: 33 };
  let level = 0;
  if (angle >= levels.L4) level = 4;
  else if (angle >= levels.L3) level = 3;
  else if (angle >= levels.L2) level = 2;
  else if (angle >= levels.L1) level = 1;
  return { level, angle: Number(angle.toFixed(1)) };
}

export function nearestWallDistanceM(seat, room) {
  if (!seat || !room) return null;
  const { x, y } = seat;
  const { width, length } = room;
  const dLeft = x;
  const dRight = width - x;
  const dBack = length - y;
  return Math.min(dLeft, dRight, dBack);
}

export function gradeWallClearance(distanceM = 0) {
  const d = Number(distanceM) || 0;
  if (d >= 1.5) return 4;
  if (d >= 1.2) return 3;
  if (d >= 0.8) return 2;
  if (d >= 0.5) return 1;
  return 0;
}

export function rp22P1Level(seat, room) {
  const dist = nearestWallDistanceM(seat, room);
  if (dist === null) return { level: null, distance: null };
  return { level: gradeWallClearance(dist), distance: dist };
}
