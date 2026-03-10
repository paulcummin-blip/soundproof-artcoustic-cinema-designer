/**
 * solveSpeakerDragConstraints.js
 * Pure function – no React, no hooks, no state mutation.
 *
 * Receives all inputs needed to decide where a speaker lands after a
 * drag frame, and returns:
 *   { finalPositions, additionalUpdates }
 *
 * finalPositions   = [{ id, position:{x,y,z}, meta, positionSource }]
 * additionalUpdates = { slsrMode, fwOffset, fwPartnerOffset,
 *                       setHasManualOverheadEdit, fwMeta }
 */

import { sideWallX, rearWallY, OVERHEAD_PAIR_MAP } from "@/components/room/rv/utils/rvGeometry";

// ─── small local helpers ───────────────────────────────────────────────────

const DBG_SS = false; // flip to true for surround drag console spam

function sideSegmentAtX(zone, xSide, L) {
  if (!zone) return null;
  if (Array.isArray(zone.segments)) {
    const seg = zone.segments.find(s => Math.abs(s.x - xSide) < 0.05);
    if (seg) return { min: seg.yMin, max: seg.yMax };
  }
  // Fallback: use raw zone bounds
  if (Number.isFinite(zone.yMin) && Number.isFinite(zone.yMax)) {
    return { min: zone.yMin, max: zone.yMax };
  }
  return null;
}

function resolveSymmetricY(yPtr, segL, segR) {
  let yMin = -Infinity;
  let yMax = Infinity;
  if (segL) { yMin = Math.max(yMin, segL.min); yMax = Math.min(yMax, segL.max); }
  if (segR) { yMin = Math.max(yMin, segR.min); yMax = Math.min(yMax, segR.max); }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin > yMax) return yPtr;
  return Math.max(yMin, Math.min(yMax, yPtr));
}

function backWallYForDims(dims, L, wallBufferM) {
  const halfD = (dims?.depthM ?? 0.082) / 2;
  return L - halfD - (wallBufferM ?? 0.01);
}

// ─── Main exported solver ─────────────────────────────────────────────────

export function solveSpeakerDragConstraints({
  speakerId,
  spk,
  canonicalRole,
  newCanvasPos,
  canvasToRoom,
  // room
  widthM,
  lengthM,
  // context
  placedSpeakers,
  seatingPositions,
  constraintZones,
  frontWideZones,
  overheadZones,
  _overlays,
  sideSurroundVisualSpanM,
  rearSurroundVisualLanes,
  mlp,
  mlpDotY_m,
  freeMoveLcr,
  screenCenterX_m,
  centerX_m,
  // util fns passed in (pure – no closure over state)
  getModelDimsM,
  getCanonicalRole,
  getSpeakerDims,
  rsRearCorridor,
  clampOverheadXToSeatSpan,
  nonCrossingClampDirectional,
  fwDeviationLevel,
  horizontalAngleFromMLP,
  isOnSideWall,
  speakerOnWallYFootprint,
  clamp,
  // constants
  CORNER_CLEAR_M,
  BACKWALL_HYSTERESIS_M,
  SURROUND_WALL_GAP_M,
  SIDE_ALLOW_OVERHANG,
  WALL_BUFFER_M,
  EPS,
  // ref values (passed as plain values, not refs)
  slsrModeCurrent,
  fwOffsetCurrent,
}) {
  const finalPositions = [];
  const additionalUpdates = {};

  // ── 1. LCR ────────────────────────────────────────────────────────────────
  if (['FL', 'FC', 'FR'].includes(canonicalRole)) {
    if (canonicalRole === 'FC') {
      const rawRoomPos = canvasToRoom(newCanvasPos);
      const newY = rawRoomPos.y;
      const currentY = spk.position?.y ?? newY;
      if (Math.abs(newY - currentY) > 0.001) {
        finalPositions.push({
          id: speakerId,
          position: { ...(spk.position || {}), x: centerX_m, y: newY },
          positionSource: 'user',
        });
      }
      return { finalPositions, additionalUpdates };
    }

    // FL or FR — if zones not ready yet, keep speaker at its current position
    // instead of returning an empty result that causes the speaker to vanish or freeze.
    if (!constraintZones?.FL || !constraintZones?.FR) {
      finalPositions.push({
        id: speakerId,
        position: { ...(spk.position || {}) },
      });
      return { finalPositions, additionalUpdates };
    }

    const rawRoomPos = canvasToRoom(newCanvasPos);
    const desiredX = rawRoomPos.x;
    const isLeft = canonicalRole === 'FL';

    let leftClamp, rightClamp;
    if (freeMoveLcr) {
      const dims = getModelDimsM(spk.model);
      const halfW = (Number(dims?.widthM) || 0.20) / 2;
      const eps = 0.01;
      leftClamp  = { xMin: halfW + eps, xMax: screenCenterX_m - eps };
      rightClamp = { xMin: screenCenterX_m + eps, xMax: widthM - halfW - eps };
    } else {
      leftClamp  = constraintZones.FL.clamp;
      rightClamp = constraintZones.FR.clamp;
    }

    const { finalLeftX, finalRightX } = resolveSymmetricLCR({
      desiredX, isLeft,
      screenCenterX: screenCenterX_m,
      leftZone: leftClamp,
      rightZone: rightClamp,
    });

    const flSpk = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FL');
    const frSpk = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FR');
    const needsUpdate =
      (flSpk && Math.abs((flSpk.position?.x ?? 0) - finalLeftX) > 0.001) ||
      (frSpk && Math.abs((frSpk.position?.x ?? 0) - finalRightX) > 0.001);

    if (needsUpdate) {
      if (flSpk) finalPositions.push({ id: flSpk.id, position: { ...(flSpk.position || {}), x: finalLeftX }, positionSource: 'user' });
      if (frSpk) finalPositions.push({ id: frSpk.id, position: { ...(frSpk.position || {}), x: finalRightX }, positionSource: 'user' });
    }
    return { finalPositions, additionalUpdates };
  }

  // ── 2. Side surrounds (SL/SR + extras) ───────────────────────────────────
  const extraSurroundPattern = /^(SL|SR)(\d+)?$/;
  const extraMatch = canonicalRole.match(extraSurroundPattern);
  if (extraMatch) {
    const baseSide     = extraMatch[1];           // "SL" or "SR"
    const pairNumber   = extraMatch[2];           // "2", "3", ... or undefined
    const partnerBaseSide = baseSide === 'SL' ? 'SR' : 'SL';
    const partnerRole  = pairNumber ? `${partnerBaseSide}${pairNumber}` : partnerBaseSide;

    const thisSpeaker    = placedSpeakers.find(s => getCanonicalRole(s.role) === canonicalRole);
    const partnerSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRole);
    if (!thisSpeaker || !partnerSpeaker) return { finalPositions, additionalUpdates };

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return { finalPositions, additionalUpdates };

    const dimsThis    = getModelDimsM(thisSpeaker.model);
    const dimsPartner = getModelDimsM(partnerSpeaker.model);
    const xL_side = sideWallX(W, baseSide === 'SL' ? dimsThis : dimsPartner, 'L');
    const xR_side = sideWallX(W, partnerBaseSide === 'SL' ? dimsThis : dimsPartner, 'R');

    const yMin_side   = Number(sideSurroundVisualSpanM?.minY) || 0;
    const yMax_visual = Number(sideSurroundVisualSpanM?.maxY) || 0;
    const yMax_clamp  = Math.max(yMin_side, Math.min(yMax_visual, L - CORNER_CLEAR_M));

    const { y: proposedRoomY_m } = canvasToRoom(newCanvasPos);
    const yPtr = Number(proposedRoomY_m);
    const yMin = yMin_side;
    const yMax = yMax_clamp;

    // Hysteresis mode decision
    const nextMode = (() => {
      const py  = Number(yPtr);
      const yMx = Number(yMax_clamp);
      const hys = Number.isFinite(BACKWALL_HYSTERESIS_M) ? Number(BACKWALL_HYSTERESIS_M) : 0.10;
      if (slsrModeCurrent === 'back') return py < (yMx - hys) ? 'side' : 'back';
      return py > (yMx + hys) ? 'back' : 'side';
    })();
    additionalUpdates.slsrMode = nextMode;

    if (nextMode === 'side') {
      const slSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
      const srSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');

      const segL = sideSegmentAtX(_overlays?.sideSurroundZone, xL_side, L);
      const segR = sideSegmentAtX(_overlays?.sideSurroundZone, xR_side, L);
      const yStarRaw = resolveSymmetricY(yPtr, segL, segR);
      let yStar = Math.min(yMax, Math.max(yMin, yStarRaw));

      // Non-crossing vs SBL (left side)
      const sblCandidate = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
      if (sblCandidate && isOnSideWall('L', sblCandidate, W) && slSpeaker) {
        const halfSS = (speakerOnWallYFootprint(getModelDimsM(slSpeaker.model)) || 0) / 2;
        const halfRS = (speakerOnWallYFootprint(getModelDimsM(sblCandidate.model)) || 0) / 2;
        const minSep = halfSS + halfRS + 0.50;
        const prevY  = Number((canonicalRole === 'SL' ? slSpeaker : srSpeaker)?.position?.y);
        yStar = nonCrossingClampDirectional(prevY, yStar, Number(sblCandidate?.position?.y) || 0, minSep);
        yStar = Math.min(Math.max(yStar, yMin), yMax);
      }

      // Non-crossing vs SBR (right side)
      const sbrCandidate = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBR');
      if (sbrCandidate && isOnSideWall('R', sbrCandidate, W) && srSpeaker) {
        const halfSS = (speakerOnWallYFootprint(getModelDimsM(srSpeaker.model)) || 0) / 2;
        const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbrCandidate.model)) || 0) / 2;
        const minSep = halfSS + halfRS + 0.50;
        const prevY  = Number((canonicalRole === 'SL' ? slSpeaker : srSpeaker)?.position?.y);
        yStar = nonCrossingClampDirectional(prevY, yStar, Number(sbrCandidate?.position?.y) || 0, minSep);
        yStar = Math.min(Math.max(yStar, yMin), yMax);
      }

      finalPositions.push({
        id: thisSpeaker.id,
        position: { ...(thisSpeaker.position || {}), x: baseSide === 'SL' ? xL_side : xR_side, y: yStar },
        positionSource: 'user',
      });
      finalPositions.push({
        id: partnerSpeaker.id,
        position: { ...(partnerSpeaker.position || {}), x: partnerBaseSide === 'SL' ? xL_side : xR_side, y: yStar },
        positionSource: 'user',
      });
      return { finalPositions, additionalUpdates };
    }

    // back-wall mode
    const lanes    = rearSurroundVisualLanes;
    const leftLaneMin = lanes.left.minX;
    const leftLaneMax = lanes.left.maxX;

    const { x: proposedRoomX_m_slsr } = canvasToRoom(newCanvasPos);
    const rawXL = (canonicalRole === 'SL')
      ? proposedRoomX_m_slsr
      : (W - proposedRoomX_m_slsr);

    const xL_star = clamp(rawXL, leftLaneMin, leftLaneMax);
    const xR_star = W - xL_star;

    const dimsL = getSpeakerDims(thisSpeaker.model);
    const dimsR = getSpeakerDims(partnerSpeaker.model);
    const y_back_this    = rearWallY(L, baseSide === 'SL' ? dimsL : dimsR);
    const y_back_partner = rearWallY(L, partnerBaseSide === 'SL' ? dimsL : dimsR);

    finalPositions.push({
      id: thisSpeaker.id,
      position: { ...(thisSpeaker.position || {}), x: xL_star, y: y_back_this },
      positionSource: 'user',
    });
    finalPositions.push({
      id: partnerSpeaker.id,
      position: { ...(partnerSpeaker.position || {}), x: xR_star, y: y_back_partner },
      positionSource: 'user',
    });
    return { finalPositions, additionalUpdates };
  }

  // ── 3. Rear surrounds SBL/SBR ────────────────────────────────────────────
  if (canonicalRole === 'SBL' || canonicalRole === 'SBR') {
    const { x: rawX } = canvasToRoom(newCanvasPos);
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const speakerMeta = getModelDimsM ? getModelDimsM(spk.model) : null;
    const spDims = {
      widthM: speakerMeta?.widthM || 0.20,
      depthM: speakerMeta?.depthM || 0.082,
    };

    const side = (rawX <= W * 0.5) ? 'left' : 'right';
    const c    = rsRearCorridor(side, { widthM: W, lengthM: L }, spDims);
    const finalX = clamp(rawX, c.xMin, c.xMax);
    const finalY = rearWallY(L, spDims);

    const partnerRoleSbr = canonicalRole === 'SBL' ? 'SBR' : 'SBL';
    const partnerSpk     = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRoleSbr);

    finalPositions.push({ id: speakerId, position: { ...spk.position, x: finalX, y: finalY }, positionSource: 'user' });

    if (partnerSpk) {
      const partnerX    = W - finalX;
      const partnerSide = (partnerX <= W * 0.5) ? 'left' : 'right';
      const cP          = rsRearCorridor(partnerSide, { widthM: W, lengthM: L }, spDims);
      const partnerXC   = clamp(partnerX, cP.xMin, cP.xMax);
      finalPositions.push({ id: partnerSpk.id, position: { ...partnerSpk.position, x: partnerXC, y: finalY }, positionSource: 'user' });
    }

    return { finalPositions, additionalUpdates };
  }

  // ── 4. Front-wide LW/RW ──────────────────────────────────────────────────
  if (canonicalRole === 'LW' || canonicalRole === 'RW') {
    const W = widthM || 4.5;
    const L = lengthM || 6.0;
    const dims      = getModelDimsM(spk.model);
    const halfWidth = (Number(dims?.widthM) || 0.20) / 2;

    const zonesReady  = frontWideZones?.status === 'ok';
    const zone        = zonesReady ? (canonicalRole === 'LW' ? frontWideZones.left  : frontWideZones.right) : null;
    const partnerZone = zonesReady ? (canonicalRole === 'LW' ? frontWideZones.right : frontWideZones.left)  : null;
    const partnerRoleFw = canonicalRole === 'LW' ? 'RW' : 'LW';

    const xAtWall = sideWallX(W, dims, canonicalRole === 'LW' ? 'L' : 'R');
    const { y: rawY } = canvasToRoom(newCanvasPos);

    const fallbackYMin    = SURROUND_WALL_GAP_M + halfWidth;
    const fallbackYMax    = L - SURROUND_WALL_GAP_M - halfWidth;
    const fallbackMedianY = L / 2;

    const yMinClamped = zone ? ((zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG)) : fallbackYMin;
    const yMaxClamped = zone ? ((zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG)) : fallbackYMax;
    const yClamped    = clamp(rawY, yMinClamped, yMaxClamped);

    const medianY  = zone?.medianY || fallbackMedianY;
    const offset   = yClamped - medianY;
    const sideKey  = canonicalRole === 'LW' ? 'L' : 'R';

    additionalUpdates.fwOffset = { side: sideKey, offset };

    // wall-locked X
    const fwDims      = getModelDimsM?.(spk.model) || {};
    const fwHalfW     = (Number(fwDims.widthM) || 0.20) / 2;
    const lockedX     = sideWallX(W, fwDims, canonicalRole === 'LW' ? 'L' : 'R');
    const fwFrontY    = SURROUND_WALL_GAP_M + fwHalfW;
    const fwBackY     = L - (SURROUND_WALL_GAP_M + fwHalfW);
    const fwClampedY  = Math.max(fwFrontY, Math.min(fwBackY, yClamped));

    finalPositions.push({
      id: speakerId,
      position: { x: lockedX, y: fwClampedY, z: spk.position?.z ?? 1.1 },
      meta: spk.meta,
      positionSource: 'user',
    });

    // Mirror partner
    const partner = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRoleFw);
    if (partner) {
      const pDims         = getModelDimsM(partner.model);
      const pHalfW        = (Number(pDims?.widthM) || 0.20) / 2;
      const partnerLockedX = sideWallX(W, pDims, canonicalRole === 'LW' ? 'R' : 'L');

      const pFallbackYMin    = SURROUND_WALL_GAP_M + pHalfW;
      const pFallbackYMax    = L - SURROUND_WALL_GAP_M - pHalfW;
      const pFallbackMedianY = L / 2;
      const pMedianY    = partnerZone?.medianY || pFallbackMedianY;
      const pTargetY    = pMedianY + offset;
      const pYMinC      = partnerZone ? ((partnerZone.yMin || 0) + pHalfW)  : pFallbackYMin;
      const pYMaxC      = partnerZone ? ((partnerZone.yMax || L) - pHalfW)  : pFallbackYMax;
      const pYClamped   = clamp(pTargetY, pYMinC, pYMaxC);
      const partnerOffsetFinal = pYClamped - pMedianY;

      finalPositions.push({
        id: partner.id,
        position: { x: partnerLockedX, y: pYClamped, z: partner.position?.z ?? 1.1 },
        positionSource: 'user',
      });

      const partnerSideKey = partnerRoleFw === 'LW' ? 'L' : 'R';
      additionalUpdates.fwPartnerOffset = { side: partnerSideKey, offset: partnerOffsetFinal };
    }

    // RP22 P7 deviation metadata
    try {
      const mlpX    = mlp.x ?? (W / 2);
      const mlpY    = mlp.y ?? (L * 0.6);
      const currentDeg = horizontalAngleFromMLP(mlpX, mlpY, xAtWall, yClamped);
      const medianDeg  = horizontalAngleFromMLP(mlpX, mlpY, xAtWall, medianY);
      const deviation  = Math.abs(currentDeg - medianDeg);
      const lvl        = fwDeviationLevel(deviation);
      additionalUpdates.fwMeta = {
        speakerId,
        fwDeviationDeg: deviation,
        fwDeviationLevel: lvl.level,
      };
    } catch (_) { /* silent */ }

    return { finalPositions, additionalUpdates };
  }

  // ── 5. Overhead T* ───────────────────────────────────────────────────────
  const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

  if (canonicalRole && canonicalRole.startsWith('T')) {
    additionalUpdates.setHasManualOverheadEdit = true;

    // Zone bypass
    if (!overheadZones || overheadZones.status !== 'ok') {
      finalPositions.push({
        id: speakerId,
        position: { ...(spk.position || {}), x: rawX, y: rawY },
        positionSource: 'user',
      });
      return { finalPositions, additionalUpdates };
    }

    let zoneKey = null;
    if (['TFL', 'TFR', 'TFC'].includes(canonicalRole))     zoneKey = 'front';
    else if (['TML', 'TMR'].includes(canonicalRole))        zoneKey = 'mid';
    else if (['TRL', 'TRR', 'TRC'].includes(canonicalRole)) zoneKey = 'rear';

    let zone = zoneKey && overheadZones[zoneKey];
    if (!zone) {
      zone = { xMin: 0, xMax: widthM, yMin: 0, yMax: lengthM };
    }

    const overheadSpeakers = placedSpeakers.filter(s => {
      const r = getCanonicalRole(s.role);
      return r && r.startsWith('T');
    });

    const is514Layout =
      overheadSpeakers.length === 4 &&
      overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TFL') &&
      overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TFR') &&
      overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TRL') &&
      overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TRR');

    const LEFT_ROLES  = ['TFL', 'TML', 'TRL'];
    const RIGHT_ROLES = ['TFR', 'TMR', 'TRR'];
    const isLeftRole  = r => LEFT_ROLES.includes(r);
    const isRightRole = r => RIGHT_ROLES.includes(r);
    const isFrontRole = r => r === 'TFL' || r === 'TFR';
    const isMidRole   = r => r === 'TML' || r === 'TMR';
    const isRearRole  = r => r === 'TRL' || r === 'TRR';

    const primaryClamped = {
      x: Math.min(Math.max(rawX, zone.xMin), zone.xMax),
      y: Math.min(Math.max(rawY, zone.yMin), zone.yMax),
    };

    const centerX     = widthM / 2;
    let leftColumnX   = null;
    let rightColumnX  = null;

    if (isLeftRole(canonicalRole))  { leftColumnX  = primaryClamped.x; rightColumnX = centerX + (centerX - leftColumnX); }
    if (isRightRole(canonicalRole)) { rightColumnX = primaryClamped.x; leftColumnX  = centerX + (centerX - rightColumnX); }

    // Seat span clamping for column X
    if (leftColumnX != null || rightColumnX != null) {
      const seatXs = (seatingPositions || [])
        .map(seat => seat?.position?.x ?? seat?.x)
        .filter(x => Number.isFinite(x));
      if (seatXs.length > 0) {
        const seatMinX = Math.min(...seatXs);
        const seatMaxX = Math.max(...seatXs);
        if (leftColumnX  != null) leftColumnX  = clampOverheadXToSeatSpan(leftColumnX,  seatMinX, seatMaxX);
        if (rightColumnX != null) rightColumnX = clampOverheadXToSeatSpan(rightColumnX, seatMinX, seatMaxX);
      }
    }

    // 5.1.4 layout: mirror front↔rear around MLP Y
    if (is514Layout) {
      const mlpY    = mlpDotY_m || (lengthM / 2);
      const isFront = isFrontRole(canonicalRole);
      const isRear  = isRearRole(canonicalRole);

      if (isFront || isRear) {
        let frontY, rearY;
        if (isFront) { frontY = primaryClamped.y; rearY = 2 * mlpY - frontY; }
        else         { rearY  = primaryClamped.y; frontY = 2 * mlpY - rearY; }

        const fz = overheadZones.front;
        const rz = overheadZones.rear;
        if (fz) frontY = Math.min(Math.max(frontY, fz.yMin), fz.yMax);
        if (rz) rearY  = Math.min(Math.max(rearY,  rz.yMin), rz.yMax);

        for (const s of placedSpeakers) {
          const role = getCanonicalRole(s.role);
          if (!['TFL', 'TFR', 'TRL', 'TRR'].includes(role)) continue;
          const cur = { ...(s.position || {}) };
          if (['TFL', 'TRL'].includes(role) && leftColumnX  != null) cur.x = leftColumnX;
          if (['TFR', 'TRR'].includes(role) && rightColumnX != null) cur.x = rightColumnX;
          if (role === 'TFL' || role === 'TFR') cur.y = frontY;
          if (role === 'TRL' || role === 'TRR') cur.y = rearY;
          finalPositions.push({ id: s.id, position: cur, positionSource: 'user' });
        }
        return { finalPositions, additionalUpdates };
      }
    }

    // Free Move ON: pair-locked only
    if (freeMoveLcr) {
      const partnerRoleOH = OVERHEAD_PAIR_MAP[canonicalRole];
      const newY = primaryClamped.y;
      for (const s of placedSpeakers) {
        const r = getCanonicalRole(s.role);
        if (!r || !r.startsWith('T')) continue;
        const cur = { ...(s.position || {}) };
        if (isLeftRole(r)  && leftColumnX  != null) cur.x = leftColumnX;
        if (isRightRole(r) && rightColumnX != null) cur.x = rightColumnX;
        if (r === canonicalRole || (partnerRoleOH && r === partnerRoleOH)) cur.y = newY;
        finalPositions.push({ id: s.id, position: cur, positionSource: 'user' });
      }
      return { finalPositions, additionalUpdates };
    }

    // Free Move OFF: globally-linked Y
    let frontY = null, midY = null, rearY = null;
    for (const s of placedSpeakers) {
      const role = getCanonicalRole(s.role);
      const posY = s?.position?.y;
      if (!Number.isFinite(posY)) continue;
      if (isFrontRole(role)) frontY = posY;
      if (isMidRole(role))   midY   = posY;
      if (isRearRole(role))  rearY  = posY;
    }
    if (!Number.isFinite(midY)) midY = primaryClamped.y;

    let newFrontY = frontY, newMidY = midY, newRearY = rearY;
    if (isMidRole(canonicalRole)) {
      const dF = Number.isFinite(frontY) ? midY - frontY : 0;
      const dR = Number.isFinite(rearY)  ? rearY - midY  : 0;
      newMidY   = primaryClamped.y;
      newFrontY = newMidY - dF;
      newRearY  = newMidY + dR;
    }
    if (isFrontRole(canonicalRole)) {
      newFrontY = primaryClamped.y;
      const d = midY - newFrontY;
      newRearY = midY + d;
    }
    if (isRearRole(canonicalRole)) {
      newRearY  = primaryClamped.y;
      const d   = newRearY - midY;
      newFrontY = midY - d;
    }

    if (Number.isFinite(newFrontY) && overheadZones.front) newFrontY = Math.min(Math.max(newFrontY, overheadZones.front.yMin), overheadZones.front.yMax);
    if (Number.isFinite(newMidY)   && overheadZones.mid)   newMidY   = Math.min(Math.max(newMidY,   overheadZones.mid.yMin),   overheadZones.mid.yMax);
    if (Number.isFinite(newRearY)  && overheadZones.rear)  newRearY  = Math.min(Math.max(newRearY,  overheadZones.rear.yMin),  overheadZones.rear.yMax);

    for (const s of placedSpeakers) {
      const role = getCanonicalRole(s.role);
      if (!role || !role.startsWith('T')) continue;
      const current = { ...(s.position || {}) };
      if (isLeftRole(role)  && leftColumnX  != null) current.x = leftColumnX;
      if (isRightRole(role) && rightColumnX != null) current.x = rightColumnX;
      if (isFrontRole(role) && Number.isFinite(newFrontY)) current.y = newFrontY;
      if (isMidRole(role)   && Number.isFinite(newMidY))   current.y = newMidY;
      if (isRearRole(role)  && Number.isFinite(newRearY))  current.y = newRearY;
      finalPositions.push({ id: s.id, position: current, positionSource: 'user' });
    }
    return { finalPositions, additionalUpdates };
  }

  // ── 6. Generic fallback ───────────────────────────────────────────────────
  const currentX = spk.position?.x ?? 0;
  const currentY = spk.position?.y ?? 0;
  if (Math.abs(rawX - currentX) > 0.001 || Math.abs(rawY - currentY) > 0.001) {
    finalPositions.push({
      id: speakerId,
      position: { ...(spk.position || {}), x: rawX, y: rawY },
      positionSource: 'user',
    });
  }
  return { finalPositions, additionalUpdates };
}