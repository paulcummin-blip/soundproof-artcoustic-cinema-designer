/**
 * resolveRp22DesignValue.js
 * --------------------------------
 * Central Sound Proof design-value quantisation authority for RP22 parameters.
 *
 * Sound Proof predictive/commercial grading convention — NOT an RP22 rounding
 * requirement. Full-precision raw values are preserved internally for physics,
 * simulations, graphs, and diagnostics. This helper produces the DESIGN VALUE
 * used for Performance Level grading, ASDR, recommendations, and report display.
 *
 * Group A (whole-dB difference, lower is better):    P4, P6, P10    → Math.floor (1 dB)
 * Group B (whole-dB SPL capability, higher is better): P12, P13, P14 → Math.ceil  (1 dB)
 * Group C (±dB variance/deviation, lower is better):  P16, P17      → Math.floor(v*2)/2 (0.5 dB)
 * Group D (whole ±dB bass result/consistency):          P19, P20      → Math.floor (1 dB)
 * Group E (bass extension Hz, lower is better):         P18           → Math.floor (1 Hz)
 * All other parameters: unchanged (geometry, counts, booleans, presets).
 */

export function resolveRp22DesignValue(paramId, rawValue) {
  if (!Number.isFinite(rawValue)) return null;
  const pid = Number(paramId);

  // Group A — whole-dB difference, lower is better: floor to 1 dB
  if (pid === 4 || pid === 6 || pid === 10) return Math.floor(rawValue);

  // Group B — whole-dB SPL capability, higher is better: ceil to 1 dB
  if (pid === 12 || pid === 13 || pid === 14) return Math.ceil(rawValue);

  // Group C — ±dB variance/deviation, lower is better: floor to 0.5 dB
  if (pid === 16 || pid === 17) return Math.floor(rawValue * 2) / 2;

  // Group D — P19/P20 published whole-number ±dB values: floor to 1 dB
  if (pid === 19 || pid === 20) return Math.floor(rawValue);

  // Group E — bass extension Hz, lower is better: floor to 1 Hz
  if (pid === 18) return Math.floor(rawValue);

  // All other parameters: unchanged
  return rawValue;
}