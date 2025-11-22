// components/utils/rp22UpperAnalysis.js
// RP22 Parameter 9: Maximum allowable vertical angle between adjacent rows of upper speakers

export function computeUpperRowAnglesAndP9({
  seats,
  overheadSpeakers,
  dimensions,
  getCanonicalRole,
}) {
  if (!Array.isArray(seats) || !Array.isArray(overheadSpeakers)) {
    return { perSeat: {}, mlp: null };
  }

  const { heightM } = dimensions || {};
  const spkZ = Number.isFinite(heightM) ? heightM : 2.4;

  // Group overheads by canonical role
  const byRole = new Map();
  for (const spk of overheadSpeakers) {
    const canon = getCanonicalRole?.(spk.role) || spk.role;
    if (typeof canon !== 'string') continue;
    if (!canon.startsWith('T')) continue;
    byRole.set(canon, spk);
  }

  function avgRowCenter(roles) {
    const pts = [];
    for (const r of roles) {
      const spk = byRole.get(r);
      const pos = spk?.position;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        pts.push({ x: pos.x, y: pos.y });
      }
    }
    if (!pts.length) return null;
    const sx = pts.reduce((s, p) => s + p.x, 0);
    const sy = pts.reduce((s, p) => s + p.y, 0);
    return { x: sx / pts.length, y: sy / pts.length };
  }

  const rowDefs = {
    front: ['TFL', 'TFR', 'TFC'],
    mid: ['TL', 'TR', 'TML', 'TMR'],
    rear: ['TBL', 'TBR', 'TBC'],
  };

  const perSeat = {};

  for (const seat of seats) {
    const { id, x: sx, y: sy, earHeightM } = seat;
    if (!id || !Number.isFinite(sx) || !Number.isFinite(sy)) continue;

    const earZ = Number.isFinite(earHeightM) ? earHeightM : 1.2;
    const dz = spkZ - earZ;

    const frontC = avgRowCenter(rowDefs.front);
    const midC = avgRowCenter(rowDefs.mid);
    const rearC = avgRowCenter(rowDefs.rear);

    function elevDeg(rowC) {
      if (!rowC) return null;
      const dx = rowC.x - sx;
      const dy = rowC.y - sy;
      const horiz = Math.hypot(dx, dy);
      if (!horiz || !Number.isFinite(dz)) return null;
      const rad = Math.atan2(dz, horiz);
      return (rad * 180) / Math.PI;
    }

    const frontDeg = elevDeg(frontC);
    const midDeg = elevDeg(midC);
    const rearDeg = elevDeg(rearC);

    const gaps = [];
    if (frontDeg != null && midDeg != null) gaps.push(Math.abs(frontDeg - midDeg));
    if (midDeg != null && rearDeg != null) gaps.push(Math.abs(midDeg - rearDeg));

    const p9GapDeg = gaps.length ? Math.max(...gaps) : null;

    let p9Level = null;
    if (p9GapDeg != null) {
      if (p9GapDeg <= 50) p9Level = 'L4';
      else if (p9GapDeg <= 60) p9Level = 'L3';
      else if (p9GapDeg <= 80) p9Level = 'L2';
      else p9Level = 'L1';
    }

    perSeat[id] = {
      frontDeg,
      midDeg,
      rearDeg,
      p9GapDeg,
      p9Level,
    };
  }

  return { perSeat, mlp: null };
}