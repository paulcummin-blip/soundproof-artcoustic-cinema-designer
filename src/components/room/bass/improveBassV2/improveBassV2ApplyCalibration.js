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

// New confirmations bind tuning to the frozen source order once. Legacy helper
// inputs without IDs remain readable; mounted Apply accepts only a fresh result.
export function bindTuningToSourceIds(tuning, sourceIds) {
  if (!Array.isArray(tuning) || tuning.length !== sourceIds?.length ||
      new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !id)) {
    throw new Error("Confirmed tuning does not match the captured source identities");
  }
  return tuning.map((t, i) => ({ ...t, sourceId: sourceIds[i] }));
}

export function resolveTuningInstances(currentInstances, tuning) {
  const active = (currentInstances || []).filter((s) => s.enabled !== false);
  if (active.length !== tuning?.length) return null;
  const hasIds = tuning.some((t) => t?.sourceId != null);
  if (!hasIds) return active; // Legacy pure-helper input; never emitted by V2.
  const byId = new Map(active.map((s) => [s.id, s]));
  if (byId.size !== active.length || new Set(tuning.map((t) => t.sourceId)).size !== tuning.length) return null;
  const ordered = tuning.map((t) => byId.get(t.sourceId));
  return ordered.every(Boolean) ? ordered : null;
}

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

  const ordered = resolveTuningInstances(currentInstances, calibrationTuning);
  if (!ordered) throw new Error("Cannot Apply tuning to changed source identities");
  const byId = new Map(ordered.map((inst, i) => [inst.id, calibrationTuning[i]]));
  return currentInstances.map((inst) => {
    if (inst.enabled === false) return inst;
    const t = byId.get(inst.id);
    return {
      ...inst,
      // Absolute effective delay, evaluated on untuned source transfers.
      tuningSource: "v2-optimised",
      delayMs: Number(t.delayMs) || 0,
      gainDb: Number(t.gainDb) || 0,
      // Canonical persisted instances require +1 normal / -1 inverted.
      polarity: normalisePolarity(t.polarity) < 0 ? -1 : 1,
    };
  });
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

  const activeInstances = resolveTuningInstances(currentInstances, calibrationTuning);
  if (!activeInstances) return false;

  for (let i = 0; i < calibrationTuning.length; i++) {
    const t = calibrationTuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const inst = activeInstances[i];
    if (!inst) return false;
    // Matching numbers in an old manual record are not an applied effective proposal.
    if ((t?.sourceId != null) && inst.tuningSource !== "v2-optimised") return false;

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

  const activeInstances = resolveTuningInstances(currentInstances, calibrationTuning);
  if (!activeInstances) return null;
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