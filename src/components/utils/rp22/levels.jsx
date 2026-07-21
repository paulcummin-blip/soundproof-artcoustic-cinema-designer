/**
 * RP22 Level mappers - pure functions that map parameter values to compliance levels
 * Returns {level: string, ok: boolean}
 */

export function levelP4_screenDelta(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 2) return { level: 'L4', ok: true };
  if (dB <= 4) return { level: 'L3', ok: true };
  if (dB <= 5) return { level: 'L2', ok: true };
  if (dB <= 6) return { level: 'L1', ok: true };
  return { level: 'N/A', ok: false };
}

export function levelP5_surSpacing(deg) {
  if (!Number.isFinite(deg)) return { level: 'N/A', ok: false };
  if (deg <= 50) return { level: 'L4', ok: true };
  if (deg <= 60) return { level: 'L3', ok: true };
  if (deg <= 80) return { level: 'L2', ok: true };
  return { level: 'L1', ok: true };
}

export function levelP6_surDelta(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 2) return { level: 'L4', ok: true };
  if (dB <= 4) return { level: 'L3', ok: true };
  if (dB <= 6) return { level: 'L2', ok: true };
  if (dB <= 10) return { level: 'L1', ok: true };
  return { level: 'N/A', ok: false };
}

export function levelP9_upperSpacing(deg) {
  if (!Number.isFinite(deg)) return { level: 'N/A', ok: false };
  if (deg <= 50) return { level: 'L4', ok: true };
  if (deg <= 60) return { level: 'L3', ok: true };
  if (deg <= 80) return { level: 'L2', ok: true };
  return { level: 'L1', ok: true };
}

export function levelP10_upperDelta(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 2) return { level: 'L4', ok: true };
  if (dB <= 5) return { level: 'L3', ok: true };
  if (dB <= 8) return { level: 'L2', ok: true };
  if (dB <= 12) return { level: 'L1', ok: true };
  return { level: 'N/A', ok: false };
}

export function levelP16_screenFR(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 1.5) return { level: 'L4', ok: true };
  if (dB <= 3.0) return { level: 'L2', ok: true };
  if (dB <= 5.0) return { level: 'L1', ok: true };
  return { level: 'N/A', ok: false };
}

export function levelP17_wsFR(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 1.5) return { level: 'L4', ok: true };
  if (dB <= 3.0) return { level: 'L3', ok: true };
  return { level: 'L2', ok: true };
}

export function levelP20_lfConsistency(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= 2) return { level: 'L4', ok: true };
  if (dB <= 3) return { level: 'L3', ok: true };
  if (dB <= 4) return { level: 'L2', ok: true };
  return { level: 'L1', ok: true };
}

export function levelP21_earlyReflections(dB) {
  if (!Number.isFinite(dB)) return { level: 'N/A', ok: false };
  if (dB <= -12) return { level: 'L4', ok: true };
  if (dB <= -10) return { level: 'L3', ok: true };
  if (dB <= -8) return { level: 'L2', ok: true };
  return { level: 'L1', ok: true };
}

export function numericRp22Level(result) {
  const match = String(result?.level || '').match(/^L([1-4])$/);
  return match ? Number(match[1]) : null;
}

export function getP21PresetResult(preset) {
  const values = { l2: -8, l3: -10, l4: -12 };
  const value = values[String(preset || '').toLowerCase()];
  if (!Number.isFinite(value)) return { value: null, formatted: 'N/A', level: 'N/A', applicable: false };
  return { value, formatted: `${value} dB`, level: levelP21_earlyReflections(value).level, applicable: true };
}