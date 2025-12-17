export function formatDb(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)} dB`;
}