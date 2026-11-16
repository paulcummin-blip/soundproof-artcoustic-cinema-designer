// arcPathForBand.js
// Pure SVG arc-path builder for an RP22 overhead band, extracted from
// RoomVisualisation so the plan component stays under its size budget.
// Returns an SVG path string tracing the arc from minDeg to maxDeg at the
// given radius around (seatX, seatY), or null when the angle range is empty.

export function arcPathForBand(seatX, seatY, radiusM, minDeg, maxDeg, toPxFn) {
  const a0 = Number(minDeg);
  const a1 = Number(maxDeg);
  if (!Number.isFinite(a0) || !Number.isFinite(a1) || a1 <= a0) return null;
  const steps = 24;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (i * (a1 - a0) / steps);
    const rad = (t * Math.PI) / 180;
    const dx = Math.sin(rad) * radiusM;
    const dy = -Math.cos(rad) * radiusM;
    const [cx, cy] = toPxFn(seatX + dx, seatY + dy);
    pts.push(`${i === 0 ? 'M' : 'L'}${cx},${cy}`);
  }
  return pts.join(' ');
}

export default arcPathForBand;