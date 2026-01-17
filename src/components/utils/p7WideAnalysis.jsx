// p7WideAnalysis.js
// RP22 P7 for front wides: deviation from the median between LW & RW

import { computeFrontWideMedianData, gradeP7FromMaxDev } from './frontWideMedian';
import { pickMLP } from './seatingUtils';

const A = (x) => (Array.isArray(x) ? x : []);
const N = (v) => typeof v === 'number' && Number.isFinite(v);

// Extract x,y from speaker (handles multiple shapes: position, pos, or flat)
const getXY = (s) => {
  if (!s) return null;

  // common shapes in this app
  if (s.position && N(s.position.x) && N(s.position.y)) return { x: s.position.x, y: s.position.y };
  if (s.pos && N(s.pos.x) && N(s.pos.y)) return { x: s.pos.x, y: s.pos.y };

  // sometimes flattened
  if (N(s.x) && N(s.y)) return { x: s.x, y: s.y };

  return null;
};

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
 * Compute P7 details using canonical RP22 spatial median helper
 * Returns { enabled, details, level, maxDeviation, displayValue, debug }
 */
export function computeP7Wides({ speakers = [], seats = [], mlpOverride = null, widthM = 0, lengthM = 0 }) {
  const spk = A(speakers);
  const mlp = mlpOverride || pickMLP(A(seats)) || null;
  
  // Call canonical median helper
  const median = computeFrontWideMedianData({
    placedSpeakers: spk,
    mlpPoint: mlp,
    widthM,
    lengthM,
    wallInset: 0.05,
  });

  const maxDev = median?.status === 'ok' ? median.maxDev : null;
  const grade = gradeP7FromMaxDev(maxDev);

  const clean = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const displayValue = N(maxDev) ? `±${Math.floor(maxDev)}°` : '—';

  return {
    enabled: median?.status === 'ok' && median?.hasWides,
    hasWides: !!median?.hasWides,
    valueDeg: clean(maxDev),
    details: median?.status === 'ok' ? {
      LW: { 
        targetAngle: clean(median.left?.medianAz), 
        actualAngle: clean(median.left?.actualAz), 
        deviation: clean(median.left?.dev) 
      },
      RW: { 
        targetAngle: clean(median.right?.medianAz), 
        actualAngle: clean(median.right?.actualAz), 
        deviation: clean(median.right?.dev) 
      },
    } : null,
    level: grade.label,
    maxDeviation: clean(maxDev),
    displayValue,
    debug: {
      status: median?.status || 'no_data',
      hasWides: !!median?.hasWides,
      maxDev: clean(maxDev),
      leftDev: clean(median?.left?.dev),
      rightDev: clean(median?.right?.dev),
    }
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