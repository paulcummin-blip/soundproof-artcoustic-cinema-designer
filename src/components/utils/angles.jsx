/**
 * Angle helpers: angles measured at the MLP (pure functions, no UI)
 * Coordinate system:
 * - SVG room: origin at front-left, x→right, y→back (front wall at y=0).
 * Bearings:
 * - 0° = straight ahead (toward screen/front wall), angles increase clockwise; range [0,360).
 */

const RAD2DEG = 180 / Math.PI;

/** Safe clamp */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Vector from a -> b */
export function vec(a, b) {
  return { x: (b?.x ?? 0) - (a?.x ?? 0), y: (b?.y ?? 0) - (a?.y ?? 0) };
}

export function dot(a, b) {
  return (a?.x ?? 0) * (b?.x ?? 0) + (a?.y ?? 0) * (b?.y ?? 0);
}

export function len(v) {
  return Math.hypot(v?.x ?? 0, v?.y ?? 0);
}

export function norm(v) {
  const L = len(v) || 1;
  return { x: (v?.x ?? 0) / L, y: (v?.y ?? 0) / L };
}

/**
 * Interior angle at MLP (0..180) between rays MLP->A and MLP->B.
 * Uses dot product; clamps to [-1, 1] before acos.
 */
export function interiorAngleDeg(mlp, a, b) {
  const u = norm(vec(mlp, a));
  const v = norm(vec(mlp, b));
  const c = clamp(dot(u, v), -1, 1);
  return Math.acos(c) * RAD2DEG;
}

/**
 * Bearing at MLP with 0° straight ahead and clockwise positive (0..360).
 * With room coords y increasing toward the back, "forward" component is (mlp.y - p.y).
 */
export function bearingCWDeg(mlp, p) {
  const dx = (p?.x ?? 0) - (mlp?.x ?? 0);
  const dyForward = (mlp?.y ?? 0) - (p?.y ?? 0);
  let deg = Math.atan2(dx, dyForward) * RAD2DEG;
  if (deg < 0) deg += 360;
  return deg;
}

/** Directed clockwise gap from A to B (0..360) at the MLP */
export function cwGapDeg(mlp, a, b) {
  const A = bearingCWDeg(mlp, a);
  const B = bearingCWDeg(mlp, b);
  return (B - A + 360) % 360;
}

export default {
  clamp,
  vec,
  dot,
  len,
  norm,
  interiorAngleDeg,
  bearingCWDeg,
  cwGapDeg,
};