// Unified RP23 + screen metrics helper
// - viewing width is in inches (visible/active image width)
// - we add 8 cm border on each side for overall frame size (width & height)

const INCH_TO_M = 0.0254;

// ---- aspect helpers ----
export function normaliseAspect(aspect = "16:9") {
  const [w, h] = String(aspect).split(":").map(Number);
  const ok = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  return ok ? { w, h } : { w: 16, h: 9 };
}

// Visible (active) image dims from viewing width (inches)
export function viewingDimsM(visibleWidthInches = 100, aspect = "16:9") {
  const { w, h } = normaliseAspect(aspect);
  const viewWm = Number(visibleWidthInches || 100) * INCH_TO_M;
  const viewHm = viewWm * (h / w);
  return { viewWm, viewHm };
}

// Add 8 cm border each side for overall frame dimensions
export function overallFrameDimsM(visibleWidthInches = 100, aspect = "16:9", borderCm = 8) {
  const { viewWm, viewHm } = viewingDimsM(visibleWidthInches, aspect);
  const b = (Number(borderCm) || 8) / 100; // meters
  return {
    overallWm: viewWm + 2 * b,
    overallHm: viewHm + 2 * b,
    borderM: b,
  };
}

// ---- geometry: distance/angle ----
// Horizontal viewing angle from distance
export function angleFromDistance(viewWidthM, distanceM) {
  if (!viewWidthM || !distanceM) return 0;
  return (2 * Math.atan((viewWidthM / 2) / distanceM)) * 180 / Math.PI;
}

// Required distance for a target horizontal angle
export function distanceForAngle(viewWidthM, angleDeg) {
  if (!viewWidthM || !angleDeg) return 0;
  const r = (angleDeg * Math.PI) / 180 / 2;
  return (viewWidthM / 2) / Math.tan(r);
}

// ---- RP23 grading (Level 1..4) ----
// RP23 recommended horizontal viewing angle bands:
export function rp23LevelForAngle(angleDeg) {
  const a = Number(angleDeg) || 0;
  if (a >= 50 && a <= 65) return 4;       // Level 4
  if (a >= 45 && a <= 70) return 3;       // Level 3
  if (a >= 40 && a <= 80) return 2;       // Level 2
  if (a >= 33 && a <= 90) return 1;       // Level 1
  return 0;                               // out of spec
}

// Ideal angle (mid of L4 band) -> 57.5°
export function idealRp23Angle() {
  return 57.5;
}
export function idealDistanceForWidth(visibleWidthInches, aspect = "16:9") {
  const { viewWm } = viewingDimsM(visibleWidthInches, aspect);
  return distanceForAngle(viewWm, idealRp23Angle());
}

// Convenience bundle for UI
export function calcRp23ForDistance(visibleWidthInches, aspect, distanceM) {
  const { viewWm } = viewingDimsM(visibleWidthInches, aspect);
  const angle = angleFromDistance(viewWm, distanceM);
  const level = rp23LevelForAngle(angle);
  return { angle, level };
}