// Safe inputs, no bare mlp usage

import { sideWallX } from '@/components/room/rv/utils/rvGeometry';

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

  const deg2rad = (d) => d * Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const xWallL = 0.01;
  const xWallR = W - 0.01;

  const mlpX = Number(mlpPoint.x);
  const mlpY = Number(mlpPoint.y);

  const computeSide = (F, S, xWall, sideName) => {
    // Use canonical (wall-flat, yaw=90°) side-wall X for SL/SR so that aiming
    // changes never shift the Front Wide zone geometry.
    const sSide = sideName === 'L' ? 'L' : 'R';
    const sDims = getModelDimsM ? getModelDimsM(S.model) : null;
    const sCanonX = sideWallX(W, sDims, sSide, 90);

    const midX = (F.position.x + sCanonX) / 2;
    const midY = (F.position.y + S.position.y) / 2;

    const theta = Math.atan2(midY - mlpY, midX - mlpX);
    const thetaDeg = theta * 180 / Math.PI;

    const thetaMin = theta - deg2rad(10);
    const thetaMax = theta + deg2rad(10);

    const dx = xWall - mlpX;
    const yMed = mlpY + dx * Math.tan(theta);
    const yLo = mlpY + dx * Math.tan(thetaMin);
    const yHi = mlpY + dx * Math.tan(thetaMax);

    const yMin = clamp(Math.min(yLo, yHi), 0, L);
    const yMax = clamp(Math.max(yLo, yHi), 0, L);
    const medianY = clamp(yMed, 0, L);



    return {
      status: 'ok',
      yMin,
      yMax,
      medianY,
      theta,
      thetaDeg,
      mlpX,
      mlpY,
      xWall
    };
  };

  const leftZone = computeSide(fl, sl, xWallL, 'L');
  const rightZone = computeSide(fr, sr, xWallR, 'R');

  return {
    status: 'ok',
    left: leftZone,
    right: rightZone
  };
}