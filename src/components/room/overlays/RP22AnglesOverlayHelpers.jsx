/**
 * Stage C: RP22 Angles Overlay Helpers
 * Safe, pure functions for computing angle sequences and gaps
 */

// --- SAFE ARRAY HELPERS ---
export const asArray = (v) => (Array.isArray(v) ? v : []);
export const len = (v) => (Array.isArray(v) ? v.length : 0);

/**
 * Compute azimuth from seat to point (0° = forward, +° = right, −° = left)
 */
export const azimuthDegFromSeat = (seat, pt) => {
  if (!seat || !pt) return null;
  const dx = Number(pt.x) - Number(seat.x);
  const dy = Number(pt.y) - Number(seat.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const rad = Math.atan2(dx, -dy); // keep 0° forward
  let deg = rad * (180 / Math.PI);
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg;
};

/**
 * Build eligible surrounds for angles overlay
 * SL/SR always if visible; SBL/SBR if visible; LW/RW only if SL & SR exist
 */
export function getEligibleSurroundsForAngles(visiblePlacedSpeakers, mlp) {
  const src = asArray(visiblePlacedSpeakers);
  if (!src.length || !mlp) return [];

  const pick = (roles) =>
    src.filter(s => roles.includes((s?.role || '').toUpperCase()) && s?.position);

  const SL_SR = pick(['SL', 'SR']);
  const SBL_SBR = pick(['SBL', 'SBR']);
  const LW_RW = pick(['LW', 'RW']);

  const hasSides = len(SL_SR) >= 2;

  const out = [
    ...SL_SR,
    ...SBL_SBR,
    ...(hasSides ? LW_RW : []),
  ];

  return out;
}

/**
 * Order surrounds clockwise, no-wrap sequence from RW (closest +0°) to LW (closest -0°)
 */
export function computeSurroundAnglesSequence(eligibleSurrounds, mlp) {
  const seat = mlp;
  const arr = asArray(eligibleSurrounds);
  if (!seat || len(arr) < 2) return { seq: [], metas: [] };

  // collect azimuths
  const metas = [];
  for (const sp of arr) {
    const a = azimuthDegFromSeat(seat, sp.position);
    if (Number.isFinite(a)) metas.push({ a, sp });
  }
  if (metas.length < 2) return { seq: [], metas: [] };

  // split by side
  const right = metas.filter(m => m.a >= 0).sort((a,b) => a.a - b.a); // +0..+180
  const left  = metas.filter(m => m.a <  0).sort((a,b) => a.a - b.a); // -180..-0 (ascending)

  // find RW (right closest to +0°) and LW (left closest to -0°)
  const rwIdx = right.length ? 0 : -1;            // smallest +deg
  const lwIdx = left.length  ? left.length - 1 : -1; // closest to 0 on left side

  // if no right side, we only have left: go from most-back to least-back (still no wrap)
  if (rwIdx === -1) {
    const seq = left.map(m => m.a);    // e.g. [-160, -120, -30]
    return { seq, metas: [...left] };
  }

  // normal case: start at RW, sweep right→ (increasing), then left→ (towards -0), stop at LW
  const seq = [
    ...right.map(m => m.a), // +small → +big
    ...left.map(m => m.a),  // -big   → -small (towards -0)
  ];
  const orderedMetas = [...right, ...left];

  return { seq, metas: orderedMetas };
}

/**
 * Compute gaps between consecutive angles (no wrap)
 */
export function computeConsecutiveGaps(angleSequence) {
  const seq = asArray(angleSequence);
  if (len(seq) < 2) return [];
  
  const gaps = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const d = seq[i + 1] - seq[i];
    gaps.push(d < 0 ? d + 360 : d);
  }
  return gaps;
}