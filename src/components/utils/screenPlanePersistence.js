// Persistence boundary only: zero is an explicit value; missing is not zero.
// This does not calculate geometry or substitute a default screen depth.
export function readPersistedScreenPlaneM(value) {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string')) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const metres = Number(value);
  return Number.isFinite(metres) && metres >= 0 ? metres : null;
}
