/**
 * Shared formatting helper for metre-based distance/position fields.
 * Rounds to 2 decimal places (centimetre resolution) for display only.
 * Internal numeric values always remain at full precision.
 *
 * @param {number|any} value - The numeric value in metres
 * @param {string|number} fallback - Returned as-is if value is not finite
 * @returns {string} Formatted string, e.g. "1.25" or fallback
 */
export function fmtM(value, fallback = '') {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback !== undefined ? String(fallback) : '';
  return n.toFixed(2);
}