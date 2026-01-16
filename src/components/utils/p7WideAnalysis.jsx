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
 * Compute P7 details:
 * - TargetLeft  = median angle of L and LS
 * - TargetRight = median angle of R and RS
 * - Actual      = LW / RW azimuth
 * - Deviation   = |Actual - Target| (circular)
 * Returns { details: { LW:{targetAngle, actualAngle, deviation}, RW:{...} }, level }
 */
export function computeP7Wides({ speakers = [], seats = [] }) {
  const spk = A(speakers);
  const mlp = pickMLP(A(seats)) || null;
  if (!mlp) return { details: null, level: 1 };

  const byRole = new Map(spk.map(s => [String(s?.role || '').toUpperCase(), s]));

  const pos = (role) => byRole.get(role)?.position || null;
  const az  = (role) => {
    const p = pos(role);
    const a = azimuthFromMLP(mlp, p);
    return N(a) ? a : null;
  };

  // Required anchors (try best-effort fallbacks on each side)
  const L  = az('L');
  const R  = az('R');
  const LS = az('LS') ?? az('LSS') ?? az('LRS') ?? az('LBS'); // any left surround family
  const RS = az('RS') ?? az('RSS') ?? az('RRS') ?? az('RBS'); // any right surround family

  // If either side is missing a pair, we can't evaluate that side
  const targetLeft  = (L  != null && LS != null) ? (L + LS) / 2 : null;
  const targetRight = (R  != null && RS != null) ? (R + RS) / 2 : null;

  const LW = az('LW');
  const RW = az('RW');

  const devLW = (LW != null && targetLeft  != null) ? circDelta(LW, targetLeft)   : null;
  const devRW = (RW != null && targetRight != null) ? circDelta(RW, targetRight)  : null;

  const lvlLW = devLW != null ? levelForP7(devLW) : 'FAIL';
  const lvlRW = devRW != null ? levelForP7(devRW) : 'FAIL';

  // Worst level wins (L4 > L3 > L2 > L1 > FAIL)
  const levelOrder = { 'L4': 4, 'L3': 3, 'L2': 2, 'L1': 1, 'FAIL': 0 };
  const level = levelOrder[lvlLW] < levelOrder[lvlRW] ? lvlLW : lvlRW;

  // Max deviation for display
  const maxDev = Math.max(devLW ?? 0, devRW ?? 0);
  const displayValue = Number.isFinite(maxDev) ? `±${Math.floor(maxDev)}°` : '—';

  return {
    details: {
      LW: { targetAngle: targetLeft,  actualAngle: LW, deviation: devLW },
      RW: { targetAngle: targetRight, actualAngle: RW, deviation: devRW },
    },
    level,
    maxDeviation: maxDev,
    displayValue
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