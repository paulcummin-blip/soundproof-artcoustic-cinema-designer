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

/** Convert a #RRGGBB hex string to an rgba() string with the given alpha. */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Semantic accent colour for each level — the strongest identifiable colour
 * for that level. Used for seat-highlight borders/rings and legible text on
 * translucent fills. Derived entirely from RP22_LEVEL_COLORS (no new shades).
 */
const LEVEL_ACCENT = {
  4: RP22_LEVEL_COLORS[4].border,    // #213428
  3: RP22_LEVEL_COLORS[3].border,    // #625143
  2: RP22_LEVEL_COLORS[2].border,    // #C1B6AD
  1: RP22_LEVEL_COLORS[1].border,    // #4A230F
  fail: RP22_LEVEL_COLORS.fail.text, // #DC2626
};

/**
 * Get translucent highlight colours for a level — for seat backgrounds and
 * other areas where a solid fill would be too dominant. Returns a light
 * translucent fill derived from the canonical level colour, a full-opacity
 * border in the same semantic colour, and a legible text colour.
 *
 * @param {number|string} level - The level (1-4), 0/null/'FAIL' for fail
 * @returns {{ fill: string, border: string, text: string }}
 */
export function getLevelHighlightColors(level) {
  const isFail = String(level || "").toUpperCase() === "FAIL" || level === 0;
  const n = typeof level === "number" && level >= 1 && level <= 4 ? level : null;
  if (isFail) {
    const accent = LEVEL_ACCENT.fail;
    return { fill: hexToRgba(accent, 0.12), border: accent, text: accent };
  }
  if (n) {
    const accent = LEVEL_ACCENT[n];
    // For light levels (L2), use the canonical dark text colour for legibility
    // on the translucent fill; for dark levels, the accent itself is legible.
    const text = n === 2 ? RP22_LEVEL_COLORS[2].text : accent;
    return { fill: hexToRgba(accent, 0.15), border: accent, text };
  }
  return { fill: "rgba(156,163,175,0.12)", border: "#9CA3AF", text: "#9CA3AF" };
}

/**
 * Optional DOM helper for inline style usage.
 * Example: <span style={getRp22DomStyle(value, target)}>{...}</span>
 */
export function getRp22DomStyle(value, target) {
  const { styles } = getRp22ResultStyle(value, target);
  return { color: styles.textColor };
}