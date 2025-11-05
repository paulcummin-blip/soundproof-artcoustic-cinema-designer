// Pure, framework-free functions for per-seat RP22 metrics.
// IMPORTANT: named exports only; import with:  import * as SeatRP22 from '@/components/utils/seatRp22Metrics'

const DEG = 180 / Math.PI;
const hypot2 = (dx, dy) => Math.hypot(dx, dy);

const isLCR = role => role === 'FL' || role === 'FC' || role === 'FR';
const isOverhead = role =>
  /^TF|^TM|^TR|^Top|^OH|^FHL|^FHR|^RHL|^RHR/i.test(role) || role === 'FHL' || role === 'FHR' || role === 'RHL' || role === 'RHR';
const isSurround = role => !isLCR(role) && !isOverhead(role) && role !== 'LFE';

export function p1_nearestWallM(seat, roomW, roomL) {
  if (!seat || !Number.isFinite(roomW) || !Number.isFinite(roomL)) return null;
  // Screen-anchored: x=0 centreline, y=0 screen plane
  const halfW = roomW / 2;
  const dSide = Math.max(0, halfW - Math.abs(seat.x));
  const dFront = Math.max(0, seat.y);          // y from screen plane
  const dBack  = Math.max(0, roomL - seat.y);  // to back wall
  return Math.min(dSide, dFront, dBack);
}

export function p1_level(dM) {
  if (dM == null) return null;
  // L4 ≥1.5  | L3 ≥1.2 | L2 ≥0.8 | L1 ≥0.5 | otherwise "Below L1"
  if (dM >= 1.5) return 'L4';
  if (dM >= 1.2) return 'L3';
  if (dM >= 0.8) return 'L2';
  if (dM >= 0.5) return 'L1';
  return 'Below L1';
}

// SPL difference helper. If sensitivity/power unknown, deltas reduce to distance terms only.
function splAtSeat({ seat, spk, sensitivityDb = 0, powerW = 1 }) {
  const dx = spk.x - seat.x;
  const dy = spk.y - seat.y;
  const d  = Math.max(0.01, hypot2(dx, dy));
  return sensitivityDb + 10 * Math.log10(Math.max(1e-9, powerW)) - 20 * Math.log10(d);
}

function maxPairwiseDelta(values) {
  if (!values || values.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const d = Math.abs(values[i] - values[j]);
      if (d > max) max = d;
    }
  }
  return max;
}

// ----- P4: Max SPL delta between FL/FC/FR at this seat -----
export function p4_screenSplDeltaDb(seat, speakers, perSpeakerMeta = {}) {
  if (!seat || !Array.isArray(speakers)) return null;
  const lcr = speakers.filter(s => isLCR(s.role) && s.position);
  if (lcr.length < 2) return null;
  const vals = lcr.map(s => {
    const meta = perSpeakerMeta[s.id] || {};
    return splAtSeat({ seat, spk: s.position, sensitivityDb: meta.sensitivityDb, powerW: meta.powerW });
  });
  return maxPairwiseDelta(vals);
}

export function p4_level(db) {
  if (db == null) return null;
  // Max: L4 ≤2 | L3 ≤4 | L2 ≤5 | L1 ≤6 | else N/A
  if (db <= 2) return 'L4';
  if (db <= 4) return 'L3';
  if (db <= 5) return 'L2';
  if (db <= 6) return 'L1';
  return 'N/A';
}

// ----- P5: Max horizontal angle gap between adjacent surrounds -----
export function p5_surroundMaxGapDeg(seat, speakers) {
  if (!seat || !Array.isArray(speakers)) return null;
  const sur = speakers.filter(s => isSurround(s.role) && s.position);
  if (sur.length < 2) return null;
  const angles = sur.map(s => Math.atan2(s.position.x - seat.x, s.position.y - seat.y) * DEG)
                    .sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < angles.length; i++) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  // wrap gap
  maxGap = Math.max(maxGap, 360 - (angles[angles.length - 1] - angles[0]));
  return maxGap;
}

export function p5_level(deg) {
  if (deg == null) return null;
  // Max: L4 ≤50 | L3 ≤60 | L2 ≤80 | else L1
  if (deg <= 50) return 'L4';
  if (deg <= 60) return 'L3';
  if (deg <= 80) return 'L2';
  return 'L1';
}

// ----- P6: Max SPL delta between surrounds -----
export function p6_surroundSplDeltaDb(seat, speakers, perSpeakerMeta = {}) {
  if (!seat || !Array.isArray(speakers)) return null;
  const sur = speakers.filter(s => isSurround(s.role) && s.position);
  if (sur.length < 2) return null;
  const vals = sur.map(s => {
    const meta = perSpeakerMeta[s.id] || {};
    return splAtSeat({ seat, spk: s.position, sensitivityDb: meta.sensitivityDb, powerW: meta.powerW });
  });
  return maxPairwiseDelta(vals);
}

export function p6_level(db) {
  if (db == null) return null;
  // Max: L4 ≤2 | L3 ≤4 | L2 ≤6 | L1 ≤10 | else N/A
  if (db <= 2) return 'L4';
  if (db <= 4) return 'L3';
  if (db <= 6) return 'L2';
  if (db <= 10) return 'L1';
  return 'N/A';
}

// ----- P9: Max vertical gap between adjacent overhead rows -----
export function p9_overheadRowGapDeg(seat, speakers) {
  if (!seat || !Array.isArray(speakers)) return null;
  // group per row: Front/Mid/Rear by y relative to seat; we average L/R if both exist
  const rows = { front: [], mid: [], rear: [] };
  speakers.forEach(s => {
    if (!isOverhead(s.role) || !s.position) return;
    // crude row classifier using y ahead/behind the seat
    const dy = (s.position.y - seat.y);
    if (dy < -0.5) rows.front.push(s.position);
    else if (dy > 0.5) rows.rear.push(s.position);
    else rows.mid.push(s.position);
  });
  const rowElev = row => {
    const arr = rows[row];
    if (!arr.length) return null;
    const mean = arr.reduce((acc, p) => acc + Math.atan2(p.y - seat.y, p.z - (seat.z || 1.2)) * DEG, 0) / arr.length;
    return mean;
  };
  const f = rowElev('front');
  const m = rowElev('mid');
  const r = rowElev('rear');
  const diffs = [];
  if (f != null && m != null) diffs.push(Math.abs(f - m));
  if (m != null && r != null) diffs.push(Math.abs(m - r));
  if (!diffs.length) return null;
  return Math.max(...diffs);
}

export function p9_level(deg) {
  if (deg == null) return null;
  // Max: L4 ≤50 | L3 ≤60 | L2 ≤80 | else L1
  if (deg <= 50) return 'L4';
  if (deg <= 60) return 'L3';
  if (deg <= 80) return 'L2';
  return 'L1';
}

// ----- P10: Max SPL delta between overheads -----
export function p10_overheadSplDeltaDb(seat, speakers, perSpeakerMeta = {}) {
  if (!seat || !Array.isArray(speakers)) return null;
  const oh = speakers.filter(s => isOverhead(s.role) && s.position);
  if (oh.length < 2) return null;
  const vals = oh.map(s => {
    const meta = perSpeakerMeta[s.id] || {};
    return splAtSeat({ seat, spk: s.position, sensitivityDb: meta.sensitivityDb, powerW: meta.powerW });
  });
  return maxPairwiseDelta(vals);
}

export function p10_level(db) {
  if (db == null) return null;
  // Max: L4 ≤2 | L3 ≤5 | L2 ≤8 | L1 ≤12 | else N/A
  if (db <= 2) return 'L4';
  if (db <= 5) return 'L3';
  if (db <= 8) return 'L2';
  if (db <= 12) return 'L1';
  return 'N/A';
}

// Placeholders for FR-based metrics (show "–")
export const p16_screenFrVarianceDb = () => null;
export const p17_surUpperFrVarianceDb = () => null;
export const p20_lfConsistencyDb = () => null;