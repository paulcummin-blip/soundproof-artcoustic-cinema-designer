// utils/frontMainsUtils.js

// ---- constants used everywhere ----
const ROOM_MIN_INSET = 0.15;      // keep inside the screen by ≥ 0.15 m (design spec)
const UI_EDGE_GAP_PX = 6;         // visible gap to show the screen edge at any zoom
const SPEAKER_ICON_RADIUS_PX = 15; // speaker icon radius in pixels

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Calculate visual inset needed to ensure screen edge is always visible
 */
function calculateVisualInset(zoom = 1, scale = 50) {
  // Convert zoom and scale to meters per pixel approximation
  const metersPerPx = 1 / (scale * zoom);
  
  // Speaker icon radius in meters at current zoom
  const iconRadiusM = SPEAKER_ICON_RADIUS_PX * metersPerPx;
  const uiEdgeGapM = UI_EDGE_GAP_PX * metersPerPx;
  
  // Minimum inset required to visually expose the screen edge
  const visualInsetM = iconRadiusM + uiEdgeGapM;
  
  // Final inset = max(visual requirement, design requirement)
  return Math.max(ROOM_MIN_INSET, visualInsetM);
}

/**
 * Place L/R speakers with dynamic visual inset to ensure screen edge visibility
 */
export function computeFrontLRWithVisualInset({
  roomWidth,
  screenWidthM,
  frontWallY = 0.1,
  zoom = 1,
  scale = 50
}) {
  // Calculate screen bounds (centered on room)
  const screenXMin = (roomWidth - screenWidthM) / 2;
  const screenXMax = screenXMin + screenWidthM;
  
  // Calculate required inset for current zoom level
  const insetM = calculateVisualInset(zoom, scale);
  
  // Ensure we don't make the speakers too close together
  const minSeparation = 0.4; // minimum 40cm between L and R
  const maxInset = (screenWidthM - minSeparation) / 2;
  const finalInset = Math.min(insetM, maxInset);
  
  const L = { 
    x: screenXMin + finalInset, 
    y: frontWallY,
    visualInset: finalInset,
    isVisuallyInset: finalInset > ROOM_MIN_INSET
  };
  
  const R = { 
    x: screenXMax - finalInset, 
    y: frontWallY,
    visualInset: finalInset,
    isVisuallyInset: finalInset > ROOM_MIN_INSET
  };
  
  return { L, R };
}

/**
 * Legacy compatibility function
 */
export function computeFrontLRInsideScreen(roomW, screenW, yFront) {
  return computeFrontLRWithVisualInset({
    roomWidth: roomW,
    screenWidthM: screenW,
    frontWallY: yFront,
    zoom: 1,
    scale: 50
  });
}