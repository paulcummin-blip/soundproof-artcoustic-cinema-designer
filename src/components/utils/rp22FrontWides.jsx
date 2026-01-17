// components/utils/rp22FrontWides.js
// Canonical RP22 Front Wide median angle calculation (spatial midpoint method)

// Null-safe numeric check
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Extract position from any speaker shape
const getPos = (s) => {
  if (!s) return null;
  if (s.position && isNum(s.position.x) && isNum(s.position.y)) return s.position;
  if (s.pos && isNum(s.pos.x) && isNum(s.pos.y)) return s.pos;
  if (isNum(s.x) && isNum(s.y)) return { x: s.x, y: s.y };
  return null;
};

// Normalize role to canonical form
const normalizeRole = (role) => {
  const r = String(role || '').toUpperCase().trim();
  
  // Front speakers
  if (r === 'FL' || r === 'L') return 'FL';
  if (r === 'FR' || r === 'R') return 'FR';
  
  // Side surrounds
  if (r === 'SL' || r === 'LS') return 'SL';
  if (r === 'SR' || r === 'RS') return 'SR';
  
  // Front wides
  if (r === 'LW' || r === 'FWL' || r === 'WL' || r === 'LFW') return 'LW';
  if (r === 'RW' || r === 'FWR' || r === 'WR' || r === 'RFW') return 'RW';
  
  return null;
};

// Azimuth from MLP to point (0° = front/+Y, 90° = right/+X, CCW)
const azimuthFromMLP = (mlp, p) => {
  if (!mlp || !p || !isNum(mlp.x) || !isNum(mlp.y) || !isNum(p.x) || !isNum(p.y)) return null;
  const dx = p.x - mlp.x;
  const dy = p.y - mlp.y;
  const deg = Math.atan2(dx, dy) * 180 / Math.PI;
  return (deg + 360) % 360;
};

// Circular angular difference (always positive, 0-180°)
const circDelta = (a, b) => {
  if (!isNum(a) || !isNum(b)) return null;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Ray intersection with room walls
const rayIntersectWall = (mlpPoint, azDeg, roomDims, wallInsetM) => {
  const azRad = azDeg * Math.PI / 180;
  const dx = Math.sin(azRad);
  const dy = Math.cos(azRad);
  
  const W = roomDims.widthM || 0;
  const L = roomDims.lengthM || 0;
  const inset = wallInsetM || 0.05;
  
  let tMin = Infinity;
  let bestX = null;
  let bestY = null;
  
  // Left wall (x = inset)
  if (dx < 0) {
    const t = (inset - mlpPoint.x) / dx;
    if (t > 0) {
      const y = mlpPoint.y + t * dy;
      if (y >= inset && y <= L - inset && t < tMin) {
        tMin = t;
        bestX = inset;
        bestY = y;
      }
    }
  }
  
  // Right wall (x = W - inset)
  if (dx > 0) {
    const t = (W - inset - mlpPoint.x) / dx;
    if (t > 0) {
      const y = mlpPoint.y + t * dy;
      if (y >= inset && y <= L - inset && t < tMin) {
        tMin = t;
        bestX = W - inset;
        bestY = y;
      }
    }
  }
  
  // Front wall (y = inset)
  if (dy < 0) {
    const t = (inset - mlpPoint.y) / dy;
    if (t > 0) {
      const x = mlpPoint.x + t * dx;
      if (x >= inset && x <= W - inset && t < tMin) {
        tMin = t;
        bestX = x;
        bestY = inset;
      }
    }
  }
  
  // Back wall (y = L - inset)
  if (dy > 0) {
    const t = (L - inset - mlpPoint.y) / dy;
    if (t > 0) {
      const x = mlpPoint.x + t * dx;
      if (x >= inset && x <= W - inset && t < tMin) {
        tMin = t;
        bestX = x;
        bestY = y;
      }
    }
  }
  
  if (tMin === Infinity || bestX === null || bestY === null) {
    return null;
  }
  
  return { x: bestX, y: bestY };
};

// RP22 P7 level from deviation
const levelForP7 = (devDeg) => {
  if (!isNum(devDeg)) return null;
  if (devDeg <= 2) return 'L4';
  if (devDeg <= 5) return 'L3';
  if (devDeg <= 7) return 'L2';
  if (devDeg <= 10) return 'L1';
  return 'FAIL';
};

/**
 * Compute RP22 Front Wide median angle data (spatial midpoint method)
 * 
 * @param {Object} params
 * @param {Object} params.mlpPoint - { x, y } MLP position
 * @param {Array} params.placedSpeakers - Array of speaker objects
 * @param {Object} params.roomDims - { widthM, lengthM }
 * @param {number} params.wallInsetM - Inset from walls (default 0.05m)
 * @returns {Object} Median angle data with status, targets, deviations, level
 */
export function computeRp22FrontWideMedianData({
  mlpPoint,
  placedSpeakers,
  roomDims,
  wallInsetM = 0.05
}) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const debug = {
    rolesFound: speakers.map(s => s?.role).filter(Boolean),
    missing: []
  };
  
  // Guard: no MLP
  if (!mlpPoint || !isNum(mlpPoint.x) || !isNum(mlpPoint.y)) {
    debug.missing.push('mlp');
    return {
      status: 'no_data',
      hasWides: false,
      medianAzLeftDeg: null,
      medianAzRightDeg: null,
      targetLW: null,
      targetRW: null,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // Guard: invalid room
  const W = roomDims?.widthM || 0;
  const L = roomDims?.lengthM || 0;
  if (!(W > 0 && L > 0)) {
    debug.missing.push('roomDims');
    return {
      status: 'no_data',
      hasWides: false,
      medianAzLeftDeg: null,
      medianAzRightDeg: null,
      targetLW: null,
      targetRW: null,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // Build role map
  const byRole = new Map();
  for (const spk of speakers) {
    const canon = normalizeRole(spk?.role);
    if (canon && !byRole.has(canon)) {
      byRole.set(canon, spk);
    }
  }
  
  // Find anchor speakers (FL, FR, SL, SR)
  const FL = byRole.get('FL');
  const FR = byRole.get('FR');
  const SL = byRole.get('SL');
  const SR = byRole.get('SR');
  const LW = byRole.get('LW');
  const RW = byRole.get('RW');
  
  const posFL = getPos(FL);
  const posFR = getPos(FR);
  const posSL = getPos(SL);
  const posSR = getPos(SR);
  const posLW = getPos(LW);
  const posRW = getPos(RW);
  
  // Check anchors
  if (!posFL || !posFR || !posSL || !posSR) {
    if (!posFL) debug.missing.push('FL');
    if (!posFR) debug.missing.push('FR');
    if (!posSL) debug.missing.push('SL');
    if (!posSR) debug.missing.push('SR');
    
    return {
      status: 'missing_anchors',
      hasWides: !!(posLW && posRW),
      medianAzLeftDeg: null,
      medianAzRightDeg: null,
      targetLW: null,
      targetRW: null,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // Compute spatial midpoints (RP22 definition)
  const midpointLeft = {
    x: (posFL.x + posSL.x) / 2,
    y: (posFL.y + posSL.y) / 2
  };
  
  const midpointRight = {
    x: (posFR.x + posSR.x) / 2,
    y: (posFR.y + posSR.y) / 2
  };
  
  // Compute median azimuths
  const medianAzLeftDeg = azimuthFromMLP(mlpPoint, midpointLeft);
  const medianAzRightDeg = azimuthFromMLP(mlpPoint, midpointRight);
  
  if (!isNum(medianAzLeftDeg) || !isNum(medianAzRightDeg)) {
    return {
      status: 'no_data',
      hasWides: !!(posLW && posRW),
      medianAzLeftDeg: null,
      medianAzRightDeg: null,
      targetLW: null,
      targetRW: null,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // Compute target positions on walls
  const targetLW = rayIntersectWall(mlpPoint, medianAzLeftDeg, { widthM: W, lengthM: L }, wallInsetM);
  const targetRW = rayIntersectWall(mlpPoint, medianAzRightDeg, { widthM: W, lengthM: L }, wallInsetM);
  
  if (!targetLW || !targetRW) {
    return {
      status: 'no_data',
      hasWides: !!(posLW && posRW),
      medianAzLeftDeg,
      medianAzRightDeg,
      targetLW: null,
      targetRW: null,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // If wides don't exist or have no positions, we can't compute deviations
  const hasWides = !!(posLW && posRW);
  
  if (!hasWides) {
    return {
      status: 'ok',
      hasWides: false,
      medianAzLeftDeg,
      medianAzRightDeg,
      targetLW,
      targetRW,
      lwDevDeg: null,
      rwDevDeg: null,
      maxDevDeg: null,
      level: null,
      debug
    };
  }
  
  // Compute actual azimuths
  const actualLWaz = azimuthFromMLP(mlpPoint, posLW);
  const actualRWaz = azimuthFromMLP(mlpPoint, posRW);
  
  // Compute deviations
  const lwDevDeg = circDelta(actualLWaz, medianAzLeftDeg);
  const rwDevDeg = circDelta(actualRWaz, medianAzRightDeg);
  
  const maxDevDeg = isNum(lwDevDeg) && isNum(rwDevDeg) 
    ? Math.max(lwDevDeg, rwDevDeg)
    : (isNum(lwDevDeg) ? lwDevDeg : rwDevDeg);
  
  const level = levelForP7(maxDevDeg);
  
  return {
    status: 'ok',
    hasWides: true,
    medianAzLeftDeg,
    medianAzRightDeg,
    targetLW,
    targetRW,
    lwDevDeg,
    rwDevDeg,
    maxDevDeg,
    level,
    debug
  };
}