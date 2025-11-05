/**
 * Surround azimuth helpers for RP22 Parameter 5.
 * Angles are measured at the MLP. 0° = straight ahead, + right (clockwise), - left (counter-clockwise).
 */

/** Normalise to [-180, 180] */
function norm180(a) {
  if (!Number.isFinite(a)) return 0;
  let x = a;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Wrap to [0, 360) */
function wrap360(a) {
  const x = ((a % 360) + 360) % 360;
  return x;
}

/**
 * Compute azimuth in degrees at MLP with 0° forward and + to the right.
 * Returns in [-180, 180].
 */
export function azimuthDeg(mlp, p) {
  const dx = p.x - mlp.x;
  const dy = mlp.y - p.y; // invert Y so +Y is forward
  const a = Math.atan2(dx, dy) * 180 / Math.PI;
  return norm180(a);
}

/**
 * Back-sweep gaps:
 * - Order clockwise starting at the most-forward right surround (smallest angle >= 0°).
 * - Return only the consecutive gaps, ignoring the single wrap gap (which crosses the 0° front axis).
 * - Gaps are positive degrees.
 */
export function backSweepGaps(mlp, surrounds) {
  const list = Array.isArray(surrounds) ? surrounds : [];
  if (list.length < 2) return [];

  const items = list
    .map(s => {
      const th = azimuthDeg(mlp, { x: s.x, y: s.y });
      return { ...s, theta: th, a360: wrap360(th) };
    })
    .sort((a, b) => a.a360 - b.a360);

  // Find index of most-forward right (angle >= 0°, smallest)
  let start = items.findIndex(s => s.a360 >= 0);
  if (start < 0) start = 0;

  const ordered = items.slice(start).concat(items.slice(0, start));

  // Consecutive gaps only (ignore wrap-around to first)
  const gaps = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const d = ordered[i + 1].a360 - ordered[i].a360;
    if (d > 0) gaps.push(d);
  }
  return gaps;
}

/**
 * Two-speaker helper: back-sweep gap is the clockwise difference
 * between the two angles when ordered starting at the most-forward right.
 */
export function backSweepSingleGap(mlp, a, b) {
  const th = [azimuthDeg(mlp, a), azimuthDeg(mlp, b)];
  const a360 = th.map(wrap360).sort((x, y) => x - y);
  // Start at smallest >= 0 which is a360[0] after sort, consecutive diff only:
  return a360[1] - a360[0];
}

export default { azimuthDeg, backSweepGaps, backSweepSingleGap };