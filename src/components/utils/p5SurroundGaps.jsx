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
  // P5 NO WRAP: only i -> i+1, never last -> first
  const gaps = [];

  if (sorted.length < 2) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // Gap is simply next azimuth minus current azimuth (both ascending)
    const gapDeg = next.az - current.az;
    
    gaps.push({
      deg: gapDeg,
      fromRole: current.speaker.role,
      toRole: next.speaker.role,
      fromAz: current.az,
      toAz: next.az,
    });
  }

  // Belt-and-braces: Remove any accidental closing gap (last→first)
  // This should never happen with the loop above, but guards against future edits
  if (gaps.length > 0 && sorted.length > 0) {
    const firstRole = sorted[0].speaker.role;
    const lastRole = sorted[sorted.length - 1].speaker.role;
    const finalGap = gaps[gaps.length - 1];
    
    if (finalGap.fromRole === lastRole && finalGap.toRole === firstRole) {
      gaps.pop(); // Remove the closing gap
    }
  }

  // Compute worst gap from the no-wrap gaps only
  const worstGapDeg = gaps.length > 0 ? Math.max(...gaps.map(g => g.deg)) : null;

  // DEBUG: Build formatted debug strings (temporary)
  const sortedRoles = sorted.map(s => s.speaker.role).join(', ');
  const sortedAz = sorted.map(s => `${s.speaker.role}:${s.az.toFixed(1)}`).join(', ');
  const gapList = gaps.map(g => `${g.fromRole}→${g.toRole}:${g.deg.toFixed(1)}`).join(', ');
  const worstGap = gaps.length > 0 
    ? gaps.reduce((max, g) => g.deg > max.deg ? g : max, gaps[0])
    : null;
  const worstGapStr = worstGap ? `${worstGap.fromRole}→${worstGap.toRole}:${worstGap.deg.toFixed(1)}` : 'none';

  return {
    worstGapDeg,
    gaps,
    sortedSurrounds: sorted.map(s => s.speaker),
    // DEBUG fields (temporary)
    sortedRoles,
    sortedAz,
    gapList,
    worstGapStr,
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