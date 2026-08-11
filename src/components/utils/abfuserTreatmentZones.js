// abfuserTreatmentZones.js
// --------------------------------
// Shared utility: derives Abfuser treatment zones from actual room geometry,
// speaker positions, and seating positions using the image-source method.
//
// QUANTITY AUTHORITY: Simple strategic baseline, not zone-length coverage.
//   Base: 1 left + 1 right + 2 rear = 4 Abfusers
//   Side escalation: +1 per side when listening area is deep (>= 2.8 m)
//   Rear escalation: +2 rear when listening area is wide (>= 3.5 m)
//
// A treatment zone represents WHERE a panel can usefully be positioned,
// not an instruction to cover the full zone continuously.

export const ABFUSER_SKU = "500027";
export const ABFUSER_LABEL = "Artcoustic Abfuser, Black";

export const ABFUSER_PANEL_LENGTH_M = 1.10;
export const ABFUSER_PANEL_WIDTH_M = 0.70;
export const ABFUSER_PANEL_AREA_M2 = ABFUSER_PANEL_WIDTH_M * ABFUSER_PANEL_LENGTH_M; // 0.77

// Visual wall-band depth (plan-view thickness only — makes the zone visible)
export const ZONE_DEPTH_M = 0.12;
// Padding added to each end of a derived zone
const ZONE_PADDING_M = 0.20;
// Margin outside the seating envelope for the rear zone
const REAR_MARGIN_M = 0.20;

// Listening-area escalation thresholds
const SIDE_DEPTH_THRESHOLD_M = 2.8;  // deep listening area → 2 panels per side
const REAR_WIDTH_THRESHOLD_M = 3.5;   // wide listening area → 4 rear panels

function getFrontSpeakers(placedSpeakers) {
  if (!Array.isArray(placedSpeakers)) return [];
  return placedSpeakers.filter((s) => {
    const role = s?.role || s?.label;
    return role === "FL" || role === "FC" || role === "FR";
  });
}

function getSeats(seatingPositions) {
  if (!Array.isArray(seatingPositions)) return [];
  return seatingPositions
    .map((s) => ({
      x: Number(s?.x ?? s?.position?.x),
      y: Number(s?.y ?? s?.position?.y),
    }))
    .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
}

function getSpeakerPos(s) {
  const x = Number(s?.position?.x ?? s?.x);
  const y = Number(s?.position?.y ?? s?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * Image-source side-wall reflection Y.
 * Mirrors the source across the wall, finds where mirror→listener crosses the wall.
 * Returns null if the reflection is not between source and listener.
 */
function sideWallReflectionY(src, listener, wallX, isLeftWall) {
  const mirrorX = isLeftWall ? -src.x : 2 * wallX - src.x;
  const dx = listener.x - mirrorX;
  if (Math.abs(dx) < 1e-6) return null;
  const t = (wallX - mirrorX) / dx;
  if (t < 0 || t > 1) return null;
  return src.y + t * (listener.y - src.y);
}

/**
 * Compute treatment zones and recommended quantity from actual geometry.
 *
 * @param {Object} params
 * @param {Object} params.roomDims - { widthM, lengthM }
 * @param {Array}  params.placedSpeakers - speaker objects with role + position
 * @param {Array}  params.seatingPositions - seat objects with x, y
 * @returns {Object|null} zone data or null if room is invalid
 */
export function computeAbfuserTreatmentZones({ roomDims, placedSpeakers, seatingPositions }) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || widthM <= 0 || lengthM <= 0) {
    return null;
  }

  const frontSpeakers = getFrontSpeakers(placedSpeakers);
  const seats = getSeats(seatingPositions);

  // ── Side reflection zones (image-source method) ──
  const leftYs = [];
  const rightYs = [];

  for (const spk of frontSpeakers) {
    const src = getSpeakerPos(spk);
    if (!src) continue;
    for (const seat of seats) {
      const yLeft = sideWallReflectionY(src, seat, 0, true);
      if (Number.isFinite(yLeft) && yLeft >= 0 && yLeft <= lengthM) leftYs.push(yLeft);
      const yRight = sideWallReflectionY(src, seat, widthM, false);
      if (Number.isFinite(yRight) && yRight >= 0 && yRight <= lengthM) rightYs.push(yRight);
    }
  }

  // Fallback: nominal zone if no valid reflections (e.g. no speakers/seats)
  const useFallbackSide = leftYs.length === 0 && rightYs.length === 0;
  const leftMin = useFallbackSide ? lengthM * 0.2 : Math.min(...leftYs);
  const leftMax = useFallbackSide ? lengthM * 0.6 : Math.max(...leftYs);
  const rightMin = useFallbackSide ? lengthM * 0.2 : Math.min(...rightYs);
  const rightMax = useFallbackSide ? lengthM * 0.6 : Math.max(...rightYs);

  const leftStart = Math.max(0, leftMin - ZONE_PADDING_M);
  const leftEnd = Math.min(lengthM, leftMax + ZONE_PADDING_M);
  const rightStart = Math.max(0, rightMin - ZONE_PADDING_M);
  const rightEnd = Math.min(lengthM, rightMax + ZONE_PADDING_M);

  const leftLength = Math.max(0, leftEnd - leftStart);
  const rightLength = Math.max(0, rightEnd - rightStart);

  // ── Rear zone (from seating X envelope) ──
  let rearMinX, rearMaxX;
  if (seats.length > 0) {
    const seatXs = seats.map((s) => s.x);
    rearMinX = Math.max(0, Math.min(...seatXs) - REAR_MARGIN_M);
    rearMaxX = Math.min(widthM, Math.max(...seatXs) + REAR_MARGIN_M);
  } else {
    rearMinX = widthM * 0.2;
    rearMaxX = widthM * 0.8;
  }
  const rearWidth = Math.max(0, rearMaxX - rearMinX);

  // ── Listening area dimensions (from actual seat envelope) ──
  let listeningAreaWidth = 0;
  let listeningAreaDepth = 0;
  if (seats.length > 0) {
    const seatXs = seats.map((s) => s.x);
    const seatYs = seats.map((s) => s.y);
    listeningAreaWidth = Math.max(...seatXs) - Math.min(...seatXs);
    listeningAreaDepth = Math.max(...seatYs) - Math.min(...seatYs);
  }

  // ── Strategic quantity (simple ladder, not zone-length coverage) ──
  const leftPanels = listeningAreaDepth >= SIDE_DEPTH_THRESHOLD_M ? 2 : 1;
  const rightPanels = listeningAreaDepth >= SIDE_DEPTH_THRESHOLD_M ? 2 : 1;
  const rearPanels = listeningAreaWidth >= REAR_WIDTH_THRESHOLD_M ? 4 : 2;
  const recommendedQty = leftPanels + rightPanels + rearPanels;

  const treatmentSurfaceArea = recommendedQty * ABFUSER_PANEL_AREA_M2;

  return {
    leftZone: { start: leftStart, end: leftEnd, length: leftLength },
    rightZone: { start: rightStart, end: rightEnd, length: rightLength },
    rearZone: { minX: rearMinX, maxX: rearMaxX, width: rearWidth },
    zoneDepth: ZONE_DEPTH_M,
    leftPanels,
    rightPanels,
    rearPanels,
    recommendedQty,
    treatmentSurfaceArea,
    panelArea: ABFUSER_PANEL_AREA_M2,
    listeningAreaWidth,
    listeningAreaDepth,
    usedFallback: useFallbackSide,
  };
}