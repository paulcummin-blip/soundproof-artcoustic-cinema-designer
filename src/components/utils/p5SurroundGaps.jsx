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
 * 
 * CRITICAL: Sorts by theta (0..360°) instead of azimuth (-180..+180°).
 * This ensures SBL/SBR are adjacent (both near 180°), not split across ±180 boundary.
 * NO WRAP: drops the FRONT gap (near 0°/360°), preserves the REAR gap.
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

  // 2) Compute azimuth AND theta for each speaker
  const withAzimuth = [];
  for (const sp of eligible) {
    const az = azimuthDegFromSeat(seat, sp.position);
    if (Number.isFinite(az)) {
      // Convert azimuth (-180..+180) to theta (0..360)
      // 0° = front/screen, clockwise positive
      const theta = (az + 360) % 360;
      withAzimuth.push({ az, theta, speaker: sp });
    }
  }

  if (withAzimuth.length < 2) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  // 3) Sort by theta (0..360°), NOT azimuth
  const sorted = withAzimuth.sort((a, b) => a.theta - b.theta);

  // 4) Compute consecutive gaps using theta (NO WRAP)
  // NO WRAP: only i → i+1, never last → first
  // This drops the FRONT gap (360° → 0°), preserves the REAR gap
  const gaps = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // Gap = difference in theta (both ascending in 0..360)
    const gapDeg = next.theta - current.theta;
    
    gaps.push({
      deg: gapDeg,
      fromRole: current.speaker.role,
      toRole: next.speaker.role,
      fromAz: current.az,
      toAz: next.az,
      fromTheta: current.theta,
      toTheta: next.theta,
    });
  }

  // Compute worst gap from no-wrap gaps only
  const worstGapDeg = gaps.length > 0 ? Math.max(...gaps.map(g => g.deg)) : null;

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