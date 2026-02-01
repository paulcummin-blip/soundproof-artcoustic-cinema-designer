
// CRASH-SAFE DEFAULTS
// Buffer rules for front speaker/subwoofer placement relative to the front wall and screen plane.
// All values are in CENTIMETRES unless suffixed with _M.

// Rule 1: The minimum gap between the back of any front-stage speaker/subwoofer and the physical front wall.
export const WALL_BUFFER_CM = 2;

// Rule 2: The minimum gap between the front of any front-stage speaker/subwoofer and the screen's acoustic plane.
export const SCREEN_BUFFER_CM = 1;

// Derived METRE versions (for modules that expect *_M)
export const WALL_BUFFER_M = WALL_BUFFER_CM / 100;
export const SCREEN_BUFFER_M = SCREEN_BUFFER_CM / 100;

// For side-wall speaker placement only (SL/SR/LW/RW + extra surrounds)
export const SIDE_SPK_WALL_BUFFER_CM = 1;
export const SIDE_SPK_WALL_BUFFER_M = SIDE_SPK_WALL_BUFFER_CM / 100; // 0.01m

// Screen depth presets (centimetres)
export const SCREEN_DEPTH_OPTIONS_CM = [10, 20, 30]; // UI caps 10–30 cm
export const DEFAULT_SCREEN_DEPTH_CM = 20;

// Helpers
export const cmToM = (cm) =>
  Number.isFinite(cm) ? cm / 100 : DEFAULT_SCREEN_DEPTH_CM / 100;

export const getDepthM = (maybeCm) =>
  cmToM(Number.isFinite(maybeCm) ? maybeCm : DEFAULT_SCREEN_DEPTH_CM);
