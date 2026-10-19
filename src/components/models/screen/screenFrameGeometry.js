// Single authority for the complete screen frame in room space.
//
// The viewable image is not the whole screen: the frame adds a border on EVERY
// side, and the stored "height from floor" is the bottom of that COMPLETE frame.
// So, in room coordinates:
//
//   frame bottom   = heightFromFloorM            (the field the designer sets)
//   viewable bottom= frame bottom + one border
//   viewable top   = viewable bottom + viewable height
//   frame top      = viewable top  + one border  (= frame bottom + overall height)
//
// Every consumer — the Screen Setup metrics, the room-fit warning and the
// elevation drawings — reads these numbers from here, so a drawing can never
// disagree with the calculation. The geometry is never clamped to the room: a
// screen that does not fit its ceiling is stated as it is built.
//
// Border is PER SIDE, matching the Screen Setup field: overall dimensions add it
// twice.

import { resolveEffectiveViewableDimsM } from "@/components/models/screen/resolveEffectiveScreen";

/** The border a screen is read with when the design states none (per side). */
export const DEFAULT_SCREEN_BORDER_M = 0.05;

/** The height from floor a screen is read with when the design states none. */
export const DEFAULT_SCREEN_FROM_FLOOR_M = 0.5;

/** The border thickness in metres, per side. */
export function resolveScreenBorderM(screen) {
  const stated = Number(screen?.borderThicknessM);
  return Number.isFinite(stated) && stated > 0 ? stated : DEFAULT_SCREEN_BORDER_M;
}

/**
 * Resolve the complete screen frame from the one screen configuration.
 *
 * @param {object} screen - the screen config (width/aspect/manual override,
 *                          borderThicknessM, heightFromFloorM)
 * @returns {{
 *   borderM: number, viewableWidthM: number, viewableHeightM: number,
 *   overallWidthM: number, overallHeightM: number,
 *   frameBottomM: number, viewableBottomM: number, viewableTopM: number,
 *   frameTopM: number
 * }}
 */
export function resolveScreenFrameGeometry(screen) {
  const viewable = resolveEffectiveViewableDimsM(screen);
  const borderM = resolveScreenBorderM(screen);

  const statedFloorM = Number(screen?.heightFromFloorM);
  const frameBottomM = Number.isFinite(statedFloorM) ? statedFloorM : DEFAULT_SCREEN_FROM_FLOOR_M;

  const viewableBottomM = frameBottomM + borderM;
  const viewableTopM = viewableBottomM + viewable.heightM;
  const frameTopM = viewableTopM + borderM;

  return {
    borderM,
    viewableWidthM: viewable.widthM,
    viewableHeightM: viewable.heightM,
    overallWidthM: viewable.widthM + borderM * 2,
    overallHeightM: viewable.heightM + borderM * 2,
    frameBottomM,
    viewableBottomM,
    viewableTopM,
    frameTopM,
  };
}

/**
 * How the resolved frame sits against the room's height, in metres.
 * ceilingOverflowM is positive when the complete frame passes the ceiling — the
 * exact amount the drawing must show, never a reason to move or shrink it.
 */
export function screenFrameRoomFit(geometry, roomHeightM) {
  const roomH = Number(roomHeightM);
  const ceilingOverflowM = Number.isFinite(roomH) ? geometry.frameTopM - roomH : 0;
  const floorOverflowM = Math.max(0, -geometry.frameBottomM);
  return {
    ceilingOverflowM,
    floorOverflowM,
    fits: ceilingOverflowM <= 0 && floorOverflowM <= 0,
  };
}