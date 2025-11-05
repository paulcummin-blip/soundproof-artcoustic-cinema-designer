// components/utils/rp23Viewing.js
// RP23 viewing-angle utilities (video recommended practice)

// ---------- tiny helpers ----------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function inchesToMeters(inches) {
  return isNum(inches) ? inches * 0.0254 : 0;
}
export function cmToMeters(cm) {
  return isNum(cm) ? cm / 100 : 0;
}

// ---------- viewing width helpers ----------
/**
 * Returns the *visible* screen width in meters.
 * Prefers `screen.visibleWidthInches` (our canonical input).
 * Falls back to overallWidthCm minus two 8 cm borders, if present.
 */
export function getViewingWidthMeters(screen) {
  if (isNum(screen?.visibleWidthInches)) {
    return inchesToMeters(screen.visibleWidthInches);
  }
  if (isNum(screen?.overallWidthCm)) {
    // remove borders: ~8 cm each side
    const borderEachCm = 8;
    return cmToMeters(Math.max(0, screen.overallWidthCm - 2 * borderEachCm));
  }
  return 0;
}

/**
 * Horizontal viewing angle (deg) from viewing width (m) and distance (m).
 * angle = 2 * atan( (width/2) / distance )
 */
export function angleFromWidthAndDistance(widthM, distanceM) {
  if (!isNum(widthM) || !isNum(distanceM) || distanceM <= 0) return 0;
  return toDeg(2 * Math.atan((widthM / 2) / distanceM));
}

/**
 * Distance needed for a target horizontal angle (deg) and width (m).
 * distance = (width/2) / tan(angle/2)
 */
export function distanceForAngle(widthM, angleDeg) {
  if (!isNum(widthM) || !isNum(angleDeg) || angleDeg <= 0 || angleDeg >= 179) return 0;
  return (widthM / 2) / Math.tan(toRad(angleDeg / 2));
}

// ---------- RP23 level logic ----------
/*
RP23 (video) suggested *ideal* viewing-angle bands (left-to-right FOV):
L1: 33°–90°
L2: 40°–80°
L3: 45°–70°
L4: 50°–65°
We grade to the highest level whose band contains the angle; if none, L0.
*/
const RP23_BANDS = [
  { level: 4, min: 50, max: 65 },
  { level: 3, min: 45, max: 70 },
  { level: 2, min: 40, max: 80 },
  { level: 1, min: 33, max: 90 },
];

export function rp23LevelFromAngle(angleDeg) {
  if (!isNum(angleDeg) || angleDeg <= 0) return 0;
  for (const band of RP23_BANDS) {
    if (angleDeg >= band.min && angleDeg <= band.max) return band.level;
  }
  return 0; // outside all bands
}

/**
 * Best-practice target angle (deg). We default to the midpoint of L4 (57.5°).
 */
export function rp23BestAngleDeg() {
  return (50 + 65) / 2; // 57.5°
}

/**
 * Given the seat Y (m), front wall Y (m), and viewing width (m),
 * return { angleDeg, level }.
 */
export function rp23AngleAtSeat({ seatY, frontWallY = 0.1, viewingWidthM }) {
  if (!isNum(seatY) || !isNum(frontWallY) || !isNum(viewingWidthM)) {
    return { angleDeg: 0, level: 0 };
  }
  const distance = Math.max(0.01, seatY - frontWallY);
  const angleDeg = angleFromWidthAndDistance(viewingWidthM, distance);
  const level = rp23LevelFromAngle(angleDeg);
  return { angleDeg, level };
}

/**
 * Recommend a seat Y (m) for target angle and room depth.
 * Returns clamped Y inside [frontWallY+0.2, roomLength-0.2].
 */
export function recommendSeatYForAngle({
  viewingWidthM,
  targetAngleDeg = rp23BestAngleDeg(),
  frontWallY = 0.1,
  roomLength = 6,
}) {
  const d = distanceForAngle(viewingWidthM, targetAngleDeg);
  const y = frontWallY + d;
  return clamp(y, frontWallY + 0.2, roomLength - 0.2);
}

/**
 * Convenience: compute the L4-best seat Y directly.
 */
export function recommendSeatY_L4Best({
  viewingWidthM,
  frontWallY = 0.1,
  roomLength = 6,
}) {
  return recommendSeatYForAngle({
    viewingWidthM,
    targetAngleDeg: rp23BestAngleDeg(),
    frontWallY,
    roomLength,
  });
}

export default {
  getViewingWidthMeters,
  angleFromWidthAndDistance,
  distanceForAngle,
  rp23LevelFromAngle,
  rp23BestAngleDeg,
  rp23AngleAtSeat,
  recommendSeatYForAngle,
  recommendSeatY_L4Best,
};