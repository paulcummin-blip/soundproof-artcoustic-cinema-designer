import React from 'react';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

// This overlay assumes the plan uses the same coordinate space as your speakers (metres).
// It draws simple dimension "arms" from the nearest wall and a label.
export default function SpeakerPositionsOverlay({
  speakers = [],
  seatingPositions = [],
  dimensions,
  view = 'off', // 'off' | 'plan' | 'both'
}) {
  if (!(view === 'plan' || view === 'both')) return null;

  const W = Number(dimensions?.width || dimensions?.widthM || 0);
  const L = Number(dimensions?.length || dimensions?.lengthM || 0);
  if (!(W > 0 && L > 0)) return null;

  const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map(s => s?.y)
    .filter(isNum)
    .sort((a,b)=>a-b);

  const rows = [];
  for (const y of ys) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(y - last) > 0.20) rows.push(y);
  }

  const bedHeight = (speakerY) => {
    if (rows.length < 2) return 1.2;
    const row2Y = rows[1];
    const row3Y = rows[2];
    if (isNum(row3Y) && speakerY > row3Y) return 1.8;
    if (speakerY > row2Y) return 1.5;
    return 1.2;
  };

  const bedSpeakers = (Array.isArray(speakers) ? speakers : [])
    .filter(s => {
      const role = String(s?.role || '').toUpperCase();
      if (!role) return false;
      if (role === 'SUB' || role === 'LFE') return false;
      if (role.startsWith('T')) return false;
      const x = s?.position?.x, y = s?.position?.y;
      return isNum(x) && isNum(y);
    });

  return (
    <g>
      {bedSpeakers.map((s, idx) => {
        const x = s.position.x;
        const y = s.position.y;
        const role = String(s.role).toUpperCase();

        // nearest wall
        const dFront = y, dBack = L - y, dLeft = x, dRight = W - x;
        let wall = 'front', wallDist = dFront;
        if (dBack < wallDist) { wall = 'back'; wallDist = dBack; }
        if (dLeft < wallDist) { wall = 'left'; wallDist = dLeft; }
        if (dRight < wallDist){ wall = 'right'; wallDist = dRight; }

        const along = (wall === 'front' || wall === 'back') ? x : y;
        const runLen = (wall === 'front' || wall === 'back') ? W : L;
        const nearestEnd = Math.min(along, runLen - along);

        const h = bedHeight(y);

        // Draw a simple "L" measurement: from wall to speaker
        const x0 = wall === 'left' ? 0 : wall === 'right' ? W : x;
        const y0 = wall === 'front' ? 0 : wall === 'back' ? L : y;
        const x1 = x;
        const y1 = y;

        const label = `${role}  ${mToCm(along)}cm  ${mToCm(nearestEnd)}cm  H${mToCm(h)}cm`;

        return (
          <g key={`${role}-${idx}`}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#213428" strokeWidth={0.01} opacity={0.7} />
            <rect x={x1 + 0.05} y={y1 - 0.08} width={2.2} height={0.18} fill="#FFFFFF" stroke="#DCDBD6" strokeWidth={0.01} rx={0.03}/>
            <text x={x1 + 0.10} y={y1 + 0.04} fontSize={0.12} fill="#1B1A1A">
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}