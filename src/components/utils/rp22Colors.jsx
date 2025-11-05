export const BRAND_RP22 = {
  green: "#2A6E3F",  // success (meets/exceeds)
  amber: "#935F1A",  // within 3 dB
  red: "#7A1E19",    // below -3 dB
  text: "#1B1A1A",   // default text
};

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