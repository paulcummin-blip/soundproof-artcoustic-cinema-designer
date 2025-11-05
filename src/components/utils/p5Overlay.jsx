// utils/p5Overlay.js
import { pickMLP } from './seatingUtils';
import { isP5SurroundRole } from './roles';

export const asArr = x => Array.isArray(x) ? x : [];
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// RP22 P5 thresholds: smaller angle is better
export function levelForP5(angleDeg) {
  if (angleDeg <= 50) return 4; // Excellent
  if (angleDeg <= 60) return 3; // Good
  if (angleDeg <= 80) return 2; // Acceptable
  return 1;                     // Poor
}

/**
 * Azimuth where:
 *  0° = forward (toward screen, i.e. -y)
 * 90° = right (+x)
 *180° = back (+y)
 *270° = left (-x)
 */
function azimuthFromMLP(mlp, p) {
  if (!mlp || !p || !isNum(mlp.x) || !isNum(mlp.y) || !isNum(p.x) || !isNum(p.y)) return 0;
  const dx = p.x - mlp.x;        // lateral
  const dyForward = mlp.y - p.y; // positive when speaker is toward the screen
  const a = Math.atan2(dx, dyForward) * 180 / Math.PI; // reference = forward
  return (a + 360) % 360;        // 0..360
}

export function computeP5Overlay({ speakers, seating }) {
  const spks = asArr(speakers);
  const seats = asArr(seating);
  if (!spks.length || !seats.length) return [];

  // Robust MLP selection
  const mlp = pickMLP(seats) || seats.find(s => s?.isPrimary) || seats[0];
  if (!mlp) return [];

  // Collect valid bed-layer surround speakers
  const surrounds = spks
    .filter(s => isP5SurroundRole(s.role) && s.position && isNum(s.position.x) && isNum(s.position.y))
    .map(s => ({
      id: s.id || s.role,
      role: s.role,
      position: s.position,
      azimuth: azimuthFromMLP(mlp, s.position)
    }))
    .sort((a, b) => a.azimuth - b.azimuth);

  if (surrounds.length < 2) return [];

  // Adjacent gaps (wrap around once)
  const overlays = [];
  for (let i = 0; i < surrounds.length; i++) {
    const A = surrounds[i];
    const B = surrounds[(i + 1) % surrounds.length];

    // Gap from A→B moving clockwise (0..360)
    const gap = (B.azimuth - A.azimuth + 360) % 360;
    const level = levelForP5(gap);

    overlays.push({
      id: `p5-${A.role}-${B.role}`,
      roleA: A.role,
      roleB: B.role,
      aPos: A.position,
      bPos: B.position,
      angle: Math.round(gap),
      level,
      note: `${A.role}↔${B.role}: ${Math.round(gap)}°`
    });
  }

  return overlays;
}