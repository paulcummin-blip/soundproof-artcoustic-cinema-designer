/**
 * p7IdealAngles
 * -------------
 * The one place that turns the published P7 ideal-median angles into something
 * the Visual Report can draw and read.
 *
 * The engineering authority publishes, per front wide, the ideal (median) angle
 * and the actual angle as an azimuth in the engine's own frame, where 0° points
 * away from the screen. A report describes a room the other way round — off the
 * centre line, measured at the reference seating position — so this module
 * converts a published azimuth into:
 *
 *   toPlanTheta(azimuth)          the plan-drawing angle used by the P7 diagram
 *                                 (0° = screen, increasing clockwise)
 *   toCentreLineDegrees(azimuth)  the bearing off the centre line (0-180°),
 *                                 used by the placement guidance copy
 *
 * Presentation only: it converts an already-published angle. It never grades,
 * never measures and never recomputes a deviation.
 */

/** A missing or blank published value is absent, never zero. */
function isMissing(value) {
  return value == null || value === "";
}

/** Engine azimuth (0° = away from the screen) → plan angle (0° = screen, clockwise). */
export function toPlanTheta(azimuthDeg) {
  if (isMissing(azimuthDeg)) return null;
  const value = Number(azimuthDeg);
  if (!Number.isFinite(value)) return null;
  return ((180 - value) % 360 + 360) % 360;
}

/** Engine azimuth → bearing off the centre line, 0-180°. */
export function toCentreLineDegrees(azimuthDeg) {
  const theta = toPlanTheta(azimuthDeg);
  if (theta == null) return null;
  return theta <= 180 ? theta : 360 - theta;
}

/** A degrees value read as copy: one decimal place with the degree sign. */
export function formatAngle(deg) {
  if (isMissing(deg)) return null;
  const value = Number(deg);
  return Number.isFinite(value) ? `${value.toFixed(1)}°` : null;
}