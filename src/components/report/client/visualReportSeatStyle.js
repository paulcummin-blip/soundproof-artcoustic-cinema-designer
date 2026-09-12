/**
 * visualReportSeatStyle.js
 * ------------------------
 * Shared seat-circle style authority for Visual Report components.
 *
 * Derives seat circle colours from the canonical RP22_GRADE_TOKENS
 * (the same authority used by RP22 grading pills). Provides:
 *   - Grade-based fill/border (L1-L4, FAIL, N/A)
 *   - Priority-based outline weight (Primary = bold, Secondary = normal)
 *
 * Grade colour = RP22 RESULT.  Outline weight = SEAT PRIORITY.
 * These are two independent visual signals and must never be conflated.
 */

import { RP22_GRADE_TOKENS, resolveGradeToken } from "@/components/utils/rp22Colors";

const ASSESSED_KEYS = new Set(["L4", "L3", "L2", "L1", "FAIL"]);

/**
 * Returns true when the level is a genuine assessed result (L1-L4 or FAIL).
 * Returns false for N/A, Not assessed, Not calculated, null, —.
 */
export function isAssessedLevel(level) {
  if (level == null) return false;
  const { key } = resolveGradeToken(level);
  return ASSESSED_KEYS.has(key);
}

/**
 * Canonical grade colours for a seat circle, derived from RP22_GRADE_TOKENS.
 * @param {string|number|null} level - L1-L4, FAIL, or null
 * @returns {{ fill: string, border: string, text: string, isFail: boolean }}
 */
export function getSeatGradeColors(level) {
  const { key, token } = resolveGradeToken(level);
  if (ASSESSED_KEYS.has(key)) {
    return {
      fill: token.bg,
      border: token.border,
      text: token.text,
      isFail: token.solid === true,
    };
  }
  return {
    fill: RP22_GRADE_TOKENS.NA.bg,
    border: RP22_GRADE_TOKENS.NA.border,
    text: RP22_GRADE_TOKENS.NA.text,
    isFail: false,
  };
}

// Outline weights — Primary is clearly heavier than Secondary.
const PRIMARY_STROKE_WIDTH = 3.5;
const SECONDARY_STROKE_WIDTH = 1.5;
const PRIMARY_DOT_R = 7;
const SECONDARY_DOT_R = 5;

/**
 * Build SVG style props for a seat circle in the Visual Report.
 *
 * Grade colour comes from canonical RP22_GRADE_TOKENS.
 * Outline weight comes from the seat's isPrimary flag:
 *   - Primary: bold outer ring
 *   - Secondary/Other: normal/light outline
 *
 * @param {string|number|null} level - L1-L4, FAIL, or null
 * @param {boolean} isPrimary - whether this seat is the primary listening position
 * @returns {{ zoneFill, zoneStroke, zoneStrokeWidth, dotR, dotFill, dotStroke, dotStrokeWidth }}
 */
export function getSeatCircleStyle(level, isPrimary) {
  const grade = getSeatGradeColors(level);
  const zoneStrokeWidth = isPrimary ? PRIMARY_STROKE_WIDTH : SECONDARY_STROKE_WIDTH;
  const dotR = isPrimary ? PRIMARY_DOT_R : SECONDARY_DOT_R;
  const dotFill = grade.isFail ? RP22_GRADE_TOKENS.FAIL.bg : grade.text;
  return {
    zoneFill: grade.fill,
    zoneStroke: grade.border,
    zoneStrokeWidth,
    dotR,
    dotFill,
    dotStroke: "#F8F8F7",
    dotStrokeWidth: 1.5,
  };
}

/**
 * Check if any seat in the array has an assessed result for the given level key.
 * @param {Array} seats - seat objects
 * @param {string} levelKey - property name holding the level (e.g. "p9Level", "worstLevel")
 * @returns {boolean}
 */
export function hasAnyAssessedSeat(seats, levelKey) {
  if (!Array.isArray(seats)) return false;
  return seats.some((s) => isAssessedLevel(s[levelKey]));
}

/**
 * Priority legend entries for Visual Report seat diagrams.
 * Explains priority (outline weight), NOT grade colour.
 * Grade meaning is communicated by the RP22 result/pill in the table.
 */
export const PRIORITY_LEGEND = [
  {
    key: "primary",
    label: "Primary seating",
    stroke: "#213428",
    strokeWidth: PRIMARY_STROKE_WIDTH,
    fill: "none",
  },
  {
    key: "other",
    label: "Other seating",
    stroke: "#625143",
    strokeWidth: SECONDARY_STROKE_WIDTH,
    fill: "none",
  },
];