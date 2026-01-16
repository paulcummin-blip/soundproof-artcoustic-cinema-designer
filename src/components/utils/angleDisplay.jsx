/**
 * Display helper for angle formatting
 * Always shows whole degrees (rounded down), no decimals
 */

export function formatDegFloor(deg) {
  if (!Number.isFinite(deg)) return "—";
  return `${Math.floor(deg)}°`;
}