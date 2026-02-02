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
 * CRITICAL: Uses HORSESHOE ordering (LW → SL → SL2 → ... → SBL → SBR → ... → SR2 → SR → RW)
 * NOT azimuth-sorted adjacency. This ensures:
 * - SBL↔SBR gap always exists (rear angle label appears)
 * - LW↔RW gap never exists (never adjacent)
 * - Extra surrounds (SL2/SR2...) are correctly inserted
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

  // 2) Compute azimuth for each speaker (for gap calculation)
  const speakerAzimuths = new Map();
  for (const sp of eligible) {
    const az = azimuthDegFromSeat(seat, sp.position);
    if (Number.isFinite(az)) {
      speakerAzimuths.set(sp, az);
    }
  }

  if (speakerAzimuths.size < 2) {
    return { worstGapDeg: null, gaps: [], sortedSurrounds: [] };
  }

  // 3) Build HORSESHOE order: LW → SL → SL2 → SL3 → ... → SBL → SBR → ... → SR3 → SR2 → SR → RW
  const horseshoeOrder = [];
  
  // Build role map for quick lookup
  const speakerByCanonRole = new Map();
  for (const sp of eligible) {
    const canon = getCanonicalRole ? getCanonicalRole(sp.role) : String(sp.role).toUpperCase();
    speakerByCanonRole.set(canon, sp);
  }
  
  // Helper to extract SL/SR extra number (e.g., "SL2" → 2, "SR3" → 3)
  const extractExtraNumber = (role) => {
    const match = String(role).match(/^(SL|SR)(\d+)$/);
    return match ? parseInt(match[2], 10) : 0;
  };
  
  // Left side: LW → SL → SL2 → SL3 → ... (ascending extras)
  if (speakerByCanonRole.has('LW')) horseshoeOrder.push(speakerByCanonRole.get('LW'));
  if (speakerByCanonRole.has('SL')) horseshoeOrder.push(speakerByCanonRole.get('SL'));
  
  // SL extras (ascending order: SL2, SL3, SL4...)
  const slExtras = Array.from(speakerByCanonRole.keys())
    .filter(r => /^SL\d+$/.test(r))
    .sort((a, b) => extractExtraNumber(a) - extractExtraNumber(b));
  for (const role of slExtras) {
    horseshoeOrder.push(speakerByCanonRole.get(role));
  }
  
  // Rear: SBL → SBR
  if (speakerByCanonRole.has('SBL')) horseshoeOrder.push(speakerByCanonRole.get('SBL'));
  if (speakerByCanonRole.has('SBR')) horseshoeOrder.push(speakerByCanonRole.get('SBR'));
  
  // Right side: ... → SR3 → SR2 → SR → RW (descending extras)
  const srExtras = Array.from(speakerByCanonRole.keys())
    .filter(r => /^SR\d+$/.test(r))
    .sort((a, b) => extractExtraNumber(b) - extractExtraNumber(a)); // Descending
  for (const role of srExtras) {
    horseshoeOrder.push(speakerByCanonRole.get(role));
  }
  
  if (speakerByCanonRole.has('SR')) horseshoeOrder.push(speakerByCanonRole.get('SR'));
  if (speakerByCanonRole.has('RW')) horseshoeOrder.push(speakerByCanonRole.get('RW'));
  
  // 4) Compute gaps along horseshoe order (angle between rays)
  const gaps = [];
  
  for (let i = 0; i < horseshoeOrder.length - 1; i++) {
    const current = horseshoeOrder[i];
    const next = horseshoeOrder[i + 1];
    
    const a1 = speakerAzimuths.get(current);
    const a2 = speakerAzimuths.get(next);
    
    if (!Number.isFinite(a1) || !Number.isFinite(a2)) continue;
    
    // Compute smallest angle between two rays (handles ±180 boundary)
    let d = a2 - a1;
    d = ((d + 540) % 360) - 180; // Normalize to -180..+180
    const gapDeg = Math.abs(d); // 0..180
    
    gaps.push({
      deg: gapDeg,
      fromRole: current.role,
      toRole: next.role,
      fromAz: a1,
      toAz: a2,
    });
  }

  // Compute worst gap from horseshoe gaps only
  const worstGapDeg = gaps.length > 0 ? Math.max(...gaps.map(g => g.deg)) : null;

  // DEBUG: Build formatted debug strings (temporary)
  const sortedRoles = horseshoeOrder.map(s => s.role).join(', ');
  const sortedAz = horseshoeOrder.map(s => `${s.role}:${speakerAzimuths.get(s)?.toFixed(1) || '—'}`).join(', ');
  const gapList = gaps.map(g => `${g.fromRole}→${g.toRole}:${g.deg.toFixed(1)}`).join(', ');
  const worstGap = gaps.length > 0 
    ? gaps.reduce((max, g) => g.deg > max.deg ? g : max, gaps[0])
    : null;
  const worstGapStr = worstGap ? `${worstGap.fromRole}→${worstGap.toRole}:${worstGap.deg.toFixed(1)}` : 'none';

  return {
    worstGapDeg,
    gaps,
    sortedSurrounds: horseshoeOrder,
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