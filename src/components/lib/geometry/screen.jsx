import {
  screenPlaneOffsetY,
  viewableHeightM,
  MIN_SCREEN_CLEARANCE_M,
  BAFFLE_CAVITY_M,
} from "@/components/models/screen";

/** Viewable top/bottom from floor (m). */
export function screenVerticalBoundsFromFloor(cfg) {
  const viewH = viewableHeightM(cfg);
  const bottom = Number(cfg?.fromFloorM) || 0;
  const top = bottom + viewH;
  return { top, bottom, viewH };
}

/** Absolute Y (m) of the screen plane from the front wall. */
export function screenPlaneY(cfg) {
  return screenPlaneOffsetY(cfg);
}

/** LCR cabinet Y position (always behind the screen per spec). */
export function lcrYForMode(cfg /*, depthM */) {
  // We place LCR on the wall (y=0) for floating, or at the back of the baffle cavity (-0.30)
  if (!cfg || cfg.mode === "baffle") return -BAFFLE_CAVITY_M;
  return 0;
}

/** Check if there is at least MIN_SCREEN_CLEARANCE_M in front of the LCR. */
export function lcrHasClearance(cfg, lcrDepthM = 0.115) {
  const depth = Math.max(0, Number(lcrDepthM) || 0);
  const plane = screenPlaneOffsetY(cfg);

  if (plane <= 0) {
    // Baffle: clearance is cavity depth minus cabinet depth
    const gap = BAFFLE_CAVITY_M - depth;
    return gap >= MIN_SCREEN_CLEARANCE_M;
  }
  // Floating: plane distance must exceed cabinet depth by 20 mm
  const gap = plane - depth;
  return gap >= MIN_SCREEN_CLEARANCE_M;
}

/** Span on the front wall from MLP for an azimuth band (deg). */
export function frontWallSpanFromAngles(mlp, roomW, band) {
  const t = (deg) => Math.tan((deg * Math.PI) / 180);
  const x1 = mlp.x + mlp.y * t(band.minDeg);
  const x2 = mlp.x + mlp.y * t(band.maxDeg);
  return { xMin: Math.min(x1, x2), xMax: Math.max(x1, x2) };
}