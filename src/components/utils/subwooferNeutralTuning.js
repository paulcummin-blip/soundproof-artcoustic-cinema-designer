// subwooferNeutralTuning.js
// ---------------------------------------------------------------------------
// Neutral starting point for subwoofer tuning: gain 0 dB, delay 0 ms,
// phase 0°, polarity Normal. Applied to ALL instances (enabled and disabled,
// so a later re-enable cannot resurrect old ADI tuning) when a new version is
// created or the subwoofer quantity/layout changes. Positions, models, groups
// and every other field are preserved. Ordinary recalculation never calls this.
// ---------------------------------------------------------------------------

export function neutraliseInstanceTuning(instance) {
  if (!instance || typeof instance !== "object") return instance;
  const next = { ...instance, gainDb: 0, delayMs: 0, polarity: 1, phaseControlDeg: 0 };
  // Legacy aliases, only where already present.
  if ("phaseAdjust" in next) next.phaseAdjust = 0;
  if ("delay" in next) next.delay = 0;
  return next;
}

export function neutraliseSubwooferTuning(instances) {
  return Array.isArray(instances) ? instances.map(neutraliseInstanceTuning) : instances;
}

/**
 * Prepare a cloned design_state for a new/overwritten version: neutral sub
 * tuning and no inherited Applied Calibration (ADI optimisation) record.
 */
export function neutraliseDesignStateForNewVersion(designState) {
  if (!designState || typeof designState !== "object") return designState;
  const next = { ...designState };
  if (Array.isArray(next.subwooferInstances)) {
    next.subwooferInstances = neutraliseSubwooferTuning(next.subwooferInstances);
  }
  if ("applied_calibration" in next) next.applied_calibration = null;
  // Bass isolation: the new version starts with no inherited ADI optimiser
  // plan, recommendation or seating-apply status. Layout, positions and
  // crossover are kept. Results are cached per version id, so the new version
  // shows "Calculate Bass Results" until it is calculated and optimised itself.
  if ("optimiser_plan" in next) next.optimiser_plan = null;
  if ("applied_seating_provenance" in next) next.applied_seating_provenance = null;
  return next;
}