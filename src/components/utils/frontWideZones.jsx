// Safe inputs, no bare mlp usage
import { computeRp22FrontWideMedianData } from './rp22FrontWides';

const CANONICAL_ROLE_MAP = {
  'SL': 'SL', 'LS': 'SL',
  'SR': 'SR', 'RS': 'SR',
  'FL': 'FL', 'L': 'FL',
  'FR': 'FR', 'R': 'FR',
};

function getCanonicalRole(role) {
  return CANONICAL_ROLE_MAP[String(role || '').toUpperCase()] || String(role || '').toUpperCase();
}

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

  // Guard: no MLP
  if (!mlpPoint || !Number.isFinite(mlpPoint.x) || !Number.isFinite(mlpPoint.y)) {
    return { status: 'no-mlp' };
  }

  // Guard: invalid room dimensions
  const W = Number(dimensions?.width) || 0;
  const L = Number(dimensions?.length) || 0;
  if (!(W > 0 && L > 0)) {
    return { status: 'invalid-geom', reason: 'room dims' };
  }

  const fl = placedSpeakers?.find(s => getCanonicalRole(s?.role) === 'FL');
  const fr = placedSpeakers?.find(s => getCanonicalRole(s?.role) === 'FR');
  const sl = placedSpeakers?.find(s => getCanonicalRole(s?.role) === 'SL');
  const sr = placedSpeakers?.find(s => getCanonicalRole(s?.role) === 'SR');

  if (!fl || !fr || !sl || !sr) {
    return { status: 'no-sides', reason: 'missing FL/FR/SL/SR' };
  }

  const WALL_BUFFER_M = 0.01;
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

  // Use canonical RP22 median angle calculation
  const medianData = computeRp22FrontWideMedianData({
    mlpPoint,
    placedSpeakers,
    roomDims: { widthM: W, lengthM: L },
    wallInsetM: 0.01
  });

  // If helper cannot compute, return existing "no data" shape
  if (medianData.status !== 'ok' || !medianData.targetLW || !medianData.targetRW) {
    return { status: 'no-sides', reason: 'cannot compute median' };
  }

  // Convert helper output to overlay-expected format (preserve return shape)
  const deg2rad = (d) => d * Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const xWallL = 0.01;
  const xWallR = W - 0.01;

  const computeSide = (medianAzDeg, targetPos, xWall, sideName) => {
    const medianY = clamp(targetPos.y, 0, L);
    
    // ±10° zone around median
    const thetaMin = deg2rad(medianAzDeg - 10);
    const thetaMax = deg2rad(medianAzDeg + 10);

    const dx = xWall - mlpPoint.x;
    const yLo = mlpPoint.y + dx * Math.tan(thetaMin);
    const yHi = mlpPoint.y + dx * Math.tan(thetaMax);

    const yMin = clamp(Math.min(yLo, yHi), 0, L);
    const yMax = clamp(Math.max(yLo, yHi), 0, L);

    if (typeof console !== 'undefined' && console.log) {
      console.log(`[FW] ${sideName} yMin=${yMin.toFixed(3)}..yMax=${yMax.toFixed(3)} @ median=${medianY.toFixed(3)}`,
        `medianAz=${medianAzDeg.toFixed(1)}°`);
    }

    return {
      status: 'ok',
      yMin,
      yMax,
      medianY
    };
  };

  const leftZone = computeSide(medianData.medianAzLeftDeg, medianData.targetLW, xWallL, 'L');
  const rightZone = computeSide(medianData.medianAzRightDeg, medianData.targetRW, xWallR, 'R');

  return {
    status: 'ok',
    left: leftZone,
    right: rightZone
  };
}