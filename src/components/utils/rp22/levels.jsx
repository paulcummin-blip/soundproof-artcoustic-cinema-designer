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

function directBassDeviation(dB) {
  return Number.isFinite(dB) ? Number(dB) : null;
}

function formatDirectBassDeviation(dB) {
  const direct = directBassDeviation(dB);
  if (direct == null) return '—';
  const rounded = Math.round(direct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// Backward-compatible export names. They now preserve the direct metric and
// must not floor or otherwise improve a maximum-deviation result.
export function floorP19Deviation(dB) {
  return directBassDeviation(dB);
}

export function formatP19Deviation(dB) {
  const direct = directBassDeviation(dB);
  return direct == null ? '—' : `±${formatDirectBassDeviation(direct)} dB`;
}

export function levelP19_lfResponse(dB) {
  const direct = directBassDeviation(dB);
  if (direct == null) return { level: 'N/A', ok: false };
  if (direct <= 2) return { level: 'L4', ok: true };
  if (direct <= 3) return { level: 'L3', ok: true };
  if (direct <= 4) return { level: 'L2', ok: true };
  if (direct <= 5) return { level: 'L1', ok: true };
  return { level: 'FAIL', ok: false };
}

export function floorP20Deviation(dB) {
  return directBassDeviation(dB);
}

export function formatP20Deviation(dB) {
  const direct = directBassDeviation(dB);
  return direct == null ? '—' : `±${formatDirectBassDeviation(direct)} dB`;
}

export function levelP20_lfConsistency(dB) {
  const direct = directBassDeviation(dB);
  if (direct == null) return { level: 'N/A', ok: false };
  if (direct <= 2) return { level: 'L4', ok: true };
  if (direct <= 3) return { level: 'L3', ok: true };
  if (direct <= 4) return { level: 'L2', ok: true };
  // RP22 P20 does not define Level 1. Sound Proof rule: >4 dB maps to L1
  // (not FAIL) because P20 is not applicable at Level 1. The large deviation
  // is still shown numerically — we grade at the highest level whose P20
  // requirement can be satisfied.
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
  const label = String(result?.level || '').toUpperCase();
  if (label === 'FAIL') return 0;
  const match = label.match(/^L([1-4])$/);
  return match ? Number(match[1]) : null;
}

export function getP21PresetResult(preset) {
  const values = { l2: -8, l3: -10, l4: -12 };
  const value = values[String(preset || '').toLowerCase()];
  if (!Number.isFinite(value)) return { value: null, formatted: 'N/A', level: 'N/A', applicable: false };
  return { value, formatted: `${value} dB`, level: levelP21_earlyReflections(value).level, applicable: true };
}