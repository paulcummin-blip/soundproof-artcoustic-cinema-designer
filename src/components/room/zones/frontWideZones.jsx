
// components/room/zones/frontWideZones.js
// RP22 Front-Wide lane: median angle ±10° from MLP to side walls

export const ZONE_DEPTH_M = 0.30; // Zone depth for speaker overlays (meters)

import { getCanonicalRole } from '@/components/utils/roles';

const DEG = Math.PI / 180;

/**
 * Compute Front-Wide zones using RP22 median angle method
 * Per RP22: lane is median ±10° where median = angle from MLP to midpoint(FL,SL) or midpoint(FR,SR)
 */
export function computeFrontWideZonesStrict(args) {
  const {
    enableFrontWides = true,
    dimensions,
    mlpPoint,
    speakers,
    placedSpeakers,
    getModelDimsM,
    rp22BoundDeg = 10,
    WALL_BUFFER_M = 0.01
  } = args || {};

  // Gate 1: Feature disabled
  if (!enableFrontWides) {
    return { status: 'disabled' };
  }

  // Gate 2: Invalid geometry inputs
  const W = Number(dimensions?.width) || 0;
  const L = Number(dimensions?.length) || 0;
  const mlp = mlpPoint || { x: 0, y: 0 };
  
  if (!(W > 0 && L > 0) || !mlp || typeof mlp.x !== 'number' || typeof mlp.y !== 'number') {
    return {
      status: 'invalid-geom',
      reason: 'room/mlp',
      left: { status: 'invalid-geom', reason: 'invalid room or MLP' },
      right: { status: 'invalid-geom', reason: 'invalid room or MLP' }
    };
  }

  // Canonicalize speakers and pick by canonical role
  const speakerList = Array.isArray(speakers || placedSpeakers) ? (speakers || placedSpeakers) : [];
  
  const byCanon = {};
  for (const s of speakerList) {
    const canon = getCanonicalRole ? getCanonicalRole(s?.role) : (s?.role || '');
    if (canon) byCanon[canon] = byCanon[canon] || s; // first one wins
  }

  // Pull the four we need
  const SL = byCanon.SL; // side-left (aka LS)
  const SR = byCanon.SR; // side-right (aka RS)
  const FL = byCanon.FL;
  const FR = byCanon.FR;

  // Gate 3: Require sides to exist
  if (!SL || !SR) {
    return {
      status: 'no-sides',
      left: { status: 'no-sides', reason: SL ? 'missing-SR' : 'missing-SL' },
      right: { status: 'no-sides', reason: SR ? 'missing-SL' : 'missing-SR' }
    };
  }

  // Helper: check if speaker is on side wall (same logic as placement)
  const dimsOf = getModelDimsM || (() => ({}));
  
  function onSideWall(side, spk, roomW, tolM = 0.035) {
    if (!spk?.position?.x || !spk?.model) return false;
    const d = dimsOf(spk.model) || {};
    const halfDepth = ((d.depthM ?? 0.082) / 2);
    const expectX = side === 'L' 
      ? (WALL_BUFFER_M + halfDepth) 
      : (roomW - (WALL_BUFFER_M + halfDepth));
    return Math.abs(Number(spk.position.x) - expectX) <= tolM;
  }

  // Gate 4: Check wall placement
  if (!onSideWall('L', SL, W)) {
    return {
      status: 'no-sides',
      left: { status: 'no-sides', reason: 'left-not-on-wall' },
      right: { status: 'no-sides', reason: 'left-not-on-wall' }
    };
  }
  
  if (!onSideWall('R', SR, W)) {
    return {
      status: 'no-sides',
      left: { status: 'no-sides', reason: 'right-not-on-wall' },
      right: { status: 'no-sides', reason: 'right-not-on-wall' }
    };
  }

  // Geometry helpers
  function midpoint(a, b) {
    return {
      x: (Number(a?.position?.x) || 0 + Number(b?.position?.x) || 0) / 2,
      y: (Number(a?.position?.y) || 0 + Number(b?.position?.y) || 0) / 2
    };
  }

  function angleDeg(from, to) {
    const dx = Number(to.x) - Number(from.x);
    const dy = Number(to.y) - Number(from.y);
    return (Math.atan2(dy, dx) * 180 / Math.PI);
  }

  // Given MLP and target angle, intersect with vertical wall at x=xWall
  function intersectYAtWall(mlpPt, xWall, angleDegVal) {
    const theta = angleDegVal * Math.PI / 180;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    if (Math.abs(dx) < 1e-9) return null; // ray parallel to wall
    const t = (xWall - mlpPt.x) / dx;
    const y = mlpPt.y + t * dy;
    return y;
  }

  function clamp01(y, min, max) {
    return Math.max(min, Math.min(max, y));
  }

  const bound = Number(rp22BoundDeg ?? 10);

  // LEFT SIDE (FL/SL → FWL)
  let left;
  if (FL) {
    const midL = midpoint(FL, SL);
    const thetaMedianL = angleDeg(mlp, midL);
    const thetaMinL = thetaMedianL - bound;
    const thetaMaxL = thetaMedianL + bound;
    
    const xWallL = WALL_BUFFER_M;
    const yMinRaw = intersectYAtWall(mlp, xWallL, thetaMinL);
    const yMedRaw = intersectYAtWall(mlp, xWallL, thetaMedianL);
    const yMaxRaw = intersectYAtWall(mlp, xWallL, thetaMaxL);

    const yMin = clamp01(yMinRaw ?? mlp.y, 0, L);
    const yMax = clamp01(yMaxRaw ?? mlp.y, 0, L);
    const medianY = clamp01(yMedRaw ?? mlp.y, 0, L);

    left = {
      status: 'ok',
      yMin: Math.min(yMin, yMax),
      yMax: Math.max(yMin, yMax),
      medianY,
      thetaMedianDeg: thetaMedianL
    };
  } else {
    left = { status: 'no-front', reason: 'missing-FL' };
  }

  // RIGHT SIDE (FR/SR → FWR)
  let right;
  if (FR) {
    const midR = midpoint(FR, SR);
    const thetaMedianR = angleDeg(mlp, midR);
    const thetaMinR = thetaMedianR - bound;
    const thetaMaxR = thetaMedianR + bound;
    
    const xWallR = W - WALL_BUFFER_M;
    const yMinRaw = intersectYAtWall(mlp, xWallR, thetaMinR);
    const yMedRaw = intersectYAtWall(mlp, xWallR, thetaMedianR);
    const yMaxRaw = intersectYAtWall(mlp, xWallR, thetaMaxR);

    const yMin = clamp01(yMinRaw ?? mlp.y, 0, L);
    const yMax = clamp01(yMaxRaw ?? mlp.y, 0, L);
    const medianY = clamp01(yMedRaw ?? mlp.y, 0, L);

    right = {
      status: 'ok',
      yMin: Math.min(yMin, yMax),
      yMax: Math.max(yMin, yMax),
      medianY,
      thetaMedianDeg: thetaMedianR
    };
  } else {
    right = { status: 'no-front', reason: 'missing-FR' };
  }

  // Final return
  const okLeft = left?.status === 'ok';
  const okRight = right?.status === 'ok';
  
  return {
    status: (okLeft || okRight) ? 'ok' : 'no-sides',
    styleKey: 'sideSurround',
    left,
    right
  };
}

// Export default for backwards compatibility
export default { computeFrontWideZonesStrict };
