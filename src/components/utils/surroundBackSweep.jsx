
/**
 * Back-sweep helpers for RP22 Parameter 5.
 * Angles measured at MLP. 0° = straight ahead, + right (clockwise).
 */

// ---------- Existing helpers (kept) ----------
function norm180(a) {
  if (!Number.isFinite(a)) return 0;
  let x = a;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Compute azimuth in degrees at MLP; 0° forward, + right; returns [-180, 180] */
export function azimuthDeg(mlp, p) {
  const dx = p.x - mlp.x;
  const dy = mlp.y - p.y; // +y forward
  const a = Math.atan2(dx, dy) * 180 / Math.PI;
  return norm180(a);
}

/** Order surrounds clockwise starting from most-forward RIGHT (theta >= 0). */
export function orderSurroundsBackSweep(mlp, surrounds) {
  const items = (Array.isArray(surrounds) ? surrounds : []).map(s => ({
    ...s,
    theta: azimuthDeg(mlp, s.position)
  }));
  items.sort((a, b) => a.theta - b.theta);
  let start = items.findIndex(s => s.theta >= 0);
  if (start < 0) start = 0;
  return items.slice(start).concat(items.slice(0, start));
}

/** Back-sweep gaps only: return inner gaps and drop the single wrap gap crossing 0°. */
export function backSweepGaps(mlp, surrounds) {
  if (!surrounds || surrounds.length < 2) return [];
  const ordered = orderSurroundsBackSweep(mlp, surrounds);
  const gaps = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    gaps.push(ordered[i + 1].theta - ordered[i].theta);
  }
  return gaps; // wrap gap excluded
}

/** 2-surround helper (5.1 etc.) */
export function backSweepGap2(mlp, a, b) {
  const th = [azimuthDeg(mlp, a), azimuthDeg(mlp, b)].sort((x, y) => x - y);
  return th[1] - th[0];
}

/** RP22 Param-5 level from a single back-sweep gap (deg). */
export function param5LevelFromGap(gap) {
  // ≥80° → L1, ≥60° → L2, ≥50° → L3, else L4
  if (gap >= 80) return 1;
  if (gap >= 60) return 2;
  if (gap >= 50) return 3;
  return 4;
}

// ---------- New CW helpers per spec ----------
const RAD2DEG = 180 / Math.PI;

/** 0° = straight ahead (towards the screen), angles increase clockwise, range [0, 360) */
export function azimuthCW(mlp, p) {
  const dx = p.x - mlp.x;
  const dyForward = mlp.y - p.y; // forward
  let deg = Math.atan2(dx, dyForward) * RAD2DEG;
  if (deg < 0) deg += 360;
  return deg;
}

/** Directed clockwise delta from angle a to b (both in [0, 360)) */
export function cwDelta(a, b) {
  return (b - a + 360) % 360;
}

/** Choose the arc whose midpoint lies in the rear hemisphere (90..270) */
export function backArcDelta(a, b) {
  const d = cwDelta(a, b);             // cw arc from a → b
  const mid = (a + d / 2) % 360;       // midpoint of that arc
  const rear = mid >= 90 && mid <= 270;
  return rear ? d : 360 - d;           // prefer the rear arc
}

// NEW: alias to match external patch naming
export function rearArcDelta(a, b) {
  return backArcDelta(a, b);
}

// Bed-layer surround roles considered in the ring
const BED_ROLES = new Set([
  "FWL","FWR","LW","RW",
  "SL","SR","LS","RS",
  "SBL","SBR","LRS","RRS","LR","RR"
]);

function rolePriority(role) {
  const r = String(role || "").toUpperCase();
  // Lower is more forward: wides(0) → sides(1) → rears(2)
  if (r === "FWR" || r === "RW" || r === "FWL" || r === "LW") return 0;
  if (r === "SR"  || r === "RS" || r === "SL"  || r === "LS") return 1;
  return 2;
}

/**
 * Order surround speakers for a clockwise back-sweep starting at the first right speaker.
 * - Compute azimuths at MLP (CW [0..360))
 * - Pick start = right-side speaker (0<az<180) with smallest priority then smallest azimuth
 * - Return CW-sorted list rotated so it starts at that start index
 */
export function orderSurroundBackSweep(speakers, mlp) {
  const bed = (Array.isArray(speakers) ? speakers : []).filter(s => BED_ROLES.has(String(s.role || "").toUpperCase()));
  if (!bed.length) return [];

  const withAz = bed.map(s => ({ s, az: azimuthCW(mlp, s.position) }))
                    .sort((a, b) => a.az - b.az); // CW order

  const right = withAz.filter(x => x.az > 0 && x.az < 180);
  let startIdx = 0;
  if (right.length) {
    right.sort((a, b) => {
      const pa = rolePriority(a.s.role);
      const pb = rolePriority(b.s.role);
      if (pa !== pb) return pa - pb;
      return a.az - b.az;
    });
    const chosenAz = right[0].az;
    startIdx = withAz.findIndex(x => x.az === chosenAz);
  } else {
    startIdx = 0; // fallback: most forward overall
  }

  const ordered = withAz.slice(startIdx).concat(withAz.slice(0, startIdx)).map(x => x.s);
  return ordered;
}

/** Compute directed CW gaps along the back-sweep ring (includes wrap gap at the end). */
export function computeBackSweepGaps(speakers, mlp) {
  const ordered = orderSurroundBackSweep(speakers, mlp);
  const n = ordered.length;
  if (n < 2) return { ordered, angles: [], pairs: [] };

  const az = ordered.map(s => azimuthCW(mlp, s.position));
  const angles = [];
  const pairs = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // CHANGED: use rear-arc delta for each adjacent pair (MLP-anchored, CW), not plain cwDelta
    angles.push(backArcDelta(az[i], az[j]));
    pairs.push([ordered[i], ordered[j]]);
  }
  return { ordered, angles, pairs };
}

/**
 * Back-arc gaps along the sweep using the rear-midpoint rule.
 * Wrap pair is kept; each pair measures the rear arc.
 */
export function computeBackArcGaps(speakers, mlp) {
  const ordered = orderSurroundBackSweep(speakers, mlp);
  const n = ordered.length;
  if (n < 2) return { ordered, backAngles: [], backPairs: [] };

  const az = ordered.map(s => azimuthCW(mlp, s.position));
  const backAngles = [];
  const backPairs = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    backAngles.push(backArcDelta(az[i], az[j]));
    backPairs.push([ordered[i], ordered[j]]);
  }
  return { ordered, backAngles, backPairs };
}

export default {
  azimuthDeg,
  orderSurroundsBackSweep,
  backSweepGaps,
  backSweepGap2,
  param5LevelFromGap,
  azimuthCW,
  cwDelta,
  backArcDelta,
  rearArcDelta, // Added new export
  orderSurroundBackSweep,
  computeBackSweepGaps,
  computeBackArcGaps
};
