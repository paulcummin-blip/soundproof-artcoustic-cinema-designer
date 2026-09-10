// Shared screen-geometry resolver for RSP calculations.
//
// Single canonical interpretation of:
//   - screen front plane (with floating-screen depth fallback)
//   - visible screen width (TV-preset / manual-override / legacy-manual aware)
//
// Used by every RSP consumer (RoomVisualisation, RvStaticCanvas, useClientReportAuthority,
// RP22Report) so that auto_from_screen mode produces the same coordinate everywhere.
//
// This module does NOT change screen-sizing rules. It only unifies the fallback
// chain so every consumer feeds identical inputs to computeEffectiveRsp().

import {
  resolveEffectiveVisibleWidthInches,
  isManualOverrideActive,
} from "@/components/models/screen/resolveEffectiveScreen";

const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };

const DEFAULT_SCREEN_WIDTH_INCHES = 120;
const DEFAULT_FLOAT_DEPTH_M = 0.20;

/**
 * Resolve the visible screen width in metres using the full canonical chain:
 *   1. New manualSize override (enabled + valid)
 *   2. TV preset key
 *   3. TV width in mm
 *   4. visibleWidthInches
 *   5. Legacy manualWidthM (metres)
 *   6. Legacy manualHeightM × aspectRatio
 *   7. Default 120"
 *
 * @param {object} screen - screen state object from appState
 * @returns {number} visible screen width in metres
 */
export function resolveRspScreenWidthM(screen) {
  if (!screen) return DEFAULT_SCREEN_WIDTH_INCHES * 0.0254;

  // 1. New manualSize override system
  if (isManualOverrideActive(screen)) {
    const inches = resolveEffectiveVisibleWidthInches(screen);
    if (Number.isFinite(inches) && inches > 0) return inches * 0.0254;
  }

  // 2. TV preset
  if (screen.tvPresetKey && TV_KEY_TO_INCHES[screen.tvPresetKey]) {
    return TV_KEY_TO_INCHES[screen.tvPresetKey] * 0.0254;
  }

  // 3. TV width in mm
  const tvMm = Number(screen.tvWidthMm);
  if (Number.isFinite(tvMm) && tvMm > 0) return (tvMm / 25.4) * 0.0254;

  // 4. visibleWidthInches
  const vwi = Number(screen.visibleWidthInches);
  if (Number.isFinite(vwi) && vwi > 0) return vwi * 0.0254;

  // 5. Legacy manual width in metres
  const mw = Number(screen.manualWidthM);
  if (Number.isFinite(mw) && mw > 0) return mw;

  // 6. Legacy manual height + aspect ratio
  const mh = Number(screen.manualHeightM);
  const ar = Number(screen.aspectRatio);
  if (Number.isFinite(mh) && mh > 0 && Number.isFinite(ar) && ar > 0) return mh * ar;

  // 7. Default
  return DEFAULT_SCREEN_WIDTH_INCHES * 0.0254;
}

/**
 * Resolve the screen front plane Y in metres using the full canonical chain:
 *   1. Published appState.screenFrontPlaneM (> 0)
 *   2. Live screen.screenPlaneY_m (> 0)
 *   3. screen.floatDepthM (> 0)
 *   4. Default 0.20 m
 *
 * @param {number|null|undefined} appStateScreenFrontPlaneM - persisted/published value
 * @param {object} screen - screen state object (for live screenPlaneY_m and floatDepthM)
 * @returns {number} screen front plane Y in metres
 */
export function resolveRspScreenFrontPlaneM(appStateScreenFrontPlaneM, screen) {
  // 1. Published screenFrontPlaneM
  const raw = Number(appStateScreenFrontPlaneM);
  if (Number.isFinite(raw) && raw > 0) return raw;

  // 2. Live screen plane Y (set by useScreenPlane in Room Designer)
  const screenPlaneY = Number(screen?.screenPlaneY_m);
  if (Number.isFinite(screenPlaneY) && screenPlaneY > 0) return screenPlaneY;

  // 3. Float depth
  const floatDepth = Number(screen?.floatDepthM);
  if (Number.isFinite(floatDepth) && floatDepth > 0) return floatDepth;

  // 4. Default
  return DEFAULT_FLOAT_DEPTH_M;
}