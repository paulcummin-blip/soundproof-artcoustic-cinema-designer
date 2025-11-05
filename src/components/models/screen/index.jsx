/** @typedef {"baffle"|"floating20"|"floating30"} ScreenMode */

/** Canonical screen config */
export const DEFAULT_SCREEN = {
  mode: "baffle",        // "baffle" | "floating20" | "floating30"
  viewableWidthM: 2.54,  // 100" = 2.54 m
  aspect: "16:9",        // "16:9" | "2.39:1" | "1.90:1"
  frameThicknessM: 0.08, // each side
  fromFloorM: 0.50,      // viewable bottom to floor
};

export const FLOATING_CAVITY = {
  floating20: 0.20,
  floating30: 0.30,
};

export const BAFFLE_CAVITY_M = 0.30;        // fixed “behind wall” depth we draw
export const MIN_SCREEN_CLEARANCE_M = 0.02; // ≥2 cm in front of speakers

/** Viewable height from width + aspect. */
export function viewableHeightM(cfg) {
  const w = Number(cfg?.viewableWidthM) || 0;
  switch (String(cfg?.aspect || "16:9")) {
    case "16:9":   return w * 9 / 16;
    case "2.39:1": return w / 2.39;
    case "1.90:1": return w / 1.90;
    default:       return w * 9 / 16;
  }
}

/** Outer width/height including frame. */
export function outerDimsM(cfg) {
  const vw = Number(cfg?.viewableWidthM) || 0;
  const vh = viewableHeightM(cfg);
  const t  = Number(cfg?.frameThicknessM) || 0;
  return { widthM: vw + 2 * t, heightM: vh + 2 * t };
}

/** Screen plane offset from the front wall (m). */
export function screenPlaneOffsetY(cfg) {
  if (!cfg || cfg.mode === "baffle") return 0; // on the wall
  return FLOATING_CAVITY[cfg.mode] || 0;       // 0.20 / 0.30
}