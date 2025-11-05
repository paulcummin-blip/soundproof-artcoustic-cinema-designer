// components/room/rv-helpers.js
// === RV helpers & constants (pure; no side effects) ===

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { WALL_BUFFER_M } from "./constants/screenDepth";

export const SIDE_ALLOW_OVERHANG = 0.5; // fraction of speaker height allowed to overhang
export const EPS = 0.002; // 2mm for robust polygon intersection
export const FADE_LEN_M = 0.50; // Fade length for surround zones
export const CORNER_CLEAR_M = 0.50;          // 50 cm corner clearance (centre to wall end)
export const BACKWALL_HYSTERESIS_M = 0.10;   // 10 cm to leave back-wall mode
export const RS_CLEAR_M = 0.50;              // min center-to-center clearance vs SL/SR when both on back wall
export const SS_RS_BUFFER_M = 0.50;          // side↔rear minimum edge-to-edge spacing on side walls
export const RS_EPS = 0.005;                 // 5mm tolerance – prevents jitter from float rounding (rear/side surrounds)

export const DBG_RS = true;   // rear surrounds logs
export const DBG_SS = true;   // side surrounds logs
export const DBG_UTIL = false;// helper-level logs

export const deg = (r) => (r * 180) / Math.PI;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function horizontalAngleFromMLP(mlpX, mlpY, spkX, spkY) {
  const dx = Math.abs(spkX - mlpX);
  const dy = Math.max(1e-6, mlpY - spkY);
  return deg(Math.atan(dx / dy));
}

export function fwDeviationLevel(devDeg) {
  if (devDeg <= 2) return { level: 'L4', max: 2 };
  if (devDeg <= 5) return { level: 'L3', max: 5 };
  if (devDeg <= 7) return { level: 'L2', max: 7 };
  if (devDeg <= 10) return { level: 'L1', max: 10 };
  return { level: 'Out of spec', max: 10 };
}

export const getCanonicalRoleGlobal = (role) => {
  const map = {
    'SL': 'SL', 'LS': 'SL',
    'SR': 'SR', 'RS': 'SR',
    'SBL': 'SBL', 'SBR': 'SBR',
    'LW': 'LW', 'RW': 'RW',
    'FL': 'FL', 'L': 'FL',
    'FC': 'FC', 'C': 'FC',
    'FR': 'FR', 'R': 'FR',
  };
  return map[String(role || '').toUpperCase()] || String(role || '').toUpperCase();
};

export function getSpeakerDims(roleOrModel) {
  const meta = getSpeakerModelMeta(roleOrModel);
  return {
    widthM: meta?.widthM ?? 0.200,
    heightM: meta?.heightM ?? 0.200,
    depthM: meta?.depthM ?? 0.082
  };
}

export function rearSpeakerFootprintX(model) {
  const d = getSpeakerDims(model) || {};
  const w = Number(d?.widthM) || 0.20;
  return w;
}

export function sideSpeakerFootprintX(model) {
  const d = getSpeakerDims(model) || {};
  const w = Number(d?.widthM) || 0.20;
  return w;
}

export function halfWidthOnWall(modelOrDims) {
  const d = typeof modelOrDims === 'object' && modelOrDims.widthM != null
    ? modelOrDims
    : (getSpeakerDims(modelOrDims) || {});
  const w = Number(d?.widthM) || 0.20;
  return w / 2;
}

export function backWallYForDims(dims, roomLen, wallBufferM) {
  const depth = Number(dims?.depthM) || 0.15;
  const buf = Number(wallBufferM ?? WALL_BUFFER_M) || 0.01;
  return Math.max(0, Math.min(roomLen, roomLen - (buf + depth / 2)));
}

export function isOnBackWall(yM, dims, roomLen) {
  const yTarget = backWallYForDims(dims, roomLen, WALL_BUFFER_M);
  const result = Math.abs(Number(yM) - yTarget) <= 0.15;
  if (DBG_UTIL) { try { console.log('[UTIL isOnBackWall]', { y: yM, target: yTarget, eps: 0.15, result }); } catch (_) {} }
  return result;
}

export function computeSymmetricXR(roomWidth, xL) {
  return roomWidth - xL;
}

export function clampToAllowedWithExclusions(x, minX, maxX, exclusions) {
  let intervals = [];
  if (!(maxX > minX)) return minX;
  intervals.push([minX, maxX]);

  for (const ex of exclusions) {
    const a = Math.min(ex[0], ex[1]);
    const b = Math.max(ex[0], ex[1]);
    const next = [];
    for (const [s, e] of intervals) {
      if (b <= s || a >= e) { next.push([s, e]); continue; }
      if (a > s) next.push([s, Math.max(s, Math.min(a, e))]);
      if (b < e) next.push([Math.max(s, Math.min(b, e)), e]);
    }
    intervals = next.filter(([s, e]) => e > s);
    if (intervals.length === 0) break;
  }

  if (intervals.length === 0) return Math.min(maxX, Math.max(minX, x));

  let best = intervals[0][0];
  let bestDist = Math.abs(x - best);
  for (const [s, e] of intervals) {
    const cand = Math.min(e, Math.max(s, x));
    const dist = Math.abs(x - cand);
    if (dist < bestDist) { best = cand; bestDist = dist; }
    else if (cand === x) { best = cand; bestDist = 0; break; }
  }
  return best;
}

export function sideWallXAtBuffer(side, roomW, modelDims, wallBufferM) {
  const halfDepth = (modelDims?.depthM ?? 0.082) / 2;
  const buf = Number(wallBufferM ?? WALL_BUFFER_M);
  if (side === 'L') return buf + halfDepth;
  if (side === 'R') return roomW - (buf + halfDepth);
  return 0;
}

export function sideSurroundsOnBackWall(placedSpeakers, roomLen) {
  const sl = placedSpeakers.find(s => getCanonicalRoleGlobal(s.role) === 'SL');
  const sr = placedSpeakers.find(s => getCanonicalRoleGlobal(s.role) === 'SR');
  if (!sl || !sr) return false;
  const dl = getSpeakerDims(sl.model);
  const dr = getSpeakerDims(sr.model);
  return isOnBackWall(sl?.position?.y, dl, roomLen) && isOnBackWall(sr?.position?.y, dr, roomLen);
}

export function clampRearSideYWithSS(side, desiredY, bandMin, bandMax, roomLenM, rearModel, sideSpeaker) {
  const CORNER = 0.50;
  const yLo = Math.max(0, Number(bandMin) || 0);
  const yHiVis = Math.max(yLo, Number(bandMax) || 0);
  const yHi = Math.min(yHiVis, Math.max(0, Number(roomLenM) || 0) - CORNER);

  let y = Math.min(Math.max(Number(desiredY) || 0, yLo), yHi);

  if (sideSpeaker && sideSpeaker.position) {
    const ySS = Number(sideSpeaker.position.y);
    if (Number.isFinite(ySS)) {
      const rearHalf = halfWidthOnWall(rearModel);
      const sideHalf = halfWidthOnWall(sideSpeaker.model);
      const minCenterSep = rearHalf + sideHalf + 0.50;
      if (y > ySS) { y = Math.max(y, ySS + minCenterSep); }
      else { y = Math.min(y, ySS - minCenterSep); }
      y = Math.min(Math.max(y, yLo), yHi);
    }
  }
  return y;
}

export function speakerOnWallYFootprint(modelDims) {
  return Number(modelDims?.widthM) || 0.20;
}

export function nonCrossingClampDirectional(yPrev, yNext, yOther, minSep) {
  const a = Number(yPrev), b = Number(yNext), c = Number(yOther), m = Number(minSep);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !(m >= 0)) return yNext;
  return (a <= c) ? Math.min(b, c - m) : Math.max(b, c + m);
}

export function centerLaneForBackWall(lanes, rearDims, roomWidthM) {
  const halfW = (Number(rearDims?.widthM) || 0.20) / 2;
  const L = lanes?.left;
  if (!L) return { min: 0, max: Math.max(0, roomWidthM - halfW) };
  return { min: L.minX + halfW, max: L.maxX - halfW };
}

export function computeBackWallInnerEdges(seatingPositions, roomWidth) {
  const seatXs = (seatingPositions || []).map(s => Number(s.x)).filter(Number.isFinite);
  const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : roomWidth * 0.35;
  const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : roomWidth * 0.65;
  return { leftmostSeatX_m, rightmostSeatX_m };
}

export function computeRearVisualLanes(roomWidth, seatingPositions, fadeLenM) {
  const { leftmostSeatX_m, rightmostSeatX_m } = computeBackWallInnerEdges(seatingPositions, roomWidth);
  const leftLaneMin = CORNER_CLEAR_M;
  const leftLaneMax = Math.max(leftLaneMin, leftmostSeatX_m + fadeLenM);
  const rightLaneMax = Math.max(CORNER_CLEAR_M, roomWidth - CORNER_CLEAR_M);
  const rightLaneMin = Math.min(rightLaneMax, rightmostSeatX_m - fadeLenM);
  return { left: { minX: leftLaneMin, maxX: leftLaneMax }, right: { minX: rightLaneMin, maxX: rightLaneMax } };
}

export function fixedSideX(roomWidth, dims, side) {
  if (DBG_UTIL) { try { console.log('[UTIL fixedSideX]', { side, W: roomWidth, dims: { widthM: Number(dims?.widthM), depthM: Number(dims?.depthM) } }); } catch (_) {} }
  const halfDepthM = (dims.depthM ?? 0.082) / 2;
  const buf = WALL_BUFFER_M;
  if (side === 'L') return buf + halfDepthM;
  if (side === 'R') return roomWidth - (buf + halfDepthM);
  return 0;
}

export function sideSegmentAtX(zonePolygonPoints, x, roomLength = 6.0) {
  const safeMinY = 0.5;
  const safeMaxY = Math.max(roomLength - 0.5, safeMinY + 0.1);
  if (!Array.isArray(zonePolygonPoints) || zonePolygonPoints.length < 3) {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }
  try {
    const intersections = [];
    for (let i = 0; i < zonePolygonPoints.length; i++) {
      const p1 = zonePolygonPoints[i];
      const p2 = zonePolygonPoints[(i + 1) % zonePolygonPoints.length];
      if (!p1 || !p2 || typeof p1.x !== 'number' || typeof p1.y !== 'number' || typeof p2.x !== 'number' || typeof p2.y !== 'number') continue;
      if ((p1.x <= x + EPS && p2.x >= x - EPS) || (p1.x >= x - EPS && p2.x <= x + EPS)) {
        if (Math.abs(p1.x - p2.x) > EPS) {
          const t = (x - p1.x) / (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);
          if (Number.isFinite(y) && t >= -EPS && t <= 1 + EPS) intersections.push(y);
        } else if (Math.abs(p1.x - x) < EPS) {
          intersections.push(p1.y, p2.y);
        }
      }
    }
    if (intersections.length >= 2) {
      return { x, minY: Math.min(...intersections), maxY: Math.max(...intersections), source: "poly" };
    }
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  } catch {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }
}

export function resolveSymmetricY(desiredY, segL, segR) {
  if (!segL || !segR) return desiredY;
  const yMin = Math.max(Number(segL.minY) || 0, Number(segR.minY) || 0);
  const yMax = Math.min(Number(segR.maxY) || 0, Number(segL.maxY) || 0);
  if (!(yMax > yMin)) return desiredY;
  const y = Math.min(yMax, Math.max(yMin, Number(desiredY) || 0));
  return y;
}

export function getByRoleArray(mapOrObj, role) {
  if (!mapOrObj || !role) return [];
  if (typeof mapOrObj.get === 'function') return mapOrObj.get(role) || [];
  return mapOrObj[role] || [];
}

export const isFrontObject = (role = "") => {
  const r = getCanonicalRoleGlobal(role);
  return r === "FL" || r === "FC" || r === "FR" || String(role).toUpperCase().includes("SUB");
};

export const mirrorX = (x, cx) => 2 * cx - x;
export const clampToSegment = (x, seg) => Math.max(seg.minX, Math.min(seg.maxX, x));

export function resolveSymmetricLCR({ desiredX, isLeft, screenCenterX, leftZone, rightZone }) {
  if (!leftZone || !rightZone) {
    const finalLeftX = isLeft ? desiredX : mirrorX(desiredX, screenCenterX);
    const finalRightX = isLeft ? mirrorX(desiredX, screenCenterX) : desiredX;
    return { finalLeftX, finalRightX };
  }
  const desiredLeftX = isLeft ? desiredX : mirrorX(desiredX, screenCenterX);
  const desiredRightX = isLeft ? mirrorX(desiredX, screenCenterX) : desiredX;
  let finalLeftX = clampToSegment(desiredLeftX, leftZone);
  let finalRightX = clampToSegment(desiredRightX, rightZone);
  const leftClamped = finalLeftX !== desiredLeftX;
  const rightClamped = finalRightX !== desiredRightX;
  if (leftClamped || rightClamped) {
    const leftOffset = Math.abs(screenCenterX - finalLeftX);
    const rightOffset = Math.abs(finalRightX - screenCenterX);
    const finalOffset = Math.min(leftOffset, rightOffset);
    finalLeftX = screenCenterX - finalOffset;
    finalRightX = screenCenterX + finalOffset;
  }
  return { finalLeftX, finalRightX };
}

export const isSubRole = (role) => {
  const s = String(role || "").toUpperCase();
  return s.includes("SUB") || s === "LFE" || s.startsWith("SW");
};