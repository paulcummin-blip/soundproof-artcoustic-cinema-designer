// startingLayoutFallbacks.js
// ---------------------------------------------------------------------------
// Geometric fallback subwoofer layouts for the Starting Layout selector.
//
// The fast bass placement advisor provides optimised positions, but it is
// blocked for brand-new projects (instanceStatus UNINITIALISED) and may take
// a debounce period to compute. These fallbacks ensure the selector ALWAYS
// shows three usable cards with valid positions so a designer can choose a
// layout immediately — without waiting for or depending on the advisor.
//
// Layouts are simple symmetric arrangements:
//   1 sub  — centre of the front wall
//   2 subs — front wall, quarter-points from each side
//   4 subs — front + rear wall, quarter-points from each side
//
// Coordinates are cabinet centres in metres, matching the advisor's output
// format: { sources: [{ x, y, placement, z }] }.
//
// No acoustics maths. No optimiser. No RP22. Pure geometry.
// ---------------------------------------------------------------------------

const CABINET_OFFSET_M = 0.3; // 30 cm from wall to cabinet centre
const SIDE_FRACTION = 0.25; // quarter-point from each side wall

function finiteRoom(roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  if (!Number.isFinite(width) || width <= 0) return null;
  if (!Number.isFinite(length) || length <= 0) return null;
  return { width, length };
}

function clampToRoom(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build a fallback layout for a given subwoofer quantity.
 * Returns { sources, metrics, recommendationKind, practicalReason } matching
 * the advisor's layout shape, or null if room dimensions are invalid.
 */
export function buildFallbackLayout(quantity, roomDims, sourceHeights) {
  const room = finiteRoom(roomDims);
  if (!room) return null;

  const { width, length } = room;
  const frontY = Math.min(CABINET_OFFSET_M, length * 0.2);
  const rearY = length - Math.min(CABINET_OFFSET_M, length * 0.2);
  const leftX = clampToRoom(width * SIDE_FRACTION, CABINET_OFFSET_M, width - CABINET_OFFSET_M);
  const rightX = clampToRoom(width - width * SIDE_FRACTION, CABINET_OFFSET_M, width - CABINET_OFFSET_M);
  const centerX = width / 2;

  const frontZ = Number(sourceHeights?.front) || 0.05;
  const rearZ = Number(sourceHeights?.rear) || frontZ;

  let sources = [];

  if (quantity === 1) {
    sources = [
      { x: centerX, y: frontY, z: frontZ, placement: "front" },
    ];
  } else if (quantity === 2) {
    sources = [
      { x: leftX, y: frontY, z: frontZ, placement: "front" },
      { x: rightX, y: frontY, z: frontZ, placement: "front" },
    ];
  } else if (quantity === 4) {
    sources = [
      { x: leftX, y: frontY, z: frontZ, placement: "front" },
      { x: rightX, y: frontY, z: frontZ, placement: "front" },
      { x: leftX, y: rearY, z: rearZ, placement: "rear" },
      { x: rightX, y: rearY, z: rearZ, placement: "rear" },
    ];
  } else {
    return null;
  }

  return {
    sources,
    metrics: { sourceCount: sources.length },
    recommendationKind: "fallback",
    practicalReason: "Symmetric starting layout — optimised placement will refine this after calculation.",
  };
}

/**
 * Build all three fallback layouts (1, 2, 4) keyed by quantity.
 */
export function buildFallbackRecommendations(roomDims, sourceHeights) {
  return {
    1: buildFallbackLayout(1, roomDims, sourceHeights),
    2: buildFallbackLayout(2, roomDims, sourceHeights),
    4: buildFallbackLayout(4, roomDims, sourceHeights),
  };
}

/**
 * Merge advisor recommendations with fallbacks.
 * Advisor results take priority when available; fallbacks fill gaps.
 * Returns a recommendations object with all three quantities populated
 * (or null entries where even the fallback can't compute — invalid room).
 */
export function mergeWithFallbacks(advisorRecommendations, roomDims, sourceHeights) {
  const fallbacks = buildFallbackRecommendations(roomDims, sourceHeights);
  const advisor = advisorRecommendations || {};
  return {
    1: advisor[1] || fallbacks[1] || null,
    2: advisor[2] || fallbacks[2] || null,
    4: advisor[4] || fallbacks[4] || null,
  };
}