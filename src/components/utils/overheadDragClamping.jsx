// components/utils/overheadDragClamping.js
// Clamping logic for overhead speaker dragging within RP22 zones
// Applies 50% overhang allowance matching the front-wide zone clamping pattern

/**
 * Symmetric pair drag for overhead speakers.
 * Drags front/rear pairs symmetrically about MLP, mid pairs together.
 * 
 * @returns {Object} { primary: {x, y}, partner: {x, y} }
 */
export function clampSymmetricOverheadPair({
  draggedRole,
  proposedPos,
  mlpY_m,
  widthM,
  lengthM,
  overheadZones,
}) {
  // Determine band and side
  const roleToBand = {
    'TFL': 'front', 'TFR': 'front', 'TFC': 'front',
    'TML': 'mid', 'TMR': 'mid', 'TL': 'mid', 'TR': 'mid',
    'TBL': 'rear', 'TBR': 'rear', 'TBC': 'rear'
  };
  
  const roleToSide = {
    'TFL': 'L', 'TML': 'L', 'TL': 'L', 'TBL': 'L',
    'TFR': 'R', 'TMR': 'R', 'TR': 'R', 'TBR': 'R'
  };

  const band = roleToBand[draggedRole];
  const side = roleToSide[draggedRole];

  if (!band || !overheadZones || overheadZones.status !== 'ok') {
    return { primary: proposedPos, partner: null };
  }

  const zone = band === 'front' ? overheadZones.frontZone 
    : band === 'mid' ? overheadZones.midZone 
    : overheadZones.backZone;

  if (!zone || !zone.active) {
    return { primary: proposedPos, partner: null };
  }

  // Clamp proposed position to zone bounds
  const clampedX = Math.max(zone.x1, Math.min(zone.x2, proposedPos.x));
  const clampedY = Math.max(zone.y1, Math.min(zone.y2, proposedPos.y));

  // Mirror X around room center
  const centerX = widthM / 2;
  const mirroredX = 2 * centerX - clampedX;

  // Handle Y mirroring based on band
  if (band === 'mid') {
    // Mid pair stays together
    return {
      primary: { x: clampedX, y: clampedY },
      partner: { x: mirroredX, y: clampedY }
    };
  }

  // Front/rear pairs: mirror Y about MLP
  const offset = clampedY - mlpY_m;
  const symmetricPartnerY = mlpY_m - offset;

  // Determine partner zone
  const partnerBand = band === 'front' ? 'rear' : 'front';
  const partnerZone = partnerBand === 'front' ? overheadZones.frontZone : overheadZones.backZone;

  if (!partnerZone || !partnerZone.active) {
    return {
      primary: { x: clampedX, y: clampedY },
      partner: null
    };
  }

  // Clamp partner Y to its zone
  const partnerY = Math.max(partnerZone.y1, Math.min(partnerZone.y2, symmetricPartnerY));

  return {
    primary: { x: clampedX, y: clampedY },
    partner: { x: mirroredX, y: partnerY }
  };
}

/**
 * Clamps an overhead speaker position to its RP22 zone with 50% overhang allowance.
 * 
 * @param {Object} params
 * @param {Object} params.proposedPos - Proposed position {x, y} in room meters
 * @param {string} params.canonicalRole - Overhead role (TFL, TFR, TML, TMR, TBL, TBR, etc.)
 * @param {Object} params.overheadZones - Zones from computeOverheadZones {frontZone, midZone, backZone, status}
 * @param {Object} params.speakerDims - Speaker dimensions {widthM, depthM, diameterM, round}
 * @param {number} params.widthM - Room width in meters
 * @param {number} params.lengthM - Room length in meters
 * @returns {Object} Clamped position {x, y} in room meters, or proposedPos if no clamping needed
 */
export function clampOverheadToZone({
  proposedPos,
  canonicalRole,
  overheadZones,
  speakerDims,
  widthM,
  lengthM
}) {
  // Safety: if zones are not ready or invalid, return unclamped position
  if (!overheadZones || overheadZones.status !== 'ok') {
    return {
      x: Math.max(0, Math.min(widthM, proposedPos.x)),
      y: Math.max(0, Math.min(lengthM, proposedPos.y))
    };
  }

  // Map role to zone
  let targetZone = null;
  if (['TFL', 'TFR'].includes(canonicalRole)) {
    targetZone = overheadZones.frontZone;
  } else if (['TL', 'TR', 'TML', 'TMR'].includes(canonicalRole)) {
    targetZone = overheadZones.midZone;
  } else if (['TBL', 'TBR'].includes(canonicalRole)) {
    targetZone = overheadZones.backZone;
  }

  // If zone is not active or not found, return room-clamped position
  if (!targetZone || !targetZone.active) {
    return {
      x: Math.max(0, Math.min(widthM, proposedPos.x)),
      y: Math.max(0, Math.min(lengthM, proposedPos.y))
    };
  }

  // Get zone bounds
  const { x1, x2, y1, y2 } = targetZone;

  // Calculate speaker half-size for overhang allowance
  // Use diameterM for round speakers, otherwise use max(widthM, depthM)
  const OVERHANG_ALLOWANCE = 0.5; // 50% of speaker size can overhang
  
  let speakerHalfSize;
  if (speakerDims.round && Number.isFinite(speakerDims.diameterM)) {
    speakerHalfSize = speakerDims.diameterM / 2;
  } else {
    const w = Number(speakerDims.widthM) || 0.24;
    const d = Number(speakerDims.depthM) || 0.24;
    speakerHalfSize = Math.max(w, d) / 2;
  }

  const allowedOverhang = OVERHANG_ALLOWANCE * speakerHalfSize * 2; // Full dimension * 50%

  // Apply clamping with overhang allowance
  // Y-axis: allow speaker center to be placed such that up to 50% can be outside zone
  const yMinAllowed = y1 - allowedOverhang + speakerHalfSize;
  const yMaxAllowed = y2 + allowedOverhang - speakerHalfSize;
  
  const clampedY = Math.max(yMinAllowed, Math.min(yMaxAllowed, proposedPos.y));

  // X-axis: typically overhead speakers snap to x1 or x2 (left/right ceiling line)
  // For now, just ensure they stay within [x1, x2] bounds with no overhang on X
  // (since overheads are positioned along vertical ceiling lines)
  const clampedX = Math.max(x1, Math.min(x2, proposedPos.x));

  return { x: clampedX, y: clampedY };
}