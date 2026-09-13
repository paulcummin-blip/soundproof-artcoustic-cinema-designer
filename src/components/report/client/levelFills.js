/**
 * ONE canonical level-fill map for all client visual reports.
 * Derived from RP22_GRADE_TOKENS — the same authority used by grading
 * pills, seat markers, and all other report surfaces.
 *
 * Zone fills use the canonical BORDER colours at moderate dilution
 * (rgba alpha) rather than the ultra-light .bg values, which are
 * designed for small pills and are too close together for large
 * background areas.  This gives:
 *   - enough contrast between adjacent nested zones
 *   - calm, report-quality appearance (no strong saturated blocks)
 *   - semantic connection to the canonical level palette
 *
 * below-l1 = diluted FAIL border (light warm brown — below threshold)
 * L1–L4    = diluted level borders (bronze → stone → slate → green)
 */

import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";

export const LEVEL_FILLS = {
  "below-l1": "rgba(74, 35, 15, 0.07)",   // FAIL border #4A230F diluted — light warm brown
  "l1":       "rgba(181, 142, 92, 0.20)", // L1 border #B58E5C diluted — light bronze
  "l2":       "rgba(179, 168, 155, 0.16)",// L2 border #B3A89B diluted — light stone
  "l3":       "rgba(123, 128, 136, 0.12)",// L3 border #7B8088 diluted — light slate
  "l4":       "rgba(74, 117, 96, 0.14)",  // L4 border #4A7560 diluted — light green
};

/**
 * Shared zone label colour authority for client visual reports.
 * Uses canonical level text colours so labels are legible against
 * the matching level fill and semantically connected to the level.
 * below-l1 uses the FAIL border (dark burgundy-brown) for readability
 * on the light warm-brown fill.
 */
export const LEVEL_LABEL_COLORS = {
  "below-l1": RP22_GRADE_TOKENS.FAIL.border, // #4A230F — dark warm brown
  "l1":       RP22_GRADE_TOKENS.L1.text,     // #7A4F1A
  "l2":       RP22_GRADE_TOKENS.L2.text,     // #6B5F54
  "l3":       RP22_GRADE_TOKENS.L3.text,     // #3E4349
  "l4":       RP22_GRADE_TOKENS.L4.text,     // #213428
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