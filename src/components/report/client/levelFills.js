/**
 * ONE canonical level-fill map for all client visual reports.
 * Opaque, tonal dark→light. No opacity stacking.
 * Below L1 = darkest, L4 = lightest.
 *
 * Neutral grey palette — matches the restrained visual language
 * used across P5, P9, P12, P13 and P16/P17 client report pages.
 */
export const LEVEL_FILLS = {
  "below-l1": "#3E4349", // darkest — poorest result
  "l1":       "#6F7275",
  "l2":       "#989B9D",
  "l3":       "#C4C5C4",
  "l4":       "#E8E8E6", // lightest — best result
};

/**
 * Shared zone label colour authority for client visual reports.
 * Below L1 and L1 use white for contrast against the darker fills;
 * L2–L4 use the report dark neutral text colour already used by RP23.
 */
export const LEVEL_LABEL_COLORS = {
  "below-l1": "#F8F8F7",
  "l1":       "#F8F8F7",
  "l2":       "#3E4349",
  "l3":       "#3E4349",
  "l4":       "#3E4349",
};

/**
 * Shared bottom-right zone label position helper.
 *
 * Returns { x, y, textAnchor } positioned at the bottom-right corner
 * of a visible zone, or null when the zone is too shallow to contain
 * the label cleanly.
 *
 * @param {number} zoneRightPx      - Right boundary of the visible zone (px)
 * @param {number} zoneBottomPx     - Bottom boundary of the visible zone (px)
 * @param {number} fontSize         - Label font size (px)
 * @param {number} availableDepthPx - Visible depth available for the label (px)
 * @param {number} rightInset       - Horizontal inset from right edge (px, default 5)
 * @returns {{x: number, y: number, textAnchor: string} | null}
 */
export function zoneLabelPosition(zoneRightPx, zoneBottomPx, fontSize, availableDepthPx, rightInset = 5) {
  if (!Number.isFinite(availableDepthPx) || availableDepthPx < fontSize) return null;
  const bottomInset = Math.min(0.7 * fontSize, 0.25 * availableDepthPx);
  return {
    x: zoneRightPx - rightInset,
    y: zoneBottomPx - bottomInset,
    textAnchor: "end",
  };
}