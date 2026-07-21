// components/utils/rp22/seatMetrics.js
// Pure functions. Distances in meters; angles in degrees.
// NAMED EXPORTS ONLY (no default export)

import { levelP20_lfConsistency } from '@/components/utils/rp22/levels';

const isFiniteNum = (v) => Number.isFinite(v);

/** ---------------- P1: nearest wall distance ---------------- */
export function metricP1_nearestWallM({ seat, room, screenPlaneOffsetM = 0 }) {
  const widthM  = Number(room?.widthM)  || 0;
  const lengthM = Number(room?.lengthM) || 0;
  if (!seat || !isFiniteNum(widthM) || !isFiniteNum(lengthM)) return null;

  const x = Number(seat.x);
  const yFromScreenPlane = Number(seat.y);

  if (!isFiniteNum(x) || !isFiniteNum(yFromScreenPlane)) return null;

  const yPhysical = yFromScreenPlane + (Number(screenPlaneOffsetM) || 0);

  const left  = Math.max(0, x);
  const right = Math.max(0, widthM - x);
  const front = Math.max(0, yPhysical);
  const back  = Math.max(0, lengthM - yPhysical);

  return Math.min(left, right, front, back);
}

export function levelP1_forNearestM(m) {
  if (!isFiniteNum(m)) return null;
  if (m > 1.5) return 'L4';
  if (m > 1.2) return 'L3';
  if (m > 0.8) return 'L2';
  if (m > 0.5) return 'L1';
  return 'N/A';
}

/** ---------------- Helpers used by several metrics ---------------- */
function angleDeg(dx, dy) {
  const rad = Math.atan2(dy, dx);
  let deg = rad * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function hypot3(dx, dy, dz = 0) { 
  return Math.hypot(dx, dy, dz); 
}

function maxPairwiseAbsDelta(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++)
      max = Math.max(max, Math.abs(arr[i] - arr[j]));
  return max;
}

/** SPL at listener using 1W/1m sensitivity (no crest / no losses) */
export function splAtListener_1W1m(sensDb_1w1m, powerW, distanceM) {
  if (!isFiniteNum(sensDb_1w1m) || !isFiniteNum(powerW) || !isFiniteNum(distanceM) || distanceM <= 0) return null;
  return sensDb_1w1m + 10 * Math.log10(powerW) - 20 * Math.log10(distanceM);
}

/** ---------------- P4: screen LCR SPL delta (per seat) ---------------- */
export function metricP4_maxScreenSPLDeltaDb({ seat, lcr, sensDb_1w1m, powerW }) {
  if (!seat || !lcr || !isFiniteNum(sensDb_1w1m) || !isFiniteNum(powerW)) return null;
  const dists = ['FL', 'FC', 'FR']
    .map(role => lcr[role])
    .filter(Boolean)
    .map(spk => hypot3(spk.x - seat.x, spk.y - seat.y, (spk.z ?? 0) - (seat.z ?? 0)));
  if (dists.length < 2) return null;
  const spls = dists.map(d => splAtListener_1W1m(sensDb_1w1m, powerW, d)).filter(isFiniteNum);
  if (spls.length < 2) return null;
  return maxPairwiseAbsDelta(spls);
}

export function levelP4_forDeltaDb(v) {
  if (!isFiniteNum(v)) return null;
  if (v <= 2) return 'L4';
  if (v <= 4) return 'L3';
  if (v <= 5) return 'L2';
  if (v <= 6) return 'L1';
  return 'N/A';
}

/** ---------------- P5: max horiz gap between surrounds ---------------- */
export function metricP5_maxHorizGapDeg({ seat, surrounds }) {
  if (!seat || !Array.isArray(surrounds) || surrounds.length < 2) return null;
  const az = surrounds.map(s => angleDeg(s.x - seat.x, s.y - seat.y)).sort((a,b)=>a-b);
  if (az.length < 2) return null;
  let maxGap = 0;
  for (let i = 0; i < az.length; i++) {
    const a = az[i], b = az[(i+1)%az.length];
    const gap = (i === az.length - 1) ? (360 - a + b) : (b - a);
    maxGap = Math.max(maxGap, gap);
  }
  return maxGap;
}

export function levelP5_forGapDeg(v) {
  if (!isFiniteNum(v)) return null;
  if (v <= 50) return 'L4';
  if (v <= 60) return 'L3';
  if (v <= 80) return 'L2';
  return 'L1';
}

/** ---------------- P6: surround SPL delta ---------------- */
export function metricP6_maxSurSPLDeltaDb({ seat, surrounds, sensDb_1w1m, powerW }) {
  if (!seat || !Array.isArray(surrounds) || surrounds.length < 2 || !isFiniteNum(sensDb_1w1m) || !isFiniteNum(powerW)) return null;
  const spls = surrounds
    .map(s => splAtListener_1W1m(sensDb_1w1m, powerW, hypot3(s.x - seat.x, s.y - seat.y, (s.z ?? 0) - (seat.z ?? 0))))
    .filter(isFiniteNum);
  if (spls.length < 2) return null;
  return maxPairwiseAbsDelta(spls);
}

export function levelP6_forDeltaDb(v) {
  if (!isFiniteNum(v)) return null;
  if (v <= 2) return 'L4';
  if (v <= 4) return 'L3';
  if (v <= 6) return 'L2';
  if (v <= 10) return 'L1';
  return 'N/A';
}

/** ---------------- P9: max vertical gap between upper rows ---------------- */
export function metricP9_maxUpperVertGapDeg({ seat, upperRows }) {
  // upperRows: { front:[L?,R?], mid:[L?,R?], rear:[L?,R?] } any missing allowed
  if (!seat || !upperRows) return null;
  const rowNames = ['front','mid','rear'];
  const rowElev = rowNames.map(name => {
    const pair = upperRows[name];
    if (!pair) return null;
    const pts = [pair.left, pair.right].filter(Boolean);
    if (pts.length === 0) return null;
    const elevs = pts.map(p => {
      const dx = p.x - seat.x, dy = p.y - seat.y, dz = (p.z ?? 0) - (seat.z ?? 0);
      const dist = Math.hypot(dx, dy);
      return Math.atan2(dz, dist) * 180 / Math.PI;
    });
    return elevs.reduce((a,b)=>a+b,0) / elevs.length;
  }).filter(isFiniteNum);
  if (rowElev.length < 2) return null;
  let max = 0;
  for (let i=0;i<rowElev.length-1;i++) max = Math.max(max, Math.abs(rowElev[i+1]-rowElev[i]));
  return max;
}

export function levelP9_forGapDeg(v) {
  if (!isFiniteNum(v)) return null;
  if (v <= 50) return 'L4';
  if (v <= 60) return 'L3';
  if (v <= 80) return 'L2';
  return 'L1';
}

/** ---------------- P10: upper SPL delta ---------------- */
export function metricP10_maxUpperSPLDeltaDb({ seat, uppers, sensDb_1w1m, powerW }) {
  if (!seat || !Array.isArray(uppers) || uppers.length < 2 || !isFiniteNum(sensDb_1w1m) || !isFiniteNum(powerW)) return null;
  const spls = uppers
    .map(p => splAtListener_1W1m(sensDb_1w1m, powerW, hypot3(p.x - seat.x, p.y - seat.y, (p.z ?? 0) - (seat.z ?? 0))))
    .filter(isFiniteNum);
  if (spls.length < 2) return null;
  return maxPairwiseAbsDelta(spls);
}

export function levelP10_forDeltaDb(v) {
  if (!isFiniteNum(v)) return null;
  if (v <= 2) return 'L4';
  if (v <= 5) return 'L3';
  if (v <= 8) return 'L2';
  if (v <= 12) return 'L1';
  return 'N/A';
}

/** ---------------- P16 / P17 / P20: data-dependent (return null when absent) ---------------- */
export function metricP16_screenFRVarianceDb() { 
  return null; // TODO: wire when frequency response data available
}

export function levelP16_forVarDb(v) { 
  if (!isFiniteNum(v)) return null; 
  if (v <= 1.5) return 'L4'; 
  if (v <= 3) return 'L2'; 
  if (v <= 5) return 'L1'; 
  return 'N/A'; 
}

export function metricP17_surUpperFRVarianceDb() { 
  return null; // TODO: wire when frequency response data available
}

export function levelP17_forVarDb(v) { 
  if (!isFiniteNum(v)) return null; 
  if (v <= 1.5) return 'L4'; 
  if (v <= 3) return 'L3'; 
  return 'L2'; 
}

export function metricP20_lowFreqConsistencyDb() { 
  return null; // TODO: wire when frequency response data available
}

export function levelP20_forVarDb(v) {
  return isFiniteNum(v) ? levelP20_lfConsistency(v).level : null;
}