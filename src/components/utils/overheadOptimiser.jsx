
// utils/overheadOptimiser.jsx
// Solid, side-effect free helper to (a) place overheads, (b) apply symmetric offset,
// (c) auto-optimise fore/aft vs RP22, (d) build a badge.
//
// Depends only on seats + speakers arrays. It *prefers* your existing helpers if available.

import { assessOverheadsRP22 } from './rp22Adapter';

const A = (x) => (Array.isArray(x) ? x : []);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Pick MLP: honour isPrimary, else middle seat of middle row */
export function pickMLPFromSeats(seats) {
  const S = A(seats);
  if (!S.length) return null;
  const flagged = S.find(s => s?.isPrimary);
  if (flagged) return flagged;

  const eps = 0.05;
  const rows = [];
  for (const s of S) {
    if (!isNum(s?.y)) continue;
    if (!rows.some(y => Math.abs(y - s.y) <= eps)) rows.push(s.y);
  }
  rows.sort((a,b)=>a-b);
  const midY = rows[Math.floor(rows.length/2)] ?? S[0].y;

  const rowSeats = S.filter(s => Math.abs(s.y - midY) <= eps).sort((a,b)=>a.x - b.x);
  return rowSeats[Math.floor(rowSeats.length/2)] || S[0];
}

export function countOverheads(speakers) {
  return A(speakers).filter(s => /^T(F|M|R)[LR]$/.test(String(s?.role||""))).length;
}

/** .2 placement: TML/TMR over MLP at MLP.y + offset; lateral by seat spacing */
export function placeTwoOverheadsOverMLP({ speakers, mlp, offsetM = 0 }) {
  if (!mlp) return speakers;
  const next = A(speakers).map(s => ({...s}));
  const tmlIdx = next.findIndex(s => s.role === 'TML');
  const tmrIdx = next.findIndex(s => s.role === 'TMR');
  if (tmlIdx === -1 || tmrIdx === -1) return next;

  const seatSpacing = mlp.seatSpacing ?? 0.6;
  const lateral = clamp(seatSpacing / 2, 0.25, 0.45);
  const y = mlp.y + (isNum(offsetM) ? offsetM : 0);

  next[tmlIdx] = {
    ...next[tmlIdx],
    position: { ...(next[tmlIdx].position||{}), x: mlp.x - lateral, y }
  };
  next[tmrIdx] = {
    ...next[tmrIdx],
    position: { ...(next[tmrIdx].position||{}), x: mlp.x + lateral, y }
  };
  return next;
}

/** Clamp TF/TR into sensible fore/aft bands so users can’t drag them into nonsense */
const depthBands = {
  TFL: { minFrac: 0.20, maxFrac: 0.40 },
  TFR: { minFrac: 0.20, maxFrac: 0.40 },
  TRL: { minFrac: 0.60, maxFrac: 0.80 },
  TRR: { minFrac: 0.60, maxFrac: 0.80 }
};
function clampToBand(role, y, room) {
  const band = depthBands[role];
  if (!band || !room) return y;
  const depth = (room?.yMax ?? 6) - (room?.yMin ?? 0);
  const minY = (room?.yMin ?? 0) + band.minFrac * depth;
  const maxY = (room?.yMin ?? 0) + band.maxFrac * depth;
  return clamp(y, minY, maxY);
}

/** Apply symmetric fore/aft offset: TF forward == TR back; .6 keeps middles fixed */
export function applySymmetricOffset({ speakers, overheadCount, offsetM = 0, room }) {
  const next = A(speakers).map(s => ({...s}));
  if (!overheadCount || !isNum(offsetM) || offsetM === 0) return next;

  const idx = (role) => next.findIndex(s => s.role === role);
  if (overheadCount === 2) {
    for (const r of ['TML','TMR']) {
      const i = idx(r);
      if (i !== -1 && next[i]?.position) next[i] = {
        ...next[i],
        position: { ...next[i].position, y: next[i].position.y + offsetM }
      };
    }
    return next;
  }
  // .4 / .6
  const pairs = [['TFL','TRL'], ['TFR','TRR']];
  for (const [F,R] of pairs) {
    const iF = idx(F), iR = idx(R);
    if (iF !== -1 && next[iF]?.position) next[iF] = {
      ...next[iF],
      position: { ...next[iF].position, y: clampToBand(F, next[iF].position.y - offsetM, room) } // front towards screen when +offset
    };
    if (iR !== -1 && next[iR]?.position) next[iR] = {
      ...next[iR],
      position: { ...next[iR].position, y: clampToBand(R, next[iR].position.y + offsetM, room) } // rear away from screen
    };
  }
  // .6: re-snap TML/TMR to midpoints in Y (X stays matched to fronts)
  if (overheadCount === 6) {
    const iTML = idx('TML'), iTMR = idx('TMR'), iTFL = idx('TFL'), iTRL = idx('TRL'), iTFR = idx('TFR'), iTRR = idx('TRR');
    if (iTML !== -1 && iTFL !== -1 && iTRL !== -1 && next[iTFL]?.position && next[iTRL]?.position) {
      const yMid = (next[iTFL].position.y + next[iTRL].position.y)/2;
      next[iTML] = { ...next[iTML], position: { ...(next[iTML].position||{}), x: next[iTFL].position.x, y: yMid } };
    }
    if (iTMR !== -1 && iTFR !== -1 && iTRR !== -1 && next[iTFR]?.position && next[iTRR]?.position) {
      const yMid = (next[iTFR].position.y + next[iTRR].position.y)/2;
      next[iTMR] = { ...next[iTMR], position: { ...(next[iTMR].position||{}), x: next[iTFR].position.x, y: yMid } };
    }
  }
  return next;
}

/** RP22-lite scoring for offsets (prefers using your engine if available) */
function angleAtSeat(sp, seat, zTop) {
  const ear = seat?.earHeight ?? 1.2;
  const v = Math.max(0.2, (zTop ?? 2.4) - ear);
  const dx = sp.position.x - seat.x;
  const dy = sp.position.y - seat.y;
  const r = Math.hypot(dx, dy);
  const elev = Math.atan2(v, r) * 180 / Math.PI;      // 90° straight above
  const az   = Math.atan2(Math.abs(dy), Math.max(0.001, Math.abs(dx))) * 180 / Math.PI; // fore/aft vs lateral
  return { elev, az };
}

function scoreOverheadBlock(speakers, seats, roomHeight) {
  // Soft target: elevation near 90°, azimuth small; average across seats/overheads
  const overs = A(speakers).filter(s => /^T(F|M|R)[LR]$/.test(s?.role) && s?.position);
  const tgtSeats = A(seats);
  if (!overs.length || !tgtSeats.length) return 0;

  let total = 0, n = 0;
  for (const seat of tgtSeats) {
    for (const sp of overs) {
      const { elev, az } = angleAtSeat(sp, seat, roomHeight);
      const elevScore = Math.max(0, 1 - Math.abs(elev - 90) / 30); // 1 @ 90°, 0 @ 60/120
      const azScore   = Math.max(0, 1 - (az / 30));                 // 1 @ 0°, 0 @ 30°
      total += 0.7*elevScore + 0.3*azScore;
      n++;
    }
  }
  return n ? total / n : 0;
}

/** Optimise fore/aft offset by scanning a range; prefers your RP22 engine if provided */
export function optimiseOverheadOffset({
  speakersBase, seats, room, roomHeight = 2.4, rowTarget = 'front',
  assessRP22 // optional: (speakers, seatsSubset, roomHeight) => level (1..4) or score
}) {
  const overheadCount = countOverheads(A(speakersBase));
  if (!overheadCount) return { bestOffset: 0, bestScore: 0, bestLevel: 1 };

  // Target rows: 'front' / 'back' / 'both' / 'all'
  const eps = 0.05;
  const rows = [];
  for (const s of A(seats)) {
    if (!isNum(s?.y)) continue;
    if (!rows.some(y => Math.abs(y - s.y) <= eps)) rows.push(s.y);
  }
  rows.sort((a,b)=>a-b);
  let chosenRows = rows;
  if (rowTarget === 'front') chosenRows = rows.slice(0,1);
  else if (rowTarget === 'back') chosenRows = rows.slice(-1);
  else if (rowTarget === 'both') chosenRows = rows.length >= 2 ? [rows[0], rows[rows.length-1]] : rows;

  const seatsSubset = A(seats).filter(s => chosenRows.some(y => Math.abs(y - s.y) <= eps));
  const mlp = pickMLPFromSeats(seatsSubset.length ? seatsSubset : A(seats));

  // Make a fresh projection function
  const project = (offsetM) => {
    let projected = A(speakersBase).map(s => ({...s}));
    if (overheadCount === 2) {
      projected = placeTwoOverheadsOverMLP({ speakers: projected, mlp, offsetM });
    } else {
      projected = applySymmetricOffset({ speakers: projected, overheadCount, offsetM, room });
    }
    return projected;
  };

  let bestOffset = 0, bestScore = -1, bestLevel = 1;
  for (let off = -1.5; off <= 1.5; off = +(off + 0.05).toFixed(2)) {
    const candidate = project(off);
    let score, level;

    if (typeof assessRP22 === 'function') {
      // user-supplied RP22 assessment wins
      const result = assessRP22(candidate, seatsSubset.length ? seatsSubset : A(seats), roomHeight);
      if (result && typeof result === 'object') {
        level = Number(result.worstLevel) || 1;
        score = level; // prioritise level
      } else {
        score = Number(result) || 0;
        level = Math.max(1, Math.min(4, Math.round(score * 4)));
      }
    } else {
      // geometric fallback
      score = scoreOverheadBlock(candidate, seatsSubset.length ? seatsSubset : A(seats), roomHeight);
      level = Math.max(1, Math.min(4, Math.round(score * 4)));
    }

    if (level > bestLevel || (level === bestLevel && score > bestScore)) {
      bestLevel = level;
      bestScore = score;
      bestOffset = off;
    }
  }
  return { bestOffset, bestScore, bestLevel };
}

/** One-stop function used by UI: returns projected speakers + badge */
export function projectOverheadsWithMode({
  speakersBase, seats, room, roomHeight, rowTarget,
  mode = 'optimised', manualOffsetM = 0,
  engineRP22 // <— pass your analysis engine here
}) {
  const base = A(speakersBase);
  const S = A(seats);
  const overheadCount = countOverheads(base);
  if (!overheadCount) return { speakersProjected: base, badge: null };

  let offset = 0;
  const mlp = pickMLPFromSeats(S);
  if (mode === 'manual') {
    offset = manualOffsetM || 0;
  } else {
    const { bestOffset } = optimiseOverheadOffset({
      speakersBase: base, seats: S, room, roomHeight, rowTarget,
      assessRP22: (cand, ss, h) => assessOverheadsRP22({ speakersProjected: cand, seats: ss, roomHeight: h, engine: engineRP22 })
    });
    offset = bestOffset;
  }

  let projected = base.map(s => ({...s}));
  if (overheadCount === 2) {
    projected = placeTwoOverheadsOverMLP({ speakers: projected, mlp, offsetM: offset });
  } else {
    projected = applySymmetricOffset({ speakers: projected, overheadCount, offsetM: offset, room });
  }

  // True badge:
  const { worstLevel, breakdown } = assessOverheadsRP22({
    speakersProjected: projected, seats: S, roomHeight, engine: engineRP22
  });

  return {
    speakersProjected: projected,
    badge: { overallLevel: worstLevel, perParam: breakdown },
    offsetUsed: offset,
    overheadCount
  };
}
