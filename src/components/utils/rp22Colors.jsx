export const BRAND_RP22 = {
  green: "#2A6E3F",  // success (meets/exceeds)
  amber: "#935F1A",  // within 3 dB
  red: "#7A1E19",    // below -3 dB
  text: "#1B1A1A",   // default text
};

/**
 * RP22/RP23 Level Colors - Single Source of Truth
 * Used for all level indicators: HUD pills, menu bars, tooltips, reports
 */
export const RP22_LEVEL_COLORS = {
  4: { bg: "#213428", text: "#FFFFFF", border: "#213428" },  // Level 4 - brand green, light text
  3: { bg: "#625143", text: "#FFFFFF", border: "#625143" },  // Level 3 - warm brown, light text
  2: { bg: "#C1B6AD", text: "#1B1A1A", border: "#C1B6AD" },  // Level 2 - light warm grey, dark text
  1: { bg: "#4A230F", text: "#FFFFFF", border: "#4A230F" },  // Level 1 - dark chocolate, light text
  fail: { bg: "#F8F8F7", text: "#DC2626", border: "#E6E4DD" },  // Fail - neutral background, red text
};

/**
 * Get background and text colors for an RP22/RP23 level.
 * @param {number} level - The level (1-4) or 0/null/'FAIL' for fail state
 * @returns {{ bg: string, text: string, border?: string }} Color object
 */
export function getLevelColors(level) {
  if (typeof level !== 'number' || level < 1 || level > 4) {
    return RP22_LEVEL_COLORS.fail;
  }
  return RP22_LEVEL_COLORS[level];
}

/**
 * getRp22ResultStyle(value, target)
 * - value: numeric SPL (dB) to evaluate
 * - target: numeric RP22 target (dB)
 *
 * Returns:
 *   { text: string, styles: { textColor: string } }
 * 'styles.textColor' is convenient for PDF libs; for DOM, use styles.color.
 */
export function getRp22ResultStyle(value, target) {
  const v = Number(value);
  const t = Number(target);
  if (!Number.isFinite(v) || !Number.isFinite(t)) {
    return { text: "-", styles: { textColor: BRAND_RP22.text } };
  }
  const diff = v - t;
  if (diff >= 0) {
    return { text: `${v.toFixed(1)} dB`, styles: { textColor: BRAND_RP22.green } };
  } else if (diff >= -3) {
    return { text: `${v.toFixed(1)} dB`, styles: { textColor: BRAND_RP22.amber } };
  } else {
    return { text: `${v.toFixed(1)} dB`, styles: { textColor: BRAND_RP22.red } };
  }
}

/**
 * Optional DOM helper for inline style usage.
 * Example: <span style={getRp22DomStyle(value, target)}>{...}</span>
 */
export function getRp22DomStyle(value, target) {
  const { styles } = getRp22ResultStyle(value, target);
  return { color: styles.textColor };
}