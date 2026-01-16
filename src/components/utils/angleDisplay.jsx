// Safe angle display formatter
// Returns floor values for stable, whole-degree angle display

export function toDegFloorNumber(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

export function formatDegFloor(v) {
  const n = toDegFloorNumber(v);
  return n !== null ? `${n}°` : '—';
}