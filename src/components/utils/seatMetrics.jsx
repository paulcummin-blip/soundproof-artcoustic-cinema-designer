
// components/utils/seatMetrics.js
// Pure helpers for per-seat metrics. No React imports, no hooks.

/**
 * Level mapping for RP22 P1 (nearest boundary).
 */
export function rp22LevelForP1(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m >= 1.50) return 'L4';
  if (m >= 1.20) return 'L3';
  if (m >= 0.80) return 'L2';
  if (m >= 0.50) return 'L1';
  return 'Below L1';
}

/**
 * Compute P1 (nearest boundary) using left-wall X convention:
 * xLeftWall: meters from left wall (0..widthM)
 * yFromScreenPlane: meters from screen front plane (into room positive)
 * widthM/lengthM: room dimensions
 * screenFrontPlaneM: distance front wall → screen front plane (>= 0)
 */
export function metricP1_nearestWallM({
  xLeftWall,
  yFromScreenPlane,
  widthM,
  lengthM,
  screenFrontPlaneM = 0,
}) {
  // Defensive coercion before guarding
  const _x = Number(xLeftWall);
  const _y = Number(yFromScreenPlane);
  const _w = Number(widthM);
  const _l = Number(lengthM);
  const _s = Number(screenFrontPlaneM ?? 0);

  if (![_x, _y, _w, _l].every(Number.isFinite) || _w <= 0 || _l <= 0) {
    return null;
  }

  // side walls (left-wall convention)
  const dLeft  = Math.max(0, _x);
  const dRight = Math.max(0, _w - _x);
  const sideM  = Math.min(dLeft, dRight);

  // front/back walls (convert seat y to front-wall space)
  const seatFrontM = Math.max(0, _s + _y);
  const frontM = seatFrontM;
  const backM  = Math.max(0, _l - seatFrontM);

  const nearest = Math.min(sideM, frontM, backM);
  return Number.isFinite(nearest) ? nearest : null;
}

/**
 * RP22 Level for P4 (Screen speakers SPL difference at seat)
 * Parameter 4: Maximum SPL difference between screen wall speakers
 * @param {number} deltaDb - Max pairwise SPL delta in dB
 * @returns {string} RP22 level (L1-L4) or '—'
 */
export function rp22LevelForP4(deltaDb) {
  if (!Number.isFinite(deltaDb)) return '—';

  // Max thresholds (lower is better)
  if (deltaDb <= 2) return 'L4';
  if (deltaDb <= 4) return 'L3';
  if (deltaDb <= 5) return 'L2';
  if (deltaDb <= 6) return 'L1';
  return 'Below L1';
}


// --- ANGLES & P5 HELPERS ---

/**
 * Compute azimuth from seat to point
 * 0° = straight ahead (towards screen), +° to RIGHT, −° to LEFT
 * Screen-anchored coords: x right(+), y away from screen(+)
 */
export function azimuthDegFromSeat(seat, pt) {
  if (!seat || !pt) return null;
  const sx = Number(seat.x), sy = Number(seat.y);
  const px = Number(pt.x),   py = Number(pt.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  const dx = px - sx;
  const dy = py - sy;
  // Use -dy so 0° is forward (towards screen plane y=0)
  let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
  // Normalize to [-180, 180]
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg;
}

/**
 * RP22 P5: Maximum gap between adjacent bed-layer surrounds (no wrap)
 * Walks clockwise from first right (smallest +deg) through rights,
 * then continues into lefts (most negative → closest to 0), stops at furthest-forward left
 */
export function metricP5_maxSurroundGapNoWrap({ seat, surrounds, toPoint }) {
  if (!seat || !Array.isArray(surrounds)) return null;

  const pts = [];
  for (const sp of surrounds) {
    const p = toPoint ? toPoint(sp) : sp?.position;
    const a = azimuthDegFromSeat(seat, p);
    if (Number.isFinite(a)) pts.push({ a, sp });
  }
  if (pts.length < 2) return null;

  const right = pts.filter(o => o.a >= 0).sort((a, b) => a.a - b.a);   // 0 .. +180
  const left  = pts.filter(o => o.a <  0).sort((a, b) => a.a - b.a);   // -180 .. -0 (ascending)

  // Build clockwise sequence per rule
  // If no rights, still do lefts ascending (most negative -> closest to 0)
  const seq = [];
  if (right.length) seq.push(...right.map(o => o.a));
  if (left.length)  seq.push(...left.map(o => o.a));

  // Compute forward step gaps only between consecutive items (NO wrap last→first)
  const gaps = [];
  for (let i = 0; i < seq.length - 1; i++) {
    let d = seq[i + 1] - seq[i];     // by construction should be >= 0
    if (d < 0) d += 360;             // guard tiny numeric noise
    gaps.push(d);
  }
  if (!gaps.length) return null;
  return Math.max(...gaps);
}

/**
 * RP22 grading for P5 (maximum angular gap)
 * L4: ≤50°, L3: ≤60°, L2: ≤80°, L1: >80°
 */
export function rp22LevelForP5_NoWrap(valueDeg) {
  if (!Number.isFinite(valueDeg)) return '—';
  if (valueDeg <= 50) return 'L4';
  if (valueDeg <= 60) return 'L3';
  if (valueDeg <= 80) return 'L2';
  return 'L1';
}

/**
 * Helper: canonical role normalization for surrounds
 */
export function getCanonicalSurroundRole(role) {
  const r = String(role || '').toUpperCase();
  // Normalize common variants
  if (r.includes('SBL') || r === 'RL' || r === 'RSL') return 'SBL';
  if (r.includes('SBR') || r === 'RR' || r === 'RSR') return 'SBR';
  if (r === 'SL' || r === 'LS' || r === 'SURROUND_LEFT')  return 'SL';
  if (r === 'SR' || r === 'RS' || r === 'SURROUND_RIGHT') return 'SR';
  if (r === 'LW' || r === 'FWL' || r.includes('LEFT WIDE'))  return 'LW';
  if (r === 'RW' || r === 'FWR' || r.includes('RIGHT WIDE')) return 'RW';
  return r;
}
