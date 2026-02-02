/**
 * P5 Surround Ring Gap Calculator - Single source of truth
 * Used by both HUD metrics and plan view overlay
 */

// Helper: compute azimuth from seat to point (0° = forward, +° = right, −° = left)
const azimuthDegFromSeat = (seat, pt) => {
  if (!seat || !pt) return null;
  const dx = Number(pt.x) - Number(seat.x);
  const dy = Number(pt.y) - Number(seat.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const rad = Math.atan2(dx, -dy);
  let deg = rad * (180 / Math.PI);
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg;
};

/**
 * Test if a role is eligible for P5 surround ring
 * Includes: SL, SR, SBL, SBR, LW, RW + extra surrounds (SL2/SR2/SL3/SR3...)
 */
export function isEligibleP5Surround(role) {
  if (!role) return false;
  const roleUpper = String(role).toUpperCase();
  
  // Base surrounds
  if (['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(roleUpper)) return true;
  
  // Extra surrounds pattern
  const extraPattern = /^(SL|SR)\d+$/;
  return extraPattern.test(roleUpper);
}

/**
 * Compute surround ring gaps from a seat's perspective
 * Returns { worstGapDeg, gaps[], sortedSurrounds[] }
 */
export function computeSurroundRingGaps({ seat, speakers, getCanonicalRole }) {
  if (!seat || !speakers?.length) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  // 1) Filter to eligible surrounds with valid positions
  const eligible = speakers.filter(s => {
    if (!s?.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y)) return false;
    
    const canon = getCanonicalRole ? getCanonicalRole(s.role) : String(s.role).toUpperCase();
    return isEligibleP5Surround(canon);
  });

  if (eligible.length < 2) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  // 2) Compute azimuth for each
  const withAzimuth = [];
  for (const sp of eligible) {
    const az = azimuthDegFromSeat(seat, sp.position);
    if (Number.isFinite(az)) {
      withAzimuth.push({ az, speaker: sp });
    }
  }

  if (withAzimuth.length < 2) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  // 3) Sort clockwise by azimuth
  const sorted = withAzimuth.sort((a, b) => a.az - b.az);

  // 4) Compute consecutive gaps (NO WRAP)
  // P5 NO WRAP: do not close the ring (never compute last->first gap).
  // We measure only adjacent pairs: i→i+1, never last→first.
  const gaps = [];
  let worstGapDeg = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    let gapDeg = next.az - current.az;
    if (gapDeg < 0) gapDeg += 360;
    
    gaps.push({
      deg: gapDeg,
      fromRole: current.speaker.role,
      toRole: next.speaker.role,
      fromAz: current.az,
      toAz: next.az,
    });

    if (gapDeg > worstGapDeg) {
      worstGapDeg = gapDeg;
    }
  }

  return {
    worstGapDeg,
    gaps,
    sortedSurrounds: sorted.map(s => s.speaker),
  };
}

/**
 * RP22 Level for P5 (no-wrap gaps)
 */
export function rp22LevelForP5(gapDeg) {
  if (!Number.isFinite(gapDeg)) return '—';
  if (gapDeg <= 45) return 'L4';
  if (gapDeg <= 60) return 'L3';
  if (gapDeg <= 90) return 'L2';
  return 'L1';
}