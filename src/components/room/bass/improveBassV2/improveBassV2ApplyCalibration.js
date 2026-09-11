// improveBassV2ApplyCalibration.js
// Apply calibration-only tuning (delay, polarity, trim) to subwoofer instances.
//
// Apply Calibration may update ONLY:
//   - subwoofer delay
//   - polarity
//   - trim/gain
//
// It must NOT change:
//   - positions
//   - seats
//   - speaker geometry
//   - treatment
//   - product selection

const TUNING_TOLERANCE_DELAY_MS = 0.1;
const TUNING_TOLERANCE_GAIN_DB = 0.1;

function normalisePolarity(value) {
  const n = Number(value) || 0;
  return (n < 0 || n === 180) ? -1 : 0;
}

/**
 * Build updated subwooferInstances with ONLY calibration tuning changed.
 * Positions, enabled state, model, and all other fields are preserved.
 *
 * @param {Array} currentInstances - existing subwooferInstances (ALL, including disabled)
 * @param {Array} calibrationTuning - [{ delayMs, gainDb, polarity }] per active sub
 * @returns {Array} new subwooferInstances with tuning applied
 */
export function applyCalibrationTuning(currentInstances, calibrationTuning) {
  if (!Array.isArray(currentInstances) || !Array.isArray(calibrationTuning)) {
    return currentInstances || [];
  }

  const activeInstances = currentInstances.filter((s) => s.enabled !== false);
  const disabledInstances = currentInstances.filter((s) => s.enabled === false);

  const updated = activeInstances.map((inst, i) => {
    const t = calibrationTuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    return {
      ...inst,
      // Mark tuning as V2-optimised so the production bass engine bypasses
      // auto-align for this applied state. The V2 calibration delays are the
      // FINAL effective delays — adding auto-align would double-compensate.
      tuningSource: "v2-optimised",
      delayMs: Number(t.delayMs) || 0,
      gainDb: Number(t.gainDb) || 0,
      polarity: Number(t.polarity) || 0,
    };
  });

  return [...updated, ...disabledInstances];
}

/**
 * Check whether the current subwooferInstances already have the calibration
 * tuning applied (delay, polarity, trim all match).
 *
 * @param {Array} currentInstances - current subwooferInstances (ALL)
 * @param {Array} calibrationTuning - [{ delayMs, gainDb, polarity }] per active sub
 * @returns {boolean} true only if all active tuning matches
 */
export function isCalibrationApplied(currentInstances, calibrationTuning) {
  if (!Array.isArray(currentInstances) || !Array.isArray(calibrationTuning)) return false;

  const activeInstances = currentInstances.filter((s) => s.enabled !== false);
  if (activeInstances.length !== calibrationTuning.length) return false;

  for (let i = 0; i < calibrationTuning.length; i++) {
    const t = calibrationTuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const inst = activeInstances[i];
    if (!inst) return false;

    if (Math.abs((Number(inst.delayMs) || 0) - (Number(t.delayMs) || 0)) > TUNING_TOLERANCE_DELAY_MS) return false;
    if (Math.abs((Number(inst.gainDb) || 0) - (Number(t.gainDb) || 0)) > TUNING_TOLERANCE_GAIN_DB) return false;
    if (normalisePolarity(inst.polarity) !== normalisePolarity(t.polarity)) return false;
  }

  return true;
}

/**
 * Build a human-readable summary of the calibration changes.
 *
 * @param {Array} currentInstances - existing subwooferInstances
 * @param {Array} calibrationTuning - proposed tuning
 * @returns {{ delays: string[], trims: string[], polarities: string[] } | null}
 */
export function buildCalibrationChangeSummary(currentInstances, calibrationTuning) {
  if (!Array.isArray(currentInstances) || !Array.isArray(calibrationTuning)) return null;

  const activeInstances = currentInstances.filter((s) => s.enabled !== false);
  const changes = { delays: [], trims: [], polarities: [] };

  for (let i = 0; i < calibrationTuning.length; i++) {
    const t = calibrationTuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const inst = activeInstances[i];
    if (!inst) continue;

    const currentDelay = Number(inst.delayMs) || 0;
    const newDelay = Number(t.delayMs) || 0;
    if (Math.abs(newDelay - currentDelay) > TUNING_TOLERANCE_DELAY_MS) {
      const delta = newDelay - currentDelay;
      changes.delays.push(`Sub ${i + 1}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} ms`);
    }

    const currentGain = Number(inst.gainDb) || 0;
    const newGain = Number(t.gainDb) || 0;
    if (Math.abs(newGain - currentGain) > TUNING_TOLERANCE_GAIN_DB) {
      const delta = newGain - currentGain;
      changes.trims.push(`Sub ${i + 1}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} dB`);
    }

    const currentPol = normalisePolarity(inst.polarity);
    const newPol = normalisePolarity(t.polarity);
    if (currentPol !== newPol) {
      changes.polarities.push(`Sub ${i + 1}: ${newPol < 0 ? "Inverted" : "Normal"}`);
    }
  }

  return changes;
}