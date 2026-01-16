// components/utils/frontWideMedian.js
// CANONICAL RP22 P7 FRONT WIDE MEDIAN ANGLE LOGIC
// This is the ONLY place where Front Wide median angle math is allowed.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Canonical role normalization (single source of truth)
const normalizeRole = (role) => {
  const r = String(role || '').toUpperCase().trim();
  
  // Front Left
  if (r === 'FL' || r === 'L') return 'FL';
  // Front Right
  if (r === 'FR' || r === 'R') return 'FR';
  // Side Left
  if (r === 'SL' || r === 'LS') return 'SL';
  // Side Right
  if (r === 'SR' || r === 'RS') return 'SR';
  // Front Wide Left
  if (r === 'LW' || r === 'FWL') return 'LW';
  // Front Wide Right
  if (r === 'RW' || r === 'FWR') return 'RW';
  
  return null;
};

// Extract position from speaker (handles multiple shapes)
const getPos = (s) => {
  if (!s) return null;
  if (s.position && isNum(s.position.x) && isNum(s.position.y)) return s.position;
  if (s.pos && isNum(s.pos.x) && isNum(s.pos.y)) return s.pos;
  if (isNum(s.x) && isNum(s.y)) return { x: s.x, y: s.y };
  return null;
};

// Minimal circular angular difference
const circDelta = (a, b) => {
  if (!isNum(a) || !isNum(b)) return null;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// RP22 P7 grading thresholds
const levelForP7 = (devDeg) => {
  if (!isNum(devDeg)) return null;
  if (devDeg <= 2) return 'L4';
  if (devDeg <= 5) return 'L3';
  if (devDeg <= 7) return 'L2';
  if (devDeg <= 10) return 'L1';
  return 'FAIL';
};

// Ray intersection with room boundary
const rayIntersect = (mlpPoint, azimuthDeg, roomDims, targetWall, wallInset) => {
  const azRad = azimuthDeg * Math.PI / 180;
  const dx = Math.sin(azRad);
  const dy = Math.cos(azRad);
  
  const W = roomDims.widthM;
  const L = roomDims.lengthM;
  const inset = wallInset;
  
  let tMin = Infinity;
  
  // Left wall (x = inset)
  if (targetWall === 'left' && dx < 0) {
    const t = (inset - mlpPoint.x) / dx;
    if (t > 0) {
      const y = mlpPoint.y + t * dy;
      if (y >= inset && y <= L - inset) tMin = Math.min(tMin, t);
    }
  }
  
  // Right wall (x = W - inset)
  if (targetWall === 'right' && dx > 0) {
    const t = (W - inset - mlpPoint.x) / dx;
    if (t > 0) {
      const y = mlpPoint.y + t * dy;
      if (y >= inset && y <= L - inset) tMin = Math.min(tMin, t);
    }
  }
  
  // Check front/back walls as fallback
  if (tMin === Infinity) {
    // Front wall (y = inset)
    if (dy < 0) {
      const t = (inset - mlpPoint.y) / dy;
      if (t > 0) {
        const x = mlpPoint.x + t * dx;
        if (x >= inset && x <= W - inset) tMin = Math.min(tMin, t);
      }
    }
    
    // Back wall (y = L - inset)
    if (dy > 0) {
      const t = (L - inset - mlpPoint.y) / dy;
      if (t > 0) {
        const x = mlpPoint.x + t * dx;
        if (x >= inset && x <= W - inset) tMin = Math.min(tMin, t);
      }
    }
  }
  
  if (tMin === Infinity) {
    // Fallback: place near MLP
    return { x: mlpPoint.x + dx * 0.5, y: mlpPoint.y + dy * 0.5 };
  }
  
  // Place slightly inside boundary (95% of distance)
  const safeT = tMin * 0.95;
  return {
    x: mlpPoint.x + safeT * dx,
    y: mlpPoint.y + safeT * dy
  };
};

/**
 * Compute canonical RP22 Front Wide median angle data
 * This is the ONLY function that calculates median angles for Front Wides.
 * 
 * RP22 Definition:
 * - Median point = spatial midpoint between FL and SL (and FR-SR)
 * - Median azimuth = angle from MLP to that spatial midpoint
 * - Target position = where that ray hits the side wall
 * - Deviation = circular difference between actual LW/RW angle and median angle
 * 
 * @param {Object} params
 * @param {Object} params.mlpPoint - { x, y } MLP position
 * @param {Array} params.placedSpeakers - Array of speaker objects
 * @param {Object} params.roomDims - { widthM, lengthM }
 * @param {number} [params.wallInset=0.05] - Safety inset from walls (meters)
 * @returns {Object} Canonical median angle data
 */
export function computeFrontWideMedianData({ 
  mlpPoint, 
  placedSpeakers = [], 
  roomDims, 
  wallInset = 0.05 
}) {
  // Validate MLP
  if (!mlpPoint || !isNum(mlpPoint.x) || !isNum(mlpPoint.y)) {
    return {
      status: 'no_data',
      reason: 'missing MLP',
      left: null,
      right: null,
      maxDeviation: null,
      level: null
    };
  }
  
  // Validate room dimensions
  if (!roomDims || !isNum(roomDims.widthM) || !isNum(roomDims.lengthM)) {
    return {
      status: 'no_data',
      reason: 'missing room dimensions',
      left: null,
      right: null,
      maxDeviation: null,
      level: null
    };
  }
  
  // Build normalized speaker map
  const byRole = new Map();
  for (const s of placedSpeakers) {
    const normalized = normalizeRole(s?.role);
    if (normalized && !byRole.has(normalized)) {
      const pos = getPos(s);
      if (pos) {
        byRole.set(normalized, { ...s, position: pos });
      }
    }
  }
  
  // Find required speakers
  const FL = byRole.get('FL');
  const FR = byRole.get('FR');
  const SL = byRole.get('SL');
  const SR = byRole.get('SR');
  const LW = byRole.get('LW');
  const RW = byRole.get('RW');
  
  // Check for Front Wides presence
  const hasWides = !!(LW && RW);
  
  // Check for anchor speakers
  if (!FL || !FR || !SL || !SR) {
    return {
      status: 'missing_anchors',
      reason: 'missing FL/FR/SL/SR',
      hasWides,
      left: null,
      right: null,
      maxDeviation: null,
      level: null
    };
  }
  
  // If no wides, return no_data (not an error, just not applicable)
  if (!hasWides) {
    return {
      status: 'no_data',
      reason: 'no Front Wides present',
      hasWides: false,
      left: null,
      right: null,
      maxDeviation: null,
      level: null
    };
  }
  
  // ========================================================================
  // LEFT SIDE: RP22 Spatial Median Calculation
  // ========================================================================
  
  // 1. Spatial midpoint between FL and SL
  const leftMidX = (FL.position.x + SL.position.x) / 2;
  const leftMidY = (FL.position.y + SL.position.y) / 2;
  
  // 2. Median azimuth from MLP to spatial midpoint
  const leftDx = leftMidX - mlpPoint.x;
  const leftDy = leftMidY - mlpPoint.y;
  const leftMedianAz = (Math.atan2(leftDx, leftDy) * 180 / Math.PI + 360) % 360;
  
  // 3. Target position on left wall
  const leftTargetPos = rayIntersect(mlpPoint, leftMedianAz, roomDims, 'left', wallInset);
  
  // 4. Actual LW azimuth
  const lwDx = LW.position.x - mlpPoint.x;
  const lwDy = LW.position.y - mlpPoint.y;
  const lwActualAz = (Math.atan2(lwDx, lwDy) * 180 / Math.PI + 360) % 360;
  
  // 5. Deviation
  const leftDeviation = circDelta(lwActualAz, leftMedianAz);
  
  // ========================================================================
  // RIGHT SIDE: RP22 Spatial Median Calculation
  // ========================================================================
  
  // 1. Spatial midpoint between FR and SR
  const rightMidX = (FR.position.x + SR.position.x) / 2;
  const rightMidY = (FR.position.y + SR.position.y) / 2;
  
  // 2. Median azimuth from MLP to spatial midpoint
  const rightDx = rightMidX - mlpPoint.x;
  const rightDy = rightMidY - mlpPoint.y;
  const rightMedianAz = (Math.atan2(rightDx, rightDy) * 180 / Math.PI + 360) % 360;
  
  // 3. Target position on right wall
  const rightTargetPos = rayIntersect(mlpPoint, rightMedianAz, roomDims, 'right', wallInset);
  
  // 4. Actual RW azimuth
  const rwDx = RW.position.x - mlpPoint.x;
  const rwDy = RW.position.y - mlpPoint.y;
  const rwActualAz = (Math.atan2(rwDx, rwDy) * 180 / Math.PI + 360) % 360;
  
  // 5. Deviation
  const rightDeviation = circDelta(rwActualAz, rightMedianAz);
  
  // ========================================================================
  // P7 Grading
  // ========================================================================
  
  const maxDeviation = Math.max(leftDeviation ?? 0, rightDeviation ?? 0);
  const level = levelForP7(maxDeviation);
  
  return {
    status: 'ok',
    hasWides: true,
    left: {
      medianAz: leftMedianAz,
      targetPosition: leftTargetPos,
      actualAz: lwActualAz,
      deviation: leftDeviation
    },
    right: {
      medianAz: rightMedianAz,
      targetPosition: rightTargetPos,
      actualAz: rwActualAz,
      deviation: rightDeviation
    },
    maxDeviation,
    level
  };
}