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
  const median = computeFrontWideMedianData({
    placedSpeakers,
    mlpPoint,
    widthM: dimensions?.width || 0,
    lengthM: dimensions?.length || 0,
    wallInset: 0.05,
  });

  // Pass through any errors
  if (!median || median.status !== 'ok') {
    return { status: median?.status || 'no_data' };
  }

  // Use median.left.target and median.right.target as the centre points
  const deg2rad = (d) => d * Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  
  const L = dimensions?.length || 0;
  const xWallL = 0.01;
  const xWallR = (dimensions?.width || 0) - 0.01;
  const mlpX = median.mlp.x;
  const mlpY = median.mlp.y;
  
  // Build zones using median data
  const leftZone = median.left ? (() => {
    const leftMedianRad = median.left.medianAz * Math.PI / 180;
    const leftMinRad = leftMedianRad - deg2rad(10);
    const leftMaxRad = leftMedianRad + deg2rad(10);
    
    const dx_left = xWallL - mlpX;
    const leftYMed = mlpY + dx_left * Math.tan(leftMedianRad);
    const leftYLo = mlpY + dx_left * Math.tan(leftMinRad);
    const leftYHi = mlpY + dx_left * Math.tan(leftMaxRad);
    
    return {
      status: 'ok',
      yMin: clamp(Math.min(leftYLo, leftYHi), 0, L),
      yMax: clamp(Math.max(leftYLo, leftYHi), 0, L),
      medianY: clamp(leftYMed, 0, L)
    };
  })() : null;
  
  const rightZone = median.right ? (() => {
    const rightMedianRad = median.right.medianAz * Math.PI / 180;
    const rightMinRad = rightMedianRad - deg2rad(10);
    const rightMaxRad = rightMedianRad + deg2rad(10);
    
    const dx_right = xWallR - mlpX;
    const rightYMed = mlpY + dx_right * Math.tan(rightMedianRad);
    const rightYLo = mlpY + dx_right * Math.tan(rightMinRad);
    const rightYHi = mlpY + dx_right * Math.tan(rightMaxRad);
    
    return {
      status: 'ok',
      yMin: clamp(Math.min(rightYLo, rightYHi), 0, L),
      yMax: clamp(Math.max(rightYLo, rightYHi), 0, L),
      medianY: clamp(rightYMed, 0, L)
    };
  })() : null;

  return {
    status: 'ok',
    left: leftZone,
    right: rightZone
  };
}