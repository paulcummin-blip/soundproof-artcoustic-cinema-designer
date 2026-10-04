// reportBassSeriesStyle.js
// ---------------------------------------------------------------------------
// The Technical Report's own line styling for the bass response graphs.
//
// The report is printed, so its lines have to stay tellable apart in muted
// brand colour AND in line style — never by colour alone:
//
//   • the RSP reference is the Sound Proof green, solid and the heaviest trace;
//   • each plotted Primary seat takes a muted Artcoustic tone paired with its
//     own dash pattern, unique for every seat the page can plot;
//   • the house-curve target is a light neutral dashed line, so it reads as the
//     reference the seats are judged against and never competes with them.
//
// Presentation only: no curve, value, label or seat count is touched here.
// ---------------------------------------------------------------------------

/** The RSP reference: Sound Proof green, solid, heaviest — never mistakable. */
export const REPORT_RSP_STYLE = { color: "#4A7560", strokeWidth: 3, strokeDasharray: null };

/** The house-curve target: neutral, thin and dashed — lower priority than any seat. */
export const REPORT_TARGET_STYLE = { color: "#8A8580", strokeWidth: 1.5, strokeDasharray: "9 5" };

/** Muted Artcoustic / Sound Proof seat tones, in order of the plotted seats. */
export const REPORT_SEAT_PALETTE = ["#213428", "#625143", "#4A230F", "#3E4349", "#C1B6AD"];

/** One pattern per palette slot, so colour and line style always move together. */
const SEAT_PATTERNS = [null, "11 5", "2 4", "15 4 2 4", "6 4"];

/** Slightly different weights keep even the closest pair of tones separable. */
const SEAT_WEIGHTS = [2.25, 2.1, 2.1, 2.1, 2.6];

/**
 * The style for the plotted seat at `index` (0 = first plotted Primary seat).
 * Colour and dash pattern advance together, so the page's own seat cap (8) can
 * never produce two seats that look the same.
 */
export function reportSeatStyle(index = 0) {
  const slot = Math.abs(Math.trunc(Number(index) || 0));
  const colourSlot = slot % REPORT_SEAT_PALETTE.length;
  const patternSlot = (slot + Math.floor(slot / REPORT_SEAT_PALETTE.length)) % SEAT_PATTERNS.length;
  return {
    color: REPORT_SEAT_PALETTE[colourSlot],
    strokeWidth: SEAT_WEIGHTS[colourSlot],
    strokeDasharray: SEAT_PATTERNS[patternSlot],
  };
}