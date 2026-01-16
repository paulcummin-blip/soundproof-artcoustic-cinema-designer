// p7WideAnalysis.js
// RP22 P7 for front wides: deviation from the median between L & LS (left), R & RS (right)

import { isP5SurroundRole } from './roles'; // we already added this
import { pickMLP } from './seatingUtils';

const A = (x) => (Array.isArray(x) ? x : []);
const N = (v) => typeof v === 'number' && Number.isFinite(v);

function azimuthFromMLP(mlp, p) {
  if (!mlp || !p || !N(mlp.x) || !N(mlp.y) || !N(p.x) || !N(p.y)) return null;
  const dx = p.x - mlp.x;   // lateral (+ right)
  const dy = p.y - mlp.y;   // fore/aft (+ back)
  const deg = Math.atan2(dx, dy) * 180 / Math.PI; // 0 = front, + = right, - = left
  return (deg + 360) % 360; // 0..360
}

function circDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d; // minimal angular difference
}

// RP22 P7 thresholds (degrees) - updated to match RP22 spec
export function levelForP7(devDeg) {
  if (!N(devDeg)) return 'FAIL';
  if (devDeg <= 2)  return 'L4';
  if (devDeg <= 5)  return 'L3';
  if (devDeg <= 7)  return 'L2';
  if (devDeg <= 10) return 'L1';
  return 'FAIL';
}

/**
 * Compute P7 details using MLP → wide speaker midpoint approach
 * - medianPoint = midpoint of LW and RW positions
 * - medianAzDeg = azimuth from MLP to medianPoint
 * - lwAzDeg, rwAzDeg = azimuths from MLP to each wide
 * - Deviation = |actualAz - medianAz| (circular)
 * Returns { details, level, maxDeviation, displayValue, debug }
 */
export function computeP7Wides({ speakers = [], seats = [], mlpOverride = null }) {
  const spk = A(speakers);
  const mlp = mlpOverride || pickMLP(A(seats)) || null;
  
  // Debug object for all intermediate values
  const debug = {
    hasWides: false,
    mlp: mlp ? { x: mlp.x, y: mlp.y } : null,
    medianAzDeg: null,
    lwAzDeg: null,
    rwAzDeg: null,
    lwDevDeg: null,
    rwDevDeg: null,
    maxDevDeg: null,
    foundRoles: spk.map(s => s?.role).filter(Boolean), // Debug: what roles are in the array
  };

  if (!mlp) {
    return { 
      details: null, 
      level: 'FAIL', 
      maxDeviation: null,
      displayValue: '—',
      debug
    };
  }

  // Normalize role aliases: FWL → LW, FWR → RW
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'FWL') return 'LW';
    if (r === 'FWR') return 'RW';
    return r;
  };

  const byRole = new Map(spk.map(s => [normalizeRole(s?.role), s]));

  const posLW = byRole.get('LW')?.position || null;
  const posRW = byRole.get('RW')?.position || null;

  // Check if wides are present
  const hasLW = posLW && N(posLW.x) && N(posLW.y);
  const hasRW = posRW && N(posRW.x) && N(posRW.y);
  debug.hasWides = hasLW && hasRW;

  if (!hasLW || !hasRW) {
    return {
      details: null,
      level: 'FAIL',
      maxDeviation: null,
      displayValue: '—',
      debug
    };
  }

  // Compute median point (midpoint of LW and RW)
  const medianPoint = {
    x: (posLW.x + posRW.x) / 2,
    y: (posLW.y + posRW.y) / 2
  };

  // Compute azimuths
  const medianAz = azimuthFromMLP(mlp, medianPoint);
  const lwAz = azimuthFromMLP(mlp, posLW);
  const rwAz = azimuthFromMLP(mlp, posRW);

  debug.medianAzDeg = N(medianAz) ? Math.floor(medianAz) : null;
  debug.lwAzDeg = N(lwAz) ? Math.floor(lwAz) : null;
  debug.rwAzDeg = N(rwAz) ? Math.floor(rwAz) : null;

  // Compute deviations (circular delta)
  const devLW = (N(lwAz) && N(medianAz)) ? circDelta(lwAz, medianAz) : null;
  const devRW = (N(rwAz) && N(medianAz)) ? circDelta(rwAz, medianAz) : null;

  debug.lwDevDeg = N(devLW) ? Math.floor(devLW * 10) / 10 : null;
  debug.rwDevDeg = N(devRW) ? Math.floor(devRW * 10) / 10 : null;

  const lvlLW = devLW != null ? levelForP7(devLW) : 'FAIL';
  const lvlRW = devRW != null ? levelForP7(devRW) : 'FAIL';

  // Worst level wins (L4 > L3 > L2 > L1 > FAIL)
  const levelOrder = { 'L4': 4, 'L3': 3, 'L2': 2, 'L1': 1, 'FAIL': 0 };
  const level = levelOrder[lvlLW] < levelOrder[lvlRW] ? lvlLW : lvlRW;

  // Max deviation for display
  const maxDev = Math.max(devLW ?? 0, devRW ?? 0);
  debug.maxDevDeg = N(maxDev) ? Math.floor(maxDev * 10) / 10 : null;
  
  const displayValue = Number.isFinite(maxDev) ? `±${Math.floor(maxDev)}°` : '—';

  return {
    details: {
      LW: { targetAngle: medianAz, actualAngle: lwAz, deviation: devLW },
      RW: { targetAngle: medianAz, actualAngle: rwAz, deviation: devRW },
    },
    level,
    maxDeviation: maxDev,
    displayValue,
    debug
  };
}

/**
 * Attach P7 into an existing engine result shape:
 * - engine.gradedParameters.primary[7] = { level, formatted }
 * - engine.p7Details = { LW:{...}, RW:{...} }
 */
export function attachP7ToEngine(engine, speakers, seats) {
  const base = engine || {};
  const { details, level, displayValue } = computeP7Wides({ speakers, seats });
  const gp = base.gradedParameters || {};
  const primary = gp.primary || {};

  return {
    ...base,
    p7Details: details,
    gradedParameters: {
      ...gp,
      primary: {
        ...primary,
        7: { level, formatted: displayValue }
      }
    }
  };
}