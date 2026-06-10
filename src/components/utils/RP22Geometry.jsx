
/**
 * RP22 bed-layer back-sweep geometry (pure functions, no UI)
 *
 * Coordinate system (plan view):
 * - Room units are metres.
 * - Front wall is at y = 0; y increases toward the back of the room.
 *
 * Azimuth convention:
 * - 0° = straight ahead (towards the screen/front wall), angles increase clockwise.
 * - Range is [0, 360).
 *
 * Ordering (start index):
 * - From all bed-layer surrounds (FWL/FWR/LW/RW, SL/SR/LS/RS, SBL/SBR/LRS/RRS/LR/RR)
 *   pick a RIGHT-hand speaker (0<az<180) with lowest role priority (wides=0, sides=1, rears=2),
 *   tie-break by smallest azimuth. Rotate CW-sorted list so this is first.
 * - If no right-hand speaker exists, fall back to overall most-forward (smallest azimuth).
 *
 * Gaps:
 * - cwDelta(a, b) = (b - a + 360) % 360 (directed CW).
 * - Build gaps between successive speakers in the ordered list.
 * - By default exclude the single wrap segment that jumps across the screen/front (gap > 180°),
 *   unless opts.includeWrap === true.
 */

// Roles considered for the bed-layer surround ring
const BED_ROLES = new Set([
  "FWL", "FWR", "LW", "RW",               // wides
  "SL", "SR", "LS", "RS",                 // sides
  "SBL", "SBR", "LRS", "RRS", "LR", "RR"  // rears
]);

/** Role priority: lower means "more forward" (used to choose start)
 *  wides(0) → sides(1) → rears(2)
 */
function rolePriority(role) {
  const r = String(role || "").toUpperCase();
  if (r === "FWR" || r === "RW" || r === "FWL" || r === "LW") return 0; // wides
  if (r === "SR"  || r === "RS" || r === "SL"  || r === "LS") return 1; // sides
  return 2; // rears
}

export const RAD2DEG = 180 / Math.PI;

/** 0° = straight ahead (toward front wall y=0); angles increase clockwise; range [0,360) */
export function azimuthCW(mlp, p) {
  const dx = (p?.x ?? 0) - (mlp?.x ?? 0);
  const dyForward = (mlp?.y ?? 0) - (p?.y ?? 0); // + forward
  let deg = Math.atan2(dx, dyForward) * RAD2DEG;
  if (deg < 0) deg += 360;
  return deg;
}

/** Directed CW delta from angle a to b, both in [0,360); returns [0,360) */
export function cwDelta(a, b) {
  return (b - a + 360) % 360;
}

/** 0° = straight ahead; angles increase clockwise; range [0,360) */
export function bearingCWDeg(mlp, p) {
  const dx = (p?.x ?? 0) - (mlp?.x ?? 0);
  const dyF = (mlp?.y ?? 0) - (p?.y ?? 0); // +y forward
  let a = Math.atan2(dx, dyF) * RAD2DEG;
  if (a < 0) a += 360;
  return a; // [0,360)
}

/** Interior angle at MLP between rays to p1 and p2 (0..180) */
export function interiorAngleDeg(mlp, p1, p2) {
  const v1 = { x: (p1?.x ?? 0) - (mlp?.x ?? 0), y: (p1?.y ?? 0) - (mlp?.y ?? 0) };
  const v2 = { x: (p2?.x ?? 0) - (mlp?.x ?? 0), y: (p2?.y ?? 0) - (mlp?.y ?? 0) };
  const n1 = Math.hypot(v1.x, v1.y) || 1;
  const n2 = Math.hypot(v2.x, v2.y) || 1;
  const dot = (v1.x * v2.x + v1.y * v2.y) / (n1 * n2);
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped) * RAD2DEG; // 0..180
}

// ---------- NEW: role-based angle helpers ----------
/** Aliases per role group for convenience lookups */
const ROLE_MAP = {
  SR: ["SR","RS"],                 // right side
  SL: ["SL","LS"],                 // left side
  RR: ["RBR","RRS","RR","SBR"],    // right rear aliases
  RL: ["LBL","LRS","LR","SBL"],    // left rear aliases
  FW_R: ["FWR","RW"],              // right wide
  FW_L: ["FWL","LW"],              // left wide
};

function findByRole(roles, speakers) {
  const set = new Set((roles || []).map(r => String(r || "").toUpperCase()));
  return (Array.isArray(speakers) ? speakers : []).find(s => set.has(String(s?.role || "").toUpperCase())) || null;
}

/**
 * Angle FROM any of `fromRoles` TO any of `toRoles`, clockwise, measured at MLP.
 * Returns degrees in [0, 360). Null if either role not found.
 */
export function angleFromRoleToRoleCW(mlp, speakers, fromRoles, toRoles) {
  const from = findByRole(fromRoles, speakers);
  const to   = findByRole(toRoles, speakers);
  if (!from || !to) return null;
  const a = azimuthCW(mlp, from.position);
  const b = azimuthCW(mlp, to.position);
  return cwDelta(a, b);
}

// Convenience wrappers
export const angle_SR_to_RR = (mlp, spk) => angleFromRoleToRoleCW(mlp, spk, ROLE_MAP.SR, ROLE_MAP.RR);
export const angle_RR_to_RL = (mlp, spk) => angleFromRoleToRoleCW(mlp, spk, ROLE_MAP.RR, ROLE_MAP.RL);
export const angle_RL_to_SL = (mlp, spk) => angleFromRoleToRoleCW(mlp, spk, ROLE_MAP.RL, ROLE_MAP.SL);
export const angle_SL_to_SR = (mlp, spk) => angleFromRoleToRoleCW(mlp, spk, ROLE_MAP.SL, ROLE_MAP.SR);

/** Order the bed-layer speakers in CW order, then rotate so we start at the most-forward RIGHT speaker */
export function orderBackSweepCW(speakers, mlp) {
  const bed = (Array.isArray(speakers) ? speakers : []).filter(
    (s) => BED_ROLES.has(String(s?.role || "").toUpperCase())
      && Number.isFinite(s?.position?.x)
      && Number.isFinite(s?.position?.y)
  );
  if (!bed.length) return [];

  const withAz = bed
    .map((s) => ({ s, az: azimuthCW(mlp, s.position) }))
    .sort((a, b) => a.az - b.az); // CW order

  // Right-hand candidates (0<az<180)
  const right = withAz.filter((x) => x.az > 0 && x.az < 180);
  let startIdx = 0;

  if (right.length) {
    // Choose the most-forward right speaker by role priority then azimuth
    right.sort((a, b) => {
      const pa = rolePriority(a.s.role);
      const pb = rolePriority(b.s.role);
      if (pa !== pb) return pa - pb;
      return a.az - b.az;
    });
    const chosenAz = right[0].az;
    startIdx = withAz.findIndex((x) => x.az === chosenAz);
  } else {
    // Fallback: overall most-forward (smallest az)
    startIdx = 0;
  }

  // Rotate so chosen start is first
  const rotated = withAz.slice(startIdx).concat(withAz.slice(0, startIdx));
  return rotated.map((x) => x.s);
}

/**
 * Compute directed CW neighbour gaps along the back-sweep ring.
 * By default EXCLUDES the single wrap segment that jumps across the front (gap > 180).
 */
export function computeBackSweepGaps(speakers, mlp, opts) {
  const includeWrap = !!(opts && opts.includeWrap);
  const ordered = orderBackSweepCW(speakers, mlp);
  const n = ordered.length;
  if (n < 2) return { ordered, azimuths: [], gaps: [], pairs: [] };

  const azimuths = ordered.map((s) => azimuthCW(mlp, s.position));
  const gaps = [];
  const pairs = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = cwDelta(azimuths[i], azimuths[j]);
    const isWrap = (j === 0) || d > 180; // jumping across the screen/front
    if (!includeWrap && isWrap) continue;
    gaps.push(d);
    pairs.push([ordered[i], ordered[j]]);
  }

  return { ordered, azimuths, gaps, pairs };
}

/** Two-surround helper (e.g., 5.1) – directed CW gap SR → SL measured at the MLP */
export function gapForTwoSurrounds(mlp, aPos, bPos) {
  const a = azimuthCW(mlp, aPos);
  const b = azimuthCW(mlp, bPos);
  return cwDelta(a, b); // CW from right to left
}

/** RP22 Param‑5 level from a single back‑sweep gap (≥80=L1, ≥60=L2, ≥50=L3, else L4) */
export function levelFromGap(gapDeg) {
  if (gapDeg >= 80) return 1;
  if (gapDeg >= 60) return 2;
  if (gapDeg >= 50) return 3;
  return 4;
}

/* ------------------------- Sanity examples (docs) --------------------------
Example:
  const mlp = {x: 2.25, y: 3.0};
  const SR  = {x: 4.5,  y: 3.8};
  const SL  = {x: 0.0,  y: 3.8};
  const gap = gapForTwoSurrounds(mlp, SR, SL);
  // Expect a large gap (≈ 170–180°). Moving MLP backwards (y larger) increases gap.

Notes:
- Angles are NEVER measured from the centre channel; they are measured between adjacent
  surrounds in CW order starting at the first right-hand surround.
- Excluding the wrap avoids the misleading 180° mean in sparse layouts.
--------------------------------------------------------------------------- */
