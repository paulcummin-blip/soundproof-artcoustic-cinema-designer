/**
 * rp22Colors.jsx — CANONICAL RP22 GRADING-PILL AUTHORITY
 * -------------------------------------------------------
 * The single source of truth for RP22 / RP23 performance-level colour tokens
 * across the entire Sound Proof app and all report surfaces.
 *
 * Every pill, badge, seat card, compliance tile, visual-report cell and
 * technical-report badge must derive its semantic colours from
 * RP22_GRADE_TOKENS below.  Only size/context variants are permitted —
 * the semantic colour treatment is invariant.
 *
 * Visual direction:
 *   L1–L4  — faded brand-colour background (~10-15%), medium border (~45-60%),
 *             full-strength brand-colour text.  Refined, not heavy.
 *   FAIL   — SOLID deep burgundy-brown fill, white text.  Exceptional weight.
 *   SEAT   — neutral white, fine border, dark text.
 *   N/A / NOT CALCULATED / — — neutral, muted.  Never a performance colour.
 *
 * L1 vs FAIL:
 *   L1   is a VALID achieved level — warm bronze / clay (golden-brown hue),
 *        light faded treatment.
 *   FAIL is a failure state — deep burgundy-brown (#4A230F), solid fill.
 *   They differ in BOTH hue AND treatment so nobody reads L1 as "almost FAIL".
 */

export const BRAND_RP22 = {
  green: "#2A6E3F",  // success (meets/exceeds) — SPL value colouring only
  amber: "#935F1A",  // within 3 dB — SPL value colouring only
  red: "#7A1E19",    // below -3 dB — SPL value colouring only
  text: "#1B1A1A",   // default text
};

/**
 * CANONICAL GRADE TOKENS — the single design-system authority.
 * Each entry: { bg, border, text, solid? }
 *   solid = true  → solid fill (FAIL only).  Pills render with white text on
 *                   a full-strength background and a matching border.
 *   solid = false → faded treatment.  Light background, medium border,
 *                   full-strength brand-colour text.
 */
export const RP22_GRADE_TOKENS = {
  L4: { bg: "#E8EFEB", border: "#4A7560", text: "#213428", solid: false }, // Sound Proof green
  L3: { bg: "#EDEEEF", border: "#7B8088", text: "#3E4349", solid: false }, // slate / charcoal
  L2: { bg: "#F2EEE9", border: "#B3A89B", text: "#6B5F54", solid: false }, // warm stone / taupe
  L1: { bg: "#F4EBDC", border: "#B58E5C", text: "#7A4F1A", solid: false }, // warm bronze / clay
  FAIL: { bg: "#4A230F", border: "#4A230F", text: "#FFFFFF", solid: true }, // deep burgundy-brown, solid
  SEAT: { bg: "#FFFFFF", border: "#D9D5CE", text: "#1B1A1A", solid: false }, // neutral white
  NA: { bg: "#F5F4F1", border: "#D9D5CE", text: "#8A8580", solid: false }, // neutral
  NOT_CALCULATED: { bg: "#F5F4F1", border: "#D9D5CE", text: "#8A8580", solid: false }, // neutral
  DASH: { bg: "#F5F4F1", border: "#D9D5CE", text: "#8A8580", solid: false }, // neutral —
};

/**
 * Resolve any level input to a canonical token key.
 * Accepts: 1-4, "L1"-"L4", 0/null/"FAIL", "SEAT", "N/A", "NOT CALCULATED", "—"/"-"/undefined.
 * @returns {key, token, label}
 */
export function resolveGradeToken(level) {
  const str = String(level ?? "").trim().toUpperCase();
  if (str === "L4" || level === 4) return { key: "L4", token: RP22_GRADE_TOKENS.L4, label: "L4" };
  if (str === "L3" || level === 3) return { key: "L3", token: RP22_GRADE_TOKENS.L3, label: "L3" };
  if (str === "L2" || level === 2) return { key: "L2", token: RP22_GRADE_TOKENS.L2, label: "L2" };
  if (str === "L1" || level === 1) return { key: "L1", token: RP22_GRADE_TOKENS.L1, label: "L1" };
  if (str === "FAIL" || level === 0) return { key: "FAIL", token: RP22_GRADE_TOKENS.FAIL, label: "FAIL" };
  if (str === "SEAT") return { key: "SEAT", token: RP22_GRADE_TOKENS.SEAT, label: "SEAT" };
  if (str === "N/A" || str === "NA") return { key: "NA", token: RP22_GRADE_TOKENS.NA, label: "N/A" };
  if (str === "NOT CALCULATED" || str === "NOT_CALCULATED") return { key: "NOT_CALCULATED", token: RP22_GRADE_TOKENS.NOT_CALCULATED, label: "NOT CALCULATED" };
  return { key: "DASH", token: RP22_GRADE_TOKENS.DASH, label: "—" };
}

/**
 * Backward-compatible RP22_LEVEL_COLORS map.
 * Kept for legacy consumers that read the map directly; now derived entirely
 * from RP22_GRADE_TOKENS so there is one authority.
 */
export const RP22_LEVEL_COLORS = {
  4: { bg: RP22_GRADE_TOKENS.L4.bg, text: RP22_GRADE_TOKENS.L4.text, border: RP22_GRADE_TOKENS.L4.border },
  3: { bg: RP22_GRADE_TOKENS.L3.bg, text: RP22_GRADE_TOKENS.L3.text, border: RP22_GRADE_TOKENS.L3.border },
  2: { bg: RP22_GRADE_TOKENS.L2.bg, text: RP22_GRADE_TOKENS.L2.text, border: RP22_GRADE_TOKENS.L2.border },
  1: { bg: RP22_GRADE_TOKENS.L1.bg, text: RP22_GRADE_TOKENS.L1.text, border: RP22_GRADE_TOKENS.L1.border },
  fail: { bg: RP22_GRADE_TOKENS.FAIL.bg, text: RP22_GRADE_TOKENS.FAIL.text, border: RP22_GRADE_TOKENS.FAIL.border },
};

/**
 * Get background, text and border colours for an RP22/RP23 level.
 * Legacy public API — returns { bg, text, border } from the canonical tokens.
 * @param {number|string} level - 1-4, 0/null/'FAIL'
 * @returns {{ bg: string, text: string, border: string }}
 */
export function getLevelColors(level) {
  const { token } = resolveGradeToken(level);
  return { bg: token.bg, text: token.text, border: token.border };
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
 * for that level.  Used for seat-highlight borders/rings and legible text on
 * translucent fills.  Derived entirely from RP22_GRADE_TOKENS.
 */
const LEVEL_ACCENT = {
  4: RP22_GRADE_TOKENS.L4.text,
  3: RP22_GRADE_TOKENS.L3.text,
  2: RP22_GRADE_TOKENS.L2.text,
  1: RP22_GRADE_TOKENS.L1.text,
  fail: RP22_GRADE_TOKENS.FAIL.bg,
};

/**
 * Get translucent highlight colours for a level — for seat backgrounds and
 * other areas where a solid fill would be too dominant.  Returns a light
 * translucent fill derived from the canonical accent colour, a full-opacity
 * border in the same semantic colour, and a legible text colour.
 *
 * @param {number|string} level - 1-4, 0/null/'FAIL'
 * @returns {{ fill: string, border: string, text: string }}
 */
export function getLevelHighlightColors(level) {
  const isFail = String(level || "").toUpperCase() === "FAIL" || level === 0;
  const n = typeof level === "number" && level >= 1 && level <= 4 ? level : null;
  if (isFail) {
    const accent = LEVEL_ACCENT.fail;
    return { fill: hexToRgba(accent, 0.10), border: accent, text: "#FFFFFF" };
  }
  if (n) {
    const accent = LEVEL_ACCENT[n];
    const text = RP22_GRADE_TOKENS[`L${n}`].text;
    return { fill: hexToRgba(accent, 0.12), border: accent, text };
  }
  return { fill: "rgba(138,133,128,0.10)", border: "#D9D5CE", text: "#8A8580" };
}

/**
 * getRp22ResultStyle(value, target)
 * - value: numeric SPL (dB) to evaluate
 * - target: numeric RP22 target (dB)
 *
 * Returns:
 *   { text: string, styles: { textColor: string } }
 * 'styles.textColor' is convenient for PDF libs; for DOM, use styles.color.
 *
 * NOTE: This is for SPL *value* colouring (green/amber/red against a target),
 * NOT for level pills.  Level pills always use RP22_GRADE_TOKENS.
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