// utils/rp22Adapter.js
// Bridges the optimiser to your RP22 engine, but won’t crash if the engine isn’t ready.

const asArr = (x) => (Array.isArray(x) ? x : []);

export function assessOverheadsRP22({ speakersProjected, seats, roomHeight, engine }) {
  try {
    if (engine && typeof engine.assessOverheads === 'function') {
      // Preferred: your engine returns { worstLevel, breakdown }
      const res = engine.assessOverheads(speakersProjected, seats, roomHeight);
      if (res && typeof res === 'object') return res;
    }
  } catch (e) {
    // non-fatal: fall through to geometric fallback
    console.warn('RP22 engine assessOverheads failed; using fallback.', e);
  }

  // Minimal, deterministic fallback so UI still works:
  const overs = asArr(speakersProjected).filter(s => /^T(F|M|R)[LR]$/.test(String(s?.role||"")) && s.position);
  const tgtSeats = asArr(seats);
  if (!overs.length || !tgtSeats.length) {
    return { worstLevel: 1, breakdown: { 9:1, 10:1, 11:1, 13:1 } };
  }

  // Naive scoring: penalize distance from above & asymmetry
  let elevScore = 0, n=0;
  for (const seat of tgtSeats) {
    const ear = seat.earHeight ?? 1.2;
    for (const sp of overs) {
      const dx = sp.position.x - seat.x;
      const dy = sp.position.y - seat.y;
      const r  = Math.hypot(dx, dy);
      const v  = Math.max(0.2, (roomHeight ?? 2.4) - ear);
      const elev = Math.atan2(v, r) * 180 / Math.PI;
      const s = Math.max(0, 1 - Math.abs(elev - 90)/30); // 1 at 90°, 0 at 60/120
      elevScore += s; n++;
    }
  }
  const avg = n ? elevScore/n : 0;
  const level = Math.max(1, Math.min(4, Math.round(avg*4)));
  return { worstLevel: level, breakdown: { 9: level, 10: level, 11: level, 13: level } };
}