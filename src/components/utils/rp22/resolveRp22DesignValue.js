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
 * Sound Proof intentionally grades practical integer values. Lower-is-better
 * values are floored; SPL/output values are ceiled. This is a product policy,
 * not a raw lab-report comparison.
 *
 * Group A (whole-dB difference, lower is better):    P4, P6, P10    → Math.floor (1 dB)
 * Group B (whole-dB SPL capability, higher is better): P12, P13, P14 → Math.ceil  (1 dB)
 * Group C (±dB variance/deviation, lower is better):  P16, P17      → Math.floor(v*2)/2 (0.5 dB)
 * Group D (direct ±dB bass result/consistency):         P19, P20      → Math.floor (1 dB, whole-integer design grade)
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

  // Group D — P19/P20 design grade: floor to a whole integer dB. The floored
  // value is the authoritative RP22 design grade — fractions of a decibel do
  // not change a Performance Level. Full precision is retained internally for
  // diagnostics and worst-frequency point detection.
  if (pid === 19 || pid === 20) return Math.floor(rawValue);

  // Group E — bass extension Hz, lower is better: floor to 1 Hz
  if (pid === 18) return Math.floor(rawValue);

  // All other parameters: unchanged
  return rawValue;
}

/**
 * P19/P20 deviation as a whole number, rounded down.
 *
 * Product rule: Sound Proof is a design assistant, not a maths exercise.
 * User-facing design UI never shows a decimal dB for a P19/P20 deviation.
 *   2.99 dB → 2      10.2 dB → 10      10.9 dB → 10
 *
 * P19 and P20 share the same Group D floor rule, so both route through the one
 * policy above. Full precision is untouched internally — physics, grading,
 * graphs, simulations and internal diagnostics keep the raw value.
 *
 * @returns {number|null} whole dB, or null when the value is not finite
 */
export function floorP19P20Deviation(value) {
  const number = Math.abs(Number(value));
  if (!Number.isFinite(number)) return null;
  return resolveRp22DesignValue(19, number);
}

/**
 * The only P19/P20 deviation text allowed in user-facing design UI: "±10 dB".
 * Use this instead of formatting a P19/P20 deviation on the surface itself.
 */
export function formatP19P20DeviationText(value) {
  const designValue = floorP19P20Deviation(value);
  return designValue === null ? null : `±${designValue} dB`;
}

/**
 * P19/P20 change (improvement / worsening) as a whole number, keeping its sign.
 * Magnitude is rounded down so an improvement is never overstated.
 *   2.34 → 2      -1.21 → -1      0.4 → 0
 * For copy where a sub-1 dB change must stay visible, use the string form.
 */
export function floorP19P20Delta(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.sign(number) * Math.floor(Math.abs(number));
}

/**
 * Text for a P19/P20 change, with no decimal in any case:
 *   "2 dB"   "-1 dB"   "under 1 dB" (when the change floors to zero)
 */
export function formatP19P20DeltaText(value) {
  const whole = floorP19P20Delta(value);
  if (whole === null) return null;
  return whole === 0 ? "under 1 dB" : `${whole} dB`;
}