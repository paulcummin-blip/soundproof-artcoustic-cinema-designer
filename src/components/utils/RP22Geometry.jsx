/**
 * RP22 geometry helpers (back-arc surround spacing).
 * - 0° = straight ahead (towards front wall), angles increase clockwise [0,360).
 * - y = 0 at the front wall; y increases towards the back of the room.
 *
 * The "back-sweep" starts at the first RIGHT surround (0<az<180) with priority:
 * wides -> sides -> rears, then smallest azimuth.
 *
 * Primary output for Param-5: back-arc gaps (exclude the single wrap/front gap).
 */

// Vec2: {x:number, y:number}
// Speaker: {id?:string|number, role:string, position:{x:number,y:number}}

const RAD2DEG = 180 / Math.PI;

/** 0° = forward, +CW, range [0,360) */
export function azimuthCW(mlp, p) {
  const dx = p.x - mlp.x;
  const dyFwd = mlp.y - p.y; // +ve when target is in front of MLP
  let deg = Math.atan2(dx, dyFwd) * RAD2DEG;
  if (deg < 0) deg += 360;
  return deg;
}

/** Directed clockwise delta from a to b, both in [0,360). */
export function cwDelta(a, b) {
  return (b - a + 360) % 360;
}

/** Bed-layer roles we consider in the ring. */
const BED_ROLES = new Set([
  "FWL", "FWR", "LW", "RW",              // wides
  "SL", "SR", "LS", "RS",                // sides
  "SBL", "SBR", "LRS", "RRS", "LR", "RR" // rears
]);

function rolePriority(role) {
  const r = String(role || "").toUpperCase();
  if (r === "FWR" || r === "RW" || r === "FWL" || r === "LW") return 0; // wides (most forward)
  if (r === "SR"  || r === "RS" || r === "SL"  || r === "LS") return 1; // sides
  return 2; // rears
}

/**
 * Order bed-layer surrounds in clockwise azimuth, rotated so the sequence
 * starts at the chosen RIGHT speaker (0<az<180) with smallest priority then smallest azimuth.
 */
export function orderSurroundBackSweep(speakers, mlp) {
  const bed = (speakers || []).filter(s => BED_ROLES.has(String(s.role || "").toUpperCase()));
  if (!bed.length) return [];

  // Attach azimuth and sort CW
  const withAz = bed
    .map(s => ({ s, az: azimuthCW(mlp, s.position) }))
    .sort((a, b) => a.az - b.az);

  // Pick start among right-hand speakers
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
  }

  const rotated = withAz.slice(startIdx).concat(withAz.slice(0, startIdx));
  return rotated.map(x => x.s);
}

/**
 * Compute CW gaps for all adjacent pairs INCLUDING wrap.
 * Returns ordered speakers, their CW azimuths, CW deltas (anglesCW), and pairs.
 */
export function computeBackSweepGaps(speakers, mlp) {
  const ordered = orderSurroundBackSweep(speakers, mlp);
  const n = ordered.length;
  if (n < 2) return { ordered, azCW: [], anglesCW: [], pairsCW: [] };

  const azCW = ordered.map(s => azimuthCW(mlp, s.position));
  const anglesCW = [];
  const pairsCW = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    anglesCW.push(cwDelta(azCW[i], azCW[j]));
    pairsCW.push([ordered[i], ordered[j]]);
  }

  return { ordered, azCW, anglesCW, pairsCW };
}

/**
 * Extract the "back-arc" gaps: all CW gaps EXCEPT the single wrap gap that crosses 360->0 (front).
 * Implementation: from computeBackSweepGaps, drop the one gap where az[j] < az[i] (the wrap).
 * For 2 surrounds, back-arc will contain exactly one angle SR->SL.
 */
export function computeBackArc(speakers, mlp) {
  const { ordered, azCW, anglesCW, pairsCW } = computeBackSweepGaps(speakers, mlp);
  const n = ordered.length;
  if (n < 2) return { ordered, backArcAngles: [], backArcPairs: [] };

  const backArcAngles = [];
  const backArcPairs = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const wraps = azCW[j] < azCW[i]; // only true for the single gap that crosses front
    if (!wraps) {
      backArcAngles.push(anglesCW[i]);
      backArcPairs.push(pairsCW[i]);
    }
  }
  return { ordered, backArcAngles, backArcPairs };
}

/** RP22 Param‑5 level from a single back-arc gap (deg). */
export function param5LevelFromGap(gapDeg) {
  // ≥80° → L1, ≥60° → L2, ≥50° → L3, else L4
  if (gapDeg >= 80) return 1;
  if (gapDeg >= 60) return 2;
  if (gapDeg >= 50) return 3;
  return 4;
}

/* ------------------------- Sanity self-tests (optional) ------------------------- */
export function __selfTest__() {
  const mlp = { x: 3.0, y: 3.5 };      // seat back from screen
  const SR = { role: "SR", position: { x: 5.8, y: 3.2 } };
  const SL = { role: "SL", position: { x: 0.2, y: 3.2 } };
  const { backArcAngles } = computeBackArc([SR, SL], mlp);
  const mlpBack = { x: 3.0, y: 4.5 };
  const { backArcAngles: back2 } = computeBackArc([SR, SL], mlpBack);
  // eslint-disable-next-line no-console
  console.debug("[RP22Geom] SR→SL back-arc ~", backArcAngles[0]?.toFixed?.(1), "deg; back further →", back2[0]?.toFixed?.(1), "deg");
}

export default {
  azimuthCW,
  cwDelta,
  orderSurroundBackSweep,
  computeBackSweepGaps,
  computeBackArc,
  param5LevelFromGap,
  __selfTest__
};