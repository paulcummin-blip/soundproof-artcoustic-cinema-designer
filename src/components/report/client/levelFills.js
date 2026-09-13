/**
 * ONE canonical level-fill map for all client visual reports.
 * Opaque, tonal. Derived from RP22_GRADE_TOKENS — the same authority
 * used by grading pills, seat markers, and all other report surfaces.
 *
 * below-l1 = neutral (below threshold), L1–L4 use the canonical
 * semantic hue family (bronze → stone → slate → green).
 * L1 = warmest (poorest result), L4 = coolest (best result).
 */

import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";

export const LEVEL_FILLS = {
  "below-l1": "#C1B6AD", // neutral warm grey — below L1 threshold
  "l1":       RP22_GRADE_TOKENS.L1.bg, // #F4EBDC warm bronze
  "l2":       RP22_GRADE_TOKENS.L2.bg, // #F2EEE9 warm stone
  "l3":       RP22_GRADE_TOKENS.L3.bg, // #EDEEEF slate
  "l4":       RP22_GRADE_TOKENS.L4.bg, // #E8EFEB green
};

/**
 * Shared zone label colour authority for client visual reports.
 * Uses canonical level text colours so labels are legible against
 * the matching level fill and semantically connected to the level.
 */
export const LEVEL_LABEL_COLORS = {
  "below-l1": "#3E4349",
  "l1":       RP22_GRADE_TOKENS.L1.text,
  "l2":       RP22_GRADE_TOKENS.L2.text,
  "l3":       RP22_GRADE_TOKENS.L3.text,
  "l4":       RP22_GRADE_TOKENS.L4.text,
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