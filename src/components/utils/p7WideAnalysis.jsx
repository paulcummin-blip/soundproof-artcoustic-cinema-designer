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

// RP22 P7 thresholds (degrees)
export function levelForP7(devDeg) {
  if (!N(devDeg)) return 1;
  if (devDeg <= 5)  return 4; // Excellent
  if (devDeg <= 10) return 3; // Good
  if (devDeg <= 15) return 2; // Acceptable
  return 1;                    // Poor
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

  const lvlLW = devLW != null ? levelForP7(devLW) : 1;
  const lvlRW = devRW != null ? levelForP7(devRW) : 1;

  const level = Math.min(lvlLW, lvlRW);

  return {
    details: {
      LW: { targetAngle: targetLeft,  actualAngle: LW, deviation: devLW },
      RW: { targetAngle: targetRight, actualAngle: RW, deviation: devRW },
    },
    level
  };
}

/**
 * Attach P7 into an existing engine result shape:
 * - engine.gradedParameters.primary[7] = { level }
 * - engine.p7Details = { LW:{...}, RW:{...} }
 */
export function attachP7ToEngine(engine, speakers, seats) {
  const base = engine || {};
  const { details, level } = computeP7Wides({ speakers, seats });
  const gp = base.gradedParameters || {};
  const primary = gp.primary || {};

  return {
    ...base,
    p7Details: details,
    gradedParameters: {
      ...gp,
      primary: {
        ...primary,
        7: { level }
      }
    }
  };
}