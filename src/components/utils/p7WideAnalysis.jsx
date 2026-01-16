// p7WideAnalysis.js
// RP22 P7 for front wides: deviation from the median between LW & RW

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
  if (!N(devDeg)) return null;
  if (devDeg <= 2)  return 'L4';
  if (devDeg <= 5)  return 'L3';
  if (devDeg <= 7)  return 'L2';
  if (devDeg <= 10) return 'L1';
  return 'FAIL';
}

// Normalize front wide role aliases to canonical LW/RW
function normalizeFrontWideRole(role) {
  if (!role) return null;
  const r = String(role).toUpperCase().trim();
  
  // Exact matches
  if (r === 'LW' || r === 'FWL' || r === 'FRONT_WIDE_L' || r === 'FRONTWIDEL') return 'LW';
  if (r === 'RW' || r === 'FWR' || r === 'FRONT_WIDE_R' || r === 'FRONTWIDER') return 'RW';
  
  // Pattern matches: contains "WIDE" and ends with L/R
  if (r.includes('WIDE')) {
    if (r.endsWith('L')) return 'LW';
    if (r.endsWith('R')) return 'RW';
  }
  
  return null;
}

/**
 * Compute P7 details using MLP → wide speaker midpoint approach
 * - medianPoint = midpoint of LW and RW positions
 * - medianAzDeg = azimuth from MLP to medianPoint
 * - lwAzDeg, rwAzDeg = azimuths from MLP to each wide
 * - Deviation = |actualAz - medianAz| (circular)
 * Returns { enabled, details, level, maxDeviation, displayValue, debug }
 */
export function computeP7Wides({ speakers = [], seats = [], mlpOverride = null }) {
  const spk = A(speakers);
  const mlp = mlpOverride || pickMLP(A(seats)) || null;
  
  // Build role inventory for debug
  const rawRoles = spk.map(s => s?.role).filter(Boolean);
  const uniqueRoles = [...new Set(rawRoles)];
  
  // Debug object for all intermediate values
  const debug = {
    speakerCount: spk.length,
    rolesFound: uniqueRoles.join(', ') || 'none',
    lwRoleRaw: null,
    rwRoleRaw: null,
    lwHasPos: false,
    rwHasPos: false,
    hasWides: false,
    mlp: mlp ? `(${mlp.x.toFixed(2)}, ${mlp.y.toFixed(2)})` : '—',
    medianAzDeg: null,
    lwAzDeg: null,
    rwAzDeg: null,
    lwDevDeg: null,
    rwDevDeg: null,
    maxDevDeg: null,
  };

  if (!mlp) {
    return { 
      enabled: false,
      hasWides: false,
      valueDeg: null,
      details: null, 
      level: null,
      maxDeviation: null,
      displayValue: '—',
      debug
    };
  }

  // Build normalized role map
  const byRole = new Map();
  for (const s of spk) {
    const normalized = normalizeFrontWideRole(s?.role);
    if (normalized && !byRole.has(normalized)) {
      byRole.set(normalized, s);
    }
  }

  const lwSpeaker = byRole.get('LW') || null;
  const rwSpeaker = byRole.get('RW') || null;
  
  const posLW = lwSpeaker?.position || null;
  const posRW = rwSpeaker?.position || null;

  // Debug role detection
  debug.lwRoleRaw = lwSpeaker?.role || null;
  debug.rwRoleRaw = rwSpeaker?.role || null;
  debug.lwHasPos = !!(posLW && N(posLW.x) && N(posLW.y));
  debug.rwHasPos = !!(posRW && N(posRW.x) && N(posRW.y));

  // Check if wides are present
  const hasLW = posLW && N(posLW.x) && N(posLW.y);
  const hasRW = posRW && N(posRW.x) && N(posRW.y);
  debug.hasWides = hasLW && hasRW;

  if (!hasLW || !hasRW) {
    return {
      enabled: false,
      hasWides: false,
      valueDeg: null,
      details: null,
      level: null,
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

  const lvlLW = devLW != null ? levelForP7(devLW) : null;
  const lvlRW = devRW != null ? levelForP7(devRW) : null;

  // Worst level wins (L4 > L3 > L2 > L1 > FAIL > null)
  const levelOrder = { 'L4': 4, 'L3': 3, 'L2': 2, 'L1': 1, 'FAIL': 0 };
  let level = null;
  if (lvlLW !== null && lvlRW !== null) {
    const lwVal = levelOrder[lvlLW] ?? -1;
    const rwVal = levelOrder[lvlRW] ?? -1;
    level = lwVal < rwVal ? lvlLW : lvlRW;
  }

  // Max deviation for display
  const maxDev = Math.max(devLW ?? 0, devRW ?? 0);
  debug.maxDevDeg = N(maxDev) ? Math.floor(maxDev * 10) / 10 : null;
  
  const displayValue = Number.isFinite(maxDev) ? `±${Math.floor(maxDev)}°` : '—';

  return {
    enabled: true,
    hasWides: true,
    valueDeg: maxDev,
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