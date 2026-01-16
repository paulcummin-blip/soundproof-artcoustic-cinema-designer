// REFACTORED: Now uses canonical frontWideMedian helper
import { computeFrontWideMedianData } from './frontWideMedian';

export function computeFrontWideZonesStrict({
  mlpPoint,
  dimensions,
  placedSpeakers,
  getModelDimsM,
  enableFrontWides = true
}) {
  // Guard: feature disabled
  if (!enableFrontWides) {
    return { status: 'disabled' };
  }

  // Call canonical median helper
  const medianData = computeFrontWideMedianData({
    mlpPoint,
    placedSpeakers,
    roomDims: { widthM: dimensions?.width || 0, lengthM: dimensions?.length || 0 },
    wallInset: 0.05
  });

  // Pass through any errors
  if (medianData.status !== 'ok') {
    return { status: medianData.status, reason: medianData.reason };
  }

  // Check if side surrounds are on walls (validation)
  const W = dimensions?.width || 0;
  const WALL_BUFFER_M = 0.01;
  
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'SL' || r === 'LS') return 'SL';
    if (r === 'SR' || r === 'RS') return 'SR';
    return null;
  };
  
  const sl = placedSpeakers?.find(s => normalizeRole(s?.role) === 'SL');
  const sr = placedSpeakers?.find(s => normalizeRole(s?.role) === 'SR');
  
  const isOnSideWall = (speaker, side) => {
    if (!speaker || !speaker.position) return false;
    const dims = getModelDimsM ? getModelDimsM(speaker.model) : { depthM: 0.082 };
    const halfDepth = (dims.depthM || 0.082) / 2;
    const tolerance = WALL_BUFFER_M + halfDepth + 0.01;
    
    if (side === 'L') {
      return Math.abs(speaker.position.x - 0) < tolerance;
    } else {
      return Math.abs(speaker.position.x - W) < tolerance;
    }
  };

  if (!isOnSideWall(sl, 'L') || !isOnSideWall(sr, 'R')) {
    return { status: 'no-sides', reason: 'SL/SR not on side walls' };
  }

  // Build zone data from canonical median
  const deg2rad = (d) => d * Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  
  const L = dimensions?.length || 0;
  const xWallL = 0.01;
  const xWallR = W - 0.01;
  const mlpX = mlpPoint.x;
  const mlpY = mlpPoint.y;
  
  // LEFT zone: ±10° around median azimuth
  const leftMedianRad = medianData.left.medianAz * Math.PI / 180;
  const leftMinRad = leftMedianRad - deg2rad(10);
  const leftMaxRad = leftMedianRad + deg2rad(10);
  
  const dx_left = xWallL - mlpX;
  const leftYMed = mlpY + dx_left * Math.tan(leftMedianRad);
  const leftYLo = mlpY + dx_left * Math.tan(leftMinRad);
  const leftYHi = mlpY + dx_left * Math.tan(leftMaxRad);
  
  const leftZone = {
    status: 'ok',
    yMin: clamp(Math.min(leftYLo, leftYHi), 0, L),
    yMax: clamp(Math.max(leftYLo, leftYHi), 0, L),
    medianY: clamp(leftYMed, 0, L)
  };
  
  // RIGHT zone: ±10° around median azimuth
  const rightMedianRad = medianData.right.medianAz * Math.PI / 180;
  const rightMinRad = rightMedianRad - deg2rad(10);
  const rightMaxRad = rightMedianRad + deg2rad(10);
  
  const dx_right = xWallR - mlpX;
  const rightYMed = mlpY + dx_right * Math.tan(rightMedianRad);
  const rightYLo = mlpY + dx_right * Math.tan(rightMinRad);
  const rightYHi = mlpY + dx_right * Math.tan(rightMaxRad);
  
  const rightZone = {
    status: 'ok',
    yMin: clamp(Math.min(rightYLo, rightYHi), 0, L),
    yMax: clamp(Math.max(rightYLo, rightYHi), 0, L),
    medianY: clamp(rightYMed, 0, L)
  };

  return {
    status: 'ok',
    left: leftZone,
    right: rightZone
  };
}